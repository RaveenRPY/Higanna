const STORAGE_KEY = "higanna-sfx";
const MASTER_GAIN = 0.72;

export type SfxName =
  | "deal"
  | "play"
  | "select"
  | "deselect"
  | "pass"
  | "yourTurn"
  | "tick"
  | "trickWin"
  | "patternLock"
  | "tribute"
  | "king"
  | "queen"
  | "beggar"
  | "gameOver"
  | "shuffle"
  | "reaction"
  | "error";

type AudioNodes = {
  ctx: AudioContext;
  input: DynamicsCompressorNode;
  gain: GainNode;
};

let nodes: AudioNodes | null = null;
let muted = readMuted();
let noiseCache: AudioBuffer | null = null;
const lastAt = new Map<SfxName, number>();
const listeners = new Set<() => void>();

function readMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "0";
  } catch {
    return false;
  }
}

function notify() {
  for (const fn of listeners) fn();
}

export function isSfxMuted() {
  return muted;
}

export function subscribeSfx(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setSfxMuted(next: boolean) {
  muted = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "0" : "1");
  } catch {
    /* private mode */
  }
  if (nodes) nodes.gain.gain.setTargetAtTime(next ? 0 : MASTER_GAIN, nodes.ctx.currentTime, 0.03);
  notify();
}

function getNodes(): AudioNodes | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!nodes) {
    const ctx = new AC();
    const input = ctx.createDynamicsCompressor();
    input.threshold.value = -18;
    input.knee.value = 10;
    input.ratio.value = 3.2;
    input.attack.value = 0.004;
    input.release.value = 0.14;
    const gain = ctx.createGain();
    gain.gain.value = muted ? 0 : MASTER_GAIN;
    input.connect(gain);
    gain.connect(ctx.destination);
    nodes = { ctx, input, gain };
  }
  return nodes;
}

export function unlockAudio() {
  const n = getNodes();
  if (!n) return;
  if (n.ctx.state === "suspended") void n.ctx.resume();
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseCache && noiseCache.sampleRate === ctx.sampleRate) return noiseCache;
  const length = Math.floor(ctx.sampleRate * 0.35);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    last = last * 0.92 + white * 0.08;
    data[i] = white * 0.55 + last * 0.45;
  }
  noiseCache = buffer;
  return buffer;
}

function env(ctx: AudioContext, peak: number, attack: number, decay: number, t: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

function tone(
  ctx: AudioContext,
  dest: AudioNode,
  {
    freq,
    endFreq,
    type = "sine",
    when,
    attack = 0.008,
    decay = 0.22,
    peak = 0.18,
  }: {
    freq: number;
    endFreq?: number;
    type?: OscillatorType;
    when: number;
    attack?: number;
    decay?: number;
    peak?: number;
  },
) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 20), when + attack + decay);
  const g = env(ctx, peak, attack, decay, when);
  osc.connect(g);
  g.connect(dest);
  osc.start(when);
  osc.stop(when + attack + decay + 0.02);
}

function noiseBurst(
  ctx: AudioContext,
  dest: AudioNode,
  {
    when,
    peak = 0.2,
    attack = 0.004,
    decay = 0.06,
    freq = 1800,
    q = 0.85,
    type = "bandpass",
  }: {
    when: number;
    peak?: number;
    attack?: number;
    decay?: number;
    freq?: number;
    q?: number;
    type?: BiquadFilterType;
  },
) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = env(ctx, peak, attack, decay, when);
  src.connect(filter);
  filter.connect(g);
  g.connect(dest);
  src.start(when);
  src.stop(when + attack + decay + 0.02);
}

function throttled(name: SfxName, minGap: number) {
  const now = performance.now();
  const prev = lastAt.get(name) ?? 0;
  if (now - prev < minGap) return false;
  lastAt.set(name, now);
  return true;
}

/** Vibration pattern in ms, timed to each cue (on, off, on, …). */
const HAPTICS: Record<SfxName, number | number[]> = {
  deal: 8,
  play: 24,
  select: 10,
  deselect: 8,
  pass: [42, 98, 30, 128, 58],
  yourTurn: [14, 40, 14, 40, 22],
  tick: 12,
  trickWin: [16, 28, 16, 28, 28],
  patternLock: [10, 35, 10, 35, 10, 35, 16],
  tribute: [16, 40, 22],
  king: [16, 74, 16, 74, 16, 74, 36],
  queen: [12, 68, 12, 68, 12, 68, 24],
  beggar: [48, 90, 38, 100, 72],
  gameOver: [18, 92, 18, 92, 18, 92, 40],
  shuffle: [8, 30, 8, 30, 8, 30, 8, 30, 8, 30, 18],
  reaction: 14,
  error: [26, 70, 38],
};

