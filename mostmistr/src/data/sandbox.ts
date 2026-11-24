// Sandbox („pískoviště“, od M15 dílna): volná stavba bez medailí. Hráč si nastaví údolí (rozpětí,
// hloubku, vodu, základy pro pilíře), druh trasy a provoz, případně zvedání mostu s lodí a
// vlastní cíl (rozpočet, třída kmitání); z nastavení tady vznikne úroveň stejného tvaru, jaký
// mají úrovně kampaně, takže ji umí editor, zkouška i rozbor beze změny. Vozidla se „pouštějí
// ručně“ tak, že si hráč jízdní řád poskládá sám: zkouška se počítá napřed a pak přehrává,
// takže živé pouštění během děje nejde (stejně jako u budiče).

import { ID_PRVKU, KATALOG, type IdPrvku } from "./katalog";
import { ChybaDat, cislo, jedenZ, jenZnameKlice, logicka, neboNull, objekt, polozky } from "./kontrola";
import { DRUHY_TRAS, nactiUroven, VERZE_UROVNE, type DruhTrasy, type PolozkaJizdnihoRadu, type Uroven } from "./uroven";

/**
 * Verze nastavení. 1: údolí, trasa a provoz (M7). 2: zvedání mostu s lodí a volitelný cíl
 * (rozpočet, třída kmitání; M15). Starší nastavení se při čtení doplní (`nactiSandbox`).
 */
export const VERZE_SANDBOXU = 2;
/**
 * Id úrovně sandboxu: pod ním se ukládá rozestavěný most. Kapitola 0 je mimo kampaň (stejně
 * jako zkušební výkres 0-00); formát úrovně jiný tvar id než „kapitola-pořadí“ nezná.
 */
export const ID_SANDBOXU = "0-01";

/** Co jde v sandboxu poslat přes most, podle druhu trasy. Vlaky jsou hotové soupravy. */
export const PROVOZ_SANDBOXU = {
  lavka: ["chodec", "bezec", "cyklista", "utvar", "dav", "bezecky-zavod", "pruvod", "skakajici-dav"],
  silnice: ["auto", "dodavka", "autobus", "nakladni", "souprava", "nadmerny", "chodec", "cyklista"],
  kolej: ["vlak-osobni", "vlak-nakladni", "lokomotiva"],
} as const satisfies Record<DruhTrasy, readonly string[]>;

export type DruhProvozuSandboxu = (typeof PROVOZ_SANDBOXU)[DruhTrasy][number];

const VSECHEN_PROVOZ: readonly DruhProvozuSandboxu[] = [
  ...new Set<DruhProvozuSandboxu>([...PROVOZ_SANDBOXU.lavka, ...PROVOZ_SANDBOXU.silnice, ...PROVOZ_SANDBOXU.kolej]),
];

export interface PolozkaSandboxu {
  druh: DruhProvozuSandboxu;
  /** Lidí nebo vozidel ve skupině; u vlaku počet vozů za lokomotivou. */
  pocet: number;
  smer: 1 | -1;
  /** Kdy vstoupí na trasu, s. */
  cas: number;
}

/** Zvedací most v pískovišti: kdy se začne zvedat a jak vysoká loď pod ním propluje. */
export interface ZvedaniSandboxu {
  /** Ve které sekundě zkoušky se zámky odemknou a písty začnou most zvedat. */
  cas: number;
  /** Výška lodi nad hladinou, m; 0 = most se zvedne a sklopí naprázdno, loď nepluje. */
  lod: number;
  /**
   * Kolik křídel most má. Jedno: čep na levé opěře, pravá opěra je ložisko pro zámek, kotvy
   * pístů jen vlevo. Dvě: obě opěry pevné (čepy), kotvy pístů pod oběma, zámek mezi křídly.
   */
  kridla: 1 | 2;
}

export interface NastaveniSandboxu {
  verze: typeof VERZE_SANDBOXU;
  /** Rozpětí údolí od opěry k opěře, m (celé metry). */
  rozpeti: number;
  /** Hloubka údolí pod niveletou, m. */
  hloubka: number;
  druh: DruhTrasy;
  /** Je na dně údolí voda? */
  voda: boolean;
  /** Počet základů pro pilíře na dně údolí. */
  zaklady: number;
  provoz: PolozkaSandboxu[];
  /** Zvedací most (píst a zámek v paletě, kotvy pro písty pod opěrami); null = most se nezvedá. */
  zvedani: ZvedaniSandboxu | null;
  /** Volitelný cíl: rozpočet v Kč, do kterého se most musí vejít; null = bez rozpočtu. */
  rozpocet: number | null;
  /** Volitelný cíl: nejhorší třída kmitání pod lidmi, se kterou most obstojí (3 = jako bez cíle). */
  komfort: 1 | 2 | 3;
}

