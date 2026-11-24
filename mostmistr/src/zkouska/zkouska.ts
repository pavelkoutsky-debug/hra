// Zkouška mostu v úrovni: postaví most z návrhu, pustí po něm provoz podle jízdního řádu,
// zaznamená průběh a vyhodnotí, kdo přejel, co se porušilo a jaké medaile most získal.
// Nezávisí na prohlížeči; ve hře ji pohání pracovní vlákno, v testech Node.

import { cenaNavrhu } from "../data/cena";
import { PIST, ZAMEK } from "../data/katalog";
import { mezeryTras, type NavrhMostu } from "../data/navrh";
import type { Medaile } from "../data/ulozeni";
import type { Uroven } from "../data/uroven";
import { pridejSilyBremen, vytvorBremena, type Bremena, type PopisBremene } from "../jadro/bremena";
import { TIHOVE_ZRYCHLENI } from "../jadro/integrator";
import {
  MEZE_KOMFORTU,
  prodluzKlid,
  tridaKomfortu,
  vytvorMereniKomfortu,
  zkopirujMereniKomfortu,
  zmerKomfort,
  type KlidPoPoruseni,
  type MereniKomfortu,
} from "../jadro/komfort";
import { vytvorLoziska } from "../jadro/loziska";
import { najdiRovnovahu, vlastniTvarySoustavy } from "../jadro/matice";
import { najdiKlid } from "../jadro/ustaleni";
import { rozhodujiciVelicina, vnitrniSily, vyhodnotNamahani, ZPUSOB_TAH, ZPUSOB_TLAK, ZPUSOB_ZADNY } from "../jadro/namahani";
import { pistyVCili, posunPisty, vytvorPisty, type Pisty } from "../jadro/pisty";
import { NASLEDEK_ROZLOMENI } from "../jadro/poruseni";
import { Simulace, type Zatizeni } from "../jadro/simulace";
import { LANO, sestavSoustavu, type Soustava } from "../jadro/soustava";
import { volneStupne } from "../jadro/stupne";
import { pridejKontaktSTerenem, vytvorTeren, type Teren } from "../jadro/teren";
import { vytvorTrasu } from "../jadro/trasa";
import {
  odemkniZamky,
  posunZamky,
  pridavnaFrekvenceZamku,
  pridejSilyZamku,
  vytvorZamky,
  mezeraZamku,
  zamkniZamky,
  zamkyZamcene,
  type Zamky,
} from "../jadro/zamky";
import { otiskSimulace } from "./otisk";
import { jeClovek, naplanujProvoz, PREJEL, pridejOdporVody, Provoz, type PopisUcastnika } from "./provoz";
import { frekvenceBudice, jeStaly, vyhodnotBudic } from "./budic";
import { frekvenceVolnehoKmitani } from "./kmitani";
import type {
  BudicZkousky,
  KomfortZkousky,
  PruhybZkousky,
  ObalkaPrutu,
  PohybZkousky,
  ReakcePodpory,
  Udalost,
  VysledekZkousky,
  VysledekZlomu,
  ZlomZkousky,
} from "./protokol";
import { sestavMost } from "./stavba";
import { DOBEH_ZLOMU, NEJDELSI_DEJ_ZLOMU, NEJDELSI_ZLOM, ROZTEC_ZATEZE, zatizeniZlomu } from "./zlom";
import { plastickeKlouby, topologieSoustavy, type PopisKresleni, type Snimek, type Topologie } from "./zaznam";

/** Počet snímků záznamu na sekundu děje. */
export const SNIMKU_ZA_SEKUNDU = 60;
/** Jak dlouho děj pokračuje poté, co poslední účastník dojel nebo dopadl, v sekundách. */
const DOBEH = 1.5;
/**
 * Jak dlouho (s) se smí most bez klidové polohy dotýkat terénu, než se to počítá za opření:
 * volný prut, který o svah jen škrtne, mostem o zem opřeným není.
 */
const OPRENI_O_TEREN = 0.25;
/** Nejdéle tolik sekund se čeká, než ti, kdo spadli, dopadnou na zem nebo do vody. */
const NEJDELSI_PAD = 5;
/** Délka zkoušky bez provozu: most jen stojí pod vlastní tíhou. */
const TRVANI_BEZ_PROVOZU = 3;
/**
 * Jak dlouho se po brnknutí sleduje volné kmitání: tolik kmitů první vlastní frekvence mostu,
 * ale v těchto mezích (s). Lávka o 2 Hz má hotovo za čtyři sekundy; visutý most, který kmitá
 * třikrát za deset sekund, potřebuje čtyřikrát víc, aby se frekvence dala poznat.
 */
const KMITU_BRNKNUTI = 6;
const TRVANI_BRNKNUTI = [4, 16] as const;
/** Kolikrát za sekundu se zapisuje poloha brnknutého styčníku a v jakém pásmu se hledá jeho frekvence, Hz. */
const VZORKU_BRNKNUTI = 120;
const BRNKNUTI_OD = 0.3;
const BRNKNUTI_DO = 25;
/** Jak dlouho se most sleduje poté, co budič dojel na konec svého rozsahu, v sekundách. */
const DOBEH_BUDICE = 1;
/** Po jaké době se zapisuje další bod křivky změřené budičem, v sekundách. */
const KROK_MERENI_BUDICE = 0.1;
/**
 * Jak dlouho po porušení se kmitání pod lidmi nepočítá (s): ráz porušení není kmitání, na
 * které by se dal most navrhnout. Filtry měření mezitím běží dál.
 */
const KLID_PO_PORUSENI = 3;
/**
 * Kolik sekund ticha po porušeních zkouška dá nejvýš dohromady (tři oddělená porušení). Most,
 * kterému povoluje prut za prutem v rozestupech pod `KLID_PO_PORUSENI`, by jinak neměl kmitání
 * změřené vůbec a prošel by.
 */
const NEJDELSI_KLID_PO_PORUSENI = 9;
/** Po kolika krocích se aktualizuje obálka namáhání; shodně s posudkem v simulaci. */
const INTERVAL_OBALKY = 4;
/** Jak dlouho po povelu ke sklopení se nejdéle čeká, než zámky zapadnou, v sekundách. */
const NEJDELSI_SKLAPENI = 20;

/** Fáze pohyblivého mostu: před zvednutím, zvedá se nebo je zvednutý, sklápí se, zase zamčený. */
const POHYB_PRED = 0;
const POHYB_ZVEDANI = 1;
const POHYB_SKLAPENI = 2;
const POHYB_HOTOV = 3;

/** Stav lodi: ještě nepřiplula, pluje pod mostem, proplula, narazila. */
const LOD_CEKA = 0;
const LOD_PLUJE = 1;
const LOD_PROPLULA = 2;
const LOD_NARAZILA = 3;

/**
 * Prochází úsečka vnitřkem obdélníku? Stejné ořezání jako `useckaProtinaVnitrek` u pravidel
 * návrhu, jen bez objektů: volá se pro každý prvek mostu, dokud loď pluje.
 */
function useckaVProfilu(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
): boolean {
  let od = 0;
  let po = 1;
  const dx = bx - ax;
  const dy = by - ay;
  for (let hrana = 0; hrana < 4; hrana++) {
    const smer = hrana === 0 ? -dx : hrana === 1 ? dx : hrana === 2 ? -dy : dy;
    const vzdalenost = hrana === 0 ? ax - xMin : hrana === 1 ? xMax - ax : hrana === 2 ? ay - yMin : yMax - ay;
    if (smer === 0) {
      if (!(vzdalenost > 0)) return false;
      continue;
    }
    const t = vzdalenost / smer;
    if (smer < 0) {
      if (t > od) od = t;
    } else if (t < po) po = t;
    if (!(od < po)) return false;
  }
  return po - od > 1e-9;
}

/** Co zkouška vydala od minulého volání. */
export interface DavkaZkousky {
  snimky: Snimek[];
  /** Nové stavby konstrukce v pořadí, v jakém vznikly. */
  topologie: Topologie[];
  udalosti: Udalost[];
}

/** Lano napnuté ve výchozím stavu víc než tolikanásobkem své pevnosti se přetrhne už při napínání. */
const PRETRZENI_PRI_NAPINANI = 3;

export class Zkouska {
  readonly simulace: Simulace;
  readonly provoz: Provoz;
  /** Očekávaná délka děje v sekundách; skutečná může být kratší i delší. */
  readonly trvani: number;
  /** Most neměl pod vlastní tíhou klidovou polohu. */
  readonly bezRovnovahy: boolean;
  /** Největší svislá odchylka mostovky od výkresu v klidové poloze, m; null bez klidové polohy. */
  readonly pruvesVKlidu: number | null;

