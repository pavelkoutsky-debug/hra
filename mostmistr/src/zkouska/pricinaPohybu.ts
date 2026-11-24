// Proč pohyblivý most neprošel: jedna až dvě příčiny, které jdou hráči říct větou. Čte se
// z návrhu (má křídlo píst? má most zámek?) a z toho, co zkouška změřila (`PohybZkousky`).
// Bez prohlížeče; věty k příčinám skládá obrazovka úrovně.
//
// Zkouška ví, co se stalo (loď narazila, křídlo se překlopilo, zámek nezapadl), ale příčina
// bývá o krok dřív: křídlo bez pístu, most bez zámku, malý zdvih, píst, který křídlo neudržel.
// Bez tohohle rozboru hra u všech říkala „píst nestačí“ a hráč se správným pístem a malým
// zdvihem se dočetl, že píst nemá sílu.

import { KATALOG } from "../data/katalog";
import { zamkyNavrhu, type NavrhMostu } from "../data/navrh";
import type { Uroven } from "../data/uroven";
import { VULE_ZAMKU } from "../jadro/zamky";
import type { PohybZkousky } from "./protokol";

export type PricinaPohybu =
  /** Křídlo se po odemknutí zámku překlopilo, protože do něj nevede žádný píst. */
  | { kod: "kridlo-bez-pistu"; strana: "leve" | "prave" | null }
  /** Křídlo se otočilo o víc než čtvrt kruhu (velký zdvih, nebo ho nic nedrželo). */
  | { kod: "preklopeno" }
  /** Most nemá píst: nezvedl se a loď narazila. */
  | { kod: "bez-pistu" }
  /** Most nemá zámek, který by ho pustil: písty se o něj jen opřely. */
  | { kod: "bez-zamku" }
  /** Písty stály na konci zdvihu a loď se pod křídlo přesto nevešla. */
  | { kod: "maly-zdvih"; kosinus: number }
  /** Písty křídlo zvedly, ale přetlakový ventil povolil a křídlo kleslo lodi do cesty. */
  | { kod: "neudrzel" }
  /** Písty nedojely na konec zdvihu, protože jim nestačila síla (ventil povolil). */
  | { kod: "nezvedl" }
  /** Písty nedojely na konec zdvihu včas, ale ventil nepovolil: zdvih je na ten čas dlouhý. */
  | { kod: "pomaly" }
  /** Po sklopení se konce zámku minuly (m; `svisle` kladně = konec se zámkem visí níž). */
  | { kod: "minuly-se"; svisle: number; vodorovne: number }
  /** Po sklopení se konec mostu nepřestal houpat a zámek ho nechytil. */
  | { kod: "houpe-se" }
  /** Písty po sklopení nedojely zpátky. */
  | { kod: "pisty-zpet" }
  /** Zámek nezapadl a zkouška neví proč (křídlo se utrhlo, zámek nemá protějšek). */
  | { kod: "nezamceno" };

/**
 * Křídlo u zámku mezi křídly, do kterého nevede píst: `leve` nebo `prave` podle toho, na
 * které straně zámku leží; null, když takové není. Křídlo je všechno, k čemu se dojde po
 * prutech bez pístů a bez průchodu zámkem; kotva ho drží, píst s ním hýbe.
 */
