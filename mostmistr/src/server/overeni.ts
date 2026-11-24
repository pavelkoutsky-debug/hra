// Ověření mostu pro žebříček: server si most ze zápisu hráče sám postaví a pustí na něj tutéž
// zkoušku jako hra. Fyzika je stejný kód a počítá bitově stejně, takže poctivému hráči vyjde
// na serveru stejný otisk výsledku; podvržený výsledek (jiná cena, most, který neprojde, most
// mimo pravidla úrovně) se pozná. Jediné místo serveru, které zná úrovně a zkoušku.

import { cenaNavrhu, hmotnostNavrhu } from "../data/cena";
import { zkontrolujNavrh, type NavrhMostu } from "../data/navrh";
import { rozkodujMost } from "../data/sdileni";
import type { Uroven } from "../data/uroven";
import { unosnostNaKorunu } from "../data/vyzvy";
import { VERZE_FYZIKY } from "../jadro/verze";
import { Zkouska } from "../zkouska/zkouska";
import { ZKOUSKA_DO_ZLOMU } from "../zkouska/zlom";
import { nactiKampan, nasadaUrovne } from "../../urovne/index";

/** Jak dopadla běžná zkouška mostu na serveru. */
export type OvereniBezne =
  /** Kód mostu nejde přečíst. */
  | { stav: "most" }
  /** Most porušuje pravidla úrovně (zóna, paleta, rozpočet…). */
  | { stav: "pravidla" }
  /** Zkouška proběhla; `plati`, když most prošel a nic se na něm neporušilo. */
  | { stav: "zkouseno"; plati: boolean; otisk: string; cena: number; hmotnost: number };

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
  /** Klíč úrovně v úložišti: id a otisk jejího zadání (po změně úrovně začíná žebříček znovu). */
  klicUrovne(uroven: Uroven): string;
  bezna(uroven: Uroven, kod: string): OvereniBezne;
  /** Zkouška do zlomu; volá se jen pro most, kterému běžná zkouška platí. */
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
        klic = `${uroven.id}-${otiskTextu(JSON.stringify(uroven))}`;
        klice.set(uroven.id, klic);
      }
      return klic;
    },
    bezna: (uroven, kod) => {
      const navrh = nacti(uroven, kod);
      if (typeof navrh === "string") return { stav: navrh };
      let zkouska: Zkouska;
      try {
        zkouska = new Zkouska(uroven, navrh, nasadaUrovne(uroven));
      } catch {
        // Most, který zkouška odmítne postavit, pravidla neprošel (hra by ho ke zkoušce nepustila).
        return { stav: "pravidla" };
      }
      const hotovo = dokonci(zkouska);
      const v = zkouska.vysledek();
      return {
        stav: "zkouseno",
        plati: hotovo && v.pruchod && !v.rozpad && v.neporuseny,
        otisk: v.otisk,
        cena: cenaNavrhu(navrh),
        hmotnost: hmotnostNavrhu(navrh, uroven),
      };
    },
    zlom: (uroven, kod) => {
      const navrh = nacti(uroven, kod);
      if (typeof navrh === "string") return null;
      let zkouska: Zkouska;
      try {
        zkouska = new Zkouska(uroven, navrh, nasadaUrovne(uroven), undefined, undefined, ZKOUSKA_DO_ZLOMU);
      } catch {
        return null;
      }
      if (!dokonci(zkouska)) return null;
      const v = zkouska.vysledek();
      if (v.rozpad || !v.zlom) return null;
      return { otisk: v.otisk, naKorunu: unosnostNaKorunu(v.zlom.celkem, cenaNavrhu(navrh)) };
    },
  };
}
