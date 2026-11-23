// Provoz při zkoušce: účastníci z jízdního řádu, jejich jízda po trase, průjezd a pád.
//
// Styčníky a pérování všech účastníků se do soustavy přidají předem; kdo ještě nevyjel,
// stojí před mostem na pevné zemi. Vodorovně je vede předepsaná rychlost, svisle je
// počítá jádro spolu s mostem. Kdo ztratí mostovku pod koly a propadne se, spadl: přestane
// se o trasu opírat a dopadne na terén nebo do vody.

import { jeKolejove, type IdProvozu } from "../data/katalog";
import type { PolozkaJizdnihoRadu, Uroven } from "../data/uroven";
import {
  nastavBuzeni,
  nastavKrokBremen,
  posunBremena,
  pridavnaFrekvenceBremen,
  pridejSilyBremen,
  vytvorBremena,
  type Bremena,
  type PopisBremene,
} from "../jadro/bremena";
import { nahoda, nahodnaFaze } from "../jadro/nahoda";
import { vyskaNerovnosti, vytvorNerovnost, type Nerovnost } from "../jadro/nerovnost";
import type { Zatizeni } from "../jadro/simulace";
import { popisPruziny, type PopisSoustavy, type Soustava } from "../jadro/soustava";
import { pridejKontaktSTerenem, vyskaTerenuV, type Teren } from "../jadro/teren";
import { prestavTrasu, type Trasa } from "../jadro/trasa";
import {
  bezecVZavode,
  chodecVeSkupine,
  KADENCE_DAVU,
  KADENCE_KAPELY,
  KADENCE_SKAKANI,
  KADENCE_ZAVODU,
  lidiVRade,
  modelUcastnika,
  ROZPTYL_DAVU,
  ROZPTYL_ZAVODU,
  RYCHLOST_DAVU,
  RYCHLOST_PRUVODU,
  skokan,
  umiBrzdit,
  vedleSebe,
  type ModelUcastnika,
} from "./vozidla";

export const CEKA = 0;
export const JEDE = 1;
export const PREJEL = 2;
export const SPADL = 3;

/** Druhy provozu, které jsou lidé: jejich pohodlí se měří zrychlením mostovky. */
const LIDE: ReadonlySet<string> = new Set([
  "chodec",
  "bezec",
  "dav",
  "utvar",
  "bezecky-zavod",
  "pruvod",
  "skakajici-dav",
]);

/** Je daný druh provozu člověk (nebo skupina lidí)? */
export function jeClovek(druh: string): boolean {
  return LIDE.has(druh);
}

/** O kolik metrů pod úroveň trasy se účastník musí propadnout, aby se počítal za spadlého. */
const HLOUBKA_PADU = 1.5;
/** Jak daleko za konec mostu musí účastník dojet, aby se počítal za přejetého, m. */
const DOJEZD = 2;
/** Do jaké výšky nad zemí se spadlý účastník počítá za dopadlého, m. */
const DOTYK_ZEME = 0.05;
/** Odpor vody: zpomalení úměrné rychlosti, 1/s. Potopený kus klesá ustálenou rychlostí g/odpor. */
const ODPOR_VODY = 3;
/**
 * Tuhost a tlumení spojení mezi nápravami (N/m, N·s/m). Při jízdě vede každou nápravu
 * předepsaná rychlost a spojení jen nepatrně brání kývání karoserie; drží vozidlo
 * pohromadě, až když spadne a nápravy se uvolní.
 */
const TUHOST_SPOJENI_NAPRAV = 2e6;
const TLUMENI_SPOJENI_NAPRAV = 4e3;

/** Účastník provozu tak, jak ho potřebuje výkres. */
export interface PopisUcastnika {
  /** Index položky jízdního řádu a pořadí ve skupině. */
  polozka: number;
  clen: number;
  /** Druh účastníka; ve vlaku má lokomotiva a každý vůz svůj. */
  druh: IdProvozu;
  smer: 1 | -1;
  /** Čas vyjetí v sekundách. */
  start: number;
  rychlost: number;
  delka: number;
  /** Styčníky kontaktu s mostovkou (osy kol, těžiště chodce), od čela dozadu. */
  kola: number[];
  /** Styčníky karoserie nad nápravami; prázdné u účastníků bez pérování. */
  karoserie: number[];
  /** Výška styčníku kola nad povrchem (poloměr kola, výška těžiště chodce), m. */
  vyska: number;
  /** Kroková frekvence v Hz a výchozí fáze (cos, sin); jen u lidí. */
  kadence?: number;
  faze?: [number, number];
  /** Kolik lidí jde v tomto členu vedle sebe (řada útvaru nebo davu); bez údaje jeden. */
  lidi?: number;
  /** Řada drží krok s ostatními řadami své skupiny (útvar, kapela). */
  vTaktu?: boolean;
  /**
   * Skákající dav: kdy řada dojde na místo a zastaví, odkdy dokdy skáče, kdy se zase
   * rozejde (časy děje v sekundách) a v jakém rytmu skáče (Hz). Skáčou všichni naráz.
   */
  skok?: { prichod: number; od: number; do: number; odchod: number; kadence: number };
  /**
   * Brzdění vozidla: odkdy brzdí, odkdy stojí, kdy se rozjíždí a odkdy zase jede plnou
   * rychlostí (časy děje v sekundách), s jakým zpomalením brzdí a zrychlením se rozjíždí (m/s²).
   */
  brzdeni?: { od: number; stoji: number; rozjezd: number; jede: number; zpomaleni: number; zrychleni: number };
}

