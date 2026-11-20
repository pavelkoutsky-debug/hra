// Soustava: most rozložený na styčníky a prvky tak, jak s ním počítá jádro.
// Jádro nezná katalog ani úrovně; dostane jen fyzikální veličiny v jednotkách SI.
// Stav je uložen v plochých polích kvůli rychlosti vnitřní smyčky.

/** Nosník: osová síla, ohyb a smyk. Konce mohou být kloubové. */
export const NOSNIK = 0;
/** Lano: jen tah, bez ohybové tuhosti. */
export const LANO = 1;
/** Pružina s tlumičem: jen osová síla v tahu i tlaku, bez ohybu. */
export const PRUZINA = 2;
/** Druh prvku z pohledu výpočtu vnitřních sil. */
export type DruhPrvkuJadra = typeof NOSNIK | typeof LANO | typeof PRUZINA;

export interface PopisStycniku {
  x: number;
  y: number;
  /** Zadržené posuny a natočení (podpora). Výchozí je volný styčník. */
  pevneX?: boolean;
  pevneY?: boolean;
  pevneNatoceni?: boolean;
  /** Hmota navíc k té, kterou dodají prvky, v kg. */
  hmota?: number;
}

export interface PopisPrvku {
  /** Indexy koncových styčníků. */
  a: number;
  b: number;
  druh: DruhPrvkuJadra;
  /**
   * Číslo prutu, ke kterému prvek patří; výchozí je index prvku. Díly jednoho prutu
   * skrytě rozděleného na několik prvků mají číslo společné.
   */
  prut?: number;
  /** Osová tuhost E·A v newtonech. U pružiny ji může nahradit `tuhost`. */
  EA: number;
  /** Tuhost pružiny v N/m; má přednost před E·A děleným délkou. */
  tuhost?: number;
  /**
   * Viskózní tlumič podél osy prvku v N·s/m: síla je úměrná rychlosti, jakou se prvek
   * prodlužuje. Počítá se implicitně, takže ani velmi tuhý tlumič krok nezkracuje.
   */
  tlumic?: number;
  /** Ohybová tuhost E·I v N·m². U lana se nepoužije. */
  EI: number;
  /** Smyková tuhost G·A_s v newtonech; Infinity znamená prvek bez smykové poddajnosti. */
  GAs: number;
  /** Hmotnost na metr délky v kg/m. */
  hmotnostNaMetr: number;
  /** Poloměr setrvačnosti průřezu v metrech; určuje rotační setrvačnost. */
  polomerSetrvacnosti: number;
  /** Kloub na daném konci: prut tam nepřenáší moment. */
  kloubA?: boolean;
  kloubB?: boolean;
  /** Klidová délka; výchozí je vzdálenost styčníků. Kratší znamená předpětí. */
  klidovaDelka?: number;
  /**
   * Tlumení úměrné tuhosti prvku v sekundách: síla navíc je β · tuhost · rychlost deformace.
   * Působí jen na deformaci, pohyb prvku jako tuhého celku netlumí.
   */
  beta?: number;
  /** Únosnost průřezu: osová síla [N], moment [N·m], posouvající síla [N]. Bez ní se prvek neposuzuje. */
  unosnost?: { tah: number; tlak: number; moment: number; smyk: number };
  /**
   * Délka pro posouzení vzpěru; výchozí je délka prvku. U prutu skrytě rozděleného
   * na několik prvků je to délka celého prutu.
   */
  vzpernaDelka?: number;
  /**
   * Tvárný prvek: po dosažení únosnosti v tahu nebo ohybu se plasticky deformuje
   * a poruší se až po vyčerpání mezní deformace.
   */
  tvarny?: { silaPretrzeni: number; mezniNatoceni: number; mezniProtazeni: number };
}

export interface PopisSoustavy {
  stycniky: PopisStycniku[];
  prvky: PopisPrvku[];
}

