// Cena a hmotnost návrhu mostu. Ceny žijí jen v katalogu; uložené mosty je neobsahují,
// takže přecenění prvku změní cenu všech mostů najednou.

import { CENA_SVARU, CENA_ZAVAZI, KATALOG, LADENY_TLUMIC, neseVybaveni, PIST, vlastnostiPrutu, ZAMEK } from "./katalog";
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

/** Cena laděného tlumiče se závažím dané hmotnosti, v korunách. */
export function cenaLadenehoTlumice(hmota: number): number {
  return LADENY_TLUMIC.cenaZaKus + LADENY_TLUMIC.cenaZaKg * hmota;
}

/** Cena celého návrhu v korunách, zaokrouhlená na celé koruny: pruty, svary, zámky, závaží a laděné tlumiče. */
export function cenaNavrhu(navrh: NavrhMostu): number {
  const delky = delkyPrutu(navrh);
  let cena = 0;
  navrh.pruty.forEach((p, i) => {
    cena += cenaPrutu(p.prvek, delky[i]!);
  });
  for (const s of navrh.stycniky) {
    if (s.svar) cena += CENA_SVARU * navrh.pruty.filter((p) => p.a === s.id || p.b === s.id).length;
    if (s.zamek) cena += ZAMEK.cena;
    if (s.zavazi) cena += CENA_ZAVAZI * s.zavazi;
    if (s.tlumic) cena += cenaLadenehoTlumice(s.tlumic.hmota);
  }
  return Math.round(cena);
}

/** Hmotnost návrhu v kilogramech včetně vybavení mostovky a závaží. */
export function hmotnostNavrhu(navrh: NavrhMostu, uroven: Uroven): number {
  const delky = delkyPrutu(navrh);
  let hmotnost = 0;
  navrh.pruty.forEach((p, i) => {
    // Píst váží jako ve zkoušce; bez něj by nosná konstrukce zvedacího mostu vážila nulu.
    if (KATALOG[p.prvek].druh === "pist") hmotnost += delky[i]! * PIST.hmotnostNaMetr;
    const vlastnosti = vlastnostiPrutu(p.prvek, uroven.sirkaMostovky);
    if (!vlastnosti) return; // tlumič a pružina se do hmotnosti mostu nepočítají
    const vybaveni = neseVybaveni(p.prvek) ? uroven.hmotnostVybaveni : 0;
    hmotnost += delky[i]! * (vlastnosti.hmotnostNaMetr + vybaveni);
  });
  for (const s of navrh.stycniky) hmotnost += (s.zavazi ?? 0) + (s.tlumic?.hmota ?? 0);
  return hmotnost;
}

/** Cena samotné mostovky návrhu v korunách: část ceny, kterou hráč úsporným mostem neovlivní. */
export function cenaMostovky(navrh: NavrhMostu): number {
  const delky = delkyPrutu(navrh);
  let cena = 0;
  navrh.pruty.forEach((p, i) => {
    if (KATALOG[p.prvek].druh === "mostovka") cena += cenaPrutu(p.prvek, delky[i]!);
  });
  return Math.round(cena);
}

/** Hmotnost samotné mostovky návrhu včetně vybavení, kg. */
export function hmotnostMostovky(navrh: NavrhMostu, uroven: Uroven): number {
  const delky = delkyPrutu(navrh);
  let hmotnost = 0;
  navrh.pruty.forEach((p, i) => {
    if (KATALOG[p.prvek].druh !== "mostovka") return;
    const vlastnosti = vlastnostiPrutu(p.prvek, uroven.sirkaMostovky);
    if (!vlastnosti) return;
    const vybaveni = neseVybaveni(p.prvek) ? uroven.hmotnostVybaveni : 0;
    hmotnost += delky[i]! * (vlastnosti.hmotnostNaMetr + vybaveni);
  });
  return hmotnost;
}
