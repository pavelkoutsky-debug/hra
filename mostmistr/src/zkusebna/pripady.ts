// Ověřovací případy zkušebny: malé úlohy se známým řešením, na kterých je vidět,
// že jádro počítá správně. Každý případ umí sám říct, co vyšlo a co vyjít mělo.
// Soubor nezávisí na prohlížeči; tytéž případy běží v testech.

import type { Obdelnik } from "../data/geometrie";
import { vlastnostiPrutu, type IdPrvku } from "../data/katalog";
import {
  kinetickaEnergie,
  polohovaEnergie,
  spoctiSily,
  TIHOVE_ZRYCHLENI,
  type NastaveniKroku,
} from "../jadro/integrator";
import { najdiRovnovahu, nejvyssiFrekvence, vlastniTvarySoustavy } from "../jadro/matice";
import { deformacniEnergie } from "../jadro/sily";
import { sestavSoustavu, type PopisSoustavy, type Soustava } from "../jadro/soustava";
import { betaProUtlum, REZERVA_KROKU, mezKroku, zvolKrok } from "../jadro/stabilita";
import { hmotyStupnu, volneStupne } from "../jadro/stupne";
import { vytvorModalniTlumeni } from "../jadro/tlumeni";
import { krokKol, vytvorKola, type Kola } from "../../mereni/kola";
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