/**
 * Rotační setrvačnost, kterou nosník přidá každému svému tuhému konci.
 *
 * Skutečná setrvačnost průřezu je ½·m·r² na konec (m je hmotnost prvku, r poloměr
 * setrvačnosti). S ní by ale krok explicitní integrace určovalo příčné kmitání prvku,
 * ne podélná vlna. Proto se bere nejmenší hodnota, při které má volný prvek všechny
 * ohybové frekvence nejvýš rovné své osové frekvenci √(4·EA/(m·L)):
 *
 *   oba konce tuhé:  J = 3·m·r²·L² / (2·[(1 + Φ)·L² − 12·r²])
 *   jeden kloub:     J = 3·m·r²·L² / ([(4 + Φ)·L² − 12·r²])
 *
 * a nejméně ½·m·r². U štíhlých prutů je to zhruba 1,5·m·r², tedy řádově tisíciny m·L²;
 * vlastní frekvence mostu to prakticky neovlivní (viz docs/M1A-MERENI.md).
 */
export function setrvacnostKonce(
  hmotaPrvku: number,
  delka: number,
  polomer: number,
  fi: number,
  jedenKloub: boolean,
): number {
  const r2 = polomer * polomer;
  const L2 = delka * delka;
  const skutecna = 0.5 * hmotaPrvku * r2;
  const jmenovatel = (jedenKloub ? 4 + fi : 1 + fi) * L2 - 12 * r2;
  // U velmi krátkého prutu bez smykové poddajnosti podmínku splnit nelze; krok pak určí
  // měření nejvyšší frekvence celé soustavy.
  if (!(jmenovatel > 0)) return Math.max(skutecna, (hmotaPrvku * L2) / 24);
  const potrebna = ((jedenKloub ? 3 : 1.5) * hmotaPrvku * r2 * L2) / jmenovatel;
  return Math.max(skutecna, potrebna);
}

export interface Soustava {
  pocetStycniku: number;
  pocetPrvku: number;

  // Stav styčníků. Natočení se nedrží jako úhel, ale jako jednotkový vektor (cos, sin):
  // jádro pak nepotřebuje žádnou goniometrickou funkci a počítá ve všech prohlížečích stejně.
  x: Float64Array;
  y: Float64Array;
  cosN: Float64Array;
  sinN: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  omega: Float64Array;

  // Síly a momenty na styčníky, přepočítávané každý krok.
  fx: Float64Array;
  fy: Float64Array;
  moment: Float64Array;

  /** Hmota přidaná ke styčníku nad rámec prvků (závaží, vybavení), kg. */
  hmotaNavic: Float64Array;
  /** Podpora: bit 0 zadržený posun x, bit 1 posun y, bit 2 natočení. */
  podpora: Uint8Array;
  /** Převrácené hodnoty hmoty a rotační setrvačnosti; nula znamená zadržený stupeň volnosti. */
  invHmotaX: Float64Array;
  invHmotaY: Float64Array;
  invSetrvacnost: Float64Array;
  hmota: Float64Array;
  setrvacnost: Float64Array;

