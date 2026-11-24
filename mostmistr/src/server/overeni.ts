// Ověření mostu pro žebříček: server si most ze zápisu hráče sám postaví a pustí na něj tutéž
// zkoušku jako hra. Fyzika je stejný kód a počítá bitově stejně, takže poctivému hráči vyjde
// na serveru stejný otisk výsledku; podvržený výsledek (jiná cena, most, který neprojde, most
// mimo pravidla úrovně) se pozná. Jediné místo serveru, které zná úrovně a zkoušku.

import { cenaNavrhu, hmotnostNavrhu } from "../data/cena";
import { zkontrolujNavrh, type NavrhMostu } from "../data/navrh";
import { rozkodujMost } from "../data/sdileni";
import type { Uroven } from "../data/uroven";
import { unosnostNaKorunu } from "../data/vyzvy";
import { kanonMostu } from "../data/zebricek";
import { VERZE_FYZIKY } from "../jadro/verze";
import { Zkouska } from "../zkouska/zkouska";
import { ZKOUSKA_DO_ZLOMU } from "../zkouska/zlom";
import { nactiKampan, nasadaUrovne } from "../../urovne/index";

/** Most přečtený z kódu a zkontrolovaný proti pravidlům úrovně (bez zkoušky: je to levné). */
export type PripravenyMost =
  /** Kód mostu nejde přečíst. */
  | { stav: "most" }
  /** Most porušuje pravidla úrovně (zóna, paleta, rozpočet…). */
  | { stav: "pravidla" }
  /** Most smí ke zkoušce; `kanon` je jeho zápis nezávislý na id a pořadí kreslení. */
  | { stav: "pripraven"; kanon: string };

/** Jak dopadla běžná zkouška mostu na serveru; `plati`, když prošel a nic se na něm neporušilo. */
export interface OvereniBezne {
  plati: boolean;
  otisk: string;
  cena: number;
  hmotnost: number;
}

/** Jak dopadla zkouška do zlomu. */
export interface OvereniZlomu {
  otisk: string;
  /** Únosnost na korunu, N/Kč. */
  naKorunu: number;
}

/** Co žebříček od ověřování potřebuje; v testech jde nahradit. */
export interface Overovac {
  /** Verze fyziky, kterou server počítá. */
  verze: number;
  /** Úroveň kampaně podle id, nebo null. */
  uroven(id: string): Uroven | null;
  /** Klíč úrovně v úložišti: id a otisk jejího zadání (po změně zadání začíná žebříček znovu). */
  klicUrovne(uroven: Uroven): string;
  /** Přečte most z kódu a zkontroluje pravidla úrovně; zkoušku nepouští. */
  priprav(uroven: Uroven, kod: string): PripravenyMost;
  /** Běžná zkouška; volá se jen pro most, který prošel přípravou. */
  bezna(uroven: Uroven, kod: string): OvereniBezne;
  /** Zkouška do zlomu; volá se jen pro most, kterému běžná zkouška platí. Null, když ji most nedostal. */
  zlom(uroven: Uroven, kod: string): OvereniZlomu | null;
}

/** Pojistka proti zkoušce, která by neskončila: víc kroků po sekundě děje žádná úroveň nemá. */
const NEJVIC_KROKU = 400;

function dokonci(zkouska: Zkouska): boolean {
  for (let i = 0; i < NEJVIC_KROKU && !zkouska.hotovo; i++) zkouska.pokracuj(1);
  return zkouska.hotovo;
}

function nacti(uroven: Uroven, kod: string): NavrhMostu | "most" | "pravidla" {
  let navrh: NavrhMostu;
  try {
    navrh = rozkodujMost(kod);
  } catch {
    return "most";
  }
  return zkontrolujNavrh(navrh, uroven).length > 0 ? "pravidla" : navrh;
}

function otiskTextu(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Otisk zadání úrovně pro klíč žebříčku: všechno, co rozhoduje o tom, který most projde a co
 * stojí (údolí, provoz, paleta, zóny, rozpočet). Název, formát souboru, inženýrský rozpočet,
 * bonus mistrovské medaile ani štítek zkoušky do něj nepatří: jejich ladění by žebříček úrovně
 * smazalo, i když mosty v něm platí dál.
 */
export function otiskZadani(uroven: Uroven): string {
  const { nazev: _nazev, verze: _verze, inzenyrskyRozpocet: _inzenyrsky, mistrovska: _mistrovska, zkouskova: _zkouskova, ...zadani } = uroven;
  return otiskTextu(JSON.stringify(zadani));
}

/** Ověřovač nad úrovněmi kampaně, jak je nese tohle sestavení. */
export function overovacKampane(): Overovac {
  let urovne: Map<string, Uroven> | null = null;
  const klice = new Map<string, string>();
  const kampan = (): Map<string, Uroven> => (urovne ??= new Map(nactiKampan().map((u) => [u.id, u])));
  return {
    verze: VERZE_FYZIKY,
    uroven: (id) => kampan().get(id) ?? null,
    klicUrovne: (uroven) => {
      let klic = klice.get(uroven.id);
      if (klic === undefined) {
        klic = `${uroven.id}-${otiskZadani(uroven)}`;
        klice.set(uroven.id, klic);
      }
      return klic;
    },
    priprav: (uroven, kod) => {
      const navrh = nacti(uroven, kod);
      return typeof navrh === "string" ? { stav: navrh } : { stav: "pripraven", kanon: kanonMostu(navrh) };
    },
    bezna: (uroven, kod) => {
      const navrh = nacti(uroven, kod);
      const neplatny: OvereniBezne = { plati: false, otisk: "", cena: 0, hmotnost: 0 };
      if (typeof navrh === "string") return neplatny;
      // Most, který zkouška odmítne postavit nebo na kterém výpočet spadne, neprošel: hra by
      // hráči u téhož mostu ohlásila chybu zkoušky, ne výsledek.
      try {
        const zkouska = new Zkouska(uroven, navrh, nasadaUrovne(uroven));
        const hotovo = dokonci(zkouska);
        const v = zkouska.vysledek();
        return { plati: hotovo && v.pruchod && !v.rozpad && v.neporuseny, otisk: v.otisk, cena: cenaNavrhu(navrh), hmotnost: hmotnostNavrhu(navrh, uroven) };
      } catch {
        return neplatny;
      }
    },
    zlom: (uroven, kod) => {
      const navrh = nacti(uroven, kod);
      if (typeof navrh === "string") return null;
      try {
        const zkouska = new Zkouska(uroven, navrh, nasadaUrovne(uroven), undefined, undefined, ZKOUSKA_DO_ZLOMU);
        if (!dokonci(zkouska)) return null;
        const v = zkouska.vysledek();
        if (v.rozpad || !v.zlom) return null;
        return { otisk: v.otisk, naKorunu: unosnostNaKorunu(v.zlom.celkem, cenaNavrhu(navrh)) };
      } catch {
        return null;
      }
    },
  };
}
