/** Skladby hry — dobové melodie (frygicko-dórská modalita) pro FM sekvencer. */

import type { NoteEvent, Track } from "./sequencer";

/** Rozloží akord/vzorec do opakovaného rytmu od `start` po `step` dobách. */
function pattern(notes: number[], start: number, step: number, dur: number, repeats: number, vel = 1): NoteEvent[] {
  const out: NoteEvent[] = [];
  for (let r = 0; r < repeats; r++) {
    for (let i = 0; i < notes.length; i++) {
      out.push([start + (r * notes.length + i) * step, notes[i], dur, vel]);
    }
  }
  return out;
}

/** Melodie: dvojice [výška, délka] kladené za sebe od `start`. */
function melody(pairs: [number, number][], start: number, vel = 1): NoteEvent[] {
  const out: NoteEvent[] = [];
  let t = start;
  for (const [n, d] of pairs) {
    if (n > 0) out.push([t, n, d * 0.95, vel]); // 0 = pomlka
    t += d;
  }
  return out;
}

export const TRACKS: Record<string, Track> = {
  /** Titulní téma — D frygická dominanta, zvon a osamělá flétna nad dronem. */
  title: {
    id: "title", bpm: 76, beats: 32,
    channels: [
      { inst: "bass", level: 0.8, notes: [[0, 38, 8], [8, 38, 8], [16, 36, 8], [24, 38, 8]] },
      { inst: "organ", level: 0.35, notes: [[0, 50, 16], [16, 48, 8], [24, 50, 8]] },
      { inst: "flute", level: 0.9, notes: melody([[62, 2], [63, 2], [66, 3], [67, 1], [69, 4], [67, 2], [66, 2], [63, 2], [62, 6], [0, 2], [69, 2], [70, 2], [72, 3], [70, 1], [69, 4], [66, 2], [63, 2], [62, 8]], 0) },
      { inst: "bell", level: 0.5, notes: [[0, 62, 4], [16, 57, 4]] },
    ],
  },

  /** Ghetto ve dne — dórská loutna, drobná flétnová figura. */
  ghetto: {
    id: "ghetto", bpm: 104, beats: 32,
    channels: [
      { inst: "lute", level: 0.7, notes: [
        ...pattern([50, 57, 53, 57], 0, 1, 0.8, 2),
        ...pattern([48, 55, 52, 55], 8, 1, 0.8, 2),
        ...pattern([46, 53, 50, 53], 16, 1, 0.8, 2),
        ...pattern([45, 52, 50, 52], 24, 1, 0.8, 1),
        ...pattern([50, 57, 53, 57], 28, 1, 0.8, 1),
      ] },
      { inst: "flute", level: 0.65, notes: melody([[62, 1.5], [64, 0.5], [65, 2], [67, 2], [65, 1], [64, 1], [62, 4], [0, 4], [65, 1.5], [67, 0.5], [69, 2], [71, 2], [69, 1], [65, 1], [62, 2], [64, 2], [62, 4], [0, 2]], 0) },
      { inst: "bass", level: 0.5, notes: [[0, 38, 4], [8, 36, 4], [16, 34, 4], [24, 33, 2], [28, 38, 2]] },
    ],
  },

  /** Synagoga — pomalý chorál, varhanní drony. */
  sacred: {
    id: "sacred", bpm: 56, beats: 32,
    channels: [
      { inst: "organ", level: 0.6, notes: [[0, 38, 16], [0, 45, 16], [16, 36, 8], [16, 43, 8], [24, 38, 8], [24, 45, 8]] },
      { inst: "flute", level: 0.55, notes: melody([[62, 3], [60, 1], [58, 4], [57, 4], [58, 2], [60, 2], [62, 8], [0, 2], [57, 2], [58, 2], [60, 2], [57, 8], [0, 2]], 0, 0.8) },
      { inst: "bell", level: 0.3, notes: [[0, 74, 6]] },
    ],
  },

  /** Hřbitov — zvony, vrány, ticho. */
  cemetery: {
    id: "cemetery", bpm: 66, beats: 32,
    channels: [
      { inst: "bass", level: 0.6, notes: [[0, 33, 16], [16, 31, 16]] },
      { inst: "bell", level: 0.55, notes: [[0, 57, 6], [8, 55, 6], [16, 52, 6], [26, 57, 4]] },
      { inst: "flute", level: 0.4, notes: melody([[0, 8], [64, 2], [63, 2], [60, 4], [0, 8], [57, 2], [60, 2], [63, 4]], 0, 0.7) },
    ],
  },

  /** Staré Město a krčma — renesanční tanec v g moll. */
  oldtown: {
    id: "oldtown", bpm: 126, beats: 32,
    channels: [
      { inst: "lute", level: 0.75, notes: [
        ...pattern([43, 50, 46, 50], 0, 1, 0.7, 2),
        ...pattern([41, 48, 45, 48], 8, 1, 0.7, 2),
        ...pattern([39, 46, 43, 46], 16, 1, 0.7, 2),
        ...pattern([38, 45, 41, 45], 24, 1, 0.7, 1),
        ...pattern([43, 50, 46, 50], 28, 1, 0.7, 1),
      ] },
      { inst: "flute", level: 0.6, notes: melody([[67, 1], [70, 1], [74, 2], [72, 1], [70, 1], [72, 2], [70, 1], [67, 1], [65, 2], [67, 4], [0, 2], [70, 1], [72, 1], [74, 2], [75, 2], [74, 1], [72, 1], [70, 2], [67, 4], [0, 2]], 0) },
    ],
    perc: [
      { t: 0, type: "thud", v: 0.5 }, { t: 8, type: "thud", v: 0.4 }, { t: 16, type: "thud", v: 0.5 }, { t: 24, type: "thud", v: 0.4 },
      { t: 2, type: "tick" }, { t: 6, type: "tick" }, { t: 10, type: "tick" }, { t: 14, type: "tick" },
      { t: 18, type: "tick" }, { t: 22, type: "tick" }, { t: 26, type: "tick" }, { t: 30, type: "tick" },
    ],
  },

  /** Alchymistická dílna — celotónová mlha, bublání. */
  alchemy: {
    id: "alchemy", bpm: 92, beats: 32,
    channels: [
      { inst: "organ", level: 0.35, notes: [[0, 36, 16], [16, 38, 16]] },
      { inst: "lute", level: 0.55, notes: [
        ...pattern([60, 64, 68, 72], 0, 0.5, 0.4, 2),
        ...pattern([62, 66, 70, 74], 8, 0.5, 0.4, 2),
        ...pattern([60, 64, 68, 72], 16, 0.5, 0.4, 2),
        ...pattern([58, 62, 66, 70], 24, 0.5, 0.4, 2),
      ] },
      { inst: "bell", level: 0.3, notes: [[4, 80, 3], [20, 78, 3]] },
    ],
  },

  /** Dům hraběte — cembalové lamento (sestupný bas). */
  manor: {
    id: "manor", bpm: 112, beats: 32,
    channels: [
      { inst: "harpsi", level: 0.8, notes: [
        ...pattern([57, 60, 64, 60], 0, 1, 0.9, 1),
        ...pattern([55, 60, 64, 60], 4, 1, 0.9, 1),
        ...pattern([54, 60, 62, 60], 8, 1, 0.9, 1),
        ...pattern([53, 57, 62, 57], 12, 1, 0.9, 1),
        ...pattern([52, 56, 64, 56], 16, 1, 0.9, 1),
        ...pattern([53, 57, 60, 57], 20, 1, 0.9, 1),
        ...pattern([52, 56, 59, 56], 24, 1, 0.9, 1),
        ...pattern([57, 52, 49, 45], 28, 1, 0.9, 1),
      ] },
      { inst: "bass", level: 0.45, notes: [[0, 45, 4], [4, 43, 4], [8, 42, 4], [12, 41, 4], [16, 40, 4], [20, 41, 4], [24, 40, 4], [28, 45, 4]] },
    ],
  },

  /** Noc ve městě — Golem chodí. Pomalé, temné, kroky. */
  night: {
    id: "night", bpm: 60, beats: 32,
    channels: [
      { inst: "bass", level: 0.7, notes: [[0, 33, 14], [16, 32, 14]] },
      { inst: "organ", level: 0.3, notes: [[0, 45, 8], [8, 44, 8], [16, 44, 8], [24, 45, 8]] },
      { inst: "flute", level: 0.35, notes: melody([[0, 6], [57, 2], [58, 4], [57, 2], [0, 10], [63, 2], [62, 4], [0, 2]], 0, 0.6) },
      { inst: "bell", level: 0.25, notes: [[12, 69, 4], [28, 68, 4]] },
    ],
    perc: [
      { t: 0, type: "thud", v: 0.8 }, { t: 8, type: "thud", v: 0.7 }, { t: 16, type: "thud", v: 0.8 }, { t: 24, type: "thud", v: 0.7 },
    ],
  },

  /** Nebezpečí / boj / hrozící pogrom — hnaný ostinátní bas. */
  danger: {
    id: "danger", bpm: 144, beats: 16,
    channels: [
      { inst: "bass", level: 0.85, notes: [
        ...pattern([38, 38, 41, 38, 36, 38, 44, 43], 0, 1, 0.5, 2),
      ] },
      { inst: "harpsi", level: 0.5, notes: [[0, 62, 1], [2, 62, 1], [4, 63, 2], [8, 62, 1], [10, 60, 1], [12, 59, 4]] },
      { inst: "flute", level: 0.5, notes: melody([[0, 8], [74, 1], [75, 1], [74, 2], [70, 2], [66, 2]], 0, 0.9) },
    ],
    perc: [
      { t: 0, type: "thud" }, { t: 4, type: "thud" }, { t: 8, type: "thud" }, { t: 12, type: "thud" },
      { t: 2, type: "tick" }, { t: 6, type: "tick" }, { t: 10, type: "tick" }, { t: 14, type: "tick" }, { t: 15, type: "tick", v: 0.6 },
    ],
  },

  /** Vítězné konce — fanfára v D dur. */
  "ending-good": {
    id: "ending-good", bpm: 100, beats: 32,
    channels: [
      { inst: "organ", level: 0.5, notes: [[0, 38, 8], [0, 45, 8], [8, 43, 8], [8, 50, 8], [16, 45, 8], [16, 52, 8], [24, 38, 8], [24, 45, 8]] },
      { inst: "flute", level: 0.8, notes: melody([[62, 1], [66, 1], [69, 2], [74, 3], [73, 0.5], [74, 0.5], [76, 4], [74, 2], [73, 2], [69, 2], [71, 2], [74, 6], [0, 2], [69, 1], [71, 1], [73, 2], [74, 4]], 0) },
      { inst: "bell", level: 0.5, notes: [[0, 74, 4], [16, 69, 4], [28, 74, 4]] },
    ],
  },

  /** Hořké/nejednoznačné konce — pomalá d moll elegie. */
  "ending-bitter": {
    id: "ending-bitter", bpm: 72, beats: 32,
    channels: [
      { inst: "lute", level: 0.55, notes: [
        ...pattern([50, 57, 62, 57], 0, 2, 1.6, 2),
        ...pattern([46, 53, 62, 53], 16, 2, 1.6, 1),
        ...pattern([45, 53, 60, 53], 24, 2, 1.6, 1),
      ] },
      { inst: "flute", level: 0.6, notes: melody([[69, 3], [67, 1], [65, 4], [64, 2], [62, 6], [0, 2], [65, 3], [64, 1], [62, 4], [61, 2], [57, 4], [62, 4]], 0, 0.85) },
      { inst: "bass", level: 0.5, notes: [[0, 38, 8], [8, 38, 8], [16, 34, 8], [24, 33, 4], [28, 38, 4]] },
    ],
  },

  /** Temné konce (smrt, pokušení moci) — tritónový umíráček. */
  "ending-dark": {
    id: "ending-dark", bpm: 50, beats: 32,
    channels: [
      { inst: "bass", level: 0.8, notes: [[0, 32, 14], [16, 31, 14]] },
      { inst: "organ", level: 0.4, notes: [[0, 38, 8], [0, 44, 8], [16, 37, 8], [16, 43, 8]] },
      { inst: "bell", level: 0.6, notes: [[0, 56, 8], [8, 56, 8], [16, 55, 8], [24, 56, 8]] },
    ],
    perc: [{ t: 0, type: "thud" }, { t: 16, type: "thud", v: 0.8 }],
  },
};
