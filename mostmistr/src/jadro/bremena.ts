// Břemena: všechno, co po trase jede a tlačí na mostovku.
//
// Břemeno je buď pouhá síla (stálá tíha jedoucí předepsanou rychlostí), nebo styčník
// soustavy spojený s mostovkou pružinou a tlumičem: kolo na pneumatice, tělo chodce.
// Styčník patří do soustavy, takže jeho pohyb počítá integrátor spolu s mostem; vodorovně
// ho vede předepsaná rychlost (zadržený posun x s nenulovou rychlostí). Ke každému břemenu
// může patřit budicí síla s periodou kroku: tu přenáší jen mostovka.
//
// Kontakt je jednostranný: břemeno mostovku tlačí, ale netahá. Mimo okraje trasy jede
// po pevné zemi; kde mostovka chybí, ztrácí oporu a padá.

import type { Zatizeni } from "./simulace";
import type { Soustava } from "./soustava";
import { mistoNaPrvku, najdiPrvekTrasy, prestavTrasu, vyskaNaPrvku, type Trasa } from "./trasa";
import { pridejSiluNaPrvek } from "./zatizeni";

/** Břemeno jede po pevné zemi před mostem nebo za ním. */
export const NA_ZEMI = -1;
/** Břemeno nemá pod sebou nic. */
export const BEZ_OPORY = -2;

export interface PopisBremene {
  /** Styčník soustavy, který břemeno nese; bez něj je břemeno pouhá síla. */
  stycnik?: number;
  /** Výchozí poloha a rychlost síly bez styčníku (m, m/s; záporná rychlost jede doleva). */
  x?: number;
  rychlost?: number;
  /** Stálá síla dolů v newtonech (jen bez styčníku). */
  tiha?: number;
  /** Tuhost a tlumení kontaktu styčníku s mostovkou, N/m a N·s/m. */
  tuhost?: number;
  tlumeni?: number;
  /** Výška styčníku nad povrchem, při které je pružina kontaktu bez napětí. */
  vyskaNad?: number;
  /** Budicí síla: frekvence v Hz a amplitudy harmonických složek v newtonech. */
  buzeni?: {
    frekvence: number;
    /** Dvojice (sinová, kosinová složka) pro první až třetí harmonickou; chybějící jsou nula. */
    amplitudy: number[];
    /** Výchozí fáze jako jednotkový vektor (cos, sin); výchozí je nulová fáze. */
    faze?: [number, number];
  };
}

export interface Bremena {
  trasa: Trasa;
  pocet: number;
  stycnik: Int32Array;
  x: Float64Array;
  rychlost: Float64Array;
  tiha: Float64Array;
  tuhost: Float64Array;
  tlumeni: Float64Array;
  vyskaNad: Float64Array;
  frekvence: Float64Array;
  /** Šest amplitud na břemeno: sin a cos první, druhé a třetí harmonické. */
  amplitudy: Float64Array;
  /** Fáze buzení jako jednotkový vektor a otočení, o které se za krok posune. */
  fazeCos: Float64Array;
  fazeSin: Float64Array;
  krokCos: Float64Array;
  krokSin: Float64Array;
  /** Index v seznamu trasy, kde břemeno naposledy bylo. */
  pole: Int32Array;
  /** Výška povrchu pod břemenem teď a o krok dřív; z rozdílu se určí rychlost pro tlumení. */
  vyska: Float64Array;
  vyskaMinula: Float64Array;
  /** Výsledky posledního výpočtu: síla na mostovku (kladná dolů) a prvek pod břemenem. */
  sila: Float64Array;
  prvek: Int32Array;
  dt: number;
}

export function vytvorBremena(trasa: Trasa, popisy: readonly PopisBremene[]): Bremena {
  const n = popisy.length;
  const b: Bremena = {
    trasa,
    pocet: n,
    stycnik: new Int32Array(n).fill(-1),
    x: new Float64Array(n),
    rychlost: new Float64Array(n),
    tiha: new Float64Array(n),
    tuhost: new Float64Array(n),
    tlumeni: new Float64Array(n),
    vyskaNad: new Float64Array(n),
    frekvence: new Float64Array(n),
    amplitudy: new Float64Array(6 * n),
    fazeCos: new Float64Array(n).fill(1),
    fazeSin: new Float64Array(n),
    krokCos: new Float64Array(n).fill(1),
    krokSin: new Float64Array(n),
    pole: new Int32Array(n),
    vyska: new Float64Array(n).fill(Number.NaN),
    vyskaMinula: new Float64Array(n).fill(Number.NaN),
    sila: new Float64Array(n),
    prvek: new Int32Array(n).fill(BEZ_OPORY),
    dt: 0,
  };
  popisy.forEach((p, i) => {
    b.stycnik[i] = p.stycnik ?? -1;
    b.x[i] = p.x ?? 0;
    b.rychlost[i] = p.rychlost ?? 0;
    b.tiha[i] = p.tiha ?? 0;
    b.tuhost[i] = p.tuhost ?? 0;
    b.tlumeni[i] = p.tlumeni ?? 0;
    b.vyskaNad[i] = p.vyskaNad ?? 0;
    if (p.buzeni) {
      b.frekvence[i] = p.buzeni.frekvence;
      for (let k = 0; k < 6; k++) b.amplitudy[6 * i + k] = p.buzeni.amplitudy[k] ?? 0;
      if (p.buzeni.faze) {
        b.fazeCos[i] = p.buzeni.faze[0];
        b.fazeSin[i] = p.buzeni.faze[1];
      }
    }
  });
  return b;
}

