// Co je při zkoušce slyšet: zvukové děje odvozené ze záznamu.
//
// Poslech jde záznamem spolu s přehráváním a pro každý úsek času vrátí zvuky, které v něm
// zazněly: lámání prutů, sjetí z ložiska, šplouchnutí a dopad toho, co spadlo, kroky lidí,
// kola na spárách mostovky a vrzání namáhaných prutů. Sám nic nehraje; to dělá syntezátor.
// Stejný záznam dává vždy stejné zvuky: náhodu nahrazuje otisk času a čísla prutu.

import { KATALOG } from "../data/katalog";
import type { NavrhMostu } from "../data/navrh";
import type { Uroven } from "../data/uroven";
import { NASLEDEK_KLOUB } from "../jadro/poruseni";
import { vyskaTerenuV, vytvorTeren, type Teren } from "../jadro/teren";
import { JEDE, SPADL, type PopisUcastnika } from "../zkouska/provoz";
import type { Udalost } from "../zkouska/protokol";
import { hmotnostUcastnika, modelUcastnika } from "../zkouska/vozidla";
import { CARA_SKRYTA, prazdnySnimek, STYCNIK_SKRYTY, type Snimek, type Topologie, type Zaznam } from "../zkouska/zaznam";

/** Z čeho je to, co zvuk vydalo; určuje jeho barvu. */
export type Material = "drevo" | "ocel" | "lano" | "beton";

export const DRUHY_ZVUKU = [
  /** Prut se zlomil, utrhl nebo povolil. */
  "zlom",
  /** Konec mostu sjel z posuvné podpory. */
  "sjeti",
  /** Něco spadlo do vody. */
  "splouchnuti",
  /** Něco dopadlo na zem. */
  "dopad",
  /** Došlap člověka na mostovku. */
  "krok",
  /** Kolo přejelo spáru mezi díly mostovky. */
  "spara",
  /** Namáhaný prut vrže. */
  "vrzani",
  /** Prut těsně před porušením: lupnutí dřeva, cinknutí oceli. */
  "lupnuti",
  /** Rozhoupaná mostovka drnčí. */
  "drnceni",
  /** Brnknutí do mostu. */
  "brnk",
] as const;
export type DruhZvuku = (typeof DRUHY_ZVUKU)[number];

export interface Zvuk {
  druh: DruhZvuku;
  /** Čas děje v sekundách, kdy zvuk začal. */
  cas: number;
  /** Místo ve světě, m. */
  x: number;
  y: number;
  /** Hlasitost 0 až 1. */
  sila: number;
  /** Velikost toho, co zvuk vydalo, 0 až 1: dlouhý prut a těžké vozidlo zní hlouběji. */
  velikost: number;
  material: Material;
  /** Číslo 0 až 1, kterým se liší dva jinak stejné zvuky. */
  odstin: number;
  /**
   * Co zvuk vydalo: u zlomu, vrzání a lupnutí pořadí prutu v návrhu, u sjetí pořadí styčníku,
   * u kroku, spáry, šplouchnutí a dopadu pořadí účastníka provozu; −1 jsou trosky mostu
   * nebo most jako celek.
   */
  puvod: number;
}

/** Odkud poslech čte: záznam zkoušky tak, jak ho plní pracovní vlákno. */
export interface ZdrojDeje {
  zaznam: Zaznam;
  ucastnici: readonly PopisUcastnika[];
  udalosti: readonly Udalost[];
}

/**
 * Využití, od kterého prut začíná vrzat, a od kterého v něm lupe. Vrzat začíná brzy, tiše
 * a zřídka: i most s velkou rezervou má být pod zatížením slyšet.
 */
export const PRAH_VRZANI = 0.1;
export const PRAH_LUPANI = 0.8;
/** Zrychlení mostovky v m/s², od kterého mostovka drnčí, a od kterého drnčí naplno. */
const PRAH_DRNCENI = 1;
const PLNE_DRNCENI = 3;

/** Jak moc prut vrže při daném využití: 0 pod prahem, 1 na mezi únosnosti. Neklesá. */
export function miraVrzani(vyuziti: number): number {
  const mira = (Math.abs(vyuziti) - PRAH_VRZANI) / (1 - PRAH_VRZANI);
  return mira < 0 ? 0 : mira > 1 ? 1 : mira;
}