interface KontaktUcastnika {
  trasa: number;
  /** Index břemene v břemenech trasy. */
  bremeno: number;
}

interface PlanUcastnika extends PopisUcastnika {
  trasa: number;
  kontakty: KontaktUcastnika[];
  /** Všechny styčníky účastníka. */
  stycniky: number[];
  /** Skákající dav: amplitudy krokové síly při chůzi a síly doskoků. */
  chuze?: number[];
  skakani?: number[];
  /**
   * Přenos tíhy mezi nápravami při zpomalení 1 m/s², N: o kolik se přitíží karoserie nad
   * každou nápravou (pořadí jako `karoserie`; záporné číslo je odlehčení). Součet je nula
   * a moment sil k těžišti je hmotnost × výška těžiště. Prázdné u vozidla s jednou nápravou.
   */
  prenos: number[];
}

/** Řada lidí nebo jedno vozidlo ze skupiny v jízdním řádu. */
interface Rada {
  /** Model řady; lidé vedle sebe jsou v něm už sloučení. */
  model: ModelUcastnika;
  /** Jak daleko za čelem skupiny řada jde, m. */
  zaCelem: number;
  faze: [number, number] | null;
  lidi: number;
  vTaktu: boolean;
  /** Druh řady, když se liší od druhu položky jízdního řádu (vůz za lokomotivou). */
  druh?: IdProvozu;
}

/** Zpomalení při brzdění, když ho úroveň neurčí, a zrychlení při rozjezdu, m/s². */
const VYCHOZI_ZPOMALENI = 5;
const ZRYCHLENI_ROZJEZDU = 1.5;
/** Totéž pro vlak: provozní brzdění kolem 1 m/s², rozjezd 0,5 m/s². */
const ZPOMALENI_VLAKU = 1;
const ROZJEZD_VLAKU = 0.5;
/**
 * Jak dlouho brzdná a tažná síla nabíhá a doznívá, s. Brzdy vlaku se plní a vyprazdňují
 * postupně a spřáhla mají vůli; auto má sílu na kolech za zlomek sekundy. Kdyby síla skákala,
 * most by se při každém zastavení a rozjezdu rozhoupal, jak to skutečný vlak neudělá.
 */
const NABEH_SILY_VLAKU = 1.5;
const NABEH_SILY_VOZIDLA = 0.3;

/** Zpomalení, se kterým položka jízdního řádu brzdí: z úrovně, jinak podle druhu vozidla. */
function zpomaleniBrzdeni(polozka: PolozkaJizdnihoRadu): number {
  return polozka.brzdeni?.zpomaleni ?? (jeKolejove(polozka.druh) ? ZPOMALENI_VLAKU : VYCHOZI_ZPOMALENI);
}

/** Pauza mezi příchodem skákajícího davu na místo a prvním skokem a po posledním skoku, s. */
const PAUZA_SKAKANI = 1;
const VYCHOZI_TRVANI_SKAKANI = 10;
/** Mezera mezi kapelou a davem, který jde za ní, m. */
const MEZERA_ZA_KAPELOU = 3;

/**
 * Náhodné číslo s rozdělením blízkým normálnímu (střed 0, směrodatná odchylka 1), oříznuté
 * na dvě odchylky. Součet čtyř rovnoměrných čísel: jen sčítání a násobení, takže vyjde ve
 * všech prohlížečích stejně.
 */
function odchylka(nahodne: () => number): number {
  const z = (nahodne() + nahodne() + nahodne() + nahodne() - 2) * Math.sqrt(3);
  return z < -2 ? -2 : z > 2 ? 2 : z;
}

/**
 * Model jednoho účastníka položky jízdního řádu. U vozidel smí úroveň předepsat jinou
 * rychlost a jiný rozestup ve skupině (pomalá kolona nárazník na nárazník).
 */
function modelPolozky(polozka: Uroven["jizdniRad"][number]): ModelUcastnika | null {
  const model = modelUcastnika(polozka.druh, polozka.kadence);
  if (!model || jeClovek(polozka.druh)) return model;
  if (polozka.rychlost === undefined && polozka.rozestup === undefined) return model;
  return {
    ...model,
    rychlost: polozka.rychlost ?? model.rychlost,
    // Vozy se nesmějí překrývat, ať úroveň chce cokoli.
    rozestup: Math.max(polozka.rozestup ?? model.rozestup, model.delka + 1),
  };
}