/** Připravený běh jednoho případu. */
export interface BehPripadu {
  soustava: Soustava;
  nastaveni: NastaveniKroku;
  /** Délka děje v sekundách. */
  trvani: number;
  /** Část světa, kterou má být vidět. */
  vyrez: Obdelnik;
  /** Indexy prvků, které se kreslí jako mostovka. */
  mostovka: number[];
  /** Únosnost prvků pro obarvení podle využití. */
  unosnost: { tah: Float64Array; tlak: Float64Array; moment: Float64Array };
  kola?: Kola;
  /** Volá se před každým krokem s časem děje (buzení). */
  predKrokem?: (cas: number) => void;
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

/** Vodorovný nosník z `dilu` stejných prvků; styčník 0 je vlevo v počátku. */
function vodorovnyNosnik(delka: number, dilu: number): PopisSoustavy {
  const prut = popisPrutu(NOSNIK_ZKUSEBNY, SIRKA);
  const popis: PopisSoustavy = { stycniky: [], prvky: [] };
  for (let i = 0; i <= dilu; i++) popis.stycniky.push({ x: (delka * i) / dilu, y: 0 });
  for (let i = 0; i < dilu; i++) popis.prvky.push({ ...prut, a: i, b: i + 1 });
  return popis;
}

/** Pole únosností prvků; všechny pruty případu jsou z téhož prvku katalogu. */
function unosnostJednoduse(s: Soustava, id: IdPrvku): BehPripadu["unosnost"] {
  const v = vlastnostiPrutu(id, SIRKA)!;
  return {
    tah: new Float64Array(s.pocetPrvku).fill(v.unosnost.tah),
    tlak: new Float64Array(s.pocetPrvku).fill(v.unosnost.tlak),
    moment: new Float64Array(s.pocetPrvku).fill(v.unosnost.moment),
  };
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
  const dt = REZERVA_KROKU * mezKroku(nejvyssiFrekvence(s, volneStupne(s)));
  const nastaveni: NastaveniKroku = { dt, tiha: TIHOVE_ZRYCHLENI, alfa: 0 };
  spoctiSily(s, nastaveni.tiha, 0);

  const energie = (): number =>
    kinetickaEnergie(s) + deformacniEnergie(s) + polohovaEnergie(s, TIHOVE_ZRYCHLENI);
  const pocatecni = energie();
  let hmota = 0;
  for (let i = 0; i < s.pocetStycniku; i++) hmota += s.hmota[i]!;
  const uvolnena = hmota * TIHOVE_ZRYCHLENI * (L / 2);

  let odchylkaEnergie = 0;
  let nejnizsi = 0;
  let kroku = 0;
  const perioda = new MericPeriody();

  return {
    soustava: s,
    nastaveni,
    trvani: 8,
    vyrez: { xMin: -5, xMax: 5, yMin: -5, yMax: 1.5 },
    mostovka: [],
    unosnost: unosnostJednoduse(s, NOSNIK_ZKUSEBNY),
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
        ocekavano: 4 * Math.sqrt((2 * L) / (3 * TIHOVE_ZRYCHLENI)) * elipticky(Math.SQRT1_2),
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

/** Prostý nosník 12 m s podporami; vrací i index prostředního styčníku. */
function prostyNosnik(): { s: Soustava; stred: number; L: number; EI: number; mu: number } {
  const L = 12;
  const dilu = 8;
  const popis = vodorovnyNosnik(L, dilu);
  popis.stycniky[0]!.pevneX = true;
  popis.stycniky[0]!.pevneY = true;
  popis.stycniky[dilu]!.pevneY = true;
  const prut = popisPrutu(NOSNIK_ZKUSEBNY, SIRKA);
  return { s: sestavSoustavu(popis), stred: dilu / 2, L, EI: prut.EI, mu: prut.hmotnostNaMetr };
}

/** Prostý nosník vychýlený do prvního vlastního tvaru a puštěný: frekvence a stálá amplituda. */
function kmitajiciNosnik(): BehPripadu {
  const { s, stred, L, EI, mu } = prostyNosnik();
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
  const dt = REZERVA_KROKU * mezKroku(nejvyssiFrekvence(s, stupne));
  const nastaveni: NastaveniKroku = { dt, tiha: 0, alfa: 0 };
  spoctiSily(s, 0, 0);

  const energie = (): number => kinetickaEnergie(s) + deformacniEnergie(s);
  const pocatecni = energie();
  const trvani = 3;
  let odchylkaEnergie = 0;
  let amplitudaNaKonci = 0;
  let kroku = 0;
  const perioda = new MericPeriody();

  return {
    soustava: s,
    nastaveni,
    trvani,
    vyrez: { xMin: -1.5, xMax: L + 1.5, yMin: -3, yMax: 3 },
    mostovka: [],
    unosnost: unosnostJednoduse(s, NOSNIK_ZKUSEBNY),
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

/** Prostý nosník buzený silou ve své vlastní frekvenci: rezonanční zesílení 1/(2ζ). */
function rezonance(): BehPripadu {
  const { s, stred, L, EI } = prostyNosnik();
  const stupne = volneStupne(s);
  const utlum = 0.01;
  const amplitudaSily = 2000;
  const tvary = vlastniTvarySoustavy(s, stupne, 3);
  if (!tvary) throw new Error("Nosník nemá kladně definitní tuhost.");
  const omega = tvary.omega[0]!;
  const dt = REZERVA_KROKU * mezKroku(nejvyssiFrekvence(s, stupne));

  let cas = 0;
  const nastaveni: NastaveniKroku = {
    dt,
    tiha: 0,
    alfa: 0,
    modalni: vytvorModalniTlumeni(s, stupne, tvary, utlum, dt),
    dalsiSily: (soustava) => {
      // Zkušebna není součást herní simulace, proto si tu sinus dovolit může.
      soustava.fy[stred] = soustava.fy[stred]! + amplitudaSily * Math.sin(omega * cas);
    },
  };
  spoctiSily(s, 0, 0);

  const trvani = 26;
  let amplituda = 0;
  // Průhyb od stejně velké síly působící staticky: P·L³/(48·EI); smyk zanedbán.
  const staticky = (amplitudaSily * L ** 3) / (48 * EI);
  // Rezonuje jen první tvar; na statickém průhybu se podílí 96/π⁴.
  const podilPrvnihoTvaru = 96 / Math.PI ** 4;

  return {
    soustava: s,
    nastaveni,
    trvani,
    vyrez: { xMin: -1.5, xMax: L + 1.5, yMin: -3, yMax: 3 },
    mostovka: [],
    unosnost: unosnostJednoduse(s, NOSNIK_ZKUSEBNY),
    predKrokem: (t) => {
      cas = t + dt; // síly se počítají pro stav na konci kroku
    },
    poKroku: (t) => {
      if (t > trvani - 1) amplituda = Math.max(amplituda, Math.abs(s.y[stred]!));
    },
    vyhodnot: () => [
      {
        nazev: "zkusebna.overeni.zesileni",
        namereno: amplituda / staticky,
        ocekavano: podilPrvnihoTvaru / (2 * utlum),
        jednotka: "×",
        mist: 1,
        tolerance: 0.02,
      },
    ],
  };
}

/** Příhradový most, po kterém jedou kola: součet reakcí musí odpovídat tíze. */
function mostSKoly(): BehPripadu {
  // Nízká dřevěná příhrada pod těžkými koly: pruty jsou znatelně namáhané, takže je
  // na výkresu vidět barevná škála využití.
  const zadani = { ...REFERENCNI_MOSTY[0]!, vyska: 2 };
  const most = prihradovyMost({ ...zadani, svarene: false, prut: "drevo-lehke" });
  const pruzny = sestavSoustavu(most.popis);
  const stupne = volneStupne(pruzny);
  const omegaMax = nejvyssiFrekvence(pruzny, stupne);
  const dt = zvolKrok(omegaMax);
  const beta = betaProUtlum(omegaMax);
  const s = sestavSoustavu({
    stycniky: most.popis.stycniky,
    prvky: most.popis.prvky.map((p) => ({ ...p, beta })),
  });
  if (najdiRovnovahu(s, stupne, new Float64Array(stupne.length), TIHOVE_ZRYCHLENI) < 0) {
    throw new Error("Most nemá rovnováhu.");
  }
  const tvary = vlastniTvarySoustavy(s, stupne, 10);
  if (!tvary) throw new Error("Most nemá kladně definitní tuhost.");

  const kola = vytvorKola(s, most.mostovka, 6);
  kola.hmota = 10_000;
  kola.tuhost = 6e6;
  kola.tlumeni = 8e4;
  // Kola začínají dosednutá: stlačení pneumatiky právě unese jejich tíhu.
  for (let i = 0; i < kola.pocet; i++) kola.y[i] = -(kola.hmota * TIHOVE_ZRYCHLENI) / kola.tuhost;

  const nastaveni: NastaveniKroku = {
    dt,
    tiha: TIHOVE_ZRYCHLENI,
    alfa: 0,
    modalni: vytvorModalniTlumeni(s, stupne, tvary, 0.01, dt),
    dalsiSily: (soustava) => krokKol(soustava, kola, dt, TIHOVE_ZRYCHLENI),
  };
  spoctiSily(s, nastaveni.tiha, 0);

  let hmota = 0;
  for (let i = 0; i < s.pocetStycniku; i++) hmota += s.hmota[i]!;
  const tiha = (hmota + kola.pocet * kola.hmota) * TIHOVE_ZRYCHLENI;

  const trvani = 10;
  let soucetReakci = 0;
  let vzorku = 0;

  // Únosnost podle prvku katalogu, ze kterého je prut postaven: mostovka, nebo trám.
  const mostovka = new Set<number>();
  for (let e = 0; e < s.pocetPrvku; e++) {
    const a = s.prvekA[e]!;
    const b = s.prvekB[e]!;
    if (most.mostovka.includes(a) && most.mostovka.includes(b)) mostovka.add(e);
  }
  const tram = vlastnostiPrutu("drevo-lehke", SIRKA)!.unosnost;
  const deska = vlastnostiPrutu("mostovka-drevo", SIRKA)!.unosnost;
  const unosnost = {
    tah: new Float64Array(s.pocetPrvku),
    tlak: new Float64Array(s.pocetPrvku),
    moment: new Float64Array(s.pocetPrvku),
  };
  for (let e = 0; e < s.pocetPrvku; e++) {
    const u = mostovka.has(e) ? deska : tram;
    unosnost.tah[e] = u.tah;
    unosnost.tlak[e] = u.tlak;
    unosnost.moment[e] = u.moment;
  }

  return {
    soustava: s,
    nastaveni,
    trvani,
    vyrez: { xMin: -3, xMax: zadani.poli * zadani.delkaPole + 3, yMin: -4, yMax: zadani.vyska + 3 },
    mostovka: [...mostovka],
    unosnost,
    kola,
    poKroku: (t) => {
      if (t <= trvani - 4) return;
      // Reakce podpory je opačná k výslednici sil na zadržený styčník.
      for (let i = 0; i < s.pocetStycniku; i++) {
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

export const PRIPADY: readonly PripadZkusebny[] = [
  { id: "most", nazev: "zkusebna.most.nazev", popis: "zkusebna.most.popis", priprav: mostSKoly },
  { id: "rezonance", nazev: "zkusebna.rezonance.nazev", popis: "zkusebna.rezonance.popis", priprav: rezonance },
  { id: "nosnik", nazev: "zkusebna.nosnik.nazev", popis: "zkusebna.nosnik.popis", priprav: kmitajiciNosnik },
  { id: "kyvadlo", nazev: "zkusebna.kyvadlo.nazev", popis: "zkusebna.kyvadlo.popis", priprav: kyvadlo },
];
