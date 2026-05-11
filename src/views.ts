const styles = String.raw`
:root {
  color-scheme: dark;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #080b12;
  color: #edf2ff;
}
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: radial-gradient(circle at top left, rgba(72, 116, 255, 0.25), transparent 32rem), #080b12; }
a { color: #8fb3ff; text-decoration: none; }
button, input, select { font: inherit; }
button { border: 0; border-radius: 0.8rem; padding: 0.75rem 1rem; background: #5d7cff; color: white; cursor: pointer; font-weight: 700; }
button.secondary { background: #1f2637; color: #edf2ff; border: 1px solid #364157; }
button.danger { background: #e5484d; }
button:disabled { opacity: 0.55; cursor: not-allowed; }
input, select { width: 100%; border-radius: 0.8rem; border: 1px solid #30384d; background: #111827; color: #edf2ff; padding: 0.75rem 0.9rem; }
label { display: grid; gap: 0.35rem; color: #b8c2d8; font-size: 0.92rem; }
.header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem clamp(1rem, 4vw, 3rem); border-bottom: 1px solid rgba(255,255,255,0.08); backdrop-filter: blur(16px); position: sticky; top: 0; background: rgba(8, 11, 18, 0.78); z-index: 5; }
.brand { display: flex; align-items: center; gap: 0.75rem; color: white; font-weight: 900; letter-spacing: -0.03em; }
.logo { width: 2rem; height: 2rem; border-radius: 0.65rem; display: grid; place-items: center; background: linear-gradient(135deg, #5d7cff, #00d4ff); box-shadow: 0 0 32px rgba(93,124,255,0.55); }
.container { width: min(1180px, calc(100vw - 2rem)); margin: 0 auto; padding: 2.25rem 0 4rem; }
.hero { display: grid; gap: 1rem; margin: 2rem 0; }
.hero h1 { font-size: clamp(2.2rem, 7vw, 5.5rem); line-height: 0.95; margin: 0; letter-spacing: -0.08em; }
.hero p { color: #b8c2d8; max-width: 760px; font-size: 1.1rem; line-height: 1.65; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; }
.card { background: rgba(16, 23, 36, 0.84); border: 1px solid rgba(255,255,255,0.09); border-radius: 1.25rem; padding: 1.25rem; box-shadow: 0 24px 80px rgba(0,0,0,0.28); }
.stack { display: grid; gap: 1rem; }
.row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.row.spread { justify-content: space-between; }
.muted { color: #8e9bb5; }
.hidden { display: none !important; }
.error { color: #ff9a9e; background: rgba(229,72,77,0.12); border: 1px solid rgba(229,72,77,0.35); padding: 0.75rem; border-radius: 0.8rem; }
.success { color: #9ef5c9; background: rgba(31,184,111,0.12); border: 1px solid rgba(31,184,111,0.3); padding: 0.75rem; border-radius: 0.8rem; }
.room-list { display: grid; gap: 0.85rem; }
.room-item { display: flex; justify-content: space-between; gap: 1rem; align-items: center; padding: 1rem; border: 1px solid rgba(255,255,255,0.08); border-radius: 1rem; background: rgba(255,255,255,0.03); }
.video-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; margin-top: 1rem; }
.video-card { overflow: hidden; border-radius: 1.1rem; background: #05070d; border: 1px solid rgba(255,255,255,0.1); position: relative; min-height: 210px; }
.video-card video { width: 100%; height: 100%; min-height: 210px; object-fit: cover; display: block; background: #05070d; }
.video-card .label { position: absolute; left: 0.75rem; bottom: 0.75rem; border-radius: 999px; padding: 0.35rem 0.65rem; background: rgba(0,0,0,0.62); color: white; font-size: 0.85rem; }
.pill { border: 1px solid rgba(255,255,255,0.12); border-radius: 999px; padding: 0.35rem 0.65rem; color: #b8c2d8; background: rgba(255,255,255,0.04); font-size: 0.85rem; }
.recording-dot { width: 0.7rem; height: 0.7rem; border-radius: 999px; background: #8e9bb5; display: inline-block; }
.recording-dot.live { background: #e5484d; box-shadow: 0 0 18px rgba(229,72,77,0.9); }
.checkbox { display: flex; align-items: center; gap: 0.55rem; color: #b8c2d8; }
.checkbox input { width: auto; }
.recording-list { display: grid; gap: 0.75rem; }
.recording-item { border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); border-radius: 0.9rem; padding: 0.85rem; }
.small { font-size: 0.88rem; }
`;

