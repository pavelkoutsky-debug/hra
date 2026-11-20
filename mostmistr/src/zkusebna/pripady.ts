// Ověřovací případy zkušebny: malé úlohy se známým řešením, na kterých je vidět,
// že jádro počítá správně. Každý případ umí sám říct, co vyšlo a co vyjít mělo.
// Soubor nezávisí na prohlížeči; tytéž případy běží v testech.

import type { Obdelnik } from "../data/geometrie";
import type { IdPrvku } from "../data/katalog";
import { vytvorBremena, zatizeniBremeny, type Bremena } from "../jadro/bremena";
import { kinetickaEnergie, polohovaEnergie, TIHOVE_ZRYCHLENI } from "../jadro/integrator";
import { najdiRovnovahu, vlastniTvarySoustavy } from "../jadro/matice";
import { deformacniEnergie } from "../jadro/sily";
import { Simulace, type Zatizeni } from "../jadro/simulace";
import { popisPruziny, sestavSoustavu, type PopisSoustavy, type Soustava } from "../jadro/soustava";
import { hmotyStupnu, volneStupne } from "../jadro/stupne";
import { vytvorTrasu } from "../jadro/trasa";
import { prihradovyMost, REFERENCNI_MOSTY } from "../../mereni/mosty";
import type { KlicTextu } from "../ui/slovnik";
import { popisPrutu } from "../zkouska/stavba";

/** Jedno porovnání naměřené hodnoty s teorií. */
export interface Overeni {
  nazev: KlicTextu;
  namereno: number;
  ocekavano: number;
  jednotka: string;
  /** Počet desetinných míst při zobrazení. */
  mist: number;
  /** Dovolená odchylka: poměrná k očekávané hodnotě, nebo absolutní v téže jednotce. */
  tolerance: number;
  absolutni?: boolean;
}

export function vyhovuje(o: Overeni): boolean {
  const odchylka = Math.abs(o.namereno - o.ocekavano);
  return odchylka <= (o.absolutni ? o.tolerance : o.tolerance * Math.abs(o.ocekavano));
}

/** Vnější síla na styčník, kterou výkres ukáže šipkou. */
export interface SilaNaStycnik {
  stycnik: number;
  fx: number;
  fy: number;
}

/** Připravený běh jednoho případu. */
export interface BehPripadu {
  simulace: Simulace;
  /** Nejdelší délka děje v sekundách. */
  trvani: number;
  /** Po prvním porušení děj pokračuje ještě tolik sekund a pak skončí. */
  dobehPoPoruseni?: number;
  /** Část světa, kterou má být vidět. */
  vyrez: Obdelnik;
  /** Čísla prutů, které se kreslí jako mostovka. */
  mostovka: number[];
  /** Břemena, která se kreslí jako kola. */
  bremena?: Bremena;
  /** Styčníky kreslené jako závaží. */
  zavazi?: number[];
  /** Vnější síly kreslené šipkami; případ je průběžně přepisuje. */
  sily?: SilaNaStycnik[];
  /** Volá se po každém kroku s časem děje (měření). */
  poKroku?: (cas: number) => void;
  /** Porovnání s teorií po doběhnutí. */
  vyhodnot: () => Overeni[];
}

export interface PripadZkusebny {
  id: string;
  nazev: KlicTextu;
  popis: KlicTextu;
  priprav: () => BehPripadu;
}

const SIRKA = 3;
const NOSNIK_ZKUSEBNY: IdPrvku = "ocel-lehka";
const g = TIHOVE_ZRYCHLENI;

/** Vodorovný nosník z `dilu` stejných prvků; styčník 0 je vlevo v počátku. */
function vodorovnyNosnik(delka: number, dilu: number): PopisSoustavy {
  const prut = popisPrutu(NOSNIK_ZKUSEBNY, SIRKA);
  const popis: PopisSoustavy = { stycniky: [], prvky: [] };
  for (let i = 0; i <= dilu; i++) popis.stycniky.push({ x: (delka * i) / dilu, y: 0 });
  for (let i = 0; i < dilu; i++) popis.prvky.push({ ...prut, a: i, b: i + 1 });
  return popis;
}

/** Čísla všech prutů soustavy. */
function vsechnyPruty(s: Soustava): number[] {
  return Array.from({ length: s.pocetPrvku }, (_, e) => e);
}

/** Sleduje průchody veličiny nulou směrem nahoru a z nich určí periodu. */
class MericPeriody {
  #predchozi: number | null = null;
  #predchoziCas = 0;
  readonly pruchody: number[] = [];

  zaznamenej(cas: number, hodnota: number): void {
    if (this.#predchozi !== null && this.#predchozi < 0 && hodnota >= 0) {
      const podil = this.#predchozi / (this.#predchozi - hodnota);
      this.pruchody.push(this.#predchoziCas + podil * (cas - this.#predchoziCas));
    }
    this.#predchozi = hodnota;
    this.#predchoziCas = cas;
  }

  get perioda(): number {
    const n = this.pruchody.length;
    return n < 2 ? Number.NaN : (this.pruchody[n - 1]! - this.pruchody[0]!) / (n - 1);
  }
}

/** Sleduje největší a nejmenší hodnotu veličiny od zadaného času. */
class MericRozkmitu {
  nejvyssi = -Infinity;
  nejnizsi = Infinity;