  // Prvky.
  prvekA: Int32Array;
  prvekB: Int32Array;
  druh: Uint8Array;
  klidovaDelka: Float64Array;
  /** Jednotkový vektor osy prvku ve výchozí poloze. */
  osaX0: Float64Array;
  osaY0: Float64Array;
  /** Osová tuhost EA/L. */
  tuhostOsova: Float64Array;
  /** Ohybová tuhost: M_a = kAA·ψ_a + kAB·ψ_b, M_b = kAB·ψ_a + kBB·ψ_b. */
  kAA: Float64Array;
  kAB: Float64Array;
  kBB: Float64Array;
  /** Tlumení úměrné tuhosti prvku, v sekundách. */
  beta: Float64Array;
  /** Viskózní tlumič podél osy prvku, N·s/m. */
  tlumic: Float64Array;
  /** Indexy prvků s tlumičem a jejich počet; síly tlumičů se počítají zvlášť (viz tlumice.ts). */
  tlumice: Int32Array;
  pocetTlumicu: number;
  /** Tuhosti průřezu E·A, E·I a G·A_s, ze kterých se počítá tuhost prvku dané délky. */
  EA: Float64Array;
  EI: Float64Array;
  GAs: Float64Array;
  /** Poloměr setrvačnosti průřezu, m. */
  polomer: Float64Array;
  /**
   * Číslo prutu, ke kterému prvek patří. Prut skrytě rozdělený na díly nebo rozlomený
   * porušením tvoří několik prvků se stejným číslem.
   */
  prut: Int32Array;
  /** Smykový parametr Φ = 12·EI/(GA_s·L²); 0 u prvku bez smykové poddajnosti. */
  fi: Float64Array;
  /** Klouby na koncích: bit 0 konec a, bit 1 konec b. */
  kloub: Uint8Array;
  /** Hmotnost prvku na metr délky, kg/m. */
  hmotnostNaMetr: Float64Array;

  // Únosnost prvků; Infinity znamená, že se daný způsob namáhání neposuzuje.
  unosnostTah: Float64Array;
  unosnostTlak: Float64Array;
  unosnostMoment: Float64Array;
  unosnostSmyk: Float64Array;
  /** Eulerova kritická síla prutu ve vzpěru. */
  kritickaSila: Float64Array;

  // Plasticita tvárných prvků. Mez je Infinity u prvků, které se plasticky nedeformují.
  mezTahu: Float64Array;
  mezMomentu: Float64Array;
  silaPretrzeni: Float64Array;
  mezniNatoceni: Float64Array;
  mezniProtazeni: Float64Array;
  /** Trvalé natočení v plastickém kloubu na konci a a b, v radiánech. */
  plastA: Float64Array;
  plastB: Float64Array;
  /** Trvalé protažení prvku v metrech. */
  plastDelka: Float64Array;
  /** Práce spotřebovaná plastickou deformací od začátku, v joulech. */
  plastickaPrace: number;
  /**
   * Zmrazí plastické deformace: síly se počítají pružně z aktuálního stavu.
   * Používá se při numerickém derivování sil, které by jinak stav měnilo.
   */
  plasticitaZmrazena: boolean;

  // Namáhání prvků; počítá `vyhodnotNamahani`.
  /** Vyhlazené využití: 1 je mez únosnosti. */
  vyuziti: Float64Array;
  /** Rozhodující způsob namáhání; viz konstanty ZPUSOB_* v namahani.ts. */
  zpusob: Uint8Array;
  /** Místo největšího namáhání: 0 konec a, 1 až 3 čtvrtiny prutu, 4 konec b. */
  mistoNamahani: Uint8Array;
  /**
   * Prvek je kus prutu utržený porušením: má volný konec, žádné zatížení nenese
   * a znovu se neporušuje.
   */
  utrzeny: Uint8Array;

  // Zatížení působící na prvky mezi styčníky v aktuálním kroku (kola, lidé); viz zatizeni.ts.
  // Náhradní styčníkové síly napříč prvkem a momenty, které už byly přičteny ke styčníkům.
  zatSilaA: Float64Array;
  zatSilaB: Float64Array;
  zatMomentA: Float64Array;
  zatMomentB: Float64Array;
  /** Moment od zatížení na prostě uloženém prvku ve čtvrtinách: indexy 3e, 3e+1, 3e+2. */
  zatMomentPole: Float64Array;
  /** Prvky, které mají v tomto kroku zatížení, jejich počet a příznak u každého prvku. */
  zatizenePrvky: Int32Array;
  pocetZatizenych: number;
  jeZatizen: Uint8Array;

  // Výsledky posledního výpočtu sil, pro vyhodnocení namáhání.
  osovaSila: Float64Array;
  momentA: Float64Array;
  momentB: Float64Array;
}

