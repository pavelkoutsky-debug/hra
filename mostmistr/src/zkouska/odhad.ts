// Odhad kmitání mostu pod lidmi ještě při stavbě, bez časové simulace.
//
// Lidé na mostě nejsou mrtvá váha: tělo je hmota na pružině s tlumičem (chodec 2,85 Hz,
// útlum 30 %). Most pod kmitočtem těla lidé zpomalí víc, než kolik by odpovídalo jejich váze,
// most nad ním naopak zrychlí, a vždycky ho tlumí. Odhad proto počítá ustálenou odezvu mostu,
// na kterém lidé z jízdního řádu stojí tak, jak je vede zkouška (řady, rozestupy, kdo drží
// krok a kdo ne, kdo je na mostě zároveň s kým), a budí ho silou svého kroku v místech, kde stojí.
//
// Skupina, která drží krok, se sčítá s fází; volně jdoucí lidé má každý svou kadenci a fázi,
// takže se sčítají jejich výkony a výsledek se násobí činitelem špičky (rázy mezi blízkými
// kadencemi zvednou okamžité kmitání nad průměr). Výsledek je totéž číslo, které měří zkouška:
// √2 násobek efektivní hodnoty svislého zrychlení mostovky v pásmu 0,5 až 10 Hz, průměrované
// zhruba přes sekundu (`src/jadro/komfort.ts`). Průměrování je součást odhadu: dvě složky
// s blízkými frekvencemi se v něm chvílemi sečtou celé, vzdálené jen po čtvercích.
//
// Odhad je odhad: skupina ve skutečnosti přechází, ustálený stav nemusí stihnout nastat
// a lidé nad 2,5 m/s² ztrácejí krok. O mostě rozhoduje zkouška. Do simulace odtud nic
// nevstupuje, takže se tu smí počítat se siny a kosiny.

import type { IdProvozu } from "../data/katalog";
import type { Uroven } from "../data/uroven";
import { TIHOVE_ZRYCHLENI } from "../jadro/integrator";
import { OKNO_PRUMERU } from "../jadro/komfort";
import { nahoda } from "../jadro/nahoda";
import { poddajnost, type ZakladOdezvy } from "../jadro/odezva";
import { zesileniPasma } from "./kmitani";
import { jeClovek, PAUZA_SKAKANI, radySkupiny, VYCHOZI_TRVANI_SKAKANI, type Rada } from "./provoz";
import type { StavbaMostu } from "./stavba";
import { KADENCE_SKAKANI, ROZPTYL_DAVU, ROZPTYL_ZAVODU, skokan, vedleSebe } from "./vozidla";

/**
 * Jak hra odhad čte proti mezi kmitání úrovně: pod prvním podílem meze je most v klidu, nad
 * druhým nad mezí, mezi nimi rozhodne zkouška. Na tisíci mostech druhé kontroly výpočtů M11
 * (všech osm úrovní s lidmi a pískoviště) vyšel odhad na 0,69 až 1,27násobek zkoušky; výš jen
 * pod volně jdoucím davem v rezonanci, kde je i výsledek zkoušky věc náhody (jiná násada dá
 * až dvojnásobek). S těmito podíly nevyšel „klid“ u žádného mostu, který na kmitání propadl.
 */
export const ODHAD_U_MEZE = [0.75, 1.25] as const;

/**
 * Kolik vlastních tvarů mostu odhad bere. Se čtrnácti vychází stejně jako s dvaceti i třiceti
 * (měřeno na zkouškách všech úrovní s lidmi) a počítá se zhruba dvakrát rychleji.
 */
export const POCET_TVARU_ODHADU = 14;
/**
 * Kde na mostě se skupina zkouší nejdřív: čelo skupiny v těchto podílech cesty od vstupu čela
 * na most po odchod poslední řady. Dlouhá skupina je tak na mostě i jen zčásti (čelo průvodu
 * uprostřed mostu, zbytek teprve přichází). V těchto místech se počítá most se všemi těly, která
 * na něm zrovna stojí.
 */
const MISTA_SKUPINY = [0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85];
/**
 * Mezi hrubými místy se hledá jemně: odezva na dvojnásobek a trojnásobek kroku je často místní
 * (pole mostovky kmitá samo) a o metr vedle je poloviční. Jemná místa jsou po tomto kroku
 * (nejvýš tolik jich je) a k tomu každé, kde první řada stojí přesně na styčníku mostovky.
 * Počítají se levně s mostem z nejbližšího hrubého místa; ta nejhorší se pak spočítají poctivě.
 */
const KROK_JEMNYCH_MIST = 0.5;
const NEJVIC_JEMNYCH_MIST = 72;
const POCTIVE_JEMNYCH = 3;
/**
 * Skákání začíná naráz: než se kmitání ustálí, přechodový děj ho krátce zvedne nad ustálenou
 * hodnotu. Změřeno na zkouškách skákajícího davu; násobek je kalibrace, ne odvození.
 */
const NABEH_SKAKANI = 1.1;
/**
 * Kalibrace běhu proti zkouškám; příčiny jsou jen zčásti doložené, takže to nejsou odvozené
 * hodnoty a platí kolem meze kmitání.
 *
 * Závod (řady běžců, každá se svou kadencí) vychází ustáleným výpočtem zhruba o pětinu výš než
 * ve zkoušce: most je pod ním obsazený jen zčásti kratší dobu, než se kmitání stihne ustálit.
 * Jednotliví běžci za sebou (stejná kadence, každý svou fázi) naopak o pětinu níž: jejich
 * doskoky rozezvučí lehkou mostovku na jejích vlastních frekvencích kolem 10 Hz a to ustálený
 * výpočet nevidí (změřeno ve spektru zkoušky). Jeden běžec ani útvar v běhu násobek nepotřebují.
 */
const KALIBRACE_ZAVODU = 0.85;
const KALIBRACE_RADY_BEZCU = 1.2;
/** V jakém okolí frekvence prázdného mostu (jako její násobky) se hledá špička mostu s lidmi. */
const OKOLI_TVARU = [0.55, 1.5] as const;
/** Vzorky rozdělení frekvence složky: odchylka (v násobcích směrodatné odchylky) a váha. */
const VZOREK: readonly (readonly [number, number])[] = [[0, 1]];
/** Rozptyl kadence volně jdoucích lidí: sedm bodů od −2 do +2 odchylek. */
const VZORKY_KADENCE: readonly (readonly [number, number])[] = Array.from({ length: 7 }, (_, v) => {
  const odchylka = -2 + (4 * v) / 6;
  return [odchylka, Math.exp(-0.5 * odchylka * odchylka)] as const;
});

