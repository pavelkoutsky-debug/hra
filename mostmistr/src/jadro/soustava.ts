// Soustava: most rozložený na styčníky a prvky tak, jak s ním počítá jádro.
// Jádro nezná katalog ani úrovně; dostane jen fyzikální veličiny v jednotkách SI.
// Stav je uložen v plochých polích kvůli rychlosti vnitřní smyčky.

/** Nosník: osová síla, ohyb a smyk. Konce mohou být kloubové. */
export const NOSNIK = 0;
/** Lano: jen tah, bez ohybové tuhosti. */
export const LANO = 1;
/** Druh prvku z pohledu výpočtu vnitřních sil. */
export type DruhPrvkuJadra = typeof NOSNIK | typeof LANO;

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
  /** Osová tuhost E·A v newtonech. */
  EA: number;
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
    osovaSila: new Float64Array(m),
    momentA: new Float64Array(m),
    momentB: new Float64Array(m),
  };

  popis.stycniky.forEach((st, i) => {
    s.x[i] = st.x;
    s.y[i] = st.y;
    s.hmota[i] = st.hmota ?? 0;
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
    s.klidovaDelka[e] = L;
    s.osaX0[e] = dx / delka;
    s.osaY0[e] = dy / delka;
    s.tuhostOsova[e] = p.EA / L;
    s.beta[e] = p.beta ?? 0;

    // Hmota prvku se dělí napůl mezi jeho konce.
    const hmotaPrvku = p.hmotnostNaMetr * L;
    s.hmota[p.a] = s.hmota[p.a]! + hmotaPrvku / 2;
    s.hmota[p.b] = s.hmota[p.b]! + hmotaPrvku / 2;

    if (p.druh === NOSNIK) {
      const fi = Number.isFinite(p.GAs) ? (12 * p.EI) / (p.GAs * L * L) : 0;
      const zaklad = p.EI / (L * (1 + fi));
      const kloubA = p.kloubA ?? false;
      const kloubB = p.kloubB ?? false;
      if (!kloubA && !kloubB) {
        s.kAA[e] = zaklad * (4 + fi);
        s.kBB[e] = zaklad * (4 + fi);
        s.kAB[e] = zaklad * (2 - fi);
      } else if (kloubA && !kloubB) {
        s.kBB[e] = (12 * p.EI) / (L * (4 + fi));
      } else if (!kloubA && kloubB) {
        s.kAA[e] = (12 * p.EI) / (L * (4 + fi));
      }

      // Rotační setrvačnost dostane jen konec, který moment přenáší.
      if (!kloubA || !kloubB) {
        const naKonec = setrvacnostKonce(hmotaPrvku, L, p.polomerSetrvacnosti, fi, kloubA || kloubB);
        if (!kloubA) s.setrvacnost[p.a] = s.setrvacnost[p.a]! + naKonec;
        if (!kloubB) s.setrvacnost[p.b] = s.setrvacnost[p.b]! + naKonec;
      }
    }
  });

  popis.stycniky.forEach((st, i) => {
    const hmota = s.hmota[i]!;
    if (!(hmota > 0) && !(st.pevneX && st.pevneY)) {
      throw new Error(`Volný styčník ${i} nemá žádnou hmotu.`);
    }
    s.invHmotaX[i] = st.pevneX ? 0 : 1 / hmota;
    s.invHmotaY[i] = st.pevneY ? 0 : 1 / hmota;
    // Styčník, do kterého nevede žádný tuhý konec, se neotáčí: jeho natočení nic neovlivní.
    const setrvacnost = s.setrvacnost[i]!;
    s.invSetrvacnost[i] = st.pevneNatoceni || !(setrvacnost > 0) ? 0 : 1 / setrvacnost;
  });

  return s;
}
