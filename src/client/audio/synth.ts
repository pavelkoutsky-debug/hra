/** 2-operátorová FM syntéza ve stylu AdLib/OPL2 čipu (~1990) přes Web Audio API. */

export interface Instrument {
  /** Poměr frekvence modulátoru k nosné (celočíselné poměry = harmonické OPL témbry). */
  ratio: number;
  /** Hloubka modulace jako násobek frekvence nosné (0 = čistý tón). */
  fmDepth: number;
  attack: number;
  decay: number;
  sustain: number; // 0–1 úroveň
  release: number;
  carrierWave: OscillatorType;
  modWave: OscillatorType;
  gain: number;
}

export const INSTRUMENTS: Record<string, Instrument> = {
  /** chorální varhany — synagoga, drony */
  organ: { ratio: 2, fmDepth: 1.2, attack: 0.08, decay: 0.2, sustain: 0.8, release: 0.3, carrierWave: "sine", modWave: "sine", gain: 0.5 },
  /** drnkací loutna — ulice, krčma */
  lute: { ratio: 3, fmDepth: 2.5, attack: 0.004, decay: 0.25, sustain: 0.12, release: 0.15, carrierWave: "sine", modWave: "sine", gain: 0.6 },
  /** flétna / šalmaj — melodie */
  flute: { ratio: 1, fmDepth: 0.4, attack: 0.05, decay: 0.1, sustain: 0.7, release: 0.12, carrierWave: "triangle", modWave: "sine", gain: 0.45 },
  /** cembalo — hraběcí dům */
  harpsi: { ratio: 4, fmDepth: 3.5, attack: 0.002, decay: 0.18, sustain: 0.08, release: 0.1, carrierWave: "square", modWave: "sine", gain: 0.35 },
  /** basa / bordun */
  bass: { ratio: 1, fmDepth: 1.8, attack: 0.01, decay: 0.15, sustain: 0.5, release: 0.2, carrierWave: "triangle", modWave: "square", gain: 0.65 },
  /** zvon — hřbitov, orloj */
  bell: { ratio: 3.53, fmDepth: 4, attack: 0.002, decay: 1.4, sustain: 0, release: 0.8, carrierWave: "sine", modWave: "sine", gain: 0.4 },
};

export function midiToFreq(n: number): number {
  return 440 * Math.pow(2, (n - 69) / 12);
}

/** Zahraje jednu FM notu do `dest` v čase `time` (AudioContext čas). */
export function playNote(
  ctx: BaseAudioContext,
  dest: AudioNode,
  inst: Instrument,
  midiNote: number,
  time: number,
  duration: number,
  velocity = 1,
): void {
  const freq = midiToFreq(midiNote);
  const carrier = ctx.createOscillator();
  carrier.type = inst.carrierWave;
  carrier.frequency.value = freq;

  const mod = ctx.createOscillator();
  mod.type = inst.modWave;
  mod.frequency.value = freq * inst.ratio;
  const modGain = ctx.createGain();
  modGain.gain.value = freq * inst.fmDepth;
  mod.connect(modGain);
  modGain.connect(carrier.frequency);

  const env = ctx.createGain();
  const peak = inst.gain * velocity;
  const end = time + duration;
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(peak, time + inst.attack);
  env.gain.linearRampToValueAtTime(peak * inst.sustain, time + inst.attack + inst.decay);
  env.gain.setValueAtTime(peak * inst.sustain, Math.max(time + inst.attack + inst.decay, end));
  env.gain.linearRampToValueAtTime(0, end + inst.release);

  carrier.connect(env);
  env.connect(dest);
  const stopAt = end + inst.release + 0.05;
  carrier.start(time);
  mod.start(time);
  carrier.stop(stopAt);
  mod.stop(stopAt);
}

/** Perkuse: filtrovaný šum (tick = ostrý, thud = temný úder Golema/bubnu). */
export function playPerc(
  ctx: BaseAudioContext,
  dest: AudioNode,
  type: "tick" | "thud",
  time: number,
  velocity = 1,
): void {
  const dur = type === "thud" ? 0.35 : 0.06;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  src.buffer = buf;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = type === "thud" ? 120 : 3000;
  filter.Q.value = type === "thud" ? 6 : 1;

  const env = ctx.createGain();
  env.gain.setValueAtTime((type === "thud" ? 1.2 : 0.35) * velocity, time);
  env.gain.exponentialRampToValueAtTime(0.001, time + dur);

  src.connect(filter);
  filter.connect(env);
  env.connect(dest);
  src.start(time);
}
