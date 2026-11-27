// Kde si most při zkoušce lehl na zem. Zkouška říká jen, že se most o terén opřel
// (`VysledekZkousky.opreno`); hráč ale potřebuje vědět kde, aby věděl, co změnit. Nováček
// v první úrovni nejčastěji postaví podpěru dolů do údolí, kde nemá kotvu: její pata na zemi
// most „drží“, jenže o zem se most opírat nesmí. Tady se ze záznamu zkoušky najde styčník
// návrhu, který ležel na terénu nejdéle. Jen čte záznam: hodnocení zkoušky to nemění. Bez prohlížeče.

import type { Bod } from "../data/geometrie";
import { KATALOG } from "../data/katalog";
import type { NavrhMostu } from "../data/navrh";
import type { Uroven } from "../data/uroven";
import { vytvorTeren, vyskaTerenuV } from "../jadro/teren";
import { prazdnySnimek, type Zaznam } from "./zaznam";

/** Jak blízko nad povrchem terénu se styčník počítá za položený (m). */
const DOTYK = 0.05;

export interface Opreni {
  /** Pořadí styčníku v návrhu. */
  stycnik: number;
  /** Jeho poloha na výkresu (m). */
  misto: Bod;
  /**
   * Leží na zemi pata podpěry (styčník bez mostovky, třeba konec prutu svedeného do údolí),
   * ne mostovka sama.
   */
  noha: boolean;
}

/**
 * Styčník návrhu, který při zkoušce ležel na terénu nejdéle (do první změny stavby: po porušení
 * nebo sjetí z podpory se čísla styčníků ve stavbě mění). Podpory a základy se nepočítají: na
 * nich most stát má. Null, když se žádný styčník terénu nedotkl.
 */
export function najdiOpreni(uroven: Uroven, navrh: NavrhMostu, zaznam: Zaznam): Opreni | null {
  const { snimky } = zaznam;
  const stavba = zaznam.topologie[0];
  if (snimky.length === 0 || !stavba || uroven.teren.length < 2) return null;
  const teren = vytvorTeren(uroven.teren);
  const stycniku = Math.min(navrh.stycniky.length, stavba.stycniku);
  const naPodpore = (x: number, y: number): boolean => uroven.kotvy.some((k) => k.x === x && k.y === y) || uroven.zaklady.some((z) => z.x === x && z.y === y);
  const dotyku = new Array<number>(stycniku).fill(0);
  const snimek = prazdnySnimek();
  const prvni = snimky[0]!.topologie;
  for (const s of snimky) {
    if (s.topologie !== prvni) break;
    zaznam.stavV(s.cas, snimek);
    for (let i = 0; i < stycniku; i++) {
      const st = navrh.stycniky[i]!;
      if (naPodpore(st.x, st.y)) continue;
      const x = snimek.polohy[2 * i]!;
      const y = snimek.polohy[2 * i + 1]!;
      if (y <= vyskaTerenuV(teren, x) + DOTYK) dotyku[i]! += 1;
    }
  }
  let ktery = -1;
  for (let i = 0; i < stycniku; i++) if (dotyku[i]! > 0 && (ktery < 0 || dotyku[i]! > dotyku[ktery]!)) ktery = i;
  if (ktery < 0) return null;
  const st = navrh.stycniky[ktery]!;
  const noha = !navrh.pruty.some((p) => (p.a === st.id || p.b === st.id) && KATALOG[p.prvek].druh === "mostovka");
  return { stycnik: ktery, misto: { x: st.x, y: st.y }, noha };
}
