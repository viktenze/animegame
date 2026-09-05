/** setup.js — Startseite und Spielkonfiguration */
function saveSettings() {
  localStorage.setItem("avg25-settings", JSON.stringify(settings));
}

function newGame(mode = "classic") {
  const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  rng = mulberry32(seed);
  return {
    version: VERSION,
    seed,
    mode,
    phase: "setup",
    active: 1,
    turnPicks: 0,
    candidate: null,
    forced: false,
    teams: { 1: [], 2: [] },
    missed: { 1: [], 2: [] },
    bans: { 1: null, 2: null },
    discarded: [],
    tokens: {
      1: { joker: 1, mystery: 1, double: 1, trade: 1, revive: 1 },
      2: { joker: 1, mystery: 1, double: 1, trade: 1, revive: 1 },
    },
    tradeDone: { 1: false, 2: false },
    captains: { 1: null, 2: null },
    order: { 1: [], 2: [] },
    verse: { 1: null, 2: null },
    allowedVerses: Object.keys(VERSE_ROSTERS),
    history: [],
    result: null,
    rematch: { 1: false, 2: false },
    matchNo: 1,
    _captainPreview: { 1: null, 2: null },
    _reviveSpent: { 1: false, 2: false },
  };
}

function hydrateRng() {
  rng = mulberry32((game?.seed || Date.now()) >>> 0);
  let steps = game?.history?.length || game?.historyCount || 0;
  while (steps-- > 0) rng();
}

function home() {
  if (typeof battleState !== "undefined") {
    clearTimeout(battleState.timer);
    clearTimeout(battleState.ttsWatchdog);
    battleState.nonce++;
    battleState.paused = true;
  }
  stopTTS();
  if (typeof Net !== "undefined" && online.mode !== "local")
    try {
      Net.close();
      Net.clearUrl?.();
      sessionStorage.removeItem("avg25-host-room");
    } catch (e) {}
  if (location.hash.startsWith("#result=")) Net.clearUrl();
  game = null;
  captainDraft = { 1: null, 2: null };
  orderDraft = { 1: [], 2: [] };
  online.mode = "local";
  const rosterNames = CHARACTERS.slice(0, 36)
    .map(
      (c) =>
        html`<span
          class="roster-name ${c.tier === "God"
            ? "god"
            : c.tier === "High"
              ? "high"
              : ""} ${c.source === "Game" ? "game" : ""}"
          >${esc(c.name)} · ${esc(c.franchise)}</span
        >`,
    )
    .join("");
  app.innerHTML = html`<section class="screen">
    <div class="hero">
      <div class="card hero-main">
        <div class="kicker">V${VERSION} · ${BUILD} · 7V7 CINEMATIC DRAFT</div>
        <h1>ANIME <span>VERSUS GAME</span></h1>
        <p class="lede">
          7 gegen 7. Balanced Take/Switch, Joker, Mystery, Trades und Captains.
          Danach entscheidet ein kurzer Kampf: verdeckte Karten, Energie und
          konkrete Anime-Fähigkeiten. Vier Duellsiege entscheiden. Die Erzählung
          bleibt kompakt; die ganze Geschichte kannst du nachlesen. Der alte
          Cinematic Auto-Fight bleibt optional.
        </p>
        <div class="home-actions">
          <button class="btn home-local" onclick="startLocal('classic')">
            <span>🎮</span><b>LOCAL 1V1</b
            ><small>Ein Gerät · Hot Seat</small></button
          ><button class="btn home-online" onclick="createRoom('classic')">
            <span>🌐</span><b>ONLINE 1V1</b
            ><small>Mit Freund spielen · Room teilen</small></button
          ><button class="btn home-show" onclick="showFightSetup('local')">
            <span>🔥</span><b>SHOWFIGHT LOCAL</b
            ><small>Verse gegen Verse</small></button
          ><button
            class="btn home-show-online"
            onclick="showFightSetup('host')"
          >
            <span>🌌</span><b>SHOWFIGHT ONLINE</b
            ><small>Verse gegen Verse · Online</small></button
          ><button class="btn home-join" onclick="joinPrompt()">
            <span>🔗</span><b>ROOM BEITRETEN</b
            ><small>Code oder Invite-Link</small>
          </button>
        </div>
      </div>
      <div class="card mode-stack">
        <div class="mode">
          <div>
            <b>⚖️ BALANCED ROLLS</b>
            <p>
              Mid häufig, High selten, God sehr selten. Team-Power beeinflusst
              die nächsten Roll-Chancen.
            </p>
          </div>
          <div class="em">🎲</div>
        </div>
        <div class="mode">
          <div>
            <b>🔥 RARE REVEALS</b>
            <p>
              High- und God-Pulls bekommen eigene SFX, Screen-Flash und
              Reveal-Sequenz.
            </p>
          </div>
          <div class="em">🌌</div>
        </div>
        <div class="mode">
          <div>
            <b>🎬 CINEMATIC DUELS</b>
            <p>
              Wenige Kapitel, dafür vollständige Duelle mit mehreren
              Fähigkeiten, Gegenreaktionen und KO-Effekten.
            </p>
          </div>
          <div class="em">⚔️</div>
        </div>
        <div class="mode">
          <div>
            <b>44 VERSES</b>
            <p>
              ${Object.keys(VERSE_ROSTERS).length} Franchises ·
              ${CHARACTERS.length} Figuren · mindestens 18 pro Verse.
            </p>
          </div>
          <div class="em">📚</div>
        </div>
      </div>
    </div>
    <div class="roster-marquee">
      <div class="roster-track">${rosterNames}${rosterNames}</div>
    </div>
    ${settingsHTML()}
  </section>`;
  bindSettings();
  ensureMusicDock();
}

