// Vedený první krok (první úroveň kampaně): kterým dílem mostovky má nový hráč začít. Hra mu
// ho ukáže jako ducha prutu s pokynem „táhni odsud sem“; jakmile mostovka vede od břehu
// k břehu, vedení končí a dál radí kontrola stability a nápověda.

import { KATALOG, type IdPrvku } from "./katalog";
import type { Bod } from "./geometrie";
import { mezeryTras, type NavrhMostu } from "./navrh";
import type { Uroven } from "./uroven";

export interface KrokVedeni {
  od: Bod;
  po: Bod;
  /** Prvek mostovky, kterým se díl kreslí. */
  prvek: IdPrvku;
  /** Most ještě žádný díl mostovky nemá: první tah hráče vůbec. */
  prvni: boolean;
}

/**
 * Další díl mostovky, který v návrhu chybí: od začátku první mezery na trase, nejdelší, jaký
 * prvek dovolí, a v celých metrech (styčníky leží na rastru). Null, když mostovka vede po
 * celé trase nebo úroveň mostovku pro trasu nedovoluje. Počítá s vodorovnou trasou.
 */
export function dalsiDilMostovky(navrh: NavrhMostu, uroven: Uroven): KrokVedeni | null {
  const mezera = mezeryTras(navrh, uroven)[0];
  if (!mezera || mezera.trasa.zacatek.y !== mezera.trasa.konec.y) return null;
  const kolej = mezera.trasa.druh === "kolej";
  const prvek = uroven.povolenePrvky.find((p) => KATALOG[p].druh === "mostovka" && KATALOG[p].hotovo && (p === "kolejiste") === kolej);
  if (!prvek) return null;
  const delka = Math.floor(Math.min(KATALOG[prvek].nejvetsiDelka, mezera.do - mezera.od) + 1e-9);
  if (delka < 1) return null;
  const y = mezera.trasa.zacatek.y;
  return {
    od: { x: mezera.od, y },
    po: { x: mezera.od + delka, y },
    prvek,
    prvni: !navrh.pruty.some((p) => KATALOG[p.prvek].druh === "mostovka"),
  };
}
