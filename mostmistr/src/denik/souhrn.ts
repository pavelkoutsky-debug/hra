// Souhrn deníku hraní: z dávek událostí spočítá, jak se která úroveň hraje. Slouží stránce
// správce a ladění obtížnosti: kolik hráčů úroveň otevřelo, kolik ji prošlo, na kolikátý
// pokus, za jak dlouho, za kolik, z čeho stavěli a na čem mosty nejčastěji padají.
//
// Počítá se ve dvou krocích. Z dávek vznikne „výtah“: co se o kterém hráči ve které úrovni
// ví. Výtahy jdou sloučit (víc dní, den zpracovaný po částech), a teprve z výtahu se dělá
// souhrn s počty a mediány. Server si výtah každého dne ukládá i s tím, kam v dávkách došel,
// takže souhrn nečte znovu to, co už započítal.
//
// Čisté funkce bez prohlížeče i serveru; události se čtou opatrně, protože deník starší
// verze hry může mít jiná data.

import { ID_PRVKU } from "../data/katalog";
import { KODY_PRICINY, type KodPriciny } from "../zkouska/pricinaVysledku";
import { DRUHY_RADY } from "../hra/radaPoNezdaru";
import type { DavkaDeniku, HodnotaDeniku, UdalostDeniku } from "./udalosti";

export interface SouhrnUrovne {
  uroven: string;
  /** Kolik různých hráčů úroveň otevřelo a kolikrát celkem. */
  hracu: number;
  otevreni: number;
  /** Zkoušky s provozem (pokusy s brnknutím a budičem se nepočítají) a kolik jich prošlo. */
  zkousek: number;
  pruchodu: number;
  /** Hráči, kterým aspoň jedna zkouška prošla, a hráči, kteří úroveň otevřeli a nic nezkusili. */
  hracuSPruchodem: number;
  hracuBezZkousky: number;
  /** Medián počtu zkoušek do prvního průchodu a minut strávených v úrovni do něj; null bez průchodu. */
  zkousekDoPruchodu: number | null;
  minutDoPruchodu: number | null;
  /** Kolik hráčů získalo kterou medaili. */
  medaile: { pruchod: number; rozpocet: number; mistrovska: number };
  /** Cena nejlevnějšího mostu, který prošel, a medián nejlevnějších průchodů hráčů; null bez průchodu. */
  nejlevnejsiPruchod: number | null;
  cenaPruchodu: number | null;
  /** Z čeho se stavělo: prvek a kolik prutů z něj hráči nakreslili, od nejčastějšího. */
  prvky: Record<string, number>;
  /** Na čem mosty padaly: „prvek/způsob“ prvního porušení a kolikrát; „bez porušení“, když se nic nezlomilo. */
  selhani: Record<string, number>;
  /** Kolik hráčů si otevřelo nápovědu a kolik z nich si nechalo ukázat i obrys mostu. */
  hracuSNapovedou: number;
  hracuSObrysem: number;
  /** Kolik hráčů zkusilo zkoušku do zlomu a kolik těch zkoušek bylo. */
  hracuDoZlomu: number;
  zkousekDoZlomu: number;
  /** Hráči úrovně na dotykovém zařízení a kolik z hráčů bez zkoušky bylo na dotyku. */
  hracuNaDotyku: number;
  hracuBezZkouskyNaDotyku: number;
  /** Hráči, kteří úroveň otevřeli, ale nenakreslili v ní ani jeden prut. */
  hracuBezPrutu: number;
  /**
   * Rada po druhém stejném nezdaru (`rada.ukazana`): kolikrát zazněla která („prvek/způsob“
   * u porušení, jinak druh), kolik hráčů ji vidělo, kolik z nich úroveň potom prošlo, medián
   * zkoušek od rady do průchodu a kolik hráčů z rady otevřelo nápovědu.
   */
  rady: Record<string, number>;
  hracuSRadou: number;
  hracuSRadouPrusli: number;
  zkousekPoRade: number | null;
  hracuNapovedaZRady: number;
  /**
   * Posun styčníků (nástroj Výběr a posun, Alt+tažení, šipky): kolik hráčů ho použilo a kolik
   * posunů bylo, z toho víc styčníků naráz a šipkou.
   */
  hracuSPosunem: number;
  posunu: number;
  posunuVic: number;
  posunuKlavesou: number;
  /**
   * Značky o mostovce mimo trasu, které hra při stavbě ukázala (`stavba.znacka`), a kolikrát:
   * mostovka přes kraj břehu bez styčníku, mimo trasu, mezera u břehu a uprostřed, mostovka za
   * koncem trasy. Jedna značka se počítá jednou, dokud se nezmění.
   */
  znacky: Record<string, number>;
}

/**
 * Hráči, kteří neotevřeli žádnou úroveň kampaně, a kam místo toho šli. Počty míst se můžou
 * překrývat (kdo byl v pískovišti i na listu, je v obou).
 */
