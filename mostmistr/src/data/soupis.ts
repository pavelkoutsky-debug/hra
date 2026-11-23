// Soupis mostu: z čeho je postavený. Slouží nápovědě (z čeho je most autora hry) a dá se
// spočítat bez prohlížeče.

import { cenaNavrhu } from "./cena";
import { KATALOG, type IdPrvku } from "./katalog";
import type { NavrhMostu } from "./navrh";

export interface SoupisMostu {
  /** Prvky v pořadí, v jakém je most poprvé použil: kolik prutů a kolik metrů dohromady. */
  prvky: { prvek: IdPrvku; prutu: number; metru: number }[];
  /** Přídavky ve styčnících: kolik je svařených, kolik má zámek, závaží a laděný tlumič. */
  svaru: number;
  zamku: number;
  zavazi: number;
  tlumicu: number;
  /** Kolik lan má dotažený napínák (předpětí jiné než nula). */
  napinaku: number;
  /** Cena celého mostu, Kč. */
  cena: number;
}

/** Sečte, z čeho návrh je. Délky se počítají z výkresu, zaokrouhlené na desetiny metru. */
export function soupisMostu(navrh: NavrhMostu): SoupisMostu {
  const podleId = new Map(navrh.stycniky.map((s) => [s.id, s]));
  const prvky: SoupisMostu["prvky"] = [];
  let napinaku = 0;
  for (const p of navrh.pruty) {
    const a = podleId.get(p.a);
    const b = podleId.get(p.b);
    const delka = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
    let radek = prvky.find((r) => r.prvek === p.prvek);
    if (!radek) {
      radek = { prvek: p.prvek, prutu: 0, metru: 0 };
      prvky.push(radek);
    }
    radek.prutu += 1;
    radek.metru += delka;
    if (KATALOG[p.prvek].druh === "lano" && (p.predpeti ?? 0) !== 0) napinaku += 1;
  }
  for (const r of prvky) r.metru = Math.round(r.metru * 10) / 10;
  let svaru = 0;
  let zamku = 0;
  let zavazi = 0;
  let tlumicu = 0;
  for (const s of navrh.stycniky) {
    if (s.svar) svaru += 1;
    if (s.zamek) zamku += 1;
    if (s.zavazi) zavazi += 1;
    if (s.tlumic) tlumicu += 1;
  }
  return { prvky, svaru, zamku, zavazi, tlumicu, napinaku, cena: cenaNavrhu(navrh) };
}
