// Regresní sada: referenční mosty se scénáři a otisk jejich konečného stavu.
//
// Otisk je kontrolní součet poloh a rychlostí všech styčníků po daném čase. Jádro počítá
// jen operacemi, které dávají všude bitově stejný výsledek, takže stejný scénář má stejný
// otisk v Node i v každém prohlížeči. Když se otisk změní, změnila se fyzika: musí se
// zvýšit `VERZE_FYZIKY` a zapsat, co se změnilo.
//
// Scénáře proto nesmějí použít nic, co bitovou shodu nezaručuje: žádné goniometrické
// funkce, mocniny ani `Math.hypot`; geometrie stojí na celých metrech jako ve hře.

import type { IdPrvku } from "../data/katalog";
import { Kreslic } from "../data/kreslic";
import type { NavrhMostu } from "../data/navrh";
import { VERZE_UROVNE, type Kotva, type Uroven } from "../data/uroven";
import { vytvorBremena, zatizeniBremeny, type Bremena, type PopisBremene } from "../jadro/bremena";
import { TIHOVE_ZRYCHLENI } from "../jadro/integrator";
import { nahoda, nahodnaFaze } from "../jadro/nahoda";
import { najdiRovnovahu, vlastniTvarySoustavy } from "../jadro/matice";
import { Simulace, type NastaveniSimulace } from "../jadro/simulace";
import { sestavSoustavu, type Soustava } from "../jadro/soustava";
import { volneStupne } from "../jadro/stupne";
import { vytvorTrasu } from "../jadro/trasa";
import { otiskSimulace } from "./otisk";
import { sestavMost, type StavbaMostu } from "./stavba";
import { Zkouska } from "./zkouska";

const g = TIHOVE_ZRYCHLENI;

export { Kreslic } from "../data/kreslic";
export { Otisk, otiskSimulace } from "./otisk";
export { nahoda } from "../jadro/nahoda";

// ---------------------------------------------------------------------------------------
// Stavebnice scénářů

interface ZadaniUrovne {
  rozpeti: number;
  /** Podpory navíc ke krajním (pevná vlevo, posuvná vpravo). */
  kotvy?: Kotva[];
  /** Pravá krajní podpora je také pevná. */
  pravaPevna?: boolean;
  zaklady?: { x: number; y: number }[];
  sirka?: number;
  vybaveni?: number;
}

/** Úroveň s jednou silnicí v nulové výšce od x = 0 do x = rozpětí. */
export function urovenRegrese(z: ZadaniUrovne): Uroven {
  return {
    verze: VERZE_UROVNE,
    id: "9-99",
    nazev: "Regresní most",
    vyrez: { xMin: -20, yMin: -30, xMax: z.rozpeti + 20, yMax: 30 },
    teren: [
      { x: -20, y: 0 },
      { x: 0, y: 0 },
      { x: 1, y: -20 },
      { x: z.rozpeti - 1, y: -20 },
      { x: z.rozpeti, y: 0 },
      { x: z.rozpeti + 20, y: 0 },
    ],
    hladina: null,
    kotvy: [
      { x: 0, y: 0, typ: "pevna" },
      { x: z.rozpeti, y: 0, typ: z.pravaPevna ? "pevna" : "posuvna" },
      ...(z.kotvy ?? []),
    ],
    zaklady: z.zaklady ?? [],
    zakazaneZony: [],
    trasy: [{ id: "silnice", druh: "silnice", zacatek: { x: 0, y: 0 }, konec: { x: z.rozpeti, y: 0 } }],
    sirkaMostovky: z.sirka ?? 4,
    hmotnostVybaveni: z.vybaveni ?? 300,
    nerovnost: "zadna",
    rozpocet: null,
    inzenyrskyRozpocet: null,
    mistrovska: null,
    povolenePrvky: [],
    povoleneSvary: true,
    // Regresní mosty smějí všechno; pravidla úrovní se zkoušejí jinde.
    nejvetsiZavazi: 1e9,
    osaFrekvenci: true,
    nejvetsiTlumic: 1e9,
    rezonancniKrivka: true,
    budic: true,
    nejhorsiKomfort: 3,
    jizdniRad: [],
  };
}