/**
 * Sestaví soustavu z popisu: spočítá klidové délky, tuhosti a soustředí hmoty do styčníků.
 *
 * Ohybová tuhost je přesná matice Timošenkova nosníku s parametrem Φ = 12·EI/(GA_s·L²);
 * pro štíhlé pruty (Φ → 0) přechází v klasický nosník bez smyku. Kloub na konci se
 * řeší statickou kondenzací: moment tam je nulový a druhý konec změkne.
 */
export function sestavSoustavu(popis: PopisSoustavy): Soustava {
  const n = popis.stycniky.length;
  const m = popis.prvky.length;

  const s: Soustava = {
    pocetStycniku: n,
    pocetPrvku: m,
    x: new Float64Array(n),
    y: new Float64Array(n),
    cosN: new Float64Array(n).fill(1),
    sinN: new Float64Array(n),
    vx: new Float64Array(n),
    vy: new Float64Array(n),
    omega: new Float64Array(n),
    fx: new Float64Array(n),
    fy: new Float64Array(n),
    moment: new Float64Array(n),
    hmotaNavic: new Float64Array(n),
    podpora: new Uint8Array(n),
    invHmotaX: new Float64Array(n),
    invHmotaY: new Float64Array(n),
    invSetrvacnost: new Float64Array(n),
    hmota: new Float64Array(n),
    setrvacnost: new Float64Array(n),
    prvekA: new Int32Array(m),
    prvekB: new Int32Array(m),
    druh: new Uint8Array(m),
    klidovaDelka: new Float64Array(m),
    osaX0: new Float64Array(m),
    osaY0: new Float64Array(m),
    tuhostOsova: new Float64Array(m),
    kAA: new Float64Array(m),
    kAB: new Float64Array(m),
    kBB: new Float64Array(m),
    beta: new Float64Array(m),
    tlumic: new Float64Array(m),
    tlumice: new Int32Array(0),
    pocetTlumicu: 0,
    EA: new Float64Array(m),
    EI: new Float64Array(m),
    GAs: new Float64Array(m),
    polomer: new Float64Array(m),
    prut: new Int32Array(m),
    fi: new Float64Array(m),
    kloub: new Uint8Array(m),
    hmotnostNaMetr: new Float64Array(m),
    unosnostTah: new Float64Array(m).fill(Infinity),
    unosnostTlak: new Float64Array(m).fill(Infinity),
    unosnostMoment: new Float64Array(m).fill(Infinity),
    unosnostSmyk: new Float64Array(m).fill(Infinity),
    kritickaSila: new Float64Array(m).fill(Infinity),
    mezTahu: new Float64Array(m).fill(Infinity),
    mezMomentu: new Float64Array(m).fill(Infinity),
    silaPretrzeni: new Float64Array(m).fill(Infinity),
    mezniNatoceni: new Float64Array(m).fill(Infinity),
    mezniProtazeni: new Float64Array(m).fill(Infinity),
    plastA: new Float64Array(m),
    plastB: new Float64Array(m),
    plastDelka: new Float64Array(m),
    plastickaPrace: 0,
    plasticitaZmrazena: false,
    vyuziti: new Float64Array(m),
    zpusob: new Uint8Array(m),
    mistoNamahani: new Uint8Array(m),
    utrzeny: new Uint8Array(m),
    zatSilaA: new Float64Array(m),
    zatSilaB: new Float64Array(m),
    zatMomentA: new Float64Array(m),
    zatMomentB: new Float64Array(m),
    zatMomentPole: new Float64Array(3 * m),
    zatizenePrvky: new Int32Array(m),
    pocetZatizenych: 0,
    jeZatizen: new Uint8Array(m),
    osovaSila: new Float64Array(m),
    momentA: new Float64Array(m),
    momentB: new Float64Array(m),
  };

  popis.stycniky.forEach((st, i) => {
    s.x[i] = st.x;
    s.y[i] = st.y;
    s.hmotaNavic[i] = st.hmota ?? 0;
    s.podpora[i] = (st.pevneX ? 1 : 0) | (st.pevneY ? 2 : 0) | (st.pevneNatoceni ? 4 : 0);
  });

  popis.prvky.forEach((p, e) => {
    const a = popis.stycniky[p.a];
    const b = popis.stycniky[p.b];
    if (!a || !b || p.a === p.b) throw new Error(`Prvek ${e} nemá dva různé existující styčníky.`);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const delka = Math.sqrt(dx * dx + dy * dy);
    if (!(delka > 0)) throw new Error(`Prvek ${e} má nulovou délku.`);
    const L = p.klidovaDelka ?? delka;

    s.prvekA[e] = p.a;
    s.prvekB[e] = p.b;
    s.druh[e] = p.druh;
    s.prut[e] = p.prut ?? e;
    s.klidovaDelka[e] = L;
    s.osaX0[e] = dx / delka;
    s.osaY0[e] = dy / delka;
    s.EA[e] = p.tuhost !== undefined ? p.tuhost * L : p.EA;
    s.EI[e] = p.druh === NOSNIK ? p.EI : 0;
    s.tlumic[e] = p.tlumic ?? 0;
    s.GAs[e] = p.GAs;
    s.polomer[e] = p.polomerSetrvacnosti;
    s.beta[e] = p.beta ?? 0;
    s.hmotnostNaMetr[e] = p.hmotnostNaMetr;
    // Lano moment nepřenáší na žádném konci.
    s.kloub[e] = p.druh === NOSNIK ? (p.kloubA ? 1 : 0) | (p.kloubB ? 2 : 0) : 3;
    nastavTuhostPrvku(s, e);

    if (p.unosnost) {
      s.unosnostTah[e] = p.unosnost.tah;
      if (p.druh === NOSNIK) {
        s.unosnostTlak[e] = p.unosnost.tlak;
        s.unosnostMoment[e] = p.unosnost.moment;
        s.unosnostSmyk[e] = p.unosnost.smyk;
        // Eulerova síla pro kloubově uložený prut; tuhé konce se vědomě nezvýhodňují.
        const vzperna = p.vzpernaDelka ?? L;
        s.kritickaSila[e] = (Math.PI * Math.PI * p.EI) / (vzperna * vzperna);
      }
      if (p.tvarny) {
        s.mezTahu[e] = p.unosnost.tah;
        s.silaPretrzeni[e] = p.tvarny.silaPretrzeni;
        s.mezniProtazeni[e] = p.tvarny.mezniProtazeni;
        if (p.druh === NOSNIK) {
          s.mezMomentu[e] = p.unosnost.moment;
          s.mezniNatoceni[e] = p.tvarny.mezniNatoceni;
        }
      }
    }
  });

  const tlumice: number[] = [];
  for (let e = 0; e < m; e++) if (s.tlumic[e] !== 0) tlumice.push(e);
  s.tlumice = Int32Array.from(tlumice);
  s.pocetTlumicu = tlumice.length;

  prepoctiHmoty(s);
  for (let i = 0; i < n; i++) {
    if (!(s.hmota[i]! > 0) && (s.podpora[i]! & 3) !== 3) {
      throw new Error(`Volný styčník ${i} nemá žádnou hmotu.`);
    }
  }
  return s;
}

