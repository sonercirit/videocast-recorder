type MediaState = {
  audioEnabled: boolean;
  videoEnabled: boolean;
};

type SignalParticipant = {
  id: string;
  userId: string;
  displayName: string;
  isHost: boolean;
  mediaState: MediaState;
};

type SignalSession = SignalParticipant & {
  socket: WebSocket;
};

type RoomRecordingState = {
  active: boolean;
  sessionId: string;
  startedAt: number;
  startedBy: string;
};

type RoomRecordingStopState = RoomRecordingState & {
  active: false;
  stoppedAt: number;
  stoppedBy: string;
};

type ClientSignal = {
  type: string;
  to?: string;
  data?: unknown;
};

type InternalSignal = {
  type: string;
  userId?: string;
};

export class RoomSignaling {
  private sessions = new Map<string, SignalSession>();
  private recordingState: RoomRecordingState | null = null;
  private initialized = false;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: unknown,
  ) {}

  async fetch(request: Request): Promise<Response> {
    await this.ensureInitialized();

    if (request.headers.get("Upgrade") !== "websocket") {
      return this.handleInternalRequest(request);
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
      isHost: request.headers.get("x-is-host") === "true",
      mediaState: { audioEnabled: true, videoEnabled: true },
    };

    server.accept();
    this.sessions.set(participant.id, { ...participant, socket: server });

    this.send(server, {
      type: "welcome",
      participantId: participant.id,
      participants: this.participantsExcept(participant.id),
      recordingState: this.recordingState,
      serverTime: Date.now(),
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
        this.handleClientMessage(participant, message).catch(() => {
          this.send(server, {
            type: "error",
            message: "Could not process signaling message",
          });
        });
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

  private async handleInternalRequest(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    let message: InternalSignal;
    try {
      message = (await request.json()) as InternalSignal;
    } catch {
      return Response.json(
        { error: "Invalid internal message" },
        { status: 400 },
      );
    }

    if (message.type === "ban-user" && message.userId) {
      const disconnected = this.disconnectUser(
        message.userId,
        "You were banned from this room by the host.",
      );
      return Response.json({ ok: true, disconnected });
    }

    return Response.json(
      { error: "Unknown internal message" },
      { status: 400 },
    );
  }

  private async handleClientMessage(
    from: SignalParticipant,
    message: ClientSignal,
  ) {
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
      const mediaState = this.normalizeMediaState(message.data);
      const session = this.sessions.get(from.id);
      if (session) session.mediaState = mediaState;
      this.broadcast(
        {
          type: "media-state",
          participantId: from.id,
          data: mediaState,
        },
        from.id,
      );
      return;
    }

    if (message.type === "recording-start-request") {
      await this.handleRecordingStartRequest(from);
      return;
    }

    if (message.type === "recording-stop-request") {
      await this.handleRecordingStopRequest(from);
    }
  }

  private async handleRecordingStartRequest(from: SignalParticipant) {
    if (!from.isHost) {
      this.sendError(from.id, "Only the host can start recording");
      return;
    }

    if (this.recordingState?.active) {
      this.sendToParticipant(from.id, {
        type: "recording-start",
        recording: this.recordingState,
        serverTime: Date.now(),
      });
      return;
    }

    const recordingState: RoomRecordingState = {
      active: true,
      sessionId: `rs_${crypto.randomUUID().replaceAll("-", "")}`,
      // Give every browser a short countdown so local MediaRecorders start in sync.
      startedAt: Date.now() + 3000,
      startedBy: from.id,
    };

    this.recordingState = recordingState;
    await this.state.storage.put("recordingState", recordingState);
    this.broadcast({
      type: "recording-start",
      recording: recordingState,
      serverTime: Date.now(),
    });
  }

  private async handleRecordingStopRequest(from: SignalParticipant) {
    if (!from.isHost) {
      this.sendError(from.id, "Only the host can stop recording");
      return;
    }

    if (!this.recordingState?.active) {
      this.sendToParticipant(from.id, {
        type: "recording-stop",
        recording: null,
        serverTime: Date.now(),
      });
      return;
    }

    const stopState: RoomRecordingStopState = {
      ...this.recordingState,
      active: false,
      // Delay stop very slightly so all clients receive the command first.
      stoppedAt: Date.now() + 1500,
      stoppedBy: from.id,
    };

    this.recordingState = null;
    await this.state.storage.delete("recordingState");
    this.broadcast({
      type: "recording-stop",
      recording: stopState,
      serverTime: Date.now(),
    });
  }

  private normalizeMediaState(data: unknown): MediaState {
    const value =
      data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    return {
      audioEnabled: !("audioEnabled" in value) || value.audioEnabled !== false,
      videoEnabled: !("videoEnabled" in value) || value.videoEnabled !== false,
    };
  }

  private participantsExcept(excludedId: string): SignalParticipant[] {
    return [...this.sessions.values()]
      .filter((session) => session.id !== excludedId)
      .map(({ id, userId, displayName, isHost, mediaState }) => ({
        id,
        userId,
        displayName,
        isHost,
        mediaState,
      }));
  }

  private broadcast(message: unknown, excludedId?: string) {
    for (const [id, session] of this.sessions.entries()) {
      if (id === excludedId) continue;
      this.send(session.socket, message);
    }
  }

  private disconnectUser(userId: string, message: string) {
    let disconnected = 0;
    for (const [participantId, session] of [...this.sessions.entries()]) {
      if (session.userId !== userId) continue;
      this.send(session.socket, { type: "banned", message });
      this.sessions.delete(participantId);
      disconnected += 1;
      try {
        session.socket.close(4003, "Banned from room");
      } catch {
        // Ignore stale sockets.
      }
      this.broadcast({ type: "participant-left", participantId });
    }
    return disconnected;
  }

  private sendToParticipant(participantId: string, message: unknown) {
    const session = this.sessions.get(participantId);
    if (session) this.send(session.socket, message);
  }

  private sendError(participantId: string, message: string) {
    this.sendToParticipant(participantId, { type: "error", message });
  }

  private async ensureInitialized() {
    if (this.initialized) return;
    this.recordingState =
      (await this.state.storage.get<RoomRecordingState>("recordingState")) ??
      null;
    this.initialized = true;
  }

  private send(socket: WebSocket, message: unknown) {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      // A stale socket will also emit close/error and be removed there.
    }
  }
}