export interface SouhrnBezUrovne {
  hracu: number;
  /** Z nich noví a na dotykovém zařízení. */
  novych: number;
  dotykovych: number;
  /** Viděli přehled kampaně a nic dalšího neotevřeli (pískoviště, komisi, list, zkušebnu ani jinou úroveň). */
  jenPrehled: number;
  /** Otevřeli pískoviště, případ Havarijní komise, list „Moje mosty“, zkušebnu (odkazem z přehledu). */
  piskoviste: number;
  komise: number;
  list: number;
  zkusebna: number;
  /** Otevřeli okno Soukromí a kontakt, okno zpětné vazby. */
  soukromi: number;
  vazba: number;
  /** Nemají zapsanou žádnou obrazovku (stránka se nedonačetla, nebo jen začátek sezení). */
  bezObrazovky: number;
  /**
   * Kolik z nich na stránce aspoň jednou něco udělalo (dotyk, myš, klávesa, kolečko), a kolik
   * nic: to bývá robot, který jen stahuje náhled odkazu, nebo člověk, který hned odešel. Počítají
   * se jen hráči, jejichž hra první akci zapisuje (od verze s `stranka.akce`); zbytek je neznámý.
   */
  sAkci: number;
  bezAkce: number;
}

export interface SouhrnDeniku {
  hracu: number;
  sezeni: number;
  /** Hráči, kteří přišli poprvé, a hráči na dotykovém zařízení. */
  novych: number;
  dotykovych: number;
  udalosti: number;
  /** Chyby hlášené prohlížečem a odeslané zpětné vazby. */
  chyb: number;
  vazeb: number;
  /** Hráči, kteří si záznam hraní vypnuli a do konce období ho znovu nezapnuli. */
  vypnuli: number;
  /** Nejčastější chyby: text a počet, nejvýš deset. */
  chyby: { zprava: string; pocet: number }[];
  /** Hráči, kteří neotevřeli žádnou úroveň kampaně, a kam šli místo toho. */
  bezUrovne: SouhrnBezUrovne;
  urovne: SouhrnUrovne[];
}

/** Co se o jednom hráči v jedné úrovni ví. */
export interface HracVUrovni {
  otevreni: number;
  zkousek: number;
  pruchodu: number;
  /** Zkoušek a sekund do prvního průchodu; null, dokud žádný není. */
  zkousekDoPruchodu: number | null;
  sekundDoPruchodu: number | null;
  /** Sekundy z ukončených návštěv úrovně (z událostí o jejím opuštění). */
  sekundDriv: number;
  medaile: { pruchod: boolean; rozpocet: boolean; mistrovska: boolean };
  /** Cena nejlevnějšího mostu, se kterým hráč prošel; null bez průchodu. */
  nejlevnejsi: number | null;
  /**
   * Nejvyšší krok nápovědy, který hráč použil (0 žádný, 1 soupis, 2 obrys), a počet zkoušek
   * do zlomu. Starší uložené výtahy tyhle údaje nemají, proto jsou volitelné.
   */
  napoveda?: number;
  zlomu?: number;
  /** Hráč byl v úrovni na dotykovém zařízení; kolik prutů v ní nakreslil. */
  dotyk?: boolean;
  prutu?: number;
  /**
   * Kolik zkoušek měl hráč za sebou, když poprvé uviděl radu po druhém stejném nezdaru (null:
   * žádnou), a jestli z ní otevřel nápovědu. Starší výtahy je nemají.
   */
  radaZkousek?: number | null;
  radaNapoveda?: boolean;
  /** Kolik zkoušek po té radě hráč potřeboval k dalšímu průchodu (null: zatím neprošel). */
  radaPruchodPo?: number | null;
  /** Posuny styčníků, z toho víc styčníků naráz a šipkou. Starší výtahy je nemají. */
  posunu?: number;
  posunuVic?: number;
  posunuKlavesou?: number;
}

export interface HracVeVytahu {
  sezeni: string[];
  novy: boolean;
  dotyk: boolean;
  /** Poslední, co hráč se záznamem udělal: true vypnul, false znovu zapnul, null nic z toho. */
  vypnul: boolean | null;
  /** Kde hráč byl: kódy z `OBRAZOVKY` (přehled, úroveň kampaně, pískoviště, komise…). */
  obrazovky: string[];
  /** Hra hráče zapisuje první akci na stránce (`sezeni.start` s `akce`), a jestli nějakou zapsala. */
  meriAkce: boolean;
  akce: boolean;
}

/**
 * Verze výtahu. Výtah uložený starší verzí server nepoužije a den spočítá z dávek znovu
 * (3: obrazovky a akce hráčů, dotyk a pruty po úrovních, příčina neúspěchu zkoušky).
 */
export const VERZE_VYTAHU = 3;
/**
 * Nejvíc různých textů chyb, které si výtah pamatuje; další se sčítají pod „ostatní“. Strop
 * chrání výtah před zahlcením vymyšlenými daty; běžný den k němu nedojde. Nad ním už sloučení
 * výtahů nedává přesně totéž co výpočet najednou (záleží na pořadí, v jakém chyby přišly).
 */
const NEJVIC_CHYB_VE_VYTAHU = 200;
const OSTATNI_CHYBY = "ostatní";
/** Nejdelší text chyby, který se počítá zvlášť, a meze údajů, kterým souhrn věří. */
const NEJDELSI_CHYBA = 120;
const NEJVIC_SEKUND = 2 * 86_400;
const NEJVETSI_CENA = 1e10;
const NEJVIC_DILU = 40;
/** Víc styčníků, než má největší most, jeden posun nepohne. */
const NEJVIC_POSUNUTYCH = 2000;