/**
 * Jak moc se v měření kmitání sečtou dvě složky, jejichž frekvence se liší o `rozdil` Hz.
 * Zkouška průměruje čtverec zrychlení přes okno jedné sekundy; ráz dvou složek kmitá s rozdílem
 * jejich frekvencí a průměrování ho propustí tím méně, čím je rychlejší. Jednička: sečtou se
 * celé amplitudy (pomalý ráz), nula: jen čtverce.
 */
function souzneni(rozdil: number): number {
  const x = 2 * Math.PI * rozdil * OKNO_PRUMERU;
  return 1 / Math.sqrt(1 + x * x);
}

/**
 * Činitel špičky volně jdoucích lidí: kolikrát největší změřené kmitání přesáhne odmocninu ze
 * součtu výkonů jednotlivých řad. Řady s různými kadencemi se chvílemi sejdou ve fázi; čím širší
 * je pásmo kadencí (`rozptyl` je směrodatná odchylka frekvence složky v Hz) a čím déle skupina
 * po mostě jde (`doba`, s), tím víc takových chvil stihne nastat.
 *
 * Výkon součtu mnoha nezávislých kmitů má exponenciální rozdělení a jeho největší hodnota z K
 * nezávislých okamžiků je ln K násobek průměru; nezávislých okamžiků je zhruba pásmo × doba.
 * Zkouška ale výkon průměruje přes sekundu: rázy rychlejší než to vyhladí, a výkyvy výkonu
 * kolem průměru jsou proto menší (`vyhlazeni` je podíl, který z nich zbude). Lidé se stejnou
 * kadencí (rozptyl 0) mají fáze dané jednou provždy a činitel je 1.
 */
export function cinitelSpicky(rozptyl: number, doba: number): number {
  if (!(rozptyl > 0) || !(doba > 0)) return 1;
  const spicka = Math.log(1 + 2 * rozptyl * doba);
  if (!(spicka > 1)) return 1;
  // Rozdíl kadencí dvou náhodných řad má odchylku √2 × rozptyl; průměr přes jeho rozdělení
  // říká, kolik z rozptylu výkonu průměrování nechá.
  const sigma = Math.SQRT2 * rozptyl;
  let zbyde = 0;
  let vahy = 0;
  for (let i = -20; i <= 20; i++) {
    const z = i / 5;
    const vaha = Math.exp(-0.5 * z * z);
    const s = souzneni(sigma * z);
    zbyde += vaha * s * s;
    vahy += vaha;
  }
  const vyhlazeni = Math.sqrt(zbyde / vahy);
  return Math.sqrt(1 + vyhlazeni * (spicka - 1));
}

/**
 * Kolikátý násobek rytmu kroku. Síla kroku má tři složky; čtvrtá vzniká jen u běhu, kde se síla
 * doskoku ořezává o nulu (viz `silyKroku`).
 */
export type Nasobek = 1 | 2 | 3 | 4;
const NASOBKY: readonly Nasobek[] = [1, 2, 3, 4];

/** Jedna složka kroku lidí na mostě a jak silně jí most podle odhadu odpovídá. */
export interface SlozkaOdhadu {
  /** Položka jízdního řádu, jejíž lidé tu složku působí, a její druh. */
  polozka: number;
  druh: IdProvozu;
  /** Rytmus kroku lidí, kteří tu složku působí, Hz. */
  rytmus: number;
  nasobek: Nasobek;
  /** Frekvence složky v Hz (rytmus × násobek). */
  frekvence: number;
  /** Drží ti lidé krok? */
  vTaktu: boolean;
  /** Odhad zrychlení mostovky od té složky samotné, m/s². */
  zrychleni: number;
}

/** Odhad pro jednu skupinu lidí z jízdního řádu. */
export interface OdhadSkupiny {
  /** Pořadí položky v jízdním řádu úrovně. */
  polozka: number;
  druh: IdProvozu;
  /**
   * Odhad největšího zrychlení mostovky za dobu, kdy ta skupina po mostě jde, m/s². Počítá se
   * i s lidmi jiných položek, kteří jsou na mostě s ní.
   */
  zrychleni: number;
  /**
   * Složky kroku ve chvíli největšího kmitání, seřazené od nejsilnější odezvy. Patří hlavně té
   * skupině; když je s ní na mostě někdo další, jsou tu i jeho (každá složka říká, čí je).
   */
  slozky: SlozkaOdhadu[];
  /** Kde na své cestě mostem (0 vstup čela, 1 odchod poslední řady) skupina most rozkmitá nejvíc. */
  misto: number;
  /** Styčník mostovky (pořadí podle x), který podle odhadu kmitá nejvíc. */
  stycnik: number;
}

/** Odhad kmitání mostu pod lidmi úrovně. */
export interface OdhadKmitani {
  /** Největší odhad přes skupiny, m/s². */
  zrychleni: number;
  /** Skupiny v pořadí jízdního řádu. */
  skupiny: OdhadSkupiny[];
}

/** Laděný tlumič pro odhad: odpružená hmota zavěšená v jednom místě základu odezvy. */
export interface TlumicOdhadu {
  /** Pořadí místa v `ZakladOdezvy.mista`. */
  misto: number;
  /** Hmotnost závaží, kg; tuhost pružiny, N/m; tlumení, N·s/m. */
  hmota: number;
  tuhost: number;
  tlumeni: number;
}

/** Co se dá odhadu upřesnit. */
export interface VolbyOdhadu {
  /**
   * Násada zkoušky. S ní odhad zná fáze kroku jednotlivců se stejnou kadencí (chodci, běžci)
   * a sčítá je tak, jak se sejdou ve zkoušce; bez ní sčítá jejich výkony.
   */
  nasada?: number;
  /** Laděné tlumiče navíc k tomu, co už v základu odezvy je. */
  tlumice?: readonly TlumicOdhadu[];
  /** Bez jemného hledání polohy: jen hrubá místa. Pro levné porovnání obměn téhož mostu. */
  hrube?: boolean;
}

