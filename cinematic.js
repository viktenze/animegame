/** cinematic.js — Kampfablauf, Sprachausgabe und Ergebnisansicht */
let battleState = {
  i: 0,
  timer: null,
  ttsWatchdog: null,
  paused: false,
  nonce: 0,
  started: false,
};

function renderBattleIntro() {
  const r = game.result,
    a = r.scenes[0]?.attacker || game.teams[1][0],
    b = r.scenes[0]?.defender || game.teams[2][0];
  app.innerHTML = html`<section class="screen battle-r6">
    <div class="battle-intro-r6">
      <div class="intro-head">
        <div class="kicker">
          CINEMATIC MATCH ·
          ${game.mode === "showfight"
            ? esc(game.verse[1]) + " VS " + esc(game.verse[2])
            : "CLASSIC 7V7"}
        </div>
        <h1>Beide Teams betreten die Arena</h1>
        <p>Der Sieger bleibt bis zum letzten Kapitel verborgen.</p>
      </div>
      <div class="intro-vs">
        <div class="intro-fighter">
          <img id="introA" src="${avatar(a.name, a.franchise)}" /><span
            class="art-refresh"
            onclick="refreshArt('${a.id}','introA')"
            >↻ ART</span
          >
          <div class="nm">${esc(a.name)}</div>
        </div>
        <div class="intro-vsmark">VS</div>
        <div class="intro-fighter">
          <img id="introB" src="${avatar(b.name, b.franchise)}" /><span
            class="art-refresh"
            onclick="refreshArt('${b.id}','introB')"
            >↻ ART</span
          >
          <div class="nm">${esc(b.name)}</div>
        </div>
      </div>
      <div class="intro-promise">Keine Spoiler. Kein Sofort-Ergebnis.</div>
      <p class="intro-meta">
        ${r.scenes.length} Kapitel · jedes Kapitel erzählt einen vollständigen
        Schlagabtausch ·
        ${settings.aiStory ? "AI Fight Director aktiv · " : ""}maximal ein
        Revive pro Spieler im gesamten Match.
      </p>
      <div class="intro-actions">
        <button class="btn gold" onclick="beginCinematic()">
          ▶ KAMPF STARTEN</button
        ><button class="btn secondary" onclick="openVoice()">
          🔊 AUDIO / TTS
        </button>
      </div>
    </div>
  </section>`;
  resolveImage(a).then((src) => {
    const x = $("#introA");
    if (x) x.src = src;
  });
  resolveImage(b).then((src) => {
    const x = $("#introB");
    if (x) x.src = src;
  });
}

function beginCinematic() {
  battleState.started = true;
  renderBattleShell();
  showScene(0);
}

function renderBattleShell() {
  const total = game.result?.scenes?.length || 1;
  app.innerHTML = html`<section class="screen v23-battle">
    <div class="v23-battle-head">
      <div>
        <div class="kicker">CINEMATIC FINALE · V2.3 PRESENTATION</div>
        <h1>LIVE BATTLE</h1>
      </div>
      <span class="v23-live">TTS ${settings.tts ? "LIVE" : "OPTIONAL"}</span>
    </div>
    <div class="v23-cinema" id="cinema">
      <div class="v23-scene-top">
        <small id="sceneK">KAPITEL 1 / ${total}</small>
        <h2 id="sceneT">...</h2>
        <p id="sceneSub">...</p>
      </div>
      <div class="v23-duel">
        <div id="v23Left"></div>
        <div class="v23-duel-vs">VS</div>
        <div id="v23Right"></div>
      </div>
      <div class="v23-storybox">
        <div class="v23-story-inner">
          <div class="label" id="storyTitle">BATTLE NARRATION</div>
          <div class="v23-movechain" id="moveChain"></div>
          <p id="storyText"></p>
        </div>
      </div>
      <div class="v23-ko-feed" id="ko"></div>
      <div class="v23-impact-particles" id="impactParticles"></div>
      <div class="v23-progress" id="sceneProgress">
        ${Array.from(
          { length: Math.min(12, total) },
          (_, i) => html`<i class="v23-dot" data-sc="${i}"></i>`,
        ).join("")}
      </div>
      <div class="v23-controls">
        <button
          class="btn secondary"
          onclick="toggleBattlePause()"
          id="pauseBtn"
        >
          ⏸ PAUSE</button
        ><button class="btn secondary" onclick="skipCinematic()">
          ⏭ FINALE ÜBERSPRINGEN</button
        ><button class="btn gold" onclick="nextScene()">WEITER ›</button>
      </div>
    </div>
  </section>`;
}