// Deník plní kdokoli, kdo umí poslat žádost: souhrn proto bere jen hodnoty, které hra opravdu
// posílá (známé prvky a způsoby porušení, časy a ceny v rozumných mezích).
const ZNAME_PRVKY: ReadonlySet<string> = new Set<string>(ID_PRVKU);
const ZNAME_ZPUSOBY: ReadonlySet<string> = new Set(["tah", "tlak", "ohyb", "smyk", "vzper"]);
const ZNAME_AKCE: ReadonlySet<string> = new Set(["mys", "dotyk", "klavesa", "posun"]);

/** Obrazovky, které si výtah u hráče pamatuje. */
export const OBRAZOVKY = ["prehled", "kampan", "piskoviste", "komise", "list", "zkusebna", "soukromi", "vazba", "jine"] as const;

/**
 * Jak souhrn v „Na čem mosty padaly“ jmenuje příčinu neúspěchu zkoušky, ve které nic nepovolilo
 * (kód `pricina` v `zkouska.konec`, `src/zkouska/pricinaVysledku.ts`). Kód mimo seznam se
 * nepočítá; zkouška bez kódu (starší hra) dál padá do „bez porušení“.
 */
export const POPISY_PRICIN: Readonly<Record<KodPriciny, string>> = {
  slozeni: "složil se vlastní vahou",
  mezera: "mostovka nedosáhla na předmostí",
  pohyb: "pohyblivý most",
  pruhyb: "průhyb nad mezí",
  kmitani: "kmitání nad mezí",
  poruseni: "povolil prut",
  sjeti: "sjel z podpory",
  opreno: "opřel se o terén",
  spadl: "někdo spadl",
  neprejel: "někdo nepřejel",
  lod: "loď narazila",
  rozpad: "výpočet se rozpadl",
};
const ZNAME_PRICINY: ReadonlySet<string> = new Set<string>(KODY_PRICINY);

/** Kam patří úroveň s tímhle id: kampaň, pískoviště (0-01), komise (9-0N), nebo jiná mimo kampaň (0-00). */
function obrazovkaUrovne(id: string): (typeof OBRAZOVKY)[number] {
  if (id === "0-01") return "piskoviste";
  if (id.startsWith("9-")) return "komise";
  if (id.startsWith("0-")) return "jine";
  return "kampan";
}
const ZNAME_RADY: ReadonlySet<string> = new Set<string>(DRUHY_RADY);

/**
 * Jak souhrn jmenuje značky o mostovce mimo trasu (`stavba.znacka`: `co` „za-brehem“, nebo
 * „mezera“ s druhem z `src/data/mezery.ts`). Jiné hodnoty hra neposílá.
 */
export const POPISY_ZNACEK: Readonly<Record<string, string>> = {
  presah: "mostovka přes kraj břehu bez styčníku",
  "mimo-trasu": "mostovka mimo trasu",
  breh: "mezera u břehu",
  uprostred: "mezera uprostřed",
  "za-brehem": "mostovka za koncem trasy",
};

/**
 * Výtah z deníku: mezivýsledek, který jde slučovat. Vše je po hráčích, takže sloučením
 * výtahů dvou dnů vyjdou počty různých hráčů správně.
 */
export interface VytahDeniku {
  verze: number;
  hraci: Record<string, HracVeVytahu>;
  udalosti: number;
  chyb: number;
  vazeb: number;
  chyby: Record<string, number>;
  /** úroveň → hráč → co se o něm ví */
  urovne: Record<string, Record<string, HracVUrovni>>;
  /** úroveň → důvod pádu → kolikrát */
  selhani: Record<string, Record<string, number>>;
  /** úroveň → prvek → kolik prutů z něj hráči nakreslili */
  prvky: Record<string, Record<string, number>>;
  /** úroveň → rada („prvek/způsob“ nebo druh) → kolikrát se ukázala; starší výtahy ho nemají */
  rady?: Record<string, Record<string, number>>;
  /** úroveň → značka o mostovce mimo trasu → kolikrát se ukázala; starší výtahy ho nemají */
  znacky?: Record<string, Record<string, number>>;
}

function median(hodnoty: number[]): number | null {
  if (hodnoty.length === 0) return null;
  const serazene = [...hodnoty].sort((a, b) => a - b);
  const stred = serazene.length >> 1;
  return serazene.length % 2 === 1 ? serazene[stred]! : (serazene[stred - 1]! + serazene[stred]!) / 2;
}

const cisloZ = (h: HodnotaDeniku | undefined): number => (typeof h === "number" && Number.isFinite(h) ? h : 0);
/** Číslo v mezích; mimo ně (i záporné) nula. */
const vMezich = (h: HodnotaDeniku | undefined, nejvic: number): number => {
  const hodnota = cisloZ(h);
  return hodnota > 0 && hodnota <= nejvic ? hodnota : 0;
};
const znamyPrvek = (h: HodnotaDeniku | undefined): string | null => (typeof h === "string" && ZNAME_PRVKY.has(h) ? h : null);
const anoZ = (h: HodnotaDeniku | undefined): boolean => h === true;
const textZ = (h: HodnotaDeniku | undefined): string | null => (typeof h === "string" ? h : null);