/** Řada lidí pro odhad: kde za čelem skupiny stojí, co váží její těla a jak budí. */
interface RadaOdhadu {
  zaCelem: number;
  /** Tělo řady: hmota na pružině s tlumičem. */
  hmota: number;
  tuhost: number;
  tlumeni: number;
  /** Amplitudy složek síly kroku celé řady (rytmus a jeho násobky), N. */
  sily: [number, number, number, number];
  /** Fáze kroku řady (kosinus a sinus), když ji odhad zná. */
  faze: [number, number] | null;
}

/** Lidé jedné skupiny se stejným rytmem. */
interface CastSkupiny {
  rytmus: number;
  /** Směrodatná odchylka kadence mezi řadami, Hz; nula, když ji všichni drží stejnou. */
  rozptyl: number;
  vTaktu: boolean;
  /** Řady mají stejnou kadenci a známé fáze: sčítají se s nimi. */
  sFazi: boolean;
  rady: RadaOdhadu[];
}

/** Položka jízdního řádu připravená pro odhad. */
interface PolozkaOdhadu {
  polozka: number;
  druh: IdProvozu;
  /** Těla všech lidí skupiny (i těch, kteří zrovna nebudí). */
  tela: RadaOdhadu[];
  /** Kdo budí při chůzi a kdo při skákání (jen skákající dav). */
  chuze: CastSkupiny[];
  skakani: CastSkupiny[];
  /** Vzdálenost poslední řady od čela, m. */
  delka: number;
  /** Rychlost, kterou skupina jde, m/s; kdy vyráží a jak daleko před mostem. */
  rychlost: number;
  cas: number;
  nabeh: number;
  /** Směr chůze: 1 od začátku mostovky ke konci, −1 opačně. */
  smer: 1 | -1;
  /** Skákající dav: kde zastaví (dráha čela od vstupu na most) a kdy co dělá. */
  skok: { stani: number; prichod: number; od: number; do: number; odchod: number } | null;
}

/** Na kolik bodů se dělí perioda kroku, když se počítají složky ořezané síly. */
const BODU_PERIODY = 256;

/**
 * Amplitudy složek síly kroku na rytmu a jeho dvoj-, troj- a čtyřnásobku, N. `amplitudy` jsou
 * složky, jak je zná model člověka (sinus a kosinus tří násobků), `vaha` váha, kterou člověk na
 * mostovku tlačí. Mostovku jde jen tlačit: kde by součet váhy a krokové síly klesl pod nulu
 * (běžec mezi doskoky letí), zkouška sílu ořízne. Ořezem první dvě složky o něco zeslábnou
 * a přibudou vyšší, kolem tří procent váhy; na lehké mostovce s místním kmitáním kolem 10 Hz je
 * to znát.
 */
function silyKroku(amplitudy: readonly number[], vaha: number): [number, number, number, number] {
  const a = (k: number): number => amplitudy[k] ?? 0;
  const bez: [number, number, number, number] = [Math.hypot(a(0), a(1)), Math.hypot(a(2), a(3)), Math.hypot(a(4), a(5)), 0];
  // Nejmenší možná hodnota síly je váha minus součet amplitud: když je kladná, ořez nenastane.
  if (!(vaha > 0) || vaha - bez[0] - bez[1] - bez[2] >= 0) return bez;
  const re = [0, 0, 0, 0];
  const im = [0, 0, 0, 0];
  let orezano = false;
  for (let i = 0; i < BODU_PERIODY; i++) {
    const uhel = (2 * Math.PI * i) / BODU_PERIODY;
    let sila = vaha;
    for (let k = 1; k <= 3; k++) sila += a(2 * k - 2) * Math.sin(k * uhel) + a(2 * k - 1) * Math.cos(k * uhel);
    if (sila < 0) {
      sila = 0;
      orezano = true;
    }
    for (let k = 1; k <= 4; k++) {
      re[k - 1] = re[k - 1]! + sila * Math.cos(k * uhel);
      im[k - 1] = im[k - 1]! + sila * Math.sin(k * uhel);
    }
  }
  if (!orezano) return bez;
  const slozka = (k: number): number => (2 * Math.hypot(re[k]!, im[k]!)) / BODU_PERIODY;
  return [slozka(0), slozka(1), slozka(2), slozka(3)];
}

/** Rozptyl kadence volně jdoucích lidí daného druhu provozu, Hz. */
function rozptylKadence(druh: IdProvozu): number {
  if (druh === "bezecky-zavod") return ROZPTYL_ZAVODU;
  if (druh === "dav" || druh === "pruvod" || druh === "skakajici-dav") return ROZPTYL_DAVU;
  return 0;
}

/**
 * „Náhoda“ pro plán řad, se kterou každá volně jdoucí řada dostane střední kadenci své
 * skupiny: střídá 0,8 a 0,2. Součet čtyř po sobě jdoucích čísel je 2, takže odchylka kadence
 * vyjde nulová; dvojice přitom dává platnou fázi (ta se z tohoto plánu nepoužije, ale plán ji
 * losuje a na samých polovinách by se nedolosoval).
 */
function stredniNahoda(): () => number {
  let sude = false;
  return () => {
    sude = !sude;
    return sude ? 0.8 : 0.2;
  };
}

/**
 * Rozloží jízdní řád na skupiny pro odhad: jen lidé na první trase úrovně (odhad se dělá pro
 * její mostovku). `rozpeti` je délka mostovky, `nasada` násada zkoušky (viz `VolbyOdhadu`).
 */