function layout(title: string, body: string, script: string) {
  return String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>${styles}</style>
</head>
<body>
  <header class="header">
    <a class="brand" href="/"><span class="logo">▶</span><span>Videocast Recorder</span></a>
    <div class="row"><span id="user-badge" class="pill hidden"></span><button id="signout-button" class="secondary hidden">Sign out</button></div>
  </header>
  <main class="container">${body}</main>
  <script>${script}</script>
</body>
</html>`;
}

export function homePage() {
  const body = String.raw`
<section class="hero">
  <span class="pill">Cloudflare Workers · D1 · R2 · Durable Objects</span>
  <h1>Record-ready videocast rooms.</h1>
  <p>Create a room, invite guests, talk over peer-to-peer WebRTC, and upload each participant's local recording chunks to Cloudflare R2 in the background.</p>
</section>

<section id="auth-view" class="grid hidden">
  <form id="signup-form" class="card stack">
    <h2>Create account</h2>
    <label>Name <input name="name" required autocomplete="name" placeholder="Ada Lovelace" /></label>
    <label>Email <input name="email" required type="email" autocomplete="email" placeholder="you@example.com" /></label>
    <label>Password <input name="password" required type="password" autocomplete="new-password" minlength="8" /></label>
    <button>Create account</button>
    <div id="signup-error" class="error hidden"></div>
  </form>

  <form id="signin-form" class="card stack">
    <h2>Sign in</h2>
    <label>Email <input name="email" required type="email" autocomplete="email" /></label>
    <label>Password <input name="password" required type="password" autocomplete="current-password" /></label>
    <button>Sign in</button>
    <div id="signin-error" class="error hidden"></div>
  </form>
</section>

<section id="dashboard-view" class="stack hidden">
  <div class="row spread">
    <div>
      <h2>Your videocast lobby</h2>
      <p class="muted">Open rooms are visible to signed-in users. Share the room link to invite guests.</p>
    </div>
  </div>

  <div class="grid">
    <form id="create-room-form" class="card stack">
      <h3>Create a room</h3>
      <label>Room name <input name="name" required maxlength="80" placeholder="Weekly founder interview" /></label>
      <button>Create room</button>
      <div id="create-room-error" class="error hidden"></div>
    </form>

    <div class="card stack">
      <div class="row spread"><h3>Open rooms</h3><button id="refresh-rooms" class="secondary" type="button">Refresh</button></div>
      <div id="rooms" class="room-list"><p class="muted">Loading rooms...</p></div>
    </div>
  </div>
</section>`;

  const script = String.raw`
const $ = (id) => document.getElementById(id);

async function api(path, options) {
  const init = Object.assign({ credentials: 'include' }, options || {});
  if (init.body && typeof init.body !== 'string' && !(init.body instanceof Blob)) {
    init.headers = Object.assign({ 'content-type': 'application/json' }, init.headers || {});
    init.body = JSON.stringify(init.body);
  }
  const response = await fetch(path, init);
  if (!response.ok) {
    let message = response.statusText;
    try { message = (await response.json()).error || message; } catch {}
    throw new Error(message);
  }
  if (response.status === 204) return null;
  return response.json();
}

function setError(id, error) {
  const element = $(id);
  if (!error) { element.classList.add('hidden'); element.textContent = ''; return; }
  element.textContent = error.message || String(error);
  element.classList.remove('hidden');
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function loadMe() {
  try {
    const data = await api('/api/me');
    $('auth-view').classList.add('hidden');
    $('dashboard-view').classList.remove('hidden');
    $('user-badge').textContent = data.user.name || data.user.email;
    $('user-badge').classList.remove('hidden');
    $('signout-button').classList.remove('hidden');
    await loadRooms();
  } catch {
    $('auth-view').classList.remove('hidden');
    $('dashboard-view').classList.add('hidden');
    $('user-badge').classList.add('hidden');
    $('signout-button').classList.add('hidden');
  }
}

async function loadRooms() {
  const container = $('rooms');
  container.innerHTML = '<p class="muted">Loading rooms...</p>';
  const data = await api('/api/rooms');
  if (!data.rooms.length) {
    container.innerHTML = '<p class="muted">No open rooms yet. Create one to start.</p>';
    return;
  }
  container.innerHTML = '';
  for (const room of data.rooms) {
    const item = document.createElement('div');
    item.className = 'room-item';
    const created = new Date(room.createdAt).toLocaleString();
    item.innerHTML = '<div><strong></strong><div class="muted small"></div></div><a class="pill" href="/rooms/' + room.id + '">Join</a>';
    item.querySelector('strong').textContent = room.name;
    item.querySelector('.muted').textContent = 'Created ' + created;
    container.appendChild(item);
  }
}

$('signup-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  setError('signup-error');
  try {
    await api('/api/auth/sign-up/email', { method: 'POST', body: formData(event.currentTarget) });
    await loadMe();
  } catch (error) {
    setError('signup-error', error);
  }
});

$('signin-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  setError('signin-error');
  try {
    await api('/api/auth/sign-in/email', { method: 'POST', body: formData(event.currentTarget) });
    await loadMe();
  } catch (error) {
    setError('signin-error', error);
  }
});