/** Rozloží položku jízdního řádu na řady: kdo jde vedle koho, jak daleko za sebou a v jakém rytmu. */
function radySkupiny(polozka: Uroven["jizdniRad"][number], uroven: Uroven, nahodne: () => number): Rada[] | null {
  const jeden = modelPolozky(polozka);
  if (!jeden) return null;
  const lidi = polozka.pocet ?? 1;
  const vRade = lidiVRade(polozka.druh, uroven.sirkaMostovky);
  const rady: Rada[] = [];
  /** Přidá řady volně jdoucích lidí: každá řada má svou kadenci a fázi. */
  const volne = (
    pocet: number,
    od: number,
    model: (kadence: number) => ModelUcastnika,
    stred: number,
    rozptyl: number,
  ): number => {
    let zaCelem = od;
    for (let zbyva = pocet; zbyva > 0; zbyva -= vRade) {
      const vTetoRade = Math.min(vRade, zbyva);
      const rada = vedleSebe(model(stred + rozptyl * odchylka(nahodne)), vTetoRade, false);
      rady.push({ model: rada, zaCelem, faze: nahodnaFaze(nahodne), lidi: vTetoRade, vTaktu: false });
      zaCelem += rada.rozestup;
    }
    return zaCelem;
  };
  /** Přidá řady lidí, kteří drží krok: jedna kadence a jedna fáze pro všechny. */
  const vTaktu = (pocet: number, od: number, model: ModelUcastnika): number => {
    const faze = model.buzeni ? nahodnaFaze(nahodne) : null;
    let zaCelem = od;
    for (let zbyva = pocet; zbyva > 0; zbyva -= vRade) {
      const vTetoRade = Math.min(vRade, zbyva);
      const rada = vedleSebe(model, vTetoRade);
      rady.push({ model: rada, zaCelem, faze, lidi: vTetoRade, vTaktu: true });
      zaCelem += rada.rozestup;
    }
    return zaCelem;
  };

  switch (polozka.druh) {
    case "utvar":
      vTaktu(lidi, 0, jeden);
      break;
    case "dav":
      volne(lidi, 0, (k) => chodecVeSkupine(k, RYCHLOST_DAVU, jeden.rozestup), polozka.kadence ?? KADENCE_DAVU, ROZPTYL_DAVU);
      break;
    case "bezecky-zavod":
      volne(lidi, 0, (k) => bezecVZavode(k, jeden.rozestup), polozka.kadence ?? KADENCE_ZAVODU, ROZPTYL_ZAVODU);
      break;
    case "pruvod": {
      // Vpředu kapela v taktu (třetina průvodu, aspoň jedna řada), za ní volně jdoucí dav.
      const kapela = Math.min(lidi, Math.max(vRade, Math.round(lidi / 3)));
      const zaKapelou = vTaktu(kapela, 0, chodecVeSkupine(polozka.kadence ?? KADENCE_KAPELY, RYCHLOST_PRUVODU, jeden.rozestup));
      volne(lidi - kapela, zaKapelou - jeden.rozestup + MEZERA_ZA_KAPELOU, (k) => chodecVeSkupine(k, RYCHLOST_PRUVODU, 1.3), KADENCE_DAVU, ROZPTYL_DAVU);
      break;
    }
    case "skakajici-dav":
      volne(lidi, 0, (k) => chodecVeSkupine(k, RYCHLOST_DAVU, jeden.rozestup), KADENCE_DAVU, ROZPTYL_DAVU);
      break;
    case "lokomotiva": {
      // Vlak: lokomotivy v čele a za nimi vozy, nárazník na nárazník. Všichni jedou rychlostí lokomotivy.
      let zaCelem = 0;
      const privesit = (druh: IdProvozu, model: ModelUcastnika): void => {
        rady.push({ model: { ...model, rychlost: jeden.rychlost }, zaCelem, faze: null, lidi: 1, vTaktu: false, druh });
        zaCelem += model.delka;
      };
      for (let i = 0; i < lidi; i++) privesit("lokomotiva", jeden);
      for (const skupina of polozka.vozy ?? []) {
        const vuz = modelUcastnika(skupina.druh);
        if (!vuz) return null;
        for (let i = 0; i < skupina.pocet; i++) privesit(skupina.druh, vuz);
      }
      break;
    }
    default:
      // Jednotlivci a vozidla za sebou; chodci a běžci každý se svou fází kroku.
      for (let clen = 0; clen < lidi; clen++) {
        rady.push({
          model: jeden,
          zaCelem: clen * jeden.rozestup,
          faze: jeden.buzeni ? nahodnaFaze(nahodne) : null,
          lidi: 1,
          vTaktu: false,
        });
      }
  }
  return rady;
}

/** Co se má přidat do soustavy a jak to pak řídit. */
export interface PlanProvozu {
  ucastnici: PlanUcastnika[];
  /** Kontakty břemen pro každou trasu úrovně. */
  kontakty: PopisBremene[][];
  /** Výškový profil vozovky každé trasy; null, když je vozovka dokonale rovná. */
  nerovnosti: (Nerovnost | null)[];
  /** Tíhové zrychlení, se kterým zkouška počítá, m/s². */
  tiha: number;
  /** Index prvního styčníku provozu; styčníky mostu jsou před ním. */
  prvniStycnik: number;
  /** Čas, kdy by měl poslední účastník dojet, kdyby nikdo nespadl. */
  konec: number;
}

export type UdalostProvozu = { cas: number; druh: "prujezd" | "pad"; polozka: number; clen: number };

/**
 * Přidá do popisu soustavy styčníky a pérování všech účastníků jízdního řádu a vrátí plán,
 * podle kterého je `Provoz` po sestavení soustavy řídí. Druh provozu, který hra zatím
 * neumí, skončí chybou.
 */
