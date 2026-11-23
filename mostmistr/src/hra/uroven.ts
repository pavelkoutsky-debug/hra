// Obrazovka úrovně: stavba mostu na výkresu, zkouška v pracovním vlákně, přehrávání
// záznamu na časové ose a vyhodnocení s medailemi.

import { cenaNavrhu, cenaPrutu, hmotnostNavrhu } from "../data/cena";
import type { Bod } from "../data/geometrie";
import { jeUvnitr } from "../data/geometrie";
import { KROK_ZAVAZI,
  CENA_SVARU,
  CENA_ZAVAZI,
  jeKolejove,
  KATALOG,
  LADENY_TLUMIC,
  NEJVETSI_KLIDOVY_TAH,
  PIST,
  vlastnostiPrutu,
  ZAMEK,
  type IdPrvku,
  zdvihPistu,
} from "../data/katalog";
import { PISMO } from "../vykres/barvy";
import { ChybaDat } from "../data/kontrola";
import {
  COS_NEJVETSIHO_OTOCENI,
  mezeryTras,
  navrhNaText,
  navrhZTextu,
  type DruhProblemu,
  type NavrhMostu,
} from "../data/navrh";
import { BEZ_MEDAILI, type Rekord } from "../data/ulozeni";
import { kdoCestuje, type Uroven } from "../data/uroven";
import type { Denik } from "../denik/denik";
import { predOdchodem, stopkyViditelnosti } from "../denik/prohlizec";
import type { HodnotaDeniku } from "../denik/udalosti";
import { Editor } from "../editor/editor";
import { prekazkyZkousky } from "../editor/pravidla";
import { prazdnyNavrh } from "../editor/upravy";
import { MEZ_POHODLI_VE_VOZE, MEZE_KOMFORTU } from "../jadro/komfort";
import { ZPUSOB_OHYB, ZPUSOB_SMYK, ZPUSOB_TAH, ZPUSOB_TLAK, ZPUSOB_ZADNY } from "../jadro/namahani";
import { NASLEDEK_KLOUB, NASLEDEK_ODPOJENI } from "../jadro/poruseni";
import { VERZE_FYZIKY } from "../jadro/verze";
import { nadpisSJednotkou, prvek, udaj } from "../ui/dom";
import { celeCislo, cislo, datum, hmotnost, koruny, meritkoVykresu, procenta, velkymPismenem, zobrazenyRozdil } from "../ui/formaty";
import { posunPrehravani, zapisCasu, type StavPrehravani } from "../ui/prehravani";
import { aktualniJazyk, jeKlicTextu, nazevUrovne, t, type KlicTextu } from "../ui/slovnik";
import { celyVyrez, obrazNaSvet, omezNaVyrez, posunO, svetNaObraz, zoomKolem, type Kamera } from "../vykres/kamera";
import { nakresliKonstrukci } from "../vykres/konstrukce";
import { hezkeZvetseni, nejvetsiPohybZavazi, nejvetsiVychylka, stredniPolohy, zvetsiPohyb } from "../vykres/zvetseni";
import { nakresliNavrh, tloustkaPrutu } from "../vykres/navrh";
import { nakresliZamkyZaznamu, stavPohybu, valecPrutu } from "./pohyb";
import { pripojOvladani } from "../vykres/ovladani";
import { Platno } from "../vykres/platno";
import { nakresliProvoz } from "../vykres/provoz";
import { nakresliCislaVyuziti, type CisloVyuziti } from "../vykres/cisla";
import { nakresliKrivku, nakresliPrubeh, stropGrafu, vrcholyKrivky, type BodKrivky } from "../vykres/grafy";
import { nakresliSpodekVykresu, nakresliVrsekVykresu, nakresliVykres } from "../vykres/vykres";
import { UlozenaVrstva } from "../vykres/vrstva";
import { frekvenceBudice, jeStaly } from "../zkouska/budic";
import { KlientZkousky } from "../zkouska/klient";
import { jeClovek, type PopisUcastnika } from "../zkouska/provoz";
import type {
  BudicZkousky,
  DopnutiLan,
  RozborMostu,
  Udalost,
  VysledekZkousky,
  ZpravaZeZkousky,
} from "../zkouska/protokol";
import { KADENCE_BEHU, lidiVRade, rytmusLidi, umiBrzdit } from "../zkouska/vozidla";
import { CARA_SKRYTA, prazdnySnimek, Zaznam, type Snimek, type Topologie } from "../zkouska/zaznam";
import { DRUHY_ZVUKU, Poslech, type Zvuk } from "../zvuk/deje";
import { Ozvuceni } from "../zvuk/ozvuceni";
import { nasadaUrovne } from "../../urovne/index";
import { zakladVyzev } from "../../urovne/vyzvy";
import { DRUHY_VYZEV, prahyVyzev, unosnostNaKorunu } from "../data/vyzvy";
import { TIHOVE_ZRYCHLENI } from "../jadro/integrator";
import { zatizeniZlomu, ZKOUSKA_DO_ZLOMU } from "../zkouska/zlom";
import { BARVY } from "../vykres/barvy";
import { nakresliSlozeni, nakresliZaber } from "../vykres/zaber";
import { nakresliSplouchnuti, nakresliTrosky } from "../vykres/efekty";
import { casyPadu, najdiSplouchnuti, najdiZlomy, type Splouchnuti, type Zlom } from "../zkouska/efekty";
import { BEZ_NALEZU, posudStabilitu, type PosudekStability, type Slozeni } from "../zkouska/slozeni";
import {
  mostProHrace,
  nejblizsiTvar,
  nejvyssiSlozka,
  pricinaKmitani,
  ROZSAH_FREKVENCI,
  SILNA_SLOZKA,
  slozkyKroku,
  type PricinaKmitani,
} from "../zkouska/kmitani";
import { ODHAD_U_MEZE, type OdhadKmitani, type OdhadSkupiny, type SlozkaOdhadu } from "../zkouska/odhad";
import {
  jenKloub,
  konecZaberu,
  miraObrazu,
  miraPohledu,
  miraZpomaleni,
  pohledZaberu,
  prvniPorucha,
  rychlostVZaberu,
  sledovaneMisto,
  smichejPohledy,
  tempoZaberu,
  ZABER,
  zaberNaPoruchu,
  zacatekZaberu,
  type UdalostZaberu,
  type Zaber,
} from "./rezie";
import { sandboxNaText, type NastaveniSandboxu } from "../data/sandbox";
import { RESENI } from "../../urovne/reseni";
import { pripojNapovedu, type Napoveda } from "./napoveda";
import { pripojSandbox } from "./sandbox";
import { stupneVyzev, vypisVyzvy, zapisVyzvy } from "./vyzvy";
import { ukazkaUrovne } from "../../urovne/ukazky";
import { pripojVazbu } from "./vazba";
import { pripojZaznam } from "./zaznam";
import { Ukazka } from "./ukazka";
import { podminkaMistrovske, vypisMedaile, vypisMedailePruhu, znackyMedaili } from "./medaile";
import { HLASITOSTI, type Uloziste } from "./uloziste";

/** Volný okraj kolem výřezu při zobrazení celého výkresu, v pixelech. */
const OKRAJ_VYKRESU = 28;
const KROK_ZOOMU_TLACITKEM = 1.25;
/** Jak daleko od prutu se při zkoušce ještě počítá kliknutí na něj, v pixelech. */
const DOSAH_KLIKNUTI = 9;
/** Jak blízko značce na časové ose musí ukazatel být, aby se ukázal její popis (pixely). */
const DOSAH_ZNACKY_OSY = 7;
/** Totéž pro prst, px. */
const DOSAH_ZNACKY_DOTYKEM = 18;
/** Jak dlouho po zvednutí prstu zůstane popis značky nad osou, ms. */
const DOBA_BUBLINY_PO_DOTYKU = 3000;
/** Kolik porušení výsledek vypíše jmenovitě; zbytek shrne počtem. */
const NEJVIC_VYPSANYCH_PORUSENI = 5;
/** Po jaké době zmizí hlášení, které na nic nečeká, v milisekundách. */
const DOBA_HLASENI = 6000;
/** O kolik sekund děje posune záznam jeden krok krokování. */
const KROK_ZAZNAMU = 0.02;
/** Brnknutí: kolik newtonů přidá metr tažení myší a největší síla. */
const SILA_NA_METR = 4000;
const NEJVETSI_BRNKNUTI = 8000;
const NEJMENSI_BRNKNUTI = 200;
/** Držené tlačítko kroku: po kolika ms začne opakovat a jak často (ms). */
const PRODLEVA_DRZENI = 400;
const OPAKOVANI_DRZENI = 80;
/** Od jakého průvěsu mostovky pod vlastní tíhou (m) na něj hra při stavbě upozorní. */
const PRUVES_K_HLASENI = 0.1;
/** O kolik musí tužší nebo těžší most odhad zmenšit (podíl), aby ho hra poradila. */
const RADA_OD = 0.8;
/** Od jakého poměru k dnešnímu odhadu se za pomoc počítá úprava tlumiče, který na mostě už je. */
const UPRAVA_TLUMICE_OD = 0.9;
/** Jak blízko (podíl frekvence) musí být číslo z pokusu vlastní frekvenci, aby šlo o ni. */
const SHODA_POKUSU = 0.06;
/** Za jak dlouho (s) kreslené zvětšení pohybu doběhne k cíli. */
const DOBA_NABEHU_ZVETSENI = 0.35;
/** Nejkratší osa frekvencí, Hz; delší je jen tam, kde lidé most budí i výš. */
const NEJMENSI_ROZSAH_OSY = 6;
/** Kolik hertzů musí zbýt mezi nejvyšší složkou kroku a koncem osy. */
const OKRAJ_OSY = 0.2;
/** Prodleva mezi úpravou návrhu a žádostí o rozbor, v milisekundách. */
const PRODLEVA_ROZBORU = 200;
/** Budič: amplituda síly v newtonech, rozsah a doba přelaďování, doba stálého rytmu a krok nastavení. */
const SILA_BUDICE = 2000;
const ROZSAH_BUDICE = { od: 0.5, do: 6, trvani: 80 };
const TRVANI_STALEHO_RYTMU = 14;
const KROK_BUDICE = 0.05;
/** Animace tvaru kmitání při stavbě: kolikrát za sekundu se most zhoupne a jak daleko (podíl rozpětí). */
const FREKVENCE_ANIMACE = 0.8;
const VYCHYLKA_ANIMACE = 0.035;
/** Jak daleko do stran zvuk zní, když je jeho zdroj na kraji plátna (1 je úplně v jednom uchu). */
const SIRKA_ZVUKU = 0.85;

/** Jedna zkouška mostu: záznam, který plní pracovní vlákno, a nakonec výsledek. */
/**
 * Přídavek, který se nekreslí tahem, ale kliknutím přidává k tomu, co už stojí: napínák
 * k lanu, svar, dělicí zámek, závaží a laděný tlumič ke styčníku.
 */
type Pridavek = "napinak" | "svar" | "zamek" | "zavazi" | "ladeny";
const PRIDAVKY: readonly Pridavek[] = ["napinak", "svar", "zamek", "zavazi", "ladeny"];

function jePridavek(nastroj: string): nastroj is Pridavek {
  return (PRIDAVKY as readonly string[]).includes(nastroj);
}

/**
 * Zpomalený záběr na první poruchu zkoušky (viz `src/hra/rezie.ts`): nejdřív se hledá (záznam
 * ještě nemusí sahat dost daleko), pak je připravený a přehrávání ho vede, nakonec je hotovo.
 */
type StavZaberu =
  | { stav: "hleda"; vynuceno: boolean }
  | {
      stav: "pripraven";
      zaber: Zaber;
      /** Krátký popisek u značky na výkresu. */
      popis: string;
      /** Celá věta do hlášení nad výkresem. */
      veta: string;
      /** Prut, který povolil (pořadí v návrhu); null u sjetí z podpory a u mostu, který se složil. */
      prut: number | null;
      /** Pohled, ze kterého záběr vyjel a do kterého se vrátí; null, dokud nezačal. */
      domov: Kamera | null;
      /** Čas děje, kdy záběr začal, a míra, kterou v tu chvíli už měl mít (viz `miraObrazu`). */
      od: number;
      nabeh: number;
      /** Míra záběru v obrazu při posledním posunu času. */
      mira: number;
      /** Vede záběr i pohled? Ne při omezených animacích a poté, co hráč pohled sám změnil. */
      pohled: boolean;
      /** Vypnutý záběr: nezpomaluje ani nepřibližuje, jen ve chvíli porušení řekne, co povolilo. */
      tichy: boolean;
      /** Kolikrát jsou časy záběru kratší (pomalé přehrávání, stejné porušení podruhé); viz `tempoZaberu`. */
      tempo: number;
      /** Nejnižší rychlost přehrávání v záběru. */
      nejpomaleji: number;
      /** Kde je teď to, co záběr sleduje (padající styčník nebo prut). */
      misto: Bod;
      /** Čím se pozná stejné porušení při další zkoušce: podruhé je záběr kratší. */
      klic: string;
    }
  | { stav: "hotovo" };

/** Co most při zkoušce rozhoupalo, ve dvou chvílích, o kterých výsledek mluví. */
interface KmitaniBehu {
  /** Když kmital nejvíc: k té chvíli patří číslo v protokolu. */
  nejvic: PricinaKmitani;
  /**
   * Když kmitání poprvé přesáhlo mez úrovně: to hráč viděl a hned po tom přišel výsledek.
   * U mostu, který mez nepřesáhl, totéž co `nejvic`.
   */
  rozhodla: PricinaKmitani;
}

/** Jak velkou část mezery mezi mostovkou a závažím laděného tlumiče smí zvětšený pohyb závaží zabrat. */
const MEZERA_ZAVAZI = 0.8;
/** Kolik sekund po prvním překročení meze se čte, co most rozhoupalo: kmitání ještě roste. */
const PO_PREKROCENI = 2;

interface Beh {
  /** Návrh, který se zkoušel. Dokud ho hráč nezmění, platí pro něj obálka namáhání. */
  navrh: NavrhMostu;
  zaznam: Zaznam;
  ucastnici: PopisUcastnika[];
  udalosti: Udalost[];
  /** Délka děje v sekundách: nejdřív očekávaná, po doběhnutí skutečná. */
  trvani: number;
  spocitanoVse: boolean;
  vysledek: VysledekZkousky | null;
  vysledekUkazan: boolean;
  /** Hráč chtěl skočit na konec dřív, než byl spočítaný. */
  naKonecPoVypoctu: boolean;
  /** Prut, na který hráč při přehrávání klikl (pořadí v návrhu). */
  oznaceny: number | null;
  /** Pokus (brnknutí nebo budič), ne zkouška: nepočítá se do medailí ani do obálky. */
  pokus: boolean;
  /** Budič, kterým se most při pokusu rozkmitával; null u zkoušky a u brnknutí. */
  budic: BudicZkousky | null;
  /** Zkouška do zlomu: bez provozu a bez medailí, ale počítá se do výzvy o únosnost na korunu. */
  zlom: boolean;
  /** Počítá se tahle zkouška do zlomu do výzvy? Jen když most před tím prošel běžnou zkouškou. */
  zlomSePocita: boolean;
  /** Most neměl pod vlastní tíhou klidovou polohu a skládá se od začátku děje. */
  bezRovnovahy: boolean;
  /** Posudek takového mostu (složí se, kde a proč; volný prut); undefined, dokud záznam nesahá dost daleko. */
  posudek?: PosudekStability;
  zaber: StavZaberu;
  /** Klidové polohy brnknutého mostu (střed jeho kmitání); počítají se jednou, až je záznam celý. */
  klid?: Float32Array;
  /** Co most rozhoupalo (null, když se to ze záznamu nepozná); undefined, dokud se to nepočítalo. */
  kmitani?: KmitaniBehu | null;
  /** Hlášení, že kmitání přesáhlo mez úrovně, už při tomhle přehrání zaznělo. */
  kmitaniOhlaseno: boolean;
  /**
   * Kolikrát se smí svislý pohyb mostu na výkresu zvětšit, aby byl vidět; 1, dokud zkouška
   * není spočítaná, a u mostu, který se při ní porušil (tam se kreslí skutečné polohy).
   */
  zvetseni: number;
  /** Zvětšení, se kterým se právě kreslí: k cíli se blíží plynule. */
  zvetseniTed: number;
  /** Polohy styčníků se zvětšeným pohybem pro právě kreslený snímek. */
  zvetsene: Float32Array;
  /** Efekty pádu, které se hledají v záznamu, jak přibývá: dopady na hladinu, zlomy a časy pádu lidí. */
  efekty: { splouchnuti: Splouchnuti[]; snimku: number; zlomy: Zlom[]; udalosti: number; pady: (number | undefined)[] };
}

/** Průběhy veličin v čase, jak je sbírá analytický panel ze záznamu zkoušky. */
interface Rady {
  beh: Beh;
  /** Kolik snímků záznamu je už zpracováno. */
  zpracovano: number;
  casy: number[];
  /** Svislý posun styčníku mostovky nejblíž středu rozpětí proti začátku zkoušky, mm. */
  pruhyb: number[];
  stycnik: number;
  vychozi: number;
  /** Okamžité zrychlení mostovky, m/s². */
  kmitani: number[];
  /** Prut, jehož využití se sleduje (pořadí v návrhu), a jeho využití v procentech. */
  prut: number | null;
  vyuziti: number[];
}

function nazevZpusobu(zpusob: number): KlicTextu {
  if (zpusob === ZPUSOB_TAH) return "zkusebna.zpusob.tah";
  if (zpusob === ZPUSOB_TLAK) return "zkusebna.zpusob.tlak";
  if (zpusob === ZPUSOB_OHYB) return "zkusebna.zpusob.ohyb";
  if (zpusob === ZPUSOB_SMYK) return "zkusebna.zpusob.smyk";
  return "zkusebna.zpusob.vzper";
}

function nazevNasledku(nasledek: number): KlicTextu {
  if (nasledek === NASLEDEK_KLOUB) return "zkusebna.nasledek.kloub";
  if (nasledek === NASLEDEK_ODPOJENI) return "zkusebna.nasledek.odpojeni";
  return "zkusebna.nasledek.rozlomeni";
}

function nazevPrvku(id: IdPrvku): string {
  return t(`prvek.${id}`);
}

function vzdalenostOdUsecky(p: Bod, a: Bod, b: Bod): number {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const delka2 = ux * ux + uy * uy;
  let podil = delka2 > 0 ? ((p.x - a.x) * ux + (p.y - a.y) * uy) / delka2 : 0;
  podil = Math.max(0, Math.min(1, podil));
  return Math.hypot(p.x - (a.x + podil * ux), p.y - (a.y + podil * uy));
}

/** Je cílem události pole, do kterého se píše? Klávesové zkratky ho nechávají být. */
function jePsaciPole(cil: EventTarget | null): boolean {
  return cil instanceof Element && cil.closest("textarea, select, input:not([type=range]):not([type=checkbox])") !== null;
}

/**
 * Spustí obrazovku úrovně. `kampan` je pořadí úrovní pro odkaz na další; úroveň mimo
 * kampaň (zkušební výkres) další nemá.
 */
/**
 * Spustí obrazovku úrovně. `sandbox` je nastavení sandboxu, ze kterého úroveň vznikla; s ním
 * má paleta tlačítko pro nastavení údolí a provozu.
 */
