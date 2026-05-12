type SignalParticipant = {
  id: string;
  userId: string;
  displayName: string;
};

type SignalSession = SignalParticipant & {
  socket: WebSocket;
};

type ClientSignal = {
  type: string;
  to?: string;
  data?: unknown;
};

export class RoomSignaling {
  private sessions = new Map<string, SignalSession>();

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: unknown,
  ) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    const participant: SignalParticipant = {
      id:
        request.headers.get("x-participant-id") ??
        new URL(request.url).searchParams.get("participantId") ??
        crypto.randomUUID(),
      userId: request.headers.get("x-user-id") ?? "unknown",
      displayName: request.headers.get("x-user-name") ?? "Guest",
    };

    server.accept();
    this.sessions.set(participant.id, { ...participant, socket: server });

    this.send(server, {
      type: "welcome",
      participantId: participant.id,
      participants: this.participantsExcept(participant.id),
    });

    this.broadcast(
      {
        type: "participant-joined",
        participant,
      },
      participant.id,
    );

    const cleanup = () => {
      if (!this.sessions.has(participant.id)) return;
      this.sessions.delete(participant.id);
      this.broadcast({
        type: "participant-left",
        participantId: participant.id,
      });
    };

    server.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data)) as ClientSignal;
        this.handleClientMessage(participant, message);
      } catch {
        this.send(server, {
          type: "error",
          message: "Invalid signaling message",
        });
      }
    });

    server.addEventListener("close", cleanup);
    server.addEventListener("error", cleanup);

    return new Response(null, { status: 101, webSocket: client });
  }

  private handleClientMessage(from: SignalParticipant, message: ClientSignal) {
    if (["offer", "answer", "ice"].includes(message.type)) {
      if (!message.to) return;
      const target = this.sessions.get(message.to);
      if (!target) return;

      this.send(target.socket, {
        type: message.type,
        from: from.id,
        fromName: from.displayName,
        data: message.data,
      });
      return;
    }

    if (message.type === "media-state") {
      this.broadcast(
        {
          type: "media-state",
          participantId: from.id,
          data: message.data,
        },
        from.id,
      );
    }
  }

  private participantsExcept(excludedId: string): SignalParticipant[] {
    return [...this.sessions.values()]
      .filter((session) => session.id !== excludedId)
      .map(({ id, userId, displayName }) => ({ id, userId, displayName }));
  }

  private broadcast(message: unknown, excludedId?: string) {
    for (const [id, session] of this.sessions.entries()) {
      if (id === excludedId) continue;
      this.send(session.socket, message);
    }
  }

  private send(socket: WebSocket, message: unknown) {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      // A stale socket will also emit close/error and be removed there.
    }
  }
}