export function naplanujProvoz(popis: PopisSoustavy, uroven: Uroven, nasada: number, tiha: number): PlanProvozu {
  const nahodne = nahoda(nasada);
  const plan: PlanProvozu = {
    ucastnici: [],
    kontakty: uroven.trasy.map(() => []),
    nerovnosti: uroven.trasy.map(() => null),
    tiha,
    prvniStycnik: popis.stycniky.length,
    konec: 0,
  };

  // Nejdřív se každá položka rozloží na řady (to spotřebovává náhodu ve stálém pořadí)
  // a zjistí se, jak daleko před mostem bude kdo stát; podle toho se pak vyrobí vozovka.
  const skupiny = uroven.jizdniRad.map((polozka) => {
    const cisloTrasy = uroven.trasy.findIndex((t) => t.id === polozka.trasa);
    const trasa = uroven.trasy[cisloTrasy];
    if (!trasa) throw new Error(`Jízdní řád odkazuje na trasu „${polozka.trasa}“, která v úrovni není.`);
    const rady = radySkupiny(polozka, uroven, nahodne);
    if (!rady || rady.length === 0) throw new Error(`Provoz druhu „${polozka.druh}“ hra zatím neumí.`);
    // Před mostem je rozjezd dlouhý sekundu jízdy, aby bylo vidět, kdo přijíždí.
    let nabeh = Math.max(2, rady[0]!.model.rychlost);
    // Kdo má na mostě zastavit, musí mít před místem zastavení celou brzdnou dráhu: vlak
    // brzdí i přes sto metrů, a tak vyjíždí o to dál před mostem.
    if (polozka.brzdeni && umiBrzdit(polozka.druh)) {
      const rychlost = rady[0]!.model.rychlost;
      const brzdnaDraha = (rychlost * rychlost) / (2 * zpomaleniBrzdeni(polozka));
      const odKraje = polozka.smer === 1 ? polozka.brzdeni.misto - trasa.zacatek.x : trasa.konec.x - polozka.brzdeni.misto;
      nabeh = Math.max(nabeh, brzdnaDraha - odKraje);
    }
    return { cisloTrasy, trasa, rady, nabeh };
  });
  if (uroven.nerovnost !== "zadna") {
    uroven.trasy.forEach((trasa, cisloTrasy) => {
      // Vozovka sahá tak daleko před most a za něj, kam dosáhne nejvzdálenější čekající vůz.
      let presah = 30;
      for (const skupina of skupiny) {
        if (skupina.cisloTrasy !== cisloTrasy) continue;
        const posledni = skupina.rady[skupina.rady.length - 1]!;
        presah = Math.max(presah, skupina.nabeh + posledni.zaCelem + posledni.model.delka + 10);
      }
      // Vlastní řada náhodných čísel, aby nerovnosti neposunuly fáze kroků lidí.
      const nasadaVozovky = (Math.imul(nasada ^ 0x9e3779b9, 0x85ebca6b) + cisloTrasy) >>> 0;
      plan.nerovnosti[cisloTrasy] = vytvorNerovnost(
        trasa.zacatek.x - presah,
        trasa.konec.x + presah,
        uroven.nerovnost as Exclude<Uroven["nerovnost"], "zadna">,
        nasadaVozovky,
        trasa.druh === "kolej" ? "kolej" : "silnice",
      );
    });
  }

  uroven.jizdniRad.forEach((polozka, cisloPolozky) => {
    const { cisloTrasy, trasa, rady, nabeh } = skupiny[cisloPolozky]!;
    const rychlost = rady[0]!.model.rychlost;
    const delkaMostu = trasa.konec.x - trasa.zacatek.x;
    // Po nerovnostech jedou kola; chodec je překročí.
    const profil = jeClovek(polozka.druh) ? null : plan.nerovnosti[cisloTrasy]!;

    // Skákající dav dojde doprostřed mostu, zastaví, skáče a zase odejde. Řady jdou stejně
    // rychle a zastaví ve stejných rozestupech, takže na místo dojdou všechny naráz.
    let skok: PopisUcastnika["skok"];
    let skakani: ModelUcastnika | null = null;
    if (polozka.druh === "skakajici-dav") {
      const delkaSkupiny = rady[rady.length - 1]!.zaCelem;
      const prichod = polozka.cas + (nabeh + (delkaMostu + delkaSkupiny) / 2) / rychlost;
      const od = prichod + PAUZA_SKAKANI;
      const konecSkakani = od + (polozka.trvani ?? VYCHOZI_TRVANI_SKAKANI);
      skok = { prichod, od, do: konecSkakani, odchod: konecSkakani + PAUZA_SKAKANI, kadence: polozka.kadence ?? KADENCE_SKAKANI };
      skakani = skokan(skok.kadence);
    }

    // Brzdění: celá skupina brzdí naráz, takže si vozy drží rozestupy. První zastaví čelem
    // v místě, které úroveň určila; brzdit začne tak, aby mu na to brzdná dráha stačila.
    let brzdeni: PopisUcastnika["brzdeni"];
    let ztrataCasu = 0;
    if (polozka.brzdeni && umiBrzdit(polozka.druh)) {
      const zpomaleni = zpomaleniBrzdeni(polozka);
      const zrychleni = jeKolejove(polozka.druh) ? ROZJEZD_VLAKU : ZRYCHLENI_ROZJEZDU;
      const celo = polozka.smer === 1 ? trasa.zacatek.x - nabeh : trasa.konec.x + nabeh;
      const draha = polozka.smer * (polozka.brzdeni.misto - celo);
      const brzdnaDraha = (rychlost * rychlost) / (2 * zpomaleni);
      const od = polozka.cas + Math.max(0, draha - brzdnaDraha) / rychlost;
      const stoji = od + rychlost / zpomaleni;
      const rozjezd = stoji + polozka.brzdeni.stani;
      brzdeni = { od, stoji, rozjezd, jede: rozjezd + rychlost / zrychleni, zpomaleni, zrychleni };
      // Při brzdění a rozjezdu ujede vůz polovinu toho, co by ujel plnou rychlostí.
      ztrataCasu = polozka.brzdeni.stani + rychlost / (2 * zpomaleni) + rychlost / (2 * zrychleni);
    }

    rady.forEach((rada, clen) => {
      const model = rada.model;
      const odCela = nabeh + rada.zaCelem;
      const celo = polozka.smer === 1 ? trasa.zacatek.x - odCela : trasa.konec.x + odCela;
      const zem = polozka.smer === 1 ? trasa.zacatek.y : trasa.konec.y;
      const ucastnik: PlanUcastnika = {
        polozka: cisloPolozky,
        clen,
        druh: rada.druh ?? polozka.druh,
        smer: polozka.smer,
        start: polozka.cas,
        rychlost: model.rychlost,
        delka: model.delka,
        kola: [],
        karoserie: [],
        vyska: model.napravy[0]!.kontakt.vyska,
        trasa: cisloTrasy,
        kontakty: [],
        stycniky: [],
        prenos: [],
      };
      // Kde jsou nápravy s karoserií (od čela vozu), pro přenos tíhy při brzdění.
      const mistaKaroserii: number[] = [];
      if (brzdeni) ucastnik.brzdeni = brzdeni;
      if (model.buzeni && rada.faze) {
        ucastnik.kadence = model.buzeni.frekvence;
        ucastnik.faze = rada.faze;
      }
      if (rada.lidi > 1) ucastnik.lidi = rada.lidi;
      if (rada.vTaktu) ucastnik.vTaktu = true;
      if (skok && skakani && model.buzeni) {
        ucastnik.skok = skok;
        ucastnik.chuze = model.buzeni.amplitudy;
        ucastnik.skakani = vedleSebe(skakani, rada.lidi).buzeni!.amplitudy;
      }

      for (const naprava of model.napravy) {
        const x = celo - polozka.smer * naprava.odstup;
        // Výchozí poloha je klidová: kontakt stlačený tíhou všeho, co nese, na hrbolu, kde kolo stojí.
        const nesena = naprava.odpruzena + naprava.neodpruzena + (naprava.podvozek?.hmota ?? 0);
        const hrbol = profil ? vyskaNerovnosti(profil, x) : 0;
        const yKola = zem + hrbol + naprava.kontakt.vyska - (nesena * tiha) / naprava.kontakt.tuhost;
        const kolo = popis.stycniky.length;
        const bremeno: PopisBremene = {
          stycnik: kolo,
          tuhost: naprava.kontakt.tuhost,
          tlumeni: naprava.kontakt.tlumeni,
          vyskaNad: naprava.kontakt.vyska,
        };
        if (profil) bremeno.poNerovnostech = true;
        if (model.buzeni && ucastnik.faze) bremeno.buzeni = { ...model.buzeni, faze: ucastnik.faze };

        if (naprava.perovani && naprava.neodpruzena > 0) {
          popis.stycniky.push({ x, y: yKola, pevneX: true, hmota: naprava.neodpruzena });
          ucastnik.stycniky.push(kolo);
          // Kolejové vozidlo: mezi dvojkolím a skříní je ještě rám podvozku na prvotním vypružení.
          let pod = kolo;
          let yPod = yKola;
          if (naprava.podvozek) {
            const ram = popis.stycniky.length;
            yPod = yKola + naprava.podvozek.vyska;
            popis.stycniky.push({ x, y: yPod, pevneX: true, hmota: naprava.podvozek.hmota });
            const stlaceniRamu = ((naprava.odpruzena + naprava.podvozek.hmota) * tiha) / naprava.podvozek.tuhost;
            popis.prvky.push({
              ...popisPruziny(kolo, ram, naprava.podvozek.tuhost, naprava.podvozek.tlumeni),
              klidovaDelka: naprava.podvozek.vyska + stlaceniRamu,
            });
            ucastnik.stycniky.push(ram);
            pod = ram;
          }
          const karoserie = popis.stycniky.length;
          popis.stycniky.push({ x, y: yPod + naprava.perovani.vyska, pevneX: true, hmota: naprava.odpruzena });
          // Pružina je v klidové poloze stlačená tíhou karoserie.
          const stlaceni = (naprava.odpruzena * tiha) / naprava.perovani.tuhost;
          popis.prvky.push({
            ...popisPruziny(pod, karoserie, naprava.perovani.tuhost, naprava.perovani.tlumeni),
            klidovaDelka: naprava.perovani.vyska + stlaceni,
          });
          ucastnik.karoserie.push(karoserie);
          mistaKaroserii.push(naprava.odstup);
          ucastnik.stycniky.push(karoserie);
        } else {
          popis.stycniky.push({ x, y: yKola, pevneX: true, hmota: nesena });
          ucastnik.stycniky.push(kolo);
        }
        ucastnik.kola.push(kolo);
        const kontakty = plan.kontakty[cisloTrasy]!;
        ucastnik.kontakty.push({ trasa: cisloTrasy, bremeno: kontakty.length });
        kontakty.push(bremeno);
      }
      // Přenos tíhy při brzdění: vůz se předkloní kolem těžiště a nápravy se přitíží úměrně
      // tomu, jak daleko před ním jsou. Síly ΔNᵢ = m·a·h·(x̄ − xᵢ) / Σ(xⱼ − x̄)² dávají nulový
      // součet a moment m·a·h, ať má vůz náprav kolik chce.
      if (brzdeni && mistaKaroserii.length > 1) {
        let hmota = 0;
        for (const naprava of model.napravy) hmota += naprava.odpruzena + naprava.neodpruzena + (naprava.podvozek?.hmota ?? 0);
        let stred = 0;
        for (const misto of mistaKaroserii) stred += misto / mistaKaroserii.length;
        let rozptyl = 0;
        for (const misto of mistaKaroserii) rozptyl += (misto - stred) * (misto - stred);
        if (rozptyl > 0) {
          const moment = hmota * (model.teziste ?? 1);
          ucastnik.prenos = mistaKaroserii.map((misto) => (moment * (stred - misto)) / rozptyl);
        }
      }
      // Nápravy téhož vozidla drží pohromadě spojení mezi karoseriemi (u kola mezi koly).
      const spojovane = ucastnik.karoserie.length > 0 ? ucastnik.karoserie : ucastnik.kola;
      for (let i = 0; i + 1 < spojovane.length; i++) {
        popis.prvky.push(popisPruziny(spojovane[i]!, spojovane[i + 1]!, TUHOST_SPOJENI_NAPRAV, TLUMENI_SPOJENI_NAPRAV));
      }
      plan.ucastnici.push(ucastnik);
      const draha = odCela + delkaMostu + model.delka + DOJEZD;
      const stani = skok ? skok.odchod - skok.prichod : ztrataCasu;
      plan.konec = Math.max(plan.konec, polozka.cas + draha / model.rychlost + stani);
    });
  });
  return plan;
}