  constructor(readonly od: number) {}

  zaznamenej(cas: number, hodnota: number): void {
    if (cas < this.od) return;
    if (hodnota > this.nejvyssi) this.nejvyssi = hodnota;
    if (hodnota < this.nejnizsi) this.nejnizsi = hodnota;
  }

  get amplituda(): number {
    return 0.5 * (this.nejvyssi - this.nejnizsi);
  }
}

/** Úplný eliptický integrál prvního druhu K(k) aritmeticko-geometrickým průměrem. */
function elipticky(k: number): number {
  let a = 1;
  let b = Math.sqrt(1 - k * k);
  for (let i = 0; i < 30; i++) {
    const novyA = 0.5 * (a + b);
    b = Math.sqrt(a * b);
    a = novyA;
  }
  return Math.PI / (2 * a);
}

/** Kořen rostoucí funkce na intervalu půlením. */
function koren(f: (x: number) => number, dolni: number, horni: number): number {
  for (let i = 0; i < 100; i++) {
    const stred = 0.5 * (dolni + horni);
    if (f(stred) < 0) dolni = stred;
    else horni = stred;
  }
  return 0.5 * (dolni + horni);
}

// ---------------------------------------------------------------------------------------

/** Vodorovný prut zavěšený za konec a puštěný: velké rotace a zachování energie. */
function kyvadlo(): BehPripadu {
  const L = 4;
  const dilu = 8;
  const popis = vodorovnyNosnik(L, dilu);
  popis.stycniky[0]!.pevneX = true;
  popis.stycniky[0]!.pevneY = true;
  popis.prvky[0]!.kloubA = true;
  const s = sestavSoustavu(popis);
  const simulace = new Simulace(s, { tiha: g, utlum: 0, utlumNejvyssi: 0 });

  const energie = (): number => kinetickaEnergie(s) + deformacniEnergie(s) + polohovaEnergie(s, g);
  const pocatecni = energie();
  let hmota = 0;
  for (let i = 0; i < s.pocetStycniku; i++) hmota += s.hmota[i]!;
  const uvolnena = hmota * g * (L / 2);

  let odchylkaEnergie = 0;
  let nejnizsi = 0;
  let kroku = 0;
  const perioda = new MericPeriody();

  return {
    simulace,
    trvani: 8,
    vyrez: { xMin: -5, xMax: 5, yMin: -5, yMax: 1.5 },
    mostovka: [],
    poKroku: (cas) => {
      nejnizsi = Math.min(nejnizsi, s.y[dilu]!);
      // Konec prutu prochází svislicí pod závěsem jednou za periodu každým směrem.
      perioda.zaznamenej(cas, s.x[dilu]!);
      if (kroku++ % 16 === 0) odchylkaEnergie = Math.max(odchylkaEnergie, Math.abs(energie() - pocatecni));
    },
    vyhodnot: () => [
      {
        nazev: "zkusebna.overeni.perioda",
        namereno: perioda.perioda,
        // Fyzické kyvadlo s výchylkou 90°: T = 4·√(2L/3g)·K(sin 45°).
        ocekavano: 4 * Math.sqrt((2 * L) / (3 * g)) * elipticky(Math.SQRT1_2),
        jednotka: "s",
        mist: 3,
        tolerance: 0.01,
      },
      {
        nazev: "zkusebna.overeni.nejnizsiPoloha",
        namereno: nejnizsi,
        ocekavano: -L,
        jednotka: "m",
        mist: 3,
        tolerance: 0.005,
      },
      {
        nazev: "zkusebna.overeni.odchylkaEnergie",
        namereno: (odchylkaEnergie / uvolnena) * 1e6,
        ocekavano: 0,
        jednotka: "ppm",
        mist: 2,
        tolerance: 10,
        absolutni: true,
      },
    ],
  };
}

interface ProstyNosnik {
  popis: PopisSoustavy;
  stred: number;
  dilu: number;
  L: number;
  EI: number;
  mu: number;
}

/** Popis prostého nosníku délky `L` s kloubem vlevo a posuvnou podporou vpravo. */
function prostyNosnik(L = 12, dilu = 8): ProstyNosnik {
  const popis = vodorovnyNosnik(L, dilu);
  popis.stycniky[0]!.pevneX = true;
  popis.stycniky[0]!.pevneY = true;
  popis.stycniky[dilu]!.pevneY = true;
  const prut = popisPrutu(NOSNIK_ZKUSEBNY, SIRKA);
  return { popis, stred: dilu / 2, dilu, L, EI: prut.EI, mu: prut.hmotnostNaMetr };
}

/**
 * První vlastní tvar nosníku: kruhová frekvence a modální hmota vztažená k průhybu
 * středu (síla F uprostřed prohne první tvar staticky o F/(hmota·ω²)).
 */
function prvniTvar(s: Soustava, stred: number): { omega: number; hmota: number } {
  const stupne = volneStupne(s);
  const tvary = vlastniTvarySoustavy(s, stupne, 1);
  if (!tvary) throw new Error("Nosník nemá kladně definitní tuhost.");
  // Tvary jsou normované hmotou, φᵀ·M·φ = 1; modální hmota pro φ(střed) = 1 je 1/φ(střed)².
  const uprostred = tvary.tvary[stupne.indexOf(3 * stred + 1)]!;
  return { omega: tvary.omega[0]!, hmota: 1 / (uprostred * uprostred) };
}

/** Prostý nosník vychýlený do prvního vlastního tvaru a puštěný: frekvence a stálá amplituda. */
function kmitajiciNosnik(): BehPripadu {
  const { popis, stred, L, EI, mu } = prostyNosnik();
  const s = sestavSoustavu(popis);
  const stupne = volneStupne(s);
  const tvary = vlastniTvarySoustavy(s, stupne, 1);
  if (!tvary) throw new Error("Nosník nemá kladně definitní tuhost.");
  // Prohnout do prvního tvaru s průhybem 15 cm uprostřed. Nosník se neposouvá přímo,
  // ale zatíží se silami M·φ·ω², které tento tvar staticky vyvolají: konec na posuvné
  // podpoře se tak může přitáhnout a v nosníku nezůstane osové napětí, které by se
  // po puštění uvolnilo jako podélné kmitání.
  const vychylka = 0.15;
  const tvar = tvary.tvary.subarray(0, stupne.length);
  const hmoty = hmotyStupnu(s, stupne);
  // Násobek tvaru, při kterém je průhyb uprostřed právě −vychylka (dolů).
  const nasobek = -vychylka / tvar[stupne.indexOf(3 * stred + 1)]!;
  const zatizeni = new Float64Array(stupne.length);
  for (let k = 0; k < stupne.length; k++) zatizeni[k] = nasobek * tvary.omega[0]! ** 2 * hmoty[k]! * tvar[k]!;
  if (najdiRovnovahu(s, stupne, zatizeni, 0) < 0) throw new Error("Nosník nemá rovnováhu.");
  const pocatecniPruhyb = Math.abs(s.y[stred]!);
  const simulace = new Simulace(s, { tiha: 0, utlum: 0, utlumNejvyssi: 0 });

  const energie = (): number => kinetickaEnergie(s) + deformacniEnergie(s);
  const pocatecni = energie();
  const trvani = 3;
  let odchylkaEnergie = 0;
  let amplitudaNaKonci = 0;
  let kroku = 0;
  const perioda = new MericPeriody();

  return {
    simulace,
    trvani,
    vyrez: { xMin: -1.5, xMax: L + 1.5, yMin: -3, yMax: 3 },
    mostovka: [],
    poKroku: (cas) => {
      perioda.zaznamenej(cas, s.y[stred]!);
      if (cas > trvani - 0.5) amplitudaNaKonci = Math.max(amplitudaNaKonci, Math.abs(s.y[stred]!));
      if (kroku++ % 16 === 0) odchylkaEnergie = Math.max(odchylkaEnergie, Math.abs(energie() - pocatecni));
    },
    vyhodnot: () => [
      {
        nazev: "zkusebna.overeni.frekvence",
        namereno: 1 / perioda.perioda,
        // Klasický nosník: f = π/(2L²)·√(EI/μ). Smyk a dělení na díly ji sníží o zlomek procenta.
        ocekavano: (Math.PI / (2 * L * L)) * Math.sqrt(EI / mu),
        jednotka: "Hz",
        mist: 3,
        tolerance: 0.01,
      },
      {
        // Bez tlumení se amplituda nesmí měnit: metoda sama kmitání netlumí ani nezesiluje.
        nazev: "zkusebna.overeni.amplituda",
        namereno: amplitudaNaKonci * 1000,
        ocekavano: pocatecniPruhyb * 1000,
        jednotka: "mm",
        mist: 2,
        tolerance: 0.001,
      },
      {
        nazev: "zkusebna.overeni.odchylkaEnergie",
        namereno: (odchylkaEnergie / pocatecni) * 1e6,
        ocekavano: 0,
        jednotka: "ppm",
        mist: 2,
        tolerance: 50,
        absolutni: true,
      },
    ],
  };
}

/** Váha chodce a podíl první harmonické síly kroku, kterými se budí nosník. */
const VAHA_CHODCE = 800;
const PODIL_KROKU = 0.4;

/** Chodec pochodující na místě uprostřed nosníku v jeho vlastní frekvenci: zesílení 1/(2ζ). */
function rezonance(): BehPripadu {
  const { popis, stred, L } = prostyNosnik();
  const s = sestavSoustavu(popis);
  const utlum = 0.01;
  const { omega, hmota } = prvniTvar(s, stred);
  const amplitudaSily = PODIL_KROKU * VAHA_CHODCE;
  const bremena = vytvorBremena(vytvorTrasu(s, vsechnyPruty(s)), [
    {
      x: L / 2,
      rychlost: 0,
      tiha: VAHA_CHODCE,
      buzeni: { frekvence: omega / (2 * Math.PI), amplitudy: [amplitudaSily] },
    },
  ]);
  const simulace = new Simulace(s, { tiha: 0, utlum, zatizeni: zatizeniBremeny(bremena) });

  const trvani = 26;
  const rozkmit = new MericRozkmitu(trvani - 1);
  // Průhyb prvního tvaru od stejně velké síly působící staticky.
  const staticky = amplitudaSily / (hmota * omega * omega);

  return {
    simulace,
    trvani,
    vyrez: { xMin: -1.5, xMax: L + 1.5, yMin: -3, yMax: 3 },
    mostovka: vsechnyPruty(s),
    bremena,
    poKroku: (cas) => rozkmit.zaznamenej(cas, s.y[stred]!),
    vyhodnot: () => [
      {
        nazev: "zkusebna.overeni.zesileni",
        namereno: rozkmit.amplituda / staticky,
        ocekavano: 1 / (2 * utlum),
        jednotka: "×",
        mist: 1,
        tolerance: 0.01,
      },
    ],
  };
}

/** Totéž buzení, ale s laděným tlumičem zavěšeným uprostřed: řešení Den Hartoga. */
function ladenyTlumic(): BehPripadu {
  const { popis, stred, L } = prostyNosnik();
  const { omega, hmota } = prvniTvar(sestavSoustavu(popis), stred);
  // Optimální ladění pro poměr hmot μ: frekvence tlumiče ω/(1 + μ) a tlumič
  // c = 2·m·ω·√(3μ/(8(1 + μ)³)).
  const pomer = 0.05;
  const m = pomer * hmota;
  const ladeni = 1 / (1 + pomer);
  const utlum = Math.sqrt((3 * pomer) / (8 * (1 + pomer) ** 3));
  const tuhost = m * (ladeni * omega) ** 2;
  const tlumic = 2 * utlum * m * omega;

  const zavazi = popis.stycniky.length;
  popis.stycniky.push({ x: L / 2, y: -1.5, pevneX: true, hmota: m });
  popis.prvky.push(popisPruziny(stred, zavazi, tuhost, tlumic));
  const s = sestavSoustavu(popis);
  const amplitudaSily = PODIL_KROKU * VAHA_CHODCE;
  const pruty = vsechnyPruty(s).filter((e) => e !== s.pocetPrvku - 1);
  const bremena = vytvorBremena(vytvorTrasu(s, pruty), [
    {
      x: L / 2,
      rychlost: 0,
      tiha: VAHA_CHODCE,
      buzeni: { frekvence: omega / (2 * Math.PI), amplitudy: [amplitudaSily] },
    },
  ]);
  // Nosník sám tlumení nemá, aby výsledek odpovídal řešení Den Hartoga; kmitání tlumí jen tlumič.
  const simulace = new Simulace(s, { tiha: 0, utlum: 0, zatizeni: zatizeniBremeny(bremena) });

  const trvani = 16;
  const rozkmitNosniku = new MericRozkmitu(trvani - 1);
  const rozkmitZavazi = new MericRozkmitu(trvani - 1);
  const staticky = amplitudaSily / (hmota * omega * omega);
  // Přesné řešení soustavy dvou hmot při buzení ve vlastní frekvenci nosníku (poměr frekvencí 1).
  const f2 = ladeni * ladeni;
  const jmenovatel = (2 * utlum) ** 2 * pomer ** 2 + (pomer * f2) ** 2;
  const zesileniNosniku = Math.sqrt(((2 * utlum) ** 2 + (1 - f2) ** 2) / jmenovatel);
  const zesileniZavazi = Math.sqrt(((2 * utlum) ** 2 + f2 * f2) / jmenovatel);

  return {
    simulace,
    trvani,
    vyrez: { xMin: -1.5, xMax: L + 1.5, yMin: -3.5, yMax: 2.5 },
    mostovka: pruty,
    bremena,
    zavazi: [zavazi],
    poKroku: (cas) => {
      rozkmitNosniku.zaznamenej(cas, s.y[stred]!);
      rozkmitZavazi.zaznamenej(cas, s.y[zavazi]!);
    },
    vyhodnot: () => [
      {
        nazev: "zkusebna.overeni.zesileniSTlumicem",
        namereno: rozkmitNosniku.amplituda / staticky,
        ocekavano: zesileniNosniku,
        jednotka: "×",
        mist: 2,
        tolerance: 0.02,
      },
      {
        nazev: "zkusebna.overeni.zesileniZavazi",
        namereno: rozkmitZavazi.amplituda / staticky,
        ocekavano: zesileniZavazi,
        jednotka: "×",
        mist: 2,
        tolerance: 0.02,
      },
    ],
  };
}

/** Síla jedoucí po prostém nosníku: Frýbovo řešení pohyblivého zatížení. */
function prejezdSily(): BehPripadu {
  const { popis, stred, L, EI, mu } = prostyNosnik(20, 20);
  const s = sestavSoustavu(popis);
  const P = 30_000;
  const omegaN = (n: number): number => ((n * Math.PI) / L) ** 2 * Math.sqrt(EI / mu);
  // Čtvrtina rychlosti, při které doba přejezdu odpovídá půlperiodě prvního tvaru.
  const v = (0.25 * omegaN(1) * L) / Math.PI;
  const bremena = vytvorBremena(vytvorTrasu(s, vsechnyPruty(s)), [{ x: 0, rychlost: v, tiha: P }]);
  const simulace = new Simulace(s, { tiha: 0, utlum: 0, zatizeni: zatizeniBremeny(bremena) });

  /** Průhyb středu netlumeného nosníku v čase t, dokud je na něm síla. */
  const frybuv = (t: number): number => {
    let w = 0;
    for (let n = 1; n <= 39; n += 2) {
      const omega = omegaN(n);
      const budici = (n * Math.PI * v) / L;
      // Sudé tvary mají uprostřed uzel; liché střídají znaménko.
      const tvar = n % 4 === 1 ? 1 : -1;
      w -=
        (((2 * P) / (mu * L)) * tvar * (Math.sin(budici * t) - (budici / omega) * Math.sin(omega * t))) /
        (omega * omega - budici * budici);
    }
    return w;
  };

  const prejezd = L / v;
  const staticky = (P * L ** 3) / (48 * EI);
  let nejvetsi = 0;
  let nejvetsiPodleFryby = 0;
  let odchylka = 0;
  let kroku = 0;

  return {
    simulace,
    trvani: prejezd + 2,
    vyrez: { xMin: -2, xMax: L + 2, yMin: -4, yMax: 4 },
    mostovka: vsechnyPruty(s),
    bremena,
    poKroku: (cas) => {
      if (cas > prejezd || kroku++ % 8 !== 0) return;
      const presne = frybuv(cas);
      nejvetsi = Math.max(nejvetsi, -s.y[stred]!);
      nejvetsiPodleFryby = Math.max(nejvetsiPodleFryby, -presne);
      odchylka = Math.max(odchylka, Math.abs(s.y[stred]! - presne));
    },
    vyhodnot: () => [
      {
        nazev: "zkusebna.overeni.dynamickySoucinitel",
        namereno: nejvetsi / staticky,
        ocekavano: nejvetsiPodleFryby / staticky,
        jednotka: "×",
        mist: 3,
        tolerance: 0.01,
      },
      {
        nazev: "zkusebna.overeni.odchylkaPrubehu",
        namereno: (100 * odchylka) / nejvetsiPodleFryby,
        ocekavano: 0,
        jednotka: "%",
        mist: 2,
        tolerance: 1,
        absolutni: true,
      },
    ],
  };
}

/** Příhradový most, po kterém jede kolona kol: součet reakcí musí odpovídat tíze. */
function mostSKoly(): BehPripadu {
  // Nízká dřevěná příhrada z těžkých trámů pod těžkými koly: pruty jsou znatelně namáhané,
  // takže je na výkresu vidět barevná škála využití.
  const zadani = { ...REFERENCNI_MOSTY[0]!, vyska: 2 };
  const most = prihradovyMost({ ...zadani, svarene: false, prut: "drevo-tezke" });
  const rozpeti = zadani.poli * zadani.delkaPole;
  const stycnikuMostu = most.popis.stycniky.length;

  // Kola jsou styčníky soustavy vedené vodorovně stálou rychlostí; s mostovkou je spojuje
  // pneumatika. Začínají na zemi před mostem, dosednutá vlastní tíhou.
  const KOL = 6;
  const hmotaKola = 6_000;
  const tuhost = 3.6e6;
  const tlumeni = 5e4;
  const rychlost = 4;
  const rozestup = 3;
  const sednuti = (hmotaKola * g) / tuhost;
  for (let i = 0; i < KOL; i++) {
    most.popis.stycniky.push({ x: -1 - rozestup * i, y: -sednuti, pevneX: true, hmota: hmotaKola });
  }
  const s = sestavSoustavu(most.popis);
  for (let i = 0; i < KOL; i++) s.vx[stycnikuMostu + i] = rychlost;

  // Rovnováha a tlumení vlastních tvarů se týkají jen mostu, ne kol.
  const stupne = volneStupne(s).filter((kod) => kod < 3 * stycnikuMostu);
  if (najdiRovnovahu(s, stupne, new Float64Array(stupne.length), g) < 0) {
    throw new Error("Most nemá rovnováhu.");
  }
  const naMostovce = new Set(most.mostovka);
  const mostovka = vsechnyPruty(s).filter((e) => naMostovce.has(s.prvekA[e]!) && naMostovce.has(s.prvekB[e]!));
  const bremena = vytvorBremena(
    vytvorTrasu(s, mostovka),
    Array.from({ length: KOL }, (_, i) => ({ stycnik: stycnikuMostu + i, tuhost, tlumeni })),
  );
  const simulace = new Simulace(s, {
    tiha: g,
    utlum: 0.01,
    zatizeni: zatizeniBremeny(bremena),
    tlumeneStupne: stupne,
  });

  let hmotaMostu = 0;
  for (let i = 0; i < stycnikuMostu; i++) hmotaMostu += s.hmota[i]!;
  const tiha = (hmotaMostu + KOL * hmotaKola) * g;

  // Reakce se měří, dokud je celá kolona na mostě.
  const vjezd = (1 + rozestup * (KOL - 1)) / rychlost;
  const vyjezd = (1 + rozpeti) / rychlost;
  let soucetReakci = 0;
  let vzorku = 0;

  return {
    simulace,
    trvani: (1 + rozestup * (KOL - 1) + rozpeti) / rychlost + 1.5,
    vyrez: { xMin: -4, xMax: rozpeti + 4, yMin: -4, yMax: zadani.vyska + 3 },
    mostovka,
    bremena,
    poKroku: (cas) => {
      if (cas < vjezd + 0.1 || cas > vyjezd - 0.1) return;
      // Reakce podpory je opačná k výslednici sil na zadržený styčník.
      for (let i = 0; i < stycnikuMostu; i++) {
        if (s.invHmotaY[i] === 0) soucetReakci -= s.fy[i]!;
      }
      vzorku++;
    },
    vyhodnot: () => [
      {
        nazev: "zkusebna.overeni.reakce",
        namereno: soucetReakci / vzorku / 1000,
        ocekavano: tiha / 1000,
        jednotka: "kN",
        mist: 1,
        tolerance: 0.01,
      },
    ],
  };
}

/** Dřevěný vazník zatěžovaný ve vrcholu až do zlomu: krokev vybočí při síle podle posudku vzpěru. */
function pretizeni(): BehPripadu {
  const rozpeti = 8;
  const vyska = 3;
  const prut = { ...popisPrutu("drevo-lehke", SIRKA), kloubA: true, kloubB: true };
  const s = sestavSoustavu({
    stycniky: [
      { x: 0, y: 0, pevneX: true, pevneY: true },
      { x: rozpeti, y: 0, pevneY: true },
      { x: rozpeti / 2, y: vyska },
    ],
    prvky: [
      { ...prut, a: 0, b: 1 },
      { ...prut, a: 0, b: 2 },
      { ...prut, a: 1, b: 2 },
    ],
  });
  const stupne = volneStupne(s);
  if (najdiRovnovahu(s, stupne, new Float64Array(stupne.length), g) < 0) throw new Error("Vazník nemá rovnováhu.");

  const delkaKrokve = Math.sqrt((rozpeti / 2) ** 2 + vyska ** 2);
  const sinus = vyska / delkaKrokve;
  const kosinus = rozpeti / 2 / delkaKrokve;
  // Posudek krokve: tlak a vzpěr (převrácené hodnoty únosnosti v tlaku a Eulerovy síly se
  // sčítají) a k tomu ohyb od vlastní tíhy šikmého prutu, který tlak zvětšuje 1/(1 − N/N_kr)krát.
  const tihaKrokve = prut.hmotnostNaMetr * delkaKrokve * g;
  const momentOdTihy = (tihaKrokve * kosinus * delkaKrokve) / 8;
  const eulerova = s.kritickaSila[1]!;
  const vyuziti = (N: number): number =>
    N / prut.unosnost!.tlak + N / eulerova + momentOdTihy / (prut.unosnost!.moment * (1 - N / eulerova));
  const unosnostKrokve = koren((N) => vyuziti(N) - 1, 0, 0.999 * eulerova);
  // Do vrcholu vedle síly lisu působí i tíha poloviny každé krokve. Pod zatížením se krokve
  // zkrátí a táhlo protáhne, vazník si sedne asi o půl procenta výšky a síly v prutech tím
  // vzrostou; rovnováha se proto píše pro sklon krokve těsně před zlomem.
  let sinusPredZlomem = sinus;
  let kotangensPredZlomem = kosinus / sinus;
  const ocekavanaSila = 2 * sinus * unosnostKrokve - tihaKrokve;

  // Lis přitlačuje rovnoměrně; mezní síly dosáhne za šest sekund. Po zlomu povolí.
  const narust = ocekavanaSila / 6;
  const sila: SilaNaStycnik = { stycnik: 2, fx: 0, fy: 0 };
  let silaPriPoruseni = Number.NaN;
  let tahVTahle = 0;
  let tahPriPoruseni = Number.NaN;
  let zlomeno = false;
  const zatizeni: Zatizeni = {
    pridejSily: (soustava, cas) => {
      sila.fy = zlomeno ? 0 : -narust * cas;
      soustava.fy[2] = soustava.fy[2]! + sila.fy;
    },
  };
  const simulace = new Simulace(s, { tiha: g, utlum: 0.02, zatizeni });

  return {
    simulace,
    trvani: 9,
    dobehPoPoruseni: 1.1,
    vyrez: { xMin: -2, xMax: rozpeti + 2, yMin: -4, yMax: vyska + 2.5 },
    mostovka: [],
    sily: [sila],
    poKroku: (cas) => {
      if (zlomeno) return;
      if (simulace.porusena) {
        zlomeno = true;
        silaPriPoruseni = narust * cas;
        tahPriPoruseni = tahVTahle;
      } else {
        tahVTahle = s.osovaSila[0]!;
        const dx = s.x[2]! - s.x[0]!;
        const dy = s.y[2]! - s.y[0]!;
        sinusPredZlomem = dy / Math.sqrt(dx * dx + dy * dy);
        kotangensPredZlomem = dx / dy;
      }
    },
    vyhodnot: () => [
      {
        nazev: "zkusebna.overeni.silaPriPoruseni",
        namereno: silaPriPoruseni / 1000,
        ocekavano: (2 * sinusPredZlomem * unosnostKrokve - tihaKrokve) / 1000,
        jednotka: "kN",
        mist: 0,
        tolerance: 0.003,
      },
      {
        // Styčníková metoda: táhlo nese vodorovnou složku síly v krokvi.
        nazev: "zkusebna.overeni.tahVTahle",
        namereno: tahPriPoruseni / 1000,
        ocekavano: ((silaPriPoruseni + tihaKrokve) * kotangensPredZlomem) / 2 / 1000,
        jednotka: "kN",
        mist: 0,
        tolerance: 0.003,
      },
      {
        // Zlomit se má krokev (prut 1 nebo 2) vzpěrem.
        nazev: "zkusebna.overeni.zlomenyPrut",
        namereno: simulace.udalosti[0]?.prut ?? -1,
        ocekavano: 1.5,
        jednotka: "",
        mist: 0,
        tolerance: 0.5,
        absolutni: true,
      },
    ],
  };
}

/** Oboustranně vetknutý ocelový nosník pod rostoucím zatížením: plastické klouby a mezní únosnost. */
function plastickyNosnik(): BehPripadu {
  const L = 8;
  const dilu = 8;
  const popis = vodorovnyNosnik(L, dilu);
  Object.assign(popis.stycniky[0]!, { pevneX: true, pevneY: true, pevneNatoceni: true });
  // Pravý konec se smí posouvat vodorovně, aby nosník nenesl zatížení tahem jako lano.
  Object.assign(popis.stycniky[dilu]!, { pevneY: true, pevneNatoceni: true });
  const s = sestavSoustavu(popis);
  const stupne = volneStupne(s);
  if (najdiRovnovahu(s, stupne, new Float64Array(stupne.length), g) < 0) throw new Error("Nosník nemá rovnováhu.");

  const prut = popisPrutu(NOSNIK_ZKUSEBNY, SIRKA);
  const Mp = prut.unosnost!.moment;
  const vlastniTiha = prut.hmotnostNaMetr * g;
  // První klouby vzniknou ve vetknutích při q·L²/12 = M_p, třetí uprostřed při q = 16·M_p/L².
  const prvniKlouby = (12 * Mp) / (L * L) - vlastniTiha;
  const mezni = (16 * Mp) / (L * L) - vlastniTiha;
  const narust = (1.1 * mezni) / 10;

  // Rovnoměrné zatížení jako čtyři síly na každý prvek; šipky ho ukazují po metru.
  const dilek = L / dilu;
  const sily: SilaNaStycnik[] = [];
  for (let i = 1; i < dilu; i++) sily.push({ stycnik: i, fx: 0, fy: 0 });
  let zatizeniNaMetr = 0;
  let zhrouceno = false;
  const trasa = vytvorTrasu(s, vsechnyPruty(s));
  const mista = Array.from({ length: 4 * dilu }, (_, i) => ({ x: (i + 0.5) * (dilek / 4), tiha: 0 }));
  const bremena = vytvorBremena(trasa, mista);
  const tlak = zatizeniBremeny(bremena);
  const zatizeni: Zatizeni = {
    ...tlak,
    pridejSily: (soustava, cas) => {
      zatizeniNaMetr = zhrouceno ? 0 : narust * cas;
      bremena.tiha.fill((zatizeniNaMetr * dilek) / 4);
      for (const sila of sily) sila.fy = -zatizeniNaMetr * dilek;
      tlak.pridejSily(soustava, cas);
    },
  };
  const simulace = new Simulace(s, { tiha: g, utlum: 0.05, zatizeni });

  let priPrvnichKloubech = Number.NaN;
  let priTretimKloubu = Number.NaN;
  const stred = dilu / 2;

  return {
    simulace,
    trvani: 12,
    dobehPoPoruseni: 1.0,
    vyrez: { xMin: -1.5, xMax: L + 1.5, yMin: -4, yMax: 3 },
    mostovka: [],
    sily,
    poKroku: () => {
      if (zhrouceno) return;
      if (simulace.porusena) {
        zhrouceno = true;
        return;
      }
      if (Number.isNaN(priPrvnichKloubech) && (s.plastA[0] !== 0 || s.plastB[dilu - 1] !== 0)) {
        priPrvnichKloubech = zatizeniNaMetr;
      }
      if (Number.isNaN(priTretimKloubu) && (s.plastB[stred - 1] !== 0 || s.plastA[stred] !== 0)) {
        priTretimKloubu = zatizeniNaMetr;
      }
    },
    vyhodnot: () => [
      {
        nazev: "zkusebna.overeni.prvniKlouby",
        namereno: priPrvnichKloubech / 1000,
        ocekavano: prvniKlouby / 1000,
        jednotka: "kN/m",
        mist: 1,
        tolerance: 0.01,
      },
      {
        nazev: "zkusebna.overeni.mezniZatizeni",
        namereno: priTretimKloubu / 1000,
        ocekavano: mezni / 1000,
        jednotka: "kN/m",
        mist: 1,
        tolerance: 0.01,
      },
    ],
  };
}

/** Štíhlý sloup s nepatrnou křivostí pod rostoucí silou: zvětšování průhybu a vybočení. */
function vzperSloupu(): BehPripadu {
  const vyska = 8;
  const dilu = 16;
  const krivost = vyska / 1000;
  // Sloup se tu nemá zlomit, jen vybočit: únosnost průřezu se neposuzuje.
  const { unosnost: _unosnost, tvarny: _tvarny, ...prut } = popisPrutu(NOSNIK_ZKUSEBNY, SIRKA);
  const popis: PopisSoustavy = { stycniky: [], prvky: [] };
  for (let i = 0; i <= dilu; i++) {
    popis.stycniky.push({ x: krivost * Math.sin((Math.PI * i) / dilu), y: (vyska * i) / dilu });
  }
  for (let i = 0; i < dilu; i++) popis.prvky.push({ ...prut, a: i, b: i + 1 });
  popis.stycniky[0]!.pevneX = popis.stycniky[0]!.pevneY = true;
  popis.stycniky[dilu]!.pevneX = true;
  const s = sestavSoustavu(popis);

  // Kritická síla: Eulerova, snížená o vliv smyku (Engesser).
  const euler = (Math.PI ** 2 * prut.EI) / vyska ** 2;
  const kriticka = euler / (1 + euler / prut.GAs);

  // Síla roste po stupních: polovina kritické, čtyři pětiny, a nakonec o pětinu víc.
  const stupne: [number, number][] = [
    [0, 0],
    [1.5, 0.5],
    [3, 0.5],
    [4.5, 0.8],
    [6.5, 0.8],
    [8, 1.2],
  ];
  const podil = (cas: number): number => {
    for (let i = 1; i < stupne.length; i++) {
      const [t0, p0] = stupne[i - 1]!;
      const [t1, p1] = stupne[i]!;
      if (cas <= t1) return p0 + ((p1 - p0) * (cas - t0)) / (t1 - t0);
    }
    return stupne[stupne.length - 1]![1];
  };
  const sila: SilaNaStycnik = { stycnik: dilu, fx: 0, fy: 0 };
  const zatizeni: Zatizeni = {
    pridejSily: (soustava, cas) => {
      sila.fy = -podil(cas) * kriticka;
      soustava.fy[dilu] = soustava.fy[dilu]! + sila.fy;
    },
  };
  const simulace = new Simulace(s, { tiha: 0, utlum: 0.05, zatizeni });

  const trvani = 13;
  const stred = dilu / 2;
  let priPolovine = 0;
  let priCtyrechPetinach = 0;
  let poVyboceni = 0;

  // Tvar po vybočení (elastika): P/P_kr = (2K(k)/π)², průhyb středu δ = L·k/K(k).
  const k = koren((x) => (2 * elipticky(x)) / Math.PI - Math.sqrt(1.2), 0, 0.99);
  const pruhybElastiky = (vyska * k) / elipticky(k);

  return {
    simulace,
    trvani,
    vyrez: { xMin: -5, xMax: 5, yMin: -1.5, yMax: vyska + 2.5 },
    mostovka: [],
    sily: [sila],
    poKroku: (cas) => {
      const pruhyb = Math.abs(s.x[stred]!);
      if (cas > 2.9 && cas <= 3) priPolovine = pruhyb;
      else if (cas > 6.4 && cas <= 6.5) priCtyrechPetinach = pruhyb;
      else if (cas > trvani - 0.1) poVyboceni = pruhyb;
    },
    vyhodnot: () => [
      {
        // Počáteční křivost se pod silou P zvětší 1/(1 − P/P_kr)krát.
        nazev: "zkusebna.overeni.zvetseniPriPolovine",
        namereno: priPolovine / krivost,
        ocekavano: 1 / (1 - 0.5),
        jednotka: "×",
        mist: 2,
        tolerance: 0.02,
      },
      {
        nazev: "zkusebna.overeni.zvetseniPriCtyrechPetinach",
        namereno: priCtyrechPetinach / krivost,
        ocekavano: 1 / (1 - 0.8),
        jednotka: "×",
        mist: 2,
        tolerance: 0.03,
      },
      {
        nazev: "zkusebna.overeni.pruhybPoVyboceni",
        namereno: poVyboceni,
        ocekavano: pruhybElastiky,
        jednotka: "m",
        mist: 2,
        tolerance: 0.03,
      },
    ],
  };
}

export const PRIPADY: readonly PripadZkusebny[] = [
  { id: "most", nazev: "zkusebna.most.nazev", popis: "zkusebna.most.popis", priprav: mostSKoly },
  { id: "pretizeni", nazev: "zkusebna.pretizeni.nazev", popis: "zkusebna.pretizeni.popis", priprav: pretizeni },
  { id: "plast", nazev: "zkusebna.plast.nazev", popis: "zkusebna.plast.popis", priprav: plastickyNosnik },
  { id: "vzper", nazev: "zkusebna.vzper.nazev", popis: "zkusebna.vzper.popis", priprav: vzperSloupu },
  { id: "prejezd", nazev: "zkusebna.prejezd.nazev", popis: "zkusebna.prejezd.popis", priprav: prejezdSily },
  { id: "rezonance", nazev: "zkusebna.rezonance.nazev", popis: "zkusebna.rezonance.popis", priprav: rezonance },
  { id: "tlumic", nazev: "zkusebna.tlumic.nazev", popis: "zkusebna.tlumic.popis", priprav: ladenyTlumic },
  { id: "nosnik", nazev: "zkusebna.nosnik.nazev", popis: "zkusebna.nosnik.popis", priprav: kmitajiciNosnik },
  { id: "kyvadlo", nazev: "zkusebna.kyvadlo.nazev", popis: "zkusebna.kyvadlo.popis", priprav: kyvadlo },
];
