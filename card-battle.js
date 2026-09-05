/** card-battle.js — interaktiver Kartenkampf; cb steht für card battle */
const CARD_BATTLE_VERSION = 1;

function cbDeep(x) {
  return x == null ? x : JSON.parse(JSON.stringify(x));
}

function cbClamp(lo, hi, x) {
  return Math.max(lo, Math.min(hi, x));
}

function cbLineup(p) {
  const team = game.teams[p] || [],
    ids = (game.order?.[p] || []).filter((id) => team.some((c) => c.id === id));
  for (const c of team) if (!ids.includes(c.id)) ids.push(c.id);
  return ids;
}

function cbArena() {
  const a = ["Null Arena", "Megacity", "Fractured Multiverse"];
  return a[Math.abs(Number(game.seed) || 0) % a.length];
}

function cbInit() {
  if (game.cardBattle?.version === CARD_BATTLE_VERSION) return game.cardBattle;
  const l1 = cbLineup(1),
    l2 = cbLineup(2),
    mk = (n) => Array.from({ length: n }, () => 100),
    en = (n) => Array.from({ length: n }, () => 4),
    mo = (ids, p) => ids.map((id) => (game.captains?.[p] === id ? 1 : 0)),
    cd = (n) => Array.from({ length: n }, () => ({})),
    aw = (n) => Array.from({ length: n }, () => 0);
  game.cardBattle = {
    version: CARD_BATTLE_VERSION,
    arena: cbArena(),
    round: 1,
    lineup: { 1: l1, 2: l2 },
    idx: { 1: 0, 2: 0 },
    hp: { 1: mk(l1.length), 2: mk(l2.length) },
    energy: { 1: en(l1.length), 2: en(l2.length) },
    momentum: { 1: mo(l1, 1), 2: mo(l2, 2) },
    cooldowns: { 1: cd(l1.length), 2: cd(l2.length) },
    awakened: { 1: aw(l1.length), 2: aw(l2.length) },
    choice: { 1: null, 2: null },
    locked: { 1: false, 2: false },
    pickPlayer: 1,
    last: null,
    log: [],
    winner: null,
    damageDealt: { 1: 0, 2: 0 },
    damageByChar: {},
    reviveUsed: { 1: false, 2: false },
  };
  game.battleMode = "interactive";
  game.result = null;
  return game.cardBattle;
}

function cbFighter(p) {
  const b = game.cardBattle;
  if (!b) return null;
  const id = b.lineup[p]?.[b.idx[p]];
  return id ? BY_ID.get(id) || null : null;
}

function cbState(p) {
  const b = game.cardBattle,
    i = b.idx[p];
  return {
    hp: b.hp[p][i] || 0,
    energy: b.energy[p][i] || 0,
    momentum: b.momentum[p][i] || 0,
    awake: b.awakened[p][i] || 0,
    cd: b.cooldowns[p][i] || {},
  };
}

function cbTraitSkill(c, pred, fallbackIndex = 0) {
  const kit = c?.skillKit || [];
  return (
    kit.find(pred) ||
    kit[fallbackIndex] || {
      name: "Signature Technique",
      trait: "technique",
      bias: 9,
    }
  );
}