/** Běžící provoz: zatížení pro simulaci a sledování, kdo přejel a kdo spadl. */
export class Provoz implements Zatizeni {
  readonly ucastnici: readonly PopisUcastnika[];
  /** Stav každého účastníka: CEKA, JEDE, PREJEL nebo SPADL. */
  readonly stavy: Uint8Array;
  /** Průjezdy a pády od začátku zkoušky. */
  readonly udalosti: UdalostProvozu[] = [];
  readonly bremena: Bremena[];

  readonly #plan: PlanProvozu;
  readonly #uroven: Uroven;
  readonly #teren: Teren;
  readonly #trasy: Trasa[];
  /** Výška každého styčníku provozu nad jeho dotykem se zemí (osa kola, těžiště chodce). */
  readonly #vysky: Float64Array;
  /** Styčníky spadlých účastníků: jen ty se opírají o terén, ostatní nese trasa. */
  readonly #naTerenu: Uint8Array;
  /** Skákající dav: kolikátou část svého vystoupení má která řada za sebou (viz `#veSkoku`). */
  readonly #castSkoku: Uint8Array;
  /** Okamžité zrychlení každého účastníka ve směru jízdy, m/s² (záporné při brzdění). */
  readonly #zrychleni: Float64Array;
  #nedokonceno: number;