const SFX_GAP: Partial<Record<SfxName, number>> = {
  deal: 28,
  play: 90,
  select: 40,
  pass: 180,
  yourTurn: 400,
  tick: 280,
  trickWin: 350,
  patternLock: 400,
  tribute: 200,
  shuffle: 800,
  reaction: 80,
  error: 180,
};

function buzz(name: SfxName) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(HAPTICS[name]);
  } catch {
    /* iOS Safari throws when vibration is unavailable */
  }
}

function canFeedback() {
  if (muted) return false;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return false;
  return true;
}

function out(): { ctx: AudioContext; dest: AudioNode; t: number } | null {
  if (!canFeedback()) return null;
  const n = getNodes();
  if (!n) return null;
  return { ctx: n.ctx, dest: n.input, t: n.ctx.currentTime };
}

function cardHit(ctx: AudioContext, dest: AudioNode, t: number, pitch: number, peak: number) {
  noiseBurst(ctx, dest, {
    when: t,
    peak: peak * 0.55,
    attack: 0.002,
    decay: 0.055,
    freq: 1650 * pitch,
    q: 0.8,
  });
  noiseBurst(ctx, dest, {
    when: t,
    peak: peak * 0.18,
    attack: 0.001,
    decay: 0.03,
    freq: 4200 * pitch,
    q: 1.4,
    type: "highpass",
  });
  tone(ctx, dest, {
    freq: 155 * pitch,
    endFreq: 68 * pitch,
    type: "sine",
    when: t,
    attack: 0.003,
    decay: 0.08,
    peak: peak * 0.42,
  });
  tone(ctx, dest, {
    freq: 2100 * pitch,
    type: "triangle",
    when: t,
    attack: 0.001,
    decay: 0.018,
    peak: peak * 0.12,
  });
}