function settingsHTML() {
  const t = [
    [
      "franchiseLimit",
      "Franchise-Limit",
      "Classic: maximal ein Pick pro Verse und Team. ShowFight ignoriert das bewusst.",
    ],
    ["ban", "Ban-System", "Jeder bannt einen Pick."],
    ["joker", "Joker", "Zwei neue Optionen, eine wählen."],
    ["mystery", "Mystery Box", "Neuer Secret-Pick, Gegner sieht ???."],
    ["double", "Double or Nothing", "Blind zwischen zwei Karten gambeln."],
    ["trade", "Trade", "Nach Pick 4 einmal austauschen."],
    ["captain", "Captain", "Kleiner Team-/Clutch-Bonus."],
    ["lineup", "Lineup", "Priorität 1–7 festlegen."],
    ["revive", "Revive", "Ein einmaliges Comeback im Finale."],
    ["events", "Arena Events", "Map-spezifische Modifikatoren."],
    [
      "bestOf3",
      "Best of 3 (optional)",
      "Nur für den optionalen Auto-Fight. Kartenduelle enden weiterhin bei vier Siegen.",
    ],
    [
      "balance",
      "Balance Director",
      "God/High-Rolls und Team-Power ausgleichen.",
    ],
    [
      "synergy",
      "Team-Synergie",
      "Rollen und Teamzusammenstellung wirken im Fight.",
    ],
    [
      "counters",
      "Trait-Counter",
      "Sharingan, Anti-Magic, Regeneration, Raum, Zeit usw. werden gegeneinander bewertet.",
    ],
    ["tts", "Auto TTS", "Story blockweise vorlesen."],
    ["sfx", "SFX", "Reveals, Hits, KOs, Winner."],
    ["music", "Battle OST", "Synth-Anime-OST unten links."],
    [
      "aiStory",
      "AI Fight Director",
      "Optionale KI-Langfassung im Kampf. Puter benötigt ggf. eine Anmeldung; die lokale Kampfgeschichte funktioniert immer.",
    ],
  ];
  return html`<div class="section-head">
      <div>
        <h2>Match-Regeln</h2>
        <p>
          7v7 · Vier Duellsiege entscheiden · Karten + kurze Kampfgeschichte.
        </p>
      </div>
    </div>
    <div class="settings">
      <div class="setting">
        <label for="battleFormat">Kampfstil</label
        ><select id="battleFormat">
          <option value="hybrid">Karten + kurze Erzählung</option>
          <option value="auto">Cinematic Auto-Fight</option></select
        ><small
          >Die ursprüngliche automatische Simulation bleibt auswählbar.</small
        >
      </div>
      <div class="setting">
        <label>Power Cap</label
        ><select id="powerCap">
          <option>No Limit</option>
          <option>God</option>
          <option>High</option>
          <option>Mid</option></select
        ><small>Maximales Tier im Pool.</small>
      </div>
      ${t
        .map(
          (x) =>
            html`<div class="setting">
              <label
                >${x[1]}<input
                  class="switch"
                  type="checkbox"
                  data-setting="${x[0]}"
                  ${settings[x[0]] ? "checked" : ""} /></label
              ><small>${x[2]}</small>
            </div>`,
        )
        .join("")}
      <div class="setting">
        <label>Optionale KI-Erzählung</label
        ><button
          class="btn secondary"
          style="margin-top:8px;width:100%"
          onclick="connectAIDirector()"
        >
          PUTER OPTIONAL AKTIVIEREN</button
        ><small id="aiStatus"
          >Ohne Anmeldung: lokale Erzählung + Browser-Stimme. Puter nur auf
          deinen Wunsch.</small
        >
      </div>
    </div>`;
}