/**
 * Slovník bez zděděných klíčů: čísla hráčů, id úrovní a texty chyb jsou cizí data a nesmějí
 * se potkat s vlastnostmi Object.prototype („constructor“, „__proto__“).
 */
function slovnik<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

export function prazdnyVytah(): VytahDeniku {
  return {
    verze: VERZE_VYTAHU,
    hraci: slovnik(),
    udalosti: 0,
    chyb: 0,
    vazeb: 0,
    chyby: slovnik(),
    urovne: slovnik(),
    selhani: slovnik(),
    prvky: slovnik(),
    rady: slovnik(),
    znacky: slovnik(),
  };
}

const jeObjekt = (h: unknown): h is Record<string, unknown> => typeof h === "object" && h !== null && !Array.isArray(h);

/** Vypadá hodnota z úložiště jako výtah této verze? */
export function jeVytah(h: unknown): h is VytahDeniku {
  if (!jeObjekt(h)) return false;
  return (
    h.verze === VERZE_VYTAHU &&
    jeObjekt(h.hraci) &&
    jeObjekt(h.urovne) &&
    jeObjekt(h.selhani) &&
    jeObjekt(h.prvky) &&
    (h.rady === undefined || jeObjekt(h.rady)) &&
    (h.znacky === undefined || jeObjekt(h.znacky)) &&
    jeObjekt(h.chyby) &&
    typeof h.udalosti === "number" &&
    typeof h.chyb === "number" &&
    typeof h.vazeb === "number"
  );
}

function pricti(kam: Record<string, number>, klic: string, kolik: number): void {
  kam[klic] = (kam[klic] ?? 0) + kolik;
}

/** Přičte chybu; když je různých textů moc, sčítá další pod společný klíč. */
function prictiChybu(chyby: Record<string, number>, zprava: string, kolik: number): void {
  if (zprava in chyby || Object.keys(chyby).length < NEJVIC_CHYB_VE_VYTAHU) pricti(chyby, zprava, kolik);
  else pricti(chyby, OSTATNI_CHYBY, kolik);
}

function novyHracVUrovni(): HracVUrovni {
  return {
    otevreni: 0,
    zkousek: 0,
    pruchodu: 0,
    zkousekDoPruchodu: null,
    sekundDoPruchodu: null,
    sekundDriv: 0,
    medaile: { pruchod: false, rozpocet: false, mistrovska: false },
    nejlevnejsi: null,
    napoveda: 0,
    zlomu: 0,
    dotyk: false,
    prutu: 0,
    radaZkousek: null,
    radaNapoveda: false,
    radaPruchodPo: null,
    posunu: 0,
    posunuVic: 0,
    posunuKlavesou: 0,
  };
}

const novyHrac = (): HracVeVytahu => ({ sezeni: [], novy: false, dotyk: false, vypnul: null, obrazovky: [], meriAkce: false, akce: false });

function pridejObrazovku(oHraci: HracVeVytahu, obrazovka: string): void {
  if (!oHraci.obrazovky.includes(obrazovka)) oHraci.obrazovky.push(obrazovka);
}

/** Porovnání dvou textů po znacích (stejné, jakým se řadí klíče v úložišti). */
const poradiTextu = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Výtah z dávek deníku. Dávky nemusejí být seřazené; řadí se podle času, kdy je server
 * přijal (dávky ze serveru ho nesou v `prijato`), pak podle hráče, začátku sezení (podle
 * hodin hráče) a pořadí: tak jdou za sebou i klíče dávek v úložišti. Dávky jednoho sezení
 * se navíc vrátí do pořadí, v jakém je hra číslovala (při odchodu ze stránky může pozdější
 * dávka dorazit dřív), a dávka, která přišla dvakrát (server ji uložil, ale odpověď se ke
 * hře nedostala, takže ji poslala znovu), se počítá jednou. Obojí jen mezi dávkami, které
 * dostane tahle funkce najednou. Na pořadí záleží u „zkoušek do prvního průchodu“ a u vypnutí záznamu.
 */
