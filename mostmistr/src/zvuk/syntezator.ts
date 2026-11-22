// Syntezátor zvuků: každý zvuk se skládá za běhu z šumu a jednoduchých tónů.
//
// Hra nemá žádné nahrávky. Prasknutí dřeva je šumový náraz s dutým úderem a třískami,
// zazvonění oceli pár neharmonických tónů, vrzání pilový tón protažený rezonancí dřeva.
// Syntezátor jen přijímá zvuky, které určil poslech záznamu (`deje.ts`), a nic nerozhoduje.
// Pracuje nad `BaseAudioContext`, takže stejný kód hraje do sluchátek i počítá do paměti,
// kde ho testy změří.

import type { DruhZvuku, Zvuk } from "./deje";

/** Kolik zvuků smí znít najednou; nad tím se méně důležité vynechávají. */
const NEJVIC_HLASU = 26;
/** Nejkratší odstup dvou zvuků stejného druhu v sekundách; hustší by splývaly v šum. */
const ODSTUP: Readonly<Record<DruhZvuku, number>> = {
  zlom: 0,
  sjeti: 0,
  splouchnuti: 0.05,
  dopad: 0.04,
  krok: 0.02,
  spara: 0.012,
  vrzani: 0.05,
  lupnuti: 0.02,
  drnceni: 0.04,
  brnk: 0,
};
/** Zvuky, které se při plném obsazení hlasů nevynechávají. */
const DULEZITE: ReadonlySet<DruhZvuku> = new Set(["zlom", "sjeti", "splouchnuti", "dopad", "brnk"]);

/** Poměry a síly dílčích tónů ocelového prutu, do kterého se udeřilo. */
const TONY_OCELI = [1, 2.76, 5.4, 8.93];
const SILY_OCELI = [0.5, 0.34, 0.2, 0.1];
const DOZVUKY_OCELI = [0.35, 0.24, 0.15, 0.09];

/**
 * Výstup zvuku: měkké omezení a za ním hlasitost. Zřícení mostu jsou desítky zvuků naráz;
 * jejich součet se místo ostrého oříznutí zaoblí. Jeden zvuk projde skoro beze změny.
 * Vrací vstup, do kterého hraje syntezátor, a zesilovač, kterým se řídí hlasitost.
 */
export function vytvorVystup(ctx: BaseAudioContext, hlasitost: number): { vstup: AudioNode; hlavni: GainNode } {
  const omezovac = ctx.createWaveShaper();
  const krivka = new Float32Array(2049);
  for (let i = 0; i < krivka.length; i++) {
    // Vstup −2 až 2: do poloviny rozsahu skoro přímka, pak se křivka ohýbá k ±1.
    const x = (4 * i) / (krivka.length - 1) - 2;
    krivka[i] = Math.tanh(1.2 * x) / Math.tanh(2.4);
  }
  omezovac.curve = krivka;
  omezovac.oversample = "2x";
  const predzesilovac = ctx.createGain();
  // Křivka čte vstup v rozsahu −1 až 1; vstup −2 až 2 se do něj nejdřív zmenší.
  predzesilovac.gain.value = 0.5;
  const hlavni = ctx.createGain();
  hlavni.gain.value = hlasitost;
  predzesilovac.connect(omezovac).connect(hlavni).connect(ctx.destination);
  return { vstup: predzesilovac, hlavni };
}

interface Stopa {
  /** Kam se zvuk míchá: vlastní panorama zvuku. */
  cil: AudioNode;
  /** Zdroj, který dozní poslední; po něm se stopa odpojí. */
  posledni: AudioScheduledSourceNode | null;
  konec: number;
}

interface Sum {
  typ: BiquadFilterType;
  /** Kmitočet filtru v Hz, případně jeho konec a doba, za kterou k němu dojede. */
  f: number;
  fKonec?: number;
  skluz?: number;
  q?: number;
  /** Náběh, výdrž a časová konstanta doznění v sekundách. */
  nabeh?: number;
  vydrz?: number;
  dozvuk: number;
  hlasitost: number;
}

