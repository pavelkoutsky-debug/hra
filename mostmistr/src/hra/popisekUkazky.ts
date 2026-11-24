// Popisek pod mostem ukázky v okně se zadáním: co si z ukázky má hráč odnést. Během děje
// největší dosavadní kmitání (ne okamžité: to se mění tak rychle, že podle chvíle, kdy hráč
// čte, vypadají oba mosty stejně), po doběhnutí výsledek. Bez prohlížeče, aby šel zkoušet.

import type { Uroven } from "../data/uroven";
import { cislo } from "../ui/formaty";
import { t } from "../ui/slovnik";
import { lideNaMosteVeSnimku, type PopisUcastnika } from "../zkouska/provoz";
import type { Udalost, VysledekZkousky } from "../zkouska/protokol";
import type { Snimek } from "../zkouska/zaznam";

/**
 * Ukazuje ukázka téhle úrovně kmitání? Jen tam, kde přes most jdou lidé a kmitání se hodnotí
 * přísněji než obecnou mezí (medaile za klidný most nebo přísnější třída): v první kapitole
 * je lekce o pevnosti a číslo kmitání pod mostem, který se láme, by vedlo jinam.
 */
export function ukazkaMeriKmitani(uroven: Pick<Uroven, "mistrovska" | "nejhorsiKomfort">, vysledek: Pick<VysledekZkousky, "komfort">): boolean {
  return vysledek.komfort !== null && (uroven.mistrovska?.druh === "komfort-chodcu" || uroven.nejhorsiKomfort < 3);
}

/**
 * Největší dosavadní kmitání ke každému snímku záznamu, počítané jako ve zkoušce: jen ze
 * snímků, kdy po mostě jdou lidé (mostovku rozhoupanou dodávkou hodnocení nepočítá).
 */
export function nejvicDosud(
  uroven: Pick<Uroven, "trasy" | "jizdniRad">,
  ucastnici: readonly PopisUcastnika[],
  snimky: readonly Snimek[],
): Float64Array {
  const vysledek = new Float64Array(snimky.length);
  let nejvic = 0;
  snimky.forEach((s, i) => {
    if (s.kmitani > nejvic && lideNaMosteVeSnimku(uroven, ucastnici, s.provoz, s.polohy)) nejvic = s.kmitani;
    vysledek[i] = nejvic;
  });
  return vysledek;
}

/** Most, který se zřítil: někdo z něj spadl, nebo se rozpadl. Kolik kmital, pak nikoho nezajímá. */
function spadl(v: Pick<VysledekZkousky, "pruchod" | "spadlo" | "rozpad">): boolean {
  return !v.pruchod && (v.spadlo > 0 || v.rozpad);
}

/**
 * Popisek po doběhnutí ukázky: verdikt a k němu to, o čem ukázka je (spadl, kmitání nejvýš,
 * pohodlí cestujících).
 */
export function popisekKonceUkazky(uroven: Uroven, vysledek: VysledekZkousky): string {
  const verdikt = t(vysledek.pruchod ? "ukazka.obstal" : "ukazka.neobstal");
  // Kde úroveň hodnotí pohodlí cestujících, říká ukázka, jak se jim jelo.
  const cestujici = uroven.mistrovska?.druh === "komfort-cestujicich" ? vysledek.komfortCestujicich : null;
  let podrobnost = "";
  if (spadl(vysledek)) podrobnost = t("ukazka.spadl");
  else if (!vysledek.pruchod && vysledek.poruseni > 0 && !ukazkaMeriKmitani(uroven, vysledek)) podrobnost = t("ukazka.povolilo");
  else if (ukazkaMeriKmitani(uroven, vysledek) && vysledek.komfort)
    podrobnost = t(vysledek.pruchod ? "ukazka.nejvic" : "ukazka.nejvic.neobstal", { zrychleni: cislo(vysledek.komfort.zrychleni, 1) });
  else if (cestujici && cestujici.zrychleni > 0) podrobnost = t("ukazka.cestujici", { zrychleni: cislo(cestujici.zrychleni, 1) });
  return podrobnost ? `${verdikt}: ${podrobnost}` : verdikt;
}

/**
 * Popisek během děje v čase `cas`: u ukázky o kmitání největší dosavadní hodnota, jakmile něco
 * povolí, jen to (číslo kmitání padajícího mostu nic neříká); jinak nic.
 */
export function popisekBehuUkazky(uroven: Uroven, vysledek: VysledekZkousky, udalosti: readonly Udalost[], cas: number, dosud: number): string {
  const povolilo = udalosti.some((u) => (u.druh === "poruseni" || u.druh === "sjeti") && u.cas <= cas);
  if (povolilo) return t("ukazka.povolilo");
  return ukazkaMeriKmitani(uroven, vysledek) ? t("ukazka.kmitani", { zrychleni: cislo(dosud, 1) }) : "";
}
