// Proč pohyblivý most neprošel: jedna až dvě příčiny, které jdou hráči říct větou. Čte se
// z návrhu (má křídlo píst? má most zámek?) a z toho, co zkouška změřila (`PohybZkousky`).
// Bez prohlížeče; věty k příčinám skládá obrazovka úrovně.
//
// Zkouška ví, co se stalo (loď narazila, křídlo se překlopilo, zámek nezapadl), ale příčina
// bývá o krok dřív: křídlo bez pístu, most bez zámku, malý zdvih, píst, který křídlo neudržel.
// Bez tohohle rozboru hra u všech říkala „píst nestačí“ a hráč se správným pístem a malým
// zdvihem se dočetl, že píst nemá sílu.

import { KATALOG, zdvihPistu } from "../data/katalog";
import { otoceniKridla, zamkyNavrhu, type NavrhMostu } from "../data/navrh";
import type { Uroven } from "../data/uroven";
import { VULE_ZAMKU } from "../jadro/zamky";
import type { PohybZkousky } from "./protokol";

export type PricinaPohybu =
  /** Křídlo se po odemknutí zámku překlopilo nebo spadlo, protože do něj nevede žádný píst. */
  | { kod: "kridlo-bez-pistu"; strana: "leve" | "prave" | null }
  /** Křídlo se otočilo o víc než čtvrt kruhu (velký zdvih, nebo ho nic nedrželo). */
  | { kod: "preklopeno" }
  /** Konec křídla se sklopil v nesvařeném styčníku mostovky; kořen křídla se zvedal, jak měl. */
  | { kod: "zalomeno" }
  /** Most nemá píst: nezvedl se a loď narazila. */
  | { kod: "bez-pistu" }
  /** Most nemá zámek, který by ho pustil: písty se o něj jen opřely. */
  | { kod: "bez-zamku" }
  /** Píst má zdvih s opačným znaménkem: konec křídla táhne dolů. */
  | { kod: "tahne-dolu" }
  /**
   * Písty stály na konci zdvihu a loď se pod křídlo přesto nevešla. `kosinus` je otočení křídla,
   * do kterého loď narazila; `strana` říká které, když má most křídla dvě.
   */
  | { kod: "maly-zdvih"; kosinus: number; strana: "leve" | "prave" | null }
  /** Písty vyjely celé, ale křídlo se skoro nehnulo: píst se opírá o něco, co uhne. */
  | { kod: "nehnulo-se" }
  /** Písty křídlo zvedly, ale přetlakový ventil povolil a křídlo kleslo lodi do cesty. */
  | { kod: "neudrzel" }
  /** Písty nedojely na konec zdvihu, protože jim nestačila síla (ventil povolil). */
  | { kod: "nezvedl" }
  /** Písty nedojely na konec zdvihu včas, ale ventil nepovolil: zdvih je na ten čas dlouhý. */
  | { kod: "pomaly" }
  /**
   * Most se porušil dřív, než se rozhodlo o zvednutí nebo o zamknutí: co zkouška změřila potom,
   * je následek. Příčina je první porušení, ne píst ani zámek.
   */
  | { kod: "poruseno" }
  /** Po sklopení se konce zámku minuly (m; `svisle` kladně = konec se zámkem visí níž). */
  | { kod: "minuly-se"; svisle: number; vodorovne: number }
  /** Po sklopení se konec mostu nepřestal houpat a zámek ho nechytil. */
  | { kod: "houpe-se" }
  /** Písty po sklopení nedojely zpátky. */
  | { kod: "pisty-zpet" }
  /** Zámek nezapadl a zkouška neví proč (křídlo se utrhlo, zámek nemá protějšek). */
  | { kod: "nezamceno" };

/** Křídlo, které se po odemknutí pohne o víc než tohle (asi 10°), spadlo; průhyb to není. */
const KOSINUS_POHNUTI = 0.985;
/** Křídlo, které se zvedlo o míň než tohle (3°), se skoro nehnulo. */
const KOSINUS_NEHNUTI = 0.99863;
/** Zdvih, se kterým se křídlo pohnout má (m): kratší je prostě malý zdvih. */
const ZDVIH_K_POHNUTI = 0.5;
/**
 * Zalomené křídlo: jeden díl mostovky se překlopil a jiný díl téhož křídla se otočil o míň než
 * asi 78°. Křídlo, které se překlopí celé, má všechny díly otočené skoro o čtvrt kruhu.
 */
const KOSINUS_ZALOMENI = 0.2;

/** Část mostu, která se hýbe jako celek: pruty spojené bez pístů a bez průchodu zámkem mezi křídly. */
interface Kridlo {
  /** Indexy prutů návrhu. */
  pruty: number[];
  /** Vede do křídla (nebo do zámku na jeho konci) píst? */
  maPist: boolean;
  /** Na které straně zámku mezi křídly leží; null u části, která u takového zámku nekončí. */
  strana: "leve" | "prave" | null;
}