function cbCards(c, p) {
  const st = cbState(p),
    kit = c?.skillKit || [];
  const sig = kit[1] ||
    kit[0] || { name: "Signature Strike", trait: "physical", bias: 9 };
  const ult = [...kit].sort((a, b) => (b.bias || 0) - (a.bias || 0))[0] || sig;
  const guard = cbTraitSkill(
    c,
    (m) =>
      [
        "barrier",
        "infinity",
        "intangible",
        "regen",
        "armor",
        "sense",
        "speed",
      ].includes(m.trait),
    2,
  );
  const counter = cbTraitSkill(
    c,
    (m) =>
      /counter/i.test(m.name) ||
      [
        "counter",
        "return-zero",
        "full-counter",
        "vector",
        "anti-magic",
        "adaptation",
        "illusion",
        "time",
        "space",
      ].includes(m.trait),
    3,
  );
  const awakened = st.awake > 0;
  return [
    {
      id: "strike",
      name: kit[2]?.name || "Quick Strike",
      type: "attack",
      trait: kit[2]?.trait || "physical",
      cost: 0,
      power: 12,
      cd: 0,
      desc: "Zuverlässiger Angriff. Kein Cooldown.",
    },
    {
      id: "signature",
      name: sig.name,
      type: "attack",
      trait: sig.trait,
      cost: 2,
      power: 17 + (sig.bias || 9) * 0.35,
      cd: 1,
      desc: "2 Energie. Starker Skill; danach 1 Runde gesperrt.",
    },
    {
      id: "feint",
      name: "FINTE / GUARD BREAK",
      type: "feint",
      trait: "tactics",
      cost: 1,
      power: 10,
      cd: 0,
      desc: "Doppelter Schaden gegen Guard und Counter; ignoriert ihre Abwehr. Schwach gegen direkte Angriffe.",
    },
    {
      id: "guard",
      name: guard.name || "Guard / Dodge",
      type: "defense",
      trait: guard.trait || "barrier",
      cost: 0,
      power: 0,
      cd: 0,
      desc: "Blockt 66% Angriffsschaden, 45% Ultimate-Schaden. Bei Treffer +2 Momentum. Finte durchbricht Guard.",
    },
    {
      id: "counter",
      name: counter.name || "Tactical Counter",
      type: "counter",
      trait: counter.trait || "counter",
      cost: 1,
      power: 13 + (counter.bias || 9) * 0.25,
      cd: 0,
      desc: "Etwa 49% Konterchance bei gleichen Werten. Fehlschlag: +16% erlittener Schaden. Verliert gegen Finte; wirkungslos gegen Charge.",
    },
    {
      id: "charge",
      name: "Focus / Charge",
      type: "setup",
      trait: "focus",
      cost: 0,
      power: 0,
      cd: 0,
      desc: "+3 Energie, +2 Momentum. Wird von Angriffen hart bestraft.",
    },
    {
      id: "ultimate",
      name: (awakened ? "AWAKENED · " : "") + ult.name,
      type: "ultimate",
      trait: ult.trait,
      cost: awakened ? 3 : 4,
      power: 27 + (ult.bias || 10) * 0.55,
      cd: 2,
      needMomentum: 2,
      desc: "Benötigt 2 Momentum (bleibt erhalten). Danach 2 Runden gesperrt. Guard und Counter schwächen den Treffer.",
    },
    {
      id: "awaken",
      name: "AWAKEN / TRANSFORM",
      type: "awaken",
      trait: "awakening",
      cost: 0,
      power: 0,
      cd: 0,
      needMomentum: 5,
      desc: "Verbraucht 5 Momentum. 3 Runden +15% Output, Ultimate kostet weniger.",
    },
  ];
}

function cbAvailable(p, card) {
  const st = cbState(p);
  if (!card) return false;
  if (st.energy < card.cost) return false;
  if ((card.needMomentum || 0) > st.momentum) return false;
  if ((st.cd[card.id] || 0) > 0) return false;
  if (card.id === "awaken" && st.awake > 0) return false;
  return true;
}