async function connectAIDirector() {
  if (!window.puter?.ai?.chat) {
    toast(
      "Puter ist nicht erreichbar. Lokale Erzählung und TTS bleiben verfügbar.",
    );
    return;
  }
  try {
    if (window.puter.auth?.isSignedIn && !window.puter.auth.isSignedIn())
      await window.puter.auth.signIn();
    if (!window.puter.auth?.isSignedIn?.()) throw new Error("Nicht angemeldet");
    aiStorySessionDisabled = false;
    aiStoryWarned = false;
    settings.aiStory = true;
    saveSettings();
    const s = $("#aiStatus");
    if (s) s.textContent = "AI Fight Director bereit.";
    toast("AI Fight Director verbunden.");
  } catch (e) {
    const s = $("#aiStatus");
    if (s) s.textContent = "AI nicht verbunden · lokaler Fight Director aktiv.";
    toast("AI-Anmeldung abgebrochen – Spiel bleibt offline voll nutzbar.");
  }
}

function bindSettings() {
  const format = $("#battleFormat");
  if (format) {
    format.value = settings.battleFormat || "hybrid";
    format.onchange = () => {
      settings.battleFormat = format.value;
      saveSettings();
    };
  }
  $$("[data-setting]").forEach(
    (x) =>
      (x.onchange = () => {
        settings[x.dataset.setting] = x.checked;
        saveSettings();
        if (x.dataset.setting === "music")
          settings.music ? Music.start() : Music.stop();
      }),
  );
  const p = $("#powerCap");
  if (p) {
    p.value = settings.powerCap;
    p.onchange = () => {
      settings.powerCap = p.value;
      saveSettings();
    };
  }
}

function startLocal(mode = "classic") {
  if (typeof battleState !== "undefined") {
    clearTimeout(battleState.timer);
    clearTimeout(battleState.ttsWatchdog);
    battleState.nonce++;
    battleState.paused = true;
  }
  stopTTS();
  settings.powerCap = $("#powerCap")?.value || settings.powerCap;
  game = newGame(mode);
  online = { mode: "local", role: 1, room: null, connected: false };
  if (mode === "classic") classicVerseSetup("local");
  else showFightSetup("local");
}

function classicVerseSetup(target = "local") {
  if (!game) game = newGame("classic");
  const verses = Object.keys(VERSE_ROSTERS).sort();
  const active = new Set(
    game.allowedVerses?.length ? game.allowedVerses : verses,
  );
  modal(
    html`<button class="x" onclick="closeModal()">×</button>
      <div class="kicker">CLASSIC · VERSE FILTER</div>
      <h2>Welche Anime/Game-Verse dürfen rollen?</h2>
      <p>
        Standardmäßig sind alle aktiviert. Lokal entscheidet ihr gemeinsam;
        online legt der Host den Pool für beide Spieler fest.
      </p>
      <div class="versefilter">
        <div class="versefilter-head">
          <input
            id="verseSearch"
            placeholder="Verse suchen…"
            style="flex:1;min-width:180px;padding:11px;border-radius:10px;background:#060b15;border:1px solid var(--border);color:#fff"
          />
          <div class="actions" style="margin:0">
            <button class="btn secondary" id="allVersesBtn">ALLE</button
            ><button class="btn secondary" id="noneVersesBtn">KEINE</button>
          </div>
        </div>
        <div class="versefilter-grid" id="verseFilterGrid">
          ${verses
            .map(
              (v) =>
                html`<label
                  class="versecheck"
                  data-vname="${esc(v.toLowerCase())}"
                  ><input
                    type="checkbox"
                    value="${esc(v)}"
                    ${active.has(v) ? "checked" : ""}
                  /><span
                    >${esc(v)}<small
                      >${VERSE_ROSTERS[v].length} Charaktere</small
                    ></span
                  ></label
                >`,
            )
            .join("")}
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn secondary" onclick="closeModal()">ZURÜCK</button
        ><button class="btn gold" id="applyVersesBtn">POOL BESTÄTIGEN</button>
      </div>`,
  );
  const grid = $("#verseFilterGrid"),
    search = $("#verseSearch");
  search.oninput = () => {
    $$(".versecheck").forEach(
      (x) =>
        (x.style.display = x.dataset.vname.includes(search.value.toLowerCase())
          ? ""
          : "none"),
    );
  };
  $("#allVersesBtn").onclick = () =>
    $$("#verseFilterGrid input").forEach((x) => (x.checked = true));
  $("#noneVersesBtn").onclick = () =>
    $$("#verseFilterGrid input").forEach((x) => (x.checked = false));
  $("#applyVersesBtn").onclick = () => {
    const selected = $$("#verseFilterGrid input:checked").map((x) => x.value);
    if (!selected.length)
      return toast("Mindestens ein Verse muss aktiviert bleiben.");
    game.allowedVerses = selected;
    game.history.push({ type: "verseFilter", count: selected.length });
    sync();
    closeModal();
    if (target === "local") beginConfiguredGame();
    else renderLobby();
  };
}