/** Mostovka z polí dané délky od x = 0 do x = rozpětí. */
function mostovka(k: Kreslic, rozpeti: number, pole: number, prvek: IdPrvku = "mostovka-drevo"): void {
  for (let x = 0; x < rozpeti; x += pole) k.prut(prvek, [x, 0], [x + pole, 0]);
}

/** Prattova příhrada nad mostovkou: horní pás, svislice a diagonály klesající ke středu. */
function prihrada(k: Kreslic, rozpeti: number, pole: number, vyska: number, pas: IdPrvku, vypln: IdPrvku): void {
  mostovka(k, rozpeti, pole);
  for (let x = 0; x < rozpeti; x += pole) {
    k.prut(pas, [x, vyska], [x + pole, vyska]);
    const kStredu = x < rozpeti / 2;
    k.prut(vypln, kStredu ? [x, vyska] : [x, 0], kStredu ? [x + pole, 0] : [x + pole, vyska]);
  }
  for (let x = 0; x <= rozpeti; x += pole) k.prut(vypln, [x, 0], [x, vyska]);
}

/** Vozidlo jako hmota na pružině s tlumičem, které vjíždí na most zleva nebo zprava. */
export interface Vuz {
  /** Výchozí poloha v metrech; záporná je před levým břehem. */
  x: number;
  /** Rychlost v m/s; záporná jede doleva. */
  rychlost: number;
  hmota: number;
  /** Vlastní frekvence na pružině v Hz a poměrný útlum. */
  frekvence?: number;
  utlum?: number;
}

export interface ZadaniScenare {
  uroven: Uroven;
  navrh: NavrhMostu;
  vozy?: Vuz[];
  /** Síly bez styčníku: chodci, budič. */
  sily?: PopisBremene[];
  tiha?: number;
  nastaveni?: Partial<NastaveniSimulace>;
  /** Most je mechanismus bez klidové polohy poblíž výchozí; začne se z nakreslené polohy. */
  bezRovnovahy?: boolean;
}

export interface PripravenyScenar {
  simulace: Simulace;
  stavba: StavbaMostu;
  bremena: Bremena | null;
  /** Volné stupně mostu bez vozidel. */
  stupne: Int32Array;
}

/**
 * Postaví most z návrhu, přidá vozidla a chodce, najde výchozí rovnováhu pod vlastní
 * tíhou a založí simulaci tak, jak to bude dělat zkouška ve hře.
 */
export function pripravScenar(z: ZadaniScenare): PripravenyScenar {
  const stavba = sestavMost(z.uroven, z.navrh);
  const stycnikuMostu = stavba.popis.stycniky.length;
  const trasa = z.uroven.trasy[0]!;
  const tiha = z.tiha ?? g;

  const kontakty: PopisBremene[] = [];
  const vozy = z.vozy ?? [];
  for (const vuz of vozy) {
    const omega = 2 * Math.PI * (vuz.frekvence ?? 1.5);
    const tuhost = vuz.hmota * omega * omega;
    const tlumeni = 2 * (vuz.utlum ?? 0.3) * vuz.hmota * omega;
    const zem = vuz.x <= trasa.zacatek.x ? trasa.zacatek.y : trasa.konec.y;
    kontakty.push({ stycnik: stavba.popis.stycniky.length, tuhost, tlumeni });
    stavba.popis.stycniky.push({ x: vuz.x, y: zem - (vuz.hmota * tiha) / tuhost, pevneX: true, hmota: vuz.hmota });
  }
  const s = sestavSoustavu(stavba.popis);
  vozy.forEach((vuz, i) => {
    s.vx[stycnikuMostu + i] = vuz.rychlost;
  });

  const stupne = volneStupne(s).filter((kod) => kod < 3 * stycnikuMostu);
  if (!z.bezRovnovahy && najdiRovnovahu(s, stupne, new Float64Array(stupne.length), tiha) < 0) {
    throw new Error("Referenční most nemá výchozí rovnováhu.");
  }

  let bremena: Bremena | null = null;
  const popisy = [...kontakty, ...(z.sily ?? [])];
  if (popisy.length > 0) {
    const pruty = stavba.trasy[0]?.pruty ?? [];
    bremena = vytvorBremena(vytvorTrasu(s, pruty), popisy);
  }
  const nastaveni: NastaveniSimulace = {
    tiha,
    utlum: 0.01,
    utlumPrvku: stavba.utlumPrvku,
    tlumeneStupne: stupne,
    ...z.nastaveni,
  };
  if (bremena) nastaveni.zatizeni = zatizeniBremeny(bremena);
  return { simulace: new Simulace(s, nastaveni), stavba, bremena, stupne };
}