$('create-room-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  setError('create-room-error');
  try {
    const data = await api('/api/rooms', { method: 'POST', body: formData(event.currentTarget) });
    window.location.href = '/rooms/' + data.room.id;
  } catch (error) {
    setError('create-room-error', error);
  }
});

$('refresh-rooms').addEventListener('click', () => loadRooms().catch(console.error));
$('signout-button').addEventListener('click', async () => {
  await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' });
  window.location.reload();
});

loadMe().catch(console.error);
`;

  return layout("Videocast Recorder", body, script);
}

export function roomPage(roomId: string) {
  const body = String.raw`
<section class="stack">
  <a href="/">← Back to lobby</a>
  <div class="row spread">
    <div>
      <h1 id="room-name">Room</h1>
      <p id="room-meta" class="muted">Preparing room...</p>
    </div>
    <span class="pill"><span id="recording-dot" class="recording-dot"></span> <span id="recording-state">Not recording</span></span>
  </div>

  <div id="error-box" class="error hidden"></div>

  <div id="join-panel" class="card stack">
    <h2>Join videocast</h2>
    <p class="muted">Pick the camera quality used for your local recording. Higher quality creates larger R2 uploads.</p>
    <div class="grid">
      <label>Local recording quality <select id="quality-select"></select></label>
      <label class="checkbox"><input id="auto-record" type="checkbox" checked /> Start local recording in the background when I join</label>
    </div>
    <button id="join-button">Join with camera and microphone</button>
  </div>

  <div id="call-panel" class="hidden stack">
    <div class="card stack">
      <div class="row spread">
        <div class="stack">
          <strong id="call-status">Connecting...</strong>
          <span class="muted small">WebRTC media stays peer-to-peer. Signaling goes through a Cloudflare Durable Object.</span>
        </div>
        <div class="row">
          <button id="start-recording" class="secondary" type="button">Start recording</button>
          <button id="stop-recording" class="secondary" type="button" disabled>Stop recording</button>
          <button id="leave-button" class="danger" type="button">Leave</button>
        </div>
      </div>
    </div>

    <div id="videos" class="video-grid">
      <div class="video-card" id="local-card">
        <video id="local-video" autoplay playsinline muted></video>
        <span class="label">You</span>
      </div>
    </div>

    <div class="card stack">
      <div class="row spread"><h3>Recordings for this room</h3><button id="refresh-recordings" class="secondary" type="button">Refresh</button></div>
      <div id="recordings" class="recording-list"><p class="muted">No recordings yet.</p></div>
    </div>
  </div>
</section>`;

  const script = String.raw`
window.ROOM_ID = ${JSON.stringify(roomId)};
const $ = (id) => document.getElementById(id);