function selectedVerseCount() {
  return game?.allowedVerses?.length || Object.keys(VERSE_ROSTERS).length;
}

function showFightSetup(target = "local") {
  const verses = Object.keys(VERSE_ROSTERS).sort();
  modal(
    html`<button class="x" onclick="closeModal()">×</button>
      <div class="kicker">SHOWFIGHT · VERSE VS VERSE</div>
      <h2>Wie werden die Verse verteilt?</h2>
      <p>
        Random sucht zwei unterschiedliche, vom Durchschnitt her möglichst
        passende Verse. Manuell lässt den Host beide auswählen.
      </p>
      <div class="actions">
        <button class="btn gold" onclick="showFightRandom('${target}')">
          🎲 VERSES ROLLEN</button
        ><button class="btn secondary" onclick="showFightManual('${target}')">
          🎯 SELBST AUSWÄHLEN
        </button>
      </div>
      <p style="margin-top:18px;color:var(--muted)">
        ${verses.length} Verse verfügbar, jeweils mindestens 18 Figuren.
      </p>`,
  );
}

function versePower(fr) {
  return (
    CHARACTERS.filter((c) => c.franchise === fr).reduce(
      (s, c) => s + impact(c),
      0,
    ) / 18
  );
}

function balancedVersePair() {
  const v = Object.keys(VERSE_ROSTERS),
    a = pick(v),
    pa = versePower(a);
  let candidates = v
    .filter((x) => x !== a)
    .sort((x, y) => Math.abs(versePower(x) - pa) - Math.abs(versePower(y) - pa))
    .slice(0, Math.min(12, v.length - 1));
  return [a, pick(candidates)];
}

function showFightRandom(target) {
  const [a, b] = balancedVersePair();
  closeModal();
  if (target === "local") {
    game = newGame("showfight");
    online = { mode: "local", role: 1, room: null, connected: false };
    game.verse = { 1: a, 2: b };
    showVerseReveal(() => beginConfiguredGame());
  } else {
    createRoom("showfight", { 1: a, 2: b });
  }
}

function showFightManual(target) {
  const v = Object.keys(VERSE_ROSTERS).sort();
  modal(
    html`<button class="x" onclick="closeModal()">×</button>
      <div class="kicker">SHOWFIGHT · MANUAL</div>
      <h2>PLAYER ONE VERSE</h2>
      <div class="verse-grid">
        ${v
          .map(
            (fr) =>
              html`<button
                class="verse"
                onclick="manualP2('${esc(fr)}','${target}')"
              >
                <b>${esc(fr)}</b
                ><small>${VERSE_ROSTERS[fr].length} Charaktere</small>
              </button>`,
          )
          .join("")}
      </div>`,
  );
}

function manualP2(fr, target) {
  const v = Object.keys(VERSE_ROSTERS)
    .filter((x) => x !== fr)
    .sort();
  modal(
    html`<button class="x" onclick="closeModal()">×</button>
      <div class="kicker">PLAYER ONE · ${esc(fr)}</div>
      <h2>PLAYER TWO VERSE</h2>
      <div class="verse-grid">
        ${v
          .map(
            (f) =>
              html`<button
                class="verse"
                onclick="finishManual('${esc(fr)}','${esc(f)}','${target}')"
              >
                <b>${esc(f)}</b
                ><small>${VERSE_ROSTERS[f].length} Charaktere</small>
              </button>`,
          )
          .join("")}
      </div>`,
  );
}

function finishManual(a, b, target) {
  closeModal();
  if (target === "local") {
    game = newGame("showfight");
    online = { mode: "local", role: 1, room: null, connected: false };
    game.verse = { 1: a, 2: b };
    showVerseReveal(() => beginConfiguredGame());
  } else createRoom("showfight", { 1: a, 2: b });
}

function showVerseReveal(cb) {
  modal(
    html`<div class="kicker">SHOWFIGHT LOCKED</div>
      <h2>
        ${esc(game.verse[1])} <span class="p1c">VS</span> ${esc(game.verse[2])}
      </h2>
      <p>
        Ab jetzt zieht Player One ausschließlich aus ${esc(game.verse[1])};
        Player Two ausschließlich aus ${esc(game.verse[2])}.
      </p>
      <div class="modal-actions">
        <button class="btn gold" onclick="closeModal();(${cb.toString()})()">
          FIGHT DRAFT STARTEN
        </button>
      </div>`,
  );
}

function beginConfiguredGame() {
  game.phase = settings.ban ? "ban" : "draft";
  game.active = 1;
  if (!settings.ban) game.candidate = drawCharacter(1);
  sync();
  route();
}