export function vytahDeniku(davky: readonly (DavkaDeniku & { prijato?: string })[]): VytahDeniku {
  const serazene = [...davky].sort(
    (a, b) =>
      poradiTextu(typeof a.prijato === "string" ? a.prijato : "", typeof b.prijato === "string" ? b.prijato : "") ||
      poradiTextu(a.hlavicka.hrac, b.hlavicka.hrac) ||
      (a.hlavicka.zacatek ?? 0) - (b.hlavicka.zacatek ?? 0) ||
      poradiTextu(a.hlavicka.sezeni, b.hlavicka.sezeni) ||
      a.poradi - b.poradi,
  );
  // Dávky téhož sezení do pořadí podle čísla dávky; místa v celkovém pořadí si sezení ponechá.
  const mistaSezeni = new Map<string, number[]>();
  serazene.forEach((d, i) => {
    const klic = `${d.hlavicka.hrac}/${d.hlavicka.sezeni}`;
    const mista = mistaSezeni.get(klic);
    if (mista) mista.push(i);
    else mistaSezeni.set(klic, [i]);
  });
  for (const mista of mistaSezeni.values()) {
    if (mista.length < 2) continue;
    const davkySezeni = mista.map((i) => serazene[i]!).sort((a, b) => a.poradi - b.poradi);
    mista.forEach((misto, j) => (serazene[misto] = davkySezeni[j]!));
  }
  const v = prazdnyVytah();
  /** Otisky dávek, které už se započetly: stejné sezení, číslo, počet událostí a jejich časy. */
  const zapoctene = new Set<string>();

  const zpracuj = (hrac: string, oHraci: HracVeVytahu, u: UdalostDeniku, dotyk: boolean): void => {
    v.udalosti += 1;
    const data = u.data ?? {};
    if (u.druh === "sezeni.start") {
      if (!anoZ(data.navrat)) oHraci.novy = true;
      if (anoZ(data.akce)) oHraci.meriAkce = true;
    } else if (u.druh === "stranka.akce") {
      if (typeof data.jak === "string" && ZNAME_AKCE.has(data.jak)) oHraci.akce = oHraci.meriAkce = true;
    } else if (u.druh === "prehled.otevren") pridejObrazovku(oHraci, "prehled");
    else if (u.druh === "list.otevren") pridejObrazovku(oHraci, "list");
    else if (u.druh === "soukromi.otevreno") pridejObrazovku(oHraci, "soukromi");
    else if (u.druh === "prehled.odkaz" && data.kam === "zkusebna") pridejObrazovku(oHraci, "zkusebna");
    else if (u.druh === "denik.vypnut") oHraci.vypnul = true;
    else if (u.druh === "denik.zapnut") oHraci.vypnul = false;
    else if (u.druh === "chyba") {
      v.chyb += 1;
      prictiChybu(v.chyby, (textZ(data.zprava) ?? "neznámá chyba").slice(0, NEJDELSI_CHYBA), 1);
    } else if (u.druh === "vazba.odeslana") v.vazeb += 1;
    if (u.druh === "vazba.otevrena") pridejObrazovku(oHraci, "vazba");
    if (u.uroven === undefined) return;
    pridejObrazovku(oHraci, obrazovkaUrovne(u.uroven));
    const hraciUrovne = (v.urovne[u.uroven] ??= slovnik());
    const zaznam = (hraciUrovne[hrac] ??= novyHracVUrovni());
    if (dotyk) zaznam.dotyk = true;
    if (u.druh === "uroven.otevrena") zaznam.otevreni += 1;
    else if (u.druh === "uroven.opustena") zaznam.sekundDriv += vMezich(data.sekund, NEJVIC_SEKUND);
    else if (u.druh === "stavba.zmena" && data.co === "prut") {
      const prvek = znamyPrvek(data.prvek);
      // Dlouhý tah rozdělený na díly dal víc prutů najednou.
      if (prvek !== null) {
        const dilu = Math.max(1, Math.round(vMezich(data.dilu, NEJVIC_DILU)));
        pricti((v.prvky[u.uroven] ??= slovnik()), prvek, dilu);
        zaznam.prutu = (zaznam.prutu ?? 0) + dilu;
      }
    } else if (u.druh === "stavba.zmena" && data.co === "posun") {
      // Posun styčníků: jeden zápis je jeden posun. Starší hra počet styčníků ani způsob neposílala
      // (byl to vždycky jeden styčník tažením).
      zaznam.posunu = (zaznam.posunu ?? 0) + 1;
      if (vMezich(data.posunuto, NEJVIC_POSUNUTYCH) > 1) zaznam.posunuVic = (zaznam.posunuVic ?? 0) + 1;
      if (data.jak === "klavesa") zaznam.posunuKlavesou = (zaznam.posunuKlavesou ?? 0) + 1;
    } else if (u.druh === "napoveda") {
      // Nápověda: krok 1 je soupis mostu, krok 2 jeho obrys. Jiné hodnoty hra neposílá.
      const krok = data.krok === 2 ? 2 : data.krok === 1 ? 1 : 0;
      zaznam.napoveda = Math.max(zaznam.napoveda ?? 0, krok);
    } else if (u.druh === "rada.ukazana" || u.druh === "rada.napoveda") {
      // Rada po druhém stejném nezdaru: jen druhy, které hra posílá; prvek jen známý.
      const druh = textZ(data.druh);
      if (druh === null || !ZNAME_RADY.has(druh)) return;
      if (u.druh === "rada.napoveda") zaznam.radaNapoveda = true;
      else {
        const prvek = znamyPrvek(data.prvek);
        pricti(((v.rady ??= slovnik())[u.uroven] ??= slovnik()), prvek !== null ? `${prvek}/${druh}` : druh, 1);
        if (zaznam.radaZkousek === null || zaznam.radaZkousek === undefined) zaznam.radaZkousek = zaznam.zkousek;
      }
    } else if (u.druh === "stavba.znacka") {
      const klic = data.co === "za-brehem" ? "za-brehem" : data.co === "mezera" ? textZ(data.druh) : null;
      const popis = klic === null || !Object.hasOwn(POPISY_ZNACEK, klic) ? null : POPISY_ZNACEK[klic]!;
      if (popis !== null) pricti(((v.znacky ??= slovnik())[u.uroven] ??= slovnik()), popis, 1);
    } else if (u.druh === "zkouska.konec" && data.host === true) {
      // Zkouška cizího mostu z odkazu: není to hráčova stavba a do čísel o úrovni nepatří.
    } else if (u.druh === "zkouska.konec" && data.pokus === "zlom") {
      zaznam.zlomu = (zaznam.zlomu ?? 0) + 1;
    } else if (u.druh === "zkouska.konec" && (data.pokus === null || data.pokus === undefined)) {
      zaznam.zkousek += 1;
      if (anoZ(data.pruchod)) {
        zaznam.pruchodu += 1;
        // První průchod po radě: i u hráče, který úroveň prošel už dřív a radu dostal při zlevňování.
        if ((zaznam.radaZkousek ?? null) !== null && (zaznam.radaPruchodPo ?? null) === null) zaznam.radaPruchodPo = zaznam.zkousek - zaznam.radaZkousek!;
        if (zaznam.zkousekDoPruchodu === null) {
          zaznam.zkousekDoPruchodu = zaznam.zkousek;
          zaznam.sekundDoPruchodu = zaznam.sekundDriv + vMezich(data.sekund, NEJVIC_SEKUND);
        }
        const cena = Math.round(vMezich(data.cena, NEJVETSI_CENA));
        if (cena >= 1 && (zaznam.nejlevnejsi === null || cena < zaznam.nejlevnejsi)) zaznam.nejlevnejsi = cena;
      } else {
        const prvni = data.prvni;
        // Příčina z výsledku zkoušky (kód z pruhu výsledku); starší hra ji neposílala.
        const pricina = typeof data.pricina === "string" && ZNAME_PRICINY.has(data.pricina) ? (data.pricina as KodPriciny) : null;
        let duvod = "bez porušení";
        if (prvni !== null && typeof prvni === "object" && !Array.isArray(prvni)) {
          const zpusob = textZ(prvni.zpusob);
          duvod = `${znamyPrvek(prvni.prvek) ?? "?"}/${zpusob !== null && ZNAME_ZPUSOBY.has(zpusob) ? zpusob : "?"}`;
        } else if (pricina !== null && pricina !== "pohyb") {
          duvod = POPISY_PRICIN[pricina];
        } else if (anoZ(data.preklopeno)) {
          // Pohyblivý most bez zlomeného prutu: co se nepovedlo při zvedání a sklápění.
          duvod = "křídlo se překlopilo";
        } else if (vMezich(data.narazyLodi, 100) >= 1) {
          duvod = "loď narazila";
        } else if (data.zamceno === false) {
          duvod = "zámek nezapadl";
        } else if (anoZ(data.mezera)) {
          duvod = "mostovka nedosáhla na předmostí";
        } else if (pricina === "pohyb") {
          duvod = POPISY_PRICIN.pohyb;
        }
        pricti((v.selhani[u.uroven] ??= slovnik()), duvod, 1);
      }
      const medaile = data.medaile;
      if (medaile !== null && typeof medaile === "object" && !Array.isArray(medaile)) {
        zaznam.medaile.pruchod ||= anoZ(medaile.pruchod);
        zaznam.medaile.rozpocet ||= anoZ(medaile.rozpocet);
        zaznam.medaile.mistrovska ||= anoZ(medaile.mistrovska);
      }
    }
  };

  for (const davka of serazene) {
    const { hrac, sezeni } = davka.hlavicka;
    const udalosti = davka.udalosti;
    const otisk = `${hrac}/${sezeni}/${davka.poradi}/${udalosti.length}/${udalosti[0]?.t ?? ""}/${udalosti[udalosti.length - 1]?.t ?? ""}`;
    if (zapoctene.has(otisk)) continue;
    zapoctene.add(otisk);
    const oHraci = (v.hraci[hrac] ??= novyHrac());
    if (!oHraci.sezeni.includes(sezeni)) oHraci.sezeni.push(sezeni);
    if (davka.hlavicka.dotyk) oHraci.dotyk = true;
    for (const u of davka.udalosti) zpracuj(hrac, oHraci, u, davka.hlavicka.dotyk === true);
  }
  return v;
}