export const MEZE_SANDBOXU = {
  rozpeti: { min: 6, max: 72 },
  hloubka: { min: 3, max: 24 },
  zaklady: { min: 0, max: 3 },
  pocet: { min: 1, max: 60 },
  cas: { min: 0, max: 120 },
  /** Nejvíc položek jízdního řádu. */
  polozek: 10,
  /** Kdy se most začne zvedat, s, a výška lodi nad hladinou, m. */
  zvedani: { min: 0, max: 100 },
  lod: { min: 0, max: 20 },
  /** Rozpočet jako cíl, Kč. */
  rozpocet: { min: 10_000, max: 50_000_000 },
} as const;

/** Za jak dlouho po začátku zvedání pod mostem vpluje loď, jak dlouho pluje a kdy se most sklopí, s. */
const ZVEDANI = { lodPo: 7, lodTrva: 3, sklopitPo: 11, sklopitBezLodi: 8 } as const;

/** Největší počet ve skupině podle druhu: vlak má vozy, těžká vozidla jezdí po málo kusech. */
export function nejvicVeSkupine(druh: DruhProvozuSandboxu): number {
  if (druh === "lokomotiva" || druh === "nadmerny") return 2;
  if (druh === "vlak-osobni" || druh === "vlak-nakladni") return 12;
  if (druh === "autobus" || druh === "nakladni" || druh === "souprava") return 6;
  if (druh === "auto" || druh === "dodavka" || druh === "cyklista" || druh === "bezec") return 12;
  return MEZE_SANDBOXU.pocet.max;
}

/** Výchozí počet ve skupině: tolik, aby položka hned něco předvedla. */
export function vychoziPocet(druh: DruhProvozuSandboxu): number {
  switch (druh) {
    case "dav":
    case "bezecky-zavod":
    case "pruvod":
    case "skakajici-dav":
      return 30;
    case "utvar":
      return 20;
    case "chodec":
      return 4;
    case "vlak-osobni":
      return 4;
    case "vlak-nakladni":
      return 6;
    default:
      return 1;
  }
}

/** Jízdní řád, se kterým trasa daného druhu začíná: aby po přepnutí trasy hned něco jelo. */
export function vychoziProvoz(druh: DruhTrasy): PolozkaSandboxu[] {
  if (druh === "lavka") return [{ druh: "chodec", pocet: 4, smer: 1, cas: 0 }];
  if (druh === "kolej") return [{ druh: "vlak-osobni", pocet: 4, smer: 1, cas: 0 }];
  return [
    { druh: "auto", pocet: 2, smer: 1, cas: 0 },
    { druh: "nakladni", pocet: 1, smer: -1, cas: 4 },
  ];
}

/** Sandbox, se kterým hra začíná: údolí 24 m se silnicí a dvěma vozidly. */
export function vychoziSandbox(): NastaveniSandboxu {
  return {
    verze: VERZE_SANDBOXU,
    rozpeti: 24,
    hloubka: 8,
    druh: "silnice",
    voda: true,
    zaklady: 1,
    provoz: vychoziProvoz("silnice"),
    zvedani: null,
    rozpocet: null,
    komfort: 3,
  };
}

/**
 * Hotová údolí na jedno kliknutí: nastavení, se kterým má smysl začít. Názvy a popisy jsou ve
 * slovníku (`sandbox.predloha.<id>`). Každé musí projít kontrolou nastavení (hlídá test).
 */
