// Proč most zkouškou neprošel, jedním krátkým kódem: totéž, co pruh výsledku říká větou
// (`body[data-pricina]`), v pořadí, v jakém o příčině rozhoduje obrazovka úrovně. Kód nese
// událost deníku `zkouska.konec` (`pricina`) a souhrn deníku podle něj dělí mosty, které
// neprošly, ačkoli se na nich nic nezlomilo. Bez prohlížeče.

import type { VysledekZkousky } from "./protokol";

/**
 * Kódy příčiny. Souhrn deníku věří jen těmhle (deník může plnit kdokoli), takže nový kód
 * patří i sem a do popisu v `src/denik/souhrn.ts` (`POPISY_PRICIN`).
 */
export const KODY_PRICINY = [
  /** Most se složil vlastní vahou (propad mostovky, `src/zkouska/slozeni.ts`). */
  "slozeni",
  /** Mostovka nevede od břehu k břehu. */
  "mezera",
  /** Pohyblivý most: nezvedl se, nezamkl, překlopil se (`src/zkouska/pricinaPohybu.ts`). */
  "pohyb",
  /** Průhyb mostovky nad mezí úrovně. */
  "pruhyb",
  /** Kmitání pod lidmi nad mezí úrovně. */
  "kmitani",
  /** Povolil prut (první porušení); co a jak, nese `prvni`. */
  "poruseni",
  /** Konec prutu sjel z podpory. */
  "sjeti",
  /** Most se propadl a opřel o terén. */
  "opreno",
  /** Někdo z mostu spadl, aniž se co zlomilo. */
  "spadl",
  /** Někdo most nepřešel ani nepřejel (uvízl, nedojel včas). */
  "neprejel",
  /** Loď narazila do mostu. */
  "lod",
  /** Výpočet se rozpadl; výsledek neplatí. */
  "rozpad",
] as const;

export type KodPriciny = (typeof KODY_PRICINY)[number];

export interface PodkladyPriciny {
  vysledek: Pick<
    VysledekZkousky,
    "pruchod" | "rozpad" | "mezera" | "spadlo" | "prejelo" | "ucastniku" | "opreno" | "pruhyb" | "lode" | "pohyb" | "bezRovnovahy" | "komfort"
  >;
  /** Pokus (brnknutí, budič, zkouška do zlomu): neprochází ani nepropadá. */
  pokus: boolean;
  /** Posudek složení našel propad mostovky (`PosudekStability.slozeni`). */
  slozeni: boolean;
  /** Kódy `pricinyPohybu` v pořadí, jak je hra říká; prázdné, když most není pohyblivý. */
  pricinyPohybu: readonly string[];
  /** Kmitání pod lidmi přesáhlo mez úrovně (třída komfortu horší, než úroveň přijme). */
  kmitaniNadMezi: boolean;
  /** První porucha při zkoušce: porušení prutu nebo sjetí z podpory, s časem v sekundách. */
  prvni: { druh: "poruseni" | "sjeti"; cas: number } | null;
}

/**
 * Kód příčiny, proč most neprošel; null u mostu, který prošel, a u pokusu. Pořadí je stejné
 * jako u věty v pruhu výsledku (`ukazVysledek` v `src/hra/uroven.ts`): rozpad výpočtu, složení, mezera
 * v mostovce, pohyblivý most, průhyb, kmitání (když všichni přešli), první porušení, kmitání,
 * a nakonec to, co je vidět na provozu.
 */
export function kodPriciny(p: PodkladyPriciny): KodPriciny | null {
  const v = p.vysledek;
  if (p.pokus || v.pruchod) return null;
  if (v.rozpad) return "rozpad";
  if (v.bezRovnovahy && p.slozeni) return "slozeni";
  if (v.mezera && v.spadlo === 0) return "mezera";
  if (p.pricinyPohybu.length > 0 && p.pricinyPohybu[0] !== "poruseno") return "pohyb";
  const prekrocenoPruhybem = v.pruhyb?.prekroceno ?? null;
  if (prekrocenoPruhybem !== null && (p.prvni === null || p.prvni.cas >= prekrocenoPruhybem)) return "pruhyb";
  const kmitani = p.kmitaniNadMezi && v.spadlo === 0;
  if (kmitani && v.prejelo === v.ucastniku && (v.komfort?.prekroceno ?? null) !== null) return "kmitani";
  if (p.prvni?.druh === "poruseni") return "poruseni";
  if (kmitani) return "kmitani";
  if (p.prvni?.druh === "sjeti") return "sjeti";
  if (v.mezera) return "mezera";
  if (v.opreno) return "opreno";
  if (prekrocenoPruhybem !== null) return "pruhyb";
  if (v.spadlo > 0) return "spadl";
  if (v.lode.narazilo > 0) return "lod";
  if (v.pohyb !== null && (!v.pohyb.zamceno || v.pohyb.preklopeno)) return "pohyb";
  if (v.prejelo < v.ucastniku) return "neprejel";
  return null;
}
