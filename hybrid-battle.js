/** Kurze Duelle mit verdeckten Karten, gemeinsamer Energie und erzähltem Ausgang.
 * Der Host berechnet Entscheidungen. Audio und Lesefortschritt bleiben pro Gerät lokal.
 */
const DUEL_CARDS = [
  {
    id: "strike",
    title: "Angriff",
    cost: 0,
    beats: "feint",
    detail: "Schlägt die Finte. Kostenlos – spare Energie für später.",
  },
  {
    id: "counter",
    title: "Konter",
    cost: 1,
    beats: "strike",
    detail: "Fängt Angriff und Finisher ab. Anfällig für Finten.",
  },
  {
    id: "feint",
    title: "Finte",
    cost: 1,
    beats: "counter",
    detail: "Lockt den Konter heraus. Verliert gegen direkten Druck.",
  },
  {
    id: "ultimate",
    title: "Finisher",
    cost: 3,
    beats: null,
    detail: "Einmal pro Match: großer Kraftschub. Ein Konter bremst ihn.",
  },
];

function duelTechnique(fighter, cardId) {
  const index = { strike: 0, counter: 1, feint: 3, ultimate: 2 }[cardId];
  return fighter.skillKit?.[index] || fighter.skillKit?.[0];
}

class HybridBattleDirector {
  constructor() {
    this.viewKey = "";
    this.audioKey = "";
    this.paused = false;
  }
  init() {
    if (game.hybrid) return game.hybrid;
    game.battleMode = "hybrid";
    game.hybrid = {
      round: 0,
      stage: "choose",
      scores: { 1: 0, 2: 0 },
      energy: { 1: 2, 2: 2 },
      ultimateUsed: { 1: false, 2: false },
      reviveSpent: { 1: false, 2: false },
      choices: { 1: null, 2: null },
      locked: { 1: false, 2: false },
      ready: { 1: false, 2: false },
      pickPlayer: 1,
      scenes: [],
      lineup: { 1: cbLineup(1), 2: cbLineup(2) },
      context: { moveUsage: {}, phraseUsage: {}, beat: 0, variant: game.seed },
    };
    return game.hybrid;
  }
  fighter(p) {
    return BY_ID.get(game.hybrid.lineup[p][game.hybrid.round]);
  }
  available(p, id) {
    const h = game.hybrid,
      c = DUEL_CARDS.find((c) => c.id === id);
    return (
      !!c && h.energy[p] >= c.cost && !(id === "ultimate" && h.ultimateUsed[p])
    );
  }
  choose(p, id) {
    const h = game.hybrid;
    if (
      !h ||
      h.stage !== "choose" ||
      h.locked[p] ||
      ![1, 2].includes(p) ||
      !this.available(p, id)
    )
      return false;
    if (online.mode === "local" && h.pickPlayer !== p) return false;
    h.choices[p] = id;
    h.locked[p] = true;
    if (h.locked[1] && h.locked[2]) this.resolve();
    else if (online.mode === "local") {
      h.pickPlayer = p === 1 ? 2 : 1;
      this.render();
      passScreen(h.pickPlayer, "Wähle deine Karte verdeckt.");
      return true;
    }
    sync();
    this.render();
    return true;
  }
  resolve() {
    const h = game.hybrid;
    if (h.stage !== "choose" || !h.locked[1] || !h.locked[2]) return;
    const a = this.fighter(1),
      b = this.fighter(2),
      c1 = DUEL_CARDS.find((c) => c.id === h.choices[1]),
      c2 = DUEL_CARDS.find((c) => c.id === h.choices[2]);
    const random = mulberry32(
      hash(`${game.seed}|${game.matchNo}|${h.round}|duel`),
    );
    const arena = ["Null Arena", "Megacity", "Fractured Multiverse"][
      h.round % 3
    ];
    const previousRng = rng;
    rng = random;
    const ev = event();
    rng = previousRng;
    const ctx = h.context;
    ctx.beat++;
    const A = duelScore(a, b, arena, ev, 1, ctx),
      B = duelScore(b, a, arena, ev, 2, ctx);
    let edge = 0;
    if (c1.beats === c2.id || (c1.id === "counter" && c2.id === "ultimate"))
      edge += 0.19;
    if (c2.beats === c1.id || (c2.id === "counter" && c1.id === "ultimate"))
      edge -= 0.19;
    if (c1.id === "ultimate" && c2.id !== "counter") edge += 0.23;
    if (c2.id === "ultimate" && c1.id !== "counter") edge -= 0.23;
    const chance = cbClamp(0.12, 0.88, A.score / (A.score + B.score) + edge);
    let wp = random() < chance ? 1 : 2,
      lp = wp === 1 ? 2 : 1,
      reviveText = "";
    // One comeback chance per team, only in a close duel. Consumed even if it fails.
    if (
      settings.revive &&
      !h.reviveSpent[lp] &&
      h.scores[lp] < h.scores[wp] &&
      Math.abs(chance - 0.5) < 0.2
    ) {
      h.reviveSpent[lp] = true;
      if (random() < 0.3) {
        [wp, lp] = [lp, wp];
        reviveText = `${(wp === 1 ? a : b).name} findet mit letzter Kraft zurück in den Kampf und dreht das Duell. Der einmalige Revive ist verbraucht. `;
      } else
        reviveText = `${(lp === 1 ? a : b).name} kämpft sich noch einmal hoch, doch auch der letzte Comeback-Versuch reicht nicht. `;
    }
    const winner = wp === 1 ? a : b,
      loser = lp === 1 ? a : b;
    const mA = duelTechnique(a, c1.id) || pickCombatMove(a, b, ctx),
      mB = duelTechnique(b, c2.id) || pickCombatMove(b, a, ctx),
      mA2 = pickCombatMove(a, b, ctx, [mA.id]),
      mB2 = pickCombatMove(b, a, ctx, [mB.id]);
    const w1 = pickCombatMove(winner, loser, ctx),
      w2 = pickCombatMove(winner, loser, ctx, [w1.id]),
      w3 = pickCombatMove(winner, loser, ctx, [w1.id, w2.id]),
      ld = pickCombatMove(loser, winner, ctx);
    const opening = `${a.name} setzt auf ${c1.title}, ${b.name} auf ${c2.title}. `;
    const full =
      opening +
      compactDuelNarrative(
        a,
        b,
        mA,
        mB,
        mA2,
        mB2,
        winner,
        loser,
        w1,
        w2,
        w3,
        ld,
        wp === 1 ? A.ctr : B.ctr,
        arena,
        ev.name,
        ctx,
      ) +
      "\n\n" +
      reviveText;
    // Short live narration; the full original narrative remains in the match report.
    const firstSentence = (text) =>
      (text.match(/[^.!?]+[.!?](?:\s|$)/g) || [text])
        .slice(0, 2)
        .join(" ")
        .trim();
    const short = cleanNarrationText(
      firstSentence(r9MoveBeat(a, b, mA, "openA", ctx)) +
        " " +
        firstSentence(r9MoveBeat(b, a, mB, "openB", ctx)) +
        " " +
        firstSentence(r9MoveBeat(winner, loser, w3, "fin3", ctx)) +
        " " +
        reviveText +
        ` ${winner.name} gewinnt. Punkt für Player ${wp === 1 ? "One" : "Two"}.`,
    );
    h.scenes.push({
      kind: "ko",
      title: `Duell ${h.round + 1} · ${a.name} vs ${b.name}`,
      arena,
      event: `${c1.title} gegen ${c2.title} · ${ev.name}`,
      attacker: winner,
      defender: loser,
      attackerP: wp,
      defenderP: lp,
      effect: effectFor(winner, w3),
      text: cleanNarrationText(full),
      shortText: short,
      moves: [mA.name, mB.name, w3.name],
    });
    h.scores[wp]++;
    for (const p of [1, 2]) {
      const c = p === 1 ? c1 : c2;
      h.energy[p] = Math.min(4, h.energy[p] - c.cost + 1 + (p === lp ? 1 : 0));
      if (c.id === "ultimate") h.ultimateUsed[p] = true;
    }
    h.stage = "story";
    h.ready = { 1: false, 2: false };
  }
  next(p) {
    const h = game.hybrid;
    if (!h || h.stage !== "story" || ![1, 2].includes(p)) return false;
    h.ready[p] = true;
    if (online.mode === "local" || (h.ready[1] && h.ready[2])) {
      const total = Math.min(7, h.lineup[1].length, h.lineup[2].length);
      if (Math.max(h.scores[1], h.scores[2]) >= 4 || h.round + 1 >= total) {
        this.finish();
        return true;
      }
      h.round++;
      h.stage = "choose";
      h.choices = { 1: null, 2: null };
      h.locked = { 1: false, 2: false };
      h.pickPlayer = 1;
    }
    sync();
    this.render();
    return true;
  }
  finish() {
    const h = game.hybrid,
      w = h.scores[1] > h.scores[2] ? 1 : 2;
    const winning = h.scenes
      .filter((s) => s.attackerP === w)
      .map((s) => s.attacker);
    const mvp =
      [...winning].sort((a, b) => impact(b) - impact(a))[0] || game.teams[w][0];
    game.result = {
      winner: w,
      wins1: h.scores[1],
      wins2: h.scores[2],
      rounds: h.scenes.map((s) => ({
        arena: s.arena,
        event: s.event,
        winner: s.attackerP,
      })),
      scenes: clone(h.scenes),
      mvp,
      reviveSpent: h.reviveSpent,
    };
    game.phase = "result";
    stopTTS();
    this.viewKey = "";
    sync();
    renderResult();
  }
  render() {
    const h = this.init(),
      viewer = online.mode === "local" ? h.pickPlayer : online.role;
    const key = `${game.seed}|${game.matchNo}|${h.round}|${h.stage}|${viewer}|${h.stage === "choose" ? JSON.stringify(h.locked) + !!Net.pendingAction + online.connected : ""}`;
    if (this.viewKey === key && $("#hybridBattle")) {
      this.updateReady();
      return;
    }
    this.viewKey = key;
    stopTTS();
    this.paused = false;
    const a = this.fighter(1),
      b = this.fighter(2),
      s = h.scenes[h.round];
    const story = h.stage === "story",
      score1 = h.scores[1],
      score2 = h.scores[2];
    app.innerHTML = html`<section
      id="hybridBattle"
      class="screen hybrid-battle"
    >
      <div class="phase">
        <div>
          <div class="kicker">
            DUELL ${h.round + 1} / 7 · VIER SIEGE ENTSCHEIDEN
          </div>
          <h1>${story ? "DER SCHLAGABTAUSCH" : "DEINE KARTE. DEIN MOMENT."}</h1>
        </div>
        <div class="hybrid-score">
          <span class="p1c">${score1}</span> :
          <span class="p2c">${score2}</span>
        </div>
      </div>
      <div class="hybrid-fighters">
        <article>
          <img id="hybridA" src="${avatar(a.name, a.franchise)}" />
          <h2>${esc(a.name)}</h2>
          <p>${esc(a.franchise)}</p>
        </article>
        <div class="hybrid-vs">VS</div>
        <article>
          <img id="hybridB" src="${avatar(b.name, b.franchise)}" />
          <h2>${esc(b.name)}</h2>
          <p>${esc(b.franchise)}</p>
        </article>
      </div>
      ${story
        ? html`<div class="hybrid-story">
              <div class="kicker">${esc(s.event)}</div>
              <p id="duelNarration">${esc(s.shortText)}</p>
              <details>
                <summary>Vollständige Kampfgeschichte lesen</summary>
                <p id="hybridFull" class="full-narrative">
                  ${esc(s.aiText || s.text)}
                </p>
                ${settings.aiStory
                  ? '<button class="btn secondary" onclick="hybridBattle.enrich()">OPTIONALE KI-LANGFASSUNG</button>'
                  : ""}<button
                  class="btn secondary"
                  onclick="hybridBattle.readFull()"
                >
                  LANGFASSUNG VORLESEN
                </button>
              </details>
            </div>
            <div class="actions">
              <button
                id="hybridVoice"
                class="btn secondary"
                onclick="hybridBattle.toggleVoice()"
              >
                ${settings.tts ? "ERZÄHLUNG PAUSIEREN" : "ERZÄHLUNG ANHÖREN"}</button
              ><button
                id="hybridContinue"
                class="btn gold"
                onclick="hybridContinue()"
              >
                ${Math.max(h.scores[1], h.scores[2]) >= 4 || h.round === 6
                  ? "ZUM ERGEBNIS"
                  : "NÄCHSTES DUELL"}
              </button>
            </div>
            <p id="hybridReady" role="status"></p>`
        : html`<div class="hybrid-hand-head">
              <h2>
                Player ${viewer === 1 ? "One" : "Two"} · ${h.energy[viewer]} / 4
                Energie
              </h2>
              <p>
                Angriff schlägt Finte · Finte schlägt Konter · Konter schlägt
                Angriff. Nach jedem Duell +1 Energie; nach einer Niederlage +1
                extra. Das erhöht deine Siegchance; Figurenstärke und Arena
                zählen ebenfalls.
              </p>
            </div>
            <div class="hybrid-hand">
              ${DUEL_CARDS.map(
                (c) =>
                  html`<button
                    class="hybrid-card ${c.id}"
                    ${h.locked[viewer] ||
                    !!Net.pendingAction ||
                    !this.available(viewer, c.id) ||
                    (online.mode !== "local" && !online.connected)
                      ? "disabled"
                      : ""}
                    onclick="hybridChoose('${c.id}')"
                  >
                    <small
                      >${c.cost}
                      ENERGIE${c.id === "ultimate" ? " · EINMALIG" : ""}</small
                    >
                    <h3>${c.title}</h3>
                    <strong
                      >${esc(
                        duelTechnique(viewer === 1 ? a : b, c.id)?.name ||
                          "Technik",
                      )}</strong
                    >
                    <p>${c.detail}</p>
                    ${h.ultimateUsed[viewer] && c.id === "ultimate"
                      ? "<b>BEREITS EINGESETZT</b>"
                      : ""}
                  </button>`,
              ).join("")}
            </div>
            <p role="status">
              ${h.locked[viewer]
                ? "Deine Karte liegt verdeckt. Warte auf den Gegner."
                : Net.pendingAction
                  ? "Deine Wahl wird übertragen…"
                  : "Eine Karte pro Duell. Die Gegenwahl bleibt bis zur Aufdeckung geheim."}
            </p>`}
    </section>`;
    for (const [p, c] of [
      ["A", a],
      ["B", b],
    ])
      resolveImage(c).then((src) => {
        const el = $("#hybrid" + p);
        if (el?.isConnected) el.src = src;
      });
    if (story) {
      this.audioKey = key;
      if (settings.tts)
        narrateBlock(s.shortText, () => {
          if (this.audioKey === key) {
            const btn = $("#hybridVoice");
            if (btn) btn.textContent = "ERZÄHLUNG NOCHMAL";
          }
        });
      this.updateReady();
    }
  }
  updateReady() {
    const h = game?.hybrid;
    if (h?.stage !== "story") return;
    const p = online.role || 1,
      btn = $("#hybridContinue"),
      hint = $("#hybridReady");
    if (btn)
      btn.disabled =
        online.mode !== "local" &&
        (h.ready[p] || !!Net.pendingAction || !online.connected);
    if (hint)
      hint.textContent =
        online.mode === "local"
          ? "Du kannst zuhören oder direkt weiterspielen."
          : h.ready[p]
            ? "Bereit – warte, bis dein Gegner seine Szene beendet hat."
            : "Weiter geht es, wenn beide bereit sind.";
  }
  toggleVoice() {
    const btn = $("#hybridVoice");
    if (this.paused) {
      speechSynthesis.resume();
      this.paused = false;
      btn.textContent = "ERZÄHLUNG PAUSIEREN";
    } else if (window.speechSynthesis?.speaking) {
      speechSynthesis.pause();
      this.paused = true;
      btn.textContent = "ERZÄHLUNG FORTSETZEN";
    } else {
      settings.tts = true;
      narrateBlock(game.hybrid.scenes[game.hybrid.round].shortText, () => {
        if (btn.isConnected) btn.textContent = "ERZÄHLUNG NOCHMAL";
      });
      btn.textContent = "ERZÄHLUNG PAUSIEREN";
    }
  }
  async enrich() {
    if (!window.puter?.auth?.isSignedIn?.())
      return toast(
        "Aktiviere Puter zuerst in den Einstellungen. Die lokale Geschichte bleibt verfügbar.",
      );
    const activeGame = game,
      scene = game.hybrid.scenes[game.hybrid.round];
    toast("Optionale KI-Langfassung wird erstellt. Du kannst weiterspielen.");
    const text = await getSceneNarration(
      scene,
      game.hybrid.round,
      battleState.nonce,
    );
    if (
      game === activeGame &&
      game.hybrid.scenes[game.hybrid.round] === scene
    ) {
      const el = $("#hybridFull");
      if (el) el.textContent = text;
    }
  }
  readFull() {
    settings.tts = true;
    this.paused = false;
    stopTTS();
    narrateBlock(
      game.hybrid.scenes[game.hybrid.round].aiText ||
        game.hybrid.scenes[game.hybrid.round].text,
      () => {
        const btn = $("#hybridVoice");
        if (btn) btn.textContent = "ERZÄHLUNG NOCHMAL";
      },
    );
  }
}
const hybridBattle = new HybridBattleDirector();
function hybridChoose(id) {
  const h = game.hybrid;
  dispatch("hybridChoose", {
    id,
    round: h.round,
    seed: game.seed,
    matchNo: game.matchNo,
  });
}
function hybridContinue() {
  stopTTS();
  const h = game.hybrid;
  dispatch("hybridNext", {
    round: h.round,
    seed: game.seed,
    matchNo: game.matchNo,
  });
}
function handleHybridAction(action, p, player) {
  if (
    !game?.hybrid ||
    game.phase !== "battle" ||
    (online.mode !== "local" && !online.connected) ||
    p.round !== game.hybrid.round ||
    p.seed !== game.seed ||
    p.matchNo !== game.matchNo
  )
    return false;
  return action === "hybridChoose"
    ? hybridBattle.choose(player, p.id)
    : hybridBattle.next(player);
}