export const PREDLOHY_SANDBOXU: readonly { id: string; nastaveni: NastaveniSandboxu }[] = [
  {
    id: "potok",
    nastaveni: {
      verze: VERZE_SANDBOXU,
      rozpeti: 12,
      hloubka: 4,
      druh: "lavka",
      voda: true,
      zaklady: 0,
      provoz: [
        { druh: "chodec", pocet: 6, smer: 1, cas: 0 },
        { druh: "cyklista", pocet: 2, smer: -1, cas: 3 },
      ],
      zvedani: null,
      rozpocet: null,
      komfort: 3,
    },
  },
  { id: "silnice", nastaveni: vychoziSandbox() },
  {
    id: "lavka",
    nastaveni: {
      verze: VERZE_SANDBOXU,
      rozpeti: 40,
      hloubka: 10,
      druh: "lavka",
      voda: true,
      zaklady: 1,
      provoz: [
        { druh: "dav", pocet: 40, smer: 1, cas: 0 },
        { druh: "bezecky-zavod", pocet: 30, smer: -1, cas: 30 },
      ],
      zvedani: null,
      rozpocet: null,
      komfort: 2,
    },
  },
  {
    id: "udoli",
    nastaveni: {
      verze: VERZE_SANDBOXU,
      rozpeti: 60,
      hloubka: 20,
      druh: "silnice",
      voda: false,
      zaklady: 2,
      provoz: [
        { druh: "auto", pocet: 4, smer: 1, cas: 0 },
        { druh: "autobus", pocet: 1, smer: -1, cas: 2 },
        { druh: "souprava", pocet: 2, smer: 1, cas: 12 },
      ],
      zvedani: null,
      rozpocet: null,
      komfort: 3,
    },
  },
  {
    id: "trat",
    nastaveni: {
      verze: VERZE_SANDBOXU,
      rozpeti: 36,
      hloubka: 10,
      druh: "kolej",
      voda: true,
      zaklady: 1,
      provoz: [{ druh: "vlak-nakladni", pocet: 6, smer: 1, cas: 0 }],
      zvedani: null,
      rozpocet: null,
      komfort: 3,
    },
  },
  {
    id: "kanal",
    nastaveni: {
      verze: VERZE_SANDBOXU,
      rozpeti: 16,
      hloubka: 8,
      druh: "silnice",
      voda: true,
      zaklady: 0,
      provoz: [
        { druh: "auto", pocet: 2, smer: 1, cas: 0 },
        { druh: "autobus", pocet: 1, smer: -1, cas: 22 },
      ],
      zvedani: { cas: 6, lod: 9, kridla: 2 },
      rozpocet: null,
      komfort: 3,
    },
  },
];

