import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
function fixture() {
  const memory = new Map(),
    el = { innerHTML: "", classList: { add() {}, remove() {} }, style: {} };
  const c = vm.createContext({
    console,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    atob,
    btoa,
    crypto,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    location: {
      hostname: "localhost",
      origin: "http://localhost:4173",
      pathname: "/",
      hash: "",
    },
    navigator: {},
    document: {
      querySelector: () => el,
      querySelectorAll: () => [],
      addEventListener() {},
    },
    localStorage: {
      getItem: (k) => memory.get(k) || null,
      setItem: (k, v) => memory.set(k, v),
    },
    sessionStorage: { getItem: () => null, setItem() {} },
  });
  c.window = c;
  c.addEventListener = () => {};
  const files = JSON.parse(
    fs.readFileSync("src/client-files.json", "utf8"),
  ).filter((f) => !f.endsWith("bootstrap.js"));
  vm.runInContext(files.map((f) => fs.readFileSync(f, "utf8")).join("\n"), c);
  vm.runInContext(
    `sync=()=>{};passScreen=()=>{};renderResult=()=>{};hybridBattle.render=()=>{};
 settings.tts=false;game=newGame();game.seed=42;game.phase='battle';game.teams={1:CHARACTERS.slice(0,7),2:CHARACTERS.slice(18,25)};hybridBattle.init();`,
    c,
  );
  return { c, run: (s) => vm.runInContext(s, c) };
}
test("Hybrid match ends in four wins within seven duels; resources and compact serialization survive each round", () => {
  const { run } = fixture();
  let duels = 0;
  while (run("game.phase") === "battle") {
    assert.equal(run("hybridBattle.choose(1,'strike')"), true);
    assert.equal(run("hybridBattle.choose(1,'strike')"), false);
    assert.equal(run("packGameState(true).hybrid.choices[1]"), null);
    assert.equal(run("hybridBattle.choose(2,'counter')"), true);
    assert.equal(run("game.hybrid.stage"), "story");
    assert.ok(
      run(
        "game.hybrid.scenes.at(-1).shortText.length < game.hybrid.scenes.at(-1).text.length * .4",
      ),
    );
    assert.ok(run("JSON.stringify(packGameState()).length") < 180000);
    assert.ok(
      run("[1,2].every(p=>game.hybrid.energy[p]>=0&&game.hybrid.energy[p]<=4)"),
    );
    assert.equal(
      run("unpackGameState(packGameState()).hybrid.scenes.at(-1).attacker.id"),
      run("game.hybrid.scenes.at(-1).attacker.id"),
    );
    run("hybridBattle.next(2)");
    duels++;
    assert.ok(duels <= 7);
  }
  assert.equal(run("Math.max(game.result.wins1,game.result.wins2)"), 4);
  assert.equal(run("game.result.scenes.length"), duels);
  assert.equal(
    run("parseResultLink(new URL(snapshotLink(resultSnapshot())).hash).wins1"),
    run("game.result.wins1"),
  );
});
test("Online decisions require current match, connection and both players ready", () => {
  const { run } = fixture();
  run("online={mode:'host',role:1,connected:false}");
  assert.equal(
    run(
      "handleHybridAction('hybridChoose',{id:'strike',seed:42,matchNo:1,round:0},1)",
    ),
    false,
  );
  run("online.connected=true");
  assert.equal(
    run(
      "handleHybridAction('hybridChoose',{id:'strike',seed:42,matchNo:1,round:9},1)",
    ),
    false,
  );
  run(
    "hybridBattle.choose(1,'strike');hybridBattle.choose(2,'strike');hybridBattle.next(1)",
  );
  assert.equal(run("game.hybrid.round"), 0);
  run("hybridBattle.next(2)");
  assert.equal(run("game.hybrid.round"), 1);
});
test("Optional AI never requests cloud resources without an authenticated session", async () => {
  const { c, run } = fixture();
  let requests = 0;
  c.puter = {
    auth: { isSignedIn: () => false },
    ai: {
      chat: () => {
        requests++;
        throw Error("should not call");
      },
    },
  };
  run("settings.aiStory=true");
  assert.equal(
    await run("getSceneNarration({kind:'ko',text:'Lokale Geschichte'},0,0)"),
    "Lokale Geschichte",
  );
  assert.equal(requests, 0);
});
test("Cancelling speech invalidates old completion callbacks", () => {
  const { c, run } = fixture();
  let spoken;
  c.SpeechSynthesisUtterance = class {
    constructor(t) {
      this.text = t;
    }
  };
  c.speechSynthesis = {
    cancel() {},
    resume() {},
    getVoices: () => [],
    speak: (u) => (spoken = u),
  };
  run(
    'settings.tts=true;globalThis.completed=0;narrateBlock("Test",()=>completed++)',
  );
  const stale = spoken.onend;
  run("stopTTS()");
  stale();
  assert.equal(c.completed, 0);
});
