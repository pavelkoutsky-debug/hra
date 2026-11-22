// Břemena: všechno, co po trase jede a tlačí na mostovku.
//
// Břemeno je buď pouhá síla (stálá tíha jedoucí předepsanou rychlostí), nebo styčník
// soustavy spojený s mostovkou pružinou a tlumičem: kolo na pneumatice, tělo chodce.
// Styčník patří do soustavy, takže jeho pohyb počítá integrátor spolu s mostem; vodorovně
// ho vede předepsaná rychlost (zadržený posun x s nenulovou rychlostí). Ke každému břemenu
// může patřit budicí síla s periodou kroku: tu přenáší jen mostovka.
//
// Kontakt styčníku je jednostranný: břemeno mostovku tlačí, ale netahá. Síla bez styčníku
// je předepsaná včetně znaménka. Mimo okraje trasy jede břemeno po pevné zemi; kde
// mostovka chybí, ztrácí oporu a padá.

import { vyskaNerovnosti, type Nerovnost } from "./nerovnost";
import type { Zatizeni } from "./simulace";
import type { Soustava } from "./soustava";
import { mistoNaPrvku, najdiPrvekTrasy, prestavTrasu, vyskaNaPrvku, vyskaSpojnice, type Trasa } from "./trasa";
import { pridejSiluNaPrvek } from "./zatizeni";

/** Břemeno jede po pevné zemi před mostem nebo za ním. */
export const NA_ZEMI = -1;
/** Břemeno nemá pod sebou nic. */
export const BEZ_OPORY = -2;

/**
 * Největší stlačení pružiny kontaktu v metrech. Když je povrch nad styčníkem výš, nejde
 * o dosednutí: styčník je pod utrženým kusem mostovky, který se přes něj jen promítá.
 */
const NEJVETSI_STLACENI = 0.5;
/** Kolik kol se nanejvýš sejde na jednom prvku mostovky; pro odhad kroku výpočtu. */
const KOL_NA_PRVKU = 3;
/**
 * Ztráta kroku. Na silně rozhoupané mostovce člověk přestane držet rytmus, zpomalí a chytá
 * rovnováhu, takže síla, kterou do mostu vnáší, s kmitáním neroste donekonečna. Do zrychlení
 * `ZTRATA_OD` (m/s², hranice nepřijatelného kmitání) budí naplno, pak budicí síla lineárně
 * slábne až na `ZBYTEK_BUZENI` při `ZTRATA_DO`. Mosty, které kmitají přijatelně, to nemění.
 */
export const ZTRATA_OD = 2.5;
export const ZTRATA_DO = 6;
export const ZBYTEK_BUZENI = 0.25;
/** Jak dlouho člověku trvá, než rozhoupání mostovky pocítí a než ho zase přestane cítit, s. */
const DOBA_HOUPANI = 0.5;

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
  /** Kolo jede po nerovnostech vozovky (když je trasa má); chodci ne. */
  poNerovnostech?: boolean;
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
  /** Výškový profil vozovky, po kterém jedou kola; null je dokonale rovná vozovka. */
  profil: Nerovnost | null;
  /** Pro každé břemeno: 1, když jede po nerovnostech (kola), 0, když ne (chodci, síly). */
  poNerovnostech: Uint8Array;
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
  /** Výška povrchu pod břemenem (včetně průhybu prvku), pro kreslení. */
  vyska: Float64Array;
  /** Výška spojnice styčníků pod břemenem teď a o krok dřív; z rozdílu je rychlost pro tlumení. */
  spojnice: Float64Array;
  spojniceMinula: Float64Array;
  /** Výsledky posledního výpočtu: síla na mostovku (kladná dolů) a prvek pod břemenem. */
  sila: Float64Array;
  prvek: Int32Array;
  /** Břemeno je vypnuté (1): s trasou se nestýká a nic nepřenáší, například po pádu z mostu. */
  vypnuto: Uint8Array;
  /**
   * Jak moc se mostovka pod břemenem houpe: vyhlazená velikost její svislé rychlosti, m/s.
   * Vede se jen u břemen s budicí silou (lidí); podle ní člověk ztrácí krok.
   */
  houpani: Float64Array;
  dt: number;
}