/** Přečte nastavení sandboxu z dat neznámého tvaru (paměť prohlížeče). Při chybě vyhodí `ChybaDat`. */
export function nactiSandbox(data: unknown): NastaveniSandboxu {
  const c = "sandbox";
  const o = objekt(data, c);
  jenZnameKlice(o, c, ["verze", "rozpeti", "hloubka", "druh", "voda", "zaklady", "provoz", "zvedani", "rozpocet", "komfort"]);
  // Nastavení verze 1 (před dílnou) nemělo zvedání ani cíl: čte se dál a doplní se.
  if (o.verze !== VERZE_SANDBOXU && o.verze !== 1) throw new ChybaDat(`${c}.verze`, "neznámá verze nastavení sandboxu");
  const stare = o.verze === 1;
  if (stare && (o.zvedani !== undefined || o.rozpocet !== undefined || o.komfort !== undefined)) {
    throw new ChybaDat(`${c}.verze`, "nastavení verze 1 nezná zvedání ani cíl");
  }
  const druh = jedenZ(o.druh, `${c}.druh`, DRUHY_TRAS);
  const povolene: readonly DruhProvozuSandboxu[] = PROVOZ_SANDBOXU[druh];
  const provoz = polozky(o.provoz, `${c}.provoz`, (h, cesta): PolozkaSandboxu => {
    const p = objekt(h, cesta);
    jenZnameKlice(p, cesta, ["druh", "pocet", "smer", "cas"]);
    const druhPolozky = jedenZ(p.druh, `${cesta}.druh`, VSECHEN_PROVOZ);
    if (!povolene.includes(druhPolozky)) throw new ChybaDat(`${cesta}.druh`, "tenhle provoz po zvolené trase nejezdí");
    const smer = cislo(p.smer, `${cesta}.smer`, { cele: true });
    if (smer !== 1 && smer !== -1) throw new ChybaDat(`${cesta}.smer`, "směr je 1 nebo −1");
    return {
      druh: druhPolozky,
      pocet: cislo(p.pocet, `${cesta}.pocet`, { min: MEZE_SANDBOXU.pocet.min, max: nejvicVeSkupine(druhPolozky), cele: true }),
      smer,
      cas: cislo(p.cas, `${cesta}.cas`, MEZE_SANDBOXU.cas),
    };
  });
  if (provoz.length > MEZE_SANDBOXU.polozek) throw new ChybaDat(`${c}.provoz`, `nejvýš ${MEZE_SANDBOXU.polozek} položek`);
  // Trať má jednu kolej: vlaky proti sobě by projely skrz sebe a zkouška by to nepoznala.
  if (druh === "kolej") {
    const jinam = provoz.findIndex((p) => p.smer !== provoz[0]!.smer);
    if (jinam > 0) throw new ChybaDat(`${c}.provoz[${jinam}].smer`, "po jedné koleji jezdí vlaky jedním směrem");
  }
  const rozpeti = cislo(o.rozpeti, `${c}.rozpeti`, { ...MEZE_SANDBOXU.rozpeti, cele: true });
  const voda = logicka(o.voda, `${c}.voda`);
  const zvedani = stare
    ? null
    : neboNull(o.zvedani, (v): ZvedaniSandboxu => {
        const z = objekt(v, `${c}.zvedani`);
        jenZnameKlice(z, `${c}.zvedani`, ["cas", "lod", "kridla"]);
        return {
          cas: cislo(z.cas, `${c}.zvedani.cas`, { ...MEZE_SANDBOXU.zvedani, cele: true }),
          lod: cislo(z.lod, `${c}.zvedani.lod`, { ...MEZE_SANDBOXU.lod, cele: true }),
          kridla: cislo(z.kridla, `${c}.zvedani.kridla`, { min: 1, max: 2, cele: true }) === 2 ? 2 : 1,
        };
      });
  if (zvedani && zvedani.lod > 0 && !voda) throw new ChybaDat(`${c}.zvedani.lod`, "loď potřebuje vodu na dně údolí");
  const komfort = stare ? 3 : cislo(o.komfort, `${c}.komfort`, { min: 1, max: 3, cele: true });
  return {
    verze: VERZE_SANDBOXU,
    rozpeti,
    hloubka: cislo(o.hloubka, `${c}.hloubka`, { ...MEZE_SANDBOXU.hloubka, cele: true }),
    druh,
    voda,
    // Do úzkého údolí se tři základy nevejdou; hráč se má dozvědět, kolik jich smí chtít.
    zaklady: cislo(o.zaklady, `${c}.zaklady`, { min: MEZE_SANDBOXU.zaklady.min, max: nejvicZakladu(rozpeti), cele: true }),
    provoz,
    zvedani,
    rozpocet: stare ? null : neboNull(o.rozpocet, (v) => cislo(v, `${c}.rozpocet`, { ...MEZE_SANDBOXU.rozpocet, cele: true })),
    komfort: komfort === 1 ? 1 : komfort === 2 ? 2 : 3,
  };
}

export function sandboxZTextu(zapis: string): NastaveniSandboxu {
  let data: unknown;
  try {
    data = JSON.parse(zapis);
  } catch {
    throw new ChybaDat("sandbox", "text není platné nastavení sandboxu");
  }
  return nactiSandbox(data);
}

export function sandboxNaText(nastaveni: NastaveniSandboxu): string {
  return JSON.stringify(nastaveni);
}

/**
 * Mají dvě nastavení stejné údolí a trasu? Když ano, most postavený v jednom platí i v druhém.
 * Voda, loď, čas zvedání ani cíl se nepočítají: opěry, kotvy ani pravidla stavby se s nimi
 * nemění. Zvedání a počet křídel ano: mění podpory, kotvy pro písty, stěny údolí a paletu.
 */
export function stejneUdoli(a: NastaveniSandboxu, b: NastaveniSandboxu): boolean {
  return (
    a.rozpeti === b.rozpeti &&
    a.hloubka === b.hloubka &&
    a.druh === b.druh &&
    a.zaklady === b.zaklady &&
    (a.zvedani?.kridla ?? 0) === (b.zvedani?.kridla ?? 0)
  );
}

/** Šířka mostovky a hmotnost jejího vybavení podle druhu trasy, jako v úrovních kampaně. */
const MOSTOVKA: Record<DruhTrasy, { sirka: number; vybaveni: number }> = {
  lavka: { sirka: 3, vybaveni: 60 },
  silnice: { sirka: 7, vybaveni: 600 },
  kolej: { sirka: 5, vybaveni: 0 },
};

/** Jak daleko od opěry leží pata svahu údolí, m. */
function sirkaSvahu(rozpeti: number): number {
  return Math.max(1, Math.min(3, Math.floor(rozpeti / 4)));
}