function pripravPolozky(uroven: Uroven, rozpeti: number, nasada: number | undefined): PolozkaOdhadu[] {
  // Fáze kroku losuje zkouška pro všechny položky jednou řadou náhodných čísel, v pořadí
  // jízdního řádu; aby seděly, musí se tu plán udělat stejně.
  let skutecne: (Rada[] | null)[] | null = null;
  if (nasada !== undefined) {
    const nahodne = nahoda(nasada);
    skutecne = uroven.jizdniRad.map((polozka) => radySkupiny(polozka, uroven, nahodne));
    if (skutecne.some((r) => r === null)) skutecne = null;
  }
  const polozky: PolozkaOdhadu[] = [];
  uroven.jizdniRad.forEach((polozka, cislo) => {
    if (!jeClovek(polozka.druh) || polozka.trasa !== uroven.trasy[0]?.id) return;
    const rady = radySkupiny(polozka, uroven, stredniNahoda());
    if (!rady || rady.length === 0) return;
    const faze = skutecne?.[cislo];
    const tela: RadaOdhadu[] = [];
    const casti = new Map<string, CastSkupiny>();
    rady.forEach((rada, k) => {
      let hmota = 0;
      let tuhost = 0;
      let tlumeni = 0;
      for (const n of rada.model.napravy) {
        hmota += n.odpruzena + n.neodpruzena;
        tuhost += n.kontakt.tuhost;
        tlumeni += n.kontakt.tlumeni;
      }
      const buzeni = rada.model.buzeni;
      // Ořez síly se řídí skutečnou váhou řady: lidé vedle sebe mimo takt mají společnou sílu
      // menší než součet (sčítají se po výkonech), kdežto váhu plnou, a pod nulu se nedostanou.
      const sily = buzeni ? silyKroku(buzeni.amplitudy, hmota * TIHOVE_ZRYCHLENI) : ([0, 0, 0, 0] as [number, number, number, number]);
      if (polozka.druh === "bezecky-zavod") for (let i = 0; i < 4; i++) sily[i] = sily[i]! * KALIBRACE_ZAVODU;
      const telo: RadaOdhadu = { zaCelem: rada.zaCelem, hmota, tuhost, tlumeni, sily, faze: faze?.[k]?.faze ?? null };
      tela.push(telo);
      if (!buzeni) return;
      const rozptyl = rada.vTaktu ? 0 : rozptylKadence(polozka.druh);
      const klic = `${rada.vTaktu}:${buzeni.frekvence}:${rozptyl}`;
      let cast = casti.get(klic);
      if (!cast) {
        cast = { rytmus: buzeni.frekvence, rozptyl, vTaktu: rada.vTaktu, sFazi: false, rady: [] };
        casti.set(klic, cast);
      }
      cast.rady.push(telo);
    });
    const chuze = [...casti.values()];
    // Kde zkouška dala všem řadám stejnou kadenci a odhad zná jejich fáze, sčítá je s nimi.
    for (const cast of chuze) {
      cast.sFazi = cast.rozptyl === 0 && cast.rady.every((r) => r.faze !== null);
      // Víc běžců za sebou, každý sám za sebe (viz `KALIBRACE_RADY_BEZCU`).
      if (!cast.vTaktu && cast.rozptyl === 0 && cast.rady.length > 1 && cast.rady[0]!.sily[3] > 0) {
        for (const rada of cast.rady) for (let i = 0; i < 4; i++) rada.sily[i] = rada.sily[i]! * KALIBRACE_RADY_BEZCU;
      }
    }
    const delka = rady[rady.length - 1]!.zaCelem;
    const rychlost = rady[0]!.model.rychlost;
    // Před mostem je rozjezd dlouhý sekundu chůze, nejmíň dva metry (viz `naplanujProvoz`).
    const nabeh = Math.max(2, rychlost);
    const p: PolozkaOdhadu = { polozka: cislo, druh: polozka.druh, tela, chuze, skakani: [], delka, rychlost, cas: polozka.cas, nabeh, smer: polozka.smer, skok: null };
    if (polozka.druh === "skakajici-dav" && rychlost > 0) {
      // Skákání: všichni naráz, uprostřed mostu, ve stejných rozestupech, v jakých přišli.
      // Bez zadané kadence skáčou ve výchozí, stejně jako ve zkoušce.
      const kadence = polozka.kadence ?? KADENCE_SKAKANI;
      const skok = skokan(kadence);
      const skacou: RadaOdhadu[] = rady.map((rada, k) => ({ ...tela[k]!, sily: silyKroku(vedleSebe(skok, rada.lidi).buzeni!.amplitudy, tela[k]!.hmota * TIHOVE_ZRYCHLENI), faze: null }));
      p.skakani = [{ rytmus: kadence, rozptyl: 0, vTaktu: true, sFazi: false, rady: skacou }];
      const stani = (rozpeti + delka) / 2;
      const prichod = polozka.cas + (nabeh + stani) / rychlost;
      const od = prichod + PAUZA_SKAKANI;
      const konec = od + (polozka.trvani ?? VYCHOZI_TRVANI_SKAKANI);
      p.skok = { stani, prichod, od, do: konec, odchod: konec + PAUZA_SKAKANI };
    }
    polozky.push(p);
  });
  return polozky;
}

/** Kde je v čase `t` čelo skupiny: dráha od vstupu na most, m (záporná před mostem). */
function drahaCela(p: PolozkaOdhadu, t: number): number {
  if (!p.skok || t < p.skok.prichod) return p.rychlost * (t - p.cas) - p.nabeh;
  if (t < p.skok.odchod) return p.skok.stani;
  return p.skok.stani + p.rychlost * (t - p.skok.odchod);
}

/** Kdy je čelo skupiny na dráze `draha` (při chůzi; skákající dav cestou tam, nebo zpět). */
function casNaDraze(p: PolozkaOdhadu, draha: number): number {
  if (!p.skok || draha <= p.skok.stani) return p.cas + (p.nabeh + draha) / p.rychlost;
  return p.skok.odchod + (draha - p.skok.stani) / p.rychlost;
}

/** Místo řady na mostovce: dva sousední styčníky a podíl druhého z nich. */
interface MistoRady {
  a: number;
  b: number;
  podil: number;
}

function mistoNaMostovce(xs: readonly number[], x: number): MistoRady | null {
  const posledni = xs.length - 1;
  if (posledni < 1 || x < xs[0]! || x > xs[posledni]!) return null;
  let i = 0;
  while (i + 1 < posledni && xs[i + 1]! <= x) i++;
  const delka = xs[i + 1]! - xs[i]!;
  // Síla na prutu mostovky se mezi jeho konce dělí podle ohybové čáry prutu (tak ji na most
  // klade i zkouška), ne lineárně: poblíž styčníku mu patří skoro celá.
  const ksi = delka > 0 ? (x - xs[i]!) / delka : 0;
  return { a: i, b: i + 1, podil: ksi * ksi * (3 - 2 * ksi) };
}