/**
 * Otočení fáze za krok `dt`. Místo sinu a kosinu se použije racionální (Cayleyho) vzorec
 * s tangentou polovičního úhlu z mocninné řady; úhel je nejvýš setiny radiánu, takže
 * čtyři členy řady dávají plnou přesnost a výsledek je ve všech prohlížečích bitově stejný.
 */
export function nastavKrokBremen(b: Bremena, dt: number): void {
  b.dt = dt;
  for (let i = 0; i < b.pocet; i++) {
    const pul = Math.PI * b.frekvence[i]! * dt;
    const p2 = pul * pul;
    const t = pul * (1 + p2 * (1 / 3 + p2 * (2 / 15 + (p2 * 17) / 315)));
    const jmenovatel = 1 / (1 + t * t);
    b.krokCos[i] = (1 - t * t) * jmenovatel;
    b.krokSin[i] = 2 * t * jmenovatel;
  }
}

/** Posune síly bez styčníku a fáze buzení o krok. */
export function posunBremena(b: Bremena): void {
  const { x, rychlost, stycnik, fazeCos, fazeSin, krokCos, krokSin, vyska, vyskaMinula } = b;
  const dt = b.dt;
  for (let i = 0; i < b.pocet; i++) {
    if (stycnik[i]! < 0) x[i] = x[i]! + rychlost[i]! * dt;
    const c = fazeCos[i]!;
    const sn = fazeSin[i]!;
    fazeCos[i] = c * krokCos[i]! - sn * krokSin[i]!;
    fazeSin[i] = sn * krokCos[i]! + c * krokSin[i]!;
    vyskaMinula[i] = vyska[i]!;
  }
}

/**
 * Spočítá kontaktní síly břemen pro okamžitý stav a přičte je ke styčníkům a prvkům.
 * Vlastní stav nemění (kromě odhadu polohy na trase a výsledků), takže se smí pro stejný
 * čas volat opakovaně.
 */
export function pridejSilyBremen(s: Soustava, b: Bremena): void {
  const { trasa, stycnik, pole, vyska, vyskaMinula, sila, prvek, amplitudy } = b;
  const { prvky } = trasa;
  for (let i = 0; i < b.pocet; i++) {
    const uzel = stycnik[i]!;
    const x = uzel >= 0 ? s.x[uzel]! : b.x[i]!;

    // Co je pod břemenem.
    let e = NA_ZEMI;
    let xi = 0;
    let povrch: number;
    if (x < trasa.xLevy) povrch = trasa.yLevy;
    else if (x > trasa.xPravy) povrch = trasa.yPravy;
    else {
      const j = najdiPrvekTrasy(s, trasa, x, pole[i]!);
      if (j < 0) {
        e = BEZ_OPORY;
        povrch = Number.NaN;
      } else {
        pole[i] = j;
        e = prvky[j]!;
        povrch = vyskaNaPrvku(s, e, x);
        xi = mistoNaPrvku;
      }
    }
    vyska[i] = povrch;
    prvek[i] = e;
    if (e === BEZ_OPORY) {
      sila[i] = 0;
      continue;
    }

    let tlak: number;
    if (uzel >= 0) {
      // Pružina a tlumič mezi styčníkem a povrchem; rychlost povrchu pod jedoucím
      // břemenem z rozdílu výšek zahrnuje průhyb mostu i sklon, po kterém břemeno jede.
      const minula = vyskaMinula[i]!;
      const rychlostPovrchu = minula === minula && b.dt > 0 ? (povrch - minula) / b.dt : 0;
      tlak =
        b.tuhost[i]! * (povrch + b.vyskaNad[i]! - s.y[uzel]!) +
        b.tlumeni[i]! * (rychlostPovrchu - s.vy[uzel]!);
      if (tlak < 0) tlak = 0; // břemeno odskočilo
      s.fy[uzel] = s.fy[uzel]! + tlak;
    } else {
      tlak = b.tiha[i]!;
    }

    if (b.frekvence[i] !== 0 && tlak > 0) {
      // Harmonické složky z fáze základní frekvence, bez goniometrie:
      // sin 2φ = 2sc, cos 2φ = c² − s², sin 3φ = s(3 − 4s²), cos 3φ = c(4c² − 3).
      const c = b.fazeCos[i]!;
      const sn = b.fazeSin[i]!;
      const k = 6 * i;
      tlak +=
        amplitudy[k]! * sn +
        amplitudy[k + 1]! * c +
        amplitudy[k + 2]! * (2 * sn * c) +
        amplitudy[k + 3]! * (c * c - sn * sn) +
        amplitudy[k + 4]! * (sn * (3 - 4 * sn * sn)) +
        amplitudy[k + 5]! * (c * (4 * c * c - 3));
      if (tlak < 0) tlak = 0;
    }
    sila[i] = tlak;
    if (e >= 0 && tlak !== 0) pridejSiluNaPrvek(s, e, xi, 0, -tlak);
  }
}

/** Zabalí břemena do rozhraní, které volá simulace. */
export function zatizeniBremeny(b: Bremena): Zatizeni {
  return {
    pridejSily: (s) => pridejSilyBremen(s, b),
    posun: () => posunBremena(b),
    poZmene: (s) => prestavTrasu(s, b.trasa),
    zmenaKroku: (dt) => nastavKrokBremen(b, dt),
  };
}