/**
 * Rozdělí most na křídla: všechno, k čemu se dojde po prutech bez pístů a bez průchodu zámkem
 * mezi křídly. Kotva křídlo drží, píst s ním hýbe. Most se zámkem na opěře je jedno křídlo.
 */
function kridlaMostu(navrh: NavrhMostu, uroven: Uroven): Kridlo[] {
  const zamky = new Set(
    zamkyNavrhu(navrh, uroven)
      .filter((z) => z.druh === "kridla")
      .map((z) => z.stycnik),
  );
  const sousede = new Map<number, { kam: number; prut: number }[]>();
  const pridej = (a: number, b: number, prut: number): void => {
    (sousede.get(a) ?? sousede.set(a, []).get(a)!).push({ kam: b, prut });
  };
  const sPistem = new Set<number>();
  navrh.pruty.forEach((p, i) => {
    if (KATALOG[p.prvek].druh === "pist") {
      sPistem.add(p.a);
      sPistem.add(p.b);
      return;
    }
    pridej(p.a, p.b, i);
    pridej(p.b, p.a, i);
  });
  const podleId = new Map(navrh.stycniky.map((s) => [s.id, s]));
  const kridla: Kridlo[] = [];
  const hotove = new Set<number>();
  for (const prvni of navrh.stycniky) {
    if (zamky.has(prvni.id) || hotove.has(prvni.id) || !sousede.has(prvni.id)) continue;
    const uzly = [prvni.id];
    hotove.add(prvni.id);
    const pruty = new Set<number>();
    let zamek: number | null = null;
    // Píst smí vést i přímo do styčníku se zámkem; patří pak oběma křídlům.
    let maPist = false;
    for (let k = 0; k < uzly.length; k++) {
      if (sPistem.has(uzly[k]!)) maPist = true;
      for (const { kam, prut } of sousede.get(uzly[k]!) ?? []) {
        pruty.add(prut);
        if (zamky.has(kam)) {
          zamek ??= kam;
          if (sPistem.has(kam)) maPist = true;
        } else if (!hotove.has(kam)) {
          hotove.add(kam);
          uzly.push(kam);
        }
      }
    }
    let strana: Kridlo["strana"] = null;
    const misto = zamek === null ? undefined : podleId.get(zamek);
    if (misto) {
      let soucet = 0;
      for (const i of uzly) soucet += podleId.get(i)?.x ?? misto.x;
      strana = soucet / uzly.length < misto.x ? "leve" : "prave";
    }
    kridla.push({ pruty: [...pruty], maPist, strana });
  }
  return kridla;
}

/**
 * Příčiny, proč pohyblivý most zkouškou neprošel, od nejpodstatnější; prázdné, když zvedání
 * i zamknutí proběhly, jak měly. `narazilo` je počet lodí, které do mostu narazily.
 */
