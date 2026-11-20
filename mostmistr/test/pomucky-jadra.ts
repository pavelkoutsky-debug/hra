// Společné stavebnice pro testy jádra.
import { NOSNIK, type PopisPrvku, type PopisSoustavy } from "../src/jadro/soustava";

export type Prurez = Omit<PopisPrvku, "a" | "b">;

/** Ocelový profil HEB 200, ohyb kolem silné osy. */
export const HEB200: Prurez = {
  druh: NOSNIK,
  EA: 210e9 * 78.1e-4,
  EI: 210e9 * 5696e-8,
  GAs: 81e9 * 24.8e-4,
  hmotnostNaMetr: 61.3,
  polomerSetrvacnosti: Math.sqrt(5696e-8 / 78.1e-4),
};

/** Tentýž profil bez smykové poddajnosti, pro srovnání se vzorci klasického nosníku. */
export const HEB200_BEZ_SMYKU: Prurez = { ...HEB200, GAs: Infinity };

/**
 * Vodorovný nosník délky `delka` z `dilu` stejných prvků. Styčník 0 je vlevo.
 * Podpory: "konzola" = levý konec vetknutý, "prosty" = kloub vlevo a posuvná podpora vpravo.
 */
export function nosnik(prurez: Prurez, delka: number, dilu: number, podpory: "konzola" | "prosty"): PopisSoustavy {
  const popis: PopisSoustavy = { stycniky: [], prvky: [] };
  for (let i = 0; i <= dilu; i++) popis.stycniky.push({ x: (delka * i) / dilu, y: 0 });
  for (let i = 0; i < dilu; i++) popis.prvky.push({ ...prurez, a: i, b: i + 1 });
  const levy = popis.stycniky[0]!;
  const pravy = popis.stycniky[dilu]!;
  levy.pevneX = true;
  levy.pevneY = true;
  if (podpory === "konzola") {
    levy.pevneNatoceni = true;
  } else {
    pravy.pevneY = true;
  }
  return popis;
}