let aiStoryWarned = false,
  aiStorySessionDisabled = false;

function extractAIText(res) {
  if (typeof res === "string") return res;
  const c = res?.message?.content ?? res?.text ?? res?.content ?? res?.response;
  if (typeof c === "string") return c;
  if (Array.isArray(c))
    return c.map((x) => (typeof x === "string" ? x : x?.text || "")).join("\n");
  return "";
}

function aiScenePrompt(s, i) {
  const a = s.attacker || {},
    b = s.defender || {};
  const ak = (a.skillKit || [])
    .map((x) => x.name)
    .filter(Boolean)
    .slice(0, 10);
  const bk = (b.skillKit || [])
    .map((x) => x.name)
    .filter(Boolean)
    .slice(0, 10);
  const recent = (game?.result?.scenes || [])
    .slice(Math.max(0, i - 2), i)
    .map((x) => cleanNarrationText(x.aiText || x.text || "").slice(0, 650))
    .join("\n---\n");
  return `Du bist der Regisseur eines ernsten Anime/Game-Crossover-Kampfes. Schreibe genau DIESE einzelne Szene auf Deutsch wie eine spannende Battle-Story, nicht wie eine Analyse oder ein Regeltext.

SZENE: ${s.title || "Duell"}
ARENA: ${s.arena || "Null Arena"}${s.event ? " · Event: " + s.event : ""}
GEWINNER DIESER SZENE: ${a.name} aus ${a.franchise}
AUSGESCHIEDEN: ${b.name} aus ${b.franchise}
Mögliche bekannte Fähigkeiten von ${a.name}: ${ak.join(", ") || "keine sicheren Namen hinterlegt"}
Mögliche bekannte Fähigkeiten von ${b.name}: ${bk.join(", ") || "keine sicheren Namen hinterlegt"}
Im Game bereits für diese Szene gewählte Moves: ${(s.moves || []).join(", ") || "keine"}

REGELN:
- Das Ergebnis ist fest: ${a.name} gewinnt dieses Duell. Ändere NICHT den Sieger.
- Schreibe 3 bis 5 atmosphärische Absätze, ca. 280 bis 450 Wörter.
- Erzähle Bewegung, Blickkontakt, Umgebung, Treffer, Ausweichmanöver, Verletzungen, Überraschungen und Reaktionen. Es soll sich wie eine Szene anfühlen, nicht wie eine Auswertung.
- Nutze mehrere tatsächlich passende Fähigkeiten und Kampfeigenschaften beider Figuren. Wenn du einen kanonischen Skillnamen nicht sicher kennst, erfinde KEINEN angeblich kanonischen Namen; beschreibe stattdessen die Aktion natürlich.
- Eine Fähigkeit muss auf die konkrete Fähigkeit des Gegners reagieren. Erkläre durch Handlung, warum ein Konter funktioniert, nicht durch 'Stats' oder Tier-Werte.
- Persönlichkeit und Kampfstil sollen erkennbar sein.
- Vermeide vollständig die Wörter und Formulierungen: Standardlösung, Stat-Check, Output, Reset, Commit, Layer, Window, mechanischer Vorteil, Timing und Position, sichere Linie.
- Keine Markdown-Sterne, keine Listen, keine Überschriften, keine Emojis, keine Sonderzeichen als Dekoration. Nur normale Prosa.
- Verrate NICHT, welches Team das Gesamtmatch gewinnt.
- Wiederhole weder Satzbau noch Dramaturgie aus den letzten Szenen.

Letzte Szenen zur Anti-Wiederholung:
${recent || "Noch keine."}

Antworte ausschließlich als JSON-Objekt in genau diesem Format: {"story":"fertige Szene als normale Prosa","moves":["kanonischer Skill 1","kanonischer Skill 2","kanonischer Skill 3"]}. In moves stehen nur Fähigkeiten, die in deiner Szene tatsächlich benutzt wurden und die du für diese Figur sicher kennst; sonst nutze kurze natürliche Aktionsbeschreibungen statt erfundener Eigennamen.`;
}