function playCue(name: SfxName) {
  const bus = out();
  if (!bus) return;
  const { ctx, dest, t } = bus;

  if (name === "deal") {
    cardHit(ctx, dest, t, 0.92 + Math.random() * 0.22, 0.2);
    return;
  }

  if (name === "play") {
    cardHit(ctx, dest, t, 0.88 + Math.random() * 0.1, 0.38);
    noiseBurst(ctx, dest, {
      when: t,
      peak: 0.12,
      attack: 0.01,
      decay: 0.14,
      freq: 420,
      q: 0.55,
      type: "lowpass",
    });
    return;
  }

  if (name === "select") {
    tone(ctx, dest, { freq: 740, type: "sine", when: t, attack: 0.004, decay: 0.07, peak: 0.1 });
    tone(ctx, dest, { freq: 1180, type: "triangle", when: t, attack: 0.003, decay: 0.05, peak: 0.05 });
    return;
  }

  if (name === "deselect") {
    tone(ctx, dest, { freq: 520, endFreq: 340, type: "sine", when: t, attack: 0.004, decay: 0.08, peak: 0.07 });
    return;
  }

  if (name === "pass") {
    // Short fail sting: muted buzzer + descending minor (not a card whoosh).
    tone(ctx, dest, {
      freq: 196,
      type: "square",
      when: t,
      attack: 0.006,
      decay: 0.12,
      peak: 0.055,
    });
    tone(ctx, dest, {
      freq: 155,
      type: "square",
      when: t,
      attack: 0.006,
      decay: 0.14,
      peak: 0.04,
    });
    const fall: [number, number, number][] = [
      [392.0, 349.23, 0],
      [311.13, 261.63, 0.14],
      [233.08, 174.61, 0.3],
    ];
    for (const [freq, endFreq, delay] of fall) {
      tone(ctx, dest, {
        freq,
        endFreq,
        type: "sine",
        when: t + delay,
        attack: 0.02,
        decay: 0.28,
        peak: 0.16,
      });
      tone(ctx, dest, {
        freq: freq * 0.5,
        endFreq: endFreq * 0.5,
        type: "triangle",
        when: t + delay,
        attack: 0.024,
        decay: 0.3,
        peak: 0.05,
      });
    }
    return;
  }

  if (name === "yourTurn") {
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      tone(ctx, dest, {
        freq,
        type: "sine",
        when: t + i * 0.055,
        attack: 0.01,
        decay: 0.32,
        peak: 0.14 - i * 0.02,
      });
      tone(ctx, dest, {
        freq: freq * 2,
        type: "triangle",
        when: t + i * 0.055,
        attack: 0.012,
        decay: 0.22,
        peak: 0.035,
      });
    });
    return;
  }

  if (name === "tick") {
    tone(ctx, dest, { freq: 880, type: "square", when: t, attack: 0.001, decay: 0.045, peak: 0.045 });
    tone(ctx, dest, { freq: 1760, type: "sine", when: t, attack: 0.001, decay: 0.03, peak: 0.02 });
    return;
  }

  if (name === "trickWin") {
    [392, 493.88, 587.33].forEach((freq, i) => {
      tone(ctx, dest, {
        freq,
        type: "sine",
        when: t + i * 0.04,
        attack: 0.01,
        decay: 0.38,
        peak: 0.13,
      });
    });
    noiseBurst(ctx, dest, {
      when: t,
      peak: 0.1,
      attack: 0.02,
      decay: 0.2,
      freq: 280,
      type: "lowpass",
    });
    return;
  }

  if (name === "patternLock") {
    [784, 988, 1175, 1568].forEach((freq, i) => {
      tone(ctx, dest, {
        freq,
        type: "triangle",
        when: t + i * 0.045,
        attack: 0.006,
        decay: 0.2,
        peak: 0.09,
      });
    });
    return;
  }

  if (name === "tribute") {
    cardHit(ctx, dest, t, 0.85, 0.28);
    tone(ctx, dest, { freq: 440, type: "sine", when: t + 0.05, attack: 0.01, decay: 0.22, peak: 0.1 });
    tone(ctx, dest, { freq: 659, type: "sine", when: t + 0.1, attack: 0.01, decay: 0.24, peak: 0.1 });
    return;
  }

  if (name === "king") {
    [261.63, 329.63, 392, 523.25].forEach((freq, i) => {
      tone(ctx, dest, {
        freq,
        type: "triangle",
        when: t + i * 0.09,
        attack: 0.012,
        decay: 0.55,
        peak: 0.16,
      });
      tone(ctx, dest, {
        freq: freq * 2,
        type: "sine",
        when: t + i * 0.09,
        attack: 0.02,
        decay: 0.4,
        peak: 0.04,
      });
    });
    return;
  }

  if (name === "queen") {
    [329.63, 415.3, 493.88, 659.25].forEach((freq, i) => {
      tone(ctx, dest, {
        freq,
        type: "sine",
        when: t + i * 0.08,
        attack: 0.02,
        decay: 0.5,
        peak: 0.14,
      });
    });
    return;
  }

  if (name === "beggar") {
    tone(ctx, dest, { freq: 220, endFreq: 155, type: "sine", when: t, attack: 0.03, decay: 0.28, peak: 0.16 });
    tone(ctx, dest, { freq: 196, endFreq: 130, type: "sine", when: t + 0.22, attack: 0.03, decay: 0.32, peak: 0.14 });
    tone(ctx, dest, { freq: 165, endFreq: 110, type: "triangle", when: t + 0.46, attack: 0.04, decay: 0.4, peak: 0.12 });
    return;
  }

  if (name === "gameOver") {
    [196, 246.94, 293.66, 392].forEach((freq, i) => {
      tone(ctx, dest, {
        freq,
        type: "sine",
        when: t + i * 0.11,
        attack: 0.02,
        decay: 0.7,
        peak: 0.13,
      });
    });
    return;
  }

  if (name === "shuffle") {
    for (let i = 0; i < 8; i++) {
      const at = t + i * 0.038;
      cardHit(ctx, dest, at, 0.8 + (i % 3) * 0.12, 0.14);
    }
    tone(ctx, dest, { freq: 523, type: "sine", when: t + 0.32, attack: 0.02, decay: 0.35, peak: 0.1 });
    return;
  }

  if (name === "reaction") {
    tone(ctx, dest, { freq: 620, endFreq: 1240, type: "sine", when: t, attack: 0.008, decay: 0.12, peak: 0.12 });
    noiseBurst(ctx, dest, { when: t, peak: 0.08, attack: 0.004, decay: 0.07, freq: 2400, q: 1.1 });
    return;
  }

  if (name === "error") {
    tone(ctx, dest, { freq: 196, type: "square", when: t, attack: 0.004, decay: 0.12, peak: 0.07 });
    tone(ctx, dest, { freq: 155, type: "square", when: t + 0.09, attack: 0.004, decay: 0.14, peak: 0.06 });
  }
}

export function playSfx(name: SfxName) {
  if (!canFeedback()) return;
  const gap = SFX_GAP[name];
  if (gap != null && !throttled(name, gap)) return;
  buzz(name);
  const n = getNodes();
  if (!n) return;
  if (n.ctx.state === "suspended") {
    void n.ctx.resume().then(() => {
      if (!canFeedback()) return;
      playCue(name);
    });
    return;
  }
  playCue(name);
}

export function playRoleSfx(role: "king" | "queen" | "beggar") {
  playSfx(role);
}

if (typeof window !== "undefined") {
  const unlock = () => unlockAudio();
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
  window.addEventListener("touchstart", unlock, { passive: true });
}
