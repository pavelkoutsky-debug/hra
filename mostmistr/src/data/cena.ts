// Cena a hmotnost návrhu mostu. Ceny žijí jen v katalogu; uložené mosty je neobsahují,
// takže přecenění prvku změní cenu všech mostů najednou.

import { CENA_SVARU, CENA_ZAVAZI, KATALOG, vlastnostiPrutu } from "./katalog";
import type { NavrhMostu } from "./navrh";
import type { Uroven } from "./uroven";

function delkyPrutu(navrh: NavrhMostu): number[] {
  const podleId = new Map(navrh.stycniky.map((s) => [s.id, s]));
  return navrh.pruty.map((p) => {
    const a = podleId.get(p.a);
    const b = podleId.get(p.b);
    return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
  });
}

/** Cena jednoho prutu dané délky v korunách. */
export function cenaPrutu(prvek: keyof typeof KATALOG, delka: number): number {
  const cena = KATALOG[prvek].cena;
  return "zaMetr" in cena ? cena.zaMetr * delka : cena.zaKus;
}

/** Cena celého návrhu v korunách, zaokrouhlená na celé koruny: pruty, svary a závaží. */
export function cenaNavrhu(navrh: NavrhMostu): number {
  const delky = delkyPrutu(navrh);
  let cena = 0;
  navrh.pruty.forEach((p, i) => {
    cena += cenaPrutu(p.prvek, delky[i]!);
  });
  for (const s of navrh.stycniky) {
    if (s.svar) cena += CENA_SVARU * navrh.pruty.filter((p) => p.a === s.id || p.b === s.id).length;
    if (s.zavazi) cena += CENA_ZAVAZI * s.zavazi;
  }
  return Math.round(cena);
}

/** Hmotnost návrhu v kilogramech včetně vybavení mostovky a závaží. */
export function hmotnostNavrhu(navrh: NavrhMostu, uroven: Uroven): number {
  const delky = delkyPrutu(navrh);
  let hmotnost = 0;
  navrh.pruty.forEach((p, i) => {
    const vlastnosti = vlastnostiPrutu(p.prvek, uroven.sirkaMostovky);
    if (!vlastnosti) return; // tlumič, pružina a píst se do hmotnosti mostu nepočítají
    const vybaveni = KATALOG[p.prvek].druh === "mostovka" ? uroven.hmotnostVybaveni : 0;
    hmotnost += delky[i]! * (vlastnosti.hmotnostNaMetr + vybaveni);
  });
  for (const s of navrh.stycniky) hmotnost += s.zavazi ?? 0;
  return hmotnost;
}