  readonly #uroven: Uroven;
  readonly #navrh: NavrhMostu;
  readonly #kresleni: PopisKresleni;
  readonly #obalka: ObalkaPrutu[];
  /** Obálka z doby, kdy byl most ještě celý; null, dokud se nic neporušilo. */
  #obalkaDoPoruseni: ObalkaPrutu[] | null = null;
  /**
   * Namáhání prutů v klidu pod vlastní tíhou, než zkouška začne. Využití v simulaci nabíhá
   * od nuly (vyhlazuje se), takže u mostu, který povolí v prvních milisekundách, by obálka do
   * porušení ukázala jen zlomek toho, co pruty opravdu nesly.
   */
  readonly #obalkaKlidu: ObalkaPrutu[];
  readonly #reakce: ReakcePodpory[];
  /** Měření kmitání mostovky; null v úrovni, kde přes most nejdou lidé. */
  /**
   * Průhyb mostovky proti výkresu v úrovni, která ho hlídá (`Uroven.nejvetsiPruhyb`): styčníky
   * mostovky (i skryté dělicí), jejich nakreslená výška a poloha x. Null v úrovni bez meze.
   */
  readonly #pruhybStycniky: Int32Array | null;
  readonly #pruhybVykres: Float64Array;
  readonly #pruhybX: Float64Array;
  /** Co se zatím změřilo: největší odchylka (m), kdy a kde, a čas prvního překročení meze (−1: nebylo). */
  readonly #pruhyb = { nejvetsi: 0, cas: 0, x: 0, prekroceno: -1 };
  readonly #komfort: MereniKomfortu | null;
  /**
   * Měření kmitání pod lidmi na mostě, který se porušil a stojí dál: pokračuje od prvního
   * porušení tam, kde `#komfort` skončil. Ráz samotného porušení se nepočítá (po každém je
   * `KLID_PO_PORUSENI` ticho, dohromady nejvýš `NEJDELSI_KLID_PO_PORUSENI`) a do výsledku jde,
   * jen když z mostu nikdo nespadl.
   */
  #komfortPoPoruseni: MereniKomfortu | null = null;
  readonly #klidKomfortu: KlidPoPoruseni = { pocitatOd: 0, zbyva: NEJDELSI_KLID_PO_PORUSENI };
  #porusenoKomfortu = 0;
  /**
   * Měření zrychlení karoserie každého autobusu a skříně každého osobního vozu zvlášť:
   * číslo účastníka (v poli, aby se dalo předat bez nové alokace) a jeho měření.
   */
  readonly #komfortVozu: { kdo: number[]; mereni: MereniKomfortu }[];
  /** Kolika styčníky se most v posledním kroku dotýkal terénu a jak dlouho se o něj opíral celý, s. */
  #dotykuMostu = 0;
  #oprenoSekund = 0;
  #dalsiSnimek = 0;
  #topologii = 0;
  #poruseni = 0;
  #sjeti = 0;
  #udalostiProvozu = 0;
  #konec = Infinity;
  /** Kdy dojel nebo spadl poslední účastník provozu. */
  #vsichniOd = Infinity;
  #zacala = false;
  /** Délka zkoušky, po které most jen stojí, když po něm nic nejede. */
  readonly #bezProvozu: number;

  /** Písty a zámky pohyblivého mostu a kde je jeho zvedání. */
  readonly #pisty: Pisty;
  readonly #zamky: Zamky;
  #fazePohybu = POHYB_PRED;
  #zvednuto = false;
  #preklopeno = false;
  /** Pruty návrhu, které jsou mostovkou některé trasy. */
  #prutyMostovky: Set<number> = new Set();
  #casZamceni: number | null = null;
  #klidoveDosednuti = 0;
  readonly #pretizenePisty: Uint8Array;
  /** Pruty návrhu, které jsou písty, v pořadí pístů. */
  #prutyPistu: number[] = [];
  #nejvetsiSilaPistu = 0;
  /** Kosinus největšího otočení mostovky při zvedání a co dělaly písty při prvním nárazu lodi. */
  #kosinusOtoceni = 1;
  #pistyPriNarazu: PohybZkousky["pistyPriNarazu"] = null;
  /** Největší otočení každého prutu mostovky proti výkresu (kosinus), do prvního porušení a do překlopení. */
  #kosinusPrutu: Float64Array = new Float64Array(0);
  /** Prut, do kterého narazila první loď. */
  #narazenyPrut: number | null = null;
  /** Kdy se most poprvé porušil vzhledem ke zvedání (`PohybZkousky.poruseno`). */
  #porusenoPriPohybu: PohybZkousky["poruseno"] = null;
  /** Stav každé lodi úrovně. */
  readonly #lode: Uint8Array;

  /** Zkouška do zlomu: síly rovnoměrného zatížení na každé trase a co most unesl. */
  readonly #zlom: ZlomZkousky | null;
  readonly #zatez: { bremena: Bremena; roztec: number }[] = [];
  #delkaZateze = 0;
  #zlomCas: number | null = null;
  /**
   * Hodiny zátěže při zkoušce do zlomu, s. Běží s časem zkoušky, ale stojí, dokud se v mostě
   * otevírá plastický kloub nebo se táhne ocel po kluzu (přibývá plastická práce): tvárné
   * porušení potřebuje čas, a kdyby zátěž mezitím rostla dál, připsala by mostu únosnost,
   * kterou nemá (podle rychlosti zatěžování o 3 až 8 %).
   */
  #zlomHodiny = 0;
  #zlomPrace = 0;
  #zlomZatizeni = 0;
  #zlomPrut = -1;

  /** Styčník, kterým se brnklo, a okamžiky, kdy jeho svislá rychlost změnila znaménko. */
  readonly #brnknuty: number;
  /** Svislá poloha brnknutého styčníku v čase: z ní se čte, na jaké frekvenci most kmitá. */
  readonly #casyBrnknuti: number[] = [];
  readonly #polohyBrnknuti: number[] = [];
  #dalsiVzorekBrnknuti = 0;

  /**
   * `brnknuti` zkoušku změní v pokus s volným kmitáním: provoz se nepouští, daný styčník
   * návrhu se stáhne silou (N, kladná dolů) a pustí. `budic` ji změní v pokus s harmonickou
   * silou, která se plynule přelaďuje.
   */
  constructor(
    uroven: Uroven,
    navrh: NavrhMostu,
    nasada: number,
    brnknuti?: { stycnik: number; sila: number },
    budic?: BudicZkousky,
    zlom?: ZlomZkousky,
  ) {
    // Nárůst zátěže, se kterým by zkouška do zlomu nic nezatížila, je chyba volajícího; bez
    // odmítnutí by z ní vyšla zkouška bez provozu, která „projde“.
    if (zlom && !(zlom.narust > 0 && Number.isFinite(zlom.narust))) {
      throw new Error("Zkouška do zlomu potřebuje kladný nárůst zátěže.");
    }
    // Most se staví podle úrovně, jak je (mostovka pohyblivého mostu po metru, zámek jako čep):
    // pokus i zkouška do zlomu tak zkoušejí tentýž most jako běžná zkouška a rozbor.
    const urovenStavby = uroven;
    // Pokus není zkouška: most se při něm nezvedá a lodě neplují. Stejně tak zkouška do zlomu.
    if (brnknuti || budic || zlom) uroven = { ...uroven, jizdniRad: [], pohyb: null, lode: [] };
    this.#zlom = zlom ?? null;
    this.#uroven = uroven;
    this.#navrh = navrh;
    this.#brnknuty = brnknuti ? brnknuti.stycnik : -1;
    this.#budic = budic && budic.stycnik >= 0 && budic.stycnik < navrh.stycniky.length ? budic : null;
    const tiha = TIHOVE_ZRYCHLENI;
    const stavba = sestavMost(urovenStavby, navrh);
    const stycnikuMostu = stavba.popis.stycniky.length;
    const prvkuMostu = stavba.popis.prvky.length;
    const plan = naplanujProvoz(stavba.popis, uroven, nasada, tiha);
    // Pérování vozidel není prut návrhu.
    for (let e = prvkuMostu; e < stavba.popis.prvky.length; e++) stavba.popis.prvky[e]!.prut = -1;

    // Výchozí poloha je rovnováha pod vlastní tíhou. Most bez ztužení ji nemá: zkouší se
    // z nakreslené polohy a zřítí se před očima.
    let s = sestavSoustavu(stavba.popis);
    const stupneMostu = (soustava: Soustava): Int32Array =>
      volneStupne(soustava).filter((kod) => kod < 3 * stycnikuMostu);
    let stupne = stupneMostu(s);
    // Most s povolenými lany přímý výpočet nenajde; ten se ustálí časovou simulací.
    this.bezRovnovahy = !najdiKlid(s, stupne, tiha);
    this.pruvesVKlidu = null;
    if (!this.bezRovnovahy) {
      const mostovka = new Set(stavba.trasy.flatMap((t) => t.pruty));
      let nejvic = 0;
      for (let e = 0; e < s.pocetPrvku; e++) {
        if (!mostovka.has(s.prut[e]!)) continue;
        for (const i of [s.prvekA[e]!, s.prvekB[e]!]) {
          const nakresleny = stavba.popis.stycniky[i];
          if (nakresleny) nejvic = Math.max(nejvic, Math.abs(s.y[i]! - nakresleny.y));
        }
      }
      this.pruvesVKlidu = nejvic;
    }
    // Brnknutí se sleduje tak dlouho, aby most stihl několikrát zakmitat svou nejnižší frekvencí.
    let trvaniBrnknuti: number = TRVANI_BRNKNUTI[0];
    if (brnknuti && !this.bezRovnovahy && stupne.length > 0) {
      const prvni = vlastniTvarySoustavy(s, stupne, 1)?.omega[0];
      if (prvni !== undefined && prvni > 0) {
        trvaniBrnknuti = Math.min(TRVANI_BRNKNUTI[1], Math.max(TRVANI_BRNKNUTI[0], (KMITU_BRNKNUTI * 2 * Math.PI) / prvni));
      }
    }
    if (this.bezRovnovahy) {
      s = sestavSoustavu(stavba.popis);
      stupne = stupneMostu(s);
    } else if (brnknuti && brnknuti.stycnik >= 0 && brnknuti.stycnik < stavba.stycnikuNavrhu) {
      // Výchozí poloha brnknutí: rovnováha se silou ve styčníku; síla pak zmizí a most kmitá.
      const vnejsi = new Float64Array(stupne.length);
      const svisly = stupne.indexOf(3 * brnknuti.stycnik + 1);
      if (svisly >= 0) {
        vnejsi[svisly] = -brnknuti.sila;
        if (najdiRovnovahu(s, stupne, vnejsi, tiha) < 0) {
          // Síla, kterou most neunese ani staticky: zkusí se bez ní.
          // (Stejnou cestou jako poprvé: most s povolenými lany přímý výpočet nenajde.)
          s = sestavSoustavu(stavba.popis);
          stupne = stupneMostu(s);
          najdiKlid(s, stupne, tiha);
        }
      }
    }

    const trasy = uroven.trasy.map((trasa, i) =>
      vytvorTrasu(s, stavba.trasy[i]?.pruty ?? [], {
        xLevy: trasa.zacatek.x,
        yLevy: trasa.zacatek.y,
        xPravy: trasa.konec.x,
        yPravy: trasa.konec.y,
      }),
    );
    const teren = vytvorTeren(uroven.teren);
    this.provoz = new Provoz(s, plan, trasy, uroven, teren);
    if (this.#zlom) {
      // Rovnoměrné zatížení jako řada stejných sil po celé délce každé trasy.
      for (const trasa of trasy) {
        const delka = trasa.xPravy - trasa.xLevy;
        const pocet = Math.max(1, Math.round(delka / ROZTEC_ZATEZE));
        const roztec = delka / pocet;
        const popisy: PopisBremene[] = [];
        for (let k = 0; k < pocet; k++) popisy.push({ x: trasa.xLevy + (k + 0.5) * roztec, rychlost: 0, tiha: 0 });
        this.#zatez.push({ bremena: vytvorBremena(trasa, popisy), roztec });
        this.#delkaZateze += delka;
      }
    }

    // Píst se kreslí zasunutý: jeho klidová délka je nakreslená délka a zdvih se k ní přičte.
    this.#pisty = vytvorPisty(
      stavba.pisty.map((p) => ({
        prvek: p.prvek,
        zasunuty: s.klidovaDelka[p.prvek]!,
        vysunuty: s.klidovaDelka[p.prvek]! + p.zdvih,
      })),
      PIST.rychlost,
      PIST.zrychleni,
      PIST.nejvetsiSila,
    );
    this.#pretizenePisty = new Uint8Array(stavba.pisty.length);
    this.#zamky = vytvorZamky(s, stavba.zamky, ZAMEK.tuhost, ZAMEK.utlum, ZAMEK.tuhostCepu);
    this.#lode = new Uint8Array(uroven.lode.length);