/** Nejmenší rozestup základů mezi sebou, m; blíž by se jejich patky i popisky překrývaly. */
const ROZESTUP_ZAKLADU = 3;

/** Kde na dně údolí smí stát základ: aspoň metr od kotev v patách svahů. */
function pasmoZakladu(rozpeti: number): { od: number; po: number } {
  const svah = sirkaSvahu(rozpeti);
  return { od: svah + 1, po: rozpeti - svah - 1 };
}

/** Kolik základů pro pilíře se do údolí daného rozpětí vejde (nejvýš kolik dovolují meze). */
export function nejvicZakladu(rozpeti: number): number {
  const { od, po } = pasmoZakladu(rozpeti);
  if (!(po >= od)) return 0;
  return Math.min(MEZE_SANDBOXU.zaklady.max, Math.floor((po - od) / ROZESTUP_ZAKLADU) + 1);
}

/** Místa základů pro pilíře na dně údolí: rovnoměrně po rozpětí, na rastru. */
function zakladySandboxu(n: NastaveniSandboxu): { x: number; y: number }[] {
  const { od, po } = pasmoZakladu(n.rozpeti);
  const pocet = Math.min(n.zaklady, nejvicZakladu(n.rozpeti));
  if (pocet <= 0) return [];
  // Nejdřív dělení rozpětí na stejná pole; kde to u úzkého údolí nevyjde (základ by stál
  // u paty svahu nebo moc blízko souseda), rozloží se základy po dně od kraje ke kraji.
  // Zleva se zaokrouhluje dolů a zprava nahoru, aby základy stály souměrně kolem středu.
  let mista = Array.from({ length: pocet }, (_, k) => {
    const presne = (n.rozpeti * (k + 1)) / (pocet + 1);
    return 2 * (k + 1) <= pocet ? Math.floor(presne + 0.5) : n.rozpeti - Math.floor(n.rozpeti - presne + 0.5);
  });
  const vejdouSe = mista.every((x, k) => x >= od && x <= po && (k === 0 || x - mista[k - 1]! >= ROZESTUP_ZAKLADU));
  if (!vejdouSe) {
    mista =
      pocet === 1
        ? [Math.round((od + po) / 2)]
        : Array.from({ length: pocet }, (_, k) => {
            const presne = od + ((po - od) * k) / (pocet - 1);
            return 2 * (k + 1) <= pocet ? Math.floor(presne + 0.5) : od + po - Math.floor(od + po - presne + 0.5);
          });
  }
  return mista.map((x) => ({ x, y: -n.hloubka }));
}

/** Položka jízdního řádu úrovně z položky sandboxu. */
function polozkaRadu(p: PolozkaSandboxu): PolozkaJizdnihoRadu {
  const zaklad = { cas: p.cas, trasa: "trasa", smer: p.smer };
  if (p.druh === "vlak-osobni") return { ...zaklad, druh: "lokomotiva", vozy: [{ druh: "vuz-osobni", pocet: p.pocet }] };
  if (p.druh === "vlak-nakladni") return { ...zaklad, druh: "lokomotiva", vozy: [{ druh: "vuz-nakladni", pocet: p.pocet }] };
  return { ...zaklad, druh: p.druh, pocet: p.pocet };
}

/** V jakých hloubkách pod opěrami jsou kotvy pro paty pístů, m (kladná čísla). */
function hloubkyKotevPistu(hloubka: number): number[] {
  return [...new Set([Math.min(3, hloubka - 1), Math.min(5, hloubka - 1)])];
}

/**
 * Kudy pod mostem pluje loď (jako v kapitole 7): u jednoho křídla dál od čepu, kde je zvednuté
 * křídlo nejvýš, a skoro až k protější opěře; u dvou křídel středem mezi nimi.
 */
function plavebniProfil(rozpeti: number, kridla: 1 | 2): { xMin: number; xMax: number } {
  if (kridla === 2) {
    const odstup = Math.max(2, Math.round(0.29 * rozpeti));
    return { xMin: odstup, xMax: rozpeti - odstup };
  }
  return { xMin: Math.ceil(rozpeti / 3), xMax: rozpeti - Math.max(1, Math.round(rozpeti / 12)) };
}

/**
 * Úroveň sandboxu z nastavení. Údolí má opěry v (0, 0) a (rozpětí, 0), kotvy pro lana čtyři
 * metry za opěrami a kotvy v patách svahů (pro oblouk nebo vzpěry). Všechny hotové prvky jsou
 * dovolené kromě pružiny; píst a zámek jen u zvedacího mostu (ten má strmé stěny údolí a pod
 * opěrou s čepem kotvy pro paty pístů). Na koleji leží jen kolejiště.
 */