/** První vlastní frekvence mostu v Hz; scénáře s rezonancí podle ní ladí buzení. */
function prvniFrekvence(s: Soustava, stupne: Int32Array): number {
  const tvary = vlastniTvarySoustavy(s, stupne, 1);
  if (!tvary) throw new Error("Referenční most nemá kladně definitní tuhost.");
  return tvary.omega[0]! / (2 * Math.PI);
}

// ---------------------------------------------------------------------------------------
// Scénáře

export interface Scenar {
  id: string;
  /** Délka děje v sekundách. */
  trvani: number;
  /** Zadání scénáře; `pripravScenar` z něj postaví most a založí simulaci. */
  zadani: () => ZadaniScenare;
  /** Scénář končí zřícením: jeho průběh je chaotický a nehodí se pro zrcadlovou zkoušku. */
  zriceni?: boolean;
}

const CHODEC = 800;

/** Chodec jako jedoucí síla s krokovou frekvencí; první až třetí harmonická podle Bachmanna. */
function chodec(x: number, rychlost: number, frekvence: number, faze: [number, number] = [1, 0]): PopisBremene {
  return {
    x,
    rychlost,
    tiha: CHODEC,
    buzeni: { frekvence, amplitudy: [0.4 * CHODEC, 0, 0, -0.1 * CHODEC, 0, -0.1 * CHODEC], faze },
  };
}

function tramovyMost(svar: boolean): NavrhMostu {
  const k = new Kreslic();
  mostovka(k, 12, 4);
  if (svar) k.svarVse();
  return k.navrh();
}

function drevenaPrihrada(): NavrhMostu {
  const k = new Kreslic();
  prihrada(k, 24, 4, 4, "drevo-tezke", "drevo-tezke");
  return k.navrh();
}

function ocelovaPrihrada(rozpeti: number, svar: boolean): NavrhMostu {
  const k = new Kreslic();
  prihrada(k, rozpeti, 4, 4, "ocel-lehka", "ocel-lehka");
  if (svar) k.svarVse();
  return k.navrh();
}

/** Rozpětí lávky v metrech. */
const LAVKA = 24;

/** Ocelová lávka: dřevěná mostovka na dvojici těžkých nosníků, vše svařené. */
function lavka(): Kreslic {
  const k = new Kreslic();
  mostovka(k, LAVKA, 4);
  for (let x = 0; x < LAVKA; x += 4) k.prut("ocel-tezka", [x, 0], [x + 4, 0]);
  k.svarVse();
  return k;
}

/**
 * Lávka s laděným tlumičem: závaží pod středem visí na dvou šikmých pružinách s tlumiči.
 * `tuhost` a `tlumeni` jsou svislé hodnoty celého závěsu.
 */
function lavkaSTlumicem(hmota: number, tuhost: number, tlumeni: number): NavrhMostu {
  const k = lavka();
  k.bod(12, -2, { zavazi: hmota });
  // Pružina se sklonem 2 : 4 přispívá svisle pětinou své tuhosti (sin² sklonu); dvě dají dvě pětiny.
  for (const x of [8, 16]) {
    k.prut("pruzina", [x, 0], [12, -2], { tuhost: 2.5 * tuhost });
    k.prut("tlumic", [x, 0], [12, -2], { tlumeni: 2.5 * tlumeni });
  }
  return k.navrh();
}

function oblouk(): NavrhMostu {
  const k = new Kreslic();
  mostovka(k, 24, 4);
  const body: [number, number][] = [
    [0, -6],
    [4, -3],
    [8, -1],
    [12, 0],
    [16, -1],
    [20, -3],
    [24, -6],
  ];
  for (let i = 0; i + 1 < body.length; i++) k.prut("ocel-lehka", body[i]!, body[i + 1]!);
  for (const [x, y] of body) if (y < 0 && y > -6) k.prut("ocel-lehka", [x, y], [x, 0]);
  k.svarVse();
  return k.navrh();
}