  constructor(s: Soustava, plan: PlanProvozu, trasy: Trasa[], uroven: Uroven, teren: Teren) {
    this.#plan = plan;
    this.#uroven = uroven;
    this.#teren = teren;
    this.#trasy = trasy;
    this.ucastnici = plan.ucastnici;
    this.stavy = new Uint8Array(plan.ucastnici.length);
    this.#castSkoku = new Uint8Array(plan.ucastnici.length);
    this.#zrychleni = new Float64Array(plan.ucastnici.length);
    this.#nedokonceno = plan.ucastnici.length;
    this.bremena = trasy.map((trasa, i) => vytvorBremena(trasa, plan.kontakty[i] ?? [], plan.nerovnosti[i] ?? null));
    this.#naTerenu = new Uint8Array(s.pocetStycniku);
    this.#vysky = new Float64Array(s.pocetStycniku);
    for (const u of plan.ucastnici) {
      // Rám podvozku a karoserie dosednou o něco výš než kola, aby vozidlo po pádu neleželo zploštělé.
      for (const i of u.stycniky) this.#vysky[i] = u.vyska + 0.1;
      for (const i of u.kola) this.#vysky[i] = u.vyska;
      for (const i of u.karoserie) this.#vysky[i] = u.vyska + 0.2;
    }
    // Nikdo ještě nejede; rychlost dostane každý až při vyjetí.
    for (const u of plan.ucastnici) for (const i of u.stycniky) s.vx[i] = 0;
  }

  /** Je právě na mostě (mezi konci své trasy) aspoň jeden člověk? */
  lideNaMoste(s: Soustava): boolean {
    const { ucastnici } = this.#plan;
    for (let k = 0; k < ucastnici.length; k++) {
      if (this.stavy[k] !== JEDE) continue;
      const u = ucastnici[k]!;
      if (!LIDE.has(u.druh)) continue;
      const trasa = this.#uroven.trasy[u.trasa]!;
      const x = s.x[u.kola[0]!]!;
      if (x >= trasa.zacatek.x && x <= trasa.konec.x) return true;
    }
    return false;
  }

  /** Je právě na mostě (aspoň jedním kolem mezi konci své trasy) některý z daných účastníků? */
  nekdoNaMoste(s: Soustava, kteri: readonly number[]): boolean {
    const { ucastnici } = this.#plan;
    for (const k of kteri) {
      if (this.stavy[k] !== JEDE) continue;
      const u = ucastnici[k]!;
      const trasa = this.#uroven.trasy[u.trasa]!;
      for (const i of u.kola) {
        const x = s.x[i]!;
        if (x >= trasa.zacatek.x && x <= trasa.konec.x) return true;
      }
    }
    return false;
  }

