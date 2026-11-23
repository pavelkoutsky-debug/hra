// Zkouška mostu v úrovni: postaví most z návrhu, pustí po něm provoz podle jízdního řádu,
// zaznamená průběh a vyhodnotí, kdo přejel, co se porušilo a jaké medaile most získal.
// Nezávisí na prohlížeči; ve hře ji pohání pracovní vlákno, v testech Node.

import { cenaNavrhu } from "../data/cena";
import type { NavrhMostu } from "../data/navrh";
import type { Medaile } from "../data/ulozeni";
import type { Uroven } from "../data/uroven";
import { TIHOVE_ZRYCHLENI } from "../jadro/integrator";
import { tridaKomfortu, vytvorMereniKomfortu, zmerKomfort, type MereniKomfortu } from "../jadro/komfort";
import { vytvorLoziska } from "../jadro/loziska";
import { najdiRovnovahu } from "../jadro/matice";
import { najdiKlid } from "../jadro/ustaleni";
import { rozhodujiciVelicina, vnitrniSily, ZPUSOB_TAH, ZPUSOB_ZADNY } from "../jadro/namahani";
import { NASLEDEK_ROZLOMENI } from "../jadro/poruseni";
import { Simulace, type Zatizeni } from "../jadro/simulace";
import { LANO, sestavSoustavu, type Soustava } from "../jadro/soustava";
import { volneStupne } from "../jadro/stupne";
import { pridejKontaktSTerenem, vytvorTeren, type Teren } from "../jadro/teren";
import { vytvorTrasu } from "../jadro/trasa";
import { otiskSimulace } from "./otisk";
import { jeClovek, naplanujProvoz, PREJEL, pridejOdporVody, Provoz, type PopisUcastnika } from "./provoz";
import { frekvenceBudice, jeStaly, vyhodnotBudic } from "./budic";
import type { BudicZkousky, KomfortZkousky, ObalkaPrutu, ReakcePodpory, Udalost, VysledekZkousky } from "./protokol";
import { sestavMost } from "./stavba";
import { plastickeKlouby, topologieSoustavy, type PopisKresleni, type Snimek, type Topologie } from "./zaznam";