function zavesenyMost(): NavrhMostu {
  const k = new Kreslic();
  mostovka(k, 24, 4);
  k.svarVse();
  // Pylon je do mostovky vetknut svarem; lana jsou předepnutá na 3 % své pevnosti.
  k.prut("ocel-tezka", [12, 0], [12, 8]);
  for (const x of [4, 8, 16, 20]) k.prut("lano", [12, 8], [x, 0], { predpeti: 0.03 });
  return k.navrh();
}

function mostSPilirem(): NavrhMostu {
  const k = new Kreslic();
  mostovka(k, 24, 4);
  for (let x = 0; x < 24; x += 4) k.prut("ocel-lehka", [x, 0], [x + 4, 0]);
  k.prut("pilir", [12, -8], [12, 0]);
  k.svarVse();
  return k.navrh();
}

/** Most uložený na pružných ložiskách: krajní pole visí na svislých pružinách s tlumiči. */
function pruzneUlozeni(): NavrhMostu {
  const k = new Kreslic();
  for (let x = 4; x < 20; x += 4) k.prut("mostovka-drevo", [x, 0], [x + 4, 0]);
  k.prut("mostovka-drevo", [0, 0], [4, 0]);
  k.prut("mostovka-drevo", [20, 0], [24, 0]);
  for (let x = 0; x < 24; x += 4) k.prut("ocel-lehka", [x, 2], [x + 4, 2]);
  for (let x = 0; x <= 24; x += 4) k.prut("ocel-lehka", [x, 0], [x, 2]);
  for (let x = 0; x < 24; x += 4) k.prut("ocel-lehka", x < 12 ? [x, 2] : [x, 0], x < 12 ? [x + 4, 0] : [x + 4, 2]);
  k.svarVse();
  k.prut("pruzina", [8, 0], [8, -2], { tuhost: 4e6 });
  k.prut("tlumic", [8, 0], [8, -2], { tlumeni: 2e5 });
  k.prut("pruzina", [16, 0], [16, -2], { tuhost: 4e6 });
  k.prut("tlumic", [16, 0], [16, -2], { tlumeni: 2e5 });
  return k.navrh();
}

function konzola(): NavrhMostu {
  const k = new Kreslic();
  mostovka(k, 8, 4);
  k.prut("ocel-lehka", [0, 0], [4, 0]);
  k.prut("ocel-lehka", [4, 0], [8, 0]);
  k.prut("ocel-lehka", [0, 3], [4, 0]);
  k.svarVse();
  k.bod(8, 0, { zavazi: 500 });
  return k.navrh();
}

/** Řetěz kloubově spojených prutů zavěšený mezi břehy: mechanismus s velkými natočeními. */
function retez(): NavrhMostu {
  const k = new Kreslic();
  const body: [number, number][] = [
    [0, 0],
    [3, -4],
    [7, -6],
    [12, -7],
    [17, -6],
    [21, -4],
    [24, 0],
  ];
  for (let i = 0; i + 1 < body.length; i++) k.prut("ocel-lehka", body[i]!, body[i + 1]!);
  return k.navrh();
}

/** Šest lidí pochodujících za sebou ve stejné fázi. */
function utvar(kadence: number): PopisBremene[] {
  const lide: PopisBremene[] = [];
  for (let i = 0; i < 6; i++) lide.push(chodec(-1 - 0.9 * i, 0.75 * kadence, kadence));
  return lide;
}

function dav(pocet: number, nasada: number, rozpeti: number): PopisBremene[] {
  const nahodne = nahoda(nasada);
  const lide: PopisBremene[] = [];
  for (let i = 0; i < pocet; i++) {
    // Kadence 1,6 až 2,2 Hz, krok 0,75 m, náhodná fáze; lidé jsou rozmístění před mostem i na něm.
    const kadence = 1.6 + 0.6 * nahodne();
    lide.push(chodec(-6 + (rozpeti + 4) * nahodne(), 0.75 * kadence, kadence, nahodnaFaze(nahodne)));
  }
  return lide;
}

