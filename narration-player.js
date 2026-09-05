/** Gemeinsame TTS-Steuerung. Abgebrochene Sprachausgabe darf keine neue Szene starten. */
class NarrationPlayer {
  constructor() {
    this.generation = 0;
    this.utterance = null;
    this.timer = null;
  }
  stop() {
    this.generation++;
    clearTimeout(this.timer);
    clearTimeout(battleState.timer);
    clearTimeout(battleState.ttsWatchdog);
    if (this.utterance) {
      this.utterance.onend = null;
      this.utterance.onerror = null;
    }
    this.utterance = null;
    try {
      window.speechSynthesis?.cancel();
    } catch {}
  }
  speak(text, done) {
    this.stop();
    const generation = this.generation;
    let finished = false;
    const finish = () => {
      if (finished || generation !== this.generation) return;
      finished = true;
      clearTimeout(this.timer);
      this.utterance = null;
      done?.();
    };
    text = cleanTTSText(text);
    const readMs = Math.min(
      180000,
      Math.max(3000, text.split(/\s+/).length * 320),
    );
    if (
      !settings.tts ||
      !window.speechSynthesis ||
      typeof SpeechSynthesisUtterance === "undefined"
    ) {
      this.timer = setTimeout(finish, readMs);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text),
      voices = speechSynthesis.getVoices();
    this.utterance = utterance;
    utterance.voice =
      voices.find((v) => v.name === localStorage.getItem("avg25-voice")) ||
      voices.find((v) => v.lang.startsWith("de") && v.localService) ||
      voices.find((v) => v.lang.startsWith("de")) ||
      null;
    utterance.lang = utterance.voice?.lang || "de-DE";
    utterance.rate = Number(localStorage.getItem("avg25-rate") || 0.97);
    utterance.onend = finish;
    utterance.onerror = () => {
      toast("Sprachausgabe nicht verfügbar. Die Szene bleibt lesbar.");
      finish();
    };
    try {
      speechSynthesis.resume();
      speechSynthesis.speak(utterance);
      const watchdog = () => {
        if (generation !== this.generation || finished) return;
        if (speechSynthesis.paused) {
          this.timer = setTimeout(watchdog, 5000);
          return;
        }
        speechSynthesis.cancel();
        finish();
      };
      this.timer = setTimeout(watchdog, Math.max(15000, readMs * 2));
    } catch {
      finish();
    }
  }
}
const narrationPlayer = new NarrationPlayer();
function narrateBlock(text, done) {
  narrationPlayer.speak(text, done);
}
function stopTTS() {
  narrationPlayer.stop();
}

/** Keep live playback brief; the unabridged source remains in the result report. */
function compactLiveNarration(scene, text) {
  if (scene.shortText) return scene.shortText;
  const sentences = cleanNarrationText(text).match(/[^.!?]+[.!?](?:\s|$)/g) || [
    text,
  ];
  if (sentences.join(" ").split(/\s+/).length <= 100) return text;
  const moves = scene.moves || [];
  const actionSentences = sentences.filter((s) =>
    moves.some((m) => s.includes(m)),
  );
  const candidates = actionSentences.length ? actionSentences : sentences;
  const result = [];
  let words = 0;
  for (const sentence of candidates) {
    const n = sentence.trim().split(/\s+/).length;
    if (words + n > 85) continue;
    result.push(sentence.trim());
    words += n;
    if (words >= 60 || result.length >= 4) break;
  }
  if (scene.kind === "ko")
    result.push(
      `${scene.attacker.name} entscheidet das Duell gegen ${scene.defender.name}.`,
    );
  return result.join(" ") || sentences[0];
}