interface Ton {
  typ: OscillatorType;
  f: number;
  fKonec?: number;
  skluz?: number;
  nabeh?: number;
  vydrz?: number;
  dozvuk: number;
  hlasitost: number;
  /** Rezonance, kterými tón projde (kmitočet a jakost); bez nich jde přímo. */
  rezonance?: readonly (readonly [number, number])[];
  /** Horní mez kmitočtů v Hz; tlumí ostrost pily. */
  propust?: number;
  /** Chvění výšky tónu: jak rychle (Hz) a o kolik hertzů. Dává vrzání drsnost. */
  chveni?: readonly [number, number];
}

export class Syntezator {
  readonly #ctx: BaseAudioContext;
  readonly #vystup: AudioNode;
  readonly #sum: AudioBuffer;
  #posunSumu = 0;
  /** Časy, kdy doznějí právě znějící zvuky. */
  #konce: number[] = [];
  readonly #naposled = new Map<DruhZvuku, number>();

  #valeni: { zisk: GainNode; filtr: BiquadFilterNode; panorama: StereoPannerNode | null; zdroj: AudioBufferSourceNode } | null = null;

  constructor(ctx: BaseAudioContext, vystup: AudioNode) {
    this.#ctx = ctx;
    this.#vystup = vystup;
    // Dvě sekundy bílého šumu. Stálá násada, aby dva výpočty téhož zvuku vyšly stejně.
    const delka = Math.floor(2 * ctx.sampleRate);
    this.#sum = ctx.createBuffer(1, delka, ctx.sampleRate);
    const vzorky = this.#sum.getChannelData(0);
    let stav = 0x2545f491;
    for (let i = 0; i < delka; i++) {
      stav ^= stav << 13;
      stav ^= stav >>> 17;
      stav ^= stav << 5;
      vzorky[i] = (stav >>> 0) / 2147483648 - 1;
    }
  }

  /** Kolik zvuků zní v čase `kdy` (čas zvukového kontextu). */
  hlasu(kdy: number): number {
    this.#konce = this.#konce.filter((konec) => konec > kdy);
    return this.#konce.length;
  }

  /**
   * Zahraje zvuk v čase `kdy` (čas zvukového kontextu). `panorama` je −1 vlevo až 1 vpravo,
   * `tempo` zpomalí a prohloubí zvuk při zpomaleném přehrávání. Vrací false, když se zvuk
   * vynechal, protože by splynul s jiným.
   */
  zahraj(zvuk: Zvuk, kdy: number, panorama = 0, tempo = 1): boolean {
    const naposled = this.#naposled.get(zvuk.druh);
    if (naposled !== undefined && kdy - naposled < ODSTUP[zvuk.druh] && kdy >= naposled) return false;
    if (this.hlasu(kdy) >= NEJVIC_HLASU && !DULEZITE.has(zvuk.druh)) return false;
    this.#naposled.set(zvuk.druh, kdy);

    const ctx = this.#ctx;
    let cil: AudioNode = this.#vystup;
    let sbernice: AudioNode | null = null;
    if (typeof ctx.createStereoPanner === "function") {
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, panorama));
      pan.connect(this.#vystup);
      cil = pan;
      sbernice = pan;
    }
    const stopa: Stopa = { cil, posledni: null, konec: kdy };
    const k = tempo;
    // Stálá „náhodná“ čísla zvuku: dva zvuky se stejným odstínem zní stejně.
    const n = (i: number): number => {
      const v = Math.sin((zvuk.odstin + 1.37) * (i + 1) * 12.9898) * 43758.5453;
      return v - Math.floor(v);
    };

    switch (zvuk.druh) {
      case "zlom":
        if (zvuk.material === "ocel") this.#zlomOceli(stopa, kdy, zvuk, k, n);
        else if (zvuk.material === "lano") this.#zlomLana(stopa, kdy, zvuk, k);
        else if (zvuk.material === "beton") this.#zlomBetonu(stopa, kdy, zvuk, k, n);
        else this.#zlomDreva(stopa, kdy, zvuk, k, n);
        break;
      case "sjeti":
        this.#sjeti(stopa, kdy, zvuk, k);
        break;
      case "splouchnuti":
        this.#splouchnuti(stopa, kdy, zvuk, k, n);
        break;
      case "dopad":
        this.#dopad(stopa, kdy, zvuk, k, n);
        break;
      case "krok":
        this.#krok(stopa, kdy, zvuk, k, n);
        break;
      case "spara":
        this.#spara(stopa, kdy, zvuk, k);
        break;
      case "vrzani":
        this.#vrzani(stopa, kdy, zvuk, k, n);
        break;
      case "lupnuti":
        this.#lupnuti(stopa, kdy, zvuk, k, n);
        break;
      case "drnceni":
        this.#drnceni(stopa, kdy, zvuk, k, n);
        break;
      case "brnk":
        this.#brnk(stopa, kdy, zvuk, k);
        break;
    }