export const SCENARE: readonly Scenar[] = [
  {
    id: "tram-kloubovy",
    trvani: 3,
    zadani: () => ({
      uroven: urovenRegrese({
        rozpeti: 12,
        kotvy: [
          { x: 4, y: 0, typ: "posuvna" },
          { x: 8, y: 0, typ: "posuvna" },
        ],
      }),
      navrh: tramovyMost(false),
      vozy: [{ x: -2, rychlost: 8, hmota: 1500 }],
    }),
  },
  {
    id: "tram-svareny",
    trvani: 3,
    zadani: () => ({
      uroven: urovenRegrese({ rozpeti: 12, kotvy: [{ x: 8, y: 0, typ: "posuvna" }] }),
      navrh: tramovyMost(true),
      vozy: [
        { x: -2, rychlost: 8, hmota: 800 },
        { x: -4.7, rychlost: 8, hmota: 700 },
      ],
    }),
  },
  {
    id: "prihrada-drevena",
    trvani: 4,
    zadani: () => ({
      uroven: urovenRegrese({ rozpeti: 24 }),
      navrh: drevenaPrihrada(),
      vozy: [
        { x: -1, rychlost: 10, hmota: 1500 },
        { x: -5, rychlost: 10, hmota: 2500 },
      ],
    }),
  },
  {
    id: "prihrada-ocelova-kloubova",
    trvani: 4,
    zadani: () => ({
      uroven: urovenRegrese({ rozpeti: 32 }),
      navrh: ocelovaPrihrada(32, false),
      vozy: [
        { x: -1, rychlost: 11, hmota: 3000 },
        { x: -4.6, rychlost: 11, hmota: 3000 },
        { x: -6, rychlost: 11, hmota: 2500 },
      ],
    }),
  },
  {
    id: "prihrada-ocelova-svarena",
    trvani: 4,
    zadani: () => ({
      uroven: urovenRegrese({ rozpeti: 32 }),
      navrh: ocelovaPrihrada(32, true),
      vozy: [
        { x: -1, rychlost: 11, hmota: 3000 },
        { x: -4.6, rychlost: 11, hmota: 3000 },
        { x: -6, rychlost: 11, hmota: 2500 },
      ],
    }),
  },
  {
    id: "protismer",
    trvani: 4,
    zadani: () => ({
      uroven: urovenRegrese({ rozpeti: 24 }),
      navrh: drevenaPrihrada(),
      vozy: [
        { x: -2, rychlost: 9, hmota: 1500 },
        { x: 27, rychlost: -12, hmota: 2500, frekvence: 1.2 },
      ],
    }),
  },
  {
    id: "lavka-chodci",
    trvani: 6,
    zadani: () => ({
      uroven: urovenRegrese({ rozpeti: LAVKA, sirka: 2, vybaveni: 80 }),
      navrh: lavka().navrh(),
      sily: [chodec(-1, 1.35, 1.8), chodec(-2.5, 1.5, 2), chodec(LAVKA + 1, -1.2, 1.6, [0, 1])],
    }),
  },
  {
    id: "lavka-pochod-v-rezonanci",
    trvani: 8,
    zadani: () => {
      const uroven = urovenRegrese({ rozpeti: LAVKA, sirka: 2, vybaveni: 80 });
      // Útvar šesti lidí pochodujících ve fázi, laděný na první frekvenci prázdné lávky.
      const prazdna = pripravScenar({ uroven, navrh: lavka().navrh() });
      const kadence = prvniFrekvence(prazdna.simulace.soustava, prazdna.stupne);
      return { uroven, navrh: lavka().navrh(), sily: utvar(kadence) };
    },
  },
  {
    id: "lavka-ladeny-tlumic",
    trvani: 8,
    zadani: () => {
      const uroven = urovenRegrese({ rozpeti: LAVKA, sirka: 2, vybaveni: 80 });
      const prazdna = pripravScenar({ uroven, navrh: lavka().navrh() });
      const kadence = prvniFrekvence(prazdna.simulace.soustava, prazdna.stupne);
      // Závaží 300 kg (asi dvacetina hmoty kmitající lávky) laděné těsně pod její frekvenci.
      const omega = 2 * Math.PI * kadence * 0.95;
      const navrh = lavkaSTlumicem(300, 300 * omega * omega, 0.25 * 300 * omega);
      return { uroven, navrh, sily: utvar(kadence) };
    },
  },
  {
    id: "dav-na-lavce",
    trvani: 6,
    zadani: () => ({
      uroven: urovenRegrese({ rozpeti: LAVKA, sirka: 3, vybaveni: 100 }),
      navrh: lavka().navrh(),
      sily: dav(30, 20261120, LAVKA),
    }),
  },
  {
    id: "oblouk",
    trvani: 4,
    zadani: () => ({
      uroven: urovenRegrese({
        rozpeti: 24,
        kotvy: [
          { x: 0, y: -6, typ: "pevna" },
          { x: 24, y: -6, typ: "pevna" },
        ],
      }),
      navrh: oblouk(),
      vozy: [
        { x: -1, rychlost: 10, hmota: 6000 },
        { x: -5, rychlost: 10, hmota: 10000 },
      ],
    }),
  },
  {
    id: "zaveseny",
    trvani: 4,
    zadani: () => ({
      uroven: urovenRegrese({ rozpeti: 24, kotvy: [{ x: 12, y: 0, typ: "pevna" }] }),
      navrh: zavesenyMost(),
      vozy: [{ x: -1, rychlost: 10, hmota: 3000 }],
    }),
  },
  {
    id: "pilir",
    trvani: 4,
    zadani: () => ({
      uroven: urovenRegrese({ rozpeti: 24, zaklady: [{ x: 12, y: -8 }] }),
      navrh: mostSPilirem(),
      vozy: [
        { x: -1, rychlost: 10, hmota: 2000 },
        { x: -5.5, rychlost: 10, hmota: 4000 },
      ],
    }),
  },
  {
    id: "pruzne-ulozeni",
    trvani: 4,
    zadani: () => ({
      uroven: urovenRegrese({
        rozpeti: 24,
        kotvy: [
          { x: 8, y: -2, typ: "pevna" },
          { x: 16, y: -2, typ: "pevna" },
        ],
      }),
      navrh: pruzneUlozeni(),
      vozy: [{ x: -1, rychlost: 12, hmota: 12000 }],
    }),
  },
  {
    id: "konzola",
    trvani: 3,
    zadani: () => ({
      uroven: {
        ...urovenRegrese({ rozpeti: 8 }),
        // Pravý konec je volný: jediné podpory jsou vlevo.
        kotvy: [
          { x: 0, y: 0, typ: "vetknuti" },
          { x: 0, y: 3, typ: "pevna" },
        ],
      },
      navrh: konzola(),
      sily: [chodec(-1, 1.5, 2)],
    }),
  },
  {
    id: "retez",
    trvani: 4,
    zadani: () => ({
      uroven: urovenRegrese({ rozpeti: 24, pravaPevna: true }),
      navrh: retez(),
      // Nakreslený tvar není rovnovážný: řetěz se po puštění rozhoupá a tlumí ho jen hmota.
      bezRovnovahy: true,
      nastaveni: { utlum: 0.02 },
    }),
  },
  {
    id: "pretizeni-drevo",
    trvani: 3,
    zriceni: true,
    zadani: () => ({
      uroven: urovenRegrese({ rozpeti: 24 }),
      navrh: drevenaPrihrada(),
      vozy: [
        { x: -1, rychlost: 8, hmota: 60000 },
        { x: -4, rychlost: 8, hmota: 60000 },
        { x: -7, rychlost: 8, hmota: 60000 },
      ],
    }),
  },
  {
    id: "pretizeni-ocel",
    trvani: 3,
    zriceni: true,
    zadani: () => ({
      uroven: urovenRegrese({ rozpeti: LAVKA, sirka: 2, vybaveni: 80 }),
      navrh: lavka().navrh(),
      vozy: [
        { x: -1, rychlost: 6, hmota: 60000 },
        { x: -3, rychlost: 6, hmota: 60000 },
      ],
    }),
  },
  {
    id: "pretizeni-zaveseny",
    trvani: 3,
    zriceni: true,
    zadani: () => ({
      uroven: urovenRegrese({ rozpeti: 24, kotvy: [{ x: 12, y: 0, typ: "pevna" }] }),
      navrh: zavesenyMost(),
      vozy: [
        { x: -1, rychlost: 8, hmota: 150000 },
        { x: -4, rychlost: 8, hmota: 150000 },
      ],
    }),
  },
  {
    id: "dlouhy-most",
    trvani: 1,
    zadani: () => ({
      uroven: urovenRegrese({
        rozpeti: 120,
        kotvy: [
          { x: 32, y: 0, typ: "posuvna" },
          { x: 60, y: 0, typ: "posuvna" },
          { x: 88, y: 0, typ: "posuvna" },
        ],
      }),
      navrh: ocelovaPrihrada(120, true),
      vozy: [
        { x: 3, rychlost: 14, hmota: 9000 },
        { x: 7, rychlost: 14, hmota: 9000 },
        { x: 40, rychlost: 14, hmota: 12000 },
        { x: 117, rychlost: -14, hmota: 9000 },
        { x: 80, rychlost: -14, hmota: 12000 },
      ],
    }),
  },
];