async function getSceneNarration(s, i, nonce) {
  const fallback = cleanNarrationText(s.text || "");
  if (
    !settings.aiStory ||
    aiStorySessionDisabled ||
    s.kind !== "ko" ||
    !window.puter?.ai?.chat ||
    !window.puter?.auth?.isSignedIn?.()
  )
    return fallback;
  if (s.aiText) return cleanNarrationText(s.aiText);
  const storyText = $("#storyText");
  if (storyText)
    storyText.textContent = "AI Fight Director schreibt diese Szene …";
  try {
    const prompt = aiScenePrompt(s, i);
    const req = window.puter.ai.chat(prompt, {
      temperature: 0.9,
      max_tokens: 1800,
    });
    const timeout = (ms) =>
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error("AI timeout")), ms),
      );
    let res;
    try {
      res = await Promise.race([req, timeout(12000)]);
    } catch (firstErr) {
      const req2 = window.puter.ai.chat(prompt, {
        temperature: 0.9,
        max_tokens: 1800,
      });
      res = await Promise.race([req2, timeout(10000)]);
    }
    if (nonce !== battleState.nonce) return fallback;
    let raw = extractAIText(res).trim(),
      out = "",
      parsed = null;
    const jsonCandidate = raw
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();
    try {
      const a = jsonCandidate.indexOf("{"),
        b = jsonCandidate.lastIndexOf("}");
      if (a >= 0 && b > a) parsed = JSON.parse(jsonCandidate.slice(a, b + 1));
    } catch (_) {}
    if (parsed && typeof parsed.story === "string") {
      out = parsed.story;
      if (Array.isArray(parsed.moves))
        s.aiMoves = parsed.moves
          .map((x) =>
            String(x)
              .replace(/[*_`#]/g, "")
              .trim(),
          )
          .filter(Boolean)
          .slice(0, 7);
    } else out = raw;
    out = cleanNarrationText(out.replace(/\*\*/g, "").replace(/[`#*_~]+/g, ""));
    if (out.length < 180) throw new Error("AI response too short");
    s.aiText = out;
    return out;
  } catch (e) {
    aiStorySessionDisabled = true;
    if (!aiStoryWarned) {
      aiStoryWarned = true;
      toast(
        "AI Story nicht erreichbar – lokaler Fight Director übernimmt sofort.",
      );
    }
    return fallback;
  }
}

async function showScene(i) {
  clearTimeout(battleState.timer);
  stopTTS();
  if (!game?.result?.scenes || game.phase !== "battle") return;
  const nonce = ++battleState.nonce,
    s = game.result.scenes[i];
  if (!s) return revealWinner();
  battleState.i = i;
  const total = game.result.scenes.length;
  const K = $("#sceneK"),
    T = $("#sceneT"),
    Sub = $("#sceneSub"),
    storyTitle = $("#storyTitle"),
    storyText = $("#storyText");
  if (!K || !T || !storyTitle || !storyText) return;
  K.textContent = `KAPITEL ${i + 1} / ${total}`;
  T.textContent =
    s.title ||
    (s.kind === "ko"
      ? "ELIMINATION"
      : s.kind === "revive"
        ? "COMEBACK"
        : s.kind === "suspense"
          ? "LETZTER CLASH"
          : "BATTLE");
  Sub.textContent = `${s.attacker?.name || "Team"} vs ${s.defender?.name || "Team"} · ${s.arena || "Finale"}`;
  storyTitle.textContent =
    s.kind === "ko"
      ? "BATTLE NARRATION · FINISH"
      : s.kind === "revive"
        ? "BATTLE NARRATION · REVIVE"
        : "BATTLE NARRATION";
  const narration = compactLiveNarration(
    s,
    s.shortText || (await getSceneNarration(s, i, nonce)),
  );
  if (nonce !== battleState.nonce) return;
  if (s.aiText && s.kind === "ko")
    storyTitle.textContent = "AI BATTLE NARRATION · FINISH";
  storyText.textContent = narration;
  const mc = $("#moveChain");
  if (mc) {
    const shown = s.aiMoves?.length ? s.aiMoves : s.moves || [];
    mc.innerHTML =
      shown
        .map((m, n) => html`<span>${n + 1}. ${esc(prettyMoveName(m))}</span>`)
        .join("") +
      (s.aiText ? '<span class="ai-chip">AI DIRECTOR</span>' : "");
  }
  $$("#sceneProgress .v23-dot").forEach((x, n, arr) => {
    x.className =
      "v23-dot" +
      (n < Math.floor((i / total) * arr.length)
        ? " done"
        : n === Math.min(arr.length - 1, Math.floor((i / total) * arr.length))
          ? " on"
          : "");
  });
  const left = $("#v23Left"),
    right = $("#v23Right");
  if (!left || !right) return;
  const makeCard = (c, p, status, id) =>
    html`<div class="v23-duel-card p${p}" id="${id}">
      <span class="v23-status">${status}</span
      ><img
        id="${id}img"
        src="${avatar(c?.name || "?", c?.franchise || "")}"
      /><span
        class="art-refresh"
        onclick="refreshArt('${c?.id || ""}','${id}img')"
        >↻ ART</span
      >
      <div class="v23-duel-copy">
        <b>${esc(c?.name || "—")}</b><small>${esc(c?.franchise || "")}</small>
      </div>
    </div>`;
  const aId = `scene-a-${i}`,
    bId = `scene-b-${i}`;
  const aHTML = makeCard(
      s.attacker,
      s.attackerP,
      s.kind === "ko" ? "ATTACKER" : s.kind === "revive" ? "REVIVED" : "ACTIVE",
      aId,
    ),
    bHTML = makeCard(
      s.defender,
      s.defenderP,
      s.kind === "ko" ? "TARGET" : "ACTIVE",
      bId,
    );
  if (s.attackerP === 1) {
    left.innerHTML = aHTML;
    right.innerHTML = bHTML;
  } else {
    left.innerHTML = bHTML;
    right.innerHTML = aHTML;
  }
  const ai = $("#" + aId + "img"),
    bi = $("#" + bId + "img");
  resolveImage(s.attacker).then((src) => {
    if (nonce === battleState.nonce && ai?.isConnected) ai.src = src;
  });
  resolveImage(s.defender).then((src) => {
    if (nonce === battleState.nonce && bi?.isConnected) bi.src = src;
  });
  const A = $("#" + aId),
    B = $("#" + bId),
    cinema = $("#cinema"),
    ko = $("#ko"),
    particles = $("#impactParticles");
  if (cinema) {
    cinema.classList.remove("impact-blur");
  }
  if (ko) {
    ko.classList.remove("show");
    ko.innerHTML = "";
  }
  if (particles) particles.innerHTML = "";
  if (s.kind === "ko") {
    const effectNonce = nonce;
    setTimeout(() => {
      if (effectNonce !== battleState.nonce) return;
      const key =
        s.effect === "burn"
          ? "fire"
          : s.effect === "voidfx"
            ? "void"
            : s.effect === "lightning"
              ? "lightning"
              : s.effect === "psychicfx"
                ? "psychic"
                : "energy";
      const out =
        key === "fire"
          ? "burn-out"
          : key === "void"
            ? "void-out"
            : key === "lightning"
              ? "shock-out"
              : key === "psychic"
                ? "psychic-out"
                : "shatter-out";
      A?.classList.add("attacker-flare", "aura-" + key);
      B?.classList.add(out);
      cinema?.classList.add("impact-blur");
      if (B?.querySelector(".v23-status"))
        B.querySelector(".v23-status").textContent = "ELIMINIERT";
      if (ko) {
        ko.innerHTML = html`<small>ELIMINATION CONFIRMED</small
          ><b>${esc(s.attacker.name)} → ${esc(s.defender.name)}</b>`;
        void ko.offsetWidth;
        ko.classList.add("show");
      }
      if (particles) {
        for (let n = 0; n < 24; n++) {
          const q = document.createElement("i");
          const ang = (Math.PI * 2 * n) / 24 + (Math.random() - 0.5) * 0.25,
            dist = 70 + Math.random() * 180;
          q.style.setProperty("--x", Math.cos(ang) * dist + "px");
          q.style.setProperty("--y", Math.sin(ang) * dist + "px");
          q.style.background =
            key === "fire"
              ? "#ff7a45"
              : key === "void"
                ? "#9d63ff"
                : key === "lightning"
                  ? "#8edfff"
                  : key === "psychic"
                    ? "#ee89ff"
                    : "#ffe183";
          particles.appendChild(q);
        }
      }
      SFX.effect(s.effect);
      SFX.ko();
      setTimeout(() => {
        if (effectNonce === battleState.nonce)
          cinema?.classList.remove("impact-blur");
      }, 700);
    }, 700);
  }
  SFX.hit();
  narrateBlock(narration, () => {
    if (nonce === battleState.nonce && !battleState.paused)
      battleState.timer = setTimeout(() => showScene(i + 1), 950);
  });
}

function toggleBattlePause() {
  battleState.paused = !battleState.paused;
  const b = $("#pauseBtn");
  if (b) b.textContent = battleState.paused ? "▶ WEITER" : "⏸ PAUSE";
  if (battleState.paused) stopTTS();
  else showScene(battleState.i);
}

function nextScene() {
  clearTimeout(battleState.timer);
  stopTTS();
  showScene(battleState.i + 1);
}

function skipCinematic() {
  clearTimeout(battleState.timer);
  stopTTS();
  battleState.nonce++;
  revealWinner();
}

function revealWinner() {
  if (!game?.result || game.phase !== "battle") return;
  battleState.nonce++;
  stopTTS();
  SFX.win();
  const r = game.result;
  const d = document.createElement("div");
  d.className = "rare-overlay god show";
  d.style.pointerEvents = "auto";
  d.innerHTML = html`<div class="r" style="text-align:center">
    PLAYER ${r.winner === 1 ? "ONE" : "TWO"}<br /><span style="font-size:.33em"
      >GEWINNT ${r.wins1}:${r.wins2}</span
    ><br /><button class="btn gold" style="margin-top:22px" id="openResultR6">
      OFFICIAL RESULT
    </button>
  </div>`;
  document.body.appendChild(d);
  $("#openResultR6").onclick = () => {
    d.remove();
    renderResult();
  };
}

function resultAwardData(r) {
  const kos = r.scenes.filter((s) => s.kind === "ko");
  const counts = {};
  kos.forEach(
    (s) => (counts[s.attacker.id] = (counts[s.attacker.id] || 0) + 1),
  );
  const all = [...game.teams[1], ...game.teams[2]];
  const killer =
    [...all].sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0))[0] ||
    r.mvp;
  const lowest = [...all].sort((a, b) => impact(a) - impact(b))[0] || r.mvp;
  const misses = [...game.missed[1], ...game.missed[2]].sort(
    (a, b) => impact(b) - impact(a),
  );
  return { killer, lowest, biggestMiss: misses[0] || null };
}