/**
 * Spočítá tuhost prvku z tuhostí průřezu, klidové délky a kloubů na koncích.
 * Volá se při sestavení a po každé změně délky nebo uložení prvku (porušení).
 */
export function nastavTuhostPrvku(s: Soustava, e: number): void {
  const L = s.klidovaDelka[e]!;
  s.tuhostOsova[e] = s.EA[e]! / L;
  s.kAA[e] = 0;
  s.kAB[e] = 0;
  s.kBB[e] = 0;
  s.fi[e] = 0;
  if (s.druh[e] !== NOSNIK) return;

  const EI = s.EI[e]!;
  const GAs = s.GAs[e]!;
  const fi = Number.isFinite(GAs) ? (12 * EI) / (GAs * L * L) : 0;
  s.fi[e] = fi;
  const zaklad = EI / (L * (1 + fi));
  const kloub = s.kloub[e]!;
  if (kloub === 0) {
    s.kAA[e] = zaklad * (4 + fi);
    s.kBB[e] = zaklad * (4 + fi);
    s.kAB[e] = zaklad * (2 - fi);
  } else if (kloub === 1) {
    s.kBB[e] = (12 * EI) / (L * (4 + fi));
  } else if (kloub === 2) {
    s.kAA[e] = (12 * EI) / (L * (4 + fi));
  }
}