export function urovenSandboxu(nastaveni: NastaveniSandboxu): Uroven {
  const n = nactiSandbox(nastaveni);
  const L = n.rozpeti;
  const h = n.hloubka;
  // Zvedací most: stěna údolí skoro svislá, aby kotvy pístů pod opěrou ležely u jejího líce.
  const svah = n.zvedani ? 1 : sirkaSvahu(L);
  const okraj = Math.max(6, Math.ceil(L / 5));
  const prvky: IdPrvku[] = ID_PRVKU.filter((id) => {
    const polozka = KATALOG[id];
    // Pružina tu není: hra nemá kde nastavit její tuhost. Píst jen u mostu, který se zvedá.
    if (!polozka.hotovo || polozka.druh === "pruzina") return false;
    if (polozka.druh === "pist") return n.zvedani !== null;
    // Na kolej patří kolejiště a nic jiného; jinde kolejiště není k ničemu.
    if (polozka.druh === "mostovka") return (id === "kolejiste") === (n.druh === "kolej");
    return true;
  });
  const lide = n.druh !== "kolej";
  const hladina = n.voda ? -h + Math.min(2, h / 3) : null;
  const zvedani = n.zvedani;
  const dveKridla = zvedani?.kridla === 2;
  const kotvyPistu = zvedani
    ? hloubkyKotevPistu(h).flatMap((d) => [{ x: 0, y: -d, typ: "pevna" }, ...(dveKridla ? [{ x: L, y: -d, typ: "pevna" }] : [])])
    : [];
  const lod = zvedani !== null && zvedani.lod > 0 && hladina !== null;
  return nactiUroven({
    verze: VERZE_UROVNE,
    id: ID_SANDBOXU,
    nazev: "Pískoviště",
    vyrez: { xMin: -okraj, yMin: -h - 2, xMax: L + okraj, yMax: Math.max(10, Math.ceil(L / 2.5)) },
    teren: [
      { x: -okraj, y: 0 },
      { x: 0, y: 0 },
      { x: svah, y: -h },
      { x: L - svah, y: -h },
      { x: L, y: 0 },
      { x: L + okraj, y: 0 },
    ],
    hladina,
    kotvy: [
      { x: 0, y: 0, typ: "pevna" },
      // Dvě křídla se otáčejí kolem čepů v obou opěrách; jinak je pravá opěra ložisko.
      { x: L, y: 0, typ: dveKridla ? "pevna" : "posuvna" },
      { x: -4, y: 0, typ: "pevna" },
      { x: L + 4, y: 0, typ: "pevna" },
      { x: svah, y: -h, typ: "pevna" },
      { x: L - svah, y: -h, typ: "pevna" },
      ...kotvyPistu,
    ],
    zaklady: zakladySandboxu(n),
    zakazaneZony: [],
    trasy: [{ id: "trasa", druh: n.druh, zacatek: { x: 0, y: 0 }, konec: { x: L, y: 0 } }],
    sirkaMostovky: MOSTOVKA[n.druh].sirka,
    hmotnostVybaveni: MOSTOVKA[n.druh].vybaveni,
    nerovnost: "zadna",
    rozpocet: n.rozpocet,
    inzenyrskyRozpocet: null,
    mistrovska: null,
    povolenePrvky: prvky,
    povoleneSvary: true,
    nejvetsiZavazi: 5000,
    // Frekvence, křivka, budič a laděný tlumič mají smysl tam, kde chodí lidé.
    osaFrekvenci: lide,
    nejvetsiTlumic: lide ? 3000 : 0,
    rezonancniKrivka: lide,
    budic: lide,
    nejhorsiKomfort: n.komfort,
    jizdniRad: n.provoz.map(polozkaRadu),
    pohyb: zvedani ? { zvednout: zvedani.cas, sklopit: zvedani.cas + (lod ? ZVEDANI.sklopitPo : ZVEDANI.sklopitBezLodi) } : null,
    lode: zvedani && lod ? [{ cas: zvedani.cas + ZVEDANI.lodPo, trvani: ZVEDANI.lodTrva, ...plavebniProfil(L, zvedani.kridla), vyska: zvedani.lod }] : [],
    zkouskova: false,
  });
}