export function pricinyPohybu(navrh: NavrhMostu, uroven: Uroven, pohyb: PohybZkousky, narazilo: number): PricinaPohybu[] {
  const priciny: PricinaPohybu[] = [];
  const pisty = navrh.pruty.filter((p) => KATALOG[p.prvek].druh === "pist");
  const maPisty = pisty.length > 0;
  const kridla = kridlaMostu(navrh, uroven);
  const jeMostovka = (prut: number): boolean => {
    const p = navrh.pruty[prut];
    return p !== undefined && KATALOG[p.prvek].druh === "mostovka";
  };
  /** Největší otočení mostovky křídla (nejmenší kosinus); 1, když křídlo mostovku nemá. */
  const otoceni = (kridlo: Kridlo): number => {
    let nejmensi = 1;
    for (const i of kridlo.pruty) {
      const kosinus = pohyb.kosinusPrutu[i] ?? 1;
      if (kosinus < nejmensi) nejmensi = kosinus;
    }
    return nejmensi;
  };
  /** Překlopil se jen kus křídla, zatímco jiný díl jeho mostovky se zvedal, jak měl? */
  const zalomene = (kridlo: Kridlo): boolean => kridlo.pruty.some((i) => jeMostovka(i) && (pohyb.kosinusPrutu[i] ?? 1) > KOSINUS_ZALOMENI);

  if (pohyb.preklopeno) {
    // Které křídlo se překlopilo, říká měření; bez něj to, které nemá píst.
    const preklopene = kridla.find((k) => otoceni(k) <= 0) ?? kridla.find((k) => !k.maPist && k.strana !== null) ?? null;
    if (!maPisty) priciny.push({ kod: "kridlo-bez-pistu", strana: null });
    else if (preklopene !== null && !preklopene.maPist && preklopene.strana !== null) priciny.push({ kod: "kridlo-bez-pistu", strana: preklopene.strana });
    else if (preklopene !== null && zalomene(preklopene)) priciny.push({ kod: "zalomeno" });
    else priciny.push({ kod: "preklopeno" });
    return priciny;
  }
  // Křídlo bez pístu, které po odemknutí spadlo, i když se neotočilo o celý čtvrt kruhu.
  const spadle = kridla.find((k) => !k.maPist && otoceni(k) < KOSINUS_POHNUTI);
  if (spadle) {
    priciny.push({ kod: "kridlo-bez-pistu", strana: maPisty ? spadle.strana : null });
    return priciny;
  }

  // O kolik má který píst křídlo otočit a jestli ho zvedá (kde to z výkresu jde poznat).
  const podleId = new Map(navrh.stycniky.map((s) => [s.id, s]));
  let nejvetsiZdvih = 0;
  for (const p of pisty) {
    const a = podleId.get(p.a);
    const b = podleId.get(p.b);
    if (!a || !b) continue;
    const zdvih = zdvihPistu(p.zdvih, Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)));
    nejvetsiZdvih = Math.max(nejvetsiZdvih, zdvih < 0 ? -zdvih : zdvih);
  }
  const kinematika = pisty.map((p) => otoceniKridla(navrh, uroven, p)).filter((o) => o !== null);
  const smery = kinematika.filter((o) => o.zveda !== null);
  const tahneDolu = smery.length > 0 && smery.every((o) => o.zveda === false);
  /** Křídlo se skoro nehnulo, i když se podle zdvihu pohnout mělo. */
  const nehnuloSe = (kosinus: number): boolean => {
    if (kosinus <= KOSINUS_NEHNUTI || nejvetsiZdvih < ZDVIH_K_POHNUTI) return false;
    if (kinematika.length === 0) return true;
    // Kde jde spočítat, o kolik měl píst křídlo otočit: zvedlo se aspoň o třetinu toho úhlu?
    // (Pro malé úhly je 1 − cos úměrné druhé mocnině úhlu.)
    let cekany = 1;
    for (const o of kinematika) cekany = Math.min(cekany, o.cos);
    return (1 - kosinus) * 9 < 1 - cekany;
  };

  const maZamek = navrh.stycniky.some((s) => s.zamek);
  const narazenyPist = pohyb.narazenyPrut !== null && navrh.pruty[pohyb.narazenyPrut] !== undefined && KATALOG[navrh.pruty[pohyb.narazenyPrut]!.prvek].druh === "pist";
  let zvedani: PricinaPohybu | null = null;
  /** Příčina je vidět už na výkresu; měření po porušení ji nezpochybní. */
  let zVykresu = false;
  if (!maPisty) {
    if (narazilo > 0) zvedani = { kod: "bez-pistu" };
    zVykresu = true;
  } else if (!maZamek && !pohyb.zvednuto) {
    zvedani = { kod: "bez-zamku" };
    zVykresu = true;
  } else if (tahneDolu && (narazilo > 0 || !pohyb.zvednuto)) {
    zvedani = { kod: "tahne-dolu" };
    zVykresu = true;
  } else if (narazilo > 0 && pohyb.pistyPriNarazu === "drzi") {
    // Loď, která narazila do pístu, o výšce křídla nic neříká; větu o ní výsledek má.
    if (!narazenyPist) {
      const narazene = pohyb.narazenyPrut === null ? undefined : kridla.find((k) => k.pruty.includes(pohyb.narazenyPrut!) && k.pruty.some(jeMostovka));
      const kosinus = narazene ? otoceni(narazene) : pohyb.kosinusOtoceni;
      zvedani = nehnuloSe(kosinus) ? { kod: "nehnulo-se" } : { kod: "maly-zdvih", kosinus, strana: narazene?.strana ?? null };
    }
  } else if (narazilo > 0 && pohyb.pistyPriNarazu === "klesl") {
    zvedani = { kod: "neudrzel" };
  } else if (!pohyb.zvednuto || pohyb.pistyPriNarazu === "zveda") {
    zvedani = { kod: pohyb.pretizenychPistu > 0 ? "nezvedl" : "pomaly" };
  }
  // Most, který se porušil dřív, než se o zvednutí rozhodlo, nezvedl proto, že se porušil.
  if (zvedani !== null && !zVykresu && pohyb.poruseno === "zvedani") zvedani = { kod: "poruseno" };
  if (zvedani !== null) priciny.push(zvedani);
  if (!pohyb.zamceno) {
    const proc = pohyb.nezamceno;
    if (pohyb.poruseno !== null) {
      // Porušený most se nezamkl proto, že se porušil; řekne se to jen jednou.
      if (zvedani?.kod !== "poruseno") priciny.push({ kod: "poruseno" });
    } else if (proc === null) priciny.push({ kod: "nezamceno" });
    else if (!proc.pistyVCili) priciny.push({ kod: "pisty-zpet" });
    else if (proc.vodorovne * proc.vodorovne + proc.svisle * proc.svisle > VULE_ZAMKU * VULE_ZAMKU) {
      priciny.push({ kod: "minuly-se", svisle: proc.svisle, vodorovne: proc.vodorovne });
    } else priciny.push({ kod: "houpe-se" });
  }
  return priciny;
}