export function vytvorBremena(trasa: Trasa, popisy: readonly PopisBremene[], profil: Nerovnost | null = null): Bremena {
  const n = popisy.length;
  const b: Bremena = {
    trasa,
    profil,
    poNerovnostech: new Uint8Array(n),
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
    spojnice: new Float64Array(n).fill(Number.NaN),
    spojniceMinula: new Float64Array(n).fill(Number.NaN),
    sila: new Float64Array(n),
    prvek: new Int32Array(n).fill(BEZ_OPORY),
    vypnuto: new Uint8Array(n),
    houpani: new Float64Array(n),
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
    b.poNerovnostech[i] = p.poNerovnostech && p.stycnik !== undefined ? 1 : 0;
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
  for (let i = 0; i < b.pocet; i++) nastavKrokFaze(b, i);
}

/** Otočení fáze jednoho břemene za krok výpočtu podle jeho frekvence. */
function nastavKrokFaze(b: Bremena, i: number): void {
  const pul = Math.PI * b.frekvence[i]! * b.dt;
  const p2 = pul * pul;
  const t = pul * (1 + p2 * (1 / 3 + p2 * (2 / 15 + (p2 * 17) / 315)));
  const jmenovatel = 1 / (1 + t * t);
  b.krokCos[i] = (1 - t * t) * jmenovatel;
  b.krokSin[i] = 2 * t * jmenovatel;
}

/** Posune síly bez styčníku a fáze buzení o krok. */
export function posunBremena(b: Bremena): void {
  const { x, rychlost, stycnik, fazeCos, fazeSin, krokCos, krokSin, spojnice, spojniceMinula, houpani } = b;
  const dt = b.dt;
  const prizpusobeni = dt < DOBA_HOUPANI ? dt / DOBA_HOUPANI : 1;
  for (let i = 0; i < b.pocet; i++) {
    if (stycnik[i]! < 0) x[i] = x[i]! + rychlost[i]! * dt;
    const c = fazeCos[i]!;
    const sn = fazeSin[i]!;
    fazeCos[i] = c * krokCos[i]! - sn * krokSin[i]!;
    fazeSin[i] = sn * krokCos[i]! + c * krokSin[i]!;
    // Rozhoupání mostovky pod člověkem; na pevné zemi a ve vzduchu odeznívá.
    if (b.frekvence[i] !== 0 && stycnik[i]! >= 0) {
      const ted = spojnice[i]!;
      const minula = spojniceMinula[i]!;
      let rychlostPovrchu = 0;
      if (b.prvek[i]! >= 0 && ted === ted && minula === minula && dt > 0) {
        rychlostPovrchu = (ted - minula) / dt;
        if (rychlostPovrchu < 0) rychlostPovrchu = -rychlostPovrchu;
      }
      houpani[i] = houpani[i]! + (rychlostPovrchu - houpani[i]!) * prizpusobeni;
    }
    spojniceMinula[i] = spojnice[i]!;
  }
}

/**
 * Jakou částí své budicí síly člověk mostovku právě budí: 1, dokud se pod ním houpe
 * přijatelně, méně, když ztrácí krok. Zrychlení mostovky se odhaduje z vyhlazené rychlosti
 * a z frekvence kroku: při rezonanci kmitá most právě v rytmu, který ho budí, a střední
 * velikost rychlosti harmonického kmitu je 2/π jeho amplitudy.
 */
export function podilBuzeni(b: Bremena, i: number): number {
  const zrychleni = Math.PI * Math.PI * b.frekvence[i]! * b.houpani[i]!;
  if (!(zrychleni > ZTRATA_OD)) return 1;
  if (zrychleni >= ZTRATA_DO) return ZBYTEK_BUZENI;
  return 1 - ((1 - ZBYTEK_BUZENI) * (zrychleni - ZTRATA_OD)) / (ZTRATA_DO - ZTRATA_OD);
}

/**
 * Změní budicí sílu břemene za běhu: frekvenci, amplitudy šesti složek a fázi. Slouží
 * lidem, kteří se zastaví, začnou skákat nebo se zase rozejdou, a budiči, který se přelaďuje.
 */
export function nastavBuzeni(
  b: Bremena,
  i: number,
  frekvence: number,
  amplitudy: readonly number[],
  fazeCos: number,
  fazeSin: number,
): void {
  b.frekvence[i] = frekvence;
  for (let k = 0; k < 6; k++) b.amplitudy[6 * i + k] = amplitudy[k] ?? 0;
  b.fazeCos[i] = fazeCos;
  b.fazeSin[i] = fazeSin;
  nastavKrokFaze(b, i);
}

/** Změní jen frekvenci budicí síly a fázi nechá běžet dál (přelaďování budiče). */
export function nastavFrekvenci(b: Bremena, i: number, frekvence: number): void {
  b.frekvence[i] = frekvence;
  nastavKrokFaze(b, i);
}

/**
 * Spočítá kontaktní síly břemen pro okamžitý stav a přičte je ke styčníkům a prvkům.
 * Vlastní stav nemění (kromě odhadu polohy na trase a výsledků), takže se smí pro stejný
 * čas volat opakovaně.
 */
export function pridejSilyBremen(s: Soustava, b: Bremena): void {
  const { trasa, stycnik, pole, vyska, spojnice, spojniceMinula, sila, prvek, amplitudy } = b;
  const { prvky } = trasa;
  for (let i = 0; i < b.pocet; i++) {
    if (b.vypnuto[i] === 1) {
      sila[i] = 0;
      prvek[i] = BEZ_OPORY;
      vyska[i] = spojnice[i] = Number.NaN;
      continue;
    }
    const uzel = stycnik[i]!;
    const x = uzel >= 0 ? s.x[uzel]! : b.x[i]!;
    // Hrbol vozovky pod kolem: zvedá povrch na zemi i na mostovce.
    const hrbol = b.profil !== null && b.poNerovnostech[i] === 1 ? vyskaNerovnosti(b.profil, x) : 0;

    // Co je pod břemenem.
    let e = NA_ZEMI;
    let xi = 0;
    let povrch: number;
    let naSpojnici: number;
    if (x < trasa.xLevy) povrch = naSpojnici = trasa.yLevy + hrbol;
    else if (x > trasa.xPravy) povrch = naSpojnici = trasa.yPravy + hrbol;
    else {
      const j = najdiPrvekTrasy(s, trasa, x, pole[i]!);
      povrch = naSpojnici = Number.NaN;
      if (j >= 0) {
        pole[i] = j;
        e = prvky[j]!;
        povrch = vyskaNaPrvku(s, e, x);
        naSpojnici = vyskaSpojnice;
        xi = mistoNaPrvku;
      }
      // Povrch vysoko nad styčníkem není opora, ale kus mostovky, pod kterým břemeno je.
      const stlaceni = uzel >= 0 ? povrch + b.vyskaNad[i]! - s.y[uzel]! : 0;
      if (!(povrch === povrch) || stlaceni > NEJVETSI_STLACENI) {
        e = BEZ_OPORY;
        povrch = naSpojnici = Number.NaN;
      } else if (hrbol !== 0) {
        povrch += hrbol;
        naSpojnici += hrbol;
      }
    }
    vyska[i] = povrch;
    spojnice[i] = naSpojnici;
    prvek[i] = e;
    if (e === BEZ_OPORY) {
      sila[i] = 0;
      continue;
    }

    let tlak: number;
    if (uzel >= 0) {
      // Pružina a tlumič mezi styčníkem a povrchem. Rychlost povrchu pod jedoucím břemenem
      // se bere z rozdílu výšek, takže zahrnuje pohyb mostu i sklon, po kterém břemeno jede.
      // Počítá se ze spojnice styčníků, ne z ohybové čáry: ta závisí na natočení lehkých
      // styčníků mostovky a tlumič by přes ni rozkmital jejich nejrychlejší kmity.
      const minula = spojniceMinula[i]!;
      const rychlostPovrchu = minula === minula && b.dt > 0 ? (naSpojnici - minula) / b.dt : 0;
      tlak =
        b.tuhost[i]! * (povrch + b.vyskaNad[i]! - s.y[uzel]!) +
        b.tlumeni[i]! * (rychlostPovrchu - s.vy[uzel]!);
      if (tlak < 0) tlak = 0; // břemeno odskočilo
      s.fy[uzel] = s.fy[uzel]! + tlak;
    } else {
      tlak = b.tiha[i]!;
    }

    // Budicí síla patří k břemenu, které na mostovce stojí; odskočené kolo nebudí nic.
    if (b.frekvence[i] !== 0 && (tlak > 0 || uzel < 0)) {
      // Harmonické složky z fáze základní frekvence, bez goniometrie:
      // sin 2φ = 2sc, cos 2φ = c² − s², sin 3φ = s(3 − 4s²), cos 3φ = c(4c² − 3).
      const c = b.fazeCos[i]!;
      const sn = b.fazeSin[i]!;
      const k = 6 * i;
      let buzeni =
        amplitudy[k]! * sn +
        amplitudy[k + 1]! * c +
        amplitudy[k + 2]! * (2 * sn * c) +
        amplitudy[k + 3]! * (c * c - sn * sn) +
        amplitudy[k + 4]! * (sn * (3 - 4 * sn * sn)) +
        amplitudy[k + 5]! * (c * (4 * c * c - 3));
      // Kdo ztrácí krok, budí slaběji. Síla bez styčníku (budič) krok ztratit nemůže.
      if (uzel >= 0 && b.houpani[i]! > 0) {
        const podil = podilBuzeni(b, i);
        if (podil < 1) buzeni *= podil;
      }
      tlak += buzeni;
      // Styčník mostovku jen tlačí. Síla bez styčníku je předepsaná a smí i táhnout (budič).
      if (tlak < 0 && uzel >= 0) tlak = 0;
    }
    sila[i] = tlak;
    if (e >= 0 && tlak !== 0) pridejSiluNaPrvek(s, e, xi, 0, -tlak);
  }
}

/**
 * O kolik kontakty břemen zvýší nejvyšší frekvenci soustavy: horní odhad přírůstku jejího
 * čtverce (rad²/s²). Pružina kontaktu o tuhosti k v místě ξ prvku přidává tuhost k·N·Nᵀ,
 * kde N jsou tvarové funkce; její největší vlastní číslo je k·Σ N_i²/m_i. Rozhodují
 * natočení lehkých styčníků mostovky (rameno nejvýš pětina délky prvku).
 */
export function pridavnaFrekvenceBremen(s: Soustava, b: Bremena): number {
  let tuhost = 0;
  let kontaktu = 0;
  let naStycniku = 0;
  for (let i = 0; i < b.pocet; i++) {
    const uzel = b.stycnik[i]!;
    if (uzel < 0) continue;
    kontaktu++;
    if (b.tuhost[i]! > tuhost) tuhost = b.tuhost[i]!;
    // Vlastní kmitání styčníku břemene na pružině kontaktu.
    naStycniku = Math.max(naStycniku, b.tuhost[i]! * s.invHmotaY[uzel]!);
  }
  if (kontaktu === 0) return 0;
  let naMostovce = 0;
  for (let j = 0; j < b.trasa.pocet; j++) {
    const e = b.trasa.prvky[j]!;
    const a = s.prvekA[e]!;
    const c = s.prvekB[e]!;
    const rameno = 0.2 * s.klidovaDelka[e]!;
    const poddajnost =
      rameno * rameno * (s.invSetrvacnost[a]! + s.invSetrvacnost[c]!) + s.invHmotaY[a]! + s.invHmotaY[c]!;
    if (poddajnost > naMostovce) naMostovce = poddajnost;
  }
  return naStycniku + Math.min(kontaktu, KOL_NA_PRVKU) * tuhost * naMostovce;
}

/** Zabalí břemena do rozhraní, které volá simulace. */
export function zatizeniBremeny(b: Bremena): Zatizeni {
  return {
    pridejSily: (s) => pridejSilyBremen(s, b),
    posun: () => posunBremena(b),
    poZmene: (s) => prestavTrasu(s, b.trasa),
    zmenaKroku: (dt) => nastavKrokBremen(b, dt),
    pridavnaFrekvence: (s) => pridavnaFrekvenceBremen(s, b),
  };
}
