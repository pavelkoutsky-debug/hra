/** Smyčkový sekvencer skladeb definovaných jako data (doby, MIDI noty). */

import { INSTRUMENTS, playNote, playPerc } from "./synth";

/** Nota: [doba (beat), MIDI výška, délka v dobách, síla 0–1 (volitelně)] */
export type NoteEvent = [number, number, number, number?];

export interface Channel {
  inst: keyof typeof INSTRUMENTS;
  level?: number;
  notes: NoteEvent[];
}

export interface PercEvent {
  t: number;
  type: "tick" | "thud";
  v?: number;
}

export interface Track {
  id: string;
  bpm: number;
  /** Délka smyčky v dobách. */
  beats: number;
  channels: Channel[];
  perc?: PercEvent[];
}

const LOOKAHEAD_S = 0.35;
const TIMER_MS = 120;
/** Rozlišení plánovací mřížky v dobách (zvládne šestnáctiny). */
const GRID = 0.25;

/** Přehrává jednu skladbu ve smyčce; instance se po stop() zahazuje. */
export class Sequencer {
  private readonly out: GainNode;
  private timer: ReturnType<typeof setInterval> | null = null;
  private loopStart = 0;
  private nextBeat = 0;

  constructor(
    private readonly ctx: AudioContext,
    dest: AudioNode,
    private readonly track: Track,
    private readonly volume: number,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
  }

  start(fadeInS = 1): void {
    const t = this.ctx.currentTime;
    this.out.gain.setValueAtTime(0, t);
    this.out.gain.linearRampToValueAtTime(this.volume, t + fadeInS);
    this.loopStart = t + 0.05;
    this.nextBeat = 0;
    this.tick();
    this.timer = setInterval(() => this.tick(), TIMER_MS);
  }

  stop(fadeOutS = 1): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(0, t + fadeOutS);
    setTimeout(() => this.out.disconnect(), (fadeOutS + 0.1) * 1000);
  }

  /** Naplánuje všechny noty spadající do lookahead okna (mřížka GRID dob, smyčka). */
  private tick(): void {
    const secPerBeat = 60 / this.track.bpm;
    const horizon = this.ctx.currentTime + LOOKAHEAD_S;
    while (this.loopStart + this.nextBeat * secPerBeat < horizon) {
      const beatInLoop = this.nextBeat % this.track.beats;
      const beatTime = this.loopStart + this.nextBeat * secPerBeat;
      const inWindow = (t: number) => t >= beatInLoop && t < beatInLoop + GRID;
      for (const ch of this.track.channels) {
        const inst = INSTRUMENTS[ch.inst];
        for (const [t, note, dur, vel] of ch.notes) {
          if (inWindow(t)) {
            playNote(this.ctx, this.out, inst, note, beatTime + (t - beatInLoop) * secPerBeat, dur * secPerBeat, (vel ?? 1) * (ch.level ?? 1));
          }
        }
      }
      for (const p of this.track.perc ?? []) {
        if (inWindow(p.t)) playPerc(this.ctx, this.out, p.type, beatTime + (p.t - beatInLoop) * secPerBeat, p.v ?? 1);
      }
      this.nextBeat += GRID;
    }
  }
}