    if (stopa.posledni) {
      this.#konce.push(stopa.konec);
      stopa.posledni.onended = () => sbernice?.disconnect();
    } else {
      sbernice?.disconnect();
    }
    return true;
  }

  /** Nastaví souvislý hluk kol na mostovce: `uroven` 0 až 1, `panorama` −1 až 1. */
  nastavValeni(uroven: number, panorama: number): void {
    const ctx = this.#ctx;
    if (!this.#valeni) {
      if (!(uroven > 0)) return;
      const zdroj = ctx.createBufferSource();
      zdroj.buffer = this.#sum;
      zdroj.loop = true;
      const filtr = ctx.createBiquadFilter();
      filtr.type = "lowpass";
      filtr.frequency.value = 300;
      filtr.Q.value = 0.6;
      const zisk = ctx.createGain();
      zisk.gain.value = 0;
      const pan = typeof ctx.createStereoPanner === "function" ? ctx.createStereoPanner() : null;
      zdroj.connect(filtr).connect(zisk);
      if (pan) zisk.connect(pan).connect(this.#vystup);
      else zisk.connect(this.#vystup);
      zdroj.start();
      this.#valeni = { zisk, filtr, panorama: pan, zdroj };
    }
    const ted = ctx.currentTime;
    const { zisk, filtr, panorama: pan } = this.#valeni;
    const hladina = Math.max(0, Math.min(1, uroven));
    zisk.gain.setTargetAtTime(0.8 * hladina, ted, 0.07);
    filtr.frequency.setTargetAtTime(260 + 420 * hladina, ted, 0.1);
    pan?.pan.setTargetAtTime(Math.max(-1, Math.min(1, panorama)), ted, 0.1);
  }

  // ---- Stavební kameny ----

  #kmitocet(f: number): number {
    const strop = this.#ctx.sampleRate / 2 - 200;
    return f < 20 ? 20 : f > strop ? strop : f;
  }

  /** Obálka hlasitosti: náběh, výdrž a doznění. Vrací čas, kdy je zvuk neslyšný. */
  #obalka(zisk: AudioParam, kdy: number, hlasitost: number, nabeh: number, vydrz: number, dozvuk: number): number {
    zisk.setValueAtTime(0, kdy);
    zisk.linearRampToValueAtTime(hlasitost, kdy + nabeh);
    zisk.setTargetAtTime(0, kdy + nabeh + vydrz, dozvuk);
    return kdy + nabeh + vydrz + 7 * dozvuk;
  }

  #zapis(stopa: Stopa, zdroj: AudioScheduledSourceNode, konec: number): void {
    if (stopa.posledni === null || konec > stopa.konec) {
      stopa.posledni = zdroj;
      stopa.konec = konec;
    }
  }

  /** Šum protažený filtrem. */
  #sumem(stopa: Stopa, kdy: number, p: Sum): void {
    if (!(p.hlasitost > 0)) return;
    const ctx = this.#ctx;
    const zdroj = ctx.createBufferSource();
    zdroj.buffer = this.#sum;
    zdroj.loop = true;
    const filtr = ctx.createBiquadFilter();
    filtr.type = p.typ;
    filtr.Q.value = p.q ?? 0.7;
    filtr.frequency.setValueAtTime(this.#kmitocet(p.f), kdy);
    const nabeh = p.nabeh ?? 0.001;
    const vydrz = p.vydrz ?? 0;
    if (p.fKonec !== undefined) {
      filtr.frequency.exponentialRampToValueAtTime(this.#kmitocet(p.fKonec), kdy + (p.skluz ?? nabeh + vydrz + 3 * p.dozvuk));
    }
    const zisk = ctx.createGain();
    const konec = this.#obalka(zisk.gain, kdy, p.hlasitost, nabeh, vydrz, p.dozvuk);
    zdroj.connect(filtr).connect(zisk).connect(stopa.cil);
    // Každý šum začíná jinde v zásobě, aby dva po sobě nezněly stejně.
    this.#posunSumu = (this.#posunSumu + 0.3719) % 1.9;
    zdroj.start(kdy, this.#posunSumu);
    zdroj.stop(konec);
    this.#zapis(stopa, zdroj, konec);
  }

  /** Tón, případně klouzavý a protažený rezonancemi. */
  #tonem(stopa: Stopa, kdy: number, p: Ton): void {
    if (!(p.hlasitost > 0)) return;
    const ctx = this.#ctx;
    const zdroj = ctx.createOscillator();
    zdroj.type = p.typ;
    zdroj.frequency.setValueAtTime(this.#kmitocet(p.f), kdy);
    const nabeh = p.nabeh ?? 0.002;
    const vydrz = p.vydrz ?? 0;
    if (p.fKonec !== undefined) {
      zdroj.frequency.exponentialRampToValueAtTime(this.#kmitocet(p.fKonec), kdy + (p.skluz ?? nabeh + vydrz + 3 * p.dozvuk));
    }
    const zisk = ctx.createGain();
    const konec = this.#obalka(zisk.gain, kdy, p.hlasitost, nabeh, vydrz, p.dozvuk);
    if (p.chveni) {
      const chveni = ctx.createOscillator();
      chveni.type = "triangle";
      chveni.frequency.value = p.chveni[0];
      const hloubka = ctx.createGain();
      hloubka.gain.value = p.chveni[1];
      chveni.connect(hloubka).connect(zdroj.frequency);
      chveni.start(kdy);
      chveni.stop(konec);
    }
    let hlava: AudioNode = zdroj;
    if (p.propust !== undefined) {
      const propust = ctx.createBiquadFilter();
      propust.type = "lowpass";
      propust.frequency.value = this.#kmitocet(p.propust);
      hlava.connect(propust);
      hlava = propust;
    }
    if (p.rezonance && p.rezonance.length > 0) {
      for (const [f, q] of p.rezonance) {
        const filtr = ctx.createBiquadFilter();
        filtr.type = "bandpass";
        filtr.frequency.value = this.#kmitocet(f);
        filtr.Q.value = q;
        hlava.connect(filtr).connect(zisk);
      }
    } else {
      hlava.connect(zisk);
    }
    zisk.connect(stopa.cil);
    zdroj.start(kdy);
    zdroj.stop(konec);
    this.#zapis(stopa, zdroj, konec);
  }

  // ---- Zvuky ----

  /** Dřevo praskne: ostrý náraz, dutý úder trámu a několik třísek těsně po sobě. */
  #zlomDreva(b: Stopa, t: number, z: Zvuk, k: number, n: (i: number) => number): void {
    const s = 0.6 * z.sila;
    this.#sumem(b, t, { typ: "bandpass", f: 2400 * k, q: 0.7, nabeh: 0.001, dozvuk: 0.022 / k, hlasitost: 1.5 * s });
    this.#sumem(b, t, { typ: "highpass", f: 5000 * k, nabeh: 0.0005, dozvuk: 0.008 / k, hlasitost: 0.6 * s });
    const zaklad = (210 - 110 * z.velikost) * k;
    this.#tonem(b, t, { typ: "sine", f: zaklad * 1.6, fKonec: zaklad * 0.7, skluz: 0.09 / k, dozvuk: 0.07 / k, hlasitost: 0.8 * s });
    this.#tonem(b, t, { typ: "triangle", f: zaklad * 3.1, fKonec: zaklad * 2.2, skluz: 0.05 / k, nabeh: 0.001, dozvuk: 0.03 / k, hlasitost: 0.3 * s });
    const trisek = 3 + Math.floor(n(1) * 4);
    let kdy = t;
    for (let i = 0; i < trisek; i++) {
      kdy += (0.012 + 0.06 * n(2 + i)) / k;
      this.#sumem(b, kdy, {
        typ: "bandpass",
        f: (1600 + 3200 * n(10 + i)) * k,
        q: 2.5,
        nabeh: 0.0005,
        dozvuk: (0.006 + 0.01 * n(20 + i)) / k,
        hlasitost: (0.5 + 0.8 * n(30 + i)) * s,
      });
    }
  }

  /** Ocel povolí: cvaknutí, zazvonění prutu a temný ráz. */
  #zlomOceli(b: Stopa, t: number, z: Zvuk, k: number, n: (i: number) => number): void {
    const s = 0.55 * z.sila;
    this.#sumem(b, t, { typ: "highpass", f: 3500 * k, nabeh: 0.0005, dozvuk: 0.006 / k, hlasitost: 0.9 * s });
    const zaklad = (520 - 300 * z.velikost) * k * (0.94 + 0.12 * n(1));
    for (let i = 0; i < TONY_OCELI.length; i++) {
      this.#tonem(b, t, {
        typ: "sine",
        f: zaklad * TONY_OCELI[i]! * (1 + 0.004 * (n(i + 2) - 0.5)),
        nabeh: 0.001,
        dozvuk: DOZVUKY_OCELI[i]! / k,
        hlasitost: SILY_OCELI[i]! * s,
      });
    }
    this.#tonem(b, t, { typ: "sine", f: 95 * k, fKonec: 50 * k, skluz: 0.12 / k, dozvuk: 0.06 / k, hlasitost: 0.6 * s });
  }

  /** Lano praskne: švihnutí a klesající drnknutí uvolněného konce. */
  #zlomLana(b: Stopa, t: number, z: Zvuk, k: number): void {
    const s = z.sila;
    this.#sumem(b, t, { typ: "bandpass", f: 3800 * k, q: 0.9, nabeh: 0.0005, dozvuk: 0.01 / k, hlasitost: 1.6 * s });
    this.#tonem(b, t, {
      typ: "sawtooth",
      f: 950 * k,
      fKonec: 110 * k,
      skluz: 0.22 / k,
      dozvuk: 0.09 / k,
      hlasitost: 0.4 * s,
      propust: 2400 * k,
    });
    this.#tonem(b, t, { typ: "sine", f: 1900 * k, fKonec: 1700 * k, skluz: 0.2 / k, nabeh: 0.001, dozvuk: 0.12 / k, hlasitost: 0.14 * s });
  }

  /** Beton se drtí: temný ráz a sypající se úlomky. */
  #zlomBetonu(b: Stopa, t: number, z: Zvuk, k: number, n: (i: number) => number): void {
    const s = z.sila;
    this.#sumem(b, t, { typ: "lowpass", f: 420 * k, nabeh: 0.003, dozvuk: 0.14 / k, hlasitost: 1.6 * s });
    this.#tonem(b, t, { typ: "sine", f: 75 * k, fKonec: 38 * k, skluz: 0.25 / k, dozvuk: 0.13 / k, hlasitost: 0.9 * s });
    const ulomku = 5 + Math.floor(n(1) * 4);
    for (let i = 0; i < ulomku; i++) {
      this.#sumem(b, t + (0.03 + 0.5 * n(2 + i)) / k, {
        typ: "bandpass",
        f: (700 + 1100 * n(10 + i)) * k,
        q: 1.5,
        dozvuk: (0.015 + 0.015 * n(20 + i)) / k,
        hlasitost: (0.4 + 0.5 * n(30 + i)) * s,
      });
    }
  }

  /** Konec mostu sjede z ložiska: skřípavý smyk a ráz o opěru. */
  #sjeti(b: Stopa, t: number, z: Zvuk, k: number): void {
    const s = z.sila;
    this.#sumem(b, t, {
      typ: "bandpass",
      f: 900 * k,
      fKonec: 350 * k,
      skluz: 0.2 / k,
      q: 3,
      nabeh: 0.03 / k,
      vydrz: 0.06 / k,
      dozvuk: 0.04 / k,
      hlasitost: 1.6 * s,
    });
    this.#tonem(b, t, {
      typ: "sawtooth",
      f: 70 * k,
      fKonec: 45 * k,
      skluz: 0.2 / k,
      nabeh: 0.02 / k,
      vydrz: 0.08 / k,
      dozvuk: 0.03 / k,
      hlasitost: 0.5 * s,
      rezonance: [[420 * k, 5]],
    });
    const raz = t + 0.16 / k;
    this.#tonem(b, raz, { typ: "sine", f: 110 * k, fKonec: 48 * k, skluz: 0.15 / k, dozvuk: 0.09 / k, hlasitost: 0.9 * s });
    this.#sumem(b, raz, { typ: "lowpass", f: 700 * k, dozvuk: 0.04 / k, hlasitost: 1.2 * s });
  }

  /** Šplouchnutí: plácnutí o hladinu, roztříštěná voda, sprška a pár kapek. */
  #splouchnuti(b: Stopa, t: number, z: Zvuk, k: number, n: (i: number) => number): void {
    const s = z.sila;
    const v = z.velikost;
    this.#sumem(b, t, { typ: "lowpass", f: (2400 - 900 * v) * k, q: 0.5, nabeh: 0.003, dozvuk: (0.05 + 0.05 * v) / k, hlasitost: 1.1 * s });
    this.#sumem(b, t + 0.02 / k, {
      typ: "bandpass",
      f: (650 - 250 * v) * k,
      fKonec: (1700 - 500 * v) * k,
      skluz: (0.3 + 0.2 * v) / k,
      q: 0.8,
      nabeh: 0.04 / k,
      dozvuk: (0.16 + 0.2 * v) / k,
      hlasitost: 1.3 * s,
    });
    this.#sumem(b, t + 0.05 / k, { typ: "highpass", f: 2800 * k, q: 0.5, nabeh: 0.08 / k, dozvuk: (0.22 + 0.25 * v) / k, hlasitost: 0.2 * s });
    this.#tonem(b, t, {
      typ: "sine",
      f: (330 - 170 * v) * k,
      fKonec: (120 - 60 * v) * k,
      skluz: 0.14 / k,
      nabeh: 0.004,
      dozvuk: (0.06 + 0.06 * v) / k,
      hlasitost: 0.55 * s,
    });
    const kapek = 3 + Math.floor(n(1) * 4);
    for (let i = 0; i < kapek; i++) {
      const f = (1300 + 2200 * n(10 + i)) * k;
      this.#tonem(b, t + (0.25 + 0.7 * n(2 + i)) / k, {
        typ: "sine",
        f,
        fKonec: 1.25 * f,
        skluz: 0.03 / k,
        dozvuk: 0.018 / k,
        hlasitost: (0.05 + 0.08 * n(20 + i)) * s,
      });
    }
  }

  /** Dopad na zem: tupý úder; u vozidla plech, u trámu klepnutí, u oceli zazvonění. */
  #dopad(b: Stopa, t: number, z: Zvuk, k: number, n: (i: number) => number): void {
    const s = z.sila;
    const v = z.velikost;
    this.#tonem(b, t, {
      typ: "sine",
      f: (150 - 70 * v) * k,
      fKonec: (58 - 22 * v) * k,
      skluz: 0.16 / k,
      dozvuk: (0.07 + 0.08 * v) / k,
      hlasitost: 0.95 * s,
    });
    this.#sumem(b, t, { typ: "lowpass", f: (900 - 400 * v) * k, dozvuk: (0.03 + 0.04 * v) / k, hlasitost: 1.3 * s });
    if (z.puvod >= 0 && v > 0.5) {
      this.#sumem(b, t, { typ: "bandpass", f: 2600 * k, q: 1.2, dozvuk: 0.05 / k, hlasitost: 0.6 * s });
      this.#sumem(b, t + 0.07 / k, { typ: "bandpass", f: 1900 * k, q: 2, dozvuk: 0.03 / k, hlasitost: 0.35 * s });
    } else if (z.material === "ocel" && z.puvod < 0) {
      this.#tonem(b, t, { typ: "sine", f: 700 * k * (0.9 + 0.2 * n(1)), nabeh: 0.001, dozvuk: 0.12 / k, hlasitost: 0.15 * s });
    } else if (z.puvod < 0) {
      this.#tonem(b, t, { typ: "triangle", f: 420 * k, fKonec: 260 * k, skluz: 0.04 / k, nabeh: 0.001, dozvuk: 0.025 / k, hlasitost: 0.3 * s });
    }
  }

  /** Došlap na mostovku. Víc lidí najednou zní jako dupnutí útvaru. */
  #krok(b: Stopa, t: number, z: Zvuk, k: number, n: (i: number) => number): void {
    const lidi = z.velikost;
    const dupnuti = (kdy: number, s: number): void => {
      if (z.material === "beton") {
        this.#sumem(b, kdy, { typ: "bandpass", f: 1500 * k, q: 1.2, dozvuk: 0.008 / k, hlasitost: 0.9 * s });
        this.#tonem(b, kdy, { typ: "sine", f: 110 * k, fKonec: 70 * k, skluz: 0.04 / k, dozvuk: 0.02 / k, hlasitost: 0.3 * s });
        return;
      }
      this.#tonem(b, kdy, {
        typ: "sine",
        f: (165 - 40 * lidi) * k * (0.94 + 0.12 * n(1)),
        fKonec: 80 * k,
        skluz: 0.05 / k,
        dozvuk: 0.028 / k,
        hlasitost: 0.8 * s,
      });
      this.#sumem(b, kdy, { typ: "lowpass", f: 850 * k, dozvuk: 0.014 / k, hlasitost: 1.1 * s });
      this.#sumem(b, kdy, { typ: "bandpass", f: 2200 * k, q: 1.5, nabeh: 0.0005, dozvuk: 0.005 / k, hlasitost: 0.4 * s });
      if (z.material === "ocel") {
        this.#tonem(b, kdy, { typ: "sine", f: 620 * k, nabeh: 0.001, dozvuk: 0.05 / k, hlasitost: 0.1 * s });
      }
    };
    dupnuti(t, z.sila);
    if (lidi > 0.15) {
      // Útvar nedošlápne úplně naráz.
      dupnuti(t + 0.009 / k, 0.45 * z.sila);
      dupnuti(t + 0.021 / k, 0.3 * z.sila);
    }
  }

  /** Kolo na spáře mostovky: u auta temné žuchnutí, u jízdního kola klapnutí. */
  #spara(b: Stopa, t: number, z: Zvuk, k: number): void {
    const s = z.sila;
    if (z.velikost < 0.4) {
      this.#sumem(b, t, { typ: "bandpass", f: 1400 * k, q: 2, nabeh: 0.0005, dozvuk: 0.008 / k, hlasitost: 1.4 * s });
      this.#tonem(b, t, { typ: "sine", f: 240 * k, fKonec: 170 * k, skluz: 0.03 / k, dozvuk: 0.018 / k, hlasitost: 0.45 * s });
      return;
    }
    this.#sumem(b, t, { typ: "lowpass", f: 380 * k, dozvuk: 0.03 / k, hlasitost: 1.8 * s });
    this.#tonem(b, t, { typ: "sine", f: 105 * k, fKonec: 55 * k, skluz: 0.08 / k, dozvuk: 0.05 / k, hlasitost: 0.9 * s });
    this.#sumem(b, t, { typ: "bandpass", f: 1800 * k, q: 1, nabeh: 0.0005, dozvuk: 0.006 / k, hlasitost: 0.4 * s });
  }

  /**
   * Vrzání: prut se v uložení po kouscích zadrhává a pouští. Pilový tón o desítkách hertzů
   * klouže a rozeznívá rezonance materiálu; ocel sténá hlouběji a déle než dřevo.
   */
  #vrzani(b: Stopa, t: number, z: Zvuk, k: number, n: (i: number) => number): void {
    const s = z.sila;
    if (z.material === "ocel" || z.material === "beton") {
      const delka = (0.22 + 0.4 * n(1) + 0.15 * s) / k;
      const f = (26 + 30 * n(2)) * k;
      this.#tonem(b, t, {
        typ: "sawtooth",
        f,
        fKonec: f * (1.1 + 0.4 * n(3)),
        skluz: delka,
        nabeh: 0.06 / k,
        vydrz: delka,
        dozvuk: 0.05 / k,
        hlasitost: 1.7 * s,
        chveni: [(9 + 14 * n(6)) * k, 0.1 * f],
        rezonance: [
          [(240 + 200 * n(4)) * k, 14],
          [(700 + 500 * n(5)) * k, 16],
        ],
      });
      return;
    }
    const delka = (0.08 + 0.26 * n(1) + 0.14 * s) / k;
    const f = (55 + 120 * n(2)) * (1.2 - 0.5 * z.velikost) * k;
    this.#tonem(b, t, {
      typ: "sawtooth",
      f,
      fKonec: f * (0.7 + 0.9 * n(3)),
      skluz: delka,
      nabeh: 0.025 / k,
      vydrz: delka,
      dozvuk: 0.035 / k,
      hlasitost: 1.5 * s,
      chveni: [(17 + 30 * n(6)) * k, 0.16 * f],
      rezonance: [
        [(480 + 520 * n(4)) * k, 9],
        [(1500 + 1400 * n(5)) * k, 12],
      ],
    });
  }

  /** Lupnutí dřeva nebo cinknutí oceli a lana těsně před porušením. */
  #lupnuti(b: Stopa, t: number, z: Zvuk, k: number, n: (i: number) => number): void {
    const s = z.sila;
    if (z.material === "drevo") {
      this.#sumem(b, t, { typ: "bandpass", f: (2600 + 2600 * n(1)) * k, q: 3, nabeh: 0.0004, dozvuk: 0.004 / k, hlasitost: 1.8 * s });
      const f = (800 + 500 * n(2)) * k;
      this.#tonem(b, t, { typ: "sine", f, fKonec: 0.6 * f, skluz: 0.012 / k, nabeh: 0.0005, dozvuk: 0.006 / k, hlasitost: 0.3 * s });
      return;
    }
    const f = (2300 + 1500 * n(1)) * k;
    this.#tonem(b, t, { typ: "sine", f, nabeh: 0.0005, dozvuk: 0.035 / k, hlasitost: 0.18 * s });
    this.#tonem(b, t, { typ: "sine", f: 2.71 * f, nabeh: 0.0005, dozvuk: 0.02 / k, hlasitost: 0.07 * s });
    this.#sumem(b, t, { typ: "highpass", f: 6000 * k, nabeh: 0.0003, dozvuk: 0.002 / k, hlasitost: 0.25 * s });
  }

  /** Drnčení rozhoupané mostovky: pár rychlých klepnutí fošen o sebe. */
  #drnceni(b: Stopa, t: number, z: Zvuk, k: number, n: (i: number) => number): void {
    const klepnuti = 2 + Math.floor(n(1) * 2);
    let kdy = t;
    for (let i = 0; i < klepnuti; i++) {
      const s = z.sila * (1 - 0.25 * i);
      if (z.material === "drevo") {
        this.#sumem(b, kdy, { typ: "bandpass", f: (800 + 900 * n(2 + i)) * k, q: 5, nabeh: 0.0005, dozvuk: 0.009 / k, hlasitost: 2.2 * s });
        this.#tonem(b, kdy, { typ: "sine", f: (190 + 80 * n(6 + i)) * k, nabeh: 0.001, dozvuk: 0.012 / k, hlasitost: 0.25 * s });
      } else {
        this.#sumem(b, kdy, { typ: "bandpass", f: (1800 + 1500 * n(2 + i)) * k, q: 6, nabeh: 0.0005, dozvuk: 0.007 / k, hlasitost: 1.6 * s });
        this.#tonem(b, kdy, { typ: "sine", f: (900 + 700 * n(6 + i)) * k, nabeh: 0.001, dozvuk: 0.03 / k, hlasitost: 0.12 * s });
      }
      kdy += (0.022 + 0.02 * n(10 + i)) / k;
    }
  }

  /** Brnknutí: most se pustí z napnuté polohy. */
  #brnk(b: Stopa, t: number, z: Zvuk, k: number): void {
    const s = z.sila;
    this.#tonem(b, t, { typ: "triangle", f: 82 * k, fKonec: 70 * k, skluz: 0.4 / k, nabeh: 0.004, dozvuk: 0.22 / k, hlasitost: 0.7 * s });
    this.#tonem(b, t, { typ: "sine", f: 164 * k, nabeh: 0.003, dozvuk: 0.12 / k, hlasitost: 0.25 * s });
    this.#sumem(b, t, { typ: "bandpass", f: 1200 * k, q: 1, dozvuk: 0.008 / k, hlasitost: 0.6 * s });
  }
}