/**
 * Soustředí hmoty prvků do styčníků a určí, které stupně volnosti jsou volné.
 * Volá se při sestavení a po každé změně stavby soustavy.
 */
export function prepoctiHmoty(s: Soustava): void {
  const n = s.pocetStycniku;
  for (let i = 0; i < n; i++) {
    s.hmota[i] = s.hmotaNavic[i]!;
    s.setrvacnost[i] = 0;
  }
  for (let e = 0; e < s.pocetPrvku; e++) {
    const a = s.prvekA[e]!;
    const b = s.prvekB[e]!;
    const L = s.klidovaDelka[e]!;
    // Hmota prvku se dělí napůl mezi jeho konce.
    const hmotaPrvku = s.hmotnostNaMetr[e]! * L;
    s.hmota[a] = s.hmota[a]! + hmotaPrvku / 2;
    s.hmota[b] = s.hmota[b]! + hmotaPrvku / 2;

    // Rotační setrvačnost dostane jen konec, který moment přenáší.
    const kloub = s.kloub[e]!;
    if (s.druh[e] === NOSNIK && kloub !== 3) {
      const naKonec = setrvacnostKonce(hmotaPrvku, L, s.polomer[e]!, s.fi[e]!, kloub !== 0);
      if ((kloub & 1) === 0) s.setrvacnost[a] = s.setrvacnost[a]! + naKonec;
      if ((kloub & 2) === 0) s.setrvacnost[b] = s.setrvacnost[b]! + naKonec;
    }
  }
  for (let i = 0; i < n; i++) {
    const hmota = s.hmota[i]!;
    const podpora = s.podpora[i]!;
    // Styčník bez hmoty (osiřelý po porušení) se nepohybuje: zůstane stát tam, kde osiřel.
    if (!(hmota > 0)) {
      s.vx[i] = 0;
      s.vy[i] = 0;
      s.omega[i] = 0;
    }
    s.invHmotaX[i] = (podpora & 1) !== 0 || !(hmota > 0) ? 0 : 1 / hmota;
    s.invHmotaY[i] = (podpora & 2) !== 0 || !(hmota > 0) ? 0 : 1 / hmota;
    // Styčník, do kterého nevede žádný tuhý konec, se neotáčí: jeho natočení nic neovlivní.
    const setrvacnost = s.setrvacnost[i]!;
    s.invSetrvacnost[i] = (podpora & 4) !== 0 || !(setrvacnost > 0) ? 0 : 1 / setrvacnost;
  }
}

/**
 * Popis pružiny s tlumičem mezi dvěma styčníky. Hmotnost na metr smí být nulová,
 * pokud koncové styčníky dostanou hmotu odjinud.
 */
export function popisPruziny(
  a: number,
  b: number,
  tuhost: number,
  tlumic = 0,
  hmotnostNaMetr = 0,
): PopisPrvku {
  return {
    a,
    b,
    druh: PRUZINA,
    EA: 0,
    EI: 0,
    GAs: Infinity,
    tuhost,
    tlumic,
    hmotnostNaMetr,
    polomerSetrvacnosti: 0,
  };
}