function finalTeamHTML(p) {
  return html`<div>
    <h3 class="${p === 1 ? "p1c" : "p2c"}">
      PLAYER ${p === 1 ? "ONE" : "TWO"}
    </h3>
    <div class="final-roster-v23">
      ${game.teams[p]
        .map(
          (c) =>
            html`<div class="final-mini-v23" style="position:relative">
              <img
                data-img="${c.id}"
                src="${avatar(c.name, c.franchise)}"
              /><span
                class="art-refresh"
                onclick="event.stopPropagation();refreshArt('${c.id}')"
                >↻ ART</span
              >
              <div>
                <b>${esc(c.name)} ${game.captains[p] === c.id ? "👑" : ""}</b
                ><small>${esc(c.franchise)} · ${c.tier}</small>
              </div>
            </div>`,
        )
        .join("")}
    </div>
  </div>`;
}

function fullStoryText() {
  return (game?.result?.scenes || [])
    .map(
      (s, i) =>
        `${i + 1}. ${s.title}. ${cleanNarrationText(s.aiText || s.text)}`,
    )
    .join("\n\n");
}

let fullStorySpeakToken = 0;

function speakFullStory() {
  if (!game?.result) return;
  settings.tts = true;
  stopTTS();
  const token = ++fullStorySpeakToken,
    parts = game.result.scenes
      .map((s) => cleanNarrationText(s.aiText || s.text))
      .filter(Boolean);
  let i = 0;
  const next = () => {
    if (token !== fullStorySpeakToken) return;
    if (i >= parts.length) {
      toast("Story komplett vorgelesen.");
      return;
    }
    narrateBlock(parts[i++], next);
  };
  next();
}

