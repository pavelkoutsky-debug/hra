// Rozbor mostu ve stavebním režimu (koncepce, kap. 7.8): má most klidovou polohu a na
// jakých frekvencích kmitá, prázdný i obsazený lidmi. Maticový výpočet bez časové simulace;
// trvá milisekundy, takže se dá pouštět po každé úpravě návrhu.

import type { NavrhMostu } from "../data/navrh";
import type { Uroven } from "../data/uroven";
import { TIHOVE_ZRYCHLENI } from "../jadro/integrator";
import { najdiRovnovahu, vlastniTvarySoustavy } from "../jadro/matice";
import { sestavSoustavu, type PopisSoustavy } from "../jadro/soustava";
import { volneStupne } from "../jadro/stupne";
import { jeClovek } from "./provoz";
import type { RozborMostu } from "./protokol";
import { sestavMost } from "./stavba";
import { hmotnostUcastnika, modelUcastnika } from "./vozidla";

/** Kolik nejnižších vlastních frekvencí rozbor vrací. */
export const POCET_FREKVENCI = 3;

/** Nejnižší vlastní frekvence soustavy podle popisu v Hz; null, když nemá klidovou polohu. */
function frekvence(popis: PopisSoustavy): number[] | null {
  const s = sestavSoustavu(popis);
  const stupne = volneStupne(s);
  if (stupne.length === 0) return [];
  if (najdiRovnovahu(s, stupne, new Float64Array(stupne.length), TIHOVE_ZRYCHLENI) < 0) return null;
  const tvary = vlastniTvarySoustavy(s, stupne, POCET_FREKVENCI);
  if (!tvary) return null;
  return Array.from(tvary.omega, (omega) => omega / (2 * Math.PI)).filter((f) => Number.isFinite(f) && f > 0);
}

/**
 * Hmotnost největší skupiny lidí z jízdního řádu, která se na most vejde najednou, v kg.
 * Skupina delší než most se počítá jen tou částí, která na něm zrovna je.
 */
function hmotnostLidiNaMoste(uroven: Uroven, delkaMostu: number): number {
  let nejvic = 0;
  for (const polozka of uroven.jizdniRad) {
    if (!jeClovek(polozka.druh)) continue;
    const model = modelUcastnika(polozka.druh, polozka.kadence);
    if (!model) continue;
    const lidi = polozka.pocet ?? 1;
    // Útvar jde v řadách přes šířku mostovky; ostatní po jednom za sebou.
    const vRade = polozka.druh === "utvar" ? Math.max(1, Math.floor(uroven.sirkaMostovky / 0.75)) : 1;
    const vejdeSe = (Math.floor(delkaMostu / model.rozestup) + 1) * vRade;
    nejvic = Math.max(nejvic, Math.min(lidi, vejdeSe) * hmotnostUcastnika(model));
  }
  return nejvic;
}

/** Rozbor mostu z návrhu. Vyhodí chybu, když se most nedá sestavit. */
export function rozeberMost(uroven: Uroven, navrh: NavrhMostu): RozborMostu {
  if (navrh.pruty.length === 0) return { stabilni: false, frekvence: [], frekvenceObsazeneho: [] };
  const prazdny = frekvence(sestavMost(uroven, navrh).popis);
  if (prazdny === null) return { stabilni: false, frekvence: [], frekvenceObsazeneho: [] };

  // Obsazený most: hmota lidí rozdělená rovnoměrně do styčníků mostovky.
  const stavba = sestavMost(uroven, navrh);
  const mostovka = new Set(stavba.trasy.flatMap((t) => t.pruty));
  const stycniky = new Set<number>();
  for (const prvek of stavba.popis.prvky) {
    if (prvek.prut !== undefined && mostovka.has(prvek.prut)) {
      stycniky.add(prvek.a);
      stycniky.add(prvek.b);
    }
  }
  const trasa = uroven.trasy[0];
  const lide = trasa ? hmotnostLidiNaMoste(uroven, trasa.konec.x - trasa.zacatek.x) : 0;
  let obsazeny: number[] = [];
  if (lide > 0 && stycniky.size > 0) {
    const naStycnik = lide / stycniky.size;
    for (const i of stycniky) {
      const st = stavba.popis.stycniky[i]!;
      st.hmota = (st.hmota ?? 0) + naStycnik;
    }
    obsazeny = frekvence(stavba.popis) ?? [];
  }
  return { stabilni: true, frekvence: prazdny, frekvenceObsazeneho: obsazeny };
}