  /** Jsou všichni, kdo spadli, už ve vodě nebo na zemi? */
  spadliDopadli(s: Soustava): boolean {
    if (!this.#nekdoSpadl) return true;
    const hladina = this.#uroven.hladina;
    const { ucastnici } = this.#plan;
    for (let k = 0; k < ucastnici.length; k++) {
      if (this.stavy[k] !== SPADL) continue;
      const u = ucastnici[k]!;
      for (const i of u.kola) {
        const y = s.y[i]!;
        if (hladina !== null && y < hladina) continue;
        if (y - u.vyska - vyskaTerenuV(this.#teren, s.x[i]!) <= DOTYK_ZEME) continue;
        return false;
      }
    }
    return true;
  }

  /** Všichni účastníci dojeli nebo spadli. */
  get hotovo(): boolean {
    return this.#nedokonceno === 0;
  }

  /** Kolik lidí a vozidel má přejít; řada lidí vedená jako jeden účastník se počítá po lidech. */
  get celkem(): number {
    let pocet = 0;
    for (const u of this.ucastnici) pocet += u.lidi ?? 1;
    return pocet;
  }

  get prejelo(): number {
    return this.#pocet(PREJEL);
  }

  get spadlo(): number {
    return this.#pocet(SPADL);
  }

  #pocet(stav: number): number {
    let pocet = 0;
    for (let k = 0; k < this.stavy.length; k++) if (this.stavy[k] === stav) pocet += this.ucastnici[k]!.lidi ?? 1;
    return pocet;
  }

  pridejSily(s: Soustava): void {
    for (const b of this.bremena) pridejSilyBremen(s, b);
    // Brzdící vůz se předkloní: přední nápravy se přitíží, zadní odlehčí (při rozjezdu naopak).
    const { ucastnici } = this.#plan;
    for (let k = 0; k < ucastnici.length; k++) {
      const a = this.#zrychleni[k]!;
      if (a === 0) continue;
      const u = ucastnici[k]!;
      const prenos = u.prenos;
      // Zpomalení je záporné zrychlení: karoserie nad přední nápravou tlačí dolů.
      for (let j = 0; j < prenos.length; j++) s.fy[u.karoserie[j]!] = s.fy[u.karoserie[j]!]! + a * prenos[j]!;
    }
    const od = this.#plan.prvniStycnik;
    // Spadlí účastníci dopadají na terén a do vody; ostatní nese trasa.
    if (this.#nekdoSpadl) {
      pridejKontaktSTerenem(s, this.#teren, od, this.#vysky.length, this.#vysky, this.#naTerenu);
      const hladina = this.#uroven.hladina;
      if (hladina !== null) pridejOdporVody(s, hladina, od, this.#vysky.length);
    }
  }

  posun(s: Soustava, cas: number): void {
    for (const b of this.bremena) posunBremena(b);
    const { ucastnici } = this.#plan;
    for (let k = 0; k < ucastnici.length; k++) {
      const u = ucastnici[k]!;
      const stav = this.stavy[k]!;
      if (stav === CEKA) {
        if (cas >= u.start) {
          this.stavy[k] = JEDE;
          for (const i of u.stycniky) s.vx[i] = u.smer * u.rychlost;
        }
      } else if (stav === JEDE) {
        if (u.skok) this.#veSkoku(s, k, u, cas);
        if (u.brzdeni) this.#brzdi(s, k, u, cas);
        const trasa = this.#uroven.trasy[u.trasa]!;
        // Úroveň trasy pod účastníkem; trasa může být ve sklonu.
        const sklon = (trasa.konec.y - trasa.zacatek.y) / (trasa.konec.x - trasa.zacatek.x);
        let spadl = false;
        let dojel = true;
        for (const i of u.kola) {
          const x = s.x[i]!;
          let naTrase = trasa.zacatek.y + sklon * (x - trasa.zacatek.x);
          if (x < trasa.zacatek.x) naTrase = trasa.zacatek.y;
          else if (x > trasa.konec.x) naTrase = trasa.konec.y;
          if (s.y[i]! < naTrase + u.vyska - HLOUBKA_PADU) spadl = true;
          if (u.smer === 1 ? x < trasa.konec.x + DOJEZD : x > trasa.zacatek.x - DOJEZD) dojel = false;
        }
        if (spadl) {
          this.#zrychleni[k] = 0;
          this.#ukonci(k, SPADL, cas, "pad");
          // Od této chvíle se o trasu neopírá; zachytí ho až terén.
          for (const kontakt of u.kontakty) this.bremena[kontakt.trasa]!.vypnuto[kontakt.bremeno] = 1;
          // Stává se volným tělesem: vodorovně už ho nevede předepsaná rychlost, jen setrvačnost.
          for (const i of u.stycniky) {
            this.#naTerenu[i] = 1;
            s.podpora[i] = s.podpora[i]! & ~1;
            s.invHmotaX[i] = 1 / s.hmota[i]!;
          }
          this.#nekdoSpadl = true;
        } else if (dojel) {
          // Přejel a jede dál po předmostí svou rychlostí (kdo se ještě rozjížděl, tou, kterou
          // právě měl): na výkresu tak odjede z obrazu a vlak se za mostem nerozpadá.
          this.#zrychleni[k] = 0;
          for (const kontakt of u.kontakty) this.bremena[kontakt.trasa]!.podelna[kontakt.bremeno] = 0;
          this.#ukonci(k, PREJEL, cas, "prujezd");
        }
      }
    }
  }

  #nekdoSpadl = false;

  /**
   * Vystoupení skákajícího davu má čtyři zlomy: řada dojde na místo a zastaví (1), začne
   * skákat (2), přestane (3) a rozejde se (4). Všechny řady skáčou od stejného okamžiku
   * se stejnou fází, tedy naráz.
   */
  #veSkoku(s: Soustava, k: number, u: PlanUcastnika, cas: number): void {
    const skok = u.skok!;
    const cil = cas < skok.prichod ? 0 : cas < skok.od ? 1 : cas < skok.do ? 2 : cas < skok.odchod ? 3 : 4;
    while (this.#castSkoku[k]! < cil) {
      const cast = (this.#castSkoku[k] = this.#castSkoku[k]! + 1);
      const ticho = cast === 1 || cast === 3;
      if (cast === 1) for (const i of u.stycniky) s.vx[i] = 0;
      else if (cast === 4) for (const i of u.stycniky) s.vx[i] = u.smer * u.rychlost;
      for (const kontakt of u.kontakty) {
        const b = this.bremena[kontakt.trasa]!;
        if (ticho) {
          // Kdo stojí, nebudí; frekvence zůstává, aby se dál sledovalo houpání mostovky pod ním.
          nastavBuzeni(b, kontakt.bremeno, b.frekvence[kontakt.bremeno]!, [], 1, 0);
        } else if (cast === 2) {
          nastavBuzeni(b, kontakt.bremeno, skok.kadence, u.skakani ?? [], 1, 0);
        } else {
          nastavBuzeni(b, kontakt.bremeno, u.kadence ?? skok.kadence, u.chuze ?? [], u.faze?.[0] ?? 1, u.faze?.[1] ?? 0);
        }
      }
    }
  }

  /**
   * Brzdění a rozjezd: předepsaná rychlost vozu klesá k nule, vůz stojí a zase zrychluje.
   * Kola při tom tlačí vozovku podélnou silou úměrnou svému tlaku: při brzdění dopředu,
   * při rozjezdu dozadu. Síla nenaskočí ani nezmizí naráz: nabíhá a doznívá lineárně
   * (`NABEH_SILY_*`), takže celkový impuls zůstává hmotnost × změna rychlosti.
   */
  #brzdi(s: Soustava, k: number, u: PlanUcastnika, cas: number): void {
    const b = u.brzdeni!;
    let rychlost = u.rychlost;
    if (cas >= b.od && cas < b.stoji) rychlost = u.rychlost - b.zpomaleni * (cas - b.od);
    else if (cas >= b.stoji && cas < b.rozjezd) rychlost = 0;
    else if (cas >= b.rozjezd && cas < b.jede) rychlost = b.zrychleni * (cas - b.rozjezd);
    if (rychlost < 0) rychlost = 0;
    else if (rychlost > u.rychlost) rychlost = u.rychlost;
    for (const i of u.stycniky) s.vx[i] = u.smer * rychlost;
    // Zrychlení, které odpovídá síle mezi koly a vozovkou: průběh s plynulými náběhy.
    const nabeh = jeKolejove(u.druh) ? NABEH_SILY_VLAKU : NABEH_SILY_VOZIDLA;
    const pri = (od: number, po: number, velikost: number): number => {
      // Náběh nejvýš polovinu doby, po kterou síla působí, aby stihla dojít na plnou hodnotu.
      const doba = Math.min(nabeh, (po - od) / 2);
      if (!(doba > 0)) return 0;
      const nahoru = cas <= od ? 0 : cas >= od + doba ? 1 : (cas - od) / doba;
      const dolu = cas <= po ? 0 : cas >= po + doba ? 1 : (cas - po) / doba;
      return velikost * (nahoru - dolu);
    };
    const silove = pri(b.od, b.stoji, -b.zpomaleni) + pri(b.rozjezd, b.jede, b.zrychleni);
    this.#zrychleni[k] = silove;
    // Síla kol na vozovku je opačná než síla vozovky na kola: −hmota × zrychlení.
    const podelna = (-u.smer * silove) / this.#plan.tiha;
    for (const kontakt of u.kontakty) this.bremena[kontakt.trasa]!.podelna[kontakt.bremeno] = podelna;
  }

  #ukonci(k: number, stav: number, cas: number, druh: "prujezd" | "pad"): void {
    const u = this.#plan.ucastnici[k]!;
    this.stavy[k] = stav;
    this.#nedokonceno -= 1;
    this.udalosti.push({ cas, druh, polozka: u.polozka, clen: u.clen });
  }

  poZmene(s: Soustava): void {
    for (const trasa of this.#trasy) prestavTrasu(s, trasa);
  }

  zmenaKroku(dt: number): void {
    for (const b of this.bremena) nastavKrokBremen(b, dt);
  }

  pridavnaFrekvence(s: Soustava): number {
    let nejvic = 0;
    for (const b of this.bremena) nejvic = Math.max(nejvic, pridavnaFrekvenceBremen(s, b));
    return nejvic;
  }
}

/** Zpomalí styčníky pod hladinou: síla proti rychlosti úměrná hmotě. */
export function pridejOdporVody(s: Soustava, hladina: number, od: number, po: number): void {
  const { y, vx, vy, fx, fy, hmota, invHmotaX, invHmotaY } = s;
  for (let i = od; i < po; i++) {
    if (y[i]! >= hladina) continue;
    const odpor = ODPOR_VODY * hmota[i]!;
    if (invHmotaX[i] !== 0) fx[i] = fx[i]! - odpor * vx[i]!;
    if (invHmotaY[i] !== 0) fy[i] = fy[i]! - odpor * vy[i]!;
  }
}