function teamMetric(p, k) {
  return (
    game.teams[p].reduce((s, c) => s + (Number(c[k]) || 0), 0) /
    Math.max(1, game.teams[p].length)
  );
}

function metricRow(label, k) {
  const a = teamMetric(1, k),
    b = teamMetric(2, k);
  return html`<div class="metric-v23">
    <div>
      <span>${label} · P1 ${a.toFixed(1)}</span><span>P2 ${b.toFixed(1)}</span>
    </div>
    <div class="metric-bars-v23">
      <i style="width:${a}%"></i><i style="width:${b}%"></i>
    </div>
  </div>`;
}

function renderResult() {
  game.phase = "result";
  if (!game.result) game.result = simulateMatch();
  sync();
  const r = game.result,
    kos = r.scenes.filter((s) => s.kind === "ko"),
    aw = resultAwardData(r);
  const rematch =
    online.mode === "local"
      ? html`<button class="btn secondary" onclick="requestRematch()">
          ↻ REVANCHE
        </button>`
      : html`<button class="btn secondary" onclick="requestRematch()">
          ↻ REVANCHE IM ROOM
        </button>`;
  app.innerHTML = html`<section class="screen">
    <div class="result-hero-v2">
      <div class="result-kicker">OFFICIAL MATCH RESULT</div>
      <div class="result-score-big p${r.winner}">
        PLAYER ${r.winner === 1 ? "ONE" : "TWO"}
      </div>
      <h2>GEWINNT ${r.wins1}:${r.wins2}</h2>
      <p class="result-sub">
        MVP: <b>${esc(r.mvp.name)}</b> · ${kos.length} dokumentierte
        Eliminierungen
      </p>
      <div class="actions" style="justify-content:center">
        <button class="btn gold" onclick="speakFullStory()">
          🎙️ STORY VORLESEN</button
        ><button class="btn secondary" onclick="replayBattle()">
          🎬 CINEMATIC REPLAY</button
        ><button class="btn secondary" onclick="shareResult()">
          🔗 ERGEBNIS TEILEN</button
        >${rematch}<button class="btn secondary" onclick="home()">
          ⌂ HOME
        </button>
      </div>
      ${online.mode !== "local"
        ? html`<div class="rematch-box" style="margin-top:14px">
            <b>Duel Code ${online.room || ""} bleibt aktiv</b>
            <p class="small-note">
              Beide Spieler drücken Revanche. Erst wenn P1 und P2 READY sind,
              startet Match ${game.matchNo + 1} im selben Room.
            </p>
          </div>`
        : ""}
    </div>
    <div class="round-cards">
      ${r.rounds
        .map(
          (x, i) =>
            html`<div class="round-card">
              <b>ROUND ${i + 1} · ${esc(x.arena)}</b>
              <p>${esc(x.event)}</p>
              <div class="rw ${x.winner === 1 ? "p1c" : "p2c"}">
                PLAYER ${x.winner === 1 ? "ONE" : "TWO"} +1
              </div>
            </div>`,
        )
        .join("")}
    </div>
    <div class="result-grid">
      <div class="story">
        <h3>⚔️ Vollständige Kampfgeschichte</h3>
        ${r.scenes
          .map(
            (s, i) =>
              html`<div class="v23-story-chapter">
                <b>${String(i + 1).padStart(2, "0")} · ${esc(s.title)}</b>
                <p>${esc(cleanNarrationText(s.aiText || s.text))}</p>
              </div>`,
          )
          .join("")}
        <div class="whatif">
          <b>🔀 Was wäre wenn?</b>
          <p>
            ${aw.biggestMiss
              ? `${esc(aw.biggestMiss.name)} war der stärkste verpasste Pick. Mit diesem Matchup-Profil hätten mehrere zentrale Duelle anders verlaufen können.`
              : "Kein einzelner verpasster Pick hätte den Ausgang alleine garantiert gedreht."}
          </p>
        </div>
      </div>
      <div class="analytics">
        <h3>☠️ KILL FEED</h3>
        <div class="v23-ledger">
          ${kos
            .map(
              (s) =>
                html`<div class="v23-ledger-row">
                  <div>
                    <b class="${s.attackerP === 1 ? "p1c" : "p2c"}"
                      >${esc(s.attacker.name)}</b
                    ><small>PLAYER ${s.attackerP === 1 ? "ONE" : "TWO"}</small>
                  </div>
                  <div class="v23-arrow">→</div>
                  <div>
                    <b>${esc(s.defender.name)}</b><small>ELIMINIERT</small>
                  </div>
                </div>`,
            )
            .join("")}
        </div>
        <h3 style="margin-top:20px">📊 Match Analytics</h3>
        ${metricRow("POWER", "power")}${metricRow("HAX", "hax")}${metricRow(
          "SPEED",
          "speed",
        )}${metricRow("DURABILITY", "durability")}
        <div class="award-grid">
          <div class="award">
            <small>🏆 MVP</small><b>${esc(r.mvp.name)}</b>
          </div>
          <div class="award">
            <small>💀 TOP ELIMINATOR</small><b>${esc(aw.killer.name)}</b>
          </div>
          <div class="award">
            <small>📉 LOWEST VALUE</small><b>${esc(aw.lowest.name)}</b>
          </div>
          <div class="award">
            <small>🎭 BIGGEST MISS</small
            ><b>${aw.biggestMiss ? esc(aw.biggestMiss.name) : "—"}</b>
          </div>
        </div>
        <div class="whatif" style="margin-top:12px">
          <b>REVIVE STATUS</b>
          <p>
            P1 ${r.reviveSpent?.[1] ? "VERBRAUCHT" : "NICHT GENUTZT"} · P2
            ${r.reviveSpent?.[2] ? "VERBRAUCHT" : "NICHT GENUTZT"}
          </p>
        </div>
      </div>
    </div>
    <div class="section-head">
      <div>
        <h2>Finale Teams</h2>
        <p>Mystery Picks sind vollständig aufgedeckt.</p>
      </div>
    </div>
    <div class="final-team-grid" id="finalTeams"></div>
  </section>`;
  renderFinalTeamsR9();
}