/** Jak moc v prutu lupe: 0 pod prahem, 1 kousek nad mezí únosnosti. Neklesá. */
export function miraLupani(vyuziti: number): number {
  const mira = (Math.abs(vyuziti) - PRAH_LUPANI) / (1.05 - PRAH_LUPANI);
  return mira < 0 ? 0 : mira > 1 ? 1 : mira;
}

/** Okénko, ve kterém může jednou vrznout, lupnout a zadrnčet, v sekundách děje. */
const OKNO_VRZANI = 0.1;
const OKNO_LUPANI = 0.06;
const OKNO_DRNCENI = 0.09;
/** Podíl vrzání, který zbývá, když se namáhání nemění; zbytek přidává měnící se zatížení. */
const KLID = 0.35;
/** Změna využití za sekundu, od které se namáhání počítá za naplno živé. */
const ZIVA_ZMENA = 0.3;
/** Jak rychle se odhad živosti přizpůsobuje, v sekundách. */
const DOBA_ZIVOSTI = 0.3;

/** Šance, že v jednom okénku vrzne, podle pohonu 0 až 1. Neklesá. */
export function sanceVrzani(pohon: number): number {
  if (!(pohon > 0)) return 0;
  return 0.45 * pohon * Math.sqrt(pohon);
}

/** Jak ochotně materiál vrže. Lano nevrže vůbec. */
const VRZAVOST: Readonly<Record<Material, number>> = { drevo: 1, ocel: 0.55, beton: 0.3, lano: 0 };

/** Delší úsek děje než tento se nepřehrává jako souvislý: je to skok po časové ose. */
const NEJDELSI_USEK = 0.5;
/** Rychlost pádu v m/s, od které je dopad a šplouchnutí slyšet, a od které je naplno. */
const NEJMENSI_DOPAD = 1.5;
const NEJMENSI_SPLOUCHNUTI = 1;
const PLNY_DOPAD = 10;
/** Výška nad zemí v metrech, pod kterou styčník leží, a nad kterou se od ní zase odlepil. */
const NA_ZEMI = 0.05;
const NAD_ZEMI = 0.3;
/** Kroky ve stejném okamžiku (do tolika sekund) splývají v jeden. */
const SPOLECNY_KROK = 0.004;
/** Okamžik brnknutí: těsně po začátku, aby ho zachytil první přehraný úsek. */
const CAS_BRNKNUTI = 1e-4;

const VE_VODE = 1;
const LEZI = 2;