let me = null;
let room = null;
let qualityPresets = {};
let selectedQuality = 'medium';
let localStream = null;
let ws = null;
let participantId = null;
const peers = new Map();
const participants = new Map();

let mediaRecorder = null;
let recordingStopPromise = null;
let currentRecordingId = null;
let currentMimeType = 'video/webm';
let recordingStartedAt = 0;
let uploadedChunkCount = 0;
let uploadChain = Promise.resolve();

async function api(path, options) {
  const init = Object.assign({ credentials: 'include' }, options || {});
  if (init.body && typeof init.body !== 'string' && !(init.body instanceof Blob)) {
    init.headers = Object.assign({ 'content-type': 'application/json' }, init.headers || {});
    init.body = JSON.stringify(init.body);
  }
  const response = await fetch(path, init);
  if (!response.ok) {
    let message = response.statusText;
    try { message = (await response.json()).error || message; } catch {}
    throw new Error(message);
  }
  if (response.status === 204) return null;
  return response.json();
}

function showError(error) {
  const box = $('error-box');
  box.textContent = error.message || String(error);
  box.classList.remove('hidden');
}

function clearError() {
  $('error-box').classList.add('hidden');
  $('error-box').textContent = '';
}

function setCallStatus(message) {
  $('call-status').textContent = message;
}

function setRecordingState(message, live) {
  $('recording-state').textContent = message;
  $('recording-dot').classList.toggle('live', Boolean(live));
  $('start-recording').disabled = Boolean(live) || !localStream;
  $('stop-recording').disabled = !live;
}

async function init() {
  try {
    const meData = await api('/api/me');
    me = meData.user;
    $('user-badge').textContent = me.name || me.email;
    $('user-badge').classList.remove('hidden');
    $('signout-button').classList.remove('hidden');

    const roomData = await api('/api/rooms/' + window.ROOM_ID);
    room = roomData.room;
    $('room-name').textContent = room.name;
    $('room-meta').textContent = 'Room link: ' + window.location.href;

    const qualityData = await api('/api/recording-qualities');
    qualityPresets = qualityData.qualities;
    renderQualitySelect();
    await loadRecordings();
  } catch (error) {
    showError(error);
    if ((error.message || '').toLowerCase().includes('unauthorized')) window.location.href = '/';
  }
}

function renderQualitySelect() {
  const select = $('quality-select');
  select.innerHTML = '';
  for (const quality of Object.values(qualityPresets)) {
    const option = document.createElement('option');
    option.value = quality.id;
    option.textContent = quality.label + ' · ' + quality.width + 'x' + quality.height + ' @ ' + quality.frameRate + 'fps';
    if (quality.id === 'medium') option.selected = true;
    select.appendChild(option);
  }
}

async function joinCall() {
  clearError();
  selectedQuality = $('quality-select').value || 'medium';
  const preset = qualityPresets[selectedQuality];
  if (!preset) throw new Error('Unknown recording quality');

  $('join-button').disabled = true;
  $('join-button').textContent = 'Requesting camera...';

  localStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: {
      width: { ideal: preset.width },
      height: { ideal: preset.height },
      frameRate: { ideal: preset.frameRate, max: preset.frameRate },
    },
  });
  $('local-video').srcObject = localStream;

  const joinData = await api('/api/rooms/' + window.ROOM_ID + '/join', {
    method: 'POST',
    body: { displayName: me.name || me.email },
  });
  participantId = joinData.participant.id;

  $('join-panel').classList.add('hidden');
  $('call-panel').classList.remove('hidden');
  setRecordingState('Not recording', false);
  connectSignaling();

  if ($('auto-record').checked) await startRecording();
}

function connectSignaling() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(protocol + '//' + window.location.host + '/api/rooms/' + window.ROOM_ID + '/signaling?participantId=' + encodeURIComponent(participantId));
  ws.addEventListener('open', () => setCallStatus('Connected to room signaling. Waiting for peers...'));
  ws.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(event.data);
      handleSignal(message).catch(showError);
    } catch (error) {
      showError(error);
    }
  });
  ws.addEventListener('close', () => setCallStatus('Disconnected from room signaling.'));
  ws.addEventListener('error', () => showError(new Error('Signaling connection failed')));
}