function kridloBezPistu(navrh: NavrhMostu, uroven: Uroven): "leve" | "prave" | null {
  const mezi = zamkyNavrhu(navrh, uroven).filter((z) => z.druh === "kridla");
  if (mezi.length === 0) return null;
  const zamky = new Set(mezi.map((z) => z.stycnik));
  const jePist = (prvek: string): boolean => KATALOG[prvek as keyof typeof KATALOG]?.druh === "pist";
  const sousede = new Map<number, number[]>();
  const pridej = (a: number, b: number): void => {
    (sousede.get(a) ?? sousede.set(a, []).get(a)!).push(b);
  };
  for (const p of navrh.pruty) {
    if (jePist(p.prvek)) continue;
    pridej(p.a, p.b);
    pridej(p.b, p.a);
  }
  const sPistem = new Set<number>();
  for (const p of navrh.pruty) {
    if (!jePist(p.prvek)) continue;
    sPistem.add(p.a);
    sPistem.add(p.b);
  }
  const podleId = new Map(navrh.stycniky.map((s) => [s.id, s]));
  for (const zamek of mezi) {
    const misto = podleId.get(zamek.stycnik);
    if (!misto) continue;
    // Každý soused zámku začíná jedno křídlo; projde se bez průchodu zámky.
    const hotove = new Set<number>();
    for (const start of sousede.get(zamek.stycnik) ?? []) {
      if (hotove.has(start) || zamky.has(start)) continue;
      const kridlo = [start];
      hotove.add(start);
      for (let k = 0; k < kridlo.length; k++) {
        for (const j of sousede.get(kridlo[k]!) ?? []) {
          if (hotove.has(j) || zamky.has(j)) continue;
          hotove.add(j);
          kridlo.push(j);
        }
      }
      // Píst smí vést i přímo do styčníku se zámkem; patří pak oběma křídlům a nic neříká.
      if (kridlo.some((i) => sPistem.has(i)) || sPistem.has(zamek.stycnik)) continue;
      let soucet = 0;
      for (const i of kridlo) soucet += podleId.get(i)?.x ?? misto.x;
      return soucet / kridlo.length < misto.x ? "leve" : "prave";
    }
  }
  return null;
}

/**
 * Příčiny, proč pohyblivý most zkouškou neprošel, od nejpodstatnější; prázdné, když zvedání
 * i zamknutí proběhly, jak měly. `narazilo` je počet lodí, které do mostu narazily.
 */
export function pricinyPohybu(navrh: NavrhMostu, uroven: Uroven, pohyb: PohybZkousky, narazilo: number): PricinaPohybu[] {
  const priciny: PricinaPohybu[] = [];
  const maPisty = navrh.pruty.some((p) => KATALOG[p.prvek].druh === "pist");
  if (pohyb.preklopeno) {
    const strana = kridloBezPistu(navrh, uroven);
    if (strana !== null) priciny.push({ kod: "kridlo-bez-pistu", strana });
    else if (!maPisty) priciny.push({ kod: "kridlo-bez-pistu", strana: null });
    else priciny.push({ kod: "preklopeno" });
    return priciny;
  }
  const maZamek = navrh.stycniky.some((s) => s.zamek);
  if (!maPisty) {
    if (narazilo > 0) priciny.push({ kod: "bez-pistu" });
  } else if (!maZamek && !pohyb.zvednuto) {
    priciny.push({ kod: "bez-zamku" });
  } else if (narazilo > 0 && pohyb.pistyPriNarazu === "drzi") {
    priciny.push({ kod: "maly-zdvih", kosinus: pohyb.kosinusOtoceni });
  } else if (narazilo > 0 && pohyb.pistyPriNarazu === "klesl") {
    priciny.push({ kod: "neudrzel" });
  } else if (!pohyb.zvednuto || pohyb.pistyPriNarazu === "zveda") {
    priciny.push({ kod: pohyb.pretizenychPistu > 0 ? "nezvedl" : "pomaly" });
  }
  if (!pohyb.zamceno) {
    const proc = pohyb.nezamceno;
    if (proc === null) priciny.push({ kod: "nezamceno" });
    else if (!proc.pistyVCili) priciny.push({ kod: "pisty-zpet" });
    else if (proc.vodorovne * proc.vodorovne + proc.svisle * proc.svisle > VULE_ZAMKU * VULE_ZAMKU) {
      priciny.push({ kod: "minuly-se", svisle: proc.svisle, vodorovne: proc.vodorovne });
    } else priciny.push({ kod: "houpe-se" });
  }
  return priciny;
}
