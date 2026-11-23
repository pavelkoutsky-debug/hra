// Sandbox („pískoviště“): volná stavba bez rozpočtu a medailí. Hráč si nastaví údolí (rozpětí,
// hloubku, vodu, základy pro pilíře), druh trasy a provoz; z nastavení tady vznikne úroveň
// stejného tvaru, jaký mají úrovně kampaně, takže ji umí editor, zkouška i rozbor beze změny.
// Vozidla se „pouštějí ručně“ tak, že si hráč jízdní řád poskládá sám: zkouška se počítá
// napřed a pak přehrává, takže živé pouštění během děje nejde (stejně jako u budiče).

import { ID_PRVKU, KATALOG, type IdPrvku } from "./katalog";
import { ChybaDat, cislo, jedenZ, jenZnameKlice, logicka, objekt, polozky } from "./kontrola";
import { DRUHY_TRAS, nactiUroven, VERZE_UROVNE, type DruhTrasy, type PolozkaJizdnihoRadu, type Uroven } from "./uroven";

export const VERZE_SANDBOXU = 1;
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
}

export const MEZE_SANDBOXU = {
  rozpeti: { min: 6, max: 72 },
  hloubka: { min: 3, max: 24 },
  zaklady: { min: 0, max: 3 },
  pocet: { min: 1, max: 60 },
  cas: { min: 0, max: 120 },
  /** Nejvíc položek jízdního řádu. */
  polozek: 10,
} as const;

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
  };
}

/** Přečte nastavení sandboxu z dat neznámého tvaru (paměť prohlížeče). Při chybě vyhodí `ChybaDat`. */
export function nactiSandbox(data: unknown): NastaveniSandboxu {
  const c = "sandbox";
  const o = objekt(data, c);
  jenZnameKlice(o, c, ["verze", "rozpeti", "hloubka", "druh", "voda", "zaklady", "provoz"]);
  if (o.verze !== VERZE_SANDBOXU) throw new ChybaDat(`${c}.verze`, "neznámá verze nastavení sandboxu");
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
  return {
    verze: VERZE_SANDBOXU,
    rozpeti,
    hloubka: cislo(o.hloubka, `${c}.hloubka`, { ...MEZE_SANDBOXU.hloubka, cele: true }),
    druh,
    voda: logicka(o.voda, `${c}.voda`),
    // Do úzkého údolí se tři základy nevejdou; hráč se má dozvědět, kolik jich smí chtít.
    zaklady: cislo(o.zaklady, `${c}.zaklady`, { min: MEZE_SANDBOXU.zaklady.min, max: nejvicZakladu(rozpeti), cele: true }),
    provoz,
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
 * Voda se nepočítá: opěry, kotvy ani pravidla stavby se s ní nemění.
 */
export function stejneUdoli(a: NastaveniSandboxu, b: NastaveniSandboxu): boolean {
  return a.rozpeti === b.rozpeti && a.hloubka === b.hloubka && a.druh === b.druh && a.zaklady === b.zaklady;
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

/**
 * Úroveň sandboxu z nastavení. Údolí má opěry v (0, 0) a (rozpětí, 0), kotvy pro lana čtyři
 * metry za opěrami a kotvy v patách svahů (pro oblouk nebo vzpěry). Všechny hotové prvky jsou
 * dovolené kromě pístu (most se tu nezvedá); na koleji leží jen kolejiště.
 */
export function urovenSandboxu(nastaveni: NastaveniSandboxu): Uroven {
  const n = nactiSandbox(nastaveni);
  const L = n.rozpeti;
  const h = n.hloubka;
  const svah = sirkaSvahu(L);
  const okraj = Math.max(6, Math.ceil(L / 5));
  const prvky: IdPrvku[] = ID_PRVKU.filter((id) => {
    const polozka = KATALOG[id];
    // Píst tu není (most se nezvedá) a pružina taky ne: hra nemá kde nastavit její tuhost.
    if (!polozka.hotovo || polozka.druh === "pist" || polozka.druh === "pruzina") return false;
    // Na kolej patří kolejiště a nic jiného; jinde kolejiště není k ničemu.
    if (polozka.druh === "mostovka") return (id === "kolejiste") === (n.druh === "kolej");
    return true;
  });
  const lide = n.druh !== "kolej";
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
    hladina: n.voda ? -h + Math.min(2, h / 3) : null,
    kotvy: [
      { x: 0, y: 0, typ: "pevna" },
      { x: L, y: 0, typ: "posuvna" },
      { x: -4, y: 0, typ: "pevna" },
      { x: L + 4, y: 0, typ: "pevna" },
      { x: svah, y: -h, typ: "pevna" },
      { x: L - svah, y: -h, typ: "pevna" },
    ],
    zaklady: zakladySandboxu(n),
    zakazaneZony: [],
    trasy: [{ id: "trasa", druh: n.druh, zacatek: { x: 0, y: 0 }, konec: { x: L, y: 0 } }],
    sirkaMostovky: MOSTOVKA[n.druh].sirka,
    hmotnostVybaveni: MOSTOVKA[n.druh].vybaveni,
    nerovnost: "zadna",
    rozpocet: null,
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
    nejhorsiKomfort: 3,
    jizdniRad: n.provoz.map(polozkaRadu),
    pohyb: null,
    lode: [],
  });
}