function sendSignal(message) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

async function handleSignal(message) {
  if (message.type === 'welcome') {
    participantId = message.participantId;
    for (const participant of message.participants || []) participants.set(participant.id, participant);
    setCallStatus('Joined. Peers in room: ' + (message.participants || []).length);
    for (const participant of message.participants || []) await createOffer(participant.id);
    return;
  }

  if (message.type === 'participant-joined') {
    participants.set(message.participant.id, message.participant);
    setCallStatus((message.participant.displayName || 'A participant') + ' joined.');
    return;
  }

  if (message.type === 'participant-left') {
    closePeer(message.participantId);
    participants.delete(message.participantId);
    setCallStatus('A participant left.');
    return;
  }

  if (message.type === 'offer') {
    participants.set(message.from, { id: message.from, displayName: message.fromName || 'Guest' });
    const pc = ensurePeer(message.from);
    await pc.setRemoteDescription(new RTCSessionDescription(message.data));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendSignal({ type: 'answer', to: message.from, data: pc.localDescription });
    return;
  }

  if (message.type === 'answer') {
    const pc = peers.get(message.from);
    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(message.data));
    return;
  }

  if (message.type === 'ice') {
    const pc = ensurePeer(message.from);
    if (message.data) await pc.addIceCandidate(new RTCIceCandidate(message.data));
    return;
  }

  if (message.type === 'error') showError(new Error(message.message || 'Signaling error'));
}

function ensurePeer(id) {
  if (peers.has(id)) return peers.get(id);
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  });
  for (const track of localStream.getTracks()) pc.addTrack(track, localStream);
  pc.addEventListener('icecandidate', (event) => {
    if (event.candidate) sendSignal({ type: 'ice', to: id, data: event.candidate });
  });
  pc.addEventListener('track', (event) => {
    const stream = event.streams[0] || new MediaStream([event.track]);
    upsertRemoteVideo(id, stream);
  });
  pc.addEventListener('connectionstatechange', () => {
    if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) closePeer(id);
  });
  peers.set(id, pc);
  return pc;
}

async function createOffer(id) {
  const pc = ensurePeer(id);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  sendSignal({ type: 'offer', to: id, data: pc.localDescription });
}

function upsertRemoteVideo(id, stream) {
  let card = document.getElementById('remote-' + id);
  if (!card) {
    card = document.createElement('div');
    card.className = 'video-card';
    card.id = 'remote-' + id;
    card.innerHTML = '<video autoplay playsinline></video><span class="label"></span>';
    $('videos').appendChild(card);
  }
  const participant = participants.get(id) || { displayName: 'Guest' };
  card.querySelector('video').srcObject = stream;
  card.querySelector('.label').textContent = participant.displayName || 'Guest';
}

function closePeer(id) {
  const pc = peers.get(id);
  if (pc) pc.close();
  peers.delete(id);
  const card = document.getElementById('remote-' + id);
  if (card) card.remove();
}

function supportedMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  if (typeof MediaRecorder === 'undefined') throw new Error('MediaRecorder is not available in this browser');
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

async function startRecording() {
  if (!localStream) throw new Error('Join the call before recording');
  if (mediaRecorder && mediaRecorder.state !== 'inactive') return;

  const mimeType = supportedMimeType() || 'video/webm';
  const startData = await api('/api/rooms/' + window.ROOM_ID + '/recordings/start', {
    method: 'POST',
    body: { quality: selectedQuality, mimeType },
  });

  currentRecordingId = startData.recording.id;
  currentMimeType = startData.recording.mimeType;
  uploadedChunkCount = 0;
  uploadChain = Promise.resolve();
  recordingStartedAt = Date.now();

  const preset = qualityPresets[selectedQuality];
  const options = {
    videoBitsPerSecond: preset.videoBitsPerSecond,
    audioBitsPerSecond: preset.audioBitsPerSecond,
  };
  if (mimeType) options.mimeType = mimeType;

  mediaRecorder = new MediaRecorder(localStream, options);
  mediaRecorder.addEventListener('dataavailable', (event) => {
    if (!event.data || event.data.size === 0 || !currentRecordingId) return;
    const chunkIndex = uploadedChunkCount++;
    const blob = event.data;
    uploadChain = uploadChain.then(() => uploadChunk(currentRecordingId, chunkIndex, blob));
    uploadChain.catch(showError);
  });
  recordingStopPromise = new Promise((resolve, reject) => {
    mediaRecorder.addEventListener('stop', () => finalizeRecording().then(resolve, reject), { once: true });
  });
  mediaRecorder.start(5000);
  setRecordingState('Recording locally', true);
}

