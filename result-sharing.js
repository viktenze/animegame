/** Teilbares Ergebnis: Score und Teams im PNG und als eigenständiger Ergebnis-Link. */
function resultSnapshot() {
  const r = game.result;
  return {
    v: 1,
    winner: r.winner,
    wins1: r.wins1,
    wins2: r.wins2,
    mvp: r.mvp.id,
    teams: [game.teams[1].map((c) => c.id), game.teams[2].map((c) => c.id)],
  };
}
function snapshotLink(snapshot) {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  const encoded = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  const base =
    location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? RELAY_URL + "/"
      : location.origin + location.pathname;
  return base + "#result=" + encoded;
}
function parseResultLink(hashValue) {
  const match = hashValue.match(/^#result=([\w-]{1,8000})$/);
  if (!match) return null;
  try {
    const bytes = Uint8Array.from(
      atob(match[1].replaceAll("-", "+").replaceAll("_", "/")),
      (c) => c.charCodeAt(0),
    );
    const s = JSON.parse(new TextDecoder().decode(bytes));
    if (
      s.v !== 1 ||
      ![1, 2].includes(s.winner) ||
      ![s.wins1, s.wins2].every(
        (x) => Number.isInteger(x) && x >= 0 && x <= 30,
      ) ||
      s.wins1 === s.wins2 ||
      s.winner !== (s.wins1 > s.wins2 ? 1 : 2) ||
      !BY_ID.has(s.mvp) ||
      !Array.isArray(s.teams) ||
      s.teams.length !== 2 ||
      !s.teams.every(
        (t) =>
          Array.isArray(t) &&
          t.length > 0 &&
          t.length <= 7 &&
          t.every((id) => BY_ID.has(id)),
      )
    )
      return null;
    return s;
  } catch {
    return null;
  }
}
function resultCaption(s) {
  return `ANIME VERSUS GAME · ${s.wins1}:${s.wins2} · Player ${s.winner === 1 ? "One" : "Two"} gewinnt · MVP: ${BY_ID.get(s.mvp)?.name || "—"}`;
}
function createResultCanvas(s) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1000;
  const ctx = canvas.getContext("2d"),
    g = ctx.createLinearGradient(0, 0, 1200, 1000);
  g.addColorStop(0, "#101a34");
  g.addColorStop(1, "#090916");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1200, 1000);
  function text(value, x, y, size, color = "#f5f7ff", align = "left") {
    ctx.font = `700 ${size}px Arial`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  }
  function fit(value, x, y, width, color, size = 26) {
    while (size > 12) {
      ctx.font = `700 ${size}px Arial`;
      if (ctx.measureText(value).width <= width) break;
      size--;
    }
    text(value, x, y, size, color);
  }
  text("ANIME VERSUS GAME", 600, 75, 30, "#eef2ff", "center");
  text("MATCH ERGEBNIS", 600, 121, 16, "#a9b7d6", "center");
  text(`${s.wins1} : ${s.wins2}`, 600, 280, 128, "#ffffff", "center");
  text(
    `PLAYER ${s.winner === 1 ? "ONE" : "TWO"} GEWINNT`,
    600,
    345,
    32,
    s.winner === 1 ? "#5fe7ff" : "#ff5c98",
    "center",
  );
  fit("MVP · " + BY_ID.get(s.mvp).name, 90, 412, 1020, "#ffd86b", 28);
  for (const p of [0, 1]) {
    const x = p === 0 ? 80 : 660,
      color = p === 0 ? "#5fe7ff" : "#ff5c98";
    text("PLAYER " + (p === 0 ? "ONE" : "TWO"), x, 489, 22, color);
    s.teams[p].forEach((id, i) => {
      const c = BY_ID.get(id);
      fit(`${i + 1}. ${c.name}`, x, 539 + i * 53, 470, "#eef2ff", 24);
      fit(c.franchise, x + 26, 558 + i * 53, 440, "#a0abc5", 15);
    });
  }
  text(
    "7v7 · Kartenentscheidungen & erzählte Duelle",
    600,
    965,
    18,
    "#a9b7d6",
    "center",
  );
  return canvas;
}
const ResultShare = {
  snapshot: null,
  blob: null,
  url: null,
  pending: null,
  prepare(s) {
    const key = JSON.stringify(s);
    if (this.key === key && this.pending) return this.pending;
    this.key = key;
    this.snapshot = s;
    this.blob = null;
    if (this.url) URL.revokeObjectURL(this.url);
    const canvas = createResultCanvas(s);
    this.pending = new Promise((resolve, reject) =>
      canvas.toBlob((blob) => {
        if (!blob)
          return reject(
            new Error("Ergebnisbild konnte nicht erstellt werden."),
          );
        if (this.key === key) {
          this.blob = blob;
          this.url = URL.createObjectURL(blob);
        }
        resolve(blob);
      }, "image/png"),
    );
    return this.pending;
  },
  async open(s) {
    try {
      await this.prepare(s);
      modal(
        html`<button class="x" onclick="closeModal()">×</button>
          <h2>Dein Ergebnis teilen</h2>
          <img
            class="share-preview"
            src="${this.url}"
            alt="${esc(resultCaption(s))}"
          />
          <div class="modal-actions">
            <button class="btn gold" onclick="ResultShare.send()">
              BILD TEILEN</button
            ><a
              class="btn secondary"
              href="${this.url}"
              download="anime-versus-${s.wins1}-${s.wins2}.png"
              >BILD SPEICHERN</a
            ><button class="btn secondary" onclick="ResultShare.copyLink()">
              ERGEBNISLINK KOPIEREN
            </button>
          </div>`,
      );
    } catch (e) {
      toast(e.message);
    }
  },
  async send() {
    if (!this.blob) return;
    const file = new File([this.blob], "anime-versus-ergebnis.png", {
        type: "image/png",
      }),
      s = this.snapshot;
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: "Anime Versus Game – Ergebnis",
          text: resultCaption(s) + "\n" + snapshotLink(s),
        });
      } catch (e) {
        if (e.name !== "AbortError")
          toast(
            "Teilen hier nicht verfügbar. Speichere das Bild oder kopiere den Ergebnislink.",
          );
      }
    } else
      toast(
        "Dieser Browser kann keine Bilder direkt teilen. Nutze „Bild speichern“ oder den Ergebnislink.",
      );
  },
  async copyLink() {
    const text =
      resultCaption(this.snapshot) + "\n" + snapshotLink(this.snapshot);
    try {
      await navigator.clipboard.writeText(text);
      toast("Score und Ergebnislink kopiert.");
    } catch {
      modal(
        html`<button class="x" onclick="closeModal()">×</button>
          <h2>Ergebnis kopieren</h2>
          <textarea readonly class="share-text" onclick="this.select()">
${esc(text)}</textarea
          >`,
      );
    }
  },
};
function shareResult() {
  if (game?.result) ResultShare.open(resultSnapshot());
}
function openSharedResult() {
  const s = parseResultLink(location.hash);
  if (!s) return false;
  app.innerHTML = html`<section class="screen shared-result">
    <div class="kicker">GETEILTES MATCH-ERGEBNIS</div>
    <h1>PLAYER ${s.winner === 1 ? "ONE" : "TWO"} GEWINNT</h1>
    <div class="hybrid-score">${s.wins1} : ${s.wins2}</div>
    <p>MVP: <b>${esc(BY_ID.get(s.mvp).name)}</b></p>
    <div class="shared-teams">
      ${s.teams
        .map(
          (team, p) =>
            html`<article>
              <h2>Player ${p === 0 ? "One" : "Two"}</h2>
              <ol>
                ${team
                  .map(
                    (id) =>
                      html`<li>
                        ${esc(BY_ID.get(id).name)}
                        <small>${esc(BY_ID.get(id).franchise)}</small>
                      </li>`,
                  )
                  .join("")}
              </ol>
            </article>`,
        )
        .join("")}
    </div>
    <p>Geteilter Ergebnisstand – kein laufender Room.</p>
    <button class="btn" onclick="Net.clearUrl();home()">
      EIGENES MATCH SPIELEN
    </button>
  </section>`;
  return true;
}