    const utlumPrvku = new Float64Array(s.pocetPrvku);
    utlumPrvku.set(stavba.utlumPrvku);
    let utlum = 0.01;
    if (stavba.utlumPrvku.length > 0) {
      utlum = 0;
      for (const u of stavba.utlumPrvku) utlum += u / stavba.utlumPrvku.length;
    }
    this.simulace = new Simulace(s, {
      tiha,
      utlum,
      utlumPrvku,
      tlumeneStupne: stupne,
      zatizeni: this.#zatizeni(teren, stycnikuMostu),
      loziska: vytvorLoziska(s, 0, stycnikuMostu),
    });

    this.trasyMostovky = stavba.trasy.flatMap((t) => t.pruty);
    this.#prutyMostovky = new Set(this.trasyMostovky);
    this.#kosinusPrutu = new Float64Array(navrh.pruty.length).fill(1);
    // Průhyb se měří ve všech styčnících mostovky včetně skrytých dělicích, proti výšce, ve které
    // jsou nakreslené (skryté leží na spojnici konců prutu).
    {
      const stycniky: number[] = [];
      if (uroven.nejvetsiPruhyb !== null) {
        const videne = new Set<number>();
        for (let e = 0; e < s.pocetPrvku; e++) {
          if (!this.#prutyMostovky.has(s.prut[e]!)) continue;
          for (const i of [s.prvekA[e]!, s.prvekB[e]!]) {
            if (videne.has(i) || !stavba.popis.stycniky[i]) continue;
            videne.add(i);
            stycniky.push(i);
          }
        }
      }
      this.#pruhybStycniky = uroven.nejvetsiPruhyb !== null ? Int32Array.from(stycniky) : null;
      this.#pruhybVykres = Float64Array.from(stycniky, (i) => stavba.popis.stycniky[i]!.y);
      this.#pruhybX = Float64Array.from(stycniky, (i) => stavba.popis.stycniky[i]!.x);
    }
    // Komfort se měří ve všech styčnících mostovky včetně skrytých dělicích. Budič používá
    // totéž měření: zajímá ho, jak moc se mostovka rozkmitá.
    if (this.#budic || uroven.jizdniRad.some((p) => jeClovek(p.druh))) {
      const mostovka = new Set(this.trasyMostovky);
      const stycniky = new Set<number>();
      for (let e = 0; e < s.pocetPrvku; e++) {
        if (!mostovka.has(s.prut[e]!)) continue;
        stycniky.add(s.prvekA[e]!);
        stycniky.add(s.prvekB[e]!);
      }
      // Mez úrovně: od jejího překročení už most pro lidi neobstojí.
      this.#komfort = vytvorMereniKomfortu(s, stycniky, MEZE_KOMFORTU[uroven.nejhorsiKomfort - 1]);
    } else {
      this.#komfort = null;
    }
    // Pohodlí cestujících se měří na karoseriích autobusů a na skříních osobních vozů, u každého
    // vozidla jen po dobu, kdy samo jede po mostě: vůz, který ještě drkotá po stycích před
    // mostem, o mostě nic neříká.
    this.#komfortVozu = [];
    this.ucastnici.forEach((u, k) => {
      if ((u.druh !== "autobus" && u.druh !== "vuz-osobni") || u.karoserie.length === 0) return;
      this.#komfortVozu.push({ kdo: [k], mereni: vytvorMereniKomfortu(s, u.karoserie) });
    });
    const skryte: number[] = [];
    for (let i = stycnikuMostu; i < s.pocetStycniku; i++) skryte.push(i);
    const zavazi: number[] = [];
    navrh.stycniky.forEach((st, i) => {
      if (st.zavazi) zavazi.push(i);
    });
    // Závaží laděných tlumičů se kreslí stejně; vodorovně je drží vedení, dokud most stojí.
    this.#zavaziTlumicu = stavba.tlumice.map((t) => t.zavazi);
    zavazi.push(...this.#zavaziTlumicu);
    this.#prutyPistu = stavba.pisty.map((p) => p.prut);
    this.#kresleni = { mostovka: this.trasyMostovky, skryte, zavazi, pisty: this.#prutyPistu };
    this.#obalka = navrh.pruty.map(() => ({ vyuziti: 0, zpusob: ZPUSOB_ZADNY, cas: 0, osova: 0, moment: 0, velicina: 0, unosnost: 0 }));
    this.#obalkaKlidu = this.#namahaniVKlidu(tiha);
    this.#reakce = [];
    for (let i = 0; i < stavba.stycnikuNavrhu; i++) {
      if ((s.podpora[i]! & 3) !== 0) this.#reakce.push({ stycnik: i, svisla: 0, nadzvednuti: 0, vodorovna: 0 });
    }
    const bezProvozu = this.#zlom
      ? NEJDELSI_ZLOM
      : this.#budic
        ? this.#budic.trvani + DOBEH_BUDICE
        : brnknuti
          ? trvaniBrnknuti
          : TRVANI_BEZ_PROVOZU;
    this.#bezProvozu = bezProvozu;
    let trvani = plan.ucastnici.length > 0 ? plan.konec + DOBEH : bezProvozu;
    if (uroven.pohyb) {
      let zdvih = 0;
      for (const p of stavba.pisty) zdvih = Math.max(zdvih, Math.abs(p.zdvih));
      const sklapeni = zdvih / PIST.rychlost + PIST.rychlost / PIST.zrychleni + 1;
      trvani = Math.max(trvani, uroven.pohyb.sklopit + sklapeni + DOBEH);
    }
    for (const lod of uroven.lode) trvani = Math.max(trvani, lod.cas + lod.trvani + DOBEH);
    this.trvani = trvani;
    if (plan.ucastnici.length === 0 && !uroven.pohyb && uroven.lode.length === 0) this.#konec = bezProvozu;
    // Zkoušku do zlomu ukončují hodiny zátěže (viz pokracuj), ne čas děje: ten má jen pojistku.
    if (this.#zlom) this.#konec = NEJDELSI_DEJ_ZLOMU;
    // Most bez klidové polohy neunesl nic; trosky stačí nechat dopadnout, zatěžovat je nemá smysl.
    if (this.#zlom && this.bezRovnovahy) this.#konec = DOBEH_ZLOMU;
    // Až nakonec: přetržení mění stavbu a ohlašuje to všemu, co se výše připravilo.
    this.#pretrhniPretazenaLana(s);
  }

  /**
   * Lano, které by ve výchozím stavu neslo několikanásobek své pevnosti (napínák dotažený
   * do krajnosti), se přetrhlo už při napínání: zkouška začíná bez něj a přetržení je
   * první událostí v čase nula. Díly lana se přitom povolí; jinak by přetržení vymrštilo
   * zbytek mostu energií, jakou skutečné lano nikdy nepojme, a výpočet by se rozpadl.
   */
  #pretrhniPretazenaLana(s: Soustava): void {
    const dily = new Map<number, number[]>();
    for (let e = 0; e < s.pocetPrvku; e++) {
      const prut = s.prut[e]!;
      if (s.druh[e] !== LANO || prut < 0) continue;
      const prvky = dily.get(prut);
      if (prvky) prvky.push(e);
      else dily.set(prut, [e]);
    }
    const delkaPrvku = (e: number): number => {
      const dx = s.x[s.prvekB[e]!]! - s.x[s.prvekA[e]!]!;
      const dy = s.y[s.prvekB[e]!]! - s.y[s.prvekA[e]!]!;
      return Math.sqrt(dx * dx + dy * dy);
    };
    let pretrzeno = false;
    for (const [prut, prvky] of dily) {
      let tah = 0;
      for (const e of prvky) {
        tah += Math.max(0, s.tuhostOsova[e]! * (delkaPrvku(e) - s.klidovaDelka[e]! - s.plastDelka[e]!)) / prvky.length;
      }
      const unosnost = s.unosnostTah[prvky[0]!]!;
      if (!(tah > PRETRZENI_PRI_NAPINANI * unosnost)) continue;
      for (const e of prvky) {
        const delka = delkaPrvku(e);
        if (!(delka > 0)) continue;
        s.klidovaDelka[e] = delka;
        s.plastDelka[e] = 0;
        s.tuhostOsova[e] = s.EA[e]! / delka;
      }
      this.simulace.pretrhni(
        { prvek: prvky[prvky.length >> 1]!, prut, zpusob: ZPUSOB_TAH, misto: 2, nasledek: NASLEDEK_ROZLOMENI, mira: tah / unosnost },
        tah,
        unosnost,
      );
      pretrzeno = true;
    }
    if (pretrzeno) this.simulace.poZmeneStavby();
  }

  /** Pořadí prutů návrhu, které tvoří mostovku tras. */
  readonly trasyMostovky: number[];

  get ucastnici(): readonly PopisUcastnika[] {
    return this.provoz.ucastnici;
  }

  get hotovo(): boolean {
    return this.simulace.cas >= this.#konec || this.simulace.rozpadla;
  }

  /** Okamžité kmitání mostovky pro snímek záznamu; po porušení až po odeznění jeho rázu. */
  #okamziteKmitani(): number {
    if (!this.#komfort) return 0;
    if (!this.simulace.porusena) return this.#komfort.okamzite;
    const po = this.#komfortPoPoruseni;
    return po !== null && this.simulace.cas >= this.#klidKomfortu.pocitatOd ? po.okamzite : 0;
  }

  /**
   * Překročilo už kmitání pod lidmi mez úrovně? Od té chvíle most zkouškou neprojde, ať se
   * stane cokoli; kdo zkouší mnoho mostů za sebou, nemusí zbytek počítat. Kmitání prázdného
   * mostu (po autě, když lidé odešli) se do meze nepočítá, stejně jako ve výsledku.
   */
  /**
   * Změří, o kolik se mostovka právě liší od výkresu. Do simulace nevstupuje (otisk nemění);
   * měří se v každém kroku, aby výsledek nezávisel na tom, po jak dlouhých dávkách se zkouška krokuje.
   */
  #zmerPruhyb(s: Soustava, cas: number): void {
    const stycniky = this.#pruhybStycniky!;
    const vykres = this.#pruhybVykres;
    let nejvic = 0;
    let kde = -1;
    for (let k = 0; k < stycniky.length; k++) {
      const rozdil = s.y[stycniky[k]!]! - vykres[k]!;
      const odchylka = rozdil < 0 ? -rozdil : rozdil;
      if (odchylka > nejvic) {
        nejvic = odchylka;
        kde = k;
      }
    }
    const p = this.#pruhyb;
    if (kde >= 0 && nejvic > p.nejvetsi) {
      p.nejvetsi = nejvic;
      p.cas = cas;
      p.x = this.#pruhybX[kde]!;
    }
    if (p.prekroceno < 0 && nejvic > (this.#uroven.nejvetsiPruhyb ?? Infinity)) p.prekroceno = cas;
  }

  /** Překročila už mostovka při zkoušce největší průhyb, který úroveň dovoluje? */
  get pruhybNadMezi(): boolean {
    return this.#pruhybStycniky !== null && this.#pruhyb.prekroceno >= 0 && this.#brnknuty < 0 && this.#budic === null && this.#zlom === null;
  }

  get kmitaniNadMezi(): boolean {
    if (this.#budic !== null || this.#komfort === null) return false;
    // Po porušení platí totéž: kdo spadne, neprojde, a když nikdo nespadne, počítá se kmitání.
    return this.#komfort.prekroceni >= 0 || (this.#komfortPoPoruseni !== null && this.#komfortPoPoruseni.prekroceni >= 0);
  }

  /** Provoz a po prvním porušení i dopad trosek mostu na terén a do vody. */
  #zatizeni(teren: Teren, stycnikuMostu: number): Zatizeni {
    const provoz = this.provoz;
    const hladina = this.#uroven.hladina;
    return {
      pridejSily: (s, cas) => {
        provoz.pridejSily(s);
        if (this.#zamky.pocet > 0) pridejSilyZamku(s, this.#zamky);
        // Budič: svislá síla ve styčníku, dokud nedojede na konec svého rozsahu.
        const budic = this.#budic;
        if (budic && cas <= budic.trvani) s.fy[budic.stycnik] = s.fy[budic.stycnik]! - budic.sila * this.#fazeBudice[1];
        if (this.#zlom && !this.bezRovnovahy) {
          // Po prvním porušení zátěž už neroste: zůstává ležet, kde byla.
          const q = this.#zlomCas === null ? zatizeniZlomu(this.#zlom, this.#zlomHodiny) : this.#zlomZatizeni;
          for (const z of this.#zatez) {
            const sila = q * z.roztec;
            const { bremena } = z;
            for (let i = 0; i < bremena.pocet; i++) bremena.tiha[i] = sila;
            pridejSilyBremen(s, bremena);
          }
        }
        if (this.simulace?.porusena || this.bezRovnovahy) {
          // Styčníky vzniklé rozlomením prutů jsou až za styčníky provozu.
          this.#dotykuMostu = pridejKontaktSTerenem(s, teren, 0, stycnikuMostu);
          pridejKontaktSTerenem(s, teren, this.#prvniTroska, s.pocetStycniku);
          if (hladina !== null) {
            pridejOdporVody(s, hladina, 0, stycnikuMostu);
            pridejOdporVody(s, hladina, this.#prvniTroska, s.pocetStycniku);
          }
        }
        void cas;
      },
      posun: (s, cas, dt) => {
        // Most bez klidové polohy, který se celý (nic na něm nepovolilo) opírá o terén.
        if (this.#dotykuMostu > 0 && this.bezRovnovahy && !this.simulace?.porusena) this.#oprenoSekund += dt;
        this.#dotykuMostu = 0;
        provoz.posun(s, cas);
        this.#posunBudic(cas);
        const pisty = this.#pisty;
        if (pisty.pocet > 0) {
          posunPisty(s, pisty, dt);
          for (let i = 0; i < pisty.pocet; i++) {
            if (pisty.pretizen[i] !== 1) continue;
            this.#pretizenePisty[i] = 1;
            // Zkouška do zlomu: píst, který pod zátěží povolil, most neunesl.
            this.#zlomeno(cas, this.#prutyPistu[i] ?? -1);
          }
        }
        posunZamky(this.#zamky, dt);
      },
      poZmene: (s) => {
        provoz.poZmene(s);
        this.#uvolniZavaziTlumicu(s);
      },
      zmenaKroku: (dt) => {
        this.#krokBudice = dt;
        provoz.zmenaKroku(dt);
      },
      pridavnaFrekvence: (s) => provoz.pridavnaFrekvence(s) + pridavnaFrekvenceZamku(s, this.#zamky),
    };
  }

  /**
   * Řídí zvedání a sklápění: v čase `zvednout` odemkne zámky a pustí písty, v čase `sklopit`
   * je vrátí a po dojetí zkouší zámky zamknout. Vrací, zda se změnila stavba soustavy.
   */
  #ridPohyb(udalosti: Udalost[]): boolean {
    const pohyb = this.#uroven.pohyb;
    if (!pohyb || this.#fazePohybu === POHYB_HOTOV) return false;
    const sim = this.simulace;
    const s = sim.soustava;
    const cas = sim.cas;
    const pisty = this.#pisty;
    const zamky = this.#zamky;
    let zmena = false;
    if (this.#fazePohybu === POHYB_PRED && cas >= pohyb.zvednout) {
      this.#fazePohybu = POHYB_ZVEDANI;
      // Klidová síla dosednutí: co konec mostu tlačil na opěru se zámkem těsně před odemknutím.
      // (Síla, která na zadržený posun styčníku zbývá, je reakce podpory.)
      for (let k = 0; k < zamky.pocet; k++) {
        const i = zamky.stycnik[k]!;
        if (zamky.pruty[k]!.length > 0 || (s.podpora[i]! & 2) === 0) continue;
        const reakce = -s.fy[i]!;
        if (reakce > this.#klidoveDosednuti) this.#klidoveDosednuti = reakce;
      }
      zmena = odemkniZamky(s, zamky) > 0;
      zamky.nejvetsiSila.fill(0);
      pisty.vysunout = true;
      udalosti.push({ cas, druh: "pohyb", faze: "odemceno" });
    }
    if (this.#fazePohybu === POHYB_ZVEDANI) {
      if (!this.#zvednuto && pistyVCili(s, pisty)) {
        this.#zvednuto = true;
        udalosti.push({ cas, druh: "pohyb", faze: "zvednuto" });
      }
      if (cas >= pohyb.sklopit) {
        this.#fazePohybu = POHYB_SKLAPENI;
        pisty.vysunout = false;
        // Od teď se měří ráz při dosednutí; co plocha přenesla při odlehnutí, se nepočítá.
        zamky.nejvetsiSila.fill(0);
        udalosti.push({ cas, druh: "pohyb", faze: "sklapeni" });
      }
    }
    if (this.#fazePohybu === POHYB_SKLAPENI && sim.kroku % INTERVAL_OBALKY === 0 && pistyVCili(s, pisty)) {
      if (zamkniZamky(s, zamky) > 0) zmena = true;
      if (zamkyZamcene(zamky)) {
        this.#fazePohybu = POHYB_HOTOV;
        this.#casZamceni = cas;
        udalosti.push({ cas, druh: "pohyb", faze: "zamceno" });
      }
    }
    if (zmena) sim.poZmeneStavby();
    return zmena;
  }

  /**
   * Zapamatuje si, kdy se most poprvé porušil vzhledem ke zvedání. Co zkouška o zvedání
   * a zamknutí změří potom, je následek porušení: o zvednutí je rozhodnuto, jakmile loď
   * narazila nebo se most začal sklápět. Volá se před sledováním lodí.
   */
  #sledujPoruseniPohybu(): void {
    if (this.#porusenoPriPohybu !== null || this.#fazePohybu === POHYB_HOTOV || !this.simulace.porusena) return;
    this.#porusenoPriPohybu = this.#fazePohybu === POHYB_SKLAPENI || this.#narazenyPrut !== null ? "zamykani" : "zvedani";
  }

  /**
   * Hlídá, jestli píst mostovku nepřetlačil přes svislici: prvek mostovky otočený proti
   * výkresu o víc než čtvrt kruhu znamená překlopené křídlo. Trosky po porušení se nepočítají.
   */
  #sledujPreklopeni(udalosti: Udalost[]): void {
    if (this.#preklopeno || this.#fazePohybu === POHYB_PRED || this.simulace.porusena) return;
    const s = this.simulace.soustava;
    const mostovka = this.#prutyMostovky;
    const kosinusy = this.#kosinusPrutu;
    for (let e = 0; e < s.pocetPrvku; e++) {
      const prut = s.prut[e]!;
      if (prut < 0 || !mostovka.has(prut)) continue;
      const a = s.prvekA[e]!;
      const b = s.prvekB[e]!;
      const dx = s.x[b]! - s.x[a]!;
      const dy = s.y[b]! - s.y[a]!;
      const prumet = dx * s.osaX0[e]! + dy * s.osaY0[e]!;
      // Jak vysoko se křídlo dostalo: nejmenší kosinus úhlu mezi dílem mostovky a jeho výkresem,
      // u každého prutu zvlášť (dvě křídla se nezvedají stejně) a za celý most.
      if (prumet > 0) {
        const delka2 = dx * dx + dy * dy;
        const dosud = kosinusy[prut]!;
        if (prumet * prumet < dosud * dosud * delka2) {
          const kosinus = prumet / Math.sqrt(delka2);
          kosinusy[prut] = kosinus;
          if (kosinus < this.#kosinusOtoceni) this.#kosinusOtoceni = kosinus;
        }
        continue;
      }
      kosinusy[prut] = 0;
      this.#kosinusOtoceni = 0;
      this.#preklopeno = true;
      udalosti.push({ cas: this.simulace.cas, druh: "pohyb", faze: "preklopeno" });
      return;
    }
  }

  /**
   * Proč zámky po sklopení nezapadly: stav odemčeného zámku, jehož konce jsou na konci zkoušky
   * od sebe nejdál. Zámek zapadne, když písty dojely zpátky, konce jsou u sebe blíž než
   * `VULE_ZAMKU` a skoro se vůči sobě nehýbou; tohle říká, na čem z toho to vázne.
   */
  #procNezamceno(): NonNullable<PohybZkousky["nezamceno"]> | null {
    const s = this.simulace.soustava;
    const mezera = mezeraZamku(s, this.#zamky);
    if (mezera === null) return null;
    return { pistyVCili: pistyVCili(s, this.#pisty), vodorovne: mezera.vodorovne, svisle: mezera.svisle, rychlost: mezera.rychlost };
  }

  /** Největší síla, kterou dosedací plochy zámků na opěrách od posledního vynulování přenesly, N. */
  #silaDosednuti(): number {
    const zamky = this.#zamky;
    let nejvic = 0;
    for (let k = 0; k < zamky.pocet; k++) {
      if (zamky.pruty[k]!.length === 0 && zamky.nejvetsiSila[k]! > nejvic) nejvic = zamky.nejvetsiSila[k]!;
    }
    return nejvic;
  }

  /**
   * Lodě: dokud loď pluje pod mostem, nesmí do jejího plavebního profilu zasahovat žádný
   * prut mostu. Loď pluje kolmo k výkresu a nic neváží; náraz most nepoškodí, ale zkouška
   * jím neprojde.
   */
  #sledujLode(udalosti: Udalost[]): void {
    const lode = this.#uroven.lode;
    const hladina = this.#uroven.hladina;
    if (lode.length === 0 || hladina === null) return;
    const s = this.simulace.soustava;
    const cas = this.simulace.cas;
    for (let k = 0; k < lode.length; k++) {
      const lod = lode[k]!;
      if (this.#lode[k]! >= LOD_PROPLULA || cas < lod.cas) continue;
      if (cas > lod.cas + lod.trvani) {
        this.#lode[k] = LOD_PROPLULA;
        udalosti.push({ cas, druh: "lod", lod: k, stav: "proplula" });
        continue;
      }
      this.#lode[k] = LOD_PLUJE;
      for (let e = 0; e < s.pocetPrvku; e++) {
        const prut = s.prut[e]!;
        if (prut < 0) continue;
        const a = s.prvekA[e]!;
        const b = s.prvekB[e]!;
        if (!useckaVProfilu(s.x[a]!, s.y[a]!, s.x[b]!, s.y[b]!, lod.xMin, lod.xMax, hladina, hladina + lod.vyska)) continue;
        this.#lode[k] = LOD_NARAZILA;
        udalosti.push({ cas, druh: "lod", lod: k, stav: "narazila", prut });
        if (this.#narazenyPrut === null) this.#narazenyPrut = prut;
        // Proč tam prut byl: křídlo ještě stoupalo, stálo na konci zdvihu, nebo už zase kleslo.
        if (this.#pistyPriNarazu === null && this.#fazePohybu === POHYB_ZVEDANI) {
          this.#pistyPriNarazu = !this.#zvednuto ? "zveda" : pistyVCili(s, this.#pisty) ? "drzi" : "klesl";
        }
        break;
      }
    }
  }

  /** Zvedání mostu i plavba lodí skončily (nebo už není na co čekat)? */
  #dejHotov(cas: number): boolean {
    const pohyb = this.#uroven.pohyb;
    if (pohyb && this.#fazePohybu !== POHYB_HOTOV && cas < pohyb.sklopit + NEJDELSI_SKLAPENI) return false;
    for (const lod of this.#uroven.lode) if (cas <= lod.cas + lod.trvani) return false;
    return true;
  }

  /**
   * Po prvním porušení mostu přestane vedení držet závaží laděných tlumičů ve svislici:
   * padají s troskami jako volná tělesa.
   */
  #uvolniZavaziTlumicu(s: Soustava): void {
    if (this.#zavaziUvolnena || this.#zavaziTlumicu.length === 0 || !this.simulace?.porusena) return;
    this.#zavaziUvolnena = true;
    for (const i of this.#zavaziTlumicu) {
      s.podpora[i] = s.podpora[i]! & ~1;
      s.invHmotaX[i] = 1 / s.hmota[i]!;
    }
  }

  readonly #zavaziTlumicu: number[];
  #zavaziUvolnena = false;

  readonly #budic: BudicZkousky | null;
  /** Fáze síly budiče jako jednotkový vektor (cos, sin) a krok výpočtu, o který se posouvá. */
  readonly #fazeBudice: [number, number] = [1, 0];
  #krokBudice = 0;
  /** Křivka změřená budičem: frekvence buzení a zrychlení mostovky na 1 kN síly. */
  readonly #krivkaBudice: { f: number; a: number }[] = [];
  #dalsiMereniBudice = 0;

  /** Frekvence budiče v čase `cas`, Hz. */
  #frekvenceBudice(cas: number): number {
    return frekvenceBudice(this.#budic!, cas);
  }

  /**
   * Otočí fázi budiče o jeden krok výpočtu. Frekvence se mění, proto se úhel otočení počítá
   * v každém kroku znovu; stejně jako u kroků lidí bez goniometrie (tangenta polovičního
   * úhlu z mocninné řady), aby výsledek vyšel všude stejně.
   */
  #posunBudic(cas: number): void {
    if (!this.#budic) return;
    const pul = Math.PI * this.#frekvenceBudice(cas) * this.#krokBudice;
    const p2 = pul * pul;
    const t = pul * (1 + p2 * (1 / 3 + p2 * (2 / 15 + (p2 * 17) / 315)));
    const jmenovatel = 1 / (1 + t * t);
    const krokCos = (1 - t * t) * jmenovatel;
    const krokSin = 2 * t * jmenovatel;
    const [c, sn] = this.#fazeBudice;
    this.#fazeBudice[0] = c * krokCos - sn * krokSin;
    this.#fazeBudice[1] = sn * krokCos + c * krokSin;
  }

  /** Index prvního styčníku, který vznikl až porušením (za mostem a provozem). */
  get #prvniTroska(): number {
    return this.#pocatecnichStycniku;
  }

  #pocatecnichStycniku = Infinity;

  /**
   * Posune děj nejvýš o `sekundDeje` a vrátí, co přibylo do záznamu.
   * První volání vydá i výchozí stavbu a snímek výchozího stavu.
   */
  pokracuj(sekundDeje: number): DavkaZkousky {
    const sim = this.simulace;
    const s = sim.soustava;
    const davka: DavkaZkousky = { snimky: [], topologie: [], udalosti: [] };
    if (!this.#zacala) {
      this.#zacala = true;
      this.#pocatecnichStycniku = s.pocetStycniku;
      davka.topologie.push(this.#novaTopologie());
      davka.snimky.push(this.#snimek());
      this.#dalsiSnimek = 1 / SNIMKU_ZA_SEKUNDU;
    }
    const do_ = sim.cas + sekundDeje;
    while (sim.cas < do_ && !this.hotovo) {
      sim.krok();
      if (this.#zlom && this.#zlomCas === null) {
        // Zátěž přibývá, jen když se most v tomhle kroku trvale nepřetvořil.
        if (!(s.plastickaPrace > this.#zlomPrace)) this.#zlomHodiny += sim.dt;
        this.#zlomPrace = s.plastickaPrace;
        // Zátěž dorostla na největší, kterou zkouška umí naložit: most vydržel.
        if (this.#zlomHodiny >= NEJDELSI_ZLOM) this.#konec = sim.cas;
      }
      let novaStavba = this.#ridPohyb(davka.udalosti);
      if (sim.kroku % INTERVAL_OBALKY === 0) {
        this.#aktualizujObalku();
        if (this.#uroven.pohyb) this.#sledujPoruseniPohybu();
        this.#sledujLode(davka.udalosti);
        if (this.#uroven.pohyb) this.#sledujPreklopeni(davka.udalosti);
      }
      if (this.#brnknuty >= 0 && sim.cas >= this.#dalsiVzorekBrnknuti) {
        this.#casyBrnknuti.push(sim.cas);
        this.#polohyBrnknuti.push(s.y[this.#brnknuty]!);
        this.#dalsiVzorekBrnknuti += 1 / VZORKU_BRNKNUTI;
      }
      if (this.#pruhybStycniky) this.#zmerPruhyb(s, sim.cas);
      if (this.#komfort && !sim.porusena) {
        zmerKomfort(s, this.#komfort, sim.dt, sim.cas, this.#budic !== null || this.provoz.lideNaMoste(s));
        const budic = this.#budic;
        if (budic && sim.cas >= this.#dalsiMereniBudice && sim.cas <= budic.trvani) {
          this.#dalsiMereniBudice += KROK_MERENI_BUDICE;
          this.#krivkaBudice.push({ f: this.#frekvenceBudice(sim.cas), a: (1000 * this.#komfort.okamzite) / budic.sila });
        }
      } else if (this.#komfort && this.#budic === null) {
        // Most se porušil. Když se zřítí, o pohodlí chodců už kmitání nevypovídá (výsledek ho pak
        // nepočítá); když stojí dál a lidé po něm jdou, měří se dál. Ráz porušení se nepočítá.
        this.#komfortPoPoruseni ??= zkopirujMereniKomfortu(this.#komfort);
        const poruseno = sim.udalosti.length + sim.sjeti.length;
        if (poruseno !== this.#porusenoKomfortu) {
          this.#porusenoKomfortu = poruseno;
          prodluzKlid(this.#klidKomfortu, sim.cas, KLID_PO_PORUSENI);
        }
        zmerKomfort(s, this.#komfortPoPoruseni, sim.dt, sim.cas, sim.cas >= this.#klidKomfortu.pocitatOd && this.provoz.lideNaMoste(s));
      }

      // Cestující hodnotí jízdu po mostě, ne po silnici před ním; po zřícení už nehodnotí nic.
      if (!sim.porusena) {
        for (const vuz of this.#komfortVozu) {
          zmerKomfort(s, vuz.mereni, sim.dt, sim.cas, this.provoz.nekdoNaMoste(s, vuz.kdo));
        }
      }

      // Průjezdy a pády.
      const provozni = this.provoz.udalosti;
      for (; this.#udalostiProvozu < provozni.length; this.#udalostiProvozu++) {
        davka.udalosti.push(provozni[this.#udalostiProvozu]!);
      }
      if (this.#konec === Infinity && this.#dejHotov(sim.cas)) {
        if (this.provoz.ucastnici.length === 0) {
          this.#konec = Math.max(sim.cas + DOBEH, this.#bezProvozu);
        } else if (this.provoz.hotovo) {
          // Kdo spadl, má ještě dopadnout: děj nekončí s autem ve vzduchu.
          if (this.#vsichniOd === Infinity) this.#vsichniOd = sim.cas;
          if (this.provoz.spadliDopadli(s) || sim.cas >= this.#vsichniOd + NEJDELSI_PAD) this.#konec = sim.cas + DOBEH;
        }
      }

      if (sim.udalosti.length > this.#poruseni || sim.sjeti.length > this.#sjeti) {
        // Porušení nebo sjetí z podpory: zaznamenat a hned vydat snímek s novou stavbou,
        // aby se přehrávání nepokoušelo prokládat přes zlom.
        for (; this.#sjeti < sim.sjeti.length; this.#sjeti++) {
          const u = sim.sjeti[this.#sjeti]!;
          davka.udalosti.push({ cas: u.cas, druh: "sjeti", stycnik: u.stycnik });
          this.#zlomeno(u.cas, -1);
        }
        for (; this.#poruseni < sim.udalosti.length; this.#poruseni++) {
          const u = sim.udalosti[this.#poruseni]!;
          if (u.prut < 0) continue;
          this.#zlomeno(u.cas, u.prut);
          davka.udalosti.push({
            cas: u.cas,
            druh: "poruseni",
            prut: u.prut,
            zpusob: u.zpusob,
            nasledek: u.nasledek,
            mira: u.mira,
            velicina: u.velicina,
            unosnost: u.unosnost,
          });
          const obalka = this.#obalka[u.prut];
          if (obalka && u.mira > obalka.vyuziti) {
            obalka.vyuziti = u.mira;
            obalka.zpusob = u.zpusob;
            obalka.cas = u.cas;
            obalka.velicina = u.velicina;
            obalka.unosnost = u.unosnost;
          }
        }
        novaStavba = true;
      }
      if (novaStavba) {
        // Nová stavba (zlom, sjetí, odemknutí nebo zamknutí zámku) dostane hned vlastní snímek.
        davka.topologie.push(this.#novaTopologie());
        davka.snimky.push(this.#snimek());
      } else if (sim.cas >= this.#dalsiSnimek) {
        davka.snimky.push(this.#snimek());
        this.#dalsiSnimek += 1 / SNIMKU_ZA_SEKUNDU;
      }
    }
    return davka;
  }

  /** Zkouška do zlomu: první porušení nebo sjetí určuje, co most unesl; děj pak jen doběhne. */
  #zlomeno(cas: number, prut: number): void {
    if (!this.#zlom || this.#zlomCas !== null) return;
    this.#zlomCas = cas;
    this.#zlomZatizeni = zatizeniZlomu(this.#zlom, this.#zlomHodiny);
    this.#zlomPrut = prut;
    this.#konec = Math.min(this.#konec, cas + DOBEH_ZLOMU);
  }

  /** Největší využití každého prutu návrhu; utržené kusy se už nepočítají. */
  /**
   * Namáhání každého prutu návrhu v klidové poloze pod vlastní tíhou: okamžité, bez vyhlazení.
   * Stav simulace se nemění; vyhlazené hodnoty se po výpočtu vrátí.
   */
  #namahaniVKlidu(tiha: number): ObalkaPrutu[] {
    const s = this.simulace.soustava;
    const klid: ObalkaPrutu[] = this.#obalka.map(() => ({ vyuziti: 0, zpusob: ZPUSOB_ZADNY, cas: 0, osova: 0, moment: 0, velicina: 0, unosnost: 0 }));
    if (this.bezRovnovahy) return klid;
    const vyuziti = s.vyuziti.slice();
    const zpusob = s.zpusob.slice();
    const misto = s.mistoNamahani.slice();
    vyhodnotNamahani(s, tiha, 1);
    for (let e = 0; e < s.pocetPrvku; e++) {
      const prut = s.prut[e]!;
      const zaznam = prut < 0 ? undefined : klid[prut];
      if (!zaznam || s.utrzeny[e] === 1 || !(s.vyuziti[e]! > zaznam.vyuziti)) continue;
      const sily = vnitrniSily(s, e, tiha);
      const rozhoduje = rozhodujiciVelicina(s, e, s.zpusob[e]!, sily);
      zaznam.vyuziti = s.vyuziti[e]!;
      zaznam.zpusob = s.zpusob[e]!;
      zaznam.osova = sily.osova;
      zaznam.moment = sily.moment;
      zaznam.velicina = rozhoduje.velicina;
      zaznam.unosnost = rozhoduje.unosnost;
    }
    s.vyuziti.set(vyuziti);
    s.zpusob.set(zpusob);
    s.mistoNamahani.set(misto);
    return klid;
  }

  #aktualizujObalku(): void {
    const s = this.simulace.soustava;
    const cas = this.simulace.cas;
    // První porušení: obálka z doby, kdy byl most celý, se odloží stranou (obálka se nepočítá
    // v každém kroku a špičku mohla minout).
    if (this.#obalkaDoPoruseni === null && this.simulace.porusena) {
      // Kde most nesl víc už v klidu, než kolik stihlo naběhnout vyhlazené využití, platí klid.
      this.#obalkaDoPoruseni = this.#obalka.map((o, prut) => {
        const klid = this.#obalkaKlidu[prut];
        return klid && klid.vyuziti > o.vyuziti ? { ...klid } : { ...o };
      });
      // Každý prut, který povolil v tom prvním kroku, v ní má aspoň 100 % a to, čím povolil.
      const prvni = this.simulace.udalosti[0];
      for (const udalost of this.simulace.udalosti) {
        if (!prvni || udalost.krok !== prvni.krok) break;
        const zaznam = udalost.prut >= 0 ? this.#obalkaDoPoruseni[udalost.prut] : undefined;
        if (!zaznam || zaznam.vyuziti >= 1) continue;
        zaznam.vyuziti = 1;
        zaznam.zpusob = udalost.zpusob;
        zaznam.cas = udalost.cas;
        zaznam.velicina = udalost.velicina;
        zaznam.unosnost = udalost.unosnost;
      }
    }
    for (let e = 0; e < s.pocetPrvku; e++) {
      const prut = s.prut[e]!;
      if (prut < 0 || s.utrzeny[e] === 1) continue;
      const obalka = this.#obalka[prut];
      const vyuziti = s.vyuziti[e]!;
      if (obalka && vyuziti > obalka.vyuziti) {
        obalka.vyuziti = vyuziti;
        obalka.zpusob = s.zpusob[e]!;
        obalka.cas = cas;
        const sily = vnitrniSily(s, e, TIHOVE_ZRYCHLENI);
        const rozhoduje = rozhodujiciVelicina(s, e, obalka.zpusob, sily);
        obalka.osova = sily.osova;
        obalka.moment = sily.moment;
        obalka.velicina = rozhoduje.velicina;
        obalka.unosnost = rozhoduje.unosnost;
      }
    }
    const pisty = this.#pisty;
    for (let i = 0; i < pisty.pocet; i++) {
      const sila = s.osovaSila[pisty.prvek[i]!]!;
      const velikost = sila < 0 ? -sila : sila;
      if (velikost > this.#nejvetsiSilaPistu) this.#nejvetsiSilaPistu = velikost;
      // Píst nemá využití jako prut (neporuší se, jen povolí ventil), ale největší sílu si
      // obálka pamatuje, aby šla u pístu ukázat stejně jako u prutů.
      const obalka = this.#obalka[this.#prutyPistu[i]!];
      if (obalka && velikost > (obalka.velicina < 0 ? -obalka.velicina : obalka.velicina)) {
        obalka.zpusob = sila < 0 ? ZPUSOB_TLAK : ZPUSOB_TAH;
        obalka.cas = cas;
        obalka.osova = sila;
        obalka.velicina = sila;
        obalka.unosnost = pisty.nejvetsiSila;
      }
    }
    // Reakce v podporách: síla, která na zadržený posun styčníku zbývá, je to, co musí
    // podpora přenést. Po porušení už most na podporách neleží tak, jak byl navržen.
    if (!this.simulace.porusena) {
      for (const r of this.#reakce) {
        const i = r.stycnik;
        if ((s.podpora[i]! & 2) !== 0) {
          const svisla = -s.fy[i]!;
          if (svisla > r.svisla) r.svisla = svisla;
          if (svisla < r.nadzvednuti) r.nadzvednuti = svisla;
        }
        if ((s.podpora[i]! & 1) !== 0) {
          const vodorovna = s.fx[i]! < 0 ? -s.fx[i]! : s.fx[i]!;
          if (vodorovna > r.vodorovna) r.vodorovna = vodorovna;
        }
      }
    }
  }

  vysledek(): VysledekZkousky {
    const provoz = this.provoz;
    const ucastniku = provoz.celkem;
    const prejelo = provoz.prejelo;
    const spadlo = provoz.spadlo;
    const rozpad = this.simulace.rozpadla;
    const cena = cenaNavrhu(this.#navrh);
    let nejvetsiVyuziti = 0;
    for (const o of this.#obalka) nejvetsiVyuziti = Math.max(nejvetsiVyuziti, o.vyuziti);
    let poruseni = 0;
    for (const u of this.simulace.udalosti) if (u.prut >= 0) poruseni++;

    // Bez provozu projde most, který pod vlastní tíhou vydržel celý.
    const cely = poruseni === 0 && this.simulace.sjeti.length === 0 && !this.bezRovnovahy;
    // Budič není člověk: jeho měření se nehodnotí jako komfort, ale vrací se jako křivka.
    // Most, který se porušil, ale nikdo z něj nespadl, se hodnotí i podle kmitání po porušení:
    // jinak by mostu, na kterém hned na začátku něco povolí, kmitání nikdo nezměřil.
    const mereni = this.#budic ? null : this.#komfortPoPoruseni !== null && spadlo === 0 ? this.#komfortPoPoruseni : this.#komfort;
    const komfort: KomfortZkousky | null =
      mereni === null
        ? null
        : {
            zrychleni: mereni.nejvetsi,
            cas: mereni.cas,
            trida: tridaKomfortu(mereni.nejvetsi),
            stycnik: mereni.stycnik,
            prekroceno: mereni.prekroceni >= 0 ? mereni.prekroceni : null,
          };
    // Počítá se jen vozidlo, které most přejelo celý; to, které spadlo nebo na most nedojelo,
    // jízdu po mostě nezměřilo (a pád by se tvářil jako nepohodlí).
    let komfortCestujicich: KomfortZkousky | null = null;
    if (this.#komfortVozu.length > 0) {
      let nejvetsi = 0;
      let kdy = 0;
      for (const vuz of this.#komfortVozu) {
        if (provoz.stavy[vuz.kdo[0]!] !== PREJEL || !(vuz.mereni.nejvetsi > nejvetsi)) continue;
        nejvetsi = vuz.mereni.nejvetsi;
        kdy = vuz.mereni.cas;
      }
      komfortCestujicich = { zrychleni: nejvetsi, cas: kdy, trida: tridaKomfortu(nejvetsi), stycnik: -1, prekroceno: null };
    }
    let vysledekBudice: VysledekZkousky["budic"] = null;
    if (this.#budic) {
      const { frekvence, zrychleni } = vyhodnotBudic(this.#budic, this.#krivkaBudice);
      // Budič ve stálém rytmu změří jediný bod křivky: největší odezvu při své frekvenci.
      const krivka = jeStaly(this.#budic) ? (zrychleni > 0 ? [{ f: this.#budic.od, a: zrychleni }] : []) : this.#krivkaBudice;
      vysledekBudice = { frekvence, zrychleni, krivka };
    }
    // Most, na kterém se lidem nedá jít, neobstál, i když nikdo nespadl (koncepce, kap. 4).
    // Úroveň může chtít víc než jen snesitelné kmitání.
    const uroven = this.#uroven;
    const snesitelny = komfort === null || komfort.trida <= uroven.nejhorsiKomfort;
    // Pohyblivý most musí po sklopení zase zamknout a žádná loď do něj nesmí narazit.
    let pretizenychPistu = 0;
    for (const p of this.#pretizenePisty) pretizenychPistu += p;
    const pohyb: PohybZkousky | null = uroven.pohyb
      ? {
          zvednuto: this.#zvednuto,
          preklopeno: this.#preklopeno,
          zamceno: this.#fazePohybu === POHYB_HOTOV,
          casZamceni: this.#casZamceni,
          razDosednuti: this.#fazePohybu >= POHYB_SKLAPENI ? this.#silaDosednuti() : 0,
          klidoveDosednuti: this.#klidoveDosednuti,
          pretizenychPistu,
          nejvetsiSilaPistu: this.#nejvetsiSilaPistu,
          kosinusOtoceni: this.#kosinusOtoceni,
          pistyPriNarazu: this.#pistyPriNarazu,
          kosinusPrutu: Array.from(this.#kosinusPrutu),
          narazenyPrut: this.#narazenyPrut,
          poruseno: this.#porusenoPriPohybu,
          nezamceno: this.#fazePohybu === POHYB_SKLAPENI ? this.#procNezamceno() : null,
        }
      : null;
    const lode = { celkem: this.#lode.length, proplulo: 0, narazilo: 0 };
    for (const stav of this.#lode) {
      if (stav === LOD_PROPLULA) lode.proplulo += 1;
      else if (stav === LOD_NARAZILA) lode.narazilo += 1;
    }
    const pohybVPoradku = (pohyb === null || (pohyb.zamceno && !pohyb.preklopeno)) && lode.proplulo === lode.celkem;
    // Most, který nevede až na předmostí, není hotový, i kdyby kola mezeru přeskočila.
    const mezera = ucastniku > 0 && mezeryTras(this.#navrh, uroven).length > 0;
    // Most, který nemá vlastní oporu, propadne se a zůstane ležet na terénu, neobstál, i kdyby
    // po něm všichni přešli: opírat se smí jen o kotvy a podpory. (Dotyk s terénem je jinak
    // určený troskám; most bez klidové polohy ho má od začátku děje, protože se skládá.)
    const opreno = this.#oprenoSekund > OPRENI_O_TEREN;
    // Průhyb mostovky hlídá jen běžná zkouška: pokus most zatěžuje jinak a medaile neuděluje.
    const mezPruhybu = uroven.nejvetsiPruhyb;
    const pruhyb: PruhybZkousky | null =
      mezPruhybu !== null && this.#pruhybStycniky !== null && this.#brnknuty < 0 && this.#budic === null && this.#zlom === null
        ? {
            nejvetsi: this.#pruhyb.nejvetsi,
            cas: this.#pruhyb.cas,
            x: this.#pruhyb.x,
            mez: mezPruhybu,
            prekroceno: this.#pruhyb.prekroceno >= 0 ? this.#pruhyb.prekroceno : null,
          }
        : null;
    const pruchod =
      (pruhyb === null || pruhyb.prekroceno === null) &&
      !rozpad &&
      spadlo === 0 &&
      prejelo === ucastniku &&
      (ucastniku > 0 || cely) &&
      snesitelny &&
      pohybVPoradku &&
      !mezera &&
      !opreno;
    const bonus = uroven.mistrovska;
    // Brnknutí je pokus, ne zkouška: medaile se neudělují. Frekvence je ta, na které se styčník
    // vychyloval nejvíc. Počítat obraty pohybu nestačí: kde kmitá víc tvarů najednou (most
    // s laděným tlumičem), vyšlo by číslo, které není žádnou vlastní frekvencí mostu.
    let frekvenceKmitani: number | null = null;
    if (this.#brnknuty >= 0) {
      frekvenceKmitani = frekvenceVolnehoKmitani(this.#casyBrnknuti, this.#polohyBrnknuti, BRNKNUTI_OD, BRNKNUTI_DO);
    }
    const zkouska = this.#brnknuty < 0 && this.#budic === null && this.#zlom === null;
    let zlom: VysledekZlomu | null = null;
    if (this.#zlom) {
      // Most, který nemá klidovou polohu, neunesl nic. Ten, který vydržel až do konce, unesl
      // aspoň to, co na něm na konci leželo.
      const zatizeni = this.bezRovnovahy
        ? 0
        : this.#zlomCas === null
          ? zatizeniZlomu(this.#zlom, this.#zlomHodiny)
          : this.#zlomZatizeni;
      zlom = {
        zatizeni,
        celkem: zatizeni * this.#delkaZateze,
        delka: this.#delkaZateze,
        cas: this.bezRovnovahy ? 0 : this.#zlomCas,
        prut: this.#zlomPrut,
        nedolozeno: !this.bezRovnovahy && this.#zlomCas === null && this.#zlomHodiny < NEJDELSI_ZLOM,
      };
    }
    // Medaile jdou po schodech: rozpočtová je průchod pod inženýrským rozpočtem, při kterém
    // se nic neporušilo (most, který někde povolil a lidé přesto přešli, levný není, jen měl
    // štěstí); mistrovská je rozpočtová a k ní bonus úrovně. Mistrovskou tak nejde koupit
    // drahým mostem.
    // „Nic se neporušilo“: žádný prut nepovolil, žádný konec nesjel z podpory a žádný prut
    // nebyl využitý nad 100 % (tvárná ocel se pak trvale přetváří, aniž by vznikla událost
    // porušení: plastický kloub nebo protažený prut; takový most celý není).
    const neporuseny = poruseni === 0 && this.simulace.sjeti.length === 0 && nejvetsiVyuziti <= 1 + 1e-9;
    const rozpoctova = zkouska && pruchod && neporuseny && uroven.inzenyrskyRozpocet !== null && cena <= uroven.inzenyrskyRozpocet;
    const medaile: Medaile = {
      pruchod: pruchod && zkouska,
      rozpocet: rozpoctova,
      mistrovska:
        rozpoctova &&
        bonus !== null &&
        ((bonus.druh === "rezerva" && nejvetsiVyuziti <= bonus.limit) ||
          (bonus.druh === "komfort-chodcu" && komfort !== null && komfort.zrychleni <= bonus.limit) ||
          (bonus.druh === "komfort-cestujicich" &&
            komfortCestujicich !== null &&
            komfortCestujicich.zrychleni <= bonus.limit) ||
          // Měkké dosednutí jde ocenit jen u mostu, který na opěru opravdu dosedl.
          (bonus.druh === "dosednuti" && pohyb !== null && pohyb.razDosednuti > 0 && pohyb.razDosednuti <= bonus.limit)),
    };
    return {
      pruchod,
      ucastniku,
      prejelo,
      spadlo,
      poruseni,
      pohyb,
      mezera,
      lode,
      cena,
      nejvetsiVyuziti,
      komfort,
      komfortCestujicich,
      brnknuti: this.#brnknuty < 0 ? null : { frekvence: frekvenceKmitani },
      budic: vysledekBudice,
      zlom,
      medaile,
      obalka: this.#obalka.map((o) => ({ ...o })),
      obalkaDoPoruseni: this.#obalkaDoPoruseni?.map((o) => ({ ...o })) ?? null,
      reakce: this.#reakce.map((r) => ({ ...r })),
      bezRovnovahy: this.bezRovnovahy,
      opreno,
      neporuseny,
      pruvesVKlidu: this.pruvesVKlidu,
      pruhyb,
      rozpad,
      trvani: this.simulace.cas,
      kroku: this.simulace.kroku,
      otisk: otiskSimulace(this.simulace),
    };
  }

  /** Vnější síly, které má výkres ukázat šipkou: síla budiče v jeho styčníku. */
  #silyKNakresleni(): Float32Array {
    if (this.#zlom) return this.#sipkyZateze();
    const budic = this.#budic;
    if (!budic || this.simulace.cas > budic.trvani) return new Float32Array(0);
    const s = this.simulace.soustava;
    return Float32Array.of(s.x[budic.stycnik]!, s.y[budic.stycnik]!, 0, -budic.sila * this.#fazeBudice[1]);
  }

  /**
   * Zkouška do zlomu: po metru mostovky jedna šipka, velká jako zatížení na metr. Počet
   * šipek se během zkoušky nemění (přehrávání mezi snímky prokládá); kde mostovka pod
   * zátěží chybí, má šipka nulovou velikost.
   */
  #sipkyZateze(): Float32Array {
    const sipky: number[] = [];
    for (const { bremena, roztec } of this.#zatez) {
      const poMetru = Math.max(1, Math.round(1 / roztec));
      for (let i = (poMetru - 1) >> 1; i < bremena.pocet; i += poMetru) {
        const vyska = bremena.vyska[i]!;
        const lezi = vyska === vyska && bremena.sila[i]! > 0;
        sipky.push(bremena.x[i]!, lezi ? vyska : 0, 0, lezi ? -bremena.sila[i]! / roztec : 0);
      }
    }
    return Float32Array.from(sipky);
  }

  #novaTopologie(): Topologie {
    this.#topologii += 1;
    return topologieSoustavy(this.simulace.soustava, this.#kresleni);
  }

  #snimek(): Snimek {
    const s = this.simulace.soustava;
    const polohy = new Float32Array(2 * s.pocetStycniku);
    for (let i = 0; i < s.pocetStycniku; i++) {
      polohy[2 * i] = s.x[i]!;
      polohy[2 * i + 1] = s.y[i]!;
    }
    const vyuziti = new Float32Array(s.pocetPrvku);
    for (let e = 0; e < s.pocetPrvku; e++) {
      // Jako tažený se kreslí prut, u kterého rozhoduje tah; ohyb a tlak plnou čarou.
      vyuziti[e] = s.zpusob[e] === ZPUSOB_TAH ? s.vyuziti[e]! : -s.vyuziti[e]!;
    }
    return {
      cas: this.simulace.cas,
      topologie: this.#topologii - 1,
      polohy,
      vyuziti,
      kola: new Float32Array(0),
      sily: this.#silyKNakresleni(),
      provoz: this.provoz.stavy.slice(),
      kmitani: this.#okamziteKmitani(),
      klouby: plastickeKlouby(s),
    };
  }
}