async function uploadChunk(recordingId, chunkIndex, blob) {
  const response = await fetch('/api/rooms/' + window.ROOM_ID + '/recordings/' + recordingId + '/chunks/' + chunkIndex, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'content-type': blob.type || currentMimeType,
      'x-byte-length': String(blob.size),
    },
    body: blob,
  });
  if (!response.ok) {
    let message = response.statusText;
    try { message = (await response.json()).error || message; } catch {}
    throw new Error('Chunk upload failed: ' + message);
  }
}

async function stopRecording() {
  const stopped = recordingStopPromise;
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.requestData();
    mediaRecorder.stop();
  }
  if (stopped) await stopped;
}

async function finalizeRecording() {
  const recordingId = currentRecordingId;
  if (!recordingId) return;
  setRecordingState('Finishing upload', false);
  await uploadChain;
  await api('/api/rooms/' + window.ROOM_ID + '/recordings/' + recordingId + '/complete', {
    method: 'POST',
    body: {
      chunkCount: uploadedChunkCount,
      durationMs: Date.now() - recordingStartedAt,
    },
  });
  currentRecordingId = null;
  mediaRecorder = null;
  recordingStopPromise = null;
  setRecordingState('Recording saved', false);
  await loadRecordings();
}

async function loadRecordings() {
  const container = $('recordings');
  if (!container) return;
  const data = await api('/api/rooms/' + window.ROOM_ID + '/recordings');
  if (!data.recordings.length) {
    container.innerHTML = '<p class="muted">No recordings yet.</p>';
    return;
  }
  container.innerHTML = '';
  for (const recording of data.recordings) {
    const item = document.createElement('div');
    item.className = 'recording-item';
    const duration = recording.durationMs ? Math.round(recording.durationMs / 1000) + 's' : 'in progress';
    item.innerHTML = '<div class="row spread"><strong></strong><span class="pill"></span></div><div class="muted small"></div>';
    item.querySelector('strong').textContent = recording.quality + ' local recording';
    item.querySelector('.pill').textContent = recording.status;
    item.querySelector('.muted').textContent = recording.chunkCount + ' chunks · ' + duration + ' · ' + recording.mimeType;
    container.appendChild(item);
  }
}

async function leaveCall() {
  try { await stopRecording(); } catch {}
  if (ws) ws.close();
  for (const id of [...peers.keys()]) closePeer(id);
  if (localStream) for (const track of localStream.getTracks()) track.stop();
  if (participantId) {
    try { await api('/api/rooms/' + window.ROOM_ID + '/participants/' + participantId + '/leave', { method: 'POST' }); } catch {}
  }
  window.location.href = '/';
}

$('join-button').addEventListener('click', () => joinCall().catch((error) => { $('join-button').disabled = false; $('join-button').textContent = 'Join with camera and microphone'; showError(error); }));
$('start-recording').addEventListener('click', () => startRecording().catch(showError));
$('stop-recording').addEventListener('click', () => stopRecording().catch(showError));
$('leave-button').addEventListener('click', () => leaveCall().catch(showError));
$('refresh-recordings').addEventListener('click', () => loadRecordings().catch(showError));
$('signout-button').addEventListener('click', async () => {
  await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' });
  window.location.href = '/';
});

window.addEventListener('beforeunload', () => {
  if (ws) ws.close();
  if (participantId) navigator.sendBeacon('/api/rooms/' + window.ROOM_ID + '/participants/' + participantId + '/leave');
});

init().catch(showError);
`;

  return layout("Videocast Room", body, script);
}
