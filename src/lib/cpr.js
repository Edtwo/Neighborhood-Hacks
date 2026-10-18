// Hands-only CPR coach: a 110-per-minute metronome (sound + vibration + visual pulse)
// with spoken prompts. Rate follows AHA guidance of 100–120 compressions per minute.

export const BPM = 110;

// Spoken prompts: [secondsIntoCPR, stringKey]. Repeats every 120 s after the first cycle.
export const PROMPT_SCHEDULE = [
  [0, "cpr.say.start"],
  [15, "cpr.say.depth"],
  [45, "cpr.say.recoil"],
  [90, "cpr.say.keepGoing"],
  [118, "cpr.say.switch"],
];

export function promptsDue(prevS, nowS) {
  const due = [];
  for (const [at, key] of PROMPT_SCHEDULE) {
    for (let t = at; t <= nowS; t += 120) {
      if (t > prevS && t <= nowS) due.push(key);
      if (at === 0) break; // the opening instruction is only said once
    }
  }
  return due;
}

export class CprCoach {
  constructor({ t, lang, onBeat, onTick }) {
    this.t = t;
    this.lang = lang;
    this.onBeat = onBeat;
    this.onTick = onTick;
    this.running = false;
    this.muted = false;
  }

  async start() {
    if (this.running) return;
    this.running = true;
    this.startedAt = performance.now();
    this.lastS = -1;
    try {
      this.audio = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      this.audio = null;
    }
    try {
      this.wakeLock = await navigator.wakeLock?.request("screen");
    } catch {
      this.wakeLock = null;
    }
    this.nextBeat = performance.now();
    this.loop();
  }

  loop = () => {
    if (!this.running) return;
    const now = performance.now();
    if (now >= this.nextBeat) {
      this.beat();
      this.nextBeat += 60000 / BPM;
      if (now - this.nextBeat > 1000) this.nextBeat = now + 60000 / BPM; // tab was asleep
    }
    const s = Math.floor((now - this.startedAt) / 1000);
    if (s !== this.lastS) {
      for (const key of promptsDue(this.lastS, s)) this.say(this.t(key));
      this.lastS = s;
      this.onTick?.(s);
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  beat() {
    this.onBeat?.();
    if (this.muted) return;
    if (this.audio) {
      const osc = this.audio.createOscillator();
      const gain = this.audio.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.4, this.audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audio.currentTime + 0.08);
      osc.connect(gain).connect(this.audio.destination);
      osc.start();
      osc.stop(this.audio.currentTime + 0.09);
    }
    navigator.vibrate?.(40);
  }

  say(text) {
    if (this.muted || !("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = this.lang === "es" ? "es-US" : "en-US";
    u.rate = 1.05;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  setMuted(m) {
    this.muted = m;
    if (m && "speechSynthesis" in window) speechSynthesis.cancel();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.audio?.close?.();
    this.wakeLock?.release?.();
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  }
}
