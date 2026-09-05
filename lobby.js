/** Online-Lobby und benutzerlesbare Verbindungsanzeigen. */
async function createRoom(mode = 'classic', verse = null) {
  settings.powerCap = $('#powerCap')?.value || settings.powerCap;
  game = newGame(mode);
  if (verse) game.verse = verse;
  game.phase = 'lobby';
  online = {
    mode: 'host',
    role: 1,
    room: String(Math.floor(100000 + Math.random() * 900000)),
    connected: false,
    transport: 'auto',
  };
  Net.setUrl(online.room);
  renderLobby();
  await Net.connect('host', online.room);
  route();
}
async function joinRoomByCode(codeOverride) {
  const code = String(codeOverride || $('#roomin')?.value || '').trim();
  if (!/^\d{6}$/.test(code)) return toast('6-stelligen Code eingeben.');
  closeModal();
  game = newGame('classic');
  game.phase = 'lobby';
  online = { mode: 'guest', role: 2, room: code, connected: false, transport: 'auto' };
  Net.setUrl(code);
  renderLobby();
  await Net.connect('guest', code);
  route();
}
async function retryOnline() {
  toast('Online-Verbindung wird neu aufgebaut…');
  await Net.retry();
  Net.uiRefresh();
}
function leaveRoom() {
  Net.close();
  sessionStorage.removeItem('avg25-host-room');
  online = { mode: 'local', role: 1, room: null, connected: false, transport: null };
  Net.clearUrl();
  home();
}
function sync() {
  if (online.mode === 'host') Net.sendState();
}
function netTransportLabel() {
  return 'SPIELSERVER';
}
function netStatusPill() {
  return html`<span role="status" aria-live="polite" class="${online.connected ? 'on' : ''}"
    >${online.connected
      ? '● BEIDE SPIELER VERBUNDEN'
      : Net.relayError
        ? '○ VERBINDUNG UNTERBROCHEN'
        : Net.transportReady
          ? '◌ ROOM BEREIT'
          : '◌ VERBINDE MIT SPIELSERVER'}</span
  >`;
}
function renderLobby() {
  if (!online.room) return;
  const host = online.mode === 'host';
  app.innerHTML = html`<section class="screen">
    <div class="card lobby" style="padding:28px">
      <div class="kicker">ONLINE DUEL · V${VERSION} · DU BIST PLAYER ${host ? 'ONE' : 'TWO'}</div>
      <h1>${game?.mode === 'showfight' ? 'SHOWFIGHT' : '1V1 CLASSIC'}</h1>
      <p>Dein Room-Code</p>
      <div class="roomcode">${esc(online.room)}</div>
      <div class="net">${netStatusPill()}</div>
      <p role="status">
        ${Net.relayError
          ? esc(Net.relayError)
          : online.connected
            ? 'Ihr seid verbunden. Der Host kann das Match starten.'
            : Net.transportReady
              ? host
                ? 'Teile den Link oder Code mit Player Two. Lass diesen Tab während des Matches offen.'
                : 'Warte auf den Host. Der Spielstand wird automatisch geladen.'
              : 'Der Raum wird eingerichtet…'}
      </p>
      ${game?.mode === 'classic'
        ? html`<p>${selectedVerseCount()} Verse im Draft-Pool</p>`
        : html`<p>${esc(game?.verse?.[1] || '')} vs ${esc(game?.verse?.[2] || '')}</p>`}
      <div class="actions" style="justify-content:center">
        ${host
          ? html`<button
                class="btn secondary"
                ${Net.transportReady ? '' : 'disabled'}
                onclick="copyInvite()"
              >
                🔗 EINLADUNG KOPIEREN</button
              >${game?.mode === 'classic'
                ? '<button class="btn secondary" onclick="classicVerseSetup(\'host\')">VERSE AUSWÄHLEN</button>'
                : ''}<button
                class="btn"
                ${online.connected ? '' : 'disabled'}
                onclick="beginConfiguredGame()"
              >
                MATCH STARTEN
              </button>`
          : ''}<button class="btn secondary" onclick="retryOnline()">ERNEUT VERBINDEN</button
        ><button class="btn danger" onclick="leaveRoom()">ROOM VERLASSEN</button>
      </div>
      <p class="small-note">
        Beide Spieler benötigen V2.9. Bei einer kurzen Unterbrechung verbinden wir euch automatisch
        wieder.
      </p>
    </div>
  </section>`;
}
async function copyInvite() {
  const base = /^https?:$/.test(location.protocol)
    ? location.origin + location.pathname
    : RELAY_URL + '/';
  const link = base + '#room=' + online.room;
  try {
    await navigator.clipboard.writeText(link);
    toast('Einladungslink kopiert.');
  } catch (_) {
    modal(
      html`<button class="x" onclick="closeModal()">×</button>
        <h2>Einladung</h2>
        <input class="search-box" value="${esc(link)}" readonly onclick="this.select()" />`,
    );
  }
}
function joinPrompt() {
  modal(
    html`<button class="x" onclick="closeModal()">×</button>
      <h2>Room beitreten</h2>
      <p>Gib den 6-stelligen Code ein oder füge den Einladungslink ein.</p>
      <input
        id="roomin"
        aria-label="Room-Code oder Einladungslink"
        placeholder="123456 oder Einladungslink"
        style="width:100%;padding:14px;background:#080d18;color:#fff;border:1px solid var(--border);border-radius:10px"
      />
      <div class="modal-actions">
        <button class="btn secondary" onclick="closeModal()">ZURÜCK</button
        ><button class="btn p2" onclick="joinRoom()">BEITRETEN</button>
      </div>`,
  );
  $('#roomin').onkeydown = (e) => {
    if (e.key === 'Enter') joinRoom();
  };
  $('#roomin').focus();
}
function joinRoom(value) {
  const input = String(value || $('#roomin')?.value || '').trim();
  const code = /^\d{6}$/.test(input) ? input : (input.match(/[#&]room=(\d{6})(?:&|$)/) || [])[1];
  if (!code) return toast('Bitte einen gültigen Code oder Einladungslink eingeben.');
  return joinRoomByCode(code);
}
function openNetworkSettings() {
  modal(
    html`<button class="x" onclick="closeModal()">×</button>
      <h2>Online-Verbindung</h2>
      <p>
        V2.9 nutzt einen gemeinsamen Spielserver. Du brauchst keine eigenen Supabase-, PeerJS- oder
        TURN-Einstellungen.
      </p>
      <p>
        Der Host steuert den Spielstand. Beide Tabs müssen während des Matches geöffnet bleiben.
      </p>
      <div class="modal-actions">
        <button class="btn" onclick="openNetworkDiagnostics()">VERBINDUNG PRÜFEN</button>
      </div>`,
  );
}
async function openNetworkDiagnostics() {
  modal(
    html`<button class="x" onclick="closeModal()">×</button>
      <h2>Online-Verbindung</h2>
      <div id="diagBody" role="status">Spielserver wird geprüft…</div>`,
  );
  const body = $('#diagBody');
  try {
    const r = await fetch(relayBase + '/api/health', { signal: AbortSignal.timeout(9000) });
    const d = await r.json();
    if (!r.ok || !d.ok) throw new Error('Server antwortet nicht');
    body.textContent =
      'Spielserver erreichbar. ' +
      (online.connected
        ? 'Beide Spieler sind verbunden.'
        : 'Erstelle einen Room oder tritt mit einem gültigen Code bei.');
  } catch (_) {
    body.textContent =
      'Spielserver nicht erreichbar. Prüfe deine Internetverbindung und öffne die aktuelle Spielseite.';
  }
}
function rules() {
  modal(
    html`<button class="x" onclick="closeModal()">×</button>
      <h2>Spielregeln</h2>
      <p>
        <b>Draft:</b> 7 gegen 7. Zwei Picks pro Zug. Ein Wechsel verpflichtet dich, den nächsten
        Charakter zu nehmen.
      </p>
      <p>
        <b>Kartenkampf:</b> Beide Spieler wählen verdeckt. Erst wenn beide bestätigt haben, wird die
        Runde aufgelöst. Vier Duellsiege entscheiden das Match; maximal sieben Duelle.
      </p>
      <p>
        <b>Taktik:</b> Angriff hat einen Vorteil gegen Finte, Finte gegen Konter und Konter gegen Angriff.
        Figurenstärke, Fähigkeiten und Arena zählen ebenfalls; ein Kartenvorteil garantiert keinen Sieg.
        Nach jedem Duell bekommst du eine Energie, bei einer Niederlage eine weitere. Den Finisher kannst du einmal einsetzen; er kostet drei Energie und wird durch Konter gebremst.
      </p>
      <p>
        <b>Online:</b> Beide Spieler öffnen dieselbe Version. Der Host steuert das Match. Bei kurzen
        Unterbrechungen verbinden wir euch automatisch erneut. Lass den Spiel-Tab offen.
      </p>
      <div class="actions">
        <button class="btn secondary" onclick="openNetworkDiagnostics()">VERBINDUNG PRÜFEN</button>
      </div>`,
  );
}
