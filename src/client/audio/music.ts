/** Hudební kontrolér: vybírá skladbu podle stavu hry, řeší crossfade, ztlumení a SFX. */

import type { GameState } from "../../shared/types";
import { Sequencer } from "./sequencer";
import { TRACKS } from "./tracks";
import { INSTRUMENTS, playNote, playPerc } from "./synth";

const MUTE_KEY = "ucednikova-noc:music-muted";
const MASTER_VOLUME = 0.5;
const CROSSFADE_S = 1.4;

/** Lokace → skladba (den). */
const LOCATION_TRACKS: Record<string, string> = {
  "rabinuv-dum": "ghetto",
  "radnice": "ghetto",
  "ulicka-ghetta": "ghetto",
  "synagoga": "sacred",
  "puda-synagogy": "sacred",
  "hrbitov": "cemetery",
  "krcma": "oldtown",
  "staromak": "oldtown",
  "dilna-scotty": "alchemy",
  "dum-sberatele": "manor",
};

/** Venkovní lokace — v noci přepínají na noční téma. */
const OUTDOOR = new Set(["ulicka-ghetta", "hrbitov", "staromak", "synagoga"]);

const ENDING_TRACKS: Record<string, string> = {
  "strazce-tajemstvi": "ending-good",
  "ucencova-slava": "ending-good",
  "horke-vitezstvi": "ending-bitter",
  "navrat-mistra": "ending-bitter",
  "pokuseni-moci": "ending-dark",
  "tmava-ulicka": "ending-dark",
};

function isNight(state: GameState): boolean {
  const hour = (6 + state.timeMinutes / 60) % 24;
  return hour >= 17 || hour < 6;
}

/** Určí skladbu pro aktuální stav hry. */
export function pickTrack(state: GameState): string {
  if (state.ending) return ENDING_TRACKS[state.ending] ?? "ending-bitter";
  if (state.combat || state.axes.pogrom >= 7) return "danger";
  if (isNight(state) && OUTDOOR.has(state.location)) return "night";
  return LOCATION_TRACKS[state.location] ?? "ghetto";
}

class Music {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private current: Sequencer | null = null;
  private currentId: string | null = null;
  /** Skladba vyžádaná dřív, než prohlížeč povolil zvuk (první gesto). */
  private pendingId: string | null = null;
  private muted = localStorage.getItem(MUTE_KEY) === "1";

  get isMuted(): boolean {
    return this.muted;
  }

  /** Zavolat při prvním uživatelském gestu (autoplay policy). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
    this.master.connect(this.ctx.destination);
    if (this.pendingId) {
      const id = this.pendingId;
      this.pendingId = null;
      this.play(id);
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    if (this.master && this.ctx) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.linearRampToValueAtTime(muted ? 0 : MASTER_VOLUME, t + 0.3);
    }
  }

  /** Přepne na skladbu (crossfade); stejná skladba hraje dál. */
  play(trackId: string): void {
    if (!this.ctx || !this.master) {
      this.pendingId = trackId;
      return;
    }
    if (this.currentId === trackId) return;
    const track = TRACKS[trackId];
    if (!track) return;
    this.current?.stop(CROSSFADE_S);
    this.current = new Sequencer(this.ctx, this.master, track, 1);
    this.current.start(CROSSFADE_S);
    this.currentId = trackId;
  }

  playForState(state: GameState): void {
    this.play(pickTrack(state));
  }

  /** Krátké zvukové efekty (stejná FM syntéza jako hudba). */
  sfx(name: "dice" | "item" | "hurt"): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime + 0.01;
    switch (name) {
      case "dice":
        playPerc(this.ctx, this.master, "tick", t, 0.8);
        playPerc(this.ctx, this.master, "tick", t + 0.07, 0.6);
        playPerc(this.ctx, this.master, "tick", t + 0.16, 0.9);
        break;
      case "item":
        playNote(this.ctx, this.master, INSTRUMENTS.bell, 81, t, 0.12, 0.5);
        playNote(this.ctx, this.master, INSTRUMENTS.bell, 88, t + 0.1, 0.25, 0.5);
        break;
      case "hurt":
        playPerc(this.ctx, this.master, "thud", t, 1);
        playNote(this.ctx, this.master, INSTRUMENTS.bass, 31, t, 0.3, 0.7);
        break;
    }
  }
}

export const music = new Music();