/**
 * Sloučí výtahy do jednoho. Na pořadí záleží u „do prvního průchodu“ a u vypnutí záznamu:
 * výtahy mají jít za sebou tak, jak se hrálo (dny vzestupně, části jednoho dne v pořadí
 * klíčů dávek).
 */
export function slucVytahy(vytahy: readonly VytahDeniku[]): VytahDeniku {
  const s = prazdnyVytah();
  for (const v of vytahy) {
    s.udalosti += v.udalosti;
    s.chyb += v.chyb;
    s.vazeb += v.vazeb;
    for (const [zprava, pocet] of Object.entries(v.chyby)) prictiChybu(s.chyby, zprava, pocet);
    for (const [hrac, o] of Object.entries(v.hraci)) {
      const cil = (s.hraci[hrac] ??= novyHrac());
      for (const sezeni of o.sezeni) if (!cil.sezeni.includes(sezeni)) cil.sezeni.push(sezeni);
      cil.novy ||= o.novy;
      cil.dotyk ||= o.dotyk;
      for (const obrazovka of o.obrazovky ?? []) pridejObrazovku(cil, obrazovka);
      cil.meriAkce ||= o.meriAkce === true;
      cil.akce ||= o.akce === true;
      if (o.vypnul !== null && o.vypnul !== undefined) cil.vypnul = o.vypnul;
    }
    for (const [uroven, hraci] of Object.entries(v.urovne)) {
      const cilUrovne = (s.urovne[uroven] ??= slovnik());
      for (const [hrac, z] of Object.entries(hraci)) {
        const cil = (cilUrovne[hrac] ??= novyHracVUrovni());
        if ((cil.radaZkousek ?? null) === null) {
          if ((z.radaZkousek ?? null) !== null) {
            cil.radaZkousek = cil.zkousek + z.radaZkousek!;
            cil.radaPruchodPo = z.radaPruchodPo ?? null;
          }
        } else if ((cil.radaPruchodPo ?? null) === null && z.zkousekDoPruchodu !== null) {
          // Rada zazněla v dřívější části: první průchod po ní je první průchod téhle části.
          cil.radaPruchodPo = cil.zkousek - cil.radaZkousek! + z.zkousekDoPruchodu;
        }
        cil.radaNapoveda = (cil.radaNapoveda ?? false) || (z.radaNapoveda ?? false);
        if (cil.zkousekDoPruchodu === null && z.zkousekDoPruchodu !== null) {
          cil.zkousekDoPruchodu = cil.zkousek + z.zkousekDoPruchodu;
          cil.sekundDoPruchodu = cil.sekundDriv + (z.sekundDoPruchodu ?? 0);
        }
        cil.otevreni += z.otevreni;
        cil.zkousek += z.zkousek;
        cil.pruchodu += z.pruchodu;
        cil.sekundDriv += z.sekundDriv;
        cil.medaile.pruchod ||= z.medaile.pruchod;
        cil.medaile.rozpocet ||= z.medaile.rozpocet;
        cil.medaile.mistrovska ||= z.medaile.mistrovska;
        if (z.nejlevnejsi !== null && (cil.nejlevnejsi === null || z.nejlevnejsi < cil.nejlevnejsi)) cil.nejlevnejsi = z.nejlevnejsi;
        cil.napoveda = Math.max(cil.napoveda ?? 0, z.napoveda ?? 0);
        cil.zlomu = (cil.zlomu ?? 0) + (z.zlomu ?? 0);
        cil.dotyk = cil.dotyk === true || z.dotyk === true;
        cil.prutu = (cil.prutu ?? 0) + (z.prutu ?? 0);
        cil.posunu = (cil.posunu ?? 0) + (z.posunu ?? 0);
        cil.posunuVic = (cil.posunuVic ?? 0) + (z.posunuVic ?? 0);
        cil.posunuKlavesou = (cil.posunuKlavesou ?? 0) + (z.posunuKlavesou ?? 0);
      }
    }
    for (const [uroven, pocty] of Object.entries(v.selhani)) {
      const cil = (s.selhani[uroven] ??= slovnik());
      for (const [duvod, pocet] of Object.entries(pocty)) pricti(cil, duvod, pocet);
    }
    for (const [uroven, pocty] of Object.entries(v.prvky)) {
      const cil = (s.prvky[uroven] ??= slovnik());
      for (const [prvek, pocet] of Object.entries(pocty)) pricti(cil, prvek, pocet);
    }
    for (const [uroven, pocty] of Object.entries(v.rady ?? {})) {
      const cil = ((s.rady ??= slovnik())[uroven] ??= slovnik());
      for (const [rada, pocet] of Object.entries(pocty)) pricti(cil, rada, pocet);
    }
    for (const [uroven, pocty] of Object.entries(v.znacky ?? {})) {
      const cil = ((s.znacky ??= slovnik())[uroven] ??= slovnik());
      for (const [znacka, pocet] of Object.entries(pocty)) pricti(cil, znacka, pocet);
    }
  }
  return s;
}