/**
 * Scénář, který běží celou zkouškou úrovně (jízdní řád, modely vozidel, nerovnosti, brzdění),
 * ne jen jádrem s jednoduchými břemeny. Hlídá cesty výpočtu, které ostatní scénáře neznají.
 */
export interface ScenarZkousky {
  id: string;
  /** Nejdelší délka děje v sekundách; zkouška může skončit dřív. */
  trvani: number;
  zadani: () => { uroven: Uroven; navrh: NavrhMostu; nasada: number };
}

/** Kolejiště ze čtyř polí po 6 m a nad ním příhrada z těžké oceli vysoká 5 m. */
function prihradaTrate(): NavrhMostu {
  const k = new Kreslic();
  for (let x = 0; x < 24; x += 6) k.prut("kolejiste", [x, 0], [x + 6, 0]);
  k.prut("ocel-tezka", [0, 0], [6, 5]);
  k.prut("ocel-tezka", [6, 5], [12, 5]);
  k.prut("ocel-tezka", [12, 5], [18, 5]);
  k.prut("ocel-tezka", [18, 5], [24, 0]);
  for (const x of [6, 12, 18]) k.prut("ocel-lehka", [x, 0], [x, 5]);
  k.prut("ocel-lehka", [6, 5], [12, 0]);
  k.prut("ocel-lehka", [18, 5], [12, 0]);
  return k.navrh();
}