export function spustUroven(
  uroven: Uroven,
  kampan: readonly Uroven[],
  uloziste: Uloziste,
  denik: Denik,
  sandbox: NastaveniSandboxu | null = null,
): void {
  prvek("#obrazovka-uroven", HTMLElement).hidden = false;

  // ---- Deník hraní: co hráč v úrovni dělá (viz src/denik/) ----
  // Čas v úrovni běží jen, když je stránka vidět; panel na pozadí se do něj nepočítá.
  const stopky = stopkyViditelnosti();
  const sekundVUrovni = (): number => Math.round(stopky() / 1000);
  const zapis = (druh: string, data?: { [klic: string]: HodnotaDeniku }): void => denik.zapis(druh, data, uroven.id);
  /** Kolik úprav mostu hráč udělal od poslední zkoušky a kolik zkoušek s provozem už pustil. */
  let upravOdZkousky = 0;
  let zkousekVUrovni = 0;
  /** Kdy začal výpočet běžící zkoušky a kdy se otevřelo okno se zadáním, ms. */
  let vypocetOd = 0;
  let zadaniOtevrenoV = Date.now();
  /** Nástroj a prvek, které byly zvolené naposledy; do deníku jde jen změna. */
  let zapsanyNastroj = "";
  const canvas = prvek("#obrazovka-uroven .vykres__platno", HTMLCanvasElement);
  const poleSouradnic = udaj("souradnice");
  const poleMeritka = udaj("meritko");
  const poleHlaseni = udaj("hlaseni");
  const tlacitkoZkousky = prvek('[data-akce="zkouska"]', HTMLButtonElement);
  const tlacitkoPrehrat = prvek('[data-akce="prehrat"]', HTMLButtonElement);
  const tlacitkaRychlosti = [...document.querySelectorAll<HTMLButtonElement>("#obrazovka-uroven [data-rychlost]")];
  const tahlo = prvek("#cas", HTMLInputElement);
  const pruhSpocitano = prvek("#obrazovka-uroven .osa__spocitano", HTMLElement);
  const znackyOsy = prvek("#obrazovka-uroven .osa__znacky", HTMLElement);
  const bublinaOsy = prvek("#obrazovka-uroven .osa__bublina", HTMLElement);
  const panelVysledku = prvek(".vysledek", HTMLElement);
  const tlacitkoSbaleni = prvek('[data-akce="vysledek-sbalit"]', HTMLButtonElement);
  const pruhVysledku = prvek(".vysledek__pruh", HTMLElement);
  const paletaPrvku = prvek(".paleta__prvky", HTMLElement);
  const rozpocet = prvek(".rozpocet", HTMLElement);
  const okno = prvek("#okno", HTMLDialogElement);
  const obsahOkna = prvek("#okno-obsah", HTMLTextAreaElement);
  const oknoZadani = prvek("#okno-zadani", HTMLDialogElement);
  const prepinacCisel = prvek('[data-akce="cisla"]', HTMLButtonElement);
  const tlacitkoZvuku = prvek('[data-akce="zvuk"]', HTMLButtonElement);
  const tlacitkoZvetseni = prvek('[data-akce="zvetseni"]', HTMLButtonElement);
  const panelAnalyzy = udaj("analyza");
  const tlacitkoAnalyzy = prvek('[data-akce="analyza"]', HTMLButtonElement);
  const platnoKrivky = prvek('[data-udaj="krivka"]', HTMLCanvasElement);

  // ---- Stav ----

  // Skutečný výchozí pohled nastaví až `ukazCelyVykres` na konci, kdy je známá velikost plátna.
  let kamera: Kamera = { x: 0, y: 0, meritko: 20 };
  /** Dokud hráč pohled nezměnil, drží se při změně velikosti okna celý výkres. */
  let pohledJeVychozi = true;
  /** Poslední místo kurzoru na plátně v pixelech; null, když je mimo plátno. */
  let mistoKurzoru: Bod | null = null;
  /** Bod rastru pod kurzorem; null mimo výřez úrovně. */
  let kurzor: Bod | null = null;

  let rezim: "stavba" | "zkouska" = "stavba";
  let nastroj: "kresleni" | "vyber" | "brnknuti" | "budic" | Pridavek = "kresleni";
  /** Hmotnost, kterou dostane nové závaží: ta, kterou hráč nastavil naposledy. */
  let posledniZavazi = Math.min(KROK_ZAVAZI, uroven.nejvetsiZavazi);
  /** Přídavky styčníků, které úroveň dovoluje; v paletě stojí za nosnými prvky. */
  const pridavky: Pridavek[] = [];
  /** Úroveň dovoluje lana: v paletě je napínák a mezi nástroji automatické dopnutí. */
  const smiLana = uroven.povolenePrvky.some((id) => KATALOG[id].druh === "lano");
  if (smiLana) pridavky.push("napinak");
  if (uroven.povoleneSvary) pridavky.push("svar");
  // Zámek patří k mostu, který se zvedá.
  if (uroven.pohyb) pridavky.push("zamek");
  if (uroven.nejvetsiZavazi > 0) pridavky.push("zavazi");
  if (uroven.nejvetsiTlumic >= LADENY_TLUMIC.nejmensiHmota) pridavky.push("ladeny");
  /** Rytmus, ve kterém budič bije, v Hz; null znamená přeladit celý rozsah. */
  let rytmusBudice: number | null = null;
  /** Co budič na mostě naměřil: křivka z přelaďování a body ze stálých rytmů. Platí pro `navrh`. */
  let zmereno: { navrh: NavrhMostu; cara: BodKrivky[]; body: BodKrivky[] } | null = null;
  /** Rozdělané brnknutí: styčník (pořadí v návrhu), místo stisku a kurzoru v pixelech plátna. */
  let brnk: { stycnik: number; od: Bod; k: Bod } | null = null;
  /** Poslední rozbor mostu; undefined, dokud se počítá, null, když most rozebrat nejde. */
  let rozbor: RozborMostu | null | undefined;
  /** Poslední rozbor mostu, který měl klidovou polohu; slouží jako odhad, dokud se počítá nový. */
  let posledniZnamyRozbor: RozborMostu | null = null;
  let idRozboru = 0;
  let casovacRozboru: number | undefined;
  const maLidi = uroven.jizdniRad.some((p) => jeClovek(p.druh));
  /** Ukázka v okně se zadáním; běží, jen dokud je okno otevřené. */
  let ukazka: Ukazka | null = null;
  /** Poslední zkouška; její obálka platí, dokud je `beh.navrh` právě upravovaný návrh. */
  let beh: Beh | null = null;
  let klient: KlientZkousky | null = null;
  /** Výsledky poslední a předposlední dokončené zkoušky, pro porovnání pokusů. */
  let posledniVysledek: VysledekZkousky | null = null;
  let predchoziVysledek: VysledekZkousky | null = null;
  let prehravani: StavPrehravani = { cas: 0, bezi: false, rychlost: 1 };
  const snimek: Snimek = prazdnySnimek();
  let rekord: Rekord | undefined = uloziste.rekord(uroven.id);
  /** Most, který úrovní projde: z něj je nápověda. Sandbox a zkušební výkres žádný nemají. */
  const reseniUrovne = sandbox ? undefined : RESENI[uroven.id]?.pruchod;
  /** Nápověda úrovně (soupis a obrys mostu, který projde); null, kde úroveň referenční most nemá. */
  let napoveda: Napoveda | null = null;
  /** Kolik zkoušek s provozem v téhle návštěvě neprošlo; po třetí hra nápovědu nabídne. */
  let nezdaru = 0;
  let napovedaNabidnuta = false;
  /** Hráč už nápovědu otevřel sám: připomínat mu ji nemá smysl. */
  let napovedaPouzita = false;
  /** Zápisy mostů, které v téhle návštěvě prošly běžnou zkouškou (kvůli výzvě o únosnost). */
  const prosleMosty = new Set<string>();
  /**
   * Krátký otisk návrhu pro paměť prošlých mostů (FNV-1a přes text návrhu) i s verzí fyziky:
   * most, který prošel ve starší fyzice, v nové projít nemusí.
   */
  const fnv = (text: string): string => {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
  };
  /** Otisk úrovně: po přeladění úrovně (jiný provoz, rozpočet, prvky) dřívější průchod neplatí. */
  const otiskUrovne = fnv(JSON.stringify(uroven));
  const otiskNavrhu = (navrh: NavrhMostu): string => {
    const text = navrhNaText(navrh);
    return `${VERZE_FYZIKY}:${otiskUrovne}:${fnv(text)}:${text.length}`;
  };
  /** Výzvy o efektivitu: co dokázaly referenční mosty a prahy z toho; null, kde úroveň referenční mosty nemá. */
  const zakladVyzevUrovne = zakladVyzev(uroven);
  const prahy = zakladVyzevUrovne ? prahyVyzev(zakladVyzevUrovne) : null;
  let casovacHlaseni: number | undefined;
  /** Ukazovat u prutů čísla využití? */
  let cisla = uloziste.cislaVyuziti;
  const ozvuceni = new Ozvuceni(uloziste.hlasitost);
  ozvuceni.priZmeneStavu = () => obnovZvuk();
  /** Poslech právě přehrávané zkoušky: říká, co má v kterém okamžiku záznamu zaznít. */
  let poslech: Poslech | null = null;
  /** Telefon na výšku: výkres je úzký a panely přes něj zabírají skoro všechno. */
  const jeUzkeOkno = (): boolean => window.matchMedia?.("(max-width: 700px)").matches ?? false;
  /** Je analytický panel rozbalený? V úrovni s rezonanční křivkou začíná otevřený. */
  // V pískovišti je analýza zavřená: zakrývala by kótu rozpětí na prázdném výkresu. Na telefonu
  // také: panel tam zabere celou šířku okna a z výkresu by nezbylo nic.
  let analyzaOtevrena = uroven.rezonancniKrivka && sandbox === null && !jeUzkeOkno();
  /** První porušení poslední zkoušky, která neprošla: značka na výkresu při stavbě, dokud se most nezmění. */
  let posledniPorucha: { navrh: NavrhMostu; misto: Bod; popis: string } | null = null;
  /** Horní okraj svislé osy rezonanční křivky; drží se, aby bylo vidět, že úprava špičku snížila. */
  let stropKrivky = 0;
  /** Který tvar kmitání se právě na výkresu předvádí (pořadí v rozboru); null žádný. */
  let tvarKmitani: number | null = null;
  /** Průběhy veličin právě zkoušeného mostu pro grafy analytického panelu. */
  let rady: Rady | null = null;
  /** Co grafy naposledy ukazovaly; nové kreslení je potřeba, jen když se to změní. */
  let nakreslenePrubehy = "";
  /** Zpomalené přehrání porušení: kdy skončí a na jakou rychlost se pak přehrávání vrátí. */
  /** Zpomalit a přiblížit první porušení při zkoušce? Volba hráče, pamatuje se. */
  let zaberZapnuty = uloziste.zpomaleniPadu;
  /** Kreslit pohyb celého mostu při zkoušce zvětšeně (aby bylo kmitání vidět)? Volba hráče. */
  let zvetseniZapnuto = uloziste.zvetseniPohybu;
  /** Rychlost, jakou přehrávání právě běží: zvolená, v záběru na porušení nižší. */
  let rychlostTed = 1;

  // Pomocné vlákno pro rozbory mostu a dopínání lan při stavbě; zkoušky mají každá vlastní.
  const pomocny = new KlientZkousky();
  /** Dopínání lan, na jehož výsledek se čeká: číslo žádosti a návrh, pro který platí. */
  let dopinani: { id: number; navrh: NavrhMostu } | null = null;
  let idDopnuti = 0;
  pomocny.poslouchej((zprava) => {
    if (zprava.typ === "dopnuti") {
      prijmiDopnuti(zprava.id, zprava.dopnuti);
      return;
    }
    // Pád pomocného vlákna: rozpočítané dopnutí už nedorazí, tak ať tlačítko nezůstane zamčené.
    if (zprava.typ === "chyba" && dopinani) {
      prijmiDopnuti(dopinani.id, null);
      return;
    }
    if (zprava.typ !== "rozbor" || zprava.id !== idRozboru) return;
    rozbor = zprava.rozbor;
    if (rozbor?.stabilni) posledniZnamyRozbor = rozbor;
    obnovOsuFrekvenci();
    obnovAnalyzu();
    obnovNapinak();
    obnovLadeniTlumice();
    oznacSlozeni();
    platno.prekresli();
  });

  const ulozeny = uloziste.navrh(uroven.id);
  let naposledUlozeny: NavrhMostu | null = ulozeny ?? null;
  const editor = new Editor(uroven, ulozeny ?? prazdnyNavrh(uroven.id), poZmeneNavrhu);
  // Výchozí stav výkresu není úprava: bez toho by první klik mimo kreslení (výběr, nástroj)
  // zapsal do deníku změnu stavby, která se nestala.
  naposledUlozeny = editor.navrh;
  {
    const medaile = uloziste.rekord(uroven.id)?.medaile;
    zapis("uroven.otevrena", {
      navrh: ulozeny !== undefined && ulozeny.pruty.length > 0,
      prutu: ulozeny?.pruty.length ?? 0,
      medaili: medaile ? Number(medaile.pruchod) + Number(medaile.rozpocet) + Number(medaile.mistrovska) : 0,
    });
    predOdchodem(() => {
      const ted = uloziste.rekord(uroven.id)?.medaile;
      zapis("uroven.opustena", {
        sekund: sekundVUrovni(),
        zkousek: zkousekVUrovni,
        prutu: editor.navrh.pruty.length,
        medaili: ted ? Number(ted.pruchod) + Number(ted.rozpocet) + Number(ted.mistrovska) : 0,
      });
    });
  }

  /** Složky síly kroku lidí úrovně (krok a jeho násobky): zadání se nemění, počítají se jednou. */
  const slozkyLidi = slozkyKroku(uroven);
  /**
   * Kam sahá osa frekvencí a rezonanční křivka: na celý hertz za nejvyšší složku kroku lidí
   * úrovně (s malým okrajem, ať značka neleží na konci osy), nejmíň do 6 Hz. Vlastní
   * frekvence nad tím žádný rytmus lidí nebudí.
   */
  const ROZSAH_OSY = Math.min(ROZSAH_FREKVENCI, Math.max(NEJMENSI_ROZSAH_OSY, Math.ceil(nejvyssiSlozka(slozkyLidi) + OKRAJ_OSY)));

  // ---- Výkres ----

  const platno = new Platno(canvas, kresli, () => {
    // Běžící záběr by se vrátil do pohledu spočítaného pro staré plátno: končí hned. Záběr,
    // který se teprve hledá nebo čeká, zůstává (na telefonu se plátno zvětší hned po spuštění
    // zkoušky, když se schová paleta).
    if (beh?.zaber.stav === "pripraven" && beh.zaber.domov) zrusZaber();
    if (pohledJeVychozi) kamera = pohledNaCelyVykres();
    obnovPohled();
    uhniAnalyzou();
  });

  function pohledNaCelyVykres(): Kamera {
    return celyVyrez(uroven.vyrez, platno.rozmer, OKRAJ_VYKRESU);
  }

  /** Platí obálka namáhání z poslední zkoušky pro návrh, který je právě na výkresu? */
  function platnaObalka(): VysledekZkousky | null {
    return beh !== null && !beh.pokus && beh.vysledek !== null && beh.navrh === editor.navrh ? beh.vysledek : null;
  }

  /**
   * Obálka namáhání, kterou má vidět stavba: co most nesl, dokud byl celý. Po prvním porušení
   * se pruty namáhají pádem; s těmi čísly by po návratu ke stavbě svítila červeně půlka mostu
   * a nebylo by poznat, co povolilo první.
   */
  function obalkaStavby(): VysledekZkousky["obalka"] | null {
    const vysledek = platnaObalka();
    return vysledek ? (vysledek.obalkaDoPoruseni ?? vysledek.obalka) : null;
  }

  /** Spodní vrstva výkresu uložená pro přehrávání zkoušky. */
  const spodekVykresu = new UlozenaVrstva();

  function kresli(ctx: CanvasRenderingContext2D, rozmer: { sirka: number; vyska: number }): void {
    if (rezim === "zkouska" && beh) {
      const cas = prehravani.cas;
      // Loď, která do mostu narazila, se od té chvíle kreslí barvou varování.
      const { odemceno, narazene } = stavPohybu(beh.udalosti, cas);
      // Rastr, voda a terén se při přehrávání nemění: kreslí se jednou a pak se přenášejí.
      const stav = { uroven, kamera, rozmer, kurzor: null, cas, narazeneLode: narazene };
      spodekVykresu.nakresli(ctx, rozmer, `${kamera.x};${kamera.y};${kamera.meritko}`, (kam) => nakresliSpodekVykresu(kam, stav));
      nakresliVrsekVykresu(ctx, stav);
      const stavba = beh.zaznam.stavV(prehravani.cas, snimek);
      if (stavba) {
        // Celý most se kreslí se zvětšeným svislým pohybem: skutečné kmitání je zlomek pixelu.
        const kresleny = zvetsenySnimek(beh, stavba);
        if (beh.oznaceny !== null) zvyrazniPrut(ctx, stavba, beh.oznaceny);
        // Pruty mají při zkoušce stejnou tloušťku jako při stavbě.
        const pruty = beh.navrh.pruty;
        nakresliKonstrukci(
          ctx,
          kamera,
          rozmer,
          stavba,
          kresleny,
          0,
          (e) => {
            const prut = pruty[stavba.prut[e]!];
            return prut ? tloustkaPrutu(prut.prvek, kamera.meritko) : undefined;
          },
          (e) => pruty[stavba.prut[e]!]?.prvek === "kolejiste",
          (e) => valecPrutu(beh!.navrh, stavba.prut[e]!),
          // Šipky zkoušky do zlomu jsou zatížení na metr mostovky, ne síla.
          beh.zlom ? "kN/m" : "kN",
        );
        nakresliZamkyZaznamu(ctx, kamera, rozmer, beh.navrh, kresleny, odemceno);
        nakresliProvoz(ctx, kamera, rozmer, beh.ucastnici, kresleny, beh.efekty.pady);
        // Efekty pádu: trosky v místě zlomu a šplouchnutí toho, co dopadlo do vody.
        const efekty = beh.efekty;
        if (efekty.udalosti < beh.udalosti.length) {
          efekty.udalosti = najdiZlomy(beh.zaznam, beh.udalosti, efekty.udalosti, efekty.zlomy);
          efekty.pady = casyPadu(beh.udalosti, beh.ucastnici);
        }
        nakresliTrosky(ctx, kamera, rozmer, efekty.zlomy, cas);
        if (uroven.hladina !== null) {
          efekty.snimku = najdiSplouchnuti(beh.zaznam, uroven.hladina, efekty.snimku, efekty.splouchnuti);
          nakresliSplouchnuti(ctx, kamera, rozmer, uroven.hladina, efekty.splouchnuti, cas);
        }
        // Čísla využití se kreslí přes vozidla: vlak je delší než most a zakrýval by je celou jízdu.
        if (cisla) nakresliCislaVyuziti(ctx, cislaZeSnimku(stavba, pruty));
        // Zpomalený záběr na první porušení: ztmavené okolí, značka a popisek.
        const zab = beh.zaber;
        if (zab.stav === "pripraven" && zab.domov && zab.mira > 0) {
          // Vozidla jsou neprůhledná a prut, o který jde, by zakryla: jeho osa se kreslí znovu navrch.
          if (zab.prut !== null) zvyrazniOsuPrutu(ctx, stavba, zab.prut, zab.mira);
          const dotyk = window.matchMedia?.("(pointer: coarse)").matches ?? false;
          // Hlášení nad výkresem (věta záběru) zabírá horní kus plátna: popisek značky se mu vyhne.
          const vrch = poleHlaseni.textContent ? Math.max(0, poleHlaseni.getBoundingClientRect().bottom - canvas.getBoundingClientRect().top) : 0;
          nakresliZaber(ctx, kamera, rozmer, {
            misto: zab.misto,
            rozsah: zab.zaber.rozsah,
            mira: zab.mira,
            popis: zab.popis,
            rada: t(dotyk ? "zaber.preskocit.dotyk" : "zaber.preskocit"),
            vrch,
          });
        }
        return;
      }
    } else {
      nakresliVykres(ctx, { uroven, kamera, rozmer, kurzor });
    }
    // Stavba, nebo zkouška, ze které ještě nedorazil první snímek.
    const stavi = rezim === "stavba";
    const svet = stavi && mistoKurzoru ? obrazNaSvet(kamera, rozmer, mistoKurzoru) : null;
    const obalka = obalkaStavby();
    nakresliNavrh(ctx, kamera, rozmer, {
      navrh: stavi ? navrhVPohybu() : editor.navrh,
      vybranePruty: editor.vybranePruty,
      vybraneStycniky: editor.vybraneStycniky,
      tah: stavi ? editor.tah : null,
      zacatek: svet && nastroj === "kresleni" ? editor.mistoZacatku(svet) : null,
      problemy: prekazkyZkousky(editor.navrh, uroven),
      obalka: obalka?.map((o) => ({ vyuziti: o.vyuziti, tah: o.zpusob === ZPUSOB_TAH })) ?? null,
    });
    if (cisla && obalka && !editor.tah) nakresliCislaVyuziti(ctx, cislaZObalky(obalka.map((o) => o.vyuziti)));
    if (brnk) nakresliBrnknuti(ctx, brnk);
    const obrysNapovedy = stavi ? (napoveda?.obrys ?? null) : null;
    if (obrysNapovedy) nakresliObrys(ctx, obrysNapovedy);
    if (stavi && !editor.tah) {
      // Most, který by se složil vlastní vahou: značka, kde a proč. Při tažení prutu nepřekáží.
      const nalez = nalezStavby();
      if (nalez.slozeni) nakresliSlozeni(ctx, kamera, rozmer, nalez.slozeni.misto, t("slozeni.nadpis"), kratceOSlozeni(nalez.slozeni));
      else if (nalez.volny) {
        nakresliSlozeni(ctx, kamera, rozmer, nalez.volny.misto, t("volny.nadpis"), t("volny.kratce", { prut: nalez.volny.prut + 1 }));
      }
      // Po zkoušce, která neprošla: kde to povolilo první. Zůstává do první úpravy mostu.
      else if (posledniPorucha && posledniPorucha.navrh === editor.navrh) {
        nakresliSlozeni(ctx, kamera, rozmer, posledniPorucha.misto, t("stavba.porucha.nadpis"), posledniPorucha.popis);
      } else {
        // Most, který stojí, ale už vlastní vahou visí hluboko pod výkresem (nedopnutá lana).
        const pruves = pruvesStavby();
        if (pruves) {
          const nadpis = t(pruves.nad ? "pruves.nadpis.nad" : "pruves.nadpis", { mm: celeCislo(Math.round(1000 * pruves.metru)) });
          nakresliSlozeni(ctx, kamera, rozmer, pruves.misto, nadpis, t(pruves.nad ? "pruves.rada.nad" : "pruves.rada"));
        }
      }
    }
  }

  /** Obrys mostu z nápovědy: tečkované čáry, kudy vedou jeho pruty, a kroužky ve styčnících. */
  function nakresliObrys(ctx: CanvasRenderingContext2D, most: NavrhMostu): void {
    const podleId = new Map(most.stycniky.map((s) => [s.id, s]));
    ctx.save();
    ctx.lineCap = "butt";
    // Tmavý podklad pod čárkami: obrys je pak vidět i na hranici zakázané zóny a přes šrafy.
    const cary = (): void => {
      ctx.beginPath();
      for (const p of most.pruty) {
        const a = podleId.get(p.a);
        const b = podleId.get(p.b);
        if (!a || !b) continue;
        const od = bodNavrhu(a);
        const po = bodNavrhu(b);
        ctx.moveTo(od.x, od.y);
        ctx.lineTo(po.x, po.y);
      }
      ctx.stroke();
    };
    ctx.strokeStyle = "rgb(8 32 68 / 0.75)";
    ctx.lineWidth = 6;
    cary();
    ctx.strokeStyle = "rgb(255 255 255 / 0.8)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    cary();
    ctx.setLineDash([]);
    ctx.lineWidth = 1.5;
    for (const st of most.stycniky) {
      const misto = bodNavrhu(st);
      ctx.beginPath();
      ctx.arc(misto.x, misto.y, 5, 0, 2 * Math.PI);
      ctx.stroke();
    }
    // Co se z čar vyčíst nedá: přídavky ve styčnících a zdvih pístů.
    const popisek = (text: string, x: number, y: number): void => {
      const sirka = ctx.measureText(text).width;
      ctx.fillStyle = "rgb(8 32 68 / 0.85)";
      ctx.fillRect(x - 3, y - 7, sirka + 6, 14);
      ctx.fillStyle = "rgb(255 255 255 / 0.9)";
      ctx.fillText(text, x, y);
    };
    ctx.font = `10px ${PISMO}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (const st of most.stycniky) {
      const casti: string[] = [];
      if (st.svar) casti.push(t("napoveda.obrys.svar"));
      if (st.zamek) casti.push(t("napoveda.obrys.zamek"));
      if (st.zavazi) casti.push(t("napoveda.obrys.zavazi", { kg: celeCislo(st.zavazi) }));
      if (st.tlumic) casti.push(t("napoveda.obrys.tlumic", { kg: celeCislo(st.tlumic.hmota) }));
      if (casti.length === 0) continue;
      const misto = bodNavrhu(st);
      popisek(casti.join(" · "), misto.x + 9, misto.y - 12);
    }
    for (const p of most.pruty) {
      if (KATALOG[p.prvek].druh !== "pist") continue;
      const a = podleId.get(p.a);
      const b = podleId.get(p.b);
      if (!a || !b) continue;
      const od = bodNavrhu(a);
      const po = bodNavrhu(b);
      const zdvih = zdvihPistu(p.zdvih, Math.hypot(b.x - a.x, b.y - a.y));
      popisek(
        t("napoveda.obrys.pist", { zdvih: `${zdvih > 0 ? "+" : zdvih < 0 ? "−" : ""}${cislo(Math.abs(zdvih), 1)}` }),
        (od.x + po.x) / 2 + 9,
        (od.y + po.y) / 2,
      );
    }
    ctx.restore();
  }

  /** Síla brnknutí v newtonech podle toho, jak daleko hráč styčník stáhl. */
  /**
   * Návrh tak, jak se má právě nakreslit: když se předvádí tvar kmitání, jsou jeho styčníky
   * vychýlené podle tvaru a houpají se. Rozbor patří právě tomuto návrhu; po každé úpravě
   * se zahodí a spočítá znovu.
   */
  function navrhVPohybu(): NavrhMostu {
    const navrh = editor.navrh;
    const tvar = tvarKmitani !== null ? rozbor?.tvary[tvarKmitani] : undefined;
    if (!tvar || tvar.length !== 2 * navrh.stycniky.length || editor.tah) return navrh;
    const trasa = uroven.trasy[0];
    const rozpeti = trasa ? trasa.konec.x - trasa.zacatek.x : 20;
    const amplituda = Math.max(0.35, Math.min(1.5, VYCHYLKA_ANIMACE * rozpeti));
    const vychylka = amplituda * Math.sin((2 * Math.PI * FREKVENCE_ANIMACE * performance.now()) / 1000);
    return {
      ...navrh,
      stycniky: navrh.stycniky.map((st, i) => ({ ...st, x: st.x + vychylka * tvar[2 * i]!, y: st.y + vychylka * tvar[2 * i + 1]! })),
    };
  }

  function silaBrnknuti(b: { od: Bod; k: Bod }): number {
    const metru = Math.max(0, b.k.y - b.od.y) / kamera.meritko;
    return Math.min(NEJVETSI_BRNKNUTI, metru * SILA_NA_METR);
  }

  /** Šipka tahu od styčníku dolů s velikostí síly. */
  function nakresliBrnknuti(ctx: CanvasRenderingContext2D, b: { stycnik: number; od: Bod; k: Bod }): void {
    const st = editor.navrh.stycniky[b.stycnik];
    if (!st) return;
    const pata = bodNavrhu(st);
    const delka = Math.max(0, b.k.y - b.od.y);
    if (delka < 4) return;
    const hrot = { x: pata.x, y: pata.y + delka };
    ctx.save();
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(pata.x, pata.y);
    ctx.lineTo(hrot.x, hrot.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hrot.x, hrot.y + 2);
    ctx.lineTo(hrot.x - 6, hrot.y - 9);
    ctx.lineTo(hrot.x + 6, hrot.y - 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** Poloha styčníku návrhu na plátně. */
  function bodNavrhu(stycnik: { x: number; y: number }): Bod {
    return svetNaObraz(kamera, platno.rozmer, stycnik);
  }

  /** Čísla využití pro stavbu: největší využití každého prutu z poslední zkoušky. */
  function cislaZObalky(vyuziti: readonly number[]): CisloVyuziti[] {
    const navrh = editor.navrh;
    const podleId = new Map(navrh.stycniky.map((st) => [st.id, st]));
    const polozky: CisloVyuziti[] = [];
    navrh.pruty.forEach((prut, poradi) => {
      const a = podleId.get(prut.a);
      const b = podleId.get(prut.b);
      if (a && b) polozky.push({ a: bodNavrhu(a), b: bodNavrhu(b), vyuziti: vyuziti[poradi] ?? 0 });
    });
    return polozky;
  }

  /**
   * Čísla využití pro přehrávání: u každého prutu návrhu největší okamžité využití jeho
   * prvků. Číslo sedí mezi koncovými styčníky prutu, takže po prutu neposkakuje, i když je
   * uvnitř rozdělený na víc dílů.
   */
  function cislaZeSnimku(stavba: Topologie, pruty: readonly { a: number; b: number }[]): CisloVyuziti[] {
    const nejvetsi = new Float32Array(pruty.length);
    for (let e = 0; e < stavba.prvekA.length; e++) {
      const prut = stavba.prut[e]!;
      if (prut < 0 || prut >= pruty.length || stavba.cara[e] === CARA_SKRYTA) continue;
      const vyuziti = Math.abs(snimek.vyuziti[e] ?? 0);
      if (vyuziti > nejvetsi[prut]!) nejvetsi[prut] = vyuziti;
    }
    // Styčníky návrhu jsou v soustavě první a ve stejném pořadí.
    const poradiStycniku = new Map(beh?.navrh.stycniky.map((st, i) => [st.id, i]) ?? []);
    // Které pruty číslo dostanou, určuje obálka celé zkoušky (jakmile je spočítaná), ne okamžik:
    // jinak popisky během jízdy přeskakují z prutu na prut.
    const obalka = beh?.vysledek?.obalka;
    const polozky: CisloVyuziti[] = [];
    pruty.forEach((prut, poradi) => {
      const a = poradiStycniku.get(prut.a);
      const b = poradiStycniku.get(prut.b);
      if (a === undefined || b === undefined) return;
      const polozka: CisloVyuziti = { a: bodSnimku(a), b: bodSnimku(b), vyuziti: nejvetsi[poradi]! };
      const zaZkousku = obalka?.[poradi]?.vyuziti;
      if (zaZkousku !== undefined) polozka.vaha = zaZkousku;
      polozky.push(polozka);
    });
    return polozky;
  }

  /** Podloží prut světlou září, aby šel při přehrávání najít. */
  function zvyrazniPrut(ctx: CanvasRenderingContext2D, stavba: Topologie, prut: number): void {
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(143, 208, 255, 0.6)";
    ctx.lineWidth = tloustkaPrutu(editor.navrh.pruty[prut]?.prvek ?? "drevo-lehke", kamera.meritko) + 10;
    ctx.beginPath();
    for (let e = 0; e < stavba.prvekA.length; e++) {
      if (stavba.prut[e] !== prut || stavba.cara[e] === CARA_SKRYTA) continue;
      const a = bodSnimku(stavba.prvekA[e]!);
      const b = bodSnimku(stavba.prvekB[e]!);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Osa prutu žlutou čárkovanou čarou přes všechno ostatní: v záběru je tak vidět i prut, přes
   * který zrovna jede auto. `mira` je průhlednost od 0 do 1.
   */
  function zvyrazniOsuPrutu(ctx: CanvasRenderingContext2D, stavba: Topologie, prut: number, mira: number): void {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, mira));
    ctx.lineCap = "butt";
    ctx.strokeStyle = BARVY.varovani;
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    for (let e = 0; e < stavba.prvekA.length; e++) {
      if (stavba.prut[e] !== prut || stavba.cara[e] === CARA_SKRYTA) continue;
      const a = bodSnimku(stavba.prvekA[e]!);
      const b = bodSnimku(stavba.prvekB[e]!);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Polohy styčníků, jak jsou právě nakreslené: skutečné, nebo se zvětšeným pohybem. */
  let kreslenePolohy: Float32Array | null = null;

  /** Poloha styčníku z právě zobrazeného snímku záznamu (jak je nakreslený), v pixelech plátna. */
  function bodSnimku(stycnik: number): Bod {
    const polohy = kreslenePolohy ?? snimek.polohy;
    return svetNaObraz(kamera, platno.rozmer, { x: polohy[2 * stycnik]!, y: polohy[2 * stycnik + 1]! });
  }

  /** Jak velký průhyb (m) má po zvětšení na výkresu vypadat: pár procent rozpětí. */
  function viditelnyPruhyb(): number {
    const trasa = uroven.trasy[0];
    const rozpeti = trasa ? Math.abs(trasa.konec.x - trasa.zacatek.x) : 20;
    return Math.max(0.3, Math.min(0.8, 0.02 * rozpeti));
  }

  /**
   * Kolikrát se u zkoušky `b` smí pohyb zvětšit: jen tam, kde jde o kmitání (úrovně s osou
   * frekvencí a pokusy), most zůstal celý a nezvedá se. Počítá se z celého záznamu, takže až
   * po doběhnutí výpočtu.
   */
  function spocitejZvetseni(b: Beh): number {
    if (!uroven.osaFrekvenci || b.zlom || uroven.pohyb || b.bezRovnovahy) return 1;
    const stavba = b.zaznam.topologie[0];
    const vychozi = klidovePolohy(b);
    if (!stavba || !vychozi || b.zaznam.topologie.length !== 1) return 1;
    let vychylka = 0;
    let zavazi = 0;
    for (const s of b.zaznam.snimky) {
      vychylka = Math.max(vychylka, nejvetsiVychylka(stavba, vychozi, s.polohy));
      zavazi = Math.max(zavazi, nejvetsiPohybZavazi(stavba, vychozi, s.polohy));
    }
    // Zvětšení určuje most; závaží laděného tlumiče ho jen omezí, aby nakreslené nevjelo do mostovky.
    const podleMostu = hezkeZvetseni(vychylka, viditelnyPruhyb());
    return zavazi > 0 ? Math.min(podleMostu, hezkeZvetseni(zavazi, MEZERA_ZAVAZI * LADENY_TLUMIC.zaves)) : podleMostu;
  }

  /**
   * Polohy, proti kterým se pohyb mostu zvětšuje: klidové. Zkouška v klidu začíná, takže je to
   * první snímek. Brnknutý most začíná vychýlený a klid je střed jeho kmitání: průměr poloh
   * přes celý záznam.
   */
  function klidovePolohy(b: Beh): Float32Array | undefined {
    const prvni = b.zaznam.snimky[0]?.polohy;
    if (!prvni || !b.pokus || b.zlom || b.budic) return prvni;
    b.klid ??= stredniPolohy(b.zaznam.snimky.filter((x) => x.topologie === 0).map((x) => x.polohy));
    return b.klid;
  }

  /**
   * Snímek ke kreslení: právě přehrávaný stav, u celého mostu se zvětšeným svislým pohybem
   * proti začátku zkoušky. Lidé a vozidla jdou s mostovkou, síly s místem, kde působí.
   */
  function zvetsenySnimek(b: Beh, stavba: Topologie): Snimek {
    kreslenePolohy = null;
    const nasobek = b.zvetseniTed;
    const vychozi = klidovePolohy(b);
    if (!(nasobek > 1) || !vychozi || snimek.topologie !== 0 || vychozi.length !== snimek.polohy.length) return snimek;
    b.zvetsene = zvetsiPohyb(stavba, vychozi, snimek.polohy, nasobek, b.zvetsene);
    kreslenePolohy = b.zvetsene;
    // Šipky sil (budič) míří do styčníku: posunou se s ním.
    let sily = snimek.sily;
    if (sily.length >= 4) {
      sily = sily.slice();
      for (let k = 0; k + 3 < sily.length; k += 4) {
        for (let i = 0; i < stavba.stycniku; i++) {
          if (Math.abs(snimek.polohy[2 * i]! - sily[k]!) < 1e-4 && Math.abs(snimek.polohy[2 * i + 1]! - sily[k + 1]!) < 1e-4) {
            sily[k + 1] = b.zvetsene[2 * i + 1]!;
            break;
          }
        }
      }
    }
    return { ...snimek, polohy: b.zvetsene, sily };
  }

  /** Tlačítko zvětšení pohybu v legendě: je vidět jen u zkoušky, kde je co zvětšovat. */
  function obnovZvetseni(): void {
    const b = rezim === "zkouska" ? beh : null;
    const nasobek = b?.zvetseni ?? 1;
    tlacitkoZvetseni.hidden = !(nasobek > 1);
    tlacitkoZvetseni.setAttribute("aria-pressed", String(zvetseniZapnuto));
    udaj("zvetseni").textContent = t("legenda.zvetseni", { nasobek: celeCislo(zvetseniZapnuto ? nasobek : 1) });
    // Bublina říká, co je vidět teď a co udělá kliknutí.
    const popis = zvetseniZapnuto ? t("legenda.zvetseni.popis") : t("legenda.zvetseni.popis.skutecne", { nasobek: celeCislo(nasobek) });
    tlacitkoZvetseni.title = popis;
    tlacitkoZvetseni.setAttribute("aria-label", popis);
    document.body.dataset.zvetseni = String(zvetseniZapnuto ? nasobek : 1);
  }

  /** Posune kreslené zvětšení o kus k cíli; vrací true, dokud se mění (je třeba překreslovat). */
  function posunZvetseni(b: Beh, uplynulo: number): boolean {
    const cil = zvetseniZapnuto ? b.zvetseni : 1;
    if (b.zvetseniTed === cil) return false;
    // Při omezeném pohybu skokem; jinak plynule, ať most neposkočí.
    const omezeno = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const krok = omezeno ? 1 : Math.min(1, uplynulo / DOBA_NABEHU_ZVETSENI);
    b.zvetseniTed += (cil - b.zvetseniTed) * krok;
    if (Math.abs(cil - b.zvetseniTed) < 0.01 * Math.max(cil, 1)) b.zvetseniTed = cil;
    return true;
  }

  /** Přepočítá vše, co závisí na kameře a kurzoru, a požádá o překreslení. */
  function obnovPohled(): void {
    kurzor = null;
    if (mistoKurzoru && rezim === "stavba") {
      const svet = obrazNaSvet(kamera, platno.rozmer, mistoKurzoru);
      const bod = { x: Math.round(svet.x), y: Math.round(svet.y) };
      if (jeUvnitr(uroven.vyrez, bod)) kurzor = bod;
    }
    poleMeritka.textContent = meritkoVykresu(kamera.meritko);
    poleSouradnic.textContent = kurzor
      ? t("souradnice.bod", { x: cislo(kurzor.x, 0), y: cislo(kurzor.y, 0) })
      : "";
    // Pro testy v prohlížeči: kde na plátně leží který bod světa.
    canvas.dataset.kamera = `${kamera.x};${kamera.y};${kamera.meritko}`;
    obnovRazitko();
    platno.prekresli();
  }

  /**
   * Popisové pole (razítko) v rohu výkresu zprůhlední, když v právě zvoleném pohledu zakrývá
   * kotvu, základ, konec trasy, plavební profil nebo styčník mostu: hráč má vidět, kam staví.
   */
  function obnovRazitko(): void {
    const razitko = prvek("#obrazovka-uroven .pole", HTMLElement);
    const r = razitko.getBoundingClientRect();
    const o = canvas.getBoundingClientRect();
    const okraj = 8;
    const podRazitkem = (b: Bod): boolean => {
      const x = o.left + o.width / 2 + (b.x - kamera.x) * kamera.meritko;
      const y = o.top + o.height / 2 - (b.y - kamera.y) * kamera.meritko;
      return x > r.left - okraj && x < r.right + okraj && y > r.top - okraj && y < r.bottom + okraj;
    };
    const body: Bod[] = [...uroven.kotvy, ...uroven.zaklady, ...editor.navrh.stycniky];
    for (const trasa of uroven.trasy) body.push(trasa.zacatek, trasa.konec);
    if (uroven.hladina !== null) {
      for (const lod of uroven.lode) body.push({ x: lod.xMax, y: uroven.hladina }, { x: lod.xMax, y: uroven.hladina + lod.vyska });
    }
    // Při zkoušce do zlomu je razítko průhledné vždy: šipky zátěže sahají nad most a pod ním
    // leží i údaj o zátěži v legendě.
    const zlom = rezim === "zkouska" && beh?.zlom === true;
    razitko.classList.toggle("pole--pruhledne", r.width > 0 && (zlom || body.some(podRazitkem)));
    // Razítko verdiktu sedí nad popisovým polem; kde by zakrylo konec mostu nebo podporu, zprůhlední.
    const verdikt = udaj("verdikt");
    const v = verdikt.getBoundingClientRect();
    const podVerdiktem = (b: Bod): boolean => {
      const x = o.left + o.width / 2 + (b.x - kamera.x) * kamera.meritko;
      const y = o.top + o.height / 2 - (b.y - kamera.y) * kamera.meritko;
      return x > v.left - okraj && x < v.right + okraj && y > v.top - okraj && y < v.bottom + okraj;
    };
    verdikt.classList.toggle("verdikt--pruhledny", v.width > 0 && body.some(podVerdiktem));
  }

  function zmenPohled(nova: Kamera): void {
    // Hráč si pohled během záběru vzal sám: záběr ho dál nevede ani nevrací. Pohled změněný
    // před záběrem je prostě nový výchozí.
    if (beh?.zaber.stav === "pripraven" && beh.zaber.domov) beh.zaber.pohled = false;
    kamera = omezNaVyrez(nova, uroven.vyrez, platno.rozmer);
    pohledJeVychozi = false;
    obnovPohled();
  }

  function zoomuj(kotva: Bod, faktor: number): void {
    // Oddálit lze nejvýš na celý výkres; na té mezi se pohled rovnou vystředí.
    const nejmensi = pohledNaCelyVykres().meritko;
    const nova = zoomKolem(kamera, platno.rozmer, kotva, faktor, nejmensi);
    if (nova.meritko <= nejmensi) ukazCelyVykres();
    else zmenPohled(nova);
  }

  function zoomujNaStred(faktor: number): void {
    zoomuj({ x: platno.rozmer.sirka / 2, y: platno.rozmer.vyska / 2 }, faktor);
  }

  function ukazCelyVykres(): void {
    if (beh?.zaber.stav === "pripraven" && beh.zaber.domov) beh.zaber.pohled = false;
    kamera = pohledNaCelyVykres();
    pohledJeVychozi = true;
    obnovPohled();
  }

  // ---- Hlášení ----

  function ukazHlaseni(text: string, druh: "varovani" | "info", docasne: boolean): void {
    window.clearTimeout(casovacHlaseni);
    poleHlaseni.textContent = text;
    poleHlaseni.dataset.druh = druh;
    if (docasne) casovacHlaseni = window.setTimeout(skryjHlaseni, DOBA_HLASENI);
  }

  function skryjHlaseni(): void {
    window.clearTimeout(casovacHlaseni);
    poleHlaseni.textContent = "";
  }

  function textDuvodu(duvod: DruhProblemu, prvekPrutu: IdPrvku | null): string {
    if (duvod === "prut-dlouhy") {
      return prvekPrutu
        ? t("duvod.prut-dlouhy", { prvek: nazevPrvku(prvekPrutu), delka: cislo(KATALOG[prvekPrutu].nejvetsiDelka, 0) })
        : t("duvod.prut-dlouhy.obecne");
    }
    return t(`duvod.${duvod}`);
  }

  /** Řekne, proč rozdělaný tah nepůjde dokončit; jinak hlášení o tahu skryje. */
  function hlasTah(): void {
    const tah = editor.tah;
    if (!tah || tah.druh === "obdelnik") return;
    const vMiste = tah.k.x === tah.od.x && tah.k.y === tah.od.y;
    if (tah.duvod && !vMiste) ukazHlaseni(textDuvodu(tah.duvod, tah.druh === "prut" ? editor.prvek : null), "varovani", false);
    else skryjHlaseni();
  }

  /**
   * Věta o největším namáhání prutu. Při stavbě z obálky do prvního porušení (co most nesl,
   * dokud byl celý), při zkoušce z celé: kliknutí na prut tam skáče do okamžiku, o kterém věta mluví.
   */
  function zapisObalky(vysledek: VysledekZkousky, prut: number, cela = false): string {
    const obalka = (cela ? vysledek.obalka : (vysledek.obalkaDoPoruseni ?? vysledek.obalka))[prut];
    // Píst nemá využití, ale sílu: říká se u něj, kolik nejvíc tlačil nebo táhl.
    const jePist = KATALOG[(beh?.navrh ?? editor.navrh).pruty[prut]?.prvek ?? "pruzina"].druh === "pist";
    if (obalka && jePist && obalka.zpusob !== ZPUSOB_ZADNY) {
      return t("obalka.pist", {
        prut: prut + 1,
        sila: `${cislo(Math.abs(obalka.velicina) / 1000, 0)} kN`,
        nejvic: `${cislo(PIST.nejvetsiSila / 1000, 0)} kN`,
        smer: t(obalka.velicina < 0 ? "obalka.pist.tlak" : "obalka.pist.tah"),
        cas: zapisCasu(obalka.cas),
      });
    }
    if (!obalka || obalka.zpusob === ZPUSOB_ZADNY || !(obalka.vyuziti > 0)) {
      return t("obalka.bezNamahani", { prut: prut + 1 });
    }
    return t("obalka.prut", {
      prut: prut + 1,
      vyuziti: procenta(obalka.vyuziti),
      zpusob: t(nazevZpusobu(obalka.zpusob)),
      cas: zapisCasu(obalka.cas),
    });
  }

  /**
   * Řádek s cenou a největší délkou („4 500 Kč/m · do 12 m“) se v úzké paletě zalamuje: číslo
   * se přitom nesmí odtrhnout od jednotky za ním ani od „do“ nebo „≤“ před ním.
   */
  function bezZlomuVCastech(text: string): string {
    return text.replace(/(\d) (?=[^\d\s·+])/g, "$1\u00a0").replace(/(≤|\bdo) (?=\d)/g, "$1\u00a0");
  }

  /** Cena prvku slovy: za metr nebo za kus, s největší délkou. */
  function zapisCenyPrvku(id: IdPrvku): string {
    const polozka = KATALOG[id];
    return "zaMetr" in polozka.cena
      ? t("paleta.cenaZaMetr", { cena: koruny(polozka.cena.zaMetr), delka: cislo(polozka.nejvetsiDelka, 0) })
      : t("paleta.cenaZaKus", { cena: koruny(polozka.cena.zaKus), delka: cislo(polozka.nejvetsiDelka, 0) });
  }

  /**
   * Položka jízdního řádu slovy: krátce pro lištu („0 s → 2× chodec“), nebo celou větou
   * pro okno se zadáním („2× chodec zleva, vyráží v čase 0 s“).
   */
  /** Kdo jede nebo jde: druh provozu s počtem, u vlaku se složením („dav, 120 lidí“). */
  function kdoJede(polozka: Uroven["jizdniRad"][number]): string {
    const klic = `provoz.${polozka.druh}`;
    const nazev = jeKlicTextu(klic) ? t(klic) : t("provoz.jiny");
    const pocet = polozka.pocet ?? 1;
    const skupina = lidiVRade(polozka.druh, uroven.sirkaMostovky) > 1 || polozka.druh === "bezecky-zavod";
    let kdo =
      polozka.druh === "utvar"
        ? t((polozka.kadence ?? 0) >= KADENCE_BEHU ? "provoz.utvar.beh.popis" : "provoz.utvar.popis", { pocet })
        : skupina
          ? t("provoz.skupina.popis", { kdo: nazev, pocet })
          : pocet > 1
            ? t("rad.vice", { pocet, kdo: nazev })
            : nazev;
    if (polozka.druh === "lokomotiva") {
      // Vlak: lokomotiva (nebo víc) a za ní skupiny vozů.
      const casti = [kdo];
      for (const skupina of polozka.vozy ?? []) {
        const vuz = t(`provoz.${skupina.druh}`);
        casti.push(skupina.pocet > 1 ? t("rad.vice", { pocet: skupina.pocet, kdo: vuz }) : vuz);
      }
      kdo = t("provoz.vlak", { slozeni: casti.join(", ") });
    }
    return kdo;
  }

  function zapisJizdy(polozka: Uroven["jizdniRad"][number], vetou = false): string {
    let kdo = kdoJede(polozka);
    // Kde se hraje o rezonanci, patří ke každému člověku i frekvence jeho kroku.
    const rytmus = jeClovek(polozka.druh) ? rytmusLidi(polozka.druh, polozka.kadence) : null;
    if (uroven.osaFrekvenci && rytmus) {
      const klicRytmu =
        polozka.druh === "skakajici-dav" ? "provoz.skoky" : rytmus.rozptyl > 0 ? "provoz.krokKolem" : "provoz.krok";
      kdo = t(klicRytmu, { kdo, f: cislo(rytmus.f, 1) });
    }
    // U vozidel patří k zadání i to, co není obvyklé: jiná rychlost a brzdění na mostě.
    if (polozka.rychlost !== undefined && !jeClovek(polozka.druh)) {
      kdo = t("provoz.rychlost", { kdo, rychlost: cislo(3.6 * polozka.rychlost, 0) });
    }
    const brzdi = polozka.brzdeni !== undefined && umiBrzdit(polozka.druh);
    const stani = polozka.brzdeni ? cislo(polozka.brzdeni.stani, Number.isInteger(polozka.brzdeni.stani) ? 0 : 1) : "";
    const cas = cislo(polozka.cas, Number.isInteger(polozka.cas) ? 0 : 1);
    if (vetou) {
      const odkud = t(polozka.smer === 1 ? "zadani.provoz.zleva" : "zadani.provoz.zprava");
      const veta = t("zadani.provoz.polozka", { kdo, odkud, cas });
      return brzdi ? t("zadani.provoz.brzdi", { veta, stani }) : veta;
    }
    const kratce = t("rad.polozka", { cas, smer: polozka.smer === 1 ? "→" : "←", kdo });
    return brzdi ? t("rad.brzdi", { polozka: kratce }) : kratce;
  }

  // ---- Stavba ----

  function vytvorPaletu(): void {
    paletaPrvku.replaceChildren(
      ...uroven.povolenePrvky.map((id, poradi) => {
        const polozka = KATALOG[id];
        const tlacitko = document.createElement("button");
        tlacitko.type = "button";
        tlacitko.className = "paleta__tlacitko paleta__tlacitko--prvek";
        tlacitko.dataset.prvek = id;
        tlacitko.disabled = !polozka.hotovo;
        const klavesa = document.createElement("kbd");
        klavesa.textContent = String(poradi + 1);
        const nazev = document.createElement("span");
        nazev.className = "paleta__nazev";
        nazev.textContent = nazevPrvku(id);
        const cena = document.createElement("span");
        cena.className = "paleta__cena";
        cena.textContent = bezZlomuVCastech(zapisCenyPrvku(id));
        const ukazka = document.createElement("span");
        ukazka.className = "paleta__ukazka";
        ukazka.style.height = `${Math.round(tloustkaPrutu(id, 30))}px`;
        tlacitko.append(klavesa, nazev, ukazka, cena);
        tlacitko.addEventListener("click", () => zvolPrvek(id));
        return tlacitko;
      }),
      // Přídavky se nekreslí tahem: klik na položku, pak na styčník nebo lano, kam patří.
      ...pridavky.map((ktery, poradi) => {
        const tlacitko = document.createElement("button");
        tlacitko.type = "button";
        tlacitko.className = "paleta__tlacitko paleta__tlacitko--prvek";
        tlacitko.dataset.pridavek = ktery;
        tlacitko.title = t(`paleta.${ktery}.prvek.popis`);
        const klavesa = document.createElement("kbd");
        klavesa.textContent = String(uroven.povolenePrvky.length + poradi + 1);
        const nazev = document.createElement("span");
        nazev.className = "paleta__nazev";
        nazev.textContent = t(`paleta.${ktery}.nazev`);
        const cena = document.createElement("span");
        cena.className = "paleta__cena";
        cena.textContent = bezZlomuVCastech(
          ktery === "ladeny"
            ? t("paleta.ladeny.cena", {
                zaKus: koruny(LADENY_TLUMIC.cenaZaKus),
                zaKg: koruny(LADENY_TLUMIC.cenaZaKg),
                kg: cislo(uroven.nejvetsiTlumic, 0),
              })
            : ktery === "zavazi"
              ? t("paleta.zavazi.cena", { zaKg: koruny(CENA_ZAVAZI), kg: cislo(uroven.nejvetsiZavazi, 0) })
              : ktery === "svar"
                ? t("paleta.svar.cena", { zaPrut: koruny(CENA_SVARU) })
                : ktery === "zamek"
                  ? t("paleta.zamek.cena", { zaKus: koruny(ZAMEK.cena) })
                  : t("paleta.napinak.cena"),
        );
        tlacitko.append(klavesa, nazev, cena);
        tlacitko.addEventListener("click", () => prepniPridavek(ktery));
        return tlacitko;
      }),
    );
  }

  /**
   * Zapne nebo vypne přidávání přídavku kliknutím. Svar a zámek se se styčníky, které hráč
   * vybral nástrojem Výběr, rovnou provedou na nich (tak se dá svařit celý most najednou) a
   * nástroj se nemění. Výběr, který po sobě nechal jiný přídavek (naposledy svařený styčník),
   * se k tomu nepoužije: zámek by jinak skončil tam, kam hráč před chvílí klikl svarem.
   */
  function prepniPridavek(ktery: Pridavek): void {
    if (rezim !== "stavba" || !pridavky.includes(ktery)) return;
    const vlastniVyber = !jePridavek(nastroj) && editor.vybraneStycniky.size > 0;
    if (ktery === "svar" && vlastniVyber) {
      prepniSvar();
      return;
    }
    if (ktery === "zamek" && vlastniVyber) {
      prepniZamek();
      return;
    }
    if (ktery === "napinak" && nastroj !== "napinak" && editor.pocetLan === 0) {
      ukazHlaseni(t("paleta.napinak.bezLan"), "info", true);
      return;
    }
    nastroj = nastroj === ktery ? "kresleni" : ktery;
    editor.zrusTah();
    // Napínák nechá vybraná lana vybraná: jejich nastavení je hned po ruce.
    if (!(nastroj === "napinak" && editor.predpetiVyberu !== null)) editor.zrusVyber();
    if (nastroj === ktery) ukazHlaseni(t(`paleta.${ktery}.navod`), "info", false);
    else skryjHlaseni();
    obnovStavbu();
  }

  /** Kliknutí při přidávání přídavku: vybere styčník nebo lano a přidá mu, co ještě nemá. */
  function povesPridavek(ktery: Pridavek, bod: Bod): void {
    editor.posledniDuvod = null;
    if (ktery === "napinak") {
      const prut = editor.prutU(bod);
      const lano = prut === null ? undefined : editor.navrh.pruty.find((p) => p.id === prut);
      if (lano && KATALOG[lano.prvek].druh === "lano") {
        skryjHlaseni();
        editor.vyberJenPrut(lano.id);
      } else {
        editor.zrusVyber();
        ukazHlaseni(t("paleta.napinak.navod"), "info", false);
      }
      obnovStavbu();
      return;
    }
    const id = editor.stycnikU(bod);
    if (id === null) {
      editor.zrusVyber();
      // Svar a zámek patří do styčníku mostu; na prázdném místě (i na prázdné opěře) není kam.
      if (ktery === "svar" || ktery === "zamek") ukazHlaseni(t("paleta.pridavek.bezStycniku"), "info", true);
      obnovStavbu();
      return;
    }
    skryjHlaseni();
    editor.vyberJenStycnik(id);
    if (ktery === "svar") editor.prepniSvar();
    else if (ktery === "zamek") editor.prepniZamek();
    else if (ktery === "ladeny") {
      if (editor.ladenyTlumicVyberu === undefined) zavesLadenyTlumic();
    } else if (editor.zavaziVyberu === 0) {
      // Nové závaží začíná na hmotnosti, kterou hráč nastavil naposledy: stejná závaží v řadě
      // styčníků jsou pak po jednom kliknutí.
      editor.nastavZavaziVyberu(posledniZavazi);
    }
    obnovStavbu();
  }

  /** Klávesa S a tlačítko v nastavení: svaří vybrané styčníky, nebo jim svar zruší. */
  function prepniSvar(): void {
    if (rezim !== "stavba" || !uroven.povoleneSvary) return;
    if (editor.svarVyberu === null) prepniPridavek("svar");
    else if (editor.prepniSvar()) skryjHlaseni();
  }

  /** Tlačítko v nastavení: dá vybraným styčníkům dělicí zámek, nebo jim ho odebere. */
  function prepniZamek(): void {
    if (rezim !== "stavba" || !uroven.pohyb) return;
    if (editor.zamekVyberu === null) prepniPridavek("zamek");
    else if (editor.prepniZamek()) skryjHlaseni();
  }

  /**
   * Požádá pomocné vlákno o automatické dopnutí lan. Bez lan nebo s mostem, který porušuje
   * pravidla, poradí, co chybí.
   */
  function dopniLana(): void {
    // Dokud se jedno dopnutí počítá, další žádost by jen čekala za ním ve stejném vlákně.
    if (rezim !== "stavba" || !smiLana || dopinani) return;
    if (editor.pocetLan === 0) {
      ukazHlaseni(t("dopnuti.bezLan"), "info", true);
      return;
    }
    const prekazka = prekazkyZkousky(editor.navrh, uroven).filter((p) => p.druh !== "nad-rozpocet")[0];
    if (prekazka) {
      ukazHlaseni(textDuvodu(prekazka.druh, null), "varovani", true);
      return;
    }
    editor.zrusTah();
    idDopnuti += 1;
    dopinani = { id: idDopnuti, navrh: editor.navrh };
    document.body.dataset.dopnuti = "pocita";
    ukazHlaseni(t("dopnuti.pocitaSe"), "info", false);
    pomocny.posli({ typ: "dopnuti", id: idDopnuti, uroven, navrh: editor.navrh });
    obnovStavbu();
  }

  /** Výsledek dopnutí z pomocného vlákna. Platí jen pro návrh, který se od žádosti nezměnil. */
  function prijmiDopnuti(id: number, vysledek: DopnutiLan | null): void {
    if (!dopinani || dopinani.id !== id) return;
    const puvodni = dopinani.navrh;
    dopinani = null;
    if (rezim !== "stavba" || editor.navrh !== puvodni) {
      zapis("dopnuti", { vysledek: "zahozeno" });
      document.body.dataset.dopnuti = "zahozeno";
      // Hlášení „Dopínám lana…“ zmizí; během zkoušky už na liště může být něco jiného.
      if (rezim === "stavba") skryjHlaseni();
      obnovStavbu();
      return;
    }
    if (!vysledek) {
      zapis("dopnuti", { vysledek: "nejde" });
      document.body.dataset.dopnuti = "nejde";
      ukazHlaseni(t("dopnuti.nejde"), "varovani", true);
      obnovStavbu();
      return;
    }
    editor.nastavPredpetiLan(new Map(vysledek.predpeti));
    zapis("dopnuti", {
      vysledek: vysledek.po > 0.02 ? "zbylo" : "hotovo",
      predMm: Number.isFinite(vysledek.pred) ? Math.round(1000 * vysledek.pred) : null,
      poMm: Math.round(10000 * vysledek.po) / 10,
      lan: vysledek.predpeti.length,
    });
    document.body.dataset.dopnuti = "hotovo";
    document.body.dataset.dopnutiOdchylka = (1000 * vysledek.po).toFixed(1);
    const mm = (metry: number): string => cislo(1000 * metry, metry < 0.01 ? 1 : 0);
    // Odchylka přes dva centimetry znamená, že lana nakreslený tvar splnit neumějí: buď by
    // musela nést víc, než bezpečně unesou (nosné lano je moc rovné), nebo jim tvar nesedí.
    if (vysledek.po > 0.02 && vysledek.tah >= NEJVETSI_KLIDOVY_TAH - 0.02) {
      ukazHlaseni(t("dopnuti.pretizeno", { po: mm(vysledek.po), podil: procenta(vysledek.tah) }), "varovani", false);
    } else if (vysledek.po > 0.02) ukazHlaseni(t("dopnuti.zbylo", { po: mm(vysledek.po) }), "varovani", false);
    else {
      ukazHlaseni(
        Number.isFinite(vysledek.pred)
          ? t("dopnuti.hotovo", { pred: mm(vysledek.pred), po: mm(vysledek.po) })
          : t("dopnuti.hotovo.bezPred", { po: mm(vysledek.po) }),
        "info",
        false,
      );
    }
    obnovStavbu();
  }

  /**
   * Nastavení napínáku vybraných lan: o kolik je lano dotažené nebo povolené a jaký tah
   * v něm je pod vlastní tíhou mostu (z rozboru; dokud se počítá, tah se neuvádí).
   */
  function obnovNapinak(): void {
    const predpeti = rezim === "stavba" ? editor.predpetiVyberu : null;
    prvek('[data-nastaveni="predpeti"]', HTMLElement).hidden = predpeti === null;
    if (predpeti === null) {
      delete document.body.dataset.predpeti;
      return;
    }
    const zapisZkraceni = (metry: number): string => {
      const mm = Math.round(1000 * metry);
      if (mm > 0) return t("paleta.napinak.dotazeno", { mm: cislo(mm, 0) });
      return mm < 0 ? t("paleta.napinak.povoleno", { mm: cislo(-mm, 0) }) : t("paleta.napinak.nula");
    };
    const zapis = zapisZkraceni(predpeti.zkraceni);
    const zapisOd = zapisZkraceni(predpeti.nejmensiZkraceni);
    udaj("predpeti").textContent =
      predpeti.ruzne && zapisOd !== zapis ? t("paleta.napinak.ruzne", { od: zapisOd, do: zapis }) : zapis;
    document.body.dataset.predpeti = predpeti.predpeti.toFixed(3);

    // Tah v klidu: největší z vybraných lan a kolik je to z pevnosti.
    let text = t("paleta.napinak.tah.pocitaSe");
    if (rozbor === null || (rozbor && !rozbor.stabilni)) text = t("paleta.napinak.tah.bezKlidu");
    else if (rozbor) {
      let nejvetsi = -1;
      let podil = 0;
      editor.navrh.pruty.forEach((p, poradi) => {
        const tah = rozbor?.tahyLan[poradi];
        if (!editor.vybranePruty.has(p.id) || tah === null || tah === undefined || tah <= nejvetsi) return;
        nejvetsi = tah;
        podil = tah / (vlastnostiPrutu(p.prvek, uroven.sirkaMostovky)?.unosnost.tah ?? Infinity);
      });
      if (nejvetsi >= 0) {
        text =
          nejvetsi > 0
            ? t(podil > 1 ? "paleta.napinak.tah.pretizeno" : "paleta.napinak.tah", { kN: cislo(nejvetsi / 1000, 0), podil: procenta(podil) })
            : t("paleta.napinak.tah.visi");
        document.body.dataset.tahLana = (nejvetsi / 1000).toFixed(1);
      }
    }
    udaj("predpeti-tah").textContent = text;
  }

  function zvolPrvek(id: IdPrvku): void {
    if (rezim !== "stavba" || !KATALOG[id].hotovo) return;
    // Z nástroje přídavku (napínák, svar…) se jde kreslit; jeho výběr se na nový prvek nemění
    // a jeho návod už neplatí.
    if (jePridavek(nastroj)) {
      editor.zrusVyber();
      skryjHlaseni();
    }
    nastroj = "kresleni";
    editor.zvolPrvek(id);
    if (editor.posledniDuvod) ukazHlaseni(textDuvodu(editor.posledniDuvod, id), "varovani", true);
    obnovStavbu();
  }

  /** Volá editor po každé změně návrhu, výběru nebo rozdělaného tahu. */
  function poZmeneNavrhu(): void {
    obnovRazitko();
    oznacPoruchu();
    if (editor.navrh !== naposledUlozeny) {
      naposledUlozeny = editor.navrh;
      uloziste.ulozNavrh(editor.navrh);
      naplanujRozbor();
      zapisUpravu();
    }
    obnovStavbu();
  }

  /** Zapíše do deníku, čím se most právě změnil a jak teď vypadá. */
  function zapisUpravu(): void {
    upravOdZkousky += 1;
    const navrh = editor.navrh;
    const data: { [klic: string]: HodnotaDeniku } = {
      co: editor.posledniAkce || "jine",
      prutu: navrh.pruty.length,
      stycniku: navrh.stycniky.length,
      cena: cenaNavrhu(navrh),
    };
    const prut = editor.posledniPrut;
    if (prut && editor.posledniAkce === "prut") {
      data.prvek = prut.prvek;
      data.od = [prut.od.x, prut.od.y];
      data.k = [prut.k.x, prut.k.y];
      // Dlouhý tah rozdělený na díly: kolik prutů z něj vzniklo.
      if (prut.dilu) data.dilu = prut.dilu;
    }
    zapis("stavba.zmena", data);
  }

  /** Po úpravě návrhu požádá s malou prodlevou o nový rozbor mostu (osa frekvencí, tahy lan). */
  function naplanujRozbor(): void {
    // Rozbor běží v každé úrovni: i bez osy frekvencí a lan hlídá, jestli se most nesloží.
    window.clearTimeout(casovacRozboru);
    rozbor = undefined;
    oznacSlozeni();
    idRozboru += 1;
    const id = idRozboru;
    const navrh = editor.navrh;
    casovacRozboru = window.setTimeout(() => pomocny.posli({ typ: "rozbor", id, uroven, navrh, nasada: nasadaUrovne(uroven) }), PRODLEVA_ROZBORU);
    obnovOsuFrekvenci();
  }

  /** Kdo tak jde, slovy z jízdního řádu. */
  function kdoJde(druh: string): string {
    const klic = `provoz.${druh}`;
    return jeKlicTextu(klic) ? t(klic) : t("provoz.jiny");
  }

  /** Kdo jde daným rytmem: útvar s kadencí běhu jsou běžci, jak o nich mluví zadání. */
  function kdoJdeRytmem(druh: string, rytmus: number): string {
    return druh === "utvar" && rytmus >= KADENCE_BEHU ? t("provoz.utvar.beh") : kdoJde(druh);
  }

  /**
   * Složka kroku slovy: „krok 2,3 Hz“, „dvojnásobek kroku 2,3 Hz“; u lidí bez jednoho rytmu
   * „krok kolem 1,7 Hz“, u skákajícího davu „skákání 2,2 Hz“.
   */
  function slozkaSlovy(slozka: { druh?: string; rytmus: number; nasobek: 1 | 2 | 3 | 4; vTaktu?: boolean; pasmo?: number }): string {
    const kolem = slozka.vTaktu === false ? slozka.druh !== "chodec" && slozka.druh !== "bezec" : (slozka.pasmo ?? 0) > 0;
    const zaklad = slozka.druh === "skakajici-dav" && !kolem ? "frekvence.skoky" : kolem ? "frekvence.slozka.kolem" : "frekvence.slozka";
    return t(`${zaklad}.${slozka.nasobek}`, { krok: cislo(slozka.rytmus, 1) });
  }

  /** Odhad zrychlení slovy: pod 1 m/s² na setiny (meze tam leží blízko sebe), jinak na desetiny. */
  function zrychleniSlovy(zrychleni: number): string {
    return cislo(zrychleni, zrychleni < 1 ? 2 : 1);
  }

  /** Mez kmitání úrovně, m/s². */
  const MEZ_KMITANI = MEZE_KOMFORTU[uroven.nejhorsiKomfort - 1]!;

  /**
   * Změřené kmitání na setiny. Hodnota těsně nad mezí by se zaokrouhlila na mez samu a hráč by
   * četl „2,50, mez 2,5“ u mostu, který neprošel: taková se píše o setinu výš.
   */
  function zmereneKmitani(zrychleni: number): string {
    const text = cislo(zrychleni, 2);
    return zrychleni > MEZ_KMITANI && text === cislo(MEZ_KMITANI, 2) ? cislo(MEZ_KMITANI + 0.01, 2) : text;
  }

  /** Jak odhad kmitání stojí proti mezi úrovně. */
  function stavOdhadu(zrychleni: number): "klid" | "u-meze" | "nad-mezi" {
    if (zrychleni < ODHAD_U_MEZE[0] * MEZ_KMITANI) return "klid";
    return zrychleni > ODHAD_U_MEZE[1] * MEZ_KMITANI ? "nad-mezi" : "u-meze";
  }

  /** Skupina lidí, která most podle odhadu rozkmitá nejvíc. */
  function nejhorsiSkupina(odhad: OdhadKmitani): OdhadSkupiny {
    return odhad.skupiny.reduce((a, b) => (b.zrychleni > a.zrychleni ? b : a));
  }

  /**
   * Co by kmitání zmenšilo, podle rozboru mostu `r`. Radí jen to, co rozbor spočítal (odhad
   * s mostem tužším a těžším, s tlumičem novým, přeladěným, těžším nebo jinde) a co úroveň
   * dovoluje postavit, v pořadí od nástroje, který úroveň učí. `kratce` vrátí jen první radu
   * (do řádku pod osou), jinak všechny. Prázdný text, když rozbor odhad nemá.
   */
  function radaKeKmitani(r: RozborMostu, kratce = false): string {
    if (!r.odhad) return "";
    const odhad = r.odhad.zrychleni;
    const po = (pomer: number): string => zrychleniSlovy(pomer * odhad);
    const vety: string[] = [];
    const rady: string[] = [];
    const tl = r.tlumic;
    if (r.odhadBezTlumicu) {
      // Most má laděný tlumič: co dělá a která jeho úprava by pomohla nejvíc.
      if (r.odhad.zrychleni < r.odhadBezTlumicu.zrychleni) {
        vety.push(t("kmitani.rada.tlumicPomaha", { bez: zrychleniSlovy(r.odhadBezTlumicu.zrychleni), s: zrychleniSlovy(odhad) }));
      }
      if (tl) {
        const upravy: { pomer: number; veta: string }[] = [];
        if (tl.preladeny !== null) upravy.push({ pomer: tl.preladeny, veta: t("kmitani.rada.preladit", { f: cislo(tl.cil, 2), a: po(tl.preladeny) }) });
        if (tl.jinde !== null && tl.jindeX !== null) upravy.push({ pomer: tl.jinde, veta: t("kmitani.rada.jinde", { x: cislo(tl.jindeX, 0), a: po(tl.jinde) }) });
        if (tl.tezsi !== null) upravy.push({ pomer: tl.tezsi, veta: t("kmitani.rada.tezsiTlumic", { kg: celeCislo(uroven.nejvetsiTlumic), a: po(tl.tezsi) }) });
        upravy.sort((x, y) => x.pomer - y.pomer);
        for (const uprava of upravy) if (uprava.pomer <= UPRAVA_TLUMICE_OD) rady.push(uprava.veta);
        if (rady.length === 0 && r.smer) rady.push(t("kmitani.rada.tlumicVic"));
      }
    } else if (tl && tl.novy !== null && tl.novy <= RADA_OD && uroven.nejvetsiTlumic >= LADENY_TLUMIC.nejmensiHmota) {
      rady.push(t("kmitani.rada.novyTlumic", { f: cislo(tl.cil, 2), a: po(tl.novy) }));
    }
    // Tlumič do kotvy: nástroj úrovně, která ho má, a rozbor ho zkusil.
    if (r.viskozni !== null && r.viskozni <= RADA_OD) rady.push(t("kmitani.rada.viskozni", { a: po(r.viskozni) }));
    if (r.smer) {
      const pomuze = (pomery: [number, number]): "" | ".vyrazne" | null => (pomery[0] <= RADA_OD ? "" : pomery[1] <= RADA_OD ? ".vyrazne" : null);
      const tezsi = pomuze(r.smer.tezsi);
      const tuzsi = pomuze(r.smer.tuzsi);
      // Těžší most se dá postavit závažím; kde závaží není, hra ho neradí.
      if (tezsi !== null && uroven.nejvetsiZavazi > 0) rady.push(t(`kmitani.rada.zavazi${tezsi}`));
      if (tuzsi !== null) rady.push(t(`kmitani.rada.tuzsi${tuzsi}`));
      if (tezsi === null && tuzsi === null) {
        const prvni = rady.length === 0;
        rady.push(t("kmitani.rada.nic"));
        // Co rozbor nespočítal, se jen nabízí k vyzkoušení.
        if (prvni) rady.push(t("kmitani.rada.jinak"));
      }
    }
    if (kratce) return rady[0] ?? "";
    return [...vety, ...rady].join(" ");
  }

  /**
   * Má návrh viskózní tlumič, jehož konec nic nedrží (není na kotvě a nevede do něj nic dalšího)?
   * Takový most nemá klidovou polohu, takže rozbor nic nespočítá, a tlumič nic nebrzdí.
   */
  function maVolnyTlumic(): boolean {
    const navrh = editor.navrh;
    const naKotve = (id: number): boolean => {
      const st = navrh.stycniky.find((x) => x.id === id);
      return st !== undefined && uroven.kotvy.some((k) => k.x === st.x && k.y === st.y);
    };
    return navrh.pruty.some(
      (prut) =>
        KATALOG[prut.prvek].druh === "tlumic" &&
        [prut.a, prut.b].some((konec) => !naKotve(konec) && !navrh.pruty.some((jiny) => jiny !== prut && (jiny.a === konec || jiny.b === konec))),
    );
  }

  /**
   * Překreslí osu frekvencí: stupnici, kroky lidí i s jejich násobky (síla kroku není čistý
   * sinus) a vlastní frekvence mostu, prázdného i obsazeného.
   */
  function obnovOsuFrekvenci(): void {
    const osa = udaj("osa-frekvenci");
    osa.hidden = !uroven.osaFrekvenci;
    if (!uroven.osaFrekvenci) return;
    const znacky = prvek(".frekvence__znacky", HTMLElement);
    const misto = (f: number): string => `${(100 * Math.min(1, f / ROZSAH_OSY)).toFixed(1)}%`;
    const znacka = (trida: string, f: number, popis: string): HTMLElement => {
      const uzel = document.createElement("span");
      uzel.className = trida;
      uzel.style.left = misto(f);
      uzel.title = popis;
      return uzel;
    };
    const uzly: HTMLElement[] = [];
    for (let hz = 0; hz <= ROZSAH_OSY; hz++) {
      const dilek = znacka("frekvence__dilek", hz, "");
      const cislice = document.createElement("span");
      cislice.textContent = String(hz);
      dilek.append(cislice);
      uzly.push(dilek);
    }
    for (const slozka of slozkyLidi) {
      if (slozka.frekvence > ROZSAH_OSY) continue;
      const popis = t("frekvence.znacka.slozka", {
        kdo: kdoJdeRytmem(slozka.druh, slozka.rytmus),
        slozka: slozkaSlovy(slozka),
        f: cislo(slozka.frekvence, 1),
        sila: procenta(slozka.sila),
      });
      const tridy = ["frekvence__krok"];
      if (slozka.nasobek === 2) tridy.push("frekvence__krok--dvojnasobek");
      if (slozka.nasobek === 3) tridy.push("frekvence__krok--trojnasobek");
      if (slozka.sila >= SILNA_SLOZKA) tridy.push("frekvence__krok--silna");
      const uzel = znacka(tridy.join(" "), slozka.frekvence, popis);
      uzel.dataset.nasobek = String(slozka.nasobek);
      uzel.dataset.slozka = `${slozka.druh};${slozka.rytmus};${slozka.nasobek}`;
      uzly.push(uzel);
      if (slozka.pasmo > 0) {
        // Skupina, která nejde jedním rytmem, zabírá na ose pásmo.
        const pasmo = znacka("frekvence__pasmo", slozka.frekvence - slozka.pasmo, popis);
        const konec = Math.min(ROZSAH_OSY, slozka.frekvence + slozka.pasmo);
        pasmo.style.width = `${((100 * (konec - (slozka.frekvence - slozka.pasmo))) / ROZSAH_OSY).toFixed(1)}%`;
        uzly.push(pasmo);
      }
    }

    let text = "";
    let titulek = "";
    let stav = "";
    if (rozbor === undefined) text = t("frekvence.pocitaSe");
    else if (nalezStavby().slozeni) text = t("frekvence.slozeni");
    else if (nalezStavby().volny) text = t("frekvence.volny");
    else if ((rozbor === null || !rozbor.stabilni) && maVolnyTlumic()) text = t("frekvence.volnyTlumic");
    else if (rozbor === null || !rozbor.stabilni || rozbor.frekvence.length === 0) text = t("frekvence.bezMostu");
    else {
      // Most s laděnými tlumiči se ukazuje bez nich a tlumiče zvlášť: hráč je ladí na most.
      const most = mostProHrace(rozbor);
      const prazdny = most.frekvence[0];
      const obsazeny = most.frekvenceObsazeneho[0];
      most.frekvence.forEach((f, j) => {
        if (f > ROZSAH_OSY) {
          // První vlastní frekvence za koncem osy: šipka u pravého okraje, ať most z osy nezmizí.
          if (j === 0) uzly.push(znacka("frekvence__mimo", ROZSAH_OSY, t("frekvence.znacka.mimo", { f: cislo(f, 2), konec: cislo(ROZSAH_OSY, 0) })));
          return;
        }
        const uzel = znacka(j === 0 ? "frekvence__most" : "frekvence__most frekvence__most--dalsi", f, t("frekvence.znacka.most", { poradi: j + 1, f: cislo(f, 2) }));
        uzel.dataset.poradi = String(j + 1);
        uzly.push(uzel);
      });
      most.frekvenceObsazeneho.forEach((f, j) => {
        if (f > ROZSAH_OSY) return;
        const trida = `frekvence__most frekvence__most--obsazeny${j === 0 ? "" : " frekvence__most--dalsi"}`;
        uzly.push(znacka(trida, f, t("frekvence.znacka.obsazeny", { poradi: j + 1, f: cislo(f, 2) })));
      });
      const tlumice = [...new Set(editor.navrh.stycniky.flatMap((st) => (st.tlumic ? [st.tlumic.frekvence] : [])))].sort((a, b) => a - b);
      for (const f of tlumice) {
        if (f <= ROZSAH_OSY) uzly.push(znacka("frekvence__tlumic", f, t("frekvence.znacka.tlumic", { f: cislo(f, 2) })));
      }
      if (prazdny === undefined) text = t("frekvence.bezMostu");
      else {
        const popisMostu =
          obsazeny !== undefined && cislo(obsazeny, 2) !== cislo(prazdny, 2)
            ? t("frekvence.mostSLidmi", { prazdny: cislo(prazdny, 2), obsazeny: cislo(obsazeny, 2) })
            : t("frekvence.most", { prazdny: cislo(prazdny, 2) });
        text = popisMostu;
        if (tlumice.length > 0) {
          const rozsah = tlumice.length === 1 ? cislo(tlumice[0]!, 2) : `${cislo(tlumice[0]!, 2)}–${cislo(tlumice[tlumice.length - 1]!, 2)}`;
          text = t("frekvence.sTlumicem", { most: text, f: rozsah });
        }
        const titulky = [
          obsazeny !== undefined && cislo(obsazeny, 2) !== cislo(prazdny, 2)
            ? t("frekvence.popis.most", { prazdny: cislo(prazdny, 2), obsazeny: cislo(obsazeny, 2) })
            : t("frekvence.popis.mostBezLidi", { prazdny: cislo(prazdny, 2) }),
        ];
        // Odhad kmitání pod lidmi: kolik, kdo ho působí a co by pomohlo. Po zkoušce téhož mostu
        // má přednost naměřená hodnota.
        const odhad = rozbor.odhad;
        if (odhad) {
          const nejhorsi = nejhorsiSkupina(odhad);
          const hlavni = nejhorsi.slozky[0];
          // Kmitání naměřené zkouškou platí jen u mostu, který ji vydržel celý: most, který se
          // zřítil, kmitání změřené nemá (nebo jen z chvíle před pádem) a osa u něj zůstává u odhadu.
          const zmereno = platnaObalka();
          const cely = zmereno !== null && zmereno.poruseni === 0 && zmereno.spadlo === 0 && !zmereno.rozpad && !zmereno.bezRovnovahy;
          const komfort = zmereno && cely && !beh?.zlom ? zmereno.komfort : null;
          const hodnoty = { a: zrychleniSlovy(odhad.zrychleni), mez: cislo(MEZ_KMITANI, 1) };
          if (hlavni) {
            const kdo = kdoJdeRytmem(hlavni.druh, hlavni.rytmus);
            const slozka = slozkaSlovy(hlavni);
            if (komfort) {
              stav = komfort.zrychleni > MEZ_KMITANI ? "nad-mezi" : "klid";
              text = t("frekvence.zkouska", { a: zmereneKmitani(komfort.zrychleni), mez: hodnoty.mez });
              titulky.push(t("frekvence.popis.zkouska", { a: zmereneKmitani(komfort.zrychleni), odhad: hodnoty.a }));
              // Číslo je největší naměřené kmitání, takže i příčina se čte ve chvíli, kdy nastalo.
              const zmerene = beh ? kmitaniBehu(beh) : null;
              const pricina = zmerene ? kdoASlozka(zmerene.nejvic) : null;
              if (pricina) text = t("frekvence.zkouska.kdo", { veta: text, ...pricina });
              osa.dataset.zkouska = komfort.zrychleni.toFixed(2);
            } else {
              const podleOdhadu = stavOdhadu(odhad.zrychleni);
              stav = podleOdhadu;
              text = t(`frekvence.odhad.${podleOdhadu}`, { ...hodnoty, kdo, slozka });
              delete osa.dataset.zkouska;
            }
            const rada = stav === "klid" ? "" : radaKeKmitani(rozbor, true);
            if (rada) text = `${velkymPismenem(text)}. ${rada}`;
            osa.dataset.odhad = odhad.zrychleni.toFixed(2);
            osa.dataset.hlavni = `${hlavni.druh};${hlavni.nasobek};${hlavni.rytmus}`;
            // Na ose se zvýrazní složka kroku, o které je řeč.
            for (const uzel of uzly) {
              if (uzel.dataset.slozka === `${hlavni.druh};${hlavni.rytmus};${hlavni.nasobek}`) uzel.classList.add("frekvence__krok--hlavni");
            }
          }
          for (const skupina of odhad.skupiny) {
            titulky.push(
              t("frekvence.popis.skupina", {
                kdo: velkymPismenem(zapisJizdy(uroven.jizdniRad[skupina.polozka]!).replace(/^[^→←]*[→←]\s*/u, "")),
                a: zrychleniSlovy(skupina.zrychleni),
                slozky: skupina.slozky
                  .slice(0, 3)
                  // Když je s tou skupinou na mostě někdo další, patří část kmitání jemu: složka řekne komu.
                  .map((x) =>
                    t("frekvence.popis.slozka", {
                      slozka: x.polozka === skupina.polozka ? slozkaSlovy(x) : `${kdoJdeRytmem(x.druh, x.rytmus)}, ${slozkaSlovy(x)}`,
                      a: zrychleniSlovy(x.zrychleni),
                    }),
                  )
                  .join("; "),
              }),
            );
          }
          const rada = radaKeKmitani(rozbor);
          if (rada) titulky.push(rada);
          const mistrovska = uroven.mistrovska?.druh === "komfort-chodcu" ? podminkaMistrovske(uroven) : null;
          if (mistrovska) titulky.push(t("frekvence.popis.mistrovska", { podminka: mistrovska }));
          titulky.push(t("frekvence.popis.odhad"));
        }
        titulek = titulky.join(" ");
      }
    }
    if (stav === "") {
      delete osa.dataset.odhad;
      delete osa.dataset.zkouska;
      delete osa.dataset.hlavni;
    }
    znacky.replaceChildren(...uzly);
    const popis = udaj("frekvence-popis");
    popis.textContent = text;
    popis.title = titulek || text;
    osa.dataset.stav = stav;
    if (rozbor && rozbor.frekvence.length > 0) osa.dataset.frekvence = rozbor.frekvence[0]!.toFixed(3);
    else delete osa.dataset.frekvence;
  }

  /**
   * Na co ladit laděný tlumič: na rytmus, který most bez tlumičů rozkmitá nejvíc, a když je
   * takových víc, na ten, se kterým naladěný tlumič odhad sníží nejvíc (počítá rozbor,
   * `RozborMostu.tlumic`). Budicí rytmus je daný lidmi a tlumič pomáhá nejvíc na frekvenci, na
   * kterou je naladěný; zkoušky to potvrzují. Kde lidé nejsou, je cílem první vlastní frekvence
   * mostu bez tlumičů. Null, dokud rozbor není.
   */
  function cilLadeniSPopisem(): { f: number; slozka: SlozkaOdhadu | null } | null {
    // Dokud se po úpravě počítá nový rozbor, platí ten minulý: ladění tlumiče most bez tlumičů nemění.
    const znamy = rozbor === undefined ? posledniZnamyRozbor : rozbor;
    if (!znamy || !znamy.stabilni) return null;
    const odhad = znamy.odhadBezTlumicu ?? znamy.odhad;
    const cil = znamy.tlumic;
    if (odhad && cil) {
      const slozka = odhad.skupiny.flatMap((sk) => sk.slozky).find((sl) => sl.polozka === cil.polozka && sl.nasobek === cil.nasobek);
      return { f: cil.cil, slozka: slozka ?? null };
    }
    const f = znamy.bezTlumicu?.prazdny[0] ?? znamy.frekvence[0];
    return f === undefined ? null : { f, slozka: null };
  }

  function cilLadeni(): number | null {
    return cilLadeniSPopisem()?.f ?? null;
  }

  /** V nastavení laděného tlumiče ukáže, na jakou frekvenci ho ladit, a nabídne to jedním tlačítkem. */
  function obnovLadeniTlumice(): void {
    const ladeny = rezim === "stavba" ? editor.ladenyTlumicVyberu : null;
    const cil = ladeny ? cilLadeniSPopisem() : null;
    const poznamka = udaj("ladeny-cil");
    const naladit = prvek('[data-akce="ladeny-naladit"]', HTMLButtonElement);
    poznamka.hidden = cil === null;
    naladit.hidden = cil === null;
    if (!ladeny || cil === null) {
      delete document.body.dataset.cilLadeni;
      return;
    }
    poznamka.textContent = cil.slozka
      ? t("paleta.ladeny.cil", { kdo: kdoJdeRytmem(cil.slozka.druh, cil.slozka.rytmus), slozka: slozkaSlovy(cil.slozka), f: cislo(cil.f, 2) })
      : t("paleta.ladeny.cil.most", { f: cislo(cil.f, 2) });
    // Tlumič jde ladit po krocích a jen ve svém rozsahu: tlačítko řekne, proč zrovna nejde.
    const mimoRozsah = cil.f < LADENY_TLUMIC.nejmensiFrekvence || cil.f > LADENY_TLUMIC.nejvetsiFrekvence;
    const naladeno = Math.abs(ladeny.frekvence - cil.f) <= LADENY_TLUMIC.krokFrekvence / 2 + 1e-9;
    naladit.disabled = mimoRozsah || naladeno;
    const proc = mimoRozsah
      ? t("paleta.ladeny.mimoRozsah", { od: cislo(LADENY_TLUMIC.nejmensiFrekvence, 1), do: cislo(LADENY_TLUMIC.nejvetsiFrekvence, 0) })
      : naladeno
        ? t("paleta.ladeny.naladeno")
        : t("paleta.ladeny.naladit.popis");
    naladit.title = proc;
    naladit.setAttribute("aria-label", proc);
    document.body.dataset.cilLadeni = cil.f.toFixed(3);
  }

  /** Promítne návrh do lišty, palety a popisového pole a překreslí výkres. */
  function obnovStavbu(): void {
    const navrh = editor.navrh;
    const cena = cenaNavrhu(navrh);
    const stavi = rezim === "stavba";
    // Deník: jaký nástroj a prvek má hráč v ruce (jen když se to změní).
    const vRuce = nastroj === "kresleni" ? `kresleni:${editor.prvek}` : nastroj;
    if (stavi && vRuce !== zapsanyNastroj) {
      if (zapsanyNastroj !== "") zapis("nastroj", nastroj === "kresleni" ? { ktery: nastroj, prvek: editor.prvek } : { ktery: nastroj });
      zapsanyNastroj = vRuce;
    }

    // Rozpočet.
    const plneni = prvek(".rozpocet__plneni", HTMLElement);
    const ryska = prvek(".rozpocet__ryska", HTMLElement);
    const pruh = prvek(".rozpocet__pruh", HTMLElement);
    if (uroven.rozpocet !== null) {
      udaj("rozpocet-popis").textContent = t("rozpocet.nadpis");
      udaj("rozpocet").textContent = t("rozpocet.zRozpoctu", { cena: koruny(cena), rozpocet: koruny(uroven.rozpocet) });
      plneni.style.width = `${(100 * Math.min(1, cena / uroven.rozpocet)).toFixed(1)}%`;
      const inz = uroven.inzenyrskyRozpocet;
      ryska.hidden = inz === null;
      if (inz !== null) ryska.style.left = `${(100 * Math.min(1, inz / uroven.rozpocet)).toFixed(1)}%`;
      rozpocet.dataset.stav = cena > uroven.rozpocet ? "nad" : inz !== null && cena <= inz ? "inz" : "ok";
    } else {
      udaj("rozpocet-popis").textContent = t("rozpocet.cena");
      udaj("rozpocet").textContent = koruny(cena);
      pruh.hidden = true;
      rozpocet.dataset.stav = "ok";
    }

    // Popisové pole.
    udaj("cena").textContent = koruny(cena);
    udaj("hmotnost").textContent = hmotnost(hmotnostNavrhu(navrh, uroven));
    udaj("prutu").textContent = celeCislo(navrh.pruty.length);

    // Paleta a nástroje.
    for (const tlacitko of paletaPrvku.querySelectorAll<HTMLButtonElement>("[data-prvek]")) {
      tlacitko.setAttribute("aria-pressed", String(nastroj === "kresleni" && tlacitko.dataset.prvek === editor.prvek));
      tlacitko.disabled = !stavi || !KATALOG[tlacitko.dataset.prvek as IdPrvku].hotovo;
    }
    for (const tlacitko of paletaPrvku.querySelectorAll<HTMLButtonElement>("[data-pridavek]")) {
      tlacitko.setAttribute("aria-pressed", String(nastroj === tlacitko.dataset.pridavek));
      tlacitko.disabled = !stavi;
    }
    const nastav = (akce: string, povoleno: boolean): void => {
      prvek(`[data-akce="${akce}"]`, HTMLButtonElement).disabled = !(stavi && povoleno);
    };
    nastav("vyber", true);
    prvek('[data-akce="vyber"]', HTMLButtonElement).setAttribute("aria-pressed", String(nastroj === "vyber"));
    // Pokusy jsou vidět a dají se zmáčknout i bez mostu; pak poradí, co jim chybí. Zkouška
    // do zlomu je na každé úrovni.
    prvek('[data-cast="pokusy"]', HTMLElement).hidden = false;
    prvek('[data-akce="zlom"]', HTMLButtonElement).disabled = !stavi;
    const tlacitkoBrnknuti = prvek('[data-akce="brnknout"]', HTMLButtonElement);
    tlacitkoBrnknuti.hidden = !uroven.osaFrekvenci;
    tlacitkoBrnknuti.disabled = !stavi;
    tlacitkoBrnknuti.setAttribute("aria-pressed", String(nastroj === "brnknuti"));
    const tlacitkoBudice = prvek('[data-akce="budic"]', HTMLButtonElement);
    tlacitkoBudice.hidden = !uroven.budic;
    tlacitkoBudice.disabled = !stavi;
    tlacitkoBudice.setAttribute("aria-pressed", String(nastroj === "budic"));
    const nastavujeBudic = stavi && uroven.budic && nastroj === "budic";
    prvek('[data-nastaveni="budic"]', HTMLElement).hidden = !nastavujeBudic;
    if (nastavujeBudic) {
      udaj("budic-rytmus").textContent =
        rytmusBudice === null
          ? t("paleta.budic.celyRozsah", { od: cislo(ROZSAH_BUDICE.od, 1), do: cislo(ROZSAH_BUDICE.do, 0) })
          : t("paleta.budic.staly", { f: cislo(rytmusBudice, 2) });
      const rozsah = prvek('[data-akce="budic-rozsah"]', HTMLButtonElement);
      rozsah.setAttribute("aria-pressed", String(rytmusBudice === null));
      rozsah.title = t("paleta.budic.rozsah.popis", { od: cislo(ROZSAH_BUDICE.od, 1), do: cislo(ROZSAH_BUDICE.do, 0) });
    }
    document.body.dataset.rytmusBudice = rytmusBudice === null ? "rozsah" : rytmusBudice.toFixed(2);

    // Nastavení toho, co je vybrané: závaží styčníků a síla tlumičů.
    const zavazi = stavi && uroven.nejvetsiZavazi > 0 ? editor.zavaziVyberu : null;
    prvek('[data-nastaveni="zavazi"]', HTMLElement).hidden = zavazi === null;
    if (zavazi !== null) {
      udaj("zavazi").textContent = t("paleta.zavazi.hodnota", { kg: cislo(zavazi, 0) });
      prvek('[data-akce="zavazi-min"]', HTMLButtonElement).disabled = zavazi <= 0;
      prvek('[data-akce="zavazi-plus"]', HTMLButtonElement).disabled = zavazi >= uroven.nejvetsiZavazi;
    }
    const ladeny = stavi && uroven.nejvetsiTlumic >= LADENY_TLUMIC.nejmensiHmota ? editor.ladenyTlumicVyberu : null;
    prvek('[data-nastaveni="ladeny"]', HTMLElement).hidden = ladeny === null;
    if (ladeny !== null) {
      const prepinac = prvek('[data-akce="ladeny-prepnout"]', HTMLButtonElement);
      prepinac.setAttribute("aria-pressed", String(ladeny !== undefined));
      udaj("ladeny-prepnout").textContent = t(ladeny ? "paleta.ladeny.odebrat" : "paleta.ladeny.pridat");
      for (const cast of ["ladeny-hmota", "ladeny-frekvence"]) prvek(`[data-cast="${cast}"]`, HTMLElement).hidden = !ladeny;
      if (ladeny) {
        udaj("ladeny-hmota").textContent = t("paleta.ladeny.hmota", { kg: cislo(ladeny.hmota, 0) });
        udaj("ladeny-frekvence").textContent = t("paleta.ladeny.frekvence", { f: cislo(ladeny.frekvence, 2) });
        prvek('[data-akce="ladeny-hmota-min"]', HTMLButtonElement).disabled = ladeny.hmota <= LADENY_TLUMIC.nejmensiHmota;
        prvek('[data-akce="ladeny-hmota-plus"]', HTMLButtonElement).disabled =
          ladeny.hmota + LADENY_TLUMIC.krokHmoty > uroven.nejvetsiTlumic;
        prvek('[data-akce="ladeny-frekvence-min"]', HTMLButtonElement).disabled =
          ladeny.frekvence <= LADENY_TLUMIC.nejmensiFrekvence;
        prvek('[data-akce="ladeny-frekvence-plus"]', HTMLButtonElement).disabled =
          ladeny.frekvence >= LADENY_TLUMIC.nejvetsiFrekvence;
      }
    }
    obnovLadeniTlumice();
    obnovNapinak();
    const svar = stavi && uroven.povoleneSvary ? editor.svarVyberu : null;
    prvek('[data-nastaveni="svar"]', HTMLElement).hidden = svar === null;
    if (svar !== null) {
      prvek('[data-akce="svar-prepnout"]', HTMLButtonElement).setAttribute("aria-pressed", String(svar));
      udaj("svar-prepnout").textContent = t(svar ? "paleta.svar.zrusit" : "paleta.svar.svarit");
    }
    const zamek = stavi ? editor.zamekVyberu : null;
    prvek('[data-nastaveni="zamek"]', HTMLElement).hidden = zamek === null;
    if (zamek !== null) {
      prvek('[data-akce="zamek-prepnout"]', HTMLButtonElement).setAttribute("aria-pressed", String(zamek));
      udaj("zamek-prepnout").textContent = t(zamek ? "paleta.zamek.odebrat" : "paleta.zamek.pridat");
    }
    const zdvih = stavi ? editor.zdvihVyberu : null;
    prvek('[data-nastaveni="zdvih"]', HTMLElement).hidden = zdvih === null;
    if (zdvih === null) delete document.body.dataset.zdvih;
    else {
      const zapisZdvihu = (metry: number): string =>
        metry > 0
          ? t("paleta.zdvih.vysune", { m: cislo(metry, 2) })
          : metry < 0
            ? t("paleta.zdvih.zasune", { m: cislo(-metry, 2) })
            : t("paleta.zdvih.nula");
      udaj("zdvih").textContent = zdvih.ruzne ? t("paleta.zdvih.ruzne") : zapisZdvihu(zdvih.zdvih);
      // Poznámka: rozsah a doba zdvihu, o kolik se křídlo zvedne a kolik píst unese.
      const poznamky = [
        zdvih.zdvih === 0
          ? t("paleta.zdvih.poznamkaNula", { nejvic: cislo(zdvih.nejvetsi, 2) })
          : t("paleta.zdvih.poznamka", {
              nejvic: cislo(zdvih.nejvetsi, 2),
              sekund: cislo(Math.abs(zdvih.zdvih) / PIST.rychlost + PIST.rychlost / PIST.zrychleni, 1),
            }),
      ];
      if (zdvih.otoceni !== null && zdvih.zdvih !== 0) {
        poznamky.push(
          zdvih.otoceni < COS_NEJVETSIHO_OTOCENI
            ? t("paleta.zdvih.uhelMoc")
            : t("paleta.zdvih.uhel", { uhel: cislo((Math.acos(Math.min(1, zdvih.otoceni)) * 180) / Math.PI, 0) }),
        );
      }
      poznamky.push(t("paleta.zdvih.sila", { sila: `${cislo(PIST.nejvetsiSila / 1000, 0)} kN` }));
      const poleZdvihu = udaj("zdvih-poznamka");
      poleZdvihu.textContent = poznamky.join(" ");
      poleZdvihu.dataset.varovani = String(zdvih.otoceni !== null && zdvih.otoceni < COS_NEJVETSIHO_OTOCENI);
      if (zdvih.otoceni === null || zdvih.zdvih === 0) delete document.body.dataset.otoceni;
      else document.body.dataset.otoceni = ((Math.acos(Math.max(-1, Math.min(1, zdvih.otoceni))) * 180) / Math.PI).toFixed(0);
      prvek('[data-akce="zdvih-min"]', HTMLButtonElement).disabled = zdvih.zdvih <= -zdvih.nejvetsi + 1e-9;
      prvek('[data-akce="zdvih-plus"]', HTMLButtonElement).disabled = zdvih.zdvih >= zdvih.nejvetsi - 1e-9;
      document.body.dataset.zdvih = zdvih.zdvih.toFixed(2);
    }
    // Dopnutí lan je vidět, kdykoli úroveň lana dovoluje; bez lan po kliknutí poradí.
    const tlacitkoDopnuti = prvek('[data-akce="dopnout"]', HTMLButtonElement);
    tlacitkoDopnuti.hidden = !smiLana;
    tlacitkoDopnuti.disabled = !stavi || dopinani !== null;
    const tlumeni = stavi ? editor.tlumeniVyberu : null;
    prvek('[data-nastaveni="tlumeni"]', HTMLElement).hidden = tlumeni === null;
    if (tlumeni !== null) {
      udaj("tlumeni").textContent = t("paleta.tlumeni.hodnota", { hodnota: cislo(tlumeni / 1000, 0) });
      const rozsah = KATALOG.tlumic.tlumeni!;
      prvek('[data-akce="tlumeni-min"]', HTMLButtonElement).disabled = tlumeni <= rozsah.nejmensi;
      prvek('[data-akce="tlumeni-plus"]', HTMLButtonElement).disabled = tlumeni >= rozsah.nejvetsi;
    }
    obnovAnalyzu();
    nastav("smazat", editor.neconiJeVybrano);
    nastav("zrcadlit", navrh.pruty.length > 0);
    nastav("zpet", editor.lzeZpet);
    nastav("znovu", editor.lzeZnovu);
    nastav("zpet-rychle", editor.lzeZpet);
    nastav("smazat-rychle", editor.neconiJeVybrano);
    nastav("smazat-vse", navrh.pruty.length > 0);
    nastav("export", navrh.pruty.length > 0);
    nastav("import", true);

    obnovRaduStavby();
    obnovUdajeVyberu();

    // Obálka vybraného prutu z poslední zkoušky.
    const obalka = platnaObalka();
    if (stavi && obalka && !editor.tah && editor.vybranePruty.size === 1 && editor.vybraneStycniky.size === 0) {
      const [id] = editor.vybranePruty;
      const poradi = navrh.pruty.findIndex((p) => p.id === id);
      if (poradi >= 0) ukazHlaseni(zapisObalky(obalka, poradi), "info", false);
    }

    document.body.dataset.pruty = String(navrh.pruty.length);
    // Legenda využití je vidět, jen když jsou pruty obarvené: při zkoušce a s platnou obálkou.
    document.body.dataset.vyuziti = String(!stavi || obalka !== null);
    obnovPohled();
  }

  /**
   * Řádek rad pod výkresem podle toho, co má hráč v ruce: kreslení, výběr, pokus nebo přídavek.
   * S vybranými pruty radí, co se s nimi dá dělat (číslice mění prvek, Shift+klik přidává).
   */
  function obnovRaduStavby(): void {
    const pole = udaj("rada-stavby");
    let klic: KlicTextu = "rada.kresleni";
    if (nastroj === "brnknuti") klic = "rada.brnknuti";
    else if (nastroj === "budic") klic = "rada.budic";
    else if (nastroj === "napinak") klic = "rada.napinak";
    else if (nastroj === "zavazi") klic = "rada.zavazi";
    else if (nastroj === "ladeny") klic = "rada.ladeny";
    else if (jePridavek(nastroj)) klic = "rada.pridavek";
    else if (editor.vybranePruty.size > 0) klic = "rada.vybranePruty";
    else if (nastroj === "vyber") klic = "rada.vyber";
    pole.textContent = t(klic);
    pole.dataset.rada = klic.slice("rada.".length);
  }

  /**
   * Údaje o vybraných prutech dole v paletě: z čeho jsou, jak jsou dlouhé a kolik stojí; u
   * jediného prutu i jeho největší využití z poslední zkoušky.
   */
  function obnovUdajeVyberu(): void {
    const panel = prvek('[data-nastaveni="vyber"]', HTMLElement);
    const navrh = editor.navrh;
    const vybrane = rezim === "stavba" ? navrh.pruty.filter((p) => editor.vybranePruty.has(p.id)) : [];
    panel.hidden = vybrane.length === 0;
    if (vybrane.length === 0) {
      delete document.body.dataset.vyberMetru;
      return;
    }
    const podleId = new Map(navrh.stycniky.map((st) => [st.id, st]));
    let metru = 0;
    let cena = 0;
    for (const p of vybrane) {
      const a = podleId.get(p.a);
      const b = podleId.get(p.b);
      const delka = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
      metru += delka;
      cena += cenaPrutu(p.prvek, delka);
    }
    const radky: string[] = [];
    const jediny = vybrane.length === 1 ? vybrane[0]! : null;
    if (jediny) {
      const poradi = navrh.pruty.indexOf(jediny);
      udaj("vyber-nadpis").textContent = t("vyber.prut", { prut: poradi + 1 });
      radky.push(nazevPrvku(jediny.prvek));
      radky.push(t("vyber.rozmer", { metru: cislo(metru, 2), cena: koruny(cena) }));
      const o = obalkaStavby()?.[poradi];
      if (o && o.vyuziti > 0) radky.push(t("vyber.vyuziti", { vyuziti: procenta(o.vyuziti), zpusob: t(nazevZpusobu(o.zpusob)) }));
    } else {
      udaj("vyber-nadpis").textContent = t("vyber.pruty", { pocet: vybrane.length });
      const prvky = [...new Set(vybrane.map((p) => p.prvek))];
      radky.push(prvky.length === 1 ? nazevPrvku(prvky[0]!) : t("vyber.ruzne", { pocet: prvky.length }));
      radky.push(t("vyber.rozmer", { metru: cislo(metru, 1), cena: koruny(cena) }));
    }
    udaj("vyber-udaje").textContent = radky.join("\n");
    document.body.dataset.vyberMetru = metru.toFixed(2);
  }

  function prepniCisla(): void {
    cisla = !cisla;
    zapis("ovladani", { co: "cisla", stav: cisla });
    uloziste.cislaVyuziti = cisla;
    prepinacCisel.setAttribute("aria-pressed", String(cisla));
    platno.prekresli();
  }

  // ---- Analytický panel ----

  function prepniAnalyzu(): void {
    analyzaOtevrena = !analyzaOtevrena;
    zapis("ovladani", { co: "analyza", stav: analyzaOtevrena });
    obnovAnalyzu();
    // Kde výsledek leží přes analytický panel, sbalí se: kdo otevírá analýzu, chce ji vidět.
    if (analyzaOtevrena && !panelVysledku.hidden && !panelAnalyzy.hidden) {
      const v = panelVysledku.getBoundingClientRect();
      const a = panelAnalyzy.getBoundingClientRect();
      if (v.left < a.right && a.left < v.right && v.top < a.bottom && a.top < v.bottom) sbalVysledek(true);
    }
  }

  /** Přizpůsobí plátno grafu jeho velikosti na stránce a hustotě obrazovky; null, když není vidět. */
  function pripravGraf(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; sirka: number; vyska: number } | null {
    const hustota = window.devicePixelRatio || 1;
    const obrys = canvas.getBoundingClientRect();
    if (obrys.width < 2 || obrys.height < 2) return null;
    const sirka = Math.round(obrys.width * hustota);
    const vyska = Math.round(obrys.height * hustota);
    if (canvas.width !== sirka) canvas.width = sirka;
    if (canvas.height !== vyska) canvas.height = vyska;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(hustota, 0, 0, hustota, 0, 0);
    return { ctx, sirka: obrys.width, vyska: obrys.height };
  }

  /** Styčník mostovky hlavní trasy nejblíž středu rozpětí (pořadí v návrhu); −1, když mostovka není. */
  function stycnikUprostred(navrh: NavrhMostu): number {
    const trasa = uroven.trasy[0];
    if (!trasa) return -1;
    const stred = (trasa.zacatek.x + trasa.konec.x) / 2;
    const naMostovce = new Set<number>();
    for (const p of navrh.pruty) {
      if (KATALOG[p.prvek].druh !== "mostovka") continue;
      naMostovce.add(p.a);
      naMostovce.add(p.b);
    }
    let nejblizsi = -1;
    navrh.stycniky.forEach((st, i) => {
      if (!naMostovce.has(st.id)) return;
      if (nejblizsi < 0 || Math.abs(st.x - stred) < Math.abs(navrh.stycniky[nejblizsi]!.x - stred)) nejblizsi = i;
    });
    return nejblizsi;
  }

  /** Největší využití prutu návrhu v jednom snímku záznamu, v procentech. */
  function vyuzitiVeSnimku(b: Beh, s: Snimek, prut: number): number {
    const stavba = b.zaznam.topologie[s.topologie];
    if (!stavba) return 0;
    let nejvic = 0;
    for (let e = 0; e < stavba.prut.length; e++) {
      if (stavba.prut[e] !== prut) continue;
      const v = Math.abs(s.vyuziti[e] ?? 0);
      if (v > nejvic) nejvic = v;
    }
    return 100 * nejvic;
  }

  /** Doplní průběhy o snímky, které do záznamu přibyly; po změně vybraného prutu přepočítá jeho řadu. */
  function doplnRady(b: Beh): Rady {
    if (!rady || rady.beh !== b) {
      rady = { beh: b, zpracovano: 0, casy: [], pruhyb: [], stycnik: stycnikUprostred(b.navrh), vychozi: 0, kmitani: [], prut: b.oznaceny, vyuziti: [] };
    }
    const r = rady;
    const snimky = b.zaznam.snimky;
    if (r.prut !== b.oznaceny) {
      r.prut = b.oznaceny;
      r.vyuziti = [];
      const prut = r.prut;
      if (prut !== null) for (let i = 0; i < r.zpracovano; i++) r.vyuziti.push(vyuzitiVeSnimku(b, snimky[i]!, prut));
    }
    for (; r.zpracovano < snimky.length; r.zpracovano++) {
      const s = snimky[r.zpracovano]!;
      const y = r.stycnik >= 0 ? (s.polohy[2 * r.stycnik + 1] ?? 0) : 0;
      if (r.zpracovano === 0) r.vychozi = y;
      r.casy.push(s.cas);
      r.pruhyb.push(1000 * (y - r.vychozi));
      r.kmitani.push(s.kmitani);
      if (r.prut !== null) r.vyuziti.push(vyuzitiVeSnimku(b, s, r.prut));
    }
    return r;
  }

  /** Překreslí grafy průběhů, když přibyla data, posunul se čas nebo se změnil vybraný prut. */
  function nakresliPrubehy(b: Beh): void {
    const r = doplnRady(b);
    const podpis = `${r.zpracovano}|${prehravani.cas.toFixed(3)}|${r.prut}`;
    if (podpis === nakreslenePrubehy) return;
    nakreslenePrubehy = podpis;
    const trvani = delkaDeje(b);
    const rozsah = (hodnoty: readonly number[]): [number, number] => {
      let nejmin = 0;
      let nejvic = 0;
      for (const h of hodnoty) {
        if (h < nejmin) nejmin = h;
        if (h > nejvic) nejvic = h;
      }
      return [nejmin, nejvic];
    };
    const kresli = (jmeno: string, hodnoty: readonly number[], dno: number, strop: number, mez?: number): void => {
      const graf = pripravGraf(prvek(`[data-udaj="${jmeno}"]`, HTMLCanvasElement));
      if (!graf) return;
      nakresliPrubeh(graf.ctx, graf.sirka, graf.vyska, {
        casy: r.casy,
        hodnoty,
        trvani,
        dno,
        strop,
        cas: prehravani.cas,
        ...(mez === undefined ? {} : { mez }),
      });
    };
    const [dolu, nahoru] = rozsah(r.pruhyb);
    kresli("graf-pruhyb", r.pruhyb, dolu < 0 ? -stropGrafu(-dolu) : 0, nahoru > 0 ? stropGrafu(nahoru) : dolu < 0 ? 0 : 1);
    // U lidí se v grafu kmitání vyznačí mez, nad kterou most neobstojí.
    const mezKmitani = b.budic ? undefined : MEZE_KOMFORTU[uroven.nejhorsiKomfort - 1]!;
    kresli("graf-kmitani", r.kmitani, 0, stropGrafu(Math.max(rozsah(r.kmitani)[1], mezKmitani ?? 0.5)), mezKmitani);
    kresli("graf-prut", r.vyuziti, 0, stropGrafu(Math.max(100, rozsah(r.vyuziti)[1])), 100);
    document.body.dataset.prubehu = String(r.zpracovano);
  }

  /** Zapíše, co prut nesl a kolik unese; když samotná veličina mez nepřekročila, přidá celkové využití. */
  function zapisNamahani(zpusob: number, velicina: number, unosnost: number, mira: number): string {
    const klic: KlicTextu =
      zpusob === ZPUSOB_OHYB ? "namahani.ohyb" : zpusob === ZPUSOB_SMYK ? "namahani.smyk" : zpusob === ZPUSOB_TAH ? "namahani.tah" : "namahani.tlak";
    const co = t(klic, { velicina: cislo(velicina / 1000, 1), unosnost: cislo(unosnost / 1000, 1) });
    if (velicina < 0.97 * unosnost * Math.min(1, mira)) return t("namahani.soubeh", { co, mira: procenta(mira) });
    // Moment těsně pod únosností: prut na mezi držel a trvale se ohýbal (plastický kloub), až povolil.
    return zpusob === ZPUSOB_OHYB && velicina < unosnost ? t("namahani.vycerpano", { co }) : co;
  }

  /** Je prut návrhu s tímto pořadím lano? */
  const jeLano = (b: Beh, prut: number): boolean => {
    const prvekPrutu = b.navrh.pruty[prut]?.prvek;
    return prvekPrutu !== undefined && KATALOG[prvekPrutu].druh === "lano";
  };

  /** Údaje o prutu, na který hráč při zkoušce klikl, a reakce v podporách. */
  function obnovUdajePrutu(): void {
    const radek = (nazev: string, hodnota: string): HTMLElement[] => {
      const dt = document.createElement("dt");
      dt.textContent = nazev;
      const dd = document.createElement("dd");
      dd.textContent = hodnota;
      return [dt, dd];
    };
    const b = beh;
    const prut = b?.oznaceny ?? null;
    const udaje = udaj("prut-udaje");
    const napoveda = udaj("prut-napoveda");
    nadpisSJednotkou(udaj("graf-prut-nadpis"), prut === null ? t("analyza.vyuzitiBezPrutu") : t("analyza.vyuzitiPrutu", { prut: prut + 1 }));
    document.body.dataset.vybranyPrut = prut === null ? "" : String(prut);
    if (!b || prut === null) {
      udaje.replaceChildren();
      napoveda.textContent = t("analyza.prut.zadny");
    } else {
      const prvekPrutu = b.navrh.pruty[prut]?.prvek;
      const jmeno = prvekPrutu ? nazevPrvku(prvekPrutu).toLocaleLowerCase("cs") : "";
      const radky = radek(t("analyza.prut.kdo"), t("analyza.prut.kdoHodnota", { prut: prut + 1, prvek: jmeno }));
      const o = b.vysledek?.obalka[prut];
      if (!o) napoveda.textContent = t("analyza.prut.pocitaSe");
      else if (o.zpusob === ZPUSOB_ZADNY || !(o.vyuziti > 0)) napoveda.textContent = t("analyza.prut.bezNamahani");
      else {
        napoveda.textContent = "";
        radky.push(
          ...radek(t("analyza.prut.vyuziti"), t("analyza.prut.vyuzitiHodnota", { vyuziti: procenta(o.vyuziti), cas: zapisCasu(o.cas) })),
          ...radek(t("analyza.prut.rozhoduje"), t(nazevZpusobu(o.zpusob))),
          ...radek(
            t(
              o.zpusob === ZPUSOB_OHYB
                ? "analyza.prut.velicina.ohyb"
                : o.zpusob === ZPUSOB_SMYK
                  ? "analyza.prut.velicina.smyk"
                  : o.zpusob === ZPUSOB_TAH
                    ? "analyza.prut.velicina.tah"
                    : "analyza.prut.velicina.tlak",
            ),
            t("analyza.prut.zCeho", {
              velicina: cislo(o.velicina / 1000, 1),
              unosnost: cislo(o.unosnost / 1000, 1),
              jednotka: o.zpusob === ZPUSOB_OHYB ? "kNm" : "kN",
            }),
          ),
          ...radek(t("analyza.prut.osova"), t(o.osova >= 0 ? "analyza.prut.tah" : "analyza.prut.tlak", { sila: cislo(Math.abs(o.osova) / 1000, 1) })),
          ...radek(t("analyza.prut.moment"), t("analyza.prut.momentHodnota", { moment: cislo(o.moment / 1000, 2) })),
        );
      }
      udaje.replaceChildren(...radky);
    }

    // Reakce v podporách jsou známé až po dopočítání zkoušky.
    const reakce = b?.vysledek?.reakce ?? [];
    prvek('[data-cast="reakce"]', HTMLElement).hidden = reakce.length === 0;
    udaj("reakce").replaceChildren(
      ...reakce.flatMap((r) => {
        const st = b!.navrh.stycniky[r.stycnik];
        const casti = [t("analyza.reakce.svisla", { sila: cislo(r.svisla / 1000, 1) })];
        if (r.vodorovna > 50) casti.push(t("analyza.reakce.vodorovna", { sila: cislo(r.vodorovna / 1000, 1) }));
        if (r.nadzvednuti < -50) casti.push(t("analyza.reakce.nadzvednuti", { sila: cislo(-r.nadzvednuti / 1000, 1) }));
        return radek(t("analyza.reakce.kde", { x: cislo(st?.x ?? 0, 0) }), casti.join("\n"));
      }),
    );
  }

  /** Naplní analytický panel tím, co se v právě zobrazeném režimu dá říct. */
  function obnovAnalyzu(): void {
    const stavi = rezim === "stavba";
    // Při stavbě má panel co ukázat jen tam, kde se hraje o kmitání; při zkoušce vždy.
    const kDispozici = stavi ? uroven.osaFrekvenci : true;
    tlacitkoAnalyzy.hidden = !kDispozici;
    const otevrena = analyzaOtevrena && kDispozici;
    tlacitkoAnalyzy.setAttribute("aria-pressed", String(otevrena));
    panelAnalyzy.hidden = !otevrena;
    document.body.dataset.analyza = otevrena ? "otevrena" : "zavrena";
    if ((!otevrena || !stavi) && tvarKmitani !== null) {
      tvarKmitani = null;
      platno.prekresli();
    }
    if (!otevrena) return;

    // Části panelu podle režimu: při stavbě rozbor mostu, při zkoušce průběhy a síly.
    for (const cast of ["krivka", "krivka-popis", "tvary"]) {
      if (!stavi) prvek(`[data-cast="${cast}"]`, HTMLElement).hidden = true;
    }
    for (const cast of ["graf-pruhyb", "graf-kmitani", "graf-prut", "prut", "reakce"]) {
      prvek(`[data-cast="${cast}"]`, HTMLElement).hidden = stavi;
    }
    if (!stavi) {
      udaj("analyza-prazdna").hidden = true;
      prvek('[data-cast="graf-kmitani"]', HTMLElement).hidden = !(beh && (beh.budic !== null || (maLidi && !beh.pokus)));
      obnovUdajePrutu();
      nakreslenePrubehy = "";
      return;
    }

    // Dokud se po úpravě mostu počítá nový rozbor, zůstává v panelu ten minulý.
    if (rozbor === undefined) return;
    const krivka = rozbor?.krivka ?? null;
    prvek('[data-cast="krivka"]', HTMLElement).hidden = krivka === null;
    prvek('[data-cast="krivka-popis"]', HTMLElement).hidden = krivka === null;
    if (krivka) {
      const hlavni = krivka.obsazeny ?? krivka.prazdny;
      // Křivka se počítá do 8 Hz, ale kreslí a hodnotí jen tam, kam sahá osa: špička výš, kde
      // lidé most nebudí, by stáhla měřítko a o výsledku nic neříká.
      const bodu = Math.min(hlavni.length, Math.round((ROZSAH_OSY - krivka.od) / krivka.krok) + 1);
      const vrcholy = vrcholyKrivky(hlavni.slice(0, bodu), krivka.od, krivka.krok);
      const nejvyssi = vrcholy.reduce((a, b) => (b.hodnota > a.hodnota ? b : a), { f: 0, hodnota: 0 });
      // Svislé měřítko podle špiček v rozsahu osy: náběh ke špičce, která leží až za osou, by
      // ho stáhl a špičky, o které jde, by nebyly vidět (křivka se nahoře ořízne).
      let nejvic = 0;
      for (const cara of [krivka.prazdny, krivka.obsazeny ?? []]) {
        const usek = cara.slice(0, bodu);
        const spicky = vrcholyKrivky(usek, krivka.od, krivka.krok);
        for (const spicka of spicky) nejvic = Math.max(nejvic, spicka.hodnota);
        // Křivka bez špičky v rozsahu: měřítko podle největší hodnoty.
        if (spicky.length === 0) for (const hodnota of usek) nejvic = Math.max(nejvic, hodnota);
      }
      // Měření budičem platí jen pro most, na kterém vzniklo.
      const mereni = zmereno?.navrh === editor.navrh ? zmereno : null;
      for (const bod of [...(mereni?.cara ?? []), ...(mereni?.body ?? [])]) {
        if (bod.f <= ROZSAH_OSY) nejvic = Math.max(nejvic, bod.a);
      }
      stropKrivky = Math.max(stropKrivky, stropGrafu(nejvic));
      platnoKrivky.dataset.zmereno = String((mereni?.cara.length ?? 0) + (mereni?.body.length ?? 0));
      const graf = pripravGraf(platnoKrivky);
      if (graf) {
        nakresliKrivku(graf.ctx, graf.sirka, graf.vyska, {
          ...krivka,
          slozky: slozkyLidi,
          rozsah: ROZSAH_OSY,
          strop: stropKrivky,
          ...(mereni ? { zmereno: mereni } : {}),
        });
      }
      platnoKrivky.dataset.vrcholu = String(vrcholy.length);
      platnoKrivky.dataset.nejvyssi = nejvyssi.hodnota.toFixed(4);
      // Totéž pro prázdný most (přerušovaná čára): na něm je vidět, co s mostem dělá sám tlumič.
      const vrcholyPrazdneho = vrcholyKrivky(krivka.prazdny.slice(0, bodu), krivka.od, krivka.krok);
      platnoKrivky.dataset.vrcholuPrazdny = String(vrcholyPrazdneho.length);
      platnoKrivky.dataset.nejvyssiPrazdny = vrcholyPrazdneho.reduce((a, b) => Math.max(a, b.hodnota), 0).toFixed(4);
      platnoKrivky.dataset.strop = String(stropKrivky);
      const klic = krivka.obsazeny ? "analyza.krivka.spickaSLidmi" : "analyza.krivka.spicka";
      // Křivka bez vrcholu v rozsahu osy (tuhý most, lidé ho utlumí) žádnou „nejvyšší špičku“ nemá.
      udaj("krivka-popis").textContent =
        (nejvyssi.hodnota > 0 ? t(klic, { hodnota: cislo(nejvyssi.hodnota, 2), f: cislo(nejvyssi.f, 2) }) : t("analyza.krivka.bezSpicky")) +
        (mereni ? ` ${t("analyza.krivka.zmereno")}` : "");
    }

    const frekvence = rozbor?.stabilni ? rozbor.frekvence : [];
    prvek('[data-cast="tvary"]', HTMLElement).hidden = frekvence.length === 0;
    if (tvarKmitani !== null && tvarKmitani >= frekvence.length) tvarKmitani = null;
    udaj("tvary").replaceChildren(
      ...frekvence.map((f, poradi) => {
        const tlacitko = document.createElement("button");
        tlacitko.type = "button";
        tlacitko.className = "tlacitko";
        tlacitko.dataset.tvar = String(poradi);
        tlacitko.textContent = t("analyza.tvar", { poradi: poradi + 1, f: cislo(f, 2) });
        tlacitko.title = t("analyza.tvar.popis", { f: cislo(f, 2) });
        tlacitko.setAttribute("aria-pressed", String(tvarKmitani === poradi));
        tlacitko.addEventListener("click", () => {
          tvarKmitani = tvarKmitani === poradi ? null : poradi;
          obnovAnalyzu();
          platno.prekresli();
        });
        return tlacitko;
      }),
    );
    // Most s laděným tlumičem kmitá se závažím jako jedna soustava: frekvence tvarů jsou pak
    // jiné než na ose, která ukazuje most bez tlumiče.
    const poznamkaTvaru = udaj("tvary-poznamka");
    const holy = rozbor?.stabilni ? rozbor.bezTlumicu?.prazdny[0] : undefined;
    poznamkaTvaru.hidden = holy === undefined;
    if (holy !== undefined) poznamkaTvaru.textContent = t("analyza.tvary.tlumic", { f: cislo(holy, 2) });
    udaj("analyza-prazdna").hidden = krivka !== null || frekvence.length > 0;
    document.body.dataset.tvar = tvarKmitani === null ? "" : String(tvarKmitani);
  }

  /** Promítne hlasitost do tlačítka v liště a do háčků pro testy. */
  function obnovZvuk(): void {
    const hlasitost = ozvuceni.hlasitost;
    tlacitkoZvuku.textContent = t(Ozvuceni.dostupne ? `zvuk.${hlasitost}` : "zvuk.nedostupny");
    tlacitkoZvuku.disabled = !Ozvuceni.dostupne;
    tlacitkoZvuku.setAttribute("aria-pressed", String(hlasitost !== "vypnuto"));
    document.body.dataset.zvuk = hlasitost;
    document.body.dataset.zvukKontext = ozvuceni.stav;
    obnovPoctyZvuku();
  }

  /** Kolik zvuků kterého druhu hra zahrála; háček pro testy. Zapisuje jen to, co se změnilo. */
  const zapsanePocty = new Map<string, number>();
  function obnovPoctyZvuku(): void {
    for (const druh of DRUHY_ZVUKU) {
      const pocet = ozvuceni.zaznelo.get(druh) ?? 0;
      if (zapsanePocty.get(druh) === pocet) continue;
      zapsanePocty.set(druh, pocet);
      document.body.setAttribute(`data-zvuku-${druh}`, String(pocet));
    }
  }

  /** Další hlasitost v řadě nahlas, potichu, vypnuto. Novou hlasitost předvede vrznutím. */
  function prepniZvuk(): void {
    if (!Ozvuceni.dostupne) return;
    const dalsi = HLASITOSTI[(HLASITOSTI.indexOf(ozvuceni.hlasitost) + 1) % HLASITOSTI.length]!;
    ozvuceni.nastavHlasitost(dalsi);
    uloziste.hlasitost = dalsi;
    ozvuceni.probud();
    obnovZvuk();
    if (dalsi === "vypnuto") return;
    const ukazka: Zvuk = { druh: "vrzani", cas: 0, x: 0, y: 0, sila: 0.8, velikost: 0.4, material: "drevo", odstin: 0.31, puvod: -1 };
    // Čerstvě vzniklý zvukový kontext se rozbíhá okamžik po gestu.
    window.setTimeout(() => {
      ozvuceni.zahraj([ukazka], () => 0);
      obnovZvuk();
    }, 150);
  }

  /** Odkud zní zvuk z daného místa světa: −1 vlevo až 1 vpravo podle polohy na plátně. */
  function panorama(x: number, y: number): number {
    const misto = svetNaObraz(kamera, platno.rozmer, { x, y });
    const podil = (2 * misto.x) / platno.rozmer.sirka - 1;
    return SIRKA_ZVUKU * Math.max(-1, Math.min(1, podil));
  }

  /**
   * Zavěsí pod vybrané styčníky laděný tlumič, nebo ho odebere. Nový tlumič se naladí na
   * rytmus, kterým lidé most rozkmitají nejvíc (viz `cilLadeni`), i když ten, který most už má,
   * je naladěný jinak; závaží má stejné jako on. Když se rozbor po poslední úpravě teprve
   * počítá, poslouží ten předchozí.
   */
  function zavesLadenyTlumic(): void {
    const vzor = editor.navrh.stycniky.find((st) => st.tlumic)?.tlumic;
    const frekvence = cilLadeni() ?? vzor?.frekvence ?? 2;
    editor.prepniLadenyTlumic(vzor?.hmota ?? Math.min(300, uroven.nejvetsiTlumic), frekvence);
  }

  /**
   * Klávesa L a tlačítko v nastavení: s vybraným styčníkem tlumič zavěsí nebo odebere,
   * bez výběru zapne věšení tlumičů kliknutím (totéž co položka v paletě).
   */
  function prepniLadenyTlumic(): void {
    if (rezim !== "stavba") return;
    if (editor.ladenyTlumicVyberu === null) prepniPridavek("ladeny");
    else zavesLadenyTlumic();
  }

  function smazVybrane(): void {
    if (rezim === "stavba" && editor.smazVybrane()) skryjHlaseni();
  }

  function zrcadli(): void {
    if (rezim !== "stavba") return;
    const jenVyber = editor.zrcadliJenVyber;
    editor.zrcadli();
    if (editor.posledniDuvod) ukazHlaseni(textDuvodu(editor.posledniDuvod, null), "varovani", true);
    else if (jenVyber) ukazHlaseni(t("zrcadleni.jenVyber"), "info", true);
  }

  function prepniVyber(): void {
    if (rezim !== "stavba") return;
    nastroj = nastroj === "vyber" ? "kresleni" : "vyber";
    obnovStavbu();
  }

  function prepniBrnknuti(): void {
    if (rezim !== "stavba" || !uroven.osaFrekvenci) return;
    if (editor.navrh.pruty.length === 0) {
      ukazHlaseni(t("brnknuti.bezMostu"), "info", true);
      return;
    }
    nastroj = nastroj === "brnknuti" ? "kresleni" : "brnknuti";
    editor.zrusVyber();
    if (nastroj === "brnknuti") ukazHlaseni(t("brnknuti.navod"), "info", false);
    else skryjHlaseni();
    obnovStavbu();
  }

  function prepniBudic(): void {
    if (rezim !== "stavba" || !uroven.budic) return;
    if (editor.navrh.pruty.length === 0) {
      ukazHlaseni(t("budic.bezMostu"), "info", true);
      return;
    }
    nastroj = nastroj === "budic" ? "kresleni" : "budic";
    editor.zrusVyber();
    if (nastroj === "budic") ukazHlaseni(t("budic.navod"), "info", false);
    else skryjHlaseni();
    obnovStavbu();
  }

  /** Posune stálý rytmus budiče o `kroku` kroků; z přelaďování začíná na vlastní frekvenci mostu. */
  function zmenRytmusBudice(kroku: number): void {
    const vychozi = rytmusBudice ?? rozbor?.frekvenceObsazeneho[0] ?? rozbor?.frekvence[0] ?? 2;
    const novy = Math.round((vychozi + (rytmusBudice === null ? 0 : kroku * KROK_BUDICE)) / KROK_BUDICE) * KROK_BUDICE;
    // Stálý rytmus jde nastavit po celé ose frekvencí, i nad rozsah přelaďování.
    rytmusBudice = Math.round(100 * Math.max(ROZSAH_BUDICE.od, Math.min(ROZSAH_OSY, novy))) / 100;
    obnovStavbu();
  }

  /** Pustí budič do styčníku návrhu (pořadí v návrhu) v nastaveném rytmu. */
  function spustBudic(stycnik: number): void {
    const staly = rytmusBudice !== null;
    spustZkousku(undefined, {
      stycnik,
      sila: SILA_BUDICE,
      od: rytmusBudice ?? ROZSAH_BUDICE.od,
      do: rytmusBudice ?? ROZSAH_BUDICE.do,
      trvani: staly ? TRVANI_STALEHO_RYTMU : ROZSAH_BUDICE.trvani,
    });
  }

  // ---- Zkouška ----

  function delkaDeje(b: Beh): number {
    return b.spocitanoVse ? b.trvani : Math.max(b.trvani, b.zaznam.konec);
  }

  function spustZkousku(brnknuti?: { stycnik: number; sila: number }, budic?: BudicZkousky, zlom = false): void {
    if (rezim !== "stavba") return;
    editor.zrusTah();
    // Brnknout a rozkmitat budičem se dá i most dražší, než je rozpočet; zkoušet ne, a to ani
    // do zlomu (únosnost na korunu se měří jen u mostu, který se do rozpočtu vejde).
    const pokus = brnknuti !== undefined || budic !== undefined;
    const druhPokusu = brnknuti ? "brnknuti" : budic ? "budic" : zlom ? "zlom" : null;
    const prekazka = prekazkyZkousky(editor.navrh, uroven).filter((p) => !(pokus && p.druh === "nad-rozpocet"))[0];
    if (prekazka) {
      ukazHlaseni(textDuvodu(prekazka.druh, null), "varovani", true);
      zapis("zkouska.odmitnuta", { duvod: prekazka.druh, pokus: druhPokusu, cena: cenaNavrhu(editor.navrh) });
      return;
    }
    // Zkouška do zlomu zatěžuje mostovku: bez mostu od břehu k břehu není co měřit.
    const mezera = zlom ? mezeryTras(editor.navrh, uroven)[0] : undefined;
    if (mezera) {
      ukazHlaseni(t("zlom.chybiMostovka", { od: cislo(mezera.od, 0), do: cislo(mezera.do, 0) }), "varovani", true);
      zapis("zkouska.odmitnuta", { duvod: "zlom-bez-mostovky", pokus: druhPokusu, cena: cenaNavrhu(editor.navrh) });
      return;
    }
    skryjHlaseni();
    editor.zrusVyber();

    // Háček s výsledkem zkoušky do zlomu patří jen té poslední.
    delete document.body.dataset.zlom;
    // Každá zkouška má vlastní vlákno, takže zprávy z opuštěné zkoušky nemůžou dorazit do nové.
    klient?.ukonci();
    const novy: Beh = {
      navrh: editor.navrh,
      zaznam: new Zaznam(),
      ucastnici: [],
      udalosti: [],
      trvani: 0,
      spocitanoVse: false,
      vysledek: null,
      vysledekUkazan: false,
      naKonecPoVypoctu: false,
      oznaceny: null,
      pokus: pokus || zlom,
      budic: budic ?? null,
      zlom,
      zlomSePocita: false,
      bezRovnovahy: false,
      zaber: { stav: "hleda", vynuceno: false },
      kmitaniOhlaseno: false,
      zvetseni: 1,
      zvetseniTed: 1,
      zvetsene: new Float32Array(0),
      efekty: { splouchnuti: [], snimku: 0, zlomy: [], udalosti: 0, pady: [] },
    };
    beh = novy;
    delete document.body.dataset.zaber;
    delete document.body.dataset.kmitaniNadMez;
    // Zkoušku pouští gesto hráče, takže smí vzniknout zvuk.
    ozvuceni.probud();
    poslech = new Poslech(uroven, editor.navrh, brnknuti?.stycnik ?? -1);
    try {
      klient = new KlientZkousky();
    } catch (chyba) {
      beh = null;
      poslech = null;
      ukazHlaseni(t("zkouska.chyba", { duvod: chyba instanceof Error ? chyba.message : String(chyba) }), "varovani", false);
      return;
    }
    if (!pokus && !zlom) zkousekVUrovni += 1;
    vypocetOd = Date.now();
    zapis("zkouska.start", {
      navrh: navrhNaText(editor.navrh),
      cena: cenaNavrhu(editor.navrh),
      prutu: editor.navrh.pruty.length,
      pokus: druhPokusu,
      uprav: upravOdZkousky,
      sekund: sekundVUrovni(),
    });
    upravOdZkousky = 0;
    klient.poslouchej((zprava) => prijmi(novy, zprava));
    klient.posli({
      typ: "start",
      vstup: {
        uroven,
        navrh: editor.navrh,
        nasada: nasadaUrovne(uroven),
        verzeFyziky: VERZE_FYZIKY,
        ...(brnknuti ? { brnknuti } : {}),
        ...(budic ? { budic } : {}),
        ...(zlom ? { zlom: ZKOUSKA_DO_ZLOMU } : {}),
      },
    });

    rezim = "zkouska";
    obnovZvetseni();
    oznacSlozeni();
    oznacPoruchu();
    rady = null;
    prehravani = { cas: 0, bezi: true, rychlost: prehravani.rychlost };
    ukazPanelVysledku(false);
    document.body.dataset.rezim = rezim;
    obnovRazitko();
    document.body.dataset.zkouska = "pocita";
    delete document.body.dataset.otisk;
    delete document.body.dataset.pricina;
    obnovStavbu();
    obnovOsu();
    // Kde na trase chybí mostovka, tam provoz spadne: hráč se to má dozvědět hned, ne až z výsledku.
    if (!pokus && !zlom) {
      const mezera = mezeryTras(editor.navrh, uroven)[0];
      if (mezera) {
        const klic = mezera.trasa.druh === "kolej" ? "zkouska.mezera.kolej" : "zkouska.mezera";
        ukazHlaseni(t(klic, { od: cislo(mezera.od, 0), do: cislo(mezera.do, 0) }), "varovani", false);
      }
    }
  }

  function zpetKeStavbe(): void {
    if (rezim !== "zkouska") return;
    zapis("zkouska.zavrena", { hotova: beh?.vysledek != null, prehrano: Math.round(prehravani.cas * 10) / 10 });
    klient?.ukonci();
    klient = null;
    // Záběr se ruší dřív, než se zkouška zahodí: jinak by pohled zůstal přiblížený.
    zrusZaber();
    delete document.body.dataset.zaber;
    // Co zkouška řekla o kmitání, patří k výsledku: při stavbě háčky nezůstávají.
    for (const hacek of ["kmitaniNadMez", "kmitaniFrekvence", "kmitaniRytmus", "pokusTvar"]) delete document.body.dataset[hacek];
    // Kde to povolilo první, zůstane na výkresu vidět i při stavbě, dokud hráč most nezmění.
    posledniPorucha = beh ? mistoPrvniPoruchy(beh) : null;
    // Nedopočítaná zkouška nemá výsledek ani obálku; zahodí se.
    if (beh && !beh.vysledek) beh = null;
    if (beh) beh.oznaceny = null;
    poslech = null;
    ozvuceni.ztis();
    rezim = "stavba";
    kreslenePolohy = null;
    obnovZvetseni();
    oznacSlozeni();
    oznacPoruchu();
    spodekVykresu.zahod();
    prehravani = { ...prehravani, bezi: false };
    ukazPanelVysledku(false);
    document.body.dataset.rezim = rezim;
    obnovRazitko();
    skryjHlaseni();
    // Osa frekvencí teď má co říct navíc: co zkouška téhož mostu naměřila.
    obnovOsuFrekvenci();
    // Po třetí zkoušce, která neprošla, hra jednou připomene nápovědu.
    if (napoveda && !napovedaNabidnuta && !napovedaPouzita && nezdaru >= 3 && rekord?.medaile.pruchod !== true) {
      napovedaNabidnuta = true;
      ukazHlaseni(t("napoveda.nabidka"), "info", false);
      zapis("napoveda.nabidnuta", { zkousek: zkousekVUrovni, sekund: sekundVUrovni() });
    }
    obnovMedaile();
    obnovStavbu();
    obnovOsu();
  }

  function prijmi(b: Beh, zprava: ZpravaZeZkousky): void {
    if (b !== beh) return;
    switch (zprava.typ) {
      case "zacatek":
        b.trvani = zprava.trvani;
        b.ucastnici = zprava.ucastnici;
        b.bezRovnovahy = zprava.bezRovnovahy;
        obnovZnacky();
        obnovOsu();
        break;
      case "zaznam":
        for (const stavba of zprava.topologie) b.zaznam.pridejTopologii(stavba);
        for (const s of zprava.snimky) b.zaznam.pridej(s);
        if (zprava.udalosti.length > 0) {
          b.udalosti.push(...zprava.udalosti);
          obnovZnacky();
        }
        obnovOsu();
        break;
      case "konec": {
        const vysledek = zprava.vysledek;
        b.vysledek = vysledek;
        b.trvani = vysledek.trvani;
        b.spocitanoVse = true;
        klient?.ukonci();
        klient = null;
        if (!b.pokus) {
          nezdaru = vysledek.pruchod ? 0 : nezdaru + 1;
          predchoziVysledek = posledniVysledek;
          posledniVysledek = vysledek;
          if (vysledek.pruchod && !vysledek.rozpad) {
            prosleMosty.add(navrhNaText(b.navrh));
            // Pamatuje se i přes zavření hry (jen v kampani: pískoviště výzvy nemá).
            if (sandbox === null) uloziste.zapisProsly(uroven.id, otiskNavrhu(b.navrh));
          }
          // V pískovišti se nesoutěží: rekordy ani medaile se tam nevedou.
          if (!vysledek.rozpad && sandbox === null) {
            // Hmotnost mostu patří k výzvě o nejlehčí most; počítá se jen u mostu, který prošel.
            rekord = uloziste.zapocitej(uroven.id, vysledek.medaile, vysledek.cena, VERZE_FYZIKY, hmotnostNavrhu(b.navrh, uroven));
          }
        } else if (b.zlom && vysledek.zlom && !vysledek.rozpad && sandbox === null) {
          // Únosnost na korunu se počítá jen mostu, který úrovní prošel: jinak by výzvu vyhrál
          // most bez toho, co úroveň učí (bez závaží, bez pístu), protože je levnější.
          b.zlomSePocita = prosleMosty.has(navrhNaText(b.navrh)) || uloziste.prosel(uroven.id, otiskNavrhu(b.navrh));
          if (b.zlomSePocita) {
            rekord = uloziste.zapocitejZlom(uroven.id, unosnostNaKorunu(vysledek.zlom.celkem, vysledek.cena), VERZE_FYZIKY);
          }
        }
        if (prehravani.cas > b.trvani || b.naKonecPoVypoctu) prehravani = { ...prehravani, cas: b.trvani, bezi: false };
        b.zvetseni = spocitejZvetseni(b);
        obnovZvetseni();
        zapisVysledek(b, vysledek);
        document.body.dataset.zkouska = "hotovo";
        document.body.dataset.otisk = vysledek.otisk;
        obnovZnacky();
        obnovOsu();
        // Síly ve vybraném prutu a reakce v podporách jsou známé až teď.
        obnovAnalyzu();
        break;
      }
      case "chyba": {
        const duvod = t(`zkouska.chyba.${zprava.kod}`) + (zprava.podrobnosti ? ` (${zprava.podrobnosti})` : "");
        zapis("zkouska.chyba", { kod: zprava.kod, podrobnosti: (zprava.podrobnosti ?? "").slice(0, 300) });
        document.body.dataset.zkouska = "chyba";
        zpetKeStavbe();
        ukazHlaseni(t("zkouska.chyba", { duvod }), "varovani", false);
        break;
      }
      case "pripraveno":
      case "rozbor":
        break;
    }
  }

  /** Zapíše do deníku, jak zkouška dopadla, a deník hned odešle: výsledek je to nejcennější, co v něm je. */
  function zapisVysledek(b: Beh, vysledek: VysledekZkousky): void {
    const prvni = b.udalosti.find((u) => u.druh === "poruseni");
    const zpusoby: Record<number, string> = {
      [ZPUSOB_TAH]: "tah",
      [ZPUSOB_TLAK]: "tlak",
      [ZPUSOB_OHYB]: "ohyb",
      [ZPUSOB_SMYK]: "smyk",
    };
    const posudekDoDeniku = posudekBehu(b);
    const kmitaniDoDeniku = kmitaniBehu(b);
    const odhadDoDeniku = rozborBehu(b)?.odhad?.zrychleni ?? null;
    zapis("zkouska.konec", {
      pruchod: vysledek.pruchod,
      // Most bez klidové polohy: složil se (a proč), nebo na něm jen visel volný prut.
      slozeni: posudekDoDeniku?.slozeni?.duvod ?? (posudekDoDeniku?.volny ? "volny-konec" : null),
      zaber: zaberZapnuty,
      pokus: b.zlom ? "zlom" : b.budic ? "budic" : b.pokus ? "brnknuti" : null,
      // Zkouška do zlomu: kolik most unesl (kN) a kolik je to na korunu (N/Kč).
      zlom: vysledek.zlom ? Math.round(vysledek.zlom.celkem / 1000) : null,
      zlomNaKorunu: vysledek.zlom ? Math.round(unosnostNaKorunu(vysledek.zlom.celkem, vysledek.cena) * 1000) / 1000 : null,
      // Stupně výzev úrovně po téhle zkoušce (0 až 3 za cenu, hmotnost a únosnost na korunu).
      vyzvy: prahy ? { ...stupneVyzev(prahy, rekord).stupne } : null,
      hmotnost: Math.round(hmotnostNavrhu(b.navrh, uroven)),
      sekund: sekundVUrovni(),
      zkouska: zkousekVUrovni,
      ucastniku: vysledek.ucastniku,
      prejelo: vysledek.prejelo,
      spadlo: vysledek.spadlo,
      poruseni: vysledek.poruseni,
      vyuziti: Math.round(vysledek.nejvetsiVyuziti * 1000) / 1000,
      cena: vysledek.cena,
      medaile: { ...vysledek.medaile },
      kmitani: vysledek.komfort ? Math.round(vysledek.komfort.zrychleni * 100) / 100 : null,
      // Na jaké frekvenci most kmital a kolikátý násobek kroku lidí to byl (1 až 3; null, když žádný).
      kmitaniHz: kmitaniDoDeniku ? Math.round(kmitaniDoDeniku.nejvic.frekvence * 10) / 10 : null,
      kmitaniNasobek: kmitaniDoDeniku?.nejvic.rytmus?.nasobek ?? null,
      // Odhad kmitání, který hra ukazovala při stavbě (m/s²; null, když ho pro ten most neměla).
      kmitaniOdhad: odhadDoDeniku !== null ? Math.round(odhadDoDeniku * 100) / 100 : null,
      // Kdy kmitání přesáhlo mez úrovně (s); null, když ji nepřesáhlo.
      kmitaniNadMez: vysledek.komfort?.prekroceno != null ? Math.round(vysledek.komfort.prekroceno * 10) / 10 : null,
      autobus: vysledek.komfortCestujicich ? Math.round(vysledek.komfortCestujicich.zrychleni * 100) / 100 : null,
      bezRovnovahy: vysledek.bezRovnovahy,
      rozpad: vysledek.rozpad,
      zvednuto: vysledek.pohyb ? vysledek.pohyb.zvednuto : null,
      zamceno: vysledek.pohyb ? vysledek.pohyb.zamceno : null,
      preklopeno: vysledek.pohyb ? vysledek.pohyb.preklopeno : null,
      mezera: vysledek.mezera,
      dosednuti: vysledek.pohyb ? Math.round(vysledek.pohyb.razDosednuti / 1000) : null,
      narazyLodi: vysledek.lode.narazilo,
      trvani: Math.round(vysledek.trvani * 10) / 10,
      vypocetMs: Date.now() - vypocetOd,
      prvni:
        prvni && prvni.druh === "poruseni"
          ? {
              prvek: b.navrh.pruty[prvni.prut]?.prvek ?? "?",
              zpusob: zpusoby[prvni.zpusob] ?? "vzper",
              cas: Math.round(prvni.cas * 10) / 10,
            }
          : null,
    });
    void denik.odesli();
  }

  /** Promítne stav zkoušky a přehrávání do lišty a časové osy a překreslí výkres. */
  function obnovOsu(): void {
    const zkousi = rezim === "zkouska";
    tlacitkoZkousky.textContent = t(zkousi ? "zkouska.zastavit" : "zkouska.spustit");
    tlacitkoZkousky.setAttribute("aria-pressed", String(zkousi));
    for (const tlacitko of tlacitkaRychlosti) {
      tlacitko.setAttribute("aria-pressed", String(Number(tlacitko.dataset.rychlost) === prehravani.rychlost));
    }
    if (zkousi && beh) {
      const delka = delkaDeje(beh);
      tlacitkoPrehrat.textContent = t(prehravani.bezi ? "zkouska.pozastavit" : "zkouska.prehrat");
      tahlo.max = String(delka > 0 ? delka : 1);
      tahlo.value = String(prehravani.cas);
      const spocitano = beh.spocitanoVse ? 1 : delka > 0 ? Math.min(1, beh.zaznam.konec / delka) : 0;
      pruhSpocitano.style.setProperty("--spocitano", String(spocitano));
      udaj("cas").textContent = beh.spocitanoVse
        ? `${zapisCasu(prehravani.cas)} / ${zapisCasu(delka)}`
        : `${zapisCasu(prehravani.cas)} · ${t("zkouska.pocitaSe")}`;
    }
    platno.prekresli();
  }

  /** Co značky na časové ose znamenají: čas a popis pro bublinu nad osou. */
  let popisyZnacek: { cas: number; popis: string; lidi?: number }[] = [];
  /** Časovač, který po dotyku bublinu nad osou za chvíli schová. */
  let casovacBubliny = 0;

  /** Účastník provozu jedním slovem („chodec“, „nákladní vůz“). */
  function nazevProvozu(druh: string): string {
    const klic = `provoz.${druh}`;
    return jeKlicTextu(klic) ? t(klic) : t("provoz.jiny");
  }

  /** Značky na časové ose: výjezdy účastníků, porušení prutů a pády. */
  function obnovZnacky(): void {
    popisyZnacek = [];
    if (!beh) {
      bublinaOsy.hidden = true;
      znackyOsy.replaceChildren();
      return;
    }
    const b = beh;
    const delka = delkaDeje(b);
    const znacka = (cas: number, druh: string, popis: string, lidi?: number): HTMLElement => {
      const uzel = document.createElement("span");
      uzel.className = `osa__znacka osa__znacka--${druh}`;
      uzel.style.left = `${(100 * Math.min(1, Math.max(0, cas / delka))).toFixed(2)}%`;
      popisyZnacek.push(lidi === undefined ? { cas, popis } : { cas, popis, lidi });
      return uzel;
    };
    // Most bez pístu se nezvedne a most bez zámku nemá co odemykat: značky říkají, co se stalo.
    const maPist = b.navrh.pruty.some((p) => KATALOG[p.prvek].druh === "pist");
    const maZamek = b.navrh.stycniky.some((st) => st.zamek);
    /** Kolik lidí je v řadě davu nebo útvaru, která spadla; u jednotlivce a vozidla 1. */
    const lidiVPadu = (u: Udalost): number =>
      u.druh === "pad" ? (b.ucastnici.find((ucastnik) => ucastnik.polozka === u.polozka && ucastnik.clen === u.clen)?.lidi ?? 1) : 1;
    if (!(delka > 0)) return;
    // Výjezdy podle položek jízdního řádu: řady davu nebo útvaru, které vyrážejí ve stejný
    // okamžik, mají jednu značku a popis celé položky („dav, 120 lidí“), ne počet řad.
    const vyjezdy = new Map<string, { cas: number; polozka: number; druh: string }>();
    for (const u of b.ucastnici) {
      const klic = `${u.start}|${u.polozka}`;
      if (!vyjezdy.has(klic)) vyjezdy.set(klic, { cas: u.start, polozka: u.polozka, druh: u.druh });
    }
    const kdoVyrazi = (v: { polozka: number; druh: string }): string => {
      const polozka = uroven.jizdniRad[v.polozka];
      return polozka ? kdoJede(polozka) : nazevProvozu(v.druh);
    };
    const popisUdalosti = (u: Udalost): string => {
      switch (u.druh) {
        case "poruseni":
          return t("osa.znacka.poruseni", { prut: u.prut + 1 });
        case "sjeti":
          return t("osa.znacka.sjeti");
        case "pad": {
          // Řada davu nebo útvaru je víc lidí: píše se počet, ne název celé skupiny.
          const kdo = b.ucastnici.find((ucastnik) => ucastnik.polozka === u.polozka && ucastnik.clen === u.clen);
          const lidi = lidiVPadu(u);
          return lidi > 1 ? t("osa.znacka.padLidi", { pocet: lidi }) : t("osa.znacka.pad", { kdo: nazevProvozu(kdo?.druh ?? "") });
        }
        case "pohyb":
          // Bez pístu se most nezvedl: jediná značka to řekne v okamžiku, kdy se zvednout měl.
          if (!maPist) return u.faze === "odemceno" ? t("osa.znacka.pohyb.bezPistu") : "";
          if (!maZamek && u.faze === "odemceno") return t("osa.znacka.pohyb.zvedani");
          if (!maZamek && u.faze === "zamceno") return t("osa.znacka.pohyb.dosedl");
          return t(`osa.znacka.pohyb.${u.faze}`);
        case "lod":
          return t(u.stav === "narazila" ? "osa.znacka.lodNarazila" : "osa.znacka.lodProplula");
        default:
          return "";
      }
    };
    znackyOsy.replaceChildren(
      ...[...vyjezdy.values()].map((v) => znacka(v.cas, "vyjezd", t("osa.znacka.vyjezd", { kdo: kdoVyrazi(v) }))),
      ...b.udalosti
        .filter((u) => u.druh !== "prujezd")
        .map((u) => ({ u, popis: popisUdalosti(u) }))
        // Událost bez popisu se nestala tak, jak by značka tvrdila (zvedání mostu bez pístu).
        .filter(({ popis }) => popis !== "")
        // Zvedání mostu a proplutí lodi jsou běžný děj; červená patří jen nárazu lodi.
        .map(({ u, popis }) => {
          const lidi = lidiVPadu(u);
          return znacka(u.cas, u.druh === "lod" ? (u.stav === "narazila" ? "naraz" : "lod") : u.druh, popis, lidi > 1 ? lidi : undefined);
        }),
    );
  }

  /**
   * Bublina nad časovou osou: ukazatel poblíž značky řekne, co značka znamená. Značky samy
   * kliknutí nechytají (ležely by na táhle), proto se hledá nejbližší podle místa ukazatele.
   */
  function ukazBublinuOsy(udalost: PointerEvent): void {
    const draha = tahlo.getBoundingClientRect();
    const delka = beh ? delkaDeje(beh) : 0;
    if (!beh || !(delka > 0) || draha.width <= 0) {
      bublinaOsy.hidden = true;
      return;
    }
    window.clearTimeout(casovacBubliny);
    let nejblizsi: { cas: number; popis: string } | null = null;
    // Prst je méně přesný než myš: značku najde z větší dálky.
    let nejmensi = udalost.pointerType === "mouse" ? DOSAH_ZNACKY_OSY : DOSAH_ZNACKY_DOTYKEM;
    for (const z of popisyZnacek) {
      const vzdalenost = Math.abs(draha.left + (draha.width * Math.min(1, Math.max(0, z.cas / delka))) - udalost.clientX);
      if (vzdalenost <= nejmensi) {
        nejmensi = vzdalenost;
        nejblizsi = z;
      }
    }
    if (!nejblizsi) {
      bublinaOsy.hidden = true;
      return;
    }
    // Víc značek ve stejném okamžiku (řetěz porušení) se vypíše pod sebe, nejvýš čtyři;
    // stejné řádky (řady davu, které vyrážejí naráz) jen jednou.
    const cil = nejblizsi;
    const blizko = popisyZnacek.filter((z) => Math.abs(z.cas - cil.cas) < 0.05);
    const stejne = [...new Set(blizko.filter((z) => z.lidi === undefined).map((z) => `${zapisCasu(z.cas)} · ${z.popis}`))];
    // Řady davu, které padají naráz, se sečtou do jednoho řádku.
    let padlych = 0;
    for (const z of blizko) padlych += z.lidi ?? 0;
    if (padlych > 0) stejne.push(`${zapisCasu(cil.cas)} · ${t("osa.znacka.padLidi", { pocet: padlych })}`);
    const radky = stejne.slice(0, 4);
    if (stejne.length > 4) radky.push(t("vysledek.poruseni.dalsi", { pocet: stejne.length - 4 }));
    bublinaOsy.textContent = radky.join("\n");
    bublinaOsy.hidden = false;
    // Bublina stojí nad značkou, ale nikdy nevyčnívá z okna: u krajů osy se k němu přimkne.
    const rodic = (bublinaOsy.offsetParent ?? bublinaOsy.parentElement)?.getBoundingClientRect();
    const sirka = bublinaOsy.offsetWidth;
    const stred = draha.left + draha.width * Math.min(1, Math.max(0, cil.cas / delka));
    const okraj = 6;
    const vlevo = Math.max(okraj, Math.min(window.innerWidth - okraj - sirka, stred - sirka / 2));
    bublinaOsy.style.left = `${(vlevo - (rodic?.left ?? 0)).toFixed(1)}px`;
  }

  function prepniPrehravani(): void {
    if (rezim !== "zkouska" || !beh) return;
    const naKonci = beh.spocitanoVse && prehravani.cas >= beh.trvani;
    prehravani = naKonci ? { ...prehravani, cas: 0, bezi: true } : { ...prehravani, bezi: !prehravani.bezi };
    if (naKonci) hledejZaber(beh, false);
    // Přehrávání od začátku: na telefonu se rozbalené podrobnosti zavřou, ať je vidět děj.
    if (naKonci && !panelVysledku.hidden && jeUzkeOkno()) sbalVysledek(true);
    obnovOsu();
  }

  function skocNa(cas: number): void {
    if (rezim !== "zkouska" || !beh) return;
    // Kdo si čas posouvá sám, záběr nechce.
    zrusZaber();
    const konec = delkaDeje(beh);
    prehravani = { ...prehravani, cas: Math.max(0, Math.min(cas, konec)), bezi: false };
    // Na telefonu zakrývají rozbalené podrobnosti skoro celý výkres: kdo se vrací v čase, chce
    // vidět most, a tak se zavřou. V širokém okně zůstávají (seznam porušení se dá proklikat).
    if (!panelVysledku.hidden && prehravani.cas < konec - 1e-6 && jeUzkeOkno()) sbalVysledek(true);
    obnovOsu();
  }

  /** Sbalí výsledek zkoušky do pruhu s verdiktem, nebo rozbalí podrobnosti (čísla, podmínky medailí). */
  function sbalVysledek(sbalit: boolean): void {
    panelVysledku.dataset.sbaleno = sbalit ? "ano" : "ne";
    tlacitkoSbaleni.setAttribute("aria-expanded", String(!sbalit));
    tlacitkoSbaleni.textContent = t(sbalit ? "vysledek.rozbalit" : "vysledek.sbalit");
    uhniAnalyzou();
  }

  /** Ukáže nebo schová výsledek zkoušky i s razítkem verdiktu v rohu výkresu. */
  function ukazPanelVysledku(ukazat: boolean): void {
    panelVysledku.hidden = !ukazat;
    const razitko = udaj("verdikt");
    razitko.hidden = !ukazat || razitko.dataset.ukazat !== "true";
    uhniAnalyzou();
    obnovRazitko();
  }

  /**
   * Analytický panel i hlášení leží nahoře stejně jako pruh výsledku: když je výsledek vidět,
   * posunou se pod něj. Volá se i při změně velikosti (pruh se v užším okně zalomí).
   */
  function uhniAnalyzou(): void {
    const pruh = panelVysledku.hidden ? null : pruhVysledku;
    const vyska = pruh ? Math.round(pruh.getBoundingClientRect().height) : 0;
    if (vyska > 0) {
      panelAnalyzy.style.setProperty("--vrch-analyzy", `${vyska + 18}px`);
      poleHlaseni.style.setProperty("--vrch-hlaseni", `${vyska + 18}px`);
    } else {
      panelAnalyzy.style.removeProperty("--vrch-analyzy");
      poleHlaseni.style.removeProperty("--vrch-hlaseni");
    }
  }

  /** Posune záznam o jeden krok vpřed nebo zpět a přehrávání zastaví. */
  function krokuj(smer: 1 | -1): void {
    skocNa(prehravani.cas + smer * KROK_ZAZNAMU);
  }

  function skocNaKonec(): void {
    if (rezim !== "zkouska" || !beh) return;
    if (beh.spocitanoVse) skocNa(beh.trvani);
    else {
      beh.naKonecPoVypoctu = true;
      // Kdo chce rovnou výsledek, záběr nechce ani po dobu, než se zkouška dopočítá.
      zrusZaber();
    }
  }

  /** Prut pod daným místem plátna v právě zobrazeném snímku; null, když tam žádný není. */
  function prutPodMistem(misto: Bod): number | null {
    if (!beh) return null;
    const stavba = beh.zaznam.stavV(prehravani.cas, snimek);
    if (!stavba) return null;
    // Kliká se na to, co je nakreslené: se zvětšeným pohybem jsou pruty jinde než ve skutečnosti.
    zvetsenySnimek(beh, stavba);
    let nejblizsi: number | null = null;
    let nejmensi = DOSAH_KLIKNUTI;
    for (let e = 0; e < stavba.prvekA.length; e++) {
      const prut = stavba.prut[e]!;
      if (prut < 0 || stavba.cara[e] === CARA_SKRYTA) continue;
      const d = vzdalenostOdUsecky(misto, bodSnimku(stavba.prvekA[e]!), bodSnimku(stavba.prvekB[e]!));
      if (d <= nejmensi) {
        nejmensi = d;
        nejblizsi = prut;
      }
    }
    return nejblizsi;
  }

  /** Kliknutí na prut při přehrávání: skok do okamžiku jeho největšího namáhání. */
  function klikniVeZkousce(misto: Bod): void {
    if (!beh) return;
    // Kliknutí během zpomaleného záběru ho přeskočí; prut se vybírá až dalším.
    if (preskocZaber()) return;
    const prut = prutPodMistem(misto);
    beh.oznaceny = prut;
    obnovAnalyzu();
    if (prut === null) {
      skryjHlaseni();
      platno.prekresli();
      return;
    }
    if (beh.vysledek) {
      ukazHlaseni(zapisObalky(beh.vysledek, prut, true), "info", false);
      const obalka = beh.vysledek.obalka[prut];
      if (obalka && obalka.vyuziti > 0) skocNa(obalka.cas);
    }
    platno.prekresli();
  }

  // ---- Výsledek ----

  function obnovMedaile(): void {
    const medaile = rekord?.medaile ?? BEZ_MEDAILI;
    vypisMedaile(udaj("podminky"), uroven, medaile);
    const { znaky, popis } = znackyMedaili(uroven, medaile);
    const pole = udaj("medaile");
    pole.textContent = znaky;
    pole.title = popis;
    pole.setAttribute("aria-label", popis);
  }

  /** Porovnání s minulým pokusem na vlastním řádku; null, když není s čím srovnávat. */
  function rozdil(nove: number, stare: number | undefined, zapis: (hodnota: number) => string, nasobek: number): HTMLElement | null {
    if (stare === undefined) return null;
    // Rozdíl se píše tak, aby seděl s tím, co hráč vidí: 43 % → 44 % je +1 %.
    const zmena = zobrazenyRozdil(nove, stare, zapis, nasobek) ?? t("vysledek.stejne");
    const radek = document.createElement("span");
    radek.className = "vysledek__rozdil";
    radek.textContent = t("vysledek.protiMinule", { hodnota: zapis(stare), rozdil: zmena });
    return radek;
  }

  const bezNull = <T,>(polozky: (T | null)[]): T[] => polozky.filter((p): p is T => p !== null);

  /** První věta textu (po první tečku, za kterou je mezera nebo konec). */
  const prvniVeta = (text: string): string => {
    const konec = text.search(/[.!?](\s|$)/);
    return konec < 0 ? text : text.slice(0, konec + 1);
  };

  /** První porušení prutu nebo sjetí z podpory při zkoušce; null, když most vydržel celý. */
  function prvniPoruseni(b: Beh): Extract<Udalost, { druh: "poruseni" | "sjeti" }> | null {
    let prvni: Extract<Udalost, { druh: "poruseni" | "sjeti" }> | null = null;
    for (const u of b.udalosti) {
      if ((u.druh === "poruseni" || u.druh === "sjeti") && (prvni === null || u.cas < prvni.cas)) prvni = u;
    }
    return prvni;
  }

  /** Porucha do tohoto času děje (s) nastala „hned, ještě pod vlastní tíhou“: provoz na most nedojel. */
  const BRZKA_PORUCHA = 0.5;

  /** Lano, které napínák přetáhl daleko za pevnost, se přetrhlo už před zkouškou. */
  function pretrzenoNapinakem(b: Beh, u: Extract<Udalost, { druh: "poruseni" }>): boolean {
    return jeLano(b, u.prut) && u.cas === 0 && u.velicina > 2 * u.unosnost;
  }

  /** Rada, co s prutem, který povolil daným způsobem. */
  function radaKPoruseni(zpusob: number): string {
    if (zpusob === ZPUSOB_TAH) return t("rada.tah");
    if (zpusob === ZPUSOB_TLAK) return t("rada.tlak");
    if (zpusob === ZPUSOB_OHYB) return t("rada.ohyb");
    if (zpusob === ZPUSOB_SMYK) return t("rada.smyk");
    return t("rada.vzper");
  }

  /** Věta o porušení s čísly: který prut, čím selhal, co nesl a kolik unese. */
  function vetaOPoruseni(b: Beh, u: Extract<Udalost, { druh: "poruseni" | "sjeti" }>): string {
    if (u.druh === "sjeti") return t("vysledek.prvni.sjeti");
    const prvekPrutu = b.navrh.pruty[u.prut]?.prvek;
    const prvekText = prvekPrutu ? nazevPrvku(prvekPrutu).toLocaleLowerCase("cs") : "";
    if (pretrzenoNapinakem(b, u)) {
      return t("vysledek.prvni.napinani", { prut: u.prut + 1, prvek: prvekText, nasobek: cislo(u.velicina / u.unosnost, 0) });
    }
    const zpusob = t(nazevZpusobu(u.zpusob));
    const namahani = zapisNamahani(u.zpusob, u.velicina, u.unosnost, u.mira);
    // „tah, tah 6 215 kN“ by říkalo totéž dvakrát; způsob se uvádí jen tam, kde říká víc (vzpěr).
    const co = namahani.startsWith(zpusob) ? namahani : `${zpusob}, ${namahani}`;
    // „Ještě pod vlastní vahou“ platí jen o porušení hned na začátku: most bez klidové polohy
    // může stát a povolit až pod provozem.
    const klic: KlicTextu = b.vysledek?.pruchod
      ? "vysledek.prvni.obstal"
      : b.bezRovnovahy && u.cas <= BRZKA_PORUCHA
        ? "vysledek.prvni.bezRovnovahy"
        : "vysledek.prvni";
    return t(klic, { prut: u.prut + 1, prvek: prvekText, co });
  }

  // ---- Most bez klidové polohy: složí se, kde a proč ----

  /** Posudek mostu z běhu `b`; null, dokud záznam nesahá dost daleko. Most s klidovou polohou je bez nálezu. */
  function posudekBehu(b: Beh): PosudekStability | null {
    if (!b.bezRovnovahy) return BEZ_NALEZU;
    if (b.posudek === undefined) {
      const posudek = posudStabilitu(uroven, b.navrh, b.zaznam, b.spocitanoVse);
      if (posudek) b.posudek = posudek;
    }
    return b.posudek ?? null;
  }

  /** Místo a důvod složení mostu z běhu `b`; null u mostu, který se neskládá, a dokud se to neví. */
  function slozeniBehu(b: Beh): Slozeni | null {
    return posudekBehu(b)?.slozeni ?? null;
  }

  /** Důvod složení několika slovy, do popisku značky na výkresu. */
  function kratceOSlozeni(s: Slozeni): string {
    return t(`slozeni.kratce.${s.duvod}`);
  }

  /** Důvod složení celou větou s radou, do výsledku zkoušky. Radí jen to, co úroveň dovoluje. */
  function vetaOSlozeni(s: Slozeni): string {
    const vety = [t(`slozeni.veta.${s.duvod}`)];
    if (s.duvod !== "podpory") {
      vety.push(t(`slozeni.rada.${s.duvod}`));
      if (uroven.povoleneSvary) vety.push(t("slozeni.rada.svar"));
      if (smiLana) vety.push(t("slozeni.rada.lano"));
      if (uroven.povolenePrvky.some((id) => KATALOG[id].druh === "pilir")) vety.push(t("slozeni.rada.pilir"));
    }
    return vety.join(" ");
  }

  /**
   * Co kontrola stability říká o právě stavěném mostě. Ukazuje se, až když mostovka vede od břehu
   * k břehu: do té doby hráč teprve staví a upozornění by jen překáželo.
   */
  function nalezStavby(): PosudekStability {
    if (!rozbor || rozbor.stabilni || (!rozbor.slozeni && !rozbor.volny)) return BEZ_NALEZU;
    return mezeryTras(editor.navrh, uroven).length === 0 ? { slozeni: rozbor.slozeni, volny: rozbor.volny } : BEZ_NALEZU;
  }

  /**
   * Průvěs mostovky pod vlastní tíhou, když stojí za řeč: most má klidovou polohu, mostovka vede
   * od břehu k břehu a některý její styčník leží víc než `PRUVES_K_HLASENI` od výkresu. Vrací
   * místo toho styčníku na výkresu a průvěs.
   */
  function pruvesStavby(): { misto: Bod; metru: number; nad: boolean } | null {
    const pruves = rozbor?.stabilni ? rozbor.pruves : null;
    if (!pruves || !(pruves.metru > PRUVES_K_HLASENI) || uroven.pohyb) return null;
    // Jen u mostu s lany: tam je průvěs věc napínáků. Lávka se závažím se o pár centimetrů
    // prohne vždycky a značka by na ní jen překážela.
    if (!editor.navrh.pruty.some((p) => KATALOG[p.prvek].druh === "lano")) return null;
    const st = editor.navrh.stycniky[pruves.stycnik];
    if (!st || mezeryTras(editor.navrh, uroven).length > 0) return null;
    return { misto: { x: st.x, y: st.y }, metru: pruves.metru, nad: pruves.nad };
  }

  /** Háček pro testy: je při stavbě na výkresu značka, kde to minule povolilo první? */
  function oznacPoruchu(): void {
    if (rezim === "stavba" && posledniPorucha && posledniPorucha.navrh === editor.navrh) document.body.dataset.prvniPorucha = posledniPorucha.popis;
    else delete document.body.dataset.prvniPorucha;
  }

  /** Stav kontroly stability pro testy: důvod na `body`, dokud je na výkresu značka. */
  function oznacSlozeni(): void {
    const nalez = rezim === "stavba" ? nalezStavby() : BEZ_NALEZU;
    const misto = nalez.slozeni?.misto ?? nalez.volny?.misto;
    if (nalez.slozeni) document.body.dataset.slozeni = nalez.slozeni.duvod;
    else if (nalez.volny) document.body.dataset.slozeni = "volny-konec";
    else delete document.body.dataset.slozeni;
    if (misto) document.body.dataset.slozeniMisto = `${misto.x};${misto.y}`;
    else delete document.body.dataset.slozeniMisto;
    const jinaZnacka = nalez.slozeni !== null || nalez.volny !== null || (posledniPorucha !== null && posledniPorucha.navrh === editor.navrh);
    const pruves = rezim === "stavba" && !jinaZnacka ? pruvesStavby() : null;
    if (pruves) document.body.dataset.pruves = String(Math.round(1000 * pruves.metru));
    else delete document.body.dataset.pruves;
  }

  // ---- Zpomalený záběr na první poruchu ----

  /** Snímek, do kterého si záběr čte polohu toho, co sleduje. */
  const snimekZaberu = prazdnySnimek();
  /** Které porušení ukázal poslední záběr: stejné porušení při další zkoušce dostane jen krátký. */
  let minulyZaber: string | null = null;

  /**
   * Kde na výkresu povolil první prut zkoušky, která neprošla: střed prutu v návrhu a krátký
   * popis. Null, když most prošel, nic se nezlomilo nebo se most složil (to značí kontrola stability).
   */
  function mistoPrvniPoruchy(b: Beh): { navrh: NavrhMostu; misto: Bod; popis: string } | null {
    if (!b.vysledek || b.vysledek.pruchod || (b.pokus && !b.zlom) || slozeniBehu(b)) return null;
    const u = prvniPorucha(b.udalosti);
    if (!u || u.druh !== "poruseni") return null;
    const prut = b.navrh.pruty[u.prut];
    const od = b.navrh.stycniky.find((st) => st.id === prut?.a);
    const k = b.navrh.stycniky.find((st) => st.id === prut?.b);
    if (!od || !k) return null;
    return {
      navrh: b.navrh,
      misto: { x: (od.x + k.x) / 2, y: (od.y + k.y) / 2 },
      popis: t("stavba.porucha.kratce", { prut: u.prut + 1, zpusob: t(nazevZpusobu(u.zpusob)) }),
    };
  }

  /** Popisek záběru u značky na výkresu: co se v tom místě stalo. */
  function popisPoruchy(u: UdalostZaberu): string {
    if (u.druh === "sjeti") return t("zaber.sjeti");
    if (u.druh === "pad") return t("zaber.pad");
    if (u.druh === "lod") return t("zaber.lod", { prut: (u.prut ?? 0) + 1 });
    return t(jenKloub(u) ? "zaber.kloub" : "zaber.prut", { prut: u.prut + 1, zpusob: t(nazevZpusobu(u.zpusob)), mira: procenta(u.mira) });
  }

  /**
   * Věta záběru do hlášení nad výkresem: co povolilo a co s tím, bez čísel (ta jsou v podrobnostech
   * výsledku). Neříká, jak zkouška dopadne: při prvním přehrání se to ještě neví.
   */
  function vetaZaberu(b: Beh, u: UdalostZaberu): string {
    if (u.druh === "sjeti") return t("vysledek.prvni.sjeti");
    if (u.druh === "pad") return t("vysledek.prvni.pad");
    if (u.druh === "lod") return popisPoruchy(u);
    if (pretrzenoNapinakem(b, u)) return vetaOPoruseni(b, u);
    const prvekPrutu = b.navrh.pruty[u.prut]?.prvek;
    const veta = t("zaber.veta.prut", {
      prut: u.prut + 1,
      prvek: prvekPrutu ? nazevPrvku(prvekPrutu).toLocaleLowerCase("cs") : "",
      zpusob: t(nazevZpusobu(u.zpusob)),
    });
    return `${veta} ${radaKPoruseni(u.zpusob)}`;
  }

  /**
   * Najde první poruchu zkoušky a připraví na ni záběr. Záznam se plní postupně, takže dokud
   * nesahá dost daleko, zkusí to při dalším snímku. Pokusy (brnknutí, budič) záběr nemají.
   * S vypnutým záběrem se připraví jen „tichý“: ve chvíli porušení řekne, co povolilo.
   */
  function pripravZaber(b: Beh): void {
    const hledani = b.zaber;
    if (hledani.stav !== "hleda") return;
    const hotovo = (): void => {
      b.zaber = { stav: "hotovo" };
    };
    if (b.pokus && !b.zlom) return hotovo();
    const tichy = !zaberZapnuty && !hledani.vynuceno;
    const priprav = (zaber: Zaber, popis: string, veta: string, prut: number | null, klic: string): void => {
      const omezeno = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      // Stejné porušení podruhé za sebou hráč už zná: stačí krátké připomenutí.
      const kratky = !hledani.vynuceno && klic === minulyZaber;
      b.zaber = {
        stav: "pripraven",
        zaber,
        popis,
        veta,
        prut,
        klic,
        domov: null,
        od: 0,
        nabeh: 0,
        mira: 0,
        pohled: !omezeno && !tichy,
        tichy,
        tempo: tempoZaberu(prehravani.rychlost, kratky),
        nejpomaleji: kratky ? ZABER.rychlostKratkeho : ZABER.rychlost,
        misto: zaber.misto,
      };
      if (!tichy) document.body.dataset.zaber = "ceka";
    };
    // Most bez klidové polohy, který se skládá, nic neutrhne: záběr patří styčníku, který se propadá.
    if (b.bezRovnovahy) {
      const posudek = posudekBehu(b);
      if (posudek === null) return;
      const slozeni = posudek.slozeni;
      if (slozeni) {
        if (prehravani.cas > ZABER.okamzikSlozeni + ZABER.drzeni) return hotovo();
        const popis = `${t("slozeni.nadpis.pad")}: ${kratceOSlozeni(slozeni)}`;
        const zaber: Zaber = { okamzik: ZABER.okamzikSlozeni, misto: slozeni.misto, rozsah: 5, cil: { druh: "stycnik", stycnik: slozeni.stycnik } };
        return priprav(zaber, popis, vetaOSlozeni(slozeni), null, `slozeni:${slozeni.stycnik}`);
      }
    }
    const u = prvniPorucha(b.udalosti);
    if (!u) {
      if (b.spocitanoVse) hotovo();
      return;
    }
    const zaber = zaberNaPoruchu(b.zaznam, u, b.ucastnici);
    if (!zaber) {
      if (b.zaznam.konec >= u.cas) hotovo();
      return;
    }
    // Okamžik už přehrávání minulo (skok po ose): záběr by přišel pozdě.
    if (prehravani.cas > u.cas + ZABER.drzeni) return hotovo();
    const prut = u.druh === "poruseni" || u.druh === "lod" ? (u.prut ?? null) : null;
    priprav(zaber, popisPoruchy(u), vetaZaberu(b, u), prut, `${u.druh}:${prut ?? ""}`);
  }

  /** Vede připravený záběr po každém posunu času: ohlásí ho, najíždí a vrací pohled a nakonec ho ukončí. */
  function vedZaber(b: Beh): void {
    const z = b.zaber;
    if (z.stav !== "pripraven") return;
    const cas = prehravani.cas;
    const okamzik = z.zaber.okamzik;
    if (z.tichy) {
      // Vypnutý záběr: nic nezpomaluje ani nepřibližuje, ale co povolilo, se hráč dozví hned.
      if (cas < okamzik) return;
      if (z.prut !== null) b.oznaceny = z.prut;
      ukazHlaseni(z.veta, "varovani", false);
      b.zaber = { stav: "hotovo" };
      obnovAnalyzu();
      return;
    }
    if (cas >= konecZaberu(okamzik, z.tempo)) {
      zrusZaber();
      return;
    }
    const plna = miraPohledu(cas, okamzik, z.tempo);
    if (plna <= 0 && miraZpomaleni(cas, okamzik, z.tempo) <= 0) return;
    if (!z.domov) {
      z.domov = kamera;
      z.od = cas;
      z.nabeh = plna;
      minulyZaber = z.klic;
      if (z.prut !== null) b.oznaceny = z.prut;
      ukazHlaseni(z.veta, "varovani", false);
      document.body.dataset.zaber = "bezi";
      obnovAnalyzu();
    }
    z.mira = miraObrazu(cas, okamzik, z.od, z.nabeh, z.tempo);
    // Co padá, to záběr sleduje: značka i pohled jdou s ním.
    z.misto = sledovaneMisto(b.zaznam, z.zaber, cas, snimekZaberu);
    if (z.pohled) {
      const cil = omezNaVyrez(pohledZaberu(z.domov, z.zaber, platno.rozmer, z.misto), uroven.vyrez, platno.rozmer);
      kamera = smichejPohledy(z.domov, cil, z.mira);
      canvas.dataset.kamera = `${kamera.x};${kamera.y};${kamera.meritko}`;
    }
  }

  /** Ukončí záběr, ať už doběhl, nebo ho něco přerušilo; pohled vrátí tam, odkud vyjel. */
  function zrusZaber(): void {
    const b = beh;
    if (!b || b.zaber.stav !== "pripraven") {
      if (b && b.zaber.stav === "hleda") b.zaber = { stav: "hotovo" };
      return;
    }
    const z = b.zaber;
    b.zaber = { stav: "hotovo" };
    if (z.tichy) return;
    document.body.dataset.zaber = "hotovo";
    if (z.domov && z.pohled) {
      kamera = z.domov;
      obnovPohled();
    } else platno.prekresli();
  }

  /** Znovu nachystá hledání záběru (přehrání od začátku); stav pro testy začíná nanovo. */
  function hledejZaber(b: Beh, vynuceno: boolean): void {
    zrusZaber();
    b.zaber = { stav: "hleda", vynuceno };
    b.kmitaniOhlaseno = false;
    delete document.body.dataset.zaber;
  }

  /** Jak dlouho po první poruše (v sekundách děje) se ukáže výsledek zkoušky, která neprošla. */
  const VYSLEDEK_PO_PORUSE = 2;
  /** Jak dlouho po překročení meze kmitání: hráč má stihnout uvidět, jak se most houpe. */
  const VYSLEDEK_PO_KMITANI = 3;

  /**
   * Je o zkoušce rozhodnuto dřív, než přehrávání doběhne? Ano, když je výsledek spočítaný, most
   * neprošel a příčina už na obrazovce proběhla: první porucha (nebo složení) a záběr na ni,
   * nebo kmitání nad mezí úrovně. Pokusy (brnknutí, budič) počkají na konec.
   */
  function jeRozhodnuto(b: Beh): boolean {
    const vysledek = b.vysledek;
    if (!vysledek || vysledek.pruchod || vysledek.rozpad || (b.pokus && !b.zlom)) return false;
    if (b.zaber.stav === "pripraven" && b.zaber.domov) return false;
    const kdy = slozeniBehu(b) ? ZABER.okamzikSlozeni : (prvniPorucha(b.udalosti)?.cas ?? null);
    if (kdy !== null) return prehravani.cas >= kdy + VYSLEDEK_PO_PORUSE;
    // Kmitání nad mezí úrovně: rozhodnuto je ve chvíli, kdy ji most překročil.
    const prekroceno = vysledek.komfort?.prekroceno ?? null;
    return prekroceno !== null && vysledek.spadlo === 0 && prehravani.cas >= prekroceno + VYSLEDEK_PO_KMITANI;
  }

  /**
   * Co most při zkoušce rozhoupalo: frekvence, na které kmital ve chvíli největšího zrychlení,
   * rytmus lidí, který na ní leží, a nejbližší vlastní frekvence mostu. Null u pokusů, bez
   * výsledku a u mostu, který kmital sotva znatelně.
   */
  function kmitaniBehu(b: Beh): KmitaniBehu | null {
    const komfort = b.vysledek?.komfort;
    if (!komfort || b.pokus || !(komfort.zrychleni > MEZE_KOMFORTU[0])) return null;
    if (b.kmitani === undefined) {
      const nejvic = pricinaKmitani(b.zaznam, komfort.stycnik, komfort.cas, slozkyLidi);
      // Most, který na kmitání neprošel, má dvě chvíle, o kterých je řeč: kdy mez překročil
      // (to hráč viděl a výsledek přišel hned po tom) a kdy kmital nejvíc (to je číslo v protokolu).
      const prvni =
        komfort.prekroceno !== null ? pricinaKmitani(b.zaznam, komfort.stycnik, komfort.prekroceno + PO_PREKROCENI, slozkyLidi) : null;
      b.kmitani = nejvic ? { nejvic, rozhodla: prvni ?? nejvic } : null;
    }
    return b.kmitani;
  }

  /**
   * Věta, která frekvenci změřenou pokusem (brnknutí, budič) vztáhne k vlastním frekvencím
   * z rozboru: hráč má vidět, že pokus, osa i tvary kmitání mluví o tomtéž. Prázdný text, když
   * rozbor k mostu není nebo změřené číslo žádné vlastní frekvenci neodpovídá.
   */
  function odkazPokusuNaOsu(f: number, navrh: NavrhMostu): string {
    const r = rozbor && rozbor.stabilni && editor.navrh === navrh ? rozbor : null;
    if (!r) return "";
    // Pokus běží na prázdném mostě se vším, co na něm visí (i s tlumiči).
    const tvar = nejblizsiTvar(f, { frekvence: r.frekvence, frekvenceObsazeneho: [] }, SHODA_POKUSU);
    if (!tvar) return "";
    document.body.dataset.pokusTvar = String(tvar.poradi);
    const holy = r.bezTlumicu?.prazdny[0];
    if (holy !== undefined) return t("pokus.osa.sTlumicem", { poradi: tvar.poradi, f: cislo(tvar.prazdny, 2), most: cislo(holy, 2) });
    // Na ose je trojúhelník jen do jejího konce; první vlastní frekvenci za ním zastupuje šipka u okraje.
    const klic = !uroven.osaFrekvenci ? "pokus.tvar" : tvar.prazdny > ROZSAH_OSY ? (tvar.poradi === 1 ? "pokus.osa.mimo" : "pokus.tvar") : "pokus.osa";
    return t(klic, { poradi: tvar.poradi, f: cislo(tvar.prazdny, 2) });
  }

  /** Kdo most budí a kterou složkou kroku, slovy: „pochodující útvar, krok 2,3 Hz“. */
  function kdoASlozka(p: PricinaKmitani): { kdo: string; slozka: string } | null {
    const r = p.rytmus;
    if (!r) return null;
    const pasmo = slozkyLidi.find((s) => s.druh === r.druh && s.rytmus === r.rytmus)?.pasmo ?? 0;
    return { kdo: kdoJdeRytmem(r.druh, r.rytmus), slozka: slozkaSlovy({ ...r, pasmo }) };
  }

  /** Vlastní frekvence mostu slovy: prázdného, a když se liší, i s lidmi. */
  function vlastniSlovy(tvar: { prazdny: number; obsazeny: number | null }): string {
    const prazdny = cislo(tvar.prazdny, 2);
    const obsazeny = tvar.obsazeny === null ? prazdny : cislo(tvar.obsazeny, 2);
    return obsazeny === prazdny ? t("kmitani.vlastni", { prazdny }) : t("kmitani.vlastni.sLidmi", { prazdny, obsazeny });
  }

  /**
   * Frekvence kmitání, jak se píše hráči: když most rozhoupali lidé, je to násobek jejich
   * rytmu (změřená hodnota se od něj liší o chybu měření a dvě skoro stejná čísla by mátla).
   */
  function frekvenceSlovy(p: PricinaKmitani): string {
    return cislo(p.rytmus?.frekvence ?? p.frekvence, 1);
  }

  /** Rozbor mostu, který zkouškou prošel: platí jen pro tentýž návrh a jen když už doběhl. */
  function rozborBehu(b: Beh): RozborMostu | null {
    return rozbor && rozbor.stabilni && editor.navrh === b.navrh ? rozbor : null;
  }

  /** Celé věty o tom, co most rozhoupalo, s radou; nabízí jen to, co úroveň dovoluje. */
  function vetaOKmitani(k: KmitaniBehu, b: Beh): string {
    const vety: string[] = [];
    const r = rozborBehu(b);
    const p = k.rozhodla;
    const slovy = kdoASlozka(p);
    const f = frekvenceSlovy(p);
    const tvar = r ? nejblizsiTvar(p.rytmus?.frekvence ?? p.frekvence, mostProHrace(r)) : null;
    if (slovy) {
      vety.push(t(p.rytmus && p.rytmus.nasobek > 1 ? "kmitani.veta.rytmus.nasobek" : "kmitani.veta.rytmus", { ...slovy, f }));
      if (tvar) vety.push(t("kmitani.veta.tvar", { poradi: tvar.poradi, vlastni: vlastniSlovy(tvar) }));
      else if (r) vety.push(t("kmitani.veta.vynucene"));
    } else {
      vety.push(t("kmitani.veta.bezRytmu", { f }));
      if (tvar) vety.push(t("kmitani.veta.jenTvar", { poradi: tvar.poradi, vlastni: vlastniSlovy(tvar) }));
    }
    // Kmital nejvíc pod někým jiným, než kdo mez překročil první? Řekne se obojí.
    const pozdeji = kdoASlozka(k.nejvic);
    const jiny = k.nejvic !== k.rozhodla && k.nejvic.rytmus && (k.nejvic.rytmus.druh !== p.rytmus?.druh || k.nejvic.rytmus.rytmus !== p.rytmus?.rytmus);
    if (jiny && pozdeji) vety.push(t("kmitani.veta.pozdeji", pozdeji));
    const rada = r ? radaKeKmitani(r) : "";
    if (rada) vety.push(rada);
    return vety.join(" ");
  }

  /** Totéž jednou krátkou větou do pruhu výsledku. */
  function kratceOKmitani(k: KmitaniBehu, zrychleni: number): string {
    const hodnoty = { a: cislo(zrychleni, 2), mez: cislo(MEZ_KMITANI, 1) };
    const slovy = kdoASlozka(k.rozhodla);
    if (!slovy) return t("kmitani.kratce", hodnoty);
    // Číslo je největší kmitání celé zkoušky; když ho způsobil někdo jiný než ten, kdo mez
    // překročil první, pruh číslo neuvádí (je v podrobnostech), ať nepřipisuje jedno druhému.
    const stejny = k.nejvic === k.rozhodla || (k.nejvic.rytmus?.druh === k.rozhodla.rytmus?.druh && k.nejvic.rytmus?.rytmus === k.rozhodla.rytmus?.rytmus);
    return t(stejny ? "kmitani.kratce.rytmus" : "kmitani.kratce.prvni", { ...hodnoty, ...slovy });
  }

  /** Ve chvíli, kdy kmitání při přehrávání přesáhne mez úrovně, to hráči řekne (jednou na přehrání). */
  function ohlasKmitani(b: Beh): void {
    const prekroceno = b.vysledek?.komfort?.prekroceno ?? null;
    if (b.kmitaniOhlaseno || prekroceno === null || b.pokus || b.vysledekUkazan) return;
    const cas = prehravani.cas;
    // Kdo čas přeskočil daleko za ten okamžik, hlášení už nepotřebuje.
    if (cas < prekroceno || cas > prekroceno + VYSLEDEK_PO_KMITANI) return;
    b.kmitaniOhlaseno = true;
    ukazHlaseni(t("kmitani.prekroceno", { mez: cislo(MEZE_KOMFORTU[uroven.nejhorsiKomfort - 1]!, 1) }), "varovani", false);
    document.body.dataset.kmitaniNadMez = prekroceno.toFixed(2);
  }

  /** Přeskočí právě běžící záběr; vrací, jestli nějaký běžel. */
  function preskocZaber(): boolean {
    const z = beh?.zaber;
    if (!z || z.stav !== "pripraven" || !z.domov) return false;
    zapis("ovladani", { co: "zaber-preskocen" });
    zrusZaber();
    return true;
  }

  /** Skočí kousek před první porušení, označí prut, který selhal, a přehraje zlom zpomaleně. */
  function prehrajPrvniPoruseni(): void {
    const b = beh;
    if (!b || rezim !== "zkouska") return;
    const puvodni = prehravani;
    hledejZaber(b, true);
    // Hledá se od začátku děje; čas se nastaví až podle nalezeného záběru.
    prehravani = { ...prehravani, cas: 0, bezi: false };
    pripravZaber(b);
    // Přes volání funkce překladač stav nesleduje; čte se proto znovu jako obecný.
    const z = b.zaber as StavZaberu;
    if (z.stav !== "pripraven") {
      // Není co přehrát: čas zůstane, kde byl.
      prehravani = puvodni;
      obnovOsu();
      return;
    }
    ukazPanelVysledku(false);
    b.vysledekUkazan = false;
    b.oznaceny = z.prut;
    prehravani = { ...prehravani, cas: Math.max(0, zacatekZaberu(z.zaber.okamzik, z.tempo) - 0.3), bezi: true };
    ukazHlaseni(z.veta, "varovani", false);
    document.body.dataset.zaznamPoruseni = z.zaber.okamzik.toFixed(3);
    obnovOsu();
    obnovAnalyzu();
  }

  /** Řádky výsledku pohyblivého mostu: průběh zvedání a lodě, síla pístu a ráz při dosednutí. */
  function vypisPohyb(b: Beh, vysledek: VysledekZkousky, minule: VysledekZkousky | null): void {
    const pohyb = vysledek.pohyb;
    const maPisty = b.navrh.pruty.some((p) => KATALOG[p.prvek].druh === "pist");
    const radek = (jmeno: string, videt: boolean): void => {
      for (const uzel of panelVysledku.querySelectorAll<HTMLElement>(`[data-radek="${jmeno}"]`)) uzel.hidden = !videt;
    };
    const skokNa = (text: string, cas: number): HTMLButtonElement => {
      const skok = document.createElement("button");
      skok.type = "button";
      skok.className = "vysledek__skok";
      skok.textContent = text;
      skok.addEventListener("click", () => skocNa(cas));
      return skok;
    };
    const kN = (newtony: number): string => `${cislo(newtony / 1000, 0)} kN`;

    const casti: (HTMLElement | Text)[] = [];
    const pridej = (uzel: HTMLElement | Text): void => {
      if (casti.length > 0) casti.push(document.createTextNode(" · "));
      casti.push(uzel);
    };
    const casFaze = (faze: string): number | null =>
      b.udalosti.find((u) => u.druh === "pohyb" && u.faze === faze)?.cas ?? null;
    // Píst s nulovým zdvihem nic nezvedá a most bez zámku se nezamyká: o tom se nepíše.
    const zveda = b.navrh.pruty.some((p) => KATALOG[p.prvek].druh === "pist" && (p.zdvih ?? PIST.vychoziZdvih) !== 0);
    const maZamky = b.navrh.stycniky.some((s) => s.zamek);
    if (pohyb) {
      const zvednuto = casFaze("zvednuto");
      if (zveda) {
        pridej(
          pohyb.zvednuto && zvednuto !== null
            ? skokNa(t("vysledek.pohyb.zvednuto", { cas: zapisCasu(zvednuto) }), zvednuto)
            : document.createTextNode(t("vysledek.pohyb.nezvednuto")),
        );
      }
      const preklopeno = casFaze("preklopeno");
      if (preklopeno !== null) pridej(skokNa(t("vysledek.pohyb.preklopeno", { cas: zapisCasu(preklopeno) }), preklopeno));
    }
    for (const u of b.udalosti) {
      if (u.druh !== "lod") continue;
      if (u.stav === "proplula") {
        pridej(skokNa(t("vysledek.pohyb.lodProplula", { cas: zapisCasu(u.cas) }), u.cas));
        continue;
      }
      // Náraz: řádek skočí do toho okamžiku a označí prut, do kterého loď narazila.
      const prut = u.prut ?? -1;
      const skok = skokNa(t("vysledek.pohyb.lodNarazila", { cas: zapisCasu(u.cas), prut: prut + 1 }), u.cas);
      skok.addEventListener("click", () => {
        b.oznaceny = prut >= 0 ? prut : null;
        skocNa(u.cas);
      });
      pridej(skok);
    }
    if (pohyb && maZamky) {
      pridej(
        pohyb.zamceno && pohyb.casZamceni !== null
          ? skokNa(t("vysledek.pohyb.zamceno", { cas: zapisCasu(pohyb.casZamceni) }), pohyb.casZamceni)
          : document.createTextNode(t("vysledek.pohyb.nezamceno")),
      );
    }
    radek("pohyb", casti.length > 0);
    const polePohybu = udaj("vysledek-pohyb");
    polePohybu.replaceChildren(...casti);
    polePohybu.dataset.zamceno = String(pohyb?.zamceno ?? "");
    polePohybu.dataset.narazilo = String(vysledek.lode.narazilo);

    radek("pist", pohyb !== null && maPisty);
    if (pohyb && maPisty) {
      const text = t(pohyb.pretizenychPistu > 0 ? "vysledek.pist.pretizen" : "vysledek.pist.hodnota", {
        sila: kN(pohyb.nejvetsiSilaPistu),
        nejvic: kN(PIST.nejvetsiSila),
      });
      udaj("vysledek-pist").replaceChildren(
        ...bezNull([document.createTextNode(text), rozdil(pohyb.nejvetsiSilaPistu, minule?.pohyb?.nejvetsiSilaPistu, kN, 0.001)]),
      );
      udaj("vysledek-pist").dataset.sila = (pohyb.nejvetsiSilaPistu / 1000).toFixed(0);
    }

    // Ráz trosek do opěry po zřícení o dosednutí mostu nic neříká.
    const dosedl = pohyb !== null && pohyb.razDosednuti > 0 && vysledek.poruseni === 0;
    radek("dosednuti", dosedl);
    if (pohyb && dosedl) {
      const nasobek = pohyb.klidoveDosednuti > 0 ? pohyb.razDosednuti / pohyb.klidoveDosednuti : 0;
      let text =
        nasobek >= 1.05
          ? t("vysledek.dosednuti.raz", { sila: kN(pohyb.razDosednuti), nasobek: cislo(nasobek, 1) })
          : t("vysledek.dosednuti.mekke", { sila: kN(pohyb.razDosednuti) });
      // Kde o dosednutí jde medaile, řekne řádek i její mez: „měkké“ a „tvrdé“ se měří jí.
      const bonus = uroven.mistrovska;
      if (bonus?.druh === "dosednuti") {
        text = t(pohyb.razDosednuti <= bonus.limit ? "vysledek.dosednuti.splneno" : "vysledek.dosednuti.nesplneno", {
          text,
          limit: kN(bonus.limit),
        });
      }
      udaj("vysledek-dosednuti").replaceChildren(
        ...bezNull([document.createTextNode(text), rozdil(pohyb.razDosednuti, minule?.pohyb?.razDosednuti, kN, 0.001)]),
      );
      udaj("vysledek-dosednuti").dataset.sila = (pohyb.razDosednuti / 1000).toFixed(0);
    }
  }

  function ukazVysledek(b: Beh, vysledek: VysledekZkousky): void {
    b.vysledekUkazan = true;
    zapis("vysledek.zobrazen", { pruchod: vysledek.pruchod, sekund: sekundVUrovni() });
    // Medaile se v popisovém poli objeví až s výsledkem, ne už během přehrávání.
    obnovMedaile();
    const nadpis = vysledek.rozpad
      ? "vysledek.rozpad"
      : vysledek.brnknuti
        ? "vysledek.brnknuti"
        : vysledek.budic
          ? "vysledek.budic"
          : vysledek.zlom
            ? "vysledek.zlom"
            : vysledek.pruchod
              ? "vysledek.obstal"
              : "vysledek.neobstal";
    udaj("vysledek-nadpis").textContent = t(nadpis);
    const jePokus = vysledek.brnknuti !== null || vysledek.budic !== null || vysledek.zlom !== null;
    panelVysledku.dataset.stav = vysledek.rozpad ? "rozpad" : jePokus ? "brnknuti" : vysledek.pruchod ? "obstal" : "neobstal";
    udaj("vysledek-medaile").hidden = jePokus;
    // Pokus se s minulou zkouškou neporovnává: neměří totéž.
    const minule = jePokus ? null : predchoziVysledek;

    const vety: string[] = [];
    /** Věta o tom, proč pohyblivý most neprošel (píst, zámek, překlopení); do pruhu výsledku. */
    let pricinaPohybu: string | null = null;
    /** Věta shrnutí o nárazu lodi: odkazuje na řádek v podrobnostech, do pruhu jde její krátká podoba. */
    let vetaNarazuLodi: string | null = null;
    if (vysledek.rozpad) vety.push(t("vysledek.shrnuti.rozpad"));
    else if (vysledek.brnknuti) {
      const f = vysledek.brnknuti.frekvence;
      vety.push(f === null ? t("vysledek.brnknuti.nic") : t("vysledek.brnknuti.frekvence", { f: cislo(f, 2) }));
      delete document.body.dataset.pokusTvar;
      if (f !== null) vety.push(odkazPokusuNaOsu(f, b.navrh));
    } else if (vysledek.budic) {
      const { frekvence, zrychleni, krivka } = vysledek.budic;
      const staly = b.budic !== null && jeStaly(b.budic);
      if (frekvence === null) vety.push(t("vysledek.budic.nic"));
      else if (staly) vety.push(t("vysledek.budic.staly", { f: cislo(frekvence, 2), a: cislo(zrychleni, 2) }));
      else {
        // Po přeladění se budič sám nastaví na rytmus, kde most odpovídal nejvíc.
        rytmusBudice = Math.round(100 * Math.round(frekvence / KROK_BUDICE) * KROK_BUDICE) / 100;
        vety.push(t("vysledek.budic.rozmitani", { f: cislo(rytmusBudice, 2), a: cislo(zrychleni, 2) }));
        delete document.body.dataset.pokusTvar;
        vety.push(odkazPokusuNaOsu(frekvence, b.navrh));
      }
      // Měření se ukládá k návrhu, na kterém vzniklo, a kreslí se přes spočítanou křivku.
      if (zmereno?.navrh !== b.navrh) zmereno = { navrh: b.navrh, cara: [], body: [] };
      if (staly) zmereno.body.push(...krivka);
      else zmereno.cara = krivka;
      document.body.dataset.budic = frekvence?.toFixed(3) ?? "";
      document.body.dataset.budicZrychleni = zrychleni.toFixed(3);
    }
    else if (vysledek.zlom) {
      // Zkouška do zlomu: kolik most unesl a kolik je to na korunu. Který prut povolil první,
      // říká záznam porušení pod čísly; píst a most, který vydržel, porušení nemají.
      const zlom = vysledek.zlom;
      const tun = `${cislo(zlom.celkem / TIHOVE_ZRYCHLENI / 1000, 1)}\u00a0t`;
      const naMetr = `${cislo(zlom.zatizeni / 1000, 1)}\u00a0kN`;
      if (vysledek.bezRovnovahy) vety.push(t("vysledek.zlom.nic"));
      else if (zlom.nedolozeno) vety.push(t("vysledek.zlom.nedolozeno", { tun, naMetr }));
      else if (zlom.cas === null) vety.push(t("vysledek.zlom.vydrzel", { tun, naMetr }));
      else {
        vety.push(t("vysledek.zlom.unesl", { tun, sila: `${cislo(zlom.celkem / 1000, 0)}\u00a0kN`, naMetr }));
        const prvekPrutu = b.navrh.pruty[zlom.prut]?.prvek;
        if (prvekPrutu && KATALOG[prvekPrutu].druh === "pist") {
          vety.push(t("vysledek.zlom.pist", { prut: zlom.prut + 1, cas: zapisCasu(zlom.cas) }));
        }
      }
      if (zlom.celkem > 0) {
        vety.push(
          t("vysledek.zlom.naKorunu", {
            cena: koruny(vysledek.cena),
            hodnota: zapisVyzvy("zlom", unosnostNaKorunu(zlom.celkem, vysledek.cena)),
          }),
        );
        // Do výzvy se počítá jen most, který úrovní prošel; hráč se to má dozvědět hned.
        if (sandbox === null && prahy !== null && !b.zlomSePocita) vety.push(t("vysledek.zlom.nepocitaSe"));
      }
      document.body.dataset.zlom = (zlom.celkem / 1000).toFixed(0);
    }
    else if (vysledek.ucastniku === 0) vety.push(t("vysledek.shrnuti.bezProvozu"));
    else if (vysledek.prejelo === vysledek.ucastniku && vysledek.spadlo === 0) {
      const lide = b.ucastnici.some((u) => jeClovek(u.druh));
      const vozidla = b.ucastnici.some((u) => !jeClovek(u.druh));
      const klicVsech = lide && !vozidla ? "vysledek.shrnuti.vsichni.lide" : vozidla && !lide ? "vysledek.shrnuti.vsichni.vozidla" : "vysledek.shrnuti.vsichni";
      vety.push(t(klicVsech, { pocet: vysledek.ucastniku }));
    } else {
      vety.push(
        t("vysledek.shrnuti.cast", { prejelo: vysledek.prejelo, pocet: vysledek.ucastniku, spadlo: vysledek.spadlo }),
      );
    }
    // Pohyblivý most: proč neprošel, i když auta přejela.
    if (!jePokus && !vysledek.rozpad) {
      const naraz = b.udalosti.find((u) => u.druh === "lod" && u.stav === "narazila");
      if (naraz && naraz.druh === "lod") {
        const prut = naraz.prut ?? -1;
        const prvekPrutu = b.navrh.pruty[prut]?.prvek;
        vetaNarazuLodi = t("vysledek.shrnuti.lodNarazila", { prut: prut + 1, prvek: prvekPrutu ? nazevPrvku(prvekPrutu).toLowerCase() : "?" });
        vety.push(vetaNarazuLodi);
      }
      const pohyb = vysledek.pohyb;
      const maPisty = b.navrh.pruty.some((p) => KATALOG[p.prvek].druh === "pist");
      const predPohybem = vety.length;
      if (pohyb?.preklopeno) vety.push(t("vysledek.shrnuti.preklopeno"));
      else if (pohyb && maPisty) {
        // Píst na mezi síly: když kvůli tomu most neprošel, je to příčina; když prošel, jen poznámka.
        const nestacil = pohyb.pretizenychPistu > 0 && (!pohyb.zvednuto || vysledek.lode.narazilo > 0);
        if (!vysledek.pruchod && nestacil) vety.push(t("vysledek.shrnuti.pistNestaci"));
        else if (!vysledek.pruchod && !pohyb.zvednuto) vety.push(t("vysledek.shrnuti.nezvednuto"));
        else if (vysledek.pruchod && pohyb.pretizenychPistu > 0) vety.push(t("vysledek.shrnuti.pistNaMezi"));
      }
      if (pohyb && !pohyb.zamceno && !pohyb.preklopeno) vety.push(t("vysledek.shrnuti.nezamceno"));
      // Proč se most nezvedl nebo nezamkl, je příčina; náraz lodi bývá až její následek.
      if (!vysledek.pruchod && vety.length > predPohybem) pricinaPohybu = vety[predPohybem]!;
    }
    // Most, který nevede až na předmostí, neprojde, i když kola mezeru přejela.
    if (!jePokus && !vysledek.rozpad && vysledek.mezera && vysledek.spadlo === 0) {
      const mezera = mezeryTras(b.navrh, uroven)[0];
      if (mezera) vety.push(t("vysledek.shrnuti.mezera", { od: cislo(mezera.od, 0), do: cislo(mezera.do, 0) }));
    }
    // Kdo spadl proto, že na trase kus mostovky chybí, se to má dozvědět: jinak výsledek
    // hlásí pád a žádné porušení.
    if (!jePokus && !vysledek.rozpad && vysledek.spadlo > 0) {
      const mezera = mezeryTras(b.navrh, uroven)[0];
      if (mezera) {
        const klicMezery = ({ kolej: "vysledek.shrnuti.chybiKolejiste", silnice: "vysledek.shrnuti.chybiMostovka", lavka: "vysledek.shrnuti.chybiLavka" } as const)[mezera.trasa.druh];
        vety.push(t(klicMezery, { od: cislo(mezera.od, 0), do: cislo(mezera.do, 0) }));
      }
    }
    // Most, který zkouškou prošel, klidovou polohu našel (jen ne hned napoprvé); věta by mátla.
    if (vysledek.bezRovnovahy && !vysledek.zlom) {
      const posudek = posudekBehu(b) ?? BEZ_NALEZU;
      const brzy = prvniPoruseni(b);
      if (posudek.slozeni && !vysledek.pruchod) vety.push(vetaOSlozeni(posudek.slozeni));
      // Volný prut je poznámka i u mostu, který prošel: rozkýval se a zbytečně stojí peníze.
      else if (posudek.volny) vety.push(t("volny.veta", { prut: posudek.volny.prut + 1 }));
      // „Neunesl ani vlastní váhu“ platí jen o mostě, kterému něco povolilo hned na začátku.
      else if (!vysledek.pruchod && brzy && brzy.cas <= BRZKA_PORUCHA) vety.push(t("vysledek.bezRovnovahy"));
    }
    // Most s lany, který už před zkouškou visel hluboko pod výkresem, má nedopnuté napínáky.
    const maLana = b.navrh.pruty.some((p) => KATALOG[p.prvek].druh === "lano");
    if (!vysledek.pruchod && !jePokus && maLana && (vysledek.pruvesVKlidu ?? 0) > 0.1) {
      vety.push(t("vysledek.nedopnuto", { mm: cislo(1000 * (vysledek.pruvesVKlidu ?? 0), 0) }));
    }
    const komfort = vysledek.komfort;
    // Co most rozhoupalo: frekvence ze záznamu, rytmus lidí a nejbližší vlastní frekvence mostu.
    const kmitani = kmitaniBehu(b);
    /** Krátká věta o kmitání do pruhu výsledku; jen když na něm most neprošel. */
    let pricinaKmitanim: string | null = null;
    if (komfort && komfort.trida > uroven.nejhorsiKomfort && vysledek.spadlo === 0 && !vysledek.rozpad) {
      vety.push(
        komfort.trida === 4
          ? t("vysledek.shrnuti.kmitani")
          : t("vysledek.shrnuti.kmitaniNadMez", { limit: cislo(MEZE_KOMFORTU[uroven.nejhorsiKomfort - 1]!, 1) }),
      );
      if (kmitani) {
        vety.push(vetaOKmitani(kmitani, b));
        pricinaKmitanim = kratceOKmitani(kmitani, komfort.zrychleni);
      }
    }
    // Háčky pro automat: frekvence největšího kmitání a kdo most rozhoupal (druh;násobek;rytmus).
    const rozhodl = kmitani?.rozhodla.rytmus;
    document.body.dataset.kmitaniFrekvence = kmitani ? kmitani.nejvic.frekvence.toFixed(2) : "";
    document.body.dataset.kmitaniRytmus = rozhodl ? `${rozhodl.druh};${rozhodl.nasobek};${rozhodl.rytmus}` : "";
    udaj("vysledek-shrnuti").textContent = vety.filter((v) => v !== "").join(" ");
    if (vysledek.brnknuti) document.body.dataset.brnknuti = vysledek.brnknuti.frekvence?.toFixed(3) ?? "";

    // Kmitání mostovky pod lidmi; řádek je jen v úrovních, kde se měří.
    for (const uzel of panelVysledku.querySelectorAll<HTMLElement>('[data-radek="kmitani"]')) uzel.hidden = komfort === null;
    if (komfort) {
      const poleKmitani = udaj("vysledek-kmitani");
      if (komfort.zrychleni > 0) {
        const skok = document.createElement("button");
        skok.type = "button";
        skok.className = "vysledek__skok";
        skok.textContent = t("vysledek.kmitaniHodnota", {
          zrychleni: cislo(komfort.zrychleni, 2),
          trida: t(`komfort.${komfort.trida}`),
          cas: zapisCasu(komfort.cas),
        });
        skok.addEventListener("click", () => skocNa(komfort.cas));
        const zapisZrychleni = (hodnota: number): string => `${cislo(hodnota, 2)} m/s²`;
        // Pod číslem i frekvence, na které most kmital, a čí je to rytmus.
        let poznamka: HTMLElement | null = null;
        if (kmitani) {
          poznamka = document.createElement("small");
          poznamka.className = "vysledek__poznamka";
          const f = frekvenceSlovy(kmitani.nejvic);
          const slovy = kdoASlozka(kmitani.nejvic);
          poznamka.textContent = slovy ? t("kmitani.poznamka.rytmus", { f, ...slovy }) : t("kmitani.poznamka", { f });
        }
        poleKmitani.replaceChildren(
          ...bezNull([skok, rozdil(komfort.zrychleni, minule?.komfort?.zrychleni, zapisZrychleni, 100), poznamka]),
        );
      } else {
        poleKmitani.textContent = t("vysledek.kmitaniZadne");
      }
      poleKmitani.dataset.trida = String(komfort.trida);
    }

    // Pohodlí cestujících; řádek je jen tam, kde jel autobus nebo osobní vůz.
    const cestujici = vysledek.komfortCestujicich;
    // Řádek se jmenuje podle toho, kdo v úrovni cestuje; kde jede autobus i osobní vůz, obecně.
    const kdo = kdoCestuje(uroven) ?? "autobus";
    const nazevRadku = ({ autobus: "vysledek.autobus", vlak: "vysledek.vlak", oboji: "vysledek.cestujici" } as const)[kdo];
    for (const uzel of panelVysledku.querySelectorAll<HTMLElement>('[data-radek="autobus"]')) {
      uzel.hidden = cestujici === null;
      if (uzel.tagName === "DT") uzel.textContent = t(nazevRadku);
    }
    if (cestujici) {
      const poleAutobusu = udaj("vysledek-autobus");
      const skok = document.createElement("button");
      skok.type = "button";
      skok.className = "vysledek__skok";
      // Kde o pohodlí v úrovni nejde, je to údaj pro zajímavost a řádek to říká: „nepřijatelné“
      // vedle medailí by jinak vypadalo jako důvod neúspěchu.
      const hodnotiSe = uroven.mistrovska?.druh === "komfort-cestujicich";
      // Ve vlaku se pohodlí neřadí do tříd pro lávky: norma pro železniční mosty bere jako velmi
      // dobré pohodlí zrychlení ve voze do 1 m/s² a tím se tu měří.
      const trida =
        kdo === "vlak"
          ? t(cestujici.zrychleni <= MEZ_POHODLI_VE_VOZE ? "komfort.vlak.dobre" : "komfort.vlak.horsi")
          : t(`komfort.${cestujici.trida}`);
      skok.textContent = t(hodnotiSe ? "vysledek.kmitaniHodnota" : "vysledek.autobus.bezHodnoceni", {
        zrychleni: cislo(cestujici.zrychleni, 2),
        trida,
        cas: zapisCasu(cestujici.cas),
      });
      skok.addEventListener("click", () => skocNa(cestujici.cas));
      const zapisZrychleni = (hodnota: number): string => `${cislo(hodnota, 2)} m/s²`;
      // Autobus, který na most nedojel nebo jel po mostě už porušeném, se neměří.
      if (cestujici.zrychleni === 0 && cestujici.cas === 0) poleAutobusu.replaceChildren(t(`${nazevRadku}.nemereno`));
      else {
        poleAutobusu.replaceChildren(
          ...bezNull([skok, rozdil(cestujici.zrychleni, minule?.komfortCestujicich?.zrychleni, zapisZrychleni, 100)]),
        );
      }
      poleAutobusu.dataset.zrychleni = cestujici.zrychleni.toFixed(3);
    }

    vypisPohyb(b, vysledek, minule);

    vypisMedaile(udaj("vysledek-medaile"), uroven, vysledek.medaile, rekord?.medaile);
    // Výzvy o efektivitu: ukážou se, jakmile je úroveň projitá nebo hráč zkusil zkoušku do zlomu.
    const castVyzev = prvek('[data-cast="vyzvy"]', HTMLElement);
    const ukazVyzvy =
      prahy !== null &&
      zakladVyzevUrovne !== null &&
      !vysledek.rozpad &&
      !vysledek.brnknuti &&
      !vysledek.budic &&
      (rekord?.medaile.pruchod === true || vysledek.zlom !== null);
    castVyzev.hidden = !ukazVyzvy;
    if (ukazVyzvy) {
      // Co v každé výzvě dokázal právě zkoušený most: řádek pak pozná rekord od tohohle pokusu.
      const tento = vysledek.zlom
        ? { zlom: b.zlomSePocita ? unosnostNaKorunu(vysledek.zlom.celkem, vysledek.cena) : null }
        : vysledek.pruchod
          ? { cena: vysledek.cena, hmotnost: hmotnostNavrhu(b.navrh, uroven) }
          : {};
      vypisVyzvy(udaj("vysledek-vyzvy"), prahy, zakladVyzevUrovne, rekord, tento);
    }
    udaj("vysledek-cena").replaceChildren(
      ...bezNull([document.createTextNode(koruny(vysledek.cena)), rozdil(vysledek.cena, minule?.cena, koruny, 1)]),
    );

    // Největší využití s odkazem na prut a okamžik, kdy nastalo.
    const poleVyuziti = udaj("vysledek-vyuziti");
    let nejvic = -1;
    // Po porušení se bere obálka z doby, kdy byl most celý: co se dělo při pádu, o návrhu nic neříká.
    const obalkaVysledku = vysledek.obalkaDoPoruseni ?? vysledek.obalka;
    obalkaVysledku.forEach((o, i) => {
      if (o.vyuziti > 0 && (nejvic < 0 || o.vyuziti > obalkaVysledku[nejvic]!.vyuziti)) nejvic = i;
    });
    // S minulou zkouškou se dá porovnat jen využití celého mostu, ne číslo z doby před porušením.
    const poPoruseni = vysledek.obalkaDoPoruseni !== null;
    const zmena = poPoruseni || (minule?.obalkaDoPoruseni ?? null) !== null ? null : rozdil(vysledek.nejvetsiVyuziti, minule?.nejvetsiVyuziti, procenta, 100);
    let poznamkaVyuziti: HTMLElement | null = null;
    if (poPoruseni) {
      poznamkaVyuziti = document.createElement("small");
      poznamkaVyuziti.className = "vysledek__poznamka";
      poznamkaVyuziti.textContent = t("vysledek.vyuziti.doPoruseni");
    }
    // Těsně u meze mistrovské medaile se využití píše na desetinu procenta: „25 %“ u medaile
    // „do 25 %“, kterou most nedostal (má 25,09 %), by vypadalo jako chyba hry.
    const mezRezervy = uroven.mistrovska?.druh === "rezerva" ? uroven.mistrovska.limit : null;
    const zapisVyuziti = (podil: number): string =>
      mezRezervy !== null && podil !== mezRezervy && Math.round(podil * 100) === Math.round(mezRezervy * 100)
        ? `${cislo(podil * 100, 2)}${aktualniJazyk() === "cs" ? "\u00a0" : ""}%`
        : procenta(podil);
    if (nejvic >= 0) {
      const o = obalkaVysledku[nejvic]!;
      const skok = document.createElement("button");
      skok.type = "button";
      skok.className = "vysledek__skok";
      skok.textContent = t("vysledek.vyuzitiPrutu", {
        vyuziti: zapisVyuziti(o.vyuziti),
        prut: nejvic + 1,
        zpusob: t(nazevZpusobu(o.zpusob)),
        cas: zapisCasu(o.cas),
      });
      const prut = nejvic;
      skok.addEventListener("click", () => {
        b.oznaceny = prut;
        skocNa(o.cas);
      });
      poleVyuziti.replaceChildren(...bezNull([skok, zmena, poznamkaVyuziti]));
    } else {
      const hodnota = poPoruseni ? 0 : vysledek.nejvetsiVyuziti;
      poleVyuziti.replaceChildren(...bezNull([document.createTextNode(zapisVyuziti(hodnota)), zmena, poznamkaVyuziti]));
    }
    poleVyuziti.dataset.doPoruseni = String(poPoruseni);

    // Porušení prutů a sjetí z podpor: každé jde rozkliknout na časové ose.
    // Lano se dělí na díly a prut se může utrhnout na obou koncích: tentýž prut ve stejném
    // okamžiku se vypíše jen jednou.
    const vypsane = new Set<string>();
    const poruseni = b.udalosti.filter((u) => {
      if (u.druh === "sjeti") return true;
      if (u.druh !== "poruseni") return false;
      const klic = `${zapisCasu(u.cas)}|${u.prut}`;
      if (vypsane.has(klic)) return false;
      vypsane.add(klic);
      return true;
    }) as Extract<Udalost, { druh: "poruseni" | "sjeti" }>[];
    const radky: HTMLElement[] = poruseni.slice(0, NEJVIC_VYPSANYCH_PORUSENI).map((u) => {
      const polozka = document.createElement("li");
      const skok = document.createElement("button");
      skok.type = "button";
      skok.className = "vysledek__skok";
      skok.textContent =
        u.druh === "poruseni"
          ? t("vysledek.poruseni.radek", {
              cas: zapisCasu(u.cas),
              prut: u.prut + 1,
              zpusob: t(nazevZpusobu(u.zpusob)),
              nasledek: t(jeLano(b, u.prut) ? "vysledek.nasledek.lano" : nazevNasledku(u.nasledek)),
            })
          : t("vysledek.sjeti.radek", { cas: zapisCasu(u.cas) });
      skok.addEventListener("click", () => {
        b.oznaceny = u.druh === "poruseni" ? u.prut : null;
        // Kousek před zlomem, aby byl vidět celý.
        skocNa(u.cas - 0.05);
      });
      polozka.append(skok);
      return polozka;
    });
    // Prut, kterému se utrhly oba konce naráz, by měl dva stejné řádky.
    for (let i = radky.length - 1; i > 0; i--) {
      if (radky[i]!.textContent === radky[i - 1]!.textContent) radky.splice(i, 1);
    }
    const zbytek = document.createElement("li");
    const povolilPist =
      vysledek.zlom !== null && vysledek.zlom.cas !== null && KATALOG[b.navrh.pruty[vysledek.zlom.prut]?.prvek ?? "drevo-lehke"].druh === "pist";
    if (poruseni.length === 0 && povolilPist && vysledek.zlom?.cas != null) {
      zbytek.textContent = t("vysledek.poruseni.pist", { cas: zapisCasu(vysledek.zlom.cas), prut: vysledek.zlom.prut + 1 });
    } else if (poruseni.length === 0) zbytek.textContent = t("vysledek.poruseni.zadne");
    else if (poruseni.length > NEJVIC_VYPSANYCH_PORUSENI) {
      zbytek.textContent = t("vysledek.poruseni.dalsi", { pocet: poruseni.length - NEJVIC_VYPSANYCH_PORUSENI });
    }
    if (zbytek.textContent) radky.push(zbytek);
    udaj("vysledek-poruseni").replaceChildren(...radky);

    // Záznam porušení: co selhalo jako první a proč, s možností přehrát si to zpomaleně.
    const prvni = prvniPoruseni(b);
    // U mostu, který se složil vlastní vahou, je první porušení až následek: věta by vedla jinam.
    const slozilSe = vysledek.bezRovnovahy && !vysledek.pruchod && slozeniBehu(b) !== null;
    const ukazatPrvni = prvni !== null && !slozilSe;
    const polePrvniho = udaj("vysledek-prvni");
    polePrvniho.hidden = !ukazatPrvni;
    // K větě s čísly patří rada, co s tím (ne u mostu, který přesto obstál, a u lana přetrženého napínákem).
    const sRadou = prvni?.druh === "poruseni" && !vysledek.pruchod && !pretrzenoNapinakem(b, prvni);
    polePrvniho.textContent = prvni && ukazatPrvni ? `${vetaOPoruseni(b, prvni)}${sRadou ? ` ${radaKPoruseni(prvni.zpusob)}` : ""}` : "";
    // Zpomaleně jde přehrát všechno, na co záběr umí zamířit (i náraz lodi a pád); pokusy záběr nemají.
    const jeCoPrehrat = slozilSe || prvniPorucha(b.udalosti) !== null;
    prvek('[data-akce="prehrat-poruseni"]', HTMLElement).hidden = !jeCoPrehrat || (b.pokus && !b.zlom);

    // Další úroveň se nabídne, jakmile je tahle jednou projitá.
    const odkaz = prvek('[data-akce="dalsi"]', HTMLAnchorElement);
    const vKampani = kampan.some((u) => u.id === uroven.id);
    const dalsi = kampan[kampan.findIndex((u) => u.id === uroven.id) + 1];
    const projita = rekord?.medaile.pruchod === true;
    // Za poslední úrovní kampaně už další není: odkaz vede zpátky na přehled. Dokončená je
    // kampaň, až když je projitá každá úroveň (poslední jde otevřít i adresou nebo odemknutím).
    const posledni = vKampani && dalsi === undefined;
    const dokoncena = posledni && kampan.every((u) => uloziste.rekord(u.id)?.medaile.pruchod === true);
    odkaz.hidden = !(projita && !jePokus && vKampani);
    odkaz.classList.toggle("tlacitko--hlavni", vysledek.pruchod);
    odkaz.textContent = t(dokoncena ? "vysledek.kampanDokoncena" : posledni ? "vysledek.naPrehled" : "vysledek.dalsi");
    odkaz.href = dalsi ? `?uroven=${dalsi.id}` : window.location.pathname;
    odkaz.dataset.posledni = String(posledni);
    odkaz.dataset.dokoncena = String(dokoncena);
    odkaz.onclick = () => zapis("ovladani", { co: dokoncena ? "kampan-dokoncena" : posledni ? "na-prehled" : "dalsi-uroven" });

    udaj("otisk").textContent = t("vysledek.otisk", { otisk: vysledek.otisk });

    // Pruh výsledku: jedna věta k verdiktu, medaile a razítko do rohu výkresu.
    // Příčina neúspěchu jednou krátkou větou, od nejpodstatnější: složení, pohyblivý most,
    // první povolený prut, cokoli dalšího ze shrnutí, náraz lodi. Celé znění je v podrobnostech.
    let pricina: string | null = null;
    const slozeniPruhu = vysledek.bezRovnovahy ? slozeniBehu(b) : null;
    if (slozeniPruhu && !vysledek.pruchod) pricina = t("vysledek.kratce.slozeni", { duvod: kratceOSlozeni(slozeniPruhu) });
    else if (!vysledek.pruchod && !jePokus && !vysledek.rozpad) {
      const narazLodi = b.udalosti.find((u) => u.druh === "lod" && u.stav === "narazila");
      const vetaLodi = narazLodi && narazLodi.druh === "lod" ? t("zaber.lod", { prut: (narazLodi.prut ?? 0) + 1 }) : null;
      const dalsi = vety.slice(1).find((v) => v !== vetaNarazuLodi);
      if (pricinaPohybu) pricina = prvniVeta(pricinaPohybu);
      else if (prvni?.druh === "poruseni") {
        pricina = t("vysledek.kratce.prvni", { prut: prvni.prut + 1, zpusob: t(nazevZpusobu(prvni.zpusob)) });
        // Prut, o kterém pruh mluví, je na výkresu označený.
        if (b.oznaceny === null) {
          b.oznaceny = prvni.prut;
          obnovAnalyzu();
        }
      } else if (pricinaKmitanim) pricina = pricinaKmitanim;
      else if (dalsi) pricina = prvniVeta(dalsi);
      else if (vetaLodi) pricina = vetaLodi;
    }
    const vetaVPruhu = pricina ? `${vety[0] ?? ""} ${pricina}` : (vety[0] ?? "");
    udaj("vysledek-veta").textContent = vetaVPruhu;
    // Pruh má na větu dva řádky; co se nevejde, je celé v bublině i v podrobnostech.
    udaj("vysledek-veta").title = vetaVPruhu;
    const pruhMedaili = udaj("vysledek-medaile-pruh");
    pruhMedaili.hidden = jePokus || sandbox !== null;
    if (!pruhMedaili.hidden) vypisMedailePruhu(pruhMedaili, uroven, vysledek.medaile, rekord?.medaile);
    // Hlavní tlačítko: po výhře Další úroveň, po prohře Upravit most (i v úrovni, která už je projitá).
    const hlavniJeDalsi = !odkaz.hidden && (vysledek.pruchod || jePokus);
    odkaz.classList.toggle("tlacitko--hlavni", hlavniJeDalsi);
    prvek('[data-akce="upravit"]', HTMLElement).classList.toggle("tlacitko--hlavni", !hlavniJeDalsi && !jePokus);
    const razitko = udaj("verdikt");
    const sVerdiktem = !jePokus && !vysledek.rozpad;
    razitko.dataset.stav = vysledek.pruchod ? "obstal" : "neobstal";
    razitko.replaceChildren(t(vysledek.pruchod ? "verdikt.schvaleno" : "verdikt.zamitnuto"));
    const podpis = document.createElement("small");
    podpis.textContent = t("verdikt.podpis", { list: uroven.id, datum: datum(new Date()) });
    razitko.append(podpis);
    razitko.dataset.ukazat = String(sVerdiktem);
    document.body.dataset.pricina = pricina ?? "";
    // Věta ze záběru nad výkresem říká totéž co výsledek; pod pruhem by jen překážela.
    skryjHlaseni();
    sbalVysledek(true);
    ukazPanelVysledku(true);
  }

  // ---- Okno se zadáním úrovně ----

  function naplnZadani(): void {
    udaj("zadani-list").textContent = t("zadani.uroven", { id: uroven.id });
    udaj("zadani-nazev").textContent = nazevUrovne(uroven);
    const klic = `zadani.${uroven.id}`;
    udaj("zadani-text").textContent = jeKlicTextu(klic) ? t(klic) : "";

    const polozka = (text: string): HTMLLIElement => {
      const uzel = document.createElement("li");
      uzel.textContent = text;
      return uzel;
    };
    const provoz = uroven.jizdniRad.map((p) => polozka(zapisJizdy(p, true)));
    // Nerovná vozovka a kolej se styky patří k provozu: říkají, o kolik víc vozidla most zatíží.
    if (uroven.nerovnost !== "zadna") {
      if (uroven.jizdniRad.some((p) => !jeClovek(p.druh) && !jeKolejove(p.druh))) provoz.push(polozka(t(`zadani.vozovka.${uroven.nerovnost}`)));
      if (uroven.jizdniRad.some((p) => jeKolejove(p.druh))) provoz.push(polozka(t(`zadani.kolej.${uroven.nerovnost}`)));
    }
    // Zvedání mostu a lodě patří do děje zkoušky stejně jako auta.
    if (uroven.pohyb) {
      provoz.push(polozka(t("zadani.pohyb", { zvednout: cislo(uroven.pohyb.zvednout, 0), sklopit: cislo(uroven.pohyb.sklopit, 0) })));
    }
    for (const lod of uroven.lode) {
      provoz.push(
        polozka(
          t("zadani.lod", {
            cas: cislo(lod.cas, 0),
            trvani: cislo(lod.trvani, 0),
            vyska: cislo(lod.vyska, 0),
            sirka: cislo(lod.xMax - lod.xMin, 0),
          }),
        ),
      );
    }
    udaj("zadani-provoz").replaceChildren(...(provoz.length > 0 ? provoz : [polozka(t("zadani.provoz.zadny"))]));

    const stavba = uroven.povolenePrvky
      .filter((id) => KATALOG[id].hotovo)
      .map((id) => polozka(t("zadani.stavba.prvek", { prvek: nazevPrvku(id), cena: zapisCenyPrvku(id) })));
    if (uroven.nejvetsiZavazi > 0) {
      stavba.push(
        polozka(t("zadani.stavba.zavazi", { zaKg: koruny(CENA_ZAVAZI), kg: cislo(uroven.nejvetsiZavazi, 0) })),
      );
    }
    if (uroven.nejvetsiTlumic >= LADENY_TLUMIC.nejmensiHmota) {
      stavba.push(
        polozka(
          t("zadani.stavba.ladeny", {
            zaKus: koruny(LADENY_TLUMIC.cenaZaKus),
            zaKg: koruny(LADENY_TLUMIC.cenaZaKg),
            kg: cislo(uroven.nejvetsiTlumic, 0),
          }),
        ),
      );
    }
    if (smiLana) stavba.push(polozka(t("zadani.stavba.napinak")));
    if (uroven.povoleneSvary) stavba.push(polozka(t("zadani.stavba.svar", { zaPrut: koruny(CENA_SVARU) })));
    if (uroven.pohyb) stavba.push(polozka(t("zadani.stavba.zamek", { zaKus: koruny(ZAMEK.cena) })));
    if (uroven.budic) stavba.push(polozka(t("zadani.stavba.budic")));
    if (uroven.rozpocet !== null) {
      stavba.push(polozka(t("zadani.stavba.rozpocet", { castka: koruny(uroven.rozpocet) })));
    }
    udaj("zadani-stavba").replaceChildren(...stavba);

    // Souvislost se skutečnými mosty a ukázka toho, co úroveň učí.
    const skutecnost = `skutecnost.${uroven.id}`;
    const poleSkutecnosti = udaj("zadani-skutecnost");
    poleSkutecnosti.hidden = !jeKlicTextu(skutecnost);
    if (jeKlicTextu(skutecnost)) poleSkutecnosti.textContent = t("zadani.skutecnost", { text: t(skutecnost) });
    // Návod k ovládání patří jen k úplně první úrovni.
    udaj("zadani-ovladani").hidden = uroven.id !== kampan[0]?.id;
    // Na dotykové obrazovce se nekreslí myší a mezerník tam není.
    if (window.matchMedia?.("(pointer: coarse)").matches) udaj("zadani-ovladani").textContent = t("zadani.ovladani.dotyk");

    const zadaniUkazky = ukazkaUrovne(uroven);
    const oddil = udaj("ukazka");
    oddil.hidden = zadaniUkazky === null;
    if (zadaniUkazky) {
      for (const cast of ["a", "b", "popis"] as const) {
        const klicUkazky = `ukazka.${uroven.id}.${cast}`;
        udaj(`ukazka-${cast}`).textContent = jeKlicTextu(klicUkazky) ? t(klicUkazky) : "";
      }
      ukazka = new Ukazka(oddil, zadaniUkazky);
    }
  }

  function otevriZadani(): void {
    if (oknoZadani.open) return;
    zadaniOtevrenoV = Date.now();
    vypisMedaile(udaj("zadani-medaile"), uroven, rekord?.medaile ?? BEZ_MEDAILI);
    // Výzvy o efektivitu, jen kde je úroveň má. Zadání říká, oč se hraje (zlato); stupně
    // bronz a stříbro ukáže až výsledek zkoušky. Devět čísel najednou by tu jen mátlo.
    for (const uzel of oknoZadani.querySelectorAll<HTMLElement>('[data-cast="zadani-vyzvy"]')) uzel.hidden = prahy === null;
    if (prahy) {
      udaj("zadani-vyzvy").replaceChildren(
        ...DRUHY_VYZEV.map((druh) => {
          const uzel = document.createElement("li");
          uzel.textContent = t(`vyzvy.zadani.${druh}`, { zlato: zapisVyzvy(druh, prahy[druh][2]) });
          uzel.dataset.vyzva = druh;
          return uzel;
        }),
      );
    }
    oknoZadani.showModal();
    // Okno se otevírá odshora, i když je vyšší než obrazovka; mezerník a Enter ho zavřou.
    prvek('#okno-zadani button[value="zavrit"]', HTMLButtonElement).focus({ preventScroll: true });
    oknoZadani.scrollTop = 0;
    ukazka?.spust();
  }

  // ---- Okno s textem: export, import a diagnostika ----

  function otevriOkno(druh: "export" | "import" | "diagnostika", text: string): void {
    udaj("okno-nadpis").textContent = t(`okno.${druh}.nadpis`);
    udaj("okno-popis").textContent = t(`okno.${druh}.popis`);
    udaj("okno-hlaseni").textContent = "";
    obsahOkna.value = text;
    obsahOkna.readOnly = druh !== "import";
    prvek('[data-akce="okno-kopirovat"]', HTMLButtonElement).hidden = druh === "import";
    prvek('[data-akce="okno-nacist"]', HTMLButtonElement).hidden = druh !== "import";
    okno.dataset.druh = druh;
    okno.showModal();
    if (druh === "import") obsahOkna.focus();
    else obsahOkna.select();
  }

  async function zkopirujObsahOkna(): Promise<void> {
    let zkopirovano = false;
    try {
      await navigator.clipboard.writeText(obsahOkna.value);
      zkopirovano = true;
    } catch {
      obsahOkna.select();
    }
    udaj("okno-hlaseni").textContent = t(zkopirovano ? "okno.zkopirovano" : "okno.nezkopirovano");
  }

  function nactiMostZOkna(): void {
    let navrh: NavrhMostu;
    try {
      navrh = navrhZTextu(obsahOkna.value.trim());
    } catch (chyba) {
      // Most z novější verze hry má vlastní větu. Věty kontroly dat jsou jen česky: v jiném
      // jazyce hra řekne jen to, že text není most.
      udaj("okno-hlaseni").textContent =
        chyba instanceof ChybaDat && chyba.kod === "novejsi-verze"
          ? t("okno.import.novejsi")
          : aktualniJazyk() !== "cs"
            ? t("okno.import.neniMost")
            : t("okno.import.chyba", { duvod: (chyba instanceof Error ? chyba.message : String(chyba)).replace(/^navrh[:.]\s?/, "") });
      return;
    }
    if (navrh.uroven !== uroven.id) {
      udaj("okno-hlaseni").textContent = t("okno.import.jinaUroven", { uroven: navrh.uroven });
      return;
    }
    okno.close();
    editor.nahrad(navrh);
    // Pozornost patří výkresu: mezerník má spustit zkoušku, ne znovu otevřít Import.
    canvas.focus();
    const prekazka = prekazkyZkousky(editor.navrh, uroven)[0];
    if (prekazka) ukazHlaseni(textDuvodu(prekazka.druh, null), "varovani", true);
  }

  function textDiagnostiky(): string {
    const radky = [
      `Mostmistr ${__VERZE_HRY__} · ${__OTISK_SESTAVENI__} · fyzika v${VERZE_FYZIKY}`,
      `Úroveň: ${uroven.id} ${uroven.nazev}`,
      `Prohlížeč: ${navigator.userAgent}`,
      `Most: ${navrhNaText(beh?.navrh ?? editor.navrh)}`,
    ];
    if (beh?.vysledek) {
      radky.push(`Výsledek: ${JSON.stringify(beh.vysledek)}`);
      radky.push(`Události: ${JSON.stringify(beh.udalosti)}`);
    }
    return radky.join("\n");
  }

  // ---- Propojení s ovládáním ----

  pripojOvladani(canvas, {
    posun: (dx, dy) => zmenPohled(posunO(kamera, dx, dy)),
    zoom: zoomuj,
    zoomNaStred: zoomujNaStred,
    celyVykres: ukazCelyVykres,
    kurzor: (misto) => {
      mistoKurzoru = misto;
      obnovPohled();
    },
    leve: {
      stisk: (misto, klavesy) => {
        if (rezim === "zkouska") {
          klikniVeZkousce(misto);
          return;
        }
        if (nastroj === "brnknuti" || nastroj === "budic") {
          const id = editor.stycnikU(obrazNaSvet(kamera, platno.rozmer, misto));
          const poradi = id === null ? -1 : editor.navrh.stycniky.findIndex((st) => st.id === id);
          if (nastroj === "budic") {
            if (poradi >= 0) {
              skryjHlaseni();
              spustBudic(poradi);
            }
            return;
          }
          brnk = poradi >= 0 ? { stycnik: poradi, od: misto, k: misto } : null;
          return;
        }
        if (jePridavek(nastroj)) {
          povesPridavek(nastroj, obrazNaSvet(kamera, platno.rozmer, misto));
          obnovPohled();
          return;
        }
        skryjHlaseni();
        editor.stiskni(obrazNaSvet(kamera, platno.rozmer, misto), {
          pridat: klavesy.shift,
          posouvat: klavesy.alt || nastroj === "vyber",
          bezKresleni: nastroj === "vyber",
        });
        obnovPohled();
      },
      tah: (misto) => {
        if (brnk) {
          brnk.k = misto;
          ukazHlaseni(t("brnknuti.tah", { sila: cislo(silaBrnknuti(brnk) / 1000, 1) }), "info", false);
          platno.prekresli();
          return;
        }
        if (rezim !== "stavba" || !editor.tah) return;
        editor.tahni(obrazNaSvet(kamera, platno.rozmer, misto));
        hlasTah();
        obnovPohled();
      },
      pusteni: () => {
        if (brnk) {
          const pokus = { stycnik: brnk.stycnik, sila: silaBrnknuti(brnk) };
          brnk = null;
          skryjHlaseni();
          if (pokus.sila >= NEJMENSI_BRNKNUTI) spustZkousku(pokus);
          else platno.prekresli();
          return;
        }
        if (rezim !== "stavba") return;
        // Bez rozdělaného tahu (kliknutí nástrojem přídavku) není co hlásit; důvod, proč
        // editor odmítl dřívější tah, by se jinak ukázal znovu.
        const tahl = editor.tah !== null;
        const kreslil = editor.tah?.druh === "prut";
        editor.pust();
        if (tahl && editor.posledniDuvod) {
          ukazHlaseni(textDuvodu(editor.posledniDuvod, kreslil ? editor.prvek : null), "varovani", true);
        }
        obnovStavbu();
      },
      zruseni: () => {
        brnk = null;
        editor.zrusTah();
      },
      // Přídavky, budič a výběr prutu při zkoušce jednají hned stiskem: u dotyku až ťuknutím.
      okamzity: () => rezim === "zkouska" || nastroj === "budic" || jePridavek(nastroj),
    },
  });

  const priKliknuti = (akce: string, obsluha: () => void): void => {
    prvek(`[data-akce="${akce}"]`, HTMLElement).addEventListener("click", obsluha);
  };
  /**
   * Tlačítko, které při držení krok opakuje: po `PRODLEVA_DRZENI` ms každých `OPAKOVANI_DRZENI` ms.
   * Kliknutí (i klávesnicí) je jeden krok.
   */
  const priDrzeni = (akce: string, obsluha: (shift: boolean) => void): void => {
    const tlacitko = prvek(`[data-akce="${akce}"]`, HTMLElement);
    let cekani = 0;
    let opakovani = 0;
    let opakovano = false;
    const pust = (): void => {
      window.clearTimeout(cekani);
      window.clearInterval(opakovani);
      cekani = 0;
      opakovani = 0;
    };
    tlacitko.addEventListener("pointerdown", (udalost) => {
      if (udalost.button !== 0) return;
      pust();
      opakovano = false;
      const shift = udalost.shiftKey;
      cekani = window.setTimeout(() => {
        opakovani = window.setInterval(() => {
          opakovano = true;
          obsluha(shift);
        }, OPAKOVANI_DRZENI);
      }, PRODLEVA_DRZENI);
    });
    for (const konec of ["pointerup", "pointerleave", "pointercancel", "blur"] as const) tlacitko.addEventListener(konec, pust);
    tlacitko.addEventListener("click", (udalost) => {
      // Kliknutí po držení už krok neudělá: ten poslední udělalo opakování.
      if (opakovano) opakovano = false;
      else obsluha(udalost.shiftKey);
    });
  };
  priKliknuti("oddalit", () => zoomujNaStred(1 / KROK_ZOOMU_TLACITKEM));
  priKliknuti("priblizit", () => zoomujNaStred(KROK_ZOOMU_TLACITKEM));
  priKliknuti("cely-vykres", ukazCelyVykres);
  priKliknuti("zkouska", () => (rezim === "stavba" ? spustZkousku() : zpetKeStavbe()));
  priKliknuti("vyber", prepniVyber);
  // Nápověda: jen na úrovních, které mají referenční most.
  const tlacitkoNapovedy = prvek('[data-akce="napoveda"]', HTMLButtonElement);
  tlacitkoNapovedy.hidden = reseniUrovne === undefined;
  const reseniMedaili = sandbox ? undefined : RESENI[uroven.id];
  if (reseniUrovne && reseniMedaili) {
    napoveda = pripojNapovedu(reseniMedaili, uroven, {
      zmenaObrysu: () => platno.prekresli(),
      pouzita: (stupen, most) => {
        napovedaPouzita = true;
        // `krok` drží význam, který zná souhrn pro správce (1 nápověda otevřená, 2 obrys);
        // `stupen` je krok nápovědy (1 princip, 2 materiál, 3 obrys) a `most`, ke kterému patří.
        zapis("napoveda", {
          krok: stupen === 3 ? 2 : 1,
          stupen,
          most,
          zkousek: zkousekVUrovni,
          sekund: sekundVUrovni(),
          projito: rekord?.medaile.pruchod === true,
        });
      },
      projito: () => rekord?.medaile.pruchod === true,
    });
    tlacitkoNapovedy.addEventListener("click", () => {
      if (rezim === "stavba") napoveda?.otevri();
    });
  }

  // Sandbox: okno s nastavením údolí a provozu. Nové nastavení se uloží a stránka se načte
  // znovu, protože se změnila celá úroveň; most zůstane, pokud se nezměnilo údolí.
  const tlacitkoSandboxu = prvek('[data-akce="sandbox"]', HTMLButtonElement);
  tlacitkoSandboxu.hidden = sandbox === null;
  // Háček pro styly a testy: v pískovišti se nesoutěží, medaile tam nejsou vidět.
  if (sandbox) document.body.dataset.sandbox = "ano";
  if (sandbox) {
    const oknoSandboxu = pripojSandbox(sandbox, {
      maMost: () => editor.navrh.pruty.length > 0,
      pouzij: (nove, smazatMost) => {
        zapis("sandbox.nastaveni", {
          rozpeti: nove.rozpeti,
          hloubka: nove.hloubka,
          druh: nove.druh,
          voda: nove.voda,
          zaklady: nove.zaklady,
          provoz: nove.provoz.map((p) => `${p.pocet}x${p.druh}`).join(","),
          smazanMost: smazatMost,
        });
        uloziste.sandbox = nove;
        if (smazatMost) {
          // Editor by při odchodu ze stránky starý most zase uložil: nejdřív ho vyprázdnit.
          editor.smazVse();
          uloziste.smazNavrh(uroven.id);
        }
        // Bez paměti prohlížeče by se po načtení vrátilo výchozí údolí: nastavení ponese adresa.
        if (uloziste.trvale) window.location.reload();
        else window.location.search = `?sandbox=${encodeURIComponent(sandboxNaText(nove))}`;
      },
    });
    tlacitkoSandboxu.addEventListener("click", () => {
      if (rezim === "stavba") oknoSandboxu.otevri();
    });
  }
  priKliknuti("brnknout", prepniBrnknuti);
  priKliknuti("zlom", () => spustZkousku(undefined, undefined, true));
  priKliknuti("budic", prepniBudic);
  priKliknuti("budic-rozsah", () => {
    rytmusBudice = null;
    obnovStavbu();
  });
  for (const [akce, smer] of [["budic-min", -1], ["budic-plus", 1]] as const) {
    prvek(`[data-akce="${akce}"]`, HTMLElement).addEventListener("click", (udalost) => {
      // Se Shiftem po pěti krocích, tedy o 0,25 Hz.
      if (rezim === "stavba") zmenRytmusBudice(smer * (udalost.shiftKey ? 5 : 1));
    });
  }
  for (const [akce, smer] of [["zavazi-min", -1], ["zavazi-plus", 1]] as const) {
    priDrzeni(akce, (shift) => {
      // Se Shiftem po pěti krocích. Podržené tlačítko krok opakuje.
      if (rezim !== "stavba" || !editor.zmenZavazi(smer, shift ? 5 : 1)) return;
      const zavazi = editor.zavaziVyberu;
      if (zavazi !== null && zavazi > 0) posledniZavazi = zavazi;
      obnovStavbu();
    });
  }
  priKliknuti("ladeny-prepnout", prepniLadenyTlumic);
  priKliknuti("ladeny-naladit", () => {
    const cil = cilLadeni();
    if (rezim === "stavba" && cil !== null) editor.naladTlumic(cil);
  });
  priKliknuti("ladeny-hmota-min", () => rezim === "stavba" && editor.zmenHmotuTlumice(-1));
  priKliknuti("ladeny-hmota-plus", () => rezim === "stavba" && editor.zmenHmotuTlumice(1));
  for (const [akce, smer] of [["ladeny-frekvence-min", -1], ["ladeny-frekvence-plus", 1]] as const) {
    prvek(`[data-akce="${akce}"]`, HTMLElement).addEventListener("click", (udalost) => {
      // Se Shiftem po čtyřech krocích, tedy o 0,2 Hz.
      if (rezim === "stavba") editor.zmenFrekvenciTlumice(smer * (udalost.shiftKey ? 4 : 1));
    });
  }
  for (const [akce, smer] of [["predpeti-min", -1], ["predpeti-plus", 1]] as const) {
    prvek(`[data-akce="${akce}"]`, HTMLElement).addEventListener("click", (udalost) => {
      // Se Shiftem po deseti krocích, tedy o centimetr.
      if (rezim === "stavba") editor.zmenPredpeti(smer * (udalost.shiftKey ? 10 : 1));
    });
  }
  priKliknuti("svar-prepnout", prepniSvar);
  priKliknuti("dopnout", dopniLana);
  priKliknuti("zamek-prepnout", prepniZamek);
  priKliknuti("zdvih-min", () => rezim === "stavba" && editor.zmenZdvih(-1));
  priKliknuti("zdvih-plus", () => rezim === "stavba" && editor.zmenZdvih(1));
  priKliknuti("tlumeni-min", () => rezim === "stavba" && editor.zmenTlumeni(-1));
  priKliknuti("tlumeni-plus", () => rezim === "stavba" && editor.zmenTlumeni(1));
  priKliknuti("smazat", smazVybrane);
  priKliknuti("zrcadlit", zrcadli);
  priKliknuti("zpet", () => rezim === "stavba" && editor.zpet());
  priKliknuti("zpet-rychle", () => rezim === "stavba" && editor.zpet());
  priKliknuti("smazat-rychle", smazVybrane);
  priKliknuti("znovu", () => rezim === "stavba" && editor.znovu());
  priKliknuti("smazat-vse", () => rezim === "stavba" && editor.smazVse());
  priKliknuti("export", () => {
    zapis("ovladani", { co: "export" });
    otevriOkno("export", navrhNaText(editor.navrh));
  });
  priKliknuti("import", () => rezim === "stavba" && otevriOkno("import", ""));
  priKliknuti("prehrat", prepniPrehravani);
  priKliknuti("na-konec", skocNaKonec);
  priKliknuti("krok-zpet", () => krokuj(-1));
  priKliknuti("krok-vpred", () => krokuj(1));
  priKliknuti("cisla", prepniCisla);
  priKliknuti("zvuk", prepniZvuk);
  priKliknuti("analyza", prepniAnalyzu);
  priKliknuti("analyza-zavrit", prepniAnalyzu);
  platnoKrivky.addEventListener("click", () => {
    // Svislé měřítko křivky se drží; kliknutí ho přizpůsobí tomu, co je vidět teď.
    stropKrivky = 0;
    obnovAnalyzu();
  });
  priKliknuti("zadani", otevriZadani);
  priKliknuti("zadani-cele", otevriZadani);
  oknoZadani.addEventListener("close", () => {
    zapis("zadani.zavreno", { sekund: Math.round((Date.now() - zadaniOtevrenoV) / 1000), ukazka: udaj("ukazka").dataset.stav ?? "zadna" });
  });
  priKliknuti("upravit", zpetKeStavbe);
  const tlacitkoZaberu = prvek('[data-akce="zaber"]', HTMLButtonElement);
  /** Vypínač záběru říká svůj stav slovy: „Zpomalit pád“ znělo jako akce, ne jako volba. */
  tlacitkoZvetseni.addEventListener("click", () => {
    zvetseniZapnuto = !zvetseniZapnuto;
    uloziste.zvetseniPohybu = zvetseniZapnuto;
    zapis("ovladani", { co: "zvetseni", stav: zvetseniZapnuto });
    obnovZvetseni();
  });
  const obnovVypinacZaberu = (): void => {
    tlacitkoZaberu.setAttribute("aria-pressed", String(zaberZapnuty));
    tlacitkoZaberu.textContent = t(zaberZapnuty ? "zkouska.zaber.zap" : "zkouska.zaber.vyp");
  };
  obnovVypinacZaberu();
  tlacitkoZaberu.addEventListener("click", () => {
    zaberZapnuty = !zaberZapnuty;
    uloziste.zpomaleniPadu = zaberZapnuty;
    obnovVypinacZaberu();
    zapis("ovladani", { co: "zaber", stav: zaberZapnuty });
    // Vypnutí běžící záběr ukončí; záběr, který teprve čeká, se změní na tichý (jen věta).
    if (!zaberZapnuty && beh) {
      const cekal = beh.zaber.stav === "pripraven" && !beh.zaber.domov;
      zrusZaber();
      if (cekal) {
        beh.zaber = { stav: "hleda", vynuceno: false };
        delete document.body.dataset.zaber;
      }
    }
  });
  priKliknuti("vysledek-sbalit", () => {
    const sbalit = panelVysledku.dataset.sbaleno !== "ano";
    zapis("ovladani", { co: "vysledek", stav: !sbalit });
    sbalVysledek(sbalit);
  });
  priKliknuti("prehrat-poruseni", () => {
    zapis("ovladani", { co: "prehrat-poruseni" });
    prehrajPrvniPoruseni();
  });
  priKliknuti("prehrat-znovu", () => {
    if (!beh) return;
    ukazPanelVysledku(false);
    beh.vysledekUkazan = false;
    beh.oznaceny = null;
    skryjHlaseni();
    hledejZaber(beh, false);
    prehravani = { ...prehravani, cas: 0, bezi: true };
    obnovOsu();
  });
  priKliknuti("diagnostika", () => {
    zapis("ovladani", { co: "diagnostika" });
    otevriOkno("diagnostika", textDiagnostiky());
  });
  priKliknuti("okno-kopirovat", () => void zkopirujObsahOkna());
  priKliknuti("okno-nacist", nactiMostZOkna);

  for (const tlacitko of tlacitkaRychlosti) {
    tlacitko.addEventListener("click", () => {
      prehravani = { ...prehravani, rychlost: Number(tlacitko.dataset.rychlost) };
      obnovOsu();
    });
  }
  tahlo.addEventListener("input", () => skocNa(Number(tahlo.value)));
  // Popis značek: u myši pod ukazatelem, u prstu při ťuknutí na osu a při tažení táhla. Poslouchá
  // celá dráha osy (i s pruhem nad a pod táhlem), protože značky z táhla vyčnívají.
  const drahaOsy = prvek("#obrazovka-uroven .osa__drah", HTMLElement);
  drahaOsy.addEventListener("pointermove", ukazBublinuOsy);
  drahaOsy.addEventListener("pointerdown", ukazBublinuOsy);
  for (const konec of ["pointerleave", "pointerup", "pointercancel"] as const) {
    drahaOsy.addEventListener(konec, (udalost) => {
      window.clearTimeout(casovacBubliny);
      if (udalost.pointerType === "mouse") {
        // Myš nad osou zůstává a bublina s ní; zmizí, až ukazatel odjede.
        if (konec !== "pointerup") bublinaOsy.hidden = true;
        return;
      }
      // Prst po zvednutí nad osou nezůstává: bublina ještě chvíli počká, ať se dá přečíst.
      casovacBubliny = window.setTimeout(() => (bublinaOsy.hidden = true), DOBA_BUBLINY_PO_DOTYKU);
    });
  }

  // Po kliknutí myší na tlačítko se pozornost vrací na výkres, aby mezerník dál pouštěl
  // zkoušku a nemačkal znovu poslední tlačítko.
  // Jakékoli otevřené okno (text mostu, zadání, zpětná vazba) bere klávesy a kliknutí sobě.
  const otevreneOkno = (): boolean => document.querySelector("dialog[open]") !== null;
  prvek("#obrazovka-uroven", HTMLElement).addEventListener("click", (udalost) => {
    if (udalost.detail === 0 || otevreneOkno()) return;
    if (udalost.target instanceof Element && udalost.target.closest("button")) canvas.focus({ preventScroll: true });
  });

  window.addEventListener("keydown", (udalost) => {
    if (otevreneOkno() || jePsaciPole(udalost.target)) return;
    const stavi = rezim === "stavba";
    const klavesa = udalost.key.length === 1 ? udalost.key.toLowerCase() : udalost.key;

    if (udalost.ctrlKey || udalost.metaKey) {
      if (!stavi || udalost.altKey) return;
      if (klavesa === "z" && !udalost.shiftKey) editor.zpet();
      else if (klavesa === "y" || (klavesa === "z" && udalost.shiftKey)) editor.znovu();
      else if (klavesa === "a") editor.vyberVse();
      else return;
      udalost.preventDefault();
      return;
    }
    if (udalost.altKey) return;

    switch (klavesa) {
      case " ":
        // Na tlačítku a odkazu mezerník mačká je; zkoušku pouští jen jinde.
        if (udalost.target instanceof HTMLButtonElement || udalost.target instanceof HTMLAnchorElement) return;
        if (udalost.repeat) break;
        if (stavi) spustZkousku();
        else zpetKeStavbe();
        break;
      case "Escape":
        if (stavi) {
          editor.zrusVyber();
          editor.zrusTah();
          skryjHlaseni();
          // Věšení přídavků Escape ukončí; zůstane kreslení zvoleným prvkem.
          if (jePridavek(nastroj)) nastroj = "kresleni";
          obnovStavbu();
        } else if (!preskocZaber()) zpetKeStavbe();
        break;
      case "Delete":
      case "Backspace":
        smazVybrane();
        break;
      case "m":
        zrcadli();
        break;
      case "v":
        prepniVyber();
        break;
      case "b":
        prepniBrnknuti();
        break;
      case "p":
        prepniPrehravani();
        break;
      case "End":
        skocNaKonec();
        break;
      case ",":
        if (stavi) return;
        krokuj(-1);
        break;
      case ".":
        if (stavi) return;
        krokuj(1);
        break;
      case "c":
        prepniCisla();
        break;
      case "z":
        prepniZvuk();
        break;
      case "l":
        prepniLadenyTlumic();
        break;
      case "s":
        if (udalost.repeat) break;
        // Se zapnutým nástrojem Svar klávesa nástroj jen odloží; svar právě přidaný kliknutím nechá být.
        if (nastroj === "svar") prepniPridavek("svar");
        else prepniSvar();
        break;
      case "n":
        if (!udalost.repeat) dopniLana();
        break;
      case "a":
        prepniAnalyzu();
        break;
      case "u":
        prepniBudic();
        break;
      case "d":
        if (!udalost.repeat) spustZkousku(undefined, undefined, true);
        break;
      default: {
        const poradi = Number(klavesa) - 1;
        if (!Number.isInteger(poradi)) return;
        const id = uroven.povolenePrvky[poradi];
        const pridavek = pridavky[poradi - uroven.povolenePrvky.length];
        if (id) zvolPrvek(id);
        else if (pridavek) prepniPridavek(pridavek);
        else return;
      }
    }
    udalost.preventDefault();
  });

  // ---- Přehrávání ----

  const poleKmitani = udaj("kmitani");
  let predchoziSnimekObrazu: number | null = null;
  function snimekObrazu(ted: number): void {
    const uplynulo = predchoziSnimekObrazu === null ? 0 : Math.min(0.1, (ted - predchoziSnimekObrazu) / 1000);
    predchoziSnimekObrazu = ted;
    if (rezim === "zkouska" && beh) {
      const b = beh;
      if (prehravani.bezi) {
        // Dokud se počítá, lze přehrávat jen to, co už je v záznamu, a konec děje není znám.
        const spocitano = b.spocitanoVse ? b.trvani : b.zaznam.konec;
        // Kolem prvního porušení se čas zpomalí; zvolená rychlost zůstává, jaká je.
        pripravZaber(b);
        const zab = b.zaber.stav === "pripraven" && !b.zaber.tichy ? b.zaber : null;
        const mira = zab ? miraZpomaleni(prehravani.cas, zab.zaber.okamzik, zab.tempo) : 0;
        rychlostTed = zab && mira > 0 ? rychlostVZaberu(prehravani.rychlost, mira, zab.nejpomaleji) : prehravani.rychlost;
        const posunuty = posunPrehravani({ ...prehravani, rychlost: rychlostTed }, uplynulo, spocitano, b.spocitanoVse ? b.trvani : Infinity);
        const novy = { ...posunuty, rychlost: prehravani.rychlost };
        // Při rychlém přehrávání nebo trhaném obrazu by jeden snímek mohl začátek záběru
        // přeskočit a zlom by proběhl plnou rychlostí: přes začátek se nejde, jen na něj.
        if (zab && !zab.domov) {
          const zacatek = zacatekZaberu(zab.zaber.okamzik, zab.tempo);
          if (prehravani.cas < zacatek && novy.cas > zacatek + 1e-3) novy.cas = zacatek + 1e-3;
        }
        if (novy.cas !== prehravani.cas || novy.bezi !== prehravani.bezi) {
          prehravani = novy;
          vedZaber(b);
          ohlasKmitani(b);
          // Děj skončil dřív než záběr (porušení těsně před koncem): pohled se vrátí hned.
          if (!novy.bezi && b.spocitanoVse && novy.cas >= b.trvani - 1e-6) zrusZaber();
          obnovOsu();
        }
      }
      if (posunZvetseni(b, uplynulo)) platno.prekresli();
      // Výsledek se ukazuje na konci přehrávání; když most neprošel a je jasné proč, už chvíli
      // po první poruše (pruh most nezakrývá a hráč nemusí čekat nad troskami do konce osy).
      if (b.vysledek && !b.vysledekUkazan && (prehravani.cas >= b.trvani - 1e-6 || jeRozhodnuto(b))) ukazVysledek(b, b.vysledek);
      if (!panelAnalyzy.hidden) nakresliPrubehy(b);
      // Zvuk: co v právě přehraném úseku záznamu zaznělo. Skok po ose je potichu.
      if (poslech) {
        const zvuky = poslech.posun(b, prehravani.cas);
        if (zvuky.length > 0) {
          // Zpomalené přehrávání zní hlouběji a pomaleji, zrychlené naopak.
          const tempo = Math.max(0.5, Math.min(1.5, Math.pow(prehravani.bezi ? rychlostTed : prehravani.rychlost, 0.3)));
          ozvuceni.zahraj(zvuky, (z) => panorama(z.x, z.y), tempo);
          obnovPoctyZvuku();
        }
        ozvuceni.valeni(prehravani.bezi ? poslech.valeni : 0, panorama(poslech.valeniX, 0));
      }
      // Okamžité kmitání mostovky v právě přehrávaném okamžiku.
      let text = "";
      if (b.budic && b.zaznam.stavV(prehravani.cas, snimek) !== null) {
        // Budič: v jakém rytmu právě bije a jak moc se pod ním mostovka houpe.
        text = t("legenda.budic", {
          f: cislo(frekvenceBudice(b.budic, prehravani.cas), 2),
          zrychleni: cislo(snimek.kmitani, 2),
        });
      } else if (b.zlom) {
        // Zkouška do zlomu: kolik zátěže na mostě právě leží. Čte se ze šipek záznamu (každá
        // nese zatížení na metr): zátěž neroste přesně s časem, při otevírání plastického
        // kloubu čeká a po prvním porušení zůstává ležet.
        let naMetr = 0;
        if (b.zaznam.stavV(prehravani.cas, snimek) !== null) {
          for (let i = 3; i < snimek.sily.length; i += 4) naMetr = Math.max(naMetr, Math.abs(snimek.sily[i]!));
        }
        let delka = 0;
        for (const trasa of uroven.trasy) delka += Math.abs(trasa.konec.x - trasa.zacatek.x);
        text = t("legenda.zlom", {
          naMetr: cislo(naMetr / 1000, 1),
          tun: cislo((naMetr * delka) / TIHOVE_ZRYCHLENI / 1000, 1),
        });
      } else if (maLidi && !b.pokus && b.zaznam.stavV(prehravani.cas, snimek) !== null) {
        text = t("legenda.kmitani", { zrychleni: cislo(snimek.kmitani, 2) });
      }
      if (poleKmitani.textContent !== text) poleKmitani.textContent = text;
    } else {
      if (poleKmitani.textContent !== "") poleKmitani.textContent = "";
      // Předváděný tvar kmitání se houpe, i když se na výkresu nic jiného neděje.
      if (tvarKmitani !== null && rezim === "stavba") platno.prekresli();
    }
    requestAnimationFrame(snimekObrazu);
  }
  requestAnimationFrame(snimekObrazu);

  // ---- Úvodní naplnění stránky ----

  vytvorPaletu();
  udaj("uroven").textContent = `${uroven.id}  ${nazevUrovne(uroven)}`;
  // V úzkém okně se název zkrátí třemi tečkami: celý je v bublině.
  udaj("uroven").title = `${uroven.id}  ${nazevUrovne(uroven)}`;
  udaj("nazev").textContent = nazevUrovne(uroven);
  udaj("list").textContent = uroven.id;
  // Otisk sestavení je údaj pro hlášení chyb: v popisovém poli je jen v bublině.
  udaj("verze").textContent = __VERZE_HRY__;
  udaj("verze").title = `${__VERZE_HRY__} · ${__OTISK_SESTAVENI__}`;
  udaj("datum").textContent = datum(new Date());
  const klicZadani = `zadani.${uroven.id}`;
  udaj("zadani").textContent = jeKlicTextu(klicZadani) ? t(klicZadani) : "";
  document.title = `${uroven.id} ${nazevUrovne(uroven)} – ${t("hra.nazev")}`;

  // Jízdní řád na liště: provoz, zvedání mostu a lodě v pořadí, v jakém přijdou.
  const dej: { cas: number; text: string }[] = uroven.jizdniRad.map((polozka) => ({ cas: polozka.cas, text: zapisJizdy(polozka) }));
  if (uroven.pohyb) {
    dej.push({ cas: uroven.pohyb.zvednout, text: t("rad.zvednout", { cas: cislo(uroven.pohyb.zvednout, 0) }) });
    dej.push({ cas: uroven.pohyb.sklopit, text: t("rad.sklopit", { cas: cislo(uroven.pohyb.sklopit, 0) }) });
  }
  for (const lod of uroven.lode) dej.push({ cas: lod.cas, text: t("rad.lod", { cas: cislo(lod.cas, 0), vyska: cislo(lod.vyska, 0) }) });
  dej.sort((a, b) => a.cas - b.cas);
  udaj("jizdni-rad").replaceChildren(
    ...dej.map((polozka) => {
      const uzel = document.createElement("span");
      uzel.className = "osa__polozka";
      uzel.textContent = polozka.text;
      // V úzkém okně se položka nemusí vejít celá: plný text je i v bublině.
      uzel.title = polozka.text;
      return uzel;
    }),
  );
  // Když se řád nevejde, pravý okraj se ztrácí do pozadí: je vidět, že pokračuje a dá se posunout.
  const radNaListe = udaj("jizdni-rad");
  const obnovPreteceniRadu = (): void => {
    const zbyva = radNaListe.scrollWidth - radNaListe.clientWidth - radNaListe.scrollLeft;
    radNaListe.dataset.pretika = String(zbyva > 1);
  };
  new ResizeObserver(obnovPreteceniRadu).observe(radNaListe);
  radNaListe.addEventListener("scroll", obnovPreteceniRadu, { passive: true });
  // Dlouhý jízdní řád se posouvá do strany; běžná myš má jen svislé kolečko, tak posouvá i to.
  udaj("jizdni-rad").addEventListener(
    "wheel",
    (udalost) => {
      const rad = udalost.currentTarget as HTMLElement;
      if (rad.scrollWidth <= rad.clientWidth || udalost.deltaY === 0 || udalost.deltaX !== 0) return;
      rad.scrollLeft += udalost.deltaY;
      udalost.preventDefault();
    },
    { passive: false },
  );

  naplnZadani();
  oknoZadani.addEventListener("close", () => ukazka?.zastav());
  prepinacCisel.setAttribute("aria-pressed", String(cisla));
  obnovZvuk();
  obnovAnalyzu();
  document.body.dataset.rezim = rezim;
  document.body.dataset.zkouska = "";
  obnovMedaile();
  obnovStavbu();
  obnovOsu();
  ukazCelyVykres();
  // Zpětná vazba hráče: ke zprávě jde přiložit rozestavěný most. Upozornění na deník hraní
  // je i v okně se zadáním, protože hráč může přijít rovnou do úrovně.
  pripojVazbu(denik, {
    uroven: () => uroven.id,
    navrh: () => (editor.navrh.pruty.length > 0 ? navrhNaText(editor.navrh) : undefined),
  });
  pripojZaznam(denik);

  // Před stavbou si má hráč přečíst, co ho čeká; k rozestavěnému mostu se zadání nevnucuje.
  // Zadání se otevře samo, dokud v úrovni nic nestojí. V sandboxu jen napoprvé: po každé
  // změně údolí je výkres prázdný a zadání by se otevíralo pořád dokola.
  if (editor.navrh.pruty.length === 0 && !(sandbox && uloziste.sandboxNavstiven)) otevriZadani();
  if (sandbox) uloziste.sandboxNavstiven = true;

  // Dotaz na verzi fyziky zároveň ověří, že pracovní vlákno se simulací funguje.
  pomocny
    .zjistiVerziFyziky()
    .then((verze) => {
      udaj("fyzika").textContent = `v${verze}`;
    })
    .catch(() => {
      udaj("fyzika").textContent = t("pole.fyzikaNedostupna");
    });
  naplanujRozbor();
}