function cbRand(salt = 0) {
  const b = game.cardBattle;
  let x =
    ((Number(game.seed) || 1) ^
      Math.imul(b.round + 17, 0x9e3779b1) ^
      Math.imul(salt + 3, 0x85ebca6b)) >>>
    0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function cbOffense(c, card) {
  const haxish = [
    "hax",
    "concept",
    "reality",
    "time",
    "space",
    "illusion",
    "domain",
    "return-zero",
    "vector",
    "anti-magic",
    "magic",
    "psychic",
    "absorb",
  ].includes(card.trait);
  const stat = haxish
    ? c.hax * 0.68 + c.power * 0.32
    : c.power * 0.72 + c.hax * 0.28;
  return card.power * (0.74 + stat / 255);
}

function cbDefense(c) {
  return 0.86 + (Number(c.durability) || 50) / 520;
}

function cbTraitMod(a, b) {
  if (!settings.counters) return 1;
  try {
    const s = traitCounter(a, b)?.score || 0;
    return cbClamp(0.84, 1.18, 1 + s * 0.014);
  } catch (_) {
    return 1;
  }
}

function cbTickCd(p) {
  const b = game.cardBattle,
    i = b.idx[p],
    o = b.cooldowns[p][i] || {};
  for (const k of Object.keys(o)) {
    o[k] = Math.max(0, (o[k] || 0) - 1);
    if (!o[k]) delete o[k];
  }
}

function cbSetCd(p, card) {
  if (!card.cd) return;
  game.cardBattle.cooldowns[p][game.cardBattle.idx[p]][card.id] = card.cd;
}

function cbCardById(p, id) {
  return cbCards(cbFighter(p), p).find((x) => x.id === id);
}

function cbEffectLabel(card) {
  return card.type === "feint"
    ? "FINTE"
    : card.type === "ultimate"
      ? "ULTIMATE"
      : card.type === "counter"
        ? "COUNTER"
        : card.type === "defense"
          ? "GUARD"
          : card.type === "setup"
            ? "CHARGE"
            : card.type === "awaken"
              ? "AWAKENING"
              : "ATTACK";
}

function cbResolve() {
  const b = game.cardBattle;
  if (!b || !b.locked[1] || !b.locked[2] || b.winner) return;
  const a = cbFighter(1),
    d = cbFighter(2),
    c1 = cbCardById(1, b.choice[1]),
    c2 = cbCardById(2, b.choice[2]);
  if (!a || !d || !c1 || !c2) return;
  const i1 = b.idx[1],
    i2 = b.idx[2],
    s1 = cbState(1),
    s2 = cbState(2);
  b.energy[1][i1] = Math.max(0, s1.energy - c1.cost);
  b.energy[2][i2] = Math.max(0, s2.energy - c2.cost);
  let dmgTo2 = ["attack", "ultimate", "feint"].includes(c1.type)
    ? (cbOffense(a, c1) / cbDefense(d)) * cbTraitMod(a, d)
    : 0;
  let dmgTo1 = ["attack", "ultimate", "feint"].includes(c2.type)
    ? (cbOffense(d, c2) / cbDefense(a)) * cbTraitMod(d, a)
    : 0;
  if (s1.awake > 0) dmgTo2 *= 1.15;
  if (s2.awake > 0) dmgTo1 *= 1.15;
  let notes = [],
    counter1 = false,
    counter2 = false,
    dodge1 = false,
    dodge2 = false;
  if (c1.type === "feint" && ["defense", "counter"].includes(c2.type)) {
    dmgTo2 *= 2;
    notes.push(
      `${a.name} täuscht einen Angriff an und durchbricht ${d.name}s Abwehr.`,
    );
  }
  if (c2.type === "feint" && ["defense", "counter"].includes(c1.type)) {
    dmgTo1 *= 2;
    notes.push(`${d.name} lockt ${a.name} in die Finte.`);
  }
  const roll1 = cbRand(1),
    roll2 = cbRand(2);
  if (c2.type === "defense" && c1.type !== "feint" && dmgTo2 > 0) {
    dmgTo2 *= c1.type === "ultimate" ? 0.55 : 0.34;
    b.momentum[2][i2] = Math.min(10, b.momentum[2][i2] + 2);
    notes.push(`${d.name} fängt den Angriff mit ${c2.name} ab.`);
  }
  if (c1.type === "defense" && c2.type !== "feint" && dmgTo1 > 0) {
    dmgTo1 *= c2.type === "ultimate" ? 0.55 : 0.34;
    b.momentum[1][i1] = Math.min(10, b.momentum[1][i1] + 2);
    notes.push(`${a.name} reduziert den Treffer mit ${c1.name}.`);
  }
  if (c2.type === "counter" && c1.type !== "feint" && dmgTo2 > 0) {
    const chance = cbClamp(
      0.24,
      c1.type === "ultimate" ? 0.62 : 0.8,
      0.49 + (d.hax + d.speed - (a.hax + a.speed)) / 430,
    );
    if (roll2 < chance) {
      counter2 = true;
      dmgTo2 *= c1.type === "ultimate" ? 0.48 : 0.16;
      dmgTo1 += (cbOffense(d, c2) / cbDefense(a)) * 0.78;
      b.momentum[2][i2] = Math.min(10, b.momentum[2][i2] + 2);
      notes.push(`${d.name} liest ${c1.name} und landet den Counter.`);
    } else {
      dmgTo2 *= 1.16;
      notes.push(`${d.name}s Counter-Fenster ist zu spät.`);
    }
  }
  if (c1.type === "counter" && c2.type !== "feint" && dmgTo1 > 0) {
    const chance = cbClamp(
      0.24,
      c2.type === "ultimate" ? 0.62 : 0.8,
      0.49 + (a.hax + a.speed - (d.hax + d.speed)) / 430,
    );
    if (roll1 < chance) {
      counter1 = true;
      dmgTo1 *= c2.type === "ultimate" ? 0.48 : 0.16;
      dmgTo2 += (cbOffense(a, c1) / cbDefense(d)) * 0.78;
      b.momentum[1][i1] = Math.min(10, b.momentum[1][i1] + 2);
      notes.push(`${a.name} kontert ${c2.name} im Commit.`);
    } else {
      dmgTo1 *= 1.16;
      notes.push(`${a.name}s Counter wird gebaitet.`);
    }
  }
  if (c1.type === "setup") {
    b.energy[1][i1] = Math.min(8, b.energy[1][i1] + 3);
    b.momentum[1][i1] = Math.min(10, b.momentum[1][i1] + 2);
    if (dmgTo1 > 0) dmgTo1 *= 1.22;
    notes.push(`${a.name} lädt Ressourcen statt direkt anzugreifen.`);
  }
  if (c2.type === "setup") {
    b.energy[2][i2] = Math.min(8, b.energy[2][i2] + 3);
    b.momentum[2][i2] = Math.min(10, b.momentum[2][i2] + 2);
    if (dmgTo2 > 0) dmgTo2 *= 1.22;
    notes.push(`${d.name} nimmt sich einen Zug zum Aufladen.`);
  }
  if (c1.type === "awaken") {
    b.momentum[1][i1] = Math.max(0, b.momentum[1][i1] - 5);
    b.awakened[1][i1] = 3;
    if (dmgTo1 > 0) dmgTo1 *= 1.12;
    notes.push(
      `${a.name} entfesselt eine Transformation — aber der Aktivierungszug ist verwundbar.`,
    );
  }
  if (c2.type === "awaken") {
    b.momentum[2][i2] = Math.max(0, b.momentum[2][i2] - 5);
    b.awakened[2][i2] = 3;
    if (dmgTo2 > 0) dmgTo2 *= 1.12;
    notes.push(
      `${d.name} geht ins Awakening und riskiert dafür einen offenen Moment.`,
    );
  }
  if (dmgTo2 > 0 && !["defense", "counter"].includes(c2.type)) {
    const dodge = cbClamp(0.015, 0.12, 0.035 + (d.speed - a.speed) / 520);
    if (roll2 < dodge) {
      dodge2 = true;
      dmgTo2 *= 0.22;
      b.momentum[2][i2] = Math.min(10, b.momentum[2][i2] + 1);
      notes.push(`${d.name} dodged im letzten Frame.`);
    }
  }
  if (dmgTo1 > 0 && !["defense", "counter"].includes(c1.type)) {
    const dodge = cbClamp(0.015, 0.12, 0.035 + (a.speed - d.speed) / 520);
    if (roll1 < dodge) {
      dodge1 = true;
      dmgTo1 *= 0.22;
      b.momentum[1][i1] = Math.min(10, b.momentum[1][i1] + 1);
      notes.push(`${a.name} entkommt dem Haupttreffer.`);
    }
  }
  dmgTo1 = Math.max(0, Math.round(dmgTo1));
  dmgTo2 = Math.max(0, Math.round(dmgTo2));
  b.hp[1][i1] = Math.max(0, b.hp[1][i1] - dmgTo1);
  b.hp[2][i2] = Math.max(0, b.hp[2][i2] - dmgTo2);
  b.damageDealt[1] += dmgTo2;
  b.damageDealt[2] += dmgTo1;
  b.damageByChar[a.id] = (b.damageByChar[a.id] || 0) + dmgTo2;
  b.damageByChar[d.id] = (b.damageByChar[d.id] || 0) + dmgTo1;
  if (dmgTo2 >= 15) b.momentum[1][i1] = Math.min(10, b.momentum[1][i1] + 1);
  if (dmgTo1 >= 15) b.momentum[2][i2] = Math.min(10, b.momentum[2][i2] + 1);
  if (b.hp[1][i1] <= 35)
    b.momentum[1][i1] = Math.min(10, b.momentum[1][i1] + 1);
  if (b.hp[2][i2] <= 35)
    b.momentum[2][i2] = Math.min(10, b.momentum[2][i2] + 1);
  b.energy[1][i1] = Math.min(8, b.energy[1][i1] + 1);
  b.energy[2][i2] = Math.min(8, b.energy[2][i2] + 1);
  cbTickCd(1);
  cbTickCd(2);
  cbSetCd(1, c1);
  cbSetCd(2, c2);
  if (c1.id !== "awaken" && b.awakened[1][i1] > 0) b.awakened[1][i1]--;
  if (c2.id !== "awaken" && b.awakened[2][i2] > 0) b.awakened[2][i2]--;
  const ko = [],
    preIds = { 1: a.id, 2: d.id };
  let extra = "";
  const handleKo = (p) => {
    const i = b.idx[p],
      fighter = p === 1 ? a : d;
    if (b.hp[p][i] > 0) return false;
    const final = i >= b.lineup[p].length - 1;
    if (
      final &&
      settings.revive &&
      game.tokens?.[p]?.revive &&
      !b.reviveUsed[p]
    ) {
      b.reviveUsed[p] = true;
      b.hp[p][i] = 28;
      b.momentum[p][i] = Math.min(10, b.momentum[p][i] + 3);
      extra += ` ${fighter.name} aktiviert den einmaligen Revive und steht mit 28 HP wieder auf.`;
      return false;
    }
    ko.push({ player: p, id: fighter.id });
    b.idx[p]++;
    return true;
  };
  handleKo(1);
  handleKo(2);
  const p1Dead = b.idx[1] >= b.lineup[1].length,
    p2Dead = b.idx[2] >= b.lineup[2].length;
  if (p1Dead || p2Dead) {
    if (p1Dead && p2Dead)
      b.winner =
        b.damageDealt[1] === b.damageDealt[2]
          ? cbRand() < 0.5
            ? 1
            : 2
          : b.damageDealt[1] > b.damageDealt[2]
            ? 1
            : 2;
    else b.winner = p1Dead ? 2 : 1;
  }
  const parts = [
    `P1 ${a.name}: ${c1.name} [${cbEffectLabel(c1)}]`,
    `P2 ${d.name}: ${c2.name} [${cbEffectLabel(c2)}]`,
    `${a.name} nimmt ${dmgTo1} Schaden, ${d.name} nimmt ${dmgTo2} Schaden.`,
  ];
  if (counter1 || counter2) parts.push("Ein Counter dreht den Austausch.");
  if (dodge1 || dodge2)
    parts.push("Ein Last-Frame-Dodge verhindert den vollen Treffer.");
  const text =
    parts.join(" ") +
    (notes.length ? " " + notes.join(" ") : "") +
    extra +
    (ko.length
      ? " " +
        ko
          .map((x) => `${BY_ID.get(x.id)?.name || "Fighter"} wird eliminiert.`)
          .join(" ")
      : "");
  b.last = {
    round: b.round,
    aId: preIds[1],
    bId: preIds[2],
    aCard: c1.name,
    bCard: c2.name,
    aType: c1.type,
    bType: c2.type,
    dmgTo1,
    dmgTo2,
    text,
    ko,
  };
  b.log.push(cbDeep(b.last));
  b.choice = { 1: null, 2: null };
  b.locked = { 1: false, 2: false };
  b.pickPlayer = 1;
  b.round++;
  if (b.winner) cbFinish();
}

function cbFinish() {
  const b = game.cardBattle,
    w = b.winner;
  if (!w) return;
  const scenes = [];
  for (const x of b.log) {
    const a = BY_ID.get(x.aId),
      d = BY_ID.get(x.bId);
    const lead = x.dmgTo2 >= x.dmgTo1 ? 1 : 2;
    scenes.push({
      kind: "exchange",
      title: `TURN ${x.round} · ${x.aCard} VS ${x.bCard}`,
      arena: b.arena,
      event: "Interactive Card Battle",
      attacker: lead === 1 ? a : d,
      defender: lead === 1 ? d : a,
      attackerP: lead,
      defenderP: lead === 1 ? 2 : 1,
      effect: "shatter",
      moves: [x.aCard, x.bCard],
      text: x.text,
    });
    for (const k of x.ko || []) {
      const loser = BY_ID.get(k.id),
        kp = k.player === 1 ? 2 : 1,
        winChar = k.player === 1 ? d : a;
      scenes.push({
        kind: "ko",
        title: `ELIMINATION · ${loser?.name || "Fighter"}`,
        arena: b.arena,
        event: "Card Battle KO",
        attacker: winChar,
        defender: loser,
        attackerP: kp,
        defenderP: k.player,
        effect: "shatter",
        moves: [kp === 1 ? x.aCard : x.bCard],
        text: `${x.text} ${winChar?.name || "Der Gegner"} sichert die Eliminierung gegen ${loser?.name || "den Fighter"}.`,
      });
    }
  }
  const topId = Object.entries(b.damageByChar).sort(
      (x, y) => y[1] - x[1],
    )[0]?.[0],
    mvp = BY_ID.get(topId) || game.teams[w][0];
  const edge = Math.abs(teamImpact(1) - teamImpact(2));
  game.result = {
    winner: w,
    wins1: w === 1 ? 1 : 0,
    wins2: w === 2 ? 1 : 0,
    rounds: [
      {
        arena: b.arena,
        event: `${b.log.length} Card Turns · Interactive`,
        winner: w,
      },
    ],
    scenes,
    mvp,
    prob: Math.round(50 + Math.min(25, edge * 0.7)),
    reviveSpent: { 1: b.reviveUsed[1], 2: b.reviveUsed[2] },
  };
  game.phase = "result";
  sync();
  renderResult();
}

function cbChoose(p, id) {
  if (!game || game.phase !== "battle" || ![1, 2].includes(p)) return false;
  const b = cbInit();
  if (b.winner || b.locked[p] || (online.mode !== "local" && !online.connected))
    return false;
  if (online.mode === "local" && b.pickPlayer !== p) return false;
  const c = cbCardById(p, id);
  if (!cbAvailable(p, c)) {
    toast("Diese Karte ist gerade nicht verfügbar.");
    return false;
  }
  b.choice[p] = id;
  b.locked[p] = true;
  const bothLocked = b.locked[1] && b.locked[2];
  if (bothLocked) {
    cbResolve();
    // Critical online path: when the host locks SECOND, cbResolve() clears both locks.
    // Therefore the resolved turn must be pushed explicitly instead of relying on lock state afterwards.
    if (!b.winner && game.phase === "battle") {
      sync();
      renderCardBattle();
      if (online.mode === "local")
        setTimeout(
          () => passScreen(1, "Nächste Runde: Kampfkarte verdeckt auswählen"),
          0,
        );
    }
    return true;
  }
  if (online.mode === "local") {
    b.pickPlayer = p === 1 ? 2 : 1;
    renderCardBattle();
    setTimeout(
      () => passScreen(b.pickPlayer, "Kampfkarte verdeckt auswählen"),
      0,
    );
  } else {
    sync();
    renderCardBattle();
  }
  return true;
}

function cbStartAuto() {
  if (online.mode === "guest")
    return toast("Player One entscheidet den Battle-Modus.");
  if (
    game?.cardBattle?.round > 1 ||
    game?.cardBattle?.locked[1] ||
    game?.cardBattle?.locked[2]
  )
    return toast(
      "Der Kartenkampf läuft bereits. Auto-Fight ist nur vor der ersten Kartenwahl verfügbar.",
    );
  game.cardBattle = null;
  game.battleMode = "auto";
  game.result = simulateMatch();
  sync();
  renderBattleIntro();
}

function cbPct(x) {
  return cbClamp(0, 100, Math.round(x));
}

function cbFighterHTML(p, viewer) {
  const b = game.cardBattle,
    c = cbFighter(p),
    st = cbState(p),
    idx = b.idx[p],
    alive = b.lineup[p].map((id, i) => i >= idx && b.hp[p][i] > 0);
  if (!c)
    return html`<div class="cb-fighter">
      <div class="cb-fighter-copy"><b>TEAM BESIEGT</b></div>
    </div>`;
  const hp = cbPct(st.hp),
    en = cbPct((st.energy / 8) * 100),
    mo = cbPct((st.momentum / 10) * 100);
  return html`<div
    class="cb-fighter ${viewer === p ? "active-turn" : ""}"
    id="cbfighter${p}"
  >
    <div class="cb-fighter-top">
      <img id="cbimg${p}" src="${avatar(c.name, c.franchise)}" />
      <div class="cb-fighter-copy">
        <small
          >PLAYER ${p === 1 ? "ONE" : "TWO"} · FIGHTER
          ${idx + 1}/${b.lineup[p].length}</small
        ><b>${esc(c.name)}</b
        ><small>${esc(c.franchise)} · ${c.tier} · ${esc(c.role)}</small>
        <div class="cb-resource">
          <span class="cb-chip">⚡ ${st.energy}/8</span
          ><span class="cb-chip">🔥 ${st.momentum}/10</span>${st.awake
            ? html`<span class="cb-chip">✨ AWAKEN ${st.awake}</span>`
            : ""}
        </div>
        <div class="cb-teamdots">
          ${alive
            .map(
              (x, i) =>
                html`<i
                  class="${x ? "alive" : ""} ${i === idx ? "current" : ""}"
                ></i>`,
            )
            .join("")}
        </div>
      </div>
    </div>
    <div class="cb-bars">
      <div class="cb-barline">
        <span>HP</span>
        <div class="cb-track">
          <div
            class="cb-fill"
            style="width:${hp}%;--series:${p === 1 ? "var(--p1)" : "var(--p2)"}"
          ></div>
        </div>
        <b>${Math.max(0, Math.round(st.hp))}</b>
      </div>
      <div class="cb-barline">
        <span>ENERGY</span>
        <div class="cb-track">
          <div class="cb-fill" style="width:${en}%"></div>
        </div>
        <b>${st.energy}</b>
      </div>
      <div class="cb-barline">
        <span>MOMENTUM</span>
        <div class="cb-track">
          <div class="cb-fill" style="width:${mo}%"></div>
        </div>
        <b>${st.momentum}</b>
      </div>
    </div>
  </div>`;
}

function cbCardHTML(card, p, disabled) {
  const st = cbState(p),
    cd = st.cd[card.id] || 0,
    reason = cd
      ? `CD ${cd}`
      : st.energy < card.cost
        ? "ZU WENIG ⚡"
        : st.momentum < (card.needMomentum || 0)
          ? `BRAUCHT 🔥 ${card.needMomentum}`
          : card.id === "awaken" && st.awake > 0
            ? "BEREITS AKTIV"
            : "";
  return html`<button
    class="cb-card ${card.type}"
    ${disabled || reason ? "disabled" : ""}
    onclick="dispatch('battleMove',{cardId:'${card.id}'})"
  >
    <span class="type">${cbEffectLabel(card)} · ${esc(card.trait)}</span
    ><b>${esc(card.name)}</b>
    <p>${esc(card.desc)}${reason ? ` · ${esc(reason)}` : ""}</p>
    <span class="cost">${card.cost ? `⚡ ${card.cost}` : "FREE"}</span>
  </button>`;
}

function renderCardBattle() {
  const b = cbInit();
  if (b.winner || game.phase === "result") return renderResult();
  const viewer = online.mode === "local" ? b.pickPlayer : online.role,
    c = cbFighter(viewer),
    pending = online.mode === "guest" && !!Net.pendingAction,
    locked = !!b.locked[viewer],
    cards = c ? cbCards(c, viewer) : [];
  const opp = viewer === 1 ? 2 : 1,
    canPlay =
      !pending &&
      !locked &&
      (online.mode === "local" || online.connected) &&
      (online.mode !== "local" || b.pickPlayer === viewer);
  app.innerHTML = html`<section class="screen cardbattle-shell">
    <div class="cb-head">
      <div>
        <div class="kicker">V${VERSION} · INTERACTIVE CARD BATTLE</div>
        <h1>LIVE DUEL</h1>
        <div class="cb-arena">${esc(b.arena)} · TURN ${b.round}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${online.mode === "local"
          ? ""
          : html`<span class="pill ${online.connected ? "on" : "warn"}"
              >${online.connected
                ? "● ONLINE · " + netTransportLabel()
                : "◌ RECONNECTING · " + netTransportLabel()}</span
            >`}<span class="cb-round-badge"
          >${online.mode === "local"
            ? `PLAYER ${viewer === 1 ? "ONE" : "TWO"} WÄHLT`
            : `DU BIST PLAYER ${viewer === 1 ? "ONE" : "TWO"}`}</span
        >
      </div>
    </div>
    <div class="cb-fighters">
      ${cbFighterHTML(1, viewer)}
      <div class="cb-vs">VS</div>
      ${cbFighterHTML(2, viewer)}
    </div>
    <div class="cb-last">
      <b>${b.last ? `TURN ${b.last.round} RESOLVED` : "KAMPF BEREIT"}</b>
      <p>
        ${b.last
          ? esc(b.last.text)
          : "Beide Spieler wählen verdeckt eine Karte. Erst wenn beide gelockt haben, wird der Austausch gleichzeitig aufgelöst."}
      </p>
    </div>
    <div class="cb-hand-wrap">
      <div class="cb-hand-head">
        <div>
          <b>${esc(c?.name || "—")} · DEIN DECK</b>
          <div class="cb-ruleline">
            Angriff schlägt Charge · Guard bremst Angriff · Finte schlägt
            Guard/Counter. Pro Runde +1 Energie. Beide Karten werden
            gleichzeitig aufgedeckt.
          </div>
        </div>
        <div class="cb-lock">
          ${pending
            ? "AKTION WIRD SYNCHRONISIERT…"
            : locked
              ? "DEINE KARTE IST VERDECKT GELOCKT"
              : b.locked[opp]
                ? "GEGNER HAT GELOCKT · DU BIST DRAN"
                : "BEIDE WÄHLEN VERDECKT"}
        </div>
      </div>
      <div class="cb-hand">
        ${cards.map((x) => cbCardHTML(x, viewer, !canPlay)).join("")}
      </div>
    </div>
    ${b.log.length
      ? `<details class="cb-last"><summary style="cursor:pointer;font-size:1rem;font-weight:700">Letzte ${Math.min(6, b.log.length)} Runden ansehen</summary>${b.log
          .slice(-6)
          .reverse()
          .map(
            (x) =>
              html`<p>
                <b>Runde ${x.round}</b> · ${esc(x.aCard)} gegen
                ${esc(x.bCard)}<br />P1 erleidet ${x.dmgTo1} Schaden · P2
                erleidet ${x.dmgTo2} Schaden
              </p>`,
          )
          .join("")}</details>`
      : ""}
    <div class="cb-actions">
      <button class="btn secondary" onclick="rules()">? KARTENREGELN</button
      >${online.mode !== "guest" &&
      b.round === 1 &&
      !b.locked[1] &&
      !b.locked[2]
        ? html`<button class="btn secondary" onclick="cbStartAuto()">
            🎬 AUTO-FIGHT / CINEMATIC
          </button>`
        : ""}
    </div>
  </section>`;
  for (const p of [1, 2]) {
    const c2 = cbFighter(p);
    if (c2)
      resolveImage(c2).then((src) => {
        const el = $("#cbimg" + p);
        if (el?.isConnected) el.src = src;
      });
  }
}

function packGameState(forGuest = false) {
  const s = packDraftState(forGuest);
  s.battleMode = game?.battleMode || null;
  s.cardBattle = cbDeep(game?.cardBattle || null);
  if (forGuest && s.cardBattle) {
    s.cardBattle.choice = { 1: null, 2: null };
  }
  s.hybrid = game?.hybrid
    ? { ...cbDeep(game.hybrid), scenes: game.hybrid.scenes.map(packScene) }
    : null;
  if (forGuest && s.hybrid) {
    s.hybrid.choices = { 1: null, 2: null };
    s.hybrid.context = null;
  }
  return s;
}

function unpackGameState(s) {
  const g = unpackDraftState(s);
  g.battleMode = s?.battleMode || null;
  g.cardBattle = cbDeep(s?.cardBattle || null);
  g.hybrid = s?.hybrid
    ? { ...cbDeep(s.hybrid), scenes: s.hybrid.scenes.map(unpackScene) }
    : null;
  return g;
}

function handleGuestAction(a, p = {}) {
  if (a === "hybridChoose" || a === "hybridNext")
    return handleHybridAction(a, p, 2);
  if (a === "battleMove") {
    if (
      !game ||
      game.phase !== "battle" ||
      p.round !== game.cardBattle?.round ||
      p.seed !== game.seed ||
      p.matchNo !== game.matchNo
    )
      return false;
    return cbChoose(2, p.cardId);
  }
  return handleDraftGuestAction(a, p);
}

function handleAction(a, p = {}) {
  if (a === "hybridChoose" || a === "hybridNext")
    return handleHybridAction(
      a,
      p,
      online.mode === "local" ? game.hybrid?.pickPlayer : online.role,
    );
  if (a === "battleMove") {
    const who =
      online.mode === "local"
        ? game.cardBattle?.pickPlayer || 1
        : online.role || 1;
    return cbChoose(who, p.cardId);
  }
  return handleDraftAction(a, p);
}

function startBattle() {
  game.phase = "battle";
  if (game.result) return renderBattleIntro();
  if (
    game.battleMode === "auto" ||
    (!game.hybrid && settings.battleFormat === "auto")
  ) {
    game.result = simulateMatch();
    sync();
    return renderBattleIntro();
  }
  if (game.cardBattle) {
    renderCardBattle();
    return;
  }
  const fresh = !game.hybrid;
  hybridBattle.init();
  if (fresh) sync();
  hybridBattle.render();
}