const odNejcastejsiho = (pocty: Record<string, number> | undefined): Record<string, number> =>
  Object.fromEntries(Object.entries(pocty ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));

/** Souhrn s počty a mediány z výtahu. */
export function souhrnZVytahu(v: VytahDeniku): SouhrnDeniku {
  const hraci = Object.values(v.hraci);
  const urovne: SouhrnUrovne[] = Object.entries(v.urovne)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([uroven, hraciUrovne]) => {
      const zaznamy = Object.values(hraciUrovne);
      const soucet = (cti: (z: HracVUrovni) => number): number => zaznamy.reduce((s, z) => s + cti(z), 0);
      const minut = median(zaznamy.flatMap((z) => (z.sekundDoPruchodu === null ? [] : [z.sekundDoPruchodu / 60])));
      const ceny = zaznamy.flatMap((z) => (z.nejlevnejsi === null ? [] : [z.nejlevnejsi]));
      const cena = median(ceny);
      // Hráči, kteří radu viděli, a kolik zkoušek od ní potřebovali ti, kdo potom prošli.
      const sRadou = zaznamy.filter((z) => (z.radaZkousek ?? null) !== null);
      const poRade = sRadou.flatMap((z) => ((z.radaPruchodPo ?? null) !== null ? [z.radaPruchodPo!] : []));
      return {
        uroven,
        hracu: zaznamy.length,
        otevreni: soucet((z) => z.otevreni),
        zkousek: soucet((z) => z.zkousek),
        pruchodu: soucet((z) => z.pruchodu),
        hracuSPruchodem: zaznamy.filter((z) => z.pruchodu > 0).length,
        hracuBezZkousky: zaznamy.filter((z) => z.zkousek === 0).length,
        zkousekDoPruchodu: median(zaznamy.flatMap((z) => (z.zkousekDoPruchodu === null ? [] : [z.zkousekDoPruchodu]))),
        minutDoPruchodu: minut === null ? null : Math.round(minut * 10) / 10,
        medaile: {
          pruchod: zaznamy.filter((z) => z.medaile.pruchod).length,
          rozpocet: zaznamy.filter((z) => z.medaile.rozpocet).length,
          mistrovska: zaznamy.filter((z) => z.medaile.mistrovska).length,
        },
        nejlevnejsiPruchod: ceny.length === 0 ? null : ceny.reduce((a, b) => Math.min(a, b)),
        cenaPruchodu: cena === null ? null : Math.round(cena),
        prvky: odNejcastejsiho(v.prvky[uroven]),
        selhani: odNejcastejsiho(v.selhani[uroven]),
        hracuSNapovedou: zaznamy.filter((z) => (z.napoveda ?? 0) >= 1).length,
        hracuSObrysem: zaznamy.filter((z) => (z.napoveda ?? 0) >= 2).length,
        hracuDoZlomu: zaznamy.filter((z) => (z.zlomu ?? 0) > 0).length,
        zkousekDoZlomu: zaznamy.reduce((soucet, z) => soucet + (z.zlomu ?? 0), 0),
        hracuNaDotyku: zaznamy.filter((z) => z.dotyk === true).length,
        hracuBezZkouskyNaDotyku: zaznamy.filter((z) => z.zkousek === 0 && z.dotyk === true).length,
        hracuBezPrutu: zaznamy.filter((z) => z.otevreni > 0 && (z.prutu ?? 0) === 0).length,
        rady: odNejcastejsiho(v.rady?.[uroven]),
        hracuSRadou: sRadou.length,
        hracuSRadouPrusli: poRade.length,
        zkousekPoRade: median(poRade),
        hracuNapovedaZRady: zaznamy.filter((z) => z.radaNapoveda === true).length,
        hracuSPosunem: zaznamy.filter((z) => (z.posunu ?? 0) > 0).length,
        posunu: soucet((z) => z.posunu ?? 0),
        posunuVic: soucet((z) => z.posunuVic ?? 0),
        posunuKlavesou: soucet((z) => z.posunuKlavesou ?? 0),
        znacky: odNejcastejsiho(v.znacky?.[uroven]),
      };
    });

  const bez = hraci.filter((h) => !(h.obrazovky ?? []).includes("kampan"));
  const byl = (h: HracVeVytahu, kde: string): boolean => (h.obrazovky ?? []).includes(kde);
  const jinde = ["piskoviste", "komise", "list", "zkusebna", "jine"];
  const bezUrovne: SouhrnBezUrovne = {
    hracu: bez.length,
    novych: bez.filter((h) => h.novy).length,
    dotykovych: bez.filter((h) => h.dotyk).length,
    jenPrehled: bez.filter((h) => byl(h, "prehled") && !jinde.some((kde) => byl(h, kde))).length,
    piskoviste: bez.filter((h) => byl(h, "piskoviste")).length,
    komise: bez.filter((h) => byl(h, "komise")).length,
    list: bez.filter((h) => byl(h, "list")).length,
    zkusebna: bez.filter((h) => byl(h, "zkusebna")).length,
    soukromi: bez.filter((h) => byl(h, "soukromi")).length,
    vazba: bez.filter((h) => byl(h, "vazba")).length,
    bezObrazovky: bez.filter((h) => (h.obrazovky ?? []).length === 0).length,
    sAkci: bez.filter((h) => h.akce === true).length,
    bezAkce: bez.filter((h) => h.meriAkce === true && h.akce !== true).length,
  };

  return {
    hracu: hraci.length,
    sezeni: hraci.reduce((s, h) => s + h.sezeni.length, 0),
    novych: hraci.filter((h) => h.novy).length,
    dotykovych: hraci.filter((h) => h.dotyk).length,
    udalosti: v.udalosti,
    chyb: v.chyb,
    vazeb: v.vazeb,
    vypnuli: hraci.filter((h) => h.vypnul === true).length,
    chyby: Object.entries(v.chyby)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([zprava, pocet]) => ({ zprava, pocet })),
    bezUrovne,
    urovne,
  };
}

/** Souhrn rovnou z dávek deníku. */
export function souhrnDeniku(davky: readonly DavkaDeniku[]): SouhrnDeniku {
  return souhrnZVytahu(vytahDeniku(davky));
}