/** Stálé číslo 0 až 1 ze dvou celých čísel; nahrazuje náhodu, aby se zvuky daly opakovat. */
export function otisk(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function omez(hodnota: number): number {
  return hodnota < 0 ? 0 : hodnota > 1 ? 1 : hodnota;
}

/** Velikost zdroje zvuku podle hmotnosti v kilogramech: člověk 0,16, auto 0,7, náklaďák 1. */
function velikostPodleHmotnosti(kg: number): number {
  return omez(Math.sqrt(kg / 3000));
}

interface Chodici {
  /** Kroková frekvence a posun fáze v cyklech: došlap je, když f·t + posun je celé číslo. */
  kadence: number;
  posun: number;
  /** Kolik lidí v tomto účastníkovi jde vedle sebe. */
  lidi: number;
  bezi: boolean;
}

interface PopisPosluchace {
  /** Konce trasy, mezi kterými je účastník na mostě. */
  xOd: number;
  xDo: number;
  velikost: number;
  chodici: Chodici | null;
}

export class Poslech {
  readonly #uroven: Uroven;
  readonly #teren: Teren;
  /** Materiál, velikost a koncové styčníky každého prutu návrhu. */
  readonly #materialy: Material[];
  readonly #velikosti: Float32Array;
  readonly #konce: Int32Array;
  /** Vodorovné polohy spár mostovky, vzestupně. */
  readonly #spary: number[];
  readonly #materialMostovky: Material;
  readonly #brnknuty: number;

  #pred: Snimek = prazdnySnimek();
  #ted: Snimek = prazdnySnimek();
  #cas = 0;
  #navazuje = false;
  /** Okamžité využití každého prutu, jeho hodnota v minulém úseku a živost namáhání. */
  readonly #vyuziti: Float32Array;
  readonly #minule: Float32Array;
  readonly #zivost: Float32Array;
  /** Co už je ve vodě a co leží na zemi: styčníky konstrukce a účastníci provozu. */
  #stavStycniku = new Uint8Array(0);
  #stavUcastniku = new Uint8Array(0);
  #posluchaci: PopisPosluchace[] = [];
  readonly #vystup: Zvuk[] = [];
  readonly #kroky = new Map<number, Zvuk>();

  /** Hluk kol valících se po mostovce v posledním okamžiku, 0 až 1, a kde zhruba je. */
  valeni = 0;
  valeniX = 0;

  /**
   * `brnknuty` je pořadí styčníku návrhu, kterým se při pokusu brnklo; u zkoušky s provozem
   * se vynechá.
   */
  constructor(uroven: Uroven, navrh: NavrhMostu, brnknuty = -1) {
    this.#uroven = uroven;
    this.#teren = vytvorTeren(uroven.teren);
    this.#brnknuty = brnknuty;
    const poradi = new Map(navrh.stycniky.map((st, i) => [st.id, i]));
    const pocet = navrh.pruty.length;
    this.#materialy = [];
    this.#velikosti = new Float32Array(pocet);
    this.#konce = new Int32Array(2 * pocet);
    this.#vyuziti = new Float32Array(pocet);
    this.#minule = new Float32Array(pocet);
    this.#zivost = new Float32Array(pocet);
    const spary = new Set<number>();
    let materialMostovky: Material = "drevo";
    navrh.pruty.forEach((prut, p) => {
      const polozka = KATALOG[prut.prvek];
      const a = poradi.get(prut.a) ?? -1;
      const b = poradi.get(prut.b) ?? -1;
      this.#konce[2 * p] = a;
      this.#konce[2 * p + 1] = b;
      const sa = navrh.stycniky[a];
      const sb = navrh.stycniky[b];
      const delka = sa && sb ? Math.hypot(sb.x - sa.x, sb.y - sa.y) : 1;
      const material: Material =
        polozka.material === "drevo"
          ? "drevo"
          : polozka.material === "lano"
            ? "lano"
            : polozka.material === "ocel" || polozka.material === undefined
              ? "ocel"
              : "beton";
      this.#materialy.push(material);
      // Tlumič a pružina jsou malé kusy kovu; mostovka je širší než prut stejné délky.
      this.#velikosti[p] =
        polozka.material === undefined ? 0.2 : omez(delka / 12 + (polozka.druh === "mostovka" ? 0.25 : 0));
      if (polozka.druh === "mostovka" && sa && sb) {
        spary.add(sa.x);
        spary.add(sb.x);
        materialMostovky = material;
      }
    });
    this.#spary = [...spary].sort((x, y) => x - y);
    this.#materialMostovky = materialMostovky;
  }

  /** Zapomene, kde poslech byl: další úsek se bere jako skok a nic v něm nezazní. */
  prerus(): void {
    this.#navazuje = false;
    this.valeni = 0;
  }

  /**
   * Posune poslech do času `cas` a vrátí zvuky, které od minulého volání zazněly. Skok zpět
   * nebo o víc než půl sekundy děje nevydá nic: po časové ose se dá skákat potichu.
   * Vrácené pole i zvuky v něm platí jen do dalšího volání.
   */
  posun(zdroj: ZdrojDeje, cas: number): readonly Zvuk[] {
    const vystup = this.#vystup;
    vystup.length = 0;
    const stavba = zdroj.zaznam.stavV(cas, this.#ted);
    if (!stavba) {
      this.prerus();
      return vystup;
    }
    const ted = this.#ted;
    this.#pripravPosluchace(zdroj.ucastnici);
    this.#zmerVyuziti(stavba, ted);

    const od = this.#cas;
    const navazuje = this.#navazuje && cas >= od && cas - od <= NEJDELSI_USEK;
    if (!navazuje) {
      this.#zacniZde(stavba, zdroj.ucastnici, ted);
    } else if (cas > od) {
      const pred = this.#pred;
      const usek = cas - od;
      this.#udalosti(zdroj.udalosti, od, cas, ted);
      this.#pady(stavba, zdroj.ucastnici, pred, ted, usek, cas);
      this.#chuze(zdroj.ucastnici, ted, od, cas);
      this.#kola(zdroj.ucastnici, pred, ted, od, cas);
      this.#namahani(ted, od, cas, usek);
      this.#drnceni(ted, od, cas);
      if (this.#brnknuty >= 0 && od < CAS_BRNKNUTI && cas >= CAS_BRNKNUTI) {
        vystup.push({
          druh: "brnk",
          cas: CAS_BRNKNUTI,
          x: ted.polohy[2 * this.#brnknuty] ?? 0,
          y: ted.polohy[2 * this.#brnknuty + 1] ?? 0,
          sila: 0.7,
          velikost: 0.5,
          material: this.#materialMostovky,
          odstin: 0.5,
          puvod: -1,
        });
      }
    }
    this.#valeni(zdroj.ucastnici, ted);

    this.#minule.set(this.#vyuziti);
    // Právě přečtený snímek se stane minulým a do toho staršího se bude číst příště.
    this.#ted = this.#pred;
    this.#pred = ted;
    this.#cas = cas;
    this.#navazuje = true;
    return vystup;
  }

  #pripravPosluchace(ucastnici: readonly PopisUcastnika[]): void {
    if (this.#posluchaci.length === ucastnici.length) return;
    this.#posluchaci = ucastnici.map((u) => {
      const idTrasy = this.#uroven.jizdniRad[u.polozka]?.trasa;
      const trasa = this.#uroven.trasy.find((t) => t.id === idTrasy) ?? this.#uroven.trasy[0];
      const model = modelUcastnika(u.druh, u.kadence);
      const hmotnost = model ? hmotnostUcastnika(model) : 75;
      let chodici: Chodici | null = null;
      if (u.kadence && u.faze) {
        // Kroková síla je největší, když je fáze čtvrt otáčky; tehdy noha došlápne.
        const faze = Math.atan2(u.faze[1], u.faze[0]) / (2 * Math.PI);
        // Kdo jde s ostatními v taktu, dupne s nimi naráz; lidé jdoucí volně splývají v šum
        // a jejich řada zní jen jako odmocnina jejich počtu.
        const lidi = u.vTaktu || u.druh === "utvar" ? (u.lidi ?? 1) : Math.sqrt(u.lidi ?? 1);
        chodici = { kadence: u.kadence, posun: faze - 0.25, lidi, bezi: (model?.rychlost ?? 0) >= 2.5 };
      }
      return {
        xOd: trasa ? Math.min(trasa.zacatek.x, trasa.konec.x) : -Infinity,
        xDo: trasa ? Math.max(trasa.zacatek.x, trasa.konec.x) : Infinity,
        velikost: velikostPodleHmotnosti(hmotnost),
        chodici,
      };
    });
    this.#stavUcastniku = new Uint8Array(ucastnici.length);
    this.#navazuje = false;
  }

  /** Největší okamžité využití každého prutu návrhu. */
  #zmerVyuziti(stavba: Topologie, snimek: Snimek): void {
    const vyuziti = this.#vyuziti;
    vyuziti.fill(0);
    const n = Math.min(stavba.prut.length, snimek.vyuziti.length);
    for (let e = 0; e < n; e++) {
      const prut = stavba.prut[e]!;
      if (prut < 0 || prut >= vyuziti.length || stavba.cara[e] === CARA_SKRYTA) continue;
      const v = Math.abs(snimek.vyuziti[e]!);
      if (v > vyuziti[prut]!) vyuziti[prut] = v;
    }
  }

  /** Po skoku: co už ve vodě a na zemi je, to při dalším přehrávání znovu nedopadne. */
  #zacniZde(stavba: Topologie, ucastnici: readonly PopisUcastnika[], snimek: Snimek): void {
    this.#stavStycniku = new Uint8Array(stavba.stycniku);
    for (let i = 0; i < stavba.stycniku; i++) this.#stavStycniku[i] = this.#stavMista(snimek, i, 0);
    for (let k = 0; k < ucastnici.length; k++) {
      // Kdo jede, toho nese trasa; dopadnout může jen ten, kdo už spadl.
      let stav = 0;
      if (snimek.provoz[k] === SPADL) {
        const u = ucastnici[k]!;
        for (const i of u.kola) stav |= this.#stavMista(snimek, i, u.vyska);
      }
      this.#stavUcastniku[k] = stav;
    }
    this.#minule.set(this.#vyuziti);
    this.#zivost.fill(0);
  }

  #stavMista(snimek: Snimek, stycnik: number, vyska: number): number {
    const x = snimek.polohy[2 * stycnik];
    const y = snimek.polohy[2 * stycnik + 1];
    if (x === undefined || y === undefined) return 0;
    const hladina = this.#uroven.hladina;
    let stav = 0;
    if (hladina !== null && y < hladina) stav |= VE_VODE;
    if (y - vyska - vyskaTerenuV(this.#teren, x) <= NA_ZEMI) stav |= LEZI;
    return stav;
  }

  /** Porušení prutů a sjetí z podpor, které padly do úseku. */
  #udalosti(udalosti: readonly Udalost[], od: number, cas: number, snimek: Snimek): void {
    for (const u of udalosti) {
      if (!(u.cas > od && u.cas <= cas)) continue;
      if (u.druh === "poruseni") {
        const a = this.#konce[2 * u.prut] ?? -1;
        const b = this.#konce[2 * u.prut + 1] ?? -1;
        const xa = snimek.polohy[2 * a] ?? 0;
        const ya = snimek.polohy[2 * a + 1] ?? 0;
        this.#vystup.push({
          druh: "zlom",
          cas: u.cas,
          x: (xa + (snimek.polohy[2 * b] ?? xa)) / 2,
          y: (ya + (snimek.polohy[2 * b + 1] ?? ya)) / 2,
          // Prut, který se jen vyboulil nebo ohnul, zní slaběji než ten, který se přetrhl.
          sila: u.nasledek === NASLEDEK_KLOUB ? 0.75 : 1,
          velikost: this.#velikosti[u.prut] ?? 0.4,
          material: this.#materialy[u.prut] ?? "drevo",
          odstin: otisk(u.prut, Math.round(u.cas * 1000)),
          puvod: u.prut,
        });
      } else if (u.druh === "sjeti") {
        this.#vystup.push({
          druh: "sjeti",
          cas: u.cas,
          x: snimek.polohy[2 * u.stycnik] ?? 0,
          y: snimek.polohy[2 * u.stycnik + 1] ?? 0,
          sila: 0.9,
          velikost: 0.6,
          material: this.#materialMostovky,
          odstin: otisk(u.stycnik, 7),
          puvod: u.stycnik,
        });
      } else if ((u.druh === "pohyb" && (u.faze === "odemceno" || u.faze === "zamceno")) || (u.druh === "lod" && u.stav === "narazila")) {
        // Pracovní zvuky pohyblivého mostu (načisto až v M9): zámek klapne jako kolo na spáře,
        // náraz lodi zní jako dopad. Místo je první styčník mostu.
        const naraz = u.druh === "lod";
        this.#vystup.push({
          druh: naraz ? "dopad" : "spara",
          cas: u.cas,
          x: snimek.polohy[0] ?? 0,
          y: snimek.polohy[1] ?? 0,
          sila: naraz ? 1 : 0.8,
          velikost: 0.8,
          material: "ocel",
          odstin: otisk(naraz ? 3 : 5, Math.round(u.cas * 1000)),
          puvod: -1,
        });
      }
    }
  }

  /** Šplouchnutí a dopady: spadlí účastníci provozu a trosky mostu. */
  #pady(
    stavba: Topologie,
    ucastnici: readonly PopisUcastnika[],
    pred: Snimek,
    ted: Snimek,
    usek: number,
    cas: number,
  ): void {
    const hladina = this.#uroven.hladina;

    for (let k = 0; k < ucastnici.length; k++) {
      if (ted.provoz[k] !== SPADL) {
        this.#stavUcastniku[k] = 0;
        continue;
      }
      const u = ucastnici[k]!;
      // Rozhoduje nejnižší kolo: auto šplouchne jednou, ne za každou nápravu zvlášť.
      let nejniz = -1;
      for (const i of u.kola) {
        if (nejniz < 0 || (ted.polohy[2 * i + 1] ?? 0) < (ted.polohy[2 * nejniz + 1] ?? 0)) nejniz = i;
      }
      if (nejniz < 0 || 2 * nejniz + 1 >= pred.polohy.length) continue;
      const x = ted.polohy[2 * nejniz]!;
      const y = ted.polohy[2 * nejniz + 1]!;
      const rychlost = (pred.polohy[2 * nejniz + 1]! - y) / usek;
      const velikost = this.#posluchaci[k]?.velikost ?? 0.2;
      const stav = this.#stavUcastniku[k]!;
      let novy = stav;
      if (hladina !== null && y < hladina) {
        if ((stav & VE_VODE) === 0 && rychlost >= NEJMENSI_SPLOUCHNUTI) {
          this.#vystup.push(this.#dopad("splouchnuti", cas, x, hladina, rychlost, velikost, k));
        }
        novy |= VE_VODE;
      } else {
        const nad = y - u.vyska - vyskaTerenuV(this.#teren, x);
        if (nad <= NA_ZEMI) {
          if ((stav & LEZI) === 0 && rychlost >= NEJMENSI_DOPAD) {
            this.#vystup.push(this.#dopad("dopad", cas, x, y - u.vyska, rychlost, velikost, k));
          }
          novy |= LEZI;
        } else if (nad > NAD_ZEMI) novy &= ~LEZI;
      }
      this.#stavUcastniku[k] = novy;
    }

    // Trosky mostu. Co dopadne ve stejném úseku, splyne v jedno šplouchnutí a jeden dopad.
    if (this.#stavStycniku.length < stavba.stycniku) {
      // Styčníky vzniklé rozlomením prutu: začínají ve stavu, ve kterém právě jsou.
      const vetsi = new Uint8Array(stavba.stycniku);
      vetsi.set(this.#stavStycniku);
      for (let i = this.#stavStycniku.length; i < stavba.stycniku; i++) vetsi[i] = this.#stavMista(ted, i, 0);
      this.#stavStycniku = vetsi;
    }
    const stycniku = Math.min(stavba.stycniku, pred.polohy.length >> 1, ted.polohy.length >> 1);
    let doVody = 0;
    let xVody = 0;
    let rychlostVody = 0;
    let naZem = 0;
    let xZeme = 0;
    let yZeme = 0;
    let rychlostZeme = 0;
    for (let i = 0; i < stycniku; i++) {
      if (stavba.znacky[i] === STYCNIK_SKRYTY) continue;
      const x = ted.polohy[2 * i]!;
      const y = ted.polohy[2 * i + 1]!;
      const rychlost = (pred.polohy[2 * i + 1]! - y) / usek;
      const stav = this.#stavStycniku[i]!;
      let novy = stav;
      if (hladina !== null && y < hladina) {
        if ((stav & VE_VODE) === 0 && rychlost >= NEJMENSI_SPLOUCHNUTI) {
          doVody++;
          xVody += x;
          if (rychlost > rychlostVody) rychlostVody = rychlost;
        }
        novy |= VE_VODE;
      } else {
        const nad = y - vyskaTerenuV(this.#teren, x);
        if (nad <= NA_ZEMI) {
          if ((stav & LEZI) === 0 && rychlost >= NEJMENSI_DOPAD) {
            naZem++;
            xZeme += x;
            yZeme += y;
            if (rychlost > rychlostZeme) rychlostZeme = rychlost;
          }
          novy |= LEZI;
        } else if (nad > NAD_ZEMI) novy &= ~LEZI;
      }
      this.#stavStycniku[i] = novy;
    }
    if (doVody > 0 && hladina !== null) {
      const velikost = omez(0.3 + 0.1 * doVody);
      this.#vystup.push(this.#dopad("splouchnuti", cas, xVody / doVody, hladina, rychlostVody, velikost, -1));
    }
    if (naZem > 0) {
      const velikost = omez(0.3 + 0.1 * naZem);
      this.#vystup.push(this.#dopad("dopad", cas, xZeme / naZem, yZeme / naZem, rychlostZeme, velikost, -1));
    }
  }

  #dopad(
    druh: "splouchnuti" | "dopad",
    cas: number,
    x: number,
    y: number,
    rychlost: number,
    velikost: number,
    puvod: number,
  ): Zvuk {
    return {
      druh,
      cas,
      x,
      y,
      sila: omez(0.35 + (0.65 * rychlost) / PLNY_DOPAD),
      velikost,
      material: puvod < 0 ? this.#materialMostovky : "ocel",
      odstin: otisk(Math.round(cas * 1000), puvod + 3),
      puvod,
    };
  }

  /** Došlapy lidí, kteří jsou právě na mostě. Kdo došlápne ve stejný okamžik, zní jako jeden. */
  #chuze(ucastnici: readonly PopisUcastnika[], ted: Snimek, od: number, cas: number): void {
    const kroky = this.#kroky;
    kroky.clear();
    for (let k = 0; k < ucastnici.length; k++) {
      const chodici = this.#posluchaci[k]?.chodici;
      if (!chodici || ted.provoz[k] !== JEDE) continue;
      const u = ucastnici[k]!;
      const stycnik = u.kola[0];
      if (stycnik === undefined) continue;
      const x = ted.polohy[2 * stycnik];
      const posluchac = this.#posluchaci[k]!;
      if (x === undefined || x < posluchac.xOd || x > posluchac.xDo) continue;
      // Skákající dav: kdo stojí, nedupe; při skákání doskakují všichni naráz v rytmu hudby.
      let kadence = chodici.kadence;
      let posun = chodici.posun;
      let pocatek = 0;
      let lidi = chodici.lidi;
      let dupe = chodici.bezi;
      const skok = u.skok;
      if (skok && cas >= skok.prichod && od < skok.odchod) {
        if (cas < skok.od || od >= skok.do) continue;
        kadence = skok.kadence;
        posun = -0.25;
        pocatek = skok.od;
        lidi = u.lidi ?? 1;
        dupe = true;
      }
      const prvni = Math.floor(kadence * (od - pocatek) + posun) + 1;
      const posledni = Math.floor(kadence * (cas - pocatek) + posun);
      for (let n = prvni; n <= posledni; n++) {
        const kdy = pocatek + (n - posun) / kadence;
        const klic = Math.round(kdy / SPOLECNY_KROK) * 2 + (dupe ? 1 : 0);
        const spolecny = kroky.get(klic);
        if (spolecny) {
          // `velikost` zatím nese počet lidí a `x` součet poloh vážený počtem.
          spolecny.x += x * lidi;
          spolecny.velikost += lidi;
        } else {
          kroky.set(klic, {
            druh: "krok",
            cas: kdy,
            x: x * lidi,
            y: (ted.polohy[2 * stycnik + 1] ?? 0) - u.vyska,
            sila: dupe ? 0.6 : 0.4,
            velikost: lidi,
            material: this.#materialMostovky,
            odstin: otisk(n, k),
            puvod: k,
          });
        }
      }
    }
    for (const krok of kroky.values()) {
      const lidi = krok.velikost;
      krok.x /= lidi;
      krok.sila = omez(krok.sila * (1 + 0.35 * Math.log2(lidi)));
      krok.velikost = omez(lidi / 12);
      this.#vystup.push(krok);
    }
  }

  /** Kola vozidel a jízdních kol na spárách mostovky. */
  #kola(ucastnici: readonly PopisUcastnika[], pred: Snimek, ted: Snimek, od: number, cas: number): void {
    const spary = this.#spary;
    if (spary.length === 0) return;
    for (let k = 0; k < ucastnici.length; k++) {
      const posluchac = this.#posluchaci[k]!;
      if (posluchac.chodici || ted.provoz[k] !== JEDE) continue;
      const u = ucastnici[k]!;
      for (let c = 0; c < u.kola.length; c++) {
        const i = u.kola[c]!;
        if (2 * i + 1 >= pred.polohy.length) continue;
        const x0 = pred.polohy[2 * i]!;
        const x1 = ted.polohy[2 * i]!;
        if (x0 === x1) continue;
        const zleva = Math.min(x0, x1);
        const zprava = Math.max(x0, x1);
        for (const spara of spary) {
          if (spara <= zleva || spara > zprava) continue;
          this.#vystup.push({
            druh: "spara",
            cas: od + ((cas - od) * (spara - x0)) / (x1 - x0),
            x: spara,
            y: (ted.polohy[2 * i + 1] ?? 0) - u.vyska,
            sila: omez(0.25 + 0.6 * posluchac.velikost),
            velikost: posluchac.velikost,
            material: this.#materialMostovky,
            odstin: otisk(k * 8 + c, Math.round(spara * 10)),
            puvod: k,
          });
        }
      }
    }
  }

  /** Souvislý hluk kol na mostovce. */
  #valeni(ucastnici: readonly PopisUcastnika[], ted: Snimek): void {
    let hluk = 0;
    let soucet = 0;
    for (let k = 0; k < ucastnici.length; k++) {
      const posluchac = this.#posluchaci[k]!;
      if (posluchac.chodici || ted.provoz[k] !== JEDE) continue;
      for (const i of ucastnici[k]!.kola) {
        const x = ted.polohy[2 * i];
        if (x === undefined || x < posluchac.xOd || x > posluchac.xDo) continue;
        hluk += 0.6 * posluchac.velikost;
        soucet += 0.6 * posluchac.velikost * x;
      }
    }
    this.valeni = omez(hluk);
    if (hluk > 0) this.valeniX = soucet / hluk;
  }

  /** Vrzání a lupání namáhaných prutů. */
  #namahani(ted: Snimek, od: number, cas: number, usek: number): void {
    const vyuziti = this.#vyuziti;
    const minule = this.#minule;
    const zivost = this.#zivost;
    const prizpusobeni = Math.min(1, usek / DOBA_ZIVOSTI);
    let pohon = 0;
    let lupani = 0;
    let lupajici = -1;
    for (let p = 0; p < vyuziti.length; p++) {
      const zmena = Math.abs(vyuziti[p]! - minule[p]!) / usek;
      zivost[p] = zivost[p]! + (Math.min(1, zmena / ZIVA_ZMENA) - zivost[p]!) * prizpusobeni;
      const material = this.#materialy[p]!;
      const d = miraVrzani(vyuziti[p]!) * VRZAVOST[material] * (KLID + (1 - KLID) * zivost[p]!);
      if (d > pohon) pohon = d;
      const l = miraLupani(vyuziti[p]!);
      if (l > lupani) {
        lupani = l;
        lupajici = p;
      }
    }

    if (pohon > 0) {
      const sance = sanceVrzani(pohon);
      for (let j = Math.floor(od / OKNO_VRZANI); j <= Math.floor(cas / OKNO_VRZANI); j++) {
        const kdy = (j + otisk(j, 11)) * OKNO_VRZANI;
        if (!(kdy > od && kdy <= cas) || otisk(j, 12) >= sance) continue;
        // Vrzne jeden z nejvíc namáhaných prutů; který, o tom rozhodne otisk okénka.
        let vybrany = -1;
        let nejvic = 0;
        for (let p = 0; p < vyuziti.length; p++) {
          const d = miraVrzani(vyuziti[p]!) * VRZAVOST[this.#materialy[p]!] * (KLID + (1 - KLID) * zivost[p]!);
          const vaha = d * (0.5 + 0.5 * otisk(j, 100 + p));
          if (vaha > nejvic) {
            nejvic = vaha;
            vybrany = p;
          }
        }
        if (vybrany >= 0) this.#vystup.push(this.#zvukPrutu("vrzani", kdy, vybrany, ted, 0.2 + 0.8 * miraVrzani(vyuziti[vybrany]!), j));
      }
    }

    if (lupani > 0 && lupajici >= 0) {
      const sance = 0.15 + 0.6 * lupani;
      for (let j = Math.floor(od / OKNO_LUPANI); j <= Math.floor(cas / OKNO_LUPANI); j++) {
        const kdy = (j + otisk(j, 21)) * OKNO_LUPANI;
        if (!(kdy > od && kdy <= cas) || otisk(j, 22) >= sance) continue;
        this.#vystup.push(this.#zvukPrutu("lupnuti", kdy, lupajici, ted, 0.3 + 0.7 * lupani, j));
      }
    }
  }

  #zvukPrutu(druh: "vrzani" | "lupnuti", cas: number, prut: number, snimek: Snimek, sila: number, okno: number): Zvuk {
    const a = this.#konce[2 * prut]!;
    const b = this.#konce[2 * prut + 1]!;
    const xa = snimek.polohy[2 * a] ?? 0;
    const ya = snimek.polohy[2 * a + 1] ?? 0;
    const kde = otisk(okno, 31 + prut);
    return {
      druh,
      cas,
      x: xa + ((snimek.polohy[2 * b] ?? xa) - xa) * kde,
      y: ya + ((snimek.polohy[2 * b + 1] ?? ya) - ya) * kde,
      sila,
      velikost: this.#velikosti[prut]!,
      material: this.#materialy[prut]!,
      odstin: otisk(okno, 41 + prut),
      puvod: prut,
    };
  }

  /** Drnčení mostovky, když se pod lidmi houpe víc, než je příjemné. */
  #drnceni(ted: Snimek, od: number, cas: number): void {
    const mira = omez((ted.kmitani - PRAH_DRNCENI) / (PLNE_DRNCENI - PRAH_DRNCENI));
    if (!(mira > 0) || this.#spary.length === 0) return;
    // Zprvu jen občas; u meze, kdy most neobstojí, drnčí skoro souvisle.
    const sance = 0.9 * mira * mira;
    const trasa = this.#uroven.trasy[0];
    for (let j = Math.floor(od / OKNO_DRNCENI); j <= Math.floor(cas / OKNO_DRNCENI); j++) {
      const kdy = (j + otisk(j, 51)) * OKNO_DRNCENI;
      if (!(kdy > od && kdy <= cas) || otisk(j, 52) >= sance) continue;
      const spara = this.#spary[Math.floor(otisk(j, 53) * this.#spary.length)]!;
      this.#vystup.push({
        druh: "drnceni",
        cas: kdy,
        x: spara,
        y: trasa ? trasa.zacatek.y : 0,
        sila: 0.2 + 0.6 * mira,
        velikost: 0.3,
        material: this.#materialMostovky,
        odstin: otisk(j, 54),
        puvod: -1,
      });
    }
  }
}