interface TeloNaMoste {
  telo: { hmota: number; tuhost: number; tlumeni: number };
  misto: MistoRady;
}

/** Část skupiny, která v dané chvíli na mostě budí. */
interface CastNaMoste {
  cast: CastSkupiny;
  polozka: PolozkaOdhadu;
  rady: { rada: RadaOdhadu; misto: MistoRady }[];
  skace: boolean;
}

/** Kdo v jednu chvíli na mostě stojí a kdo ho budí. */
interface Scena {
  tela: TeloNaMoste[];
  casti: CastNaMoste[];
}

/**
 * Dynamická tuhost těl a tlumičů na frekvenci `f` (Hz) v místech základu: reálná část do `zr`,
 * imaginární do `zi`. Tělo je hmota m na pružině K = k + iωc; mostovku pod sebou drží silou
 * K·(−mω²) / (K − mω²) na jednotku její výchylky. Pod kmitočtem těla působí jako hmota (víc
 * než tuhá), nad ním jako pružina, a vždycky tlumí. Laděný tlumič je totéž s jinými čísly.
 */
function tuhostTel(tela: readonly TeloNaMoste[], tlumice: readonly TlumicOdhadu[], f: number, zr: Float64Array, zi: Float64Array): void {
  const w = 2 * Math.PI * f;
  zr.fill(0);
  zi.fill(0);
  const pridej = (telo: { hmota: number; tuhost: number; tlumeni: number }, a: number, b: number, podil: number): void => {
    const citRe = -telo.hmota * w * w * telo.tuhost;
    const citIm = -telo.hmota * w * w * w * telo.tlumeni;
    const jmRe = telo.tuhost - telo.hmota * w * w;
    const jmIm = w * telo.tlumeni;
    const jm = jmRe * jmRe + jmIm * jmIm;
    if (!(jm > 0)) return;
    const re = (citRe * jmRe + citIm * jmIm) / jm;
    const im = (citIm * jmRe - citRe * jmIm) / jm;
    zr[a] = zr[a]! + (1 - podil) * re;
    zi[a] = zi[a]! + (1 - podil) * im;
    if (podil !== 0) {
      zr[b] = zr[b]! + podil * re;
      zi[b] = zi[b]! + podil * im;
    }
  };
  for (const { telo, misto: m } of tela) pridej(telo, m.a, m.b, m.podil);
  for (const tlumic of tlumice) pridej(tlumic, tlumic.misto, tlumic.misto, 0);
}

/** Most, na kterém stojí největší skupina lidí úrovně. */
export interface MostSLidmi {
  /**
   * Rezonanční křivka: největší svislé zrychlení mostovky v m/s² na newton svislé harmonické
   * síly, pro každou z dotázaných frekvencí. Stejná veličina jako u prázdného mostu.
   */
  krivka: Float64Array;
  /**
   * Na jaké frekvenci (Hz) s lidmi nejvíc odpovídá každý z prvních vlastních tvarů mostu.
   * Tvar, který lidé utlumí natolik, že špičku nemá, tu má frekvenci prázdného mostu.
   */
  frekvence: number[];
}

/**
 * Jak se most chová, když na něm uprostřed stojí největší skupina lidí z jízdního řádu:
 * rezonanční křivka ve frekvencích `frekvence` (Hz, vzestupně) a posunuté frekvence prvních
 * `tvaru` vlastních tvarů. Místa základu `zaklad` začínají styčníky mostovky seřazenými podle x
 * (`xs` jsou jejich polohy). Null, když v úrovni lidé nejdou nebo odezva nejde spočítat.
 */
export function mostSLidmi(
  uroven: Uroven,
  zaklad: ZakladOdezvy,
  xs: readonly number[],
  frekvence: readonly number[],
  tvaru: number,
): MostSLidmi | null {
  const pG = zaklad.mista.length;
  const p = xs.length;
  const m = zaklad.omega.length;
  if (p < 2 || pG < p || frekvence.length === 0) return null;
  const zacatek = xs[0]!;
  const rozpeti = xs[p - 1]! - zacatek;
  // Největší skupina: ta, která má středem uprostřed mostu na mostě nejvíc hmoty.
  let tela: TeloNaMoste[] = [];
  let nejvic = 0;
  for (const skupina of pripravPolozky(uroven, rozpeti, undefined)) {
    const celo = zacatek + (rozpeti + skupina.delka) / 2;
    const naMoste: TeloNaMoste[] = [];
    let hmota = 0;
    for (const telo of skupina.tela) {
      const kde = mistoNaMostovce(xs, celo - telo.zaCelem);
      if (!kde) continue;
      naMoste.push({ telo, misto: kde });
      hmota += telo.hmota;
    }
    if (hmota > nejvic) {
      nejvic = hmota;
      tela = naMoste;
    }
  }
  if (tela.length === 0) return null;

  const pocetTvaru = Math.min(tvaru, m);
  const zr = new Float64Array(pG);
  const zi = new Float64Array(pG);
  const krivka = new Float64Array(frekvence.length);
  /** Odezva každého tvaru: síla i měření rozložené podle tvaru po mostovce. */
  const odezvaTvaru = Array.from({ length: pocetTvaru }, () => new Float64Array(frekvence.length));
  for (let k = 0; k < frekvence.length; k++) {
    const f = frekvence[k]!;
    tuhostTel(tela, [], f, zr, zi);
    const G = poddajnost(zaklad, f, zr, zi);
    if (!G) return null;
    const w2 = (2 * Math.PI * f) * (2 * Math.PI * f);
    let nejvetsi = 0;
    for (let j = 0; j < p; j++) nejvetsi = Math.max(nejvetsi, Math.hypot(G.re[j * pG + j]!, G.im[j * pG + j]!));
    krivka[k] = w2 * nejvetsi;
    for (let i = 0; i < pocetTvaru; i++) {
      let re = 0;
      let im = 0;
      for (let a = 0; a < p; a++) {
        const fa = zaklad.fi[a * m + i]!;
        if (fa === 0) continue;
        for (let b = 0; b < p; b++) {
          const fb = zaklad.fi[b * m + i]!;
          re += fa * G.re[a * pG + b]! * fb;
          im += fa * G.im[a * pG + b]! * fb;
        }
      }
      odezvaTvaru[i]![k] = w2 * Math.hypot(re, im);
    }
  }
  const posunute: number[] = [];
  for (let i = 0; i < pocetTvaru; i++) {
    const prazdny = zaklad.omega[i]! / (2 * Math.PI);
    const odezva = odezvaTvaru[i]!;
    // Špička se hledá kolem frekvence prázdného mostu; lidé ji posunou nejvýš o desítky procent.
    let nejlepsi = -1;
    for (let k = 1; k + 1 < frekvence.length; k++) {
      const f = frekvence[k]!;
      if (f < OKOLI_TVARU[0] * prazdny || f > OKOLI_TVARU[1] * prazdny) continue;
      if (!(odezva[k]! >= odezva[k - 1]! && odezva[k]! > odezva[k + 1]!)) continue;
      if (nejlepsi < 0 || odezva[k]! > odezva[nejlepsi]!) nejlepsi = k;
    }
    if (nejlepsi < 0) {
      posunute.push(prazdny);
      continue;
    }
    const vlevo = odezva[nejlepsi - 1]!;
    const stred = odezva[nejlepsi]!;
    const vpravo = odezva[nejlepsi + 1]!;
    const zakriveni = vlevo - 2 * stred + vpravo;
    const posun = zakriveni < 0 ? (0.5 * (vlevo - vpravo)) / zakriveni : 0;
    const krok = frekvence[nejlepsi + 1]! - frekvence[nejlepsi]!;
    posunute.push(frekvence[nejlepsi]! + krok * Math.max(-1, Math.min(1, posun)));
  }
  return { krivka, frekvence: posunute };
}