export const SCENARE_ZKOUSEK: readonly ScenarZkousky[] = [
  {
    // Vlak na koleji se styky: lokomotiva, ložený a osobní vůz (podvozky s dvojím vypružením),
    // na mostě zabrzdí, postojí a rozjede se.
    id: "vlak-brzdi-na-stycich",
    trvani: 14,
    zadani: () => ({
      uroven: {
        ...urovenRegrese({ rozpeti: 24, sirka: 5, vybaveni: 800 }),
        trasy: [{ id: "kolej", druh: "kolej", zacatek: { x: 0, y: 0 }, konec: { x: 24, y: 0 } }],
        nerovnost: "B",
        jizdniRad: [
          {
            cas: 0,
            trasa: "kolej",
            smer: 1,
            druh: "lokomotiva",
            vozy: [
              { druh: "vuz-nakladni", pocet: 1 },
              { druh: "vuz-osobni", pocet: 1 },
            ],
            brzdeni: { misto: 20, stani: 1, zpomaleni: 2 },
          },
        ],
      },
      navrh: prihradaTrate(),
      nasada: 5,
    }),
  },
];

/** Všechny scénáře regresní sady dohromady; tolik otisků má uložený soubor. */
export const POCET_SCENARU = SCENARE.length + SCENARE_ZKOUSEK.length;

/** Spustí scénář se zkouškou úrovně a vrátí otisk stavu na jejím konci. */
export function spustScenarZkousky(scenar: ScenarZkousky): VysledekScenare {
  const { uroven, navrh, nasada } = scenar.zadani();
  const zkouska = new Zkouska(uroven, navrh, nasada);
  const { simulace } = zkouska;
  while (simulace.cas < scenar.trvani && !zkouska.hotovo) simulace.krok();
  return {
    id: scenar.id,
    otisk: otiskSimulace(simulace),
    kroku: simulace.kroku,
    poruseni: simulace.udalosti.length,
    rozpadla: simulace.rozpadla,
  };
}

export interface VysledekScenare {
  id: string;
  otisk: string;
  kroku: number;
  poruseni: number;
  /** Výpočet se rozpadl na neplatná čísla. */
  rozpadla: boolean;
}

/** Spustí scénář na celou délku děje a vrátí otisk konečného stavu. */
export function spustScenar(scenar: Scenar): VysledekScenare {
  const { simulace } = pripravScenar(scenar.zadani());
  while (simulace.cas < scenar.trvani && !simulace.rozpadla) simulace.krok();
  return {
    id: scenar.id,
    otisk: otiskSimulace(simulace),
    kroku: simulace.kroku,
    poruseni: simulace.udalosti.length,
    rozpadla: simulace.rozpadla,
  };
}