/** Počet snímků záznamu na sekundu děje. */
export const SNIMKU_ZA_SEKUNDU = 60;
/** Jak dlouho děj pokračuje poté, co poslední účastník dojel nebo dopadl, v sekundách. */
const DOBEH = 1.5;
/** Nejdéle tolik sekund se čeká, než ti, kdo spadli, dopadnou na zem nebo do vody. */
const NEJDELSI_PAD = 5;
/** Délka zkoušky bez provozu: most jen stojí pod vlastní tíhou. */
const TRVANI_BEZ_PROVOZU = 3;
/** Jak dlouho se sleduje most rozkmitaný brnknutím, v sekundách. */
const TRVANI_BRNKNUTI = 4;
/** Jak dlouho se most sleduje poté, co budič dojel na konec svého rozsahu, v sekundách. */
const DOBEH_BUDICE = 1;
/** Po jaké době se zapisuje další bod křivky změřené budičem, v sekundách. */
const KROK_MERENI_BUDICE = 0.1;
/** Po kolika krocích se aktualizuje obálka namáhání; shodně s posudkem v simulaci. */
const INTERVAL_OBALKY = 4;

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
  readonly #reakce: ReakcePodpory[];
  /** Měření kmitání mostovky; null v úrovni, kde přes most nejdou lidé. */
  readonly #komfort: MereniKomfortu | null;
  /**
   * Měření zrychlení karoserie každého autobusu a skříně každého osobního vozu zvlášť:
   * číslo účastníka (v poli, aby se dalo předat bez nové alokace) a jeho měření.
   */
  readonly #komfortVozu: { kdo: number[]; mereni: MereniKomfortu }[];
  #dalsiSnimek = 0;
  #topologii = 0;
  #poruseni = 0;
  #sjeti = 0;
  #udalostiProvozu = 0;
  #konec = Infinity;
  /** Kdy dojel nebo spadl poslední účastník provozu. */
  #vsichniOd = Infinity;
  #zacala = false;

  /** Styčník, kterým se brnklo, a okamžiky, kdy jeho svislá rychlost změnila znaménko. */
  readonly #brnknuty: number;
  readonly #obraty: number[] = [];
  #minulaRychlost = 0;

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
  ) {
    if (brnknuti || budic) uroven = { ...uroven, jizdniRad: [] };
    this.#uroven = uroven;
    this.#navrh = navrh;
    this.#brnknuty = brnknuti ? brnknuti.stycnik : -1;
    this.#budic = budic && budic.stycnik >= 0 && budic.stycnik < navrh.stycniky.length ? budic : null;
    const tiha = TIHOVE_ZRYCHLENI;
    const stavba = sestavMost(uroven, navrh);
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
      this.#komfort = vytvorMereniKomfortu(s, stycniky);
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
    this.#kresleni = { mostovka: this.trasyMostovky, skryte, zavazi };
    this.#obalka = navrh.pruty.map(() => ({ vyuziti: 0, zpusob: ZPUSOB_ZADNY, cas: 0, osova: 0, moment: 0, velicina: 0, unosnost: 0 }));
    this.#reakce = [];
    for (let i = 0; i < stavba.stycnikuNavrhu; i++) {
      if ((s.podpora[i]! & 3) !== 0) this.#reakce.push({ stycnik: i, svisla: 0, nadzvednuti: 0, vodorovna: 0 });
    }
    const bezProvozu = this.#budic
      ? this.#budic.trvani + DOBEH_BUDICE
      : brnknuti
        ? TRVANI_BRNKNUTI
        : TRVANI_BEZ_PROVOZU;
    this.trvani = plan.ucastnici.length > 0 ? plan.konec + DOBEH : bezProvozu;
    if (plan.ucastnici.length === 0) this.#konec = bezProvozu;
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

  /** Provoz a po prvním porušení i dopad trosek mostu na terén a do vody. */
  #zatizeni(teren: Teren, stycnikuMostu: number): Zatizeni {
    const provoz = this.provoz;
    const hladina = this.#uroven.hladina;
    return {
      pridejSily: (s, cas) => {
        provoz.pridejSily(s);
        // Budič: svislá síla ve styčníku, dokud nedojede na konec svého rozsahu.
        const budic = this.#budic;
        if (budic && cas <= budic.trvani) s.fy[budic.stycnik] = s.fy[budic.stycnik]! - budic.sila * this.#fazeBudice[1];
        if (this.simulace?.porusena || this.bezRovnovahy) {
          // Styčníky vzniklé rozlomením prutů jsou až za styčníky provozu.
          pridejKontaktSTerenem(s, teren, 0, stycnikuMostu);
          pridejKontaktSTerenem(s, teren, this.#prvniTroska, s.pocetStycniku);
          if (hladina !== null) {
            pridejOdporVody(s, hladina, 0, stycnikuMostu);
            pridejOdporVody(s, hladina, this.#prvniTroska, s.pocetStycniku);
          }
        }
        void cas;
      },
      posun: (s, cas) => {
        provoz.posun(s, cas);
        this.#posunBudic(cas);
      },
      poZmene: (s) => {
        provoz.poZmene(s);
        this.#uvolniZavaziTlumicu(s);
      },
      zmenaKroku: (dt) => {
        this.#krokBudice = dt;
        provoz.zmenaKroku(dt);
      },
      pridavnaFrekvence: (s) => provoz.pridavnaFrekvence(s),
    };
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
      if (sim.kroku % INTERVAL_OBALKY === 0) this.#aktualizujObalku();
      if (this.#brnknuty >= 0) {
        // Obraty svislého pohybu brnknutého styčníku: mezi dvěma sousedními je půl periody.
        const rychlost = s.vy[this.#brnknuty]!;
        if (rychlost * this.#minulaRychlost < 0) this.#obraty.push(sim.cas);
        if (rychlost !== 0) this.#minulaRychlost = rychlost;
      }
      // Kmitání rozbitého mostu už o pohodlí chodců nevypovídá.
      if (this.#komfort && !sim.porusena) {
        zmerKomfort(s, this.#komfort, sim.dt, sim.cas, this.#budic !== null || this.provoz.lideNaMoste(s));
        const budic = this.#budic;
        if (budic && sim.cas >= this.#dalsiMereniBudice && sim.cas <= budic.trvani) {
          this.#dalsiMereniBudice += KROK_MERENI_BUDICE;
          this.#krivkaBudice.push({ f: this.#frekvenceBudice(sim.cas), a: (1000 * this.#komfort.okamzite) / budic.sila });
        }
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
      if (this.provoz.hotovo && this.#konec === Infinity && this.provoz.ucastnici.length > 0) {
        // Kdo spadl, má ještě dopadnout: děj nekončí s autem ve vzduchu.
        if (this.#vsichniOd === Infinity) this.#vsichniOd = sim.cas;
        if (this.provoz.spadliDopadli(s) || sim.cas >= this.#vsichniOd + NEJDELSI_PAD) this.#konec = sim.cas + DOBEH;
      }

      if (sim.udalosti.length > this.#poruseni || sim.sjeti.length > this.#sjeti) {
        // Porušení nebo sjetí z podpory: zaznamenat a hned vydat snímek s novou stavbou,
        // aby se přehrávání nepokoušelo prokládat přes zlom.
        for (; this.#sjeti < sim.sjeti.length; this.#sjeti++) {
          const u = sim.sjeti[this.#sjeti]!;
          davka.udalosti.push({ cas: u.cas, druh: "sjeti", stycnik: u.stycnik });
        }
        for (; this.#poruseni < sim.udalosti.length; this.#poruseni++) {
          const u = sim.udalosti[this.#poruseni]!;
          if (u.prut < 0) continue;
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
        davka.topologie.push(this.#novaTopologie());
        davka.snimky.push(this.#snimek());
      } else if (sim.cas >= this.#dalsiSnimek) {
        davka.snimky.push(this.#snimek());
        this.#dalsiSnimek += 1 / SNIMKU_ZA_SEKUNDU;
      }
    }
    return davka;
  }

  /** Největší využití každého prutu návrhu; utržené kusy se už nepočítají. */
  #aktualizujObalku(): void {
    const s = this.simulace.soustava;
    const cas = this.simulace.cas;
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
    const mereni = this.#budic ? null : this.#komfort;
    const komfort: KomfortZkousky | null =
      mereni === null ? null : { zrychleni: mereni.nejvetsi, cas: mereni.cas, trida: tridaKomfortu(mereni.nejvetsi) };
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
      komfortCestujicich = { zrychleni: nejvetsi, cas: kdy, trida: tridaKomfortu(nejvetsi) };
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
    const pruchod = !rozpad && spadlo === 0 && prejelo === ucastniku && (ucastniku > 0 || cely) && snesitelny;
    const bonus = uroven.mistrovska;
    // Brnknutí je pokus, ne zkouška: frekvence se určí z obratů pohybu a medaile se neudělují.
    let frekvenceKmitani: number | null = null;
    if (this.#brnknuty >= 0 && this.#obraty.length >= 3) {
      const doba = this.#obraty.at(-1)! - this.#obraty[0]!;
      if (doba > 0) frekvenceKmitani = (this.#obraty.length - 1) / (2 * doba);
    }
    const zkouska = this.#brnknuty < 0 && this.#budic === null;
    const medaile: Medaile = {
      pruchod: pruchod && zkouska,
      rozpocet: zkouska && pruchod && uroven.inzenyrskyRozpocet !== null && cena <= uroven.inzenyrskyRozpocet,
      mistrovska:
        zkouska &&
        pruchod &&
        bonus !== null &&
        ((bonus.druh === "rezerva" && nejvetsiVyuziti <= bonus.limit) ||
          (bonus.druh === "komfort-chodcu" && komfort !== null && komfort.zrychleni <= bonus.limit) ||
          (bonus.druh === "komfort-cestujicich" &&
            komfortCestujicich !== null &&
            komfortCestujicich.zrychleni <= bonus.limit)),
    };
    return {
      pruchod,
      ucastniku,
      prejelo,
      spadlo,
      poruseni,
      cena,
      nejvetsiVyuziti,
      komfort,
      komfortCestujicich,
      brnknuti: this.#brnknuty < 0 ? null : { frekvence: frekvenceKmitani },
      budic: vysledekBudice,
      medaile,
      obalka: this.#obalka.map((o) => ({ ...o })),
      reakce: this.#reakce.map((r) => ({ ...r })),
      bezRovnovahy: this.bezRovnovahy,
      pruvesVKlidu: this.pruvesVKlidu,
      rozpad,
      trvani: this.simulace.cas,
      kroku: this.simulace.kroku,
      otisk: otiskSimulace(this.simulace),
    };
  }

  /** Vnější síly, které má výkres ukázat šipkou: síla budiče v jeho styčníku. */
  #silyKNakresleni(): Float32Array {
    const budic = this.#budic;
    if (!budic || this.simulace.cas > budic.trvani) return new Float32Array(0);
    const s = this.simulace.soustava;
    return Float32Array.of(s.x[budic.stycnik]!, s.y[budic.stycnik]!, 0, -budic.sila * this.#fazeBudice[1]);
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
      kmitani: this.#komfort && !this.simulace.porusena ? this.#komfort.okamzite : 0,
      klouby: plastickeKlouby(s),
    };
  }
}