/** Kosinus a sinus k-násobku úhlu, jehož kosinus a sinus je `c` a `s`. */
function nasobekFaze(c: number, s: number, k: Nasobek): [number, number] {
  if (k === 1) return [c, s];
  const c2 = c * c - s * s;
  const s2 = 2 * s * c;
  if (k === 2) return [c2, s2];
  if (k === 3) return [c * (4 * c * c - 3), s * (3 - 4 * s * s)];
  return [c2 * c2 - s2 * s2, 2 * s2 * c2];
}

/**
 * Odhad kmitání pro lidi úrovně `uroven` na mostě se základem odezvy `zaklad`. Místa základu
 * začínají styčníky mostovky seřazenými podle x (`xs` jsou jejich polohy, m); další místa
 * smějí následovat (styčníky s tlumiči z `volby.tlumice`). Null, když v úrovni žádní lidé
 * nejdou nebo se odezva nedá spočítat.
 */
export function odhadniKmitani(uroven: Uroven, zaklad: ZakladOdezvy, xs: readonly number[], volby: VolbyOdhadu = {}): OdhadKmitani | null {
  const pG = zaklad.mista.length;
  const p = xs.length;
  if (p < 2 || pG < p) return null;
  const zacatek = xs[0]!;
  const rozpeti = xs[p - 1]! - zacatek;
  if (!(rozpeti > 0)) return null;
  const polozky = pripravPolozky(uroven, rozpeti, volby.nasada);
  if (polozky.length === 0) return null;
  const tlumice = volby.tlumice ?? [];
  const zr = new Float64Array(pG);
  const zi = new Float64Array(pG);

  /** Kdo je na mostě v čase `cas`; položka `fokus` má čelo na dráze `draha` a (ne)skáče podle `skace`. */
  const scena = (cas: number, fokus: PolozkaOdhadu, draha: number, skace: boolean): Scena => {
    const sc: Scena = { tela: [], casti: [] };
    for (const pol of polozky) {
      const jeFokus = pol === fokus;
      const d = jeFokus ? draha : drahaCela(pol, cas);
      if (d <= 0 || d >= rozpeti + pol.delka) continue;
      const kde = (rada: RadaOdhadu): MistoRady | null =>
        mistoNaMostovce(xs, pol.smer === 1 ? zacatek + d - rada.zaCelem : zacatek + rozpeti - d + rada.zaCelem);
      for (const telo of pol.tela) {
        const m = kde(telo);
        if (m) sc.tela.push({ telo, misto: m });
      }
      // Kdo z položky zrovna budí: skákající dav cestou tam a zpět jde, na místě skáče, mezitím stojí.
      let budi: CastSkupiny[];
      let skoky = false;
      if (jeFokus) {
        budi = skace ? pol.skakani : pol.chuze;
        skoky = skace;
      } else if (pol.skok && cas >= pol.skok.prichod && cas < pol.skok.odchod) {
        skoky = cas >= pol.skok.od && cas <= pol.skok.do;
        budi = skoky ? pol.skakani : [];
      } else budi = pol.chuze;
      for (const cast of budi) {
        const rady: CastNaMoste["rady"] = [];
        for (const rada of cast.rady) {
          const m = kde(rada);
          if (m) rady.push({ rada, misto: m });
        }
        if (rady.length > 0) sc.casti.push({ cast, polozka: pol, rady, skace: skoky });
      }
    }
    return sc;
  };

  type Poddajnost = { re: Float64Array; im: Float64Array } | null;
  /** Poddajnost mostu s těly scény, s pamětí podle frekvence. */
  const mostSTely = (sc: Scena): ((f: number) => Poddajnost) => {
    const pamet = new Map<number, Poddajnost>();
    return (f) => {
      let G = pamet.get(f);
      if (G === undefined) {
        tuhostTel(sc.tela, tlumice, f, zr, zi);
        G = poddajnost(zaklad, f, zr, zi);
        pamet.set(f, G);
      }
      return G;
    };
  };

  interface Vysledek {
    celkem: number;
    slozky: SlozkaOdhadu[];
    stycnik: number;
  }
  /** Odezva mostu na scénu `sc`, když most s těly dává `G`. `sPopisem` vrátí i složky. */
  const odezva = (sc: Scena, G: (f: number) => Poddajnost, sPopisem: boolean, poStycnicich?: Float64Array): Vysledek => {
    const slozky: { popis: SlozkaOdhadu; ctverce: Float64Array }[] = [];
    // Lidé se stejnou kadencí a známou fází se sčítají s fází i napříč položkami jízdního řádu
    // (fáze všech běží od začátku zkoušky): dvě skupiny běžců proti sobě jsou jedna složka.
    const casti: CastNaMoste[] = [];
    const sFazemi = new Map<number, CastNaMoste>();
    for (const cast of sc.casti) {
      if (!cast.cast.sFazi || cast.skace) {
        casti.push(cast);
        continue;
      }
      const stejna = sFazemi.get(cast.cast.rytmus);
      if (stejna) stejna.rady.push(...cast.rady);
      else {
        const sloucena = { ...cast, rady: [...cast.rady] };
        sFazemi.set(cast.cast.rytmus, sloucena);
        casti.push(sloucena);
      }
    }
    for (const { cast, polozka, rady, skace } of casti) {
      // Jak dlouho skupina po mostě jde: od vstupu čela po odchod poslední řady.
      const doba = polozka.rychlost > 0 ? (rozpeti + polozka.delka) / polozka.rychlost : 0;
      const sFazi = cast.vTaktu || cast.sFazi;
      const znamaFaze = cast.sFazi && !skace;
      for (const nasobek of NASOBKY) {
        if (!rady.some((r) => r.rada.sily[nasobek - 1]! > 0)) continue;
        const ctverce = new Float64Array(p);
        const spicka = sFazi ? 1 : cinitelSpicky(nasobek * cast.rozptyl, doba);
        const sirka = nasobek * cast.rozptyl;
        const body = sirka > 0 && !sFazi ? VZORKY_KADENCE : VZOREK;
        let vahy = 0;
        for (const [odchylka, vaha] of body) {
          const f = nasobek * cast.rytmus + sirka * odchylka;
          if (!(f > 0)) continue;
          const g = G(f);
          if (!g) continue;
          vahy += vaha;
          const w2 = (2 * Math.PI * f) * (2 * Math.PI * f) * zesileniPasma(f);
          for (let j = 0; j < p; j++) {
            let re = 0;
            let im = 0;
            let vykon = 0;
            for (const { rada, misto: m } of rady) {
              const sila = rada.sily[nasobek - 1]!;
              const gRe = (1 - m.podil) * g.re[j * pG + m.a]! + m.podil * g.re[j * pG + m.b]!;
              const gIm = (1 - m.podil) * g.im[j * pG + m.a]! + m.podil * g.im[j * pG + m.b]!;
              if (znamaFaze) {
                const [c, s] = nasobekFaze(rada.faze![0], rada.faze![1], nasobek);
                re += sila * (c * gRe - s * gIm);
                im += sila * (c * gIm + s * gRe);
              } else if (cast.vTaktu) {
                re += sila * gRe;
                im += sila * gIm;
              } else vykon += sila * sila * (gRe * gRe + gIm * gIm);
            }
            const ctverec = sFazi ? re * re + im * im : spicka * spicka * vykon;
            ctverce[j] = ctverce[j]! + vaha * w2 * w2 * ctverec;
          }
        }
        if (!(vahy > 0)) continue;
        const nabeh = skace ? NABEH_SKAKANI * NABEH_SKAKANI : 1;
        let nejvetsi = 0;
        for (let j = 0; j < p; j++) {
          ctverce[j] = (ctverce[j]! / vahy) * nabeh;
          nejvetsi = Math.max(nejvetsi, ctverce[j]!);
        }
        slozky.push({
          popis: { polozka: polozka.polozka, druh: polozka.druh, rytmus: cast.rytmus, nasobek, frekvence: nasobek * cast.rytmus, vTaktu: cast.vTaktu, zrychleni: Math.sqrt(nejvetsi) },
          ctverce,
        });
      }
    }
    // Složky se v měření sčítají podle toho, jak blízko si jsou: stejná frekvence celou
    // amplitudou, vzdálené po čtvercích. I jediná složka má ve čtverci zvlnění na dvojnásobku.
    let celkem = 0;
    let stycnik = 0;
    for (let j = 0; j < p; j++) {
      let ctverec = 0;
      for (let a = 0; a < slozky.length; a++) {
        const sa = slozky[a]!;
        const ca = sa.ctverce[j]!;
        if (ca === 0) continue;
        ctverec += ca * (1 + souzneni(2 * sa.popis.frekvence));
        for (let b = a + 1; b < slozky.length; b++) {
          const sb = slozky[b]!;
          const cb = sb.ctverce[j]!;
          if (cb === 0) continue;
          ctverec += 2 * souzneni(sa.popis.frekvence - sb.popis.frekvence) * Math.sqrt(ca * cb);
        }
      }
      if (poStycnicich) poStycnicich[j] = ctverec;
      if (ctverec > celkem) {
        celkem = ctverec;
        stycnik = j;
      }
    }
    return { celkem: Math.sqrt(celkem), slozky: sPopisem ? slozky.map((s) => s.popis).sort((a, b) => b.zrychleni - a.zrychleni) : [], stycnik };
  };

  const skupiny: OdhadSkupiny[] = [];
  for (const fokus of polozky) {
    let nejhorsi: Vysledek = { celkem: 0, slozky: [], stycnik: 0 };
    let mistoNejhorsi = 0.5;
    const cesta = rozpeti + fokus.delka;
    const zkus = (v: Vysledek, podil: number): void => {
      if (v.celkem > nejhorsi.celkem) {
        nejhorsi = v;
        mistoNejhorsi = podil;
      }
    };
    // Skákání: skupina stojí středem uprostřed mostu.
    if (fokus.skok) {
      const cas = (fokus.skok.od + fokus.skok.do) / 2;
      const sc = scena(cas, fokus, fokus.skok.stani, true);
      zkus(odezva(sc, mostSTely(sc), true), 0.5);
    }
    // Chůze: hrubá místa poctivě, jemná mezi nimi levně s mostem z nejbližšího hrubého místa.
    if (fokus.chuze.length > 0) {
      const krok = Math.max(KROK_JEMNYCH_MIST, cesta / NEJVIC_JEMNYCH_MIST);
      /** Místa na cestě: dráha čela, čtverce odezvy po styčnících a u hrubých míst poctivý výsledek. */
      const mista: { draha: number; ctverce: Float64Array; poctive: Vysledek | null }[] = [];
      const kandidati: number[] = [];
      if (!volby.hrube) {
        for (let d = krok / 2; d < cesta; d += krok) kandidati.push(d);
        // První řada přesně na styčníku mostovky: tam je místní odezva největší.
        for (let j = 1; j + 1 < p; j++) kandidati.push(fokus.smer === 1 ? xs[j]! - zacatek : zacatek + rozpeti - xs[j]!);
      }
      for (let c = 0; c < MISTA_SKUPINY.length; c++) {
        const draha = MISTA_SKUPINY[c]! * cesta;
        const sc = scena(casNaDraze(fokus, draha), fokus, draha, false);
        if (sc.casti.length === 0) continue;
        const G = mostSTely(sc);
        const ctverce = new Float64Array(p);
        mista.push({ draha, ctverce, poctive: odezva(sc, G, true, ctverce) });
        // Jemná místa, kterým je tohle hrubé nejblíž.
        const od = c === 0 ? 0 : (MISTA_SKUPINY[c - 1]! + MISTA_SKUPINY[c]!) / 2;
        const po = c + 1 === MISTA_SKUPINY.length ? 1 : (MISTA_SKUPINY[c]! + MISTA_SKUPINY[c + 1]!) / 2;
        for (const d of kandidati) {
          if (d < od * cesta || d >= po * cesta || d === draha) continue;
          const jemne = scena(casNaDraze(fokus, d), fokus, d, false);
          const ctverceJemne = new Float64Array(p);
          if (jemne.casti.length > 0) odezva(jemne, G, false, ctverceJemne);
          mista.push({ draha: d, ctverce: ctverceJemne, poctive: null });
        }
      }
      mista.sort((a, b) => a.draha - b.draha);
      // Zkouška průměruje čtverec zrychlení přes sekundu. Co kmitá jen chvíli, než skupina
      // popojde (pole mostovky pod běžcem), se do měření nestihne propsat celé: průměr běží
      // po cestě s délkou rychlost × okno. Bez jemných míst se průměrovat nedá.
      const delkaOkna = fokus.rychlost * OKNO_PRUMERU;
      const prumer = new Float64Array(p);
      /** Co by v každém místě ukázalo měření (čtverec, největší přes styčníky) a co dává ustálený výpočet. */
      const zmereno = new Float64Array(mista.length);
      const ustalene = new Float64Array(mista.length);
      let minula = 0;
      mista.forEach((misto, n) => {
        // Skákající dav mezi příchodem a odchodem stojí dlouho: průměr mezitím odezní.
        if (fokus.skok && minula <= fokus.skok.stani && misto.draha > fokus.skok.stani) prumer.fill(0);
        const vaha = volby.hrube || !(delkaOkna > 0) ? 1 : 1 - Math.exp(-(misto.draha - minula) / delkaOkna);
        minula = misto.draha;
        for (let j = 0; j < p; j++) {
          prumer[j] = prumer[j]! + vaha * (misto.ctverce[j]! - prumer[j]!);
          if (prumer[j]! > zmereno[n]!) zmereno[n] = prumer[j]!;
          if (misto.ctverce[j]! > ustalene[n]!) ustalene[n] = misto.ctverce[j]!;
        }
      });
      /** Poctivý výsledek v místě `n` přepočtený na to, co by ukázalo měření. */
      const zmer = (n: number, poctive: Vysledek): Vysledek => {
        const pomer = ustalene[n]! > 0 ? Math.sqrt(zmereno[n]! / ustalene[n]!) : 0;
        return { celkem: poctive.celkem * pomer, slozky: poctive.slozky.map((sl) => ({ ...sl, zrychleni: sl.zrychleni * pomer })), stycnik: poctive.stycnik };
      };
      mista.forEach((misto, n) => {
        if (misto.poctive) zkus(zmer(n, misto.poctive), misto.draha / cesta);
      });
      // Nejhorší jemná místa poctivě, s těly tam, kde opravdu stojí.
      const poradi = mista.map((_, n) => n).filter((n) => !mista[n]!.poctive).sort((a, b) => zmereno[b]! - zmereno[a]!);
      const vybrana: number[] = [];
      for (const n of poradi) {
        if (vybrana.length >= POCTIVE_JEMNYCH) break;
        // Levný odhad se od poctivého liší jen o polohu těl; místo hluboko pod dosavadním maximem nevyhraje.
        if (Math.sqrt(zmereno[n]!) < 0.85 * nejhorsi.celkem) break;
        const draha = mista[n]!.draha;
        if (vybrana.some((d) => Math.abs(d - draha) < 2 * krok)) continue;
        vybrana.push(draha);
        const sc = scena(casNaDraze(fokus, draha), fokus, draha, false);
        if (sc.casti.length === 0) continue;
        zkus(zmer(n, odezva(sc, mostSTely(sc), true)), draha / cesta);
      }
    }
    if (nejhorsi.slozky.length > 0) {
      skupiny.push({ polozka: fokus.polozka, druh: fokus.druh, zrychleni: nejhorsi.celkem, slozky: nejhorsi.slozky, misto: mistoNejhorsi, stycnik: nejhorsi.stycnik });
    }
  }
  if (skupiny.length === 0) return null;
  let zrychleni = 0;
  for (const s of skupiny) zrychleni = Math.max(zrychleni, s.zrychleni);
  return { zrychleni, skupiny };
}

/**
 * Styčníky mostovky trasy `trasa` seřazené podle x a jejich polohy. Odhad je potřebuje
 * v pořadí, v jakém po nich lidé jdou.
 */
export function mostovkaTrasy(stavba: StavbaMostu, trasa: number): { stycniky: number[]; xs: number[] } {
  const pruty = new Set(stavba.trasy[trasa]?.pruty ?? []);
  const uzly = new Set<number>();
  for (const prvek of stavba.popis.prvky) {
    if (prvek.prut !== undefined && pruty.has(prvek.prut)) {
      uzly.add(prvek.a);
      uzly.add(prvek.b);
    }
  }
  const stycniky = [...uzly].sort((a, b) => stavba.popis.stycniky[a]!.x - stavba.popis.stycniky[b]!.x);
  return { stycniky, xs: stycniky.map((i) => stavba.popis.stycniky[i]!.x) };
}