async function renderFinalTeamsR9() {
  const root = $("#finalTeams");
  if (!root) return;
  const blocks = [];
  for (const p of [1, 2]) {
    const units = game.teams[p]
      .map(
        (c, i) =>
          html`<div class="final-unit">
            <img id="r9final-${p}-${i}" src="${avatar(c.name, c.franchise)}" />
            <div>
              <b>${esc(c.name)}${game.captains[p] === c.id ? " 👑" : ""}</b
              ><small>${esc(c.role)} · ${esc(c.tier)}</small>
            </div>
          </div>`,
      )
      .join("");
    blocks.push(
      html`<div class="final-team-card">
        <div class="final-team-head">
          <b class="${p === 1 ? "p1c" : "p2c"}"
            >PLAYER ${p === 1 ? "ONE" : "TWO"}</b
          ><small>${game.teams[p].length}/${TEAM_SIZE}</small>
        </div>
        <div class="final-roster">${units}</div>
      </div>`,
    );
  }
  root.innerHTML = blocks.join("");
  for (const p of [1, 2])
    for (let i = 0; i < game.teams[p].length; i++) {
      const c = game.teams[p][i];
      resolveImage(c).then((src) => {
        const im = $(`#r9final-${p}-${i}`);
        if (im) im.src = src;
      });
    }
}

function replayBattle() {
  game.phase = "battle";
  battleState = { i: 0, timer: null, paused: false, nonce: 0, started: false };
  renderBattleIntro();
}

function requestRematch() {
  if (online.mode === "local") {
    const mode = game.mode,
      verse = clone(game.verse),
      allowed = clone(game.allowedVerses || Object.keys(VERSE_ROSTERS)),
      n = game.matchNo + 1;
    game = newGame(mode);
    game.matchNo = n;
    game.verse = verse;
    game.allowedVerses = allowed;
    beginConfiguredGame();
    return;
  }
  dispatch("rematch", { player: online.role });
}

function doRematch(p) {
  game.rematch[p] = !game.rematch[p];
  if (game.rematch[1] && game.rematch[2]) {
    const mode = game.mode,
      verse = clone(game.verse),
      allowed = clone(game.allowedVerses || Object.keys(VERSE_ROSTERS)),
      n = game.matchNo + 1;
    game = newGame(mode);
    game.matchNo = n;
    game.verse = verse;
    game.allowedVerses = allowed;
    beginConfiguredGame();
  } else {
    sync();
    toast(
      `P${p} ${game.rematch[p] ? "READY" : "WAITING"} · gleicher Duel Code`,
    );
    renderResult();
  }
}
