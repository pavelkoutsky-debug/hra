// Souhrn deníku hraní: z dávek událostí spočítá, jak se která úroveň hraje. Slouží stránce
// správce (denní přehled) a ladění obtížnosti: kolik hráčů úroveň otevřelo, kolik ji prošlo,
// na kolikátý pokus, za jak dlouho a na čem mosty nejčastěji padají.
//
// Čistá funkce bez prohlížeče i serveru; události čte opatrně, protože deník starší verze hry
// může mít jiná data.

import type { DavkaDeniku, HodnotaDeniku, UdalostDeniku } from "./udalosti";

export interface SouhrnUrovne {
  uroven: string;
  /** Kolik různých hráčů úroveň otevřelo a kolikrát celkem. */
  hracu: number;
  otevreni: number;
  /** Zkoušky s provozem (pokusy s brnknutím a budičem se nepočítají) a kolik jich prošlo. */
  zkousek: number;
  pruchodu: number;
  /** Hráči, kterým aspoň jedna zkouška prošla, a hráči, kteří úroveň otevřeli a nic nezkusili. */
  hracuSPruchodem: number;
  hracuBezZkousky: number;
  /** Medián počtu zkoušek do prvního průchodu a minut strávených v úrovni do něj; null bez průchodu. */
  zkousekDoPruchodu: number | null;
  minutDoPruchodu: number | null;
  /** Kolik hráčů získalo kterou medaili. */
  medaile: { pruchod: number; rozpocet: number; mistrovska: number };
  /** Na čem mosty padaly: „prvek/způsob“ prvního porušení a kolikrát; „bez porušení“, když se nic nezlomilo. */
  selhani: Record<string, number>;
}

export interface SouhrnDeniku {
  hracu: number;
  sezeni: number;
  /** Hráči, kteří přišli poprvé, a hráči na dotykovém zařízení. */
  novych: number;
  dotykovych: number;
  udalosti: number;
  /** Chyby hlášené prohlížečem a odeslané zpětné vazby. */
  chyb: number;
  vazeb: number;
  /** Nejčastější chyby: text a počet, nejvýš deset. */
  chyby: { zprava: string; pocet: number }[];
  urovne: SouhrnUrovne[];
}

function median(hodnoty: number[]): number | null {
  if (hodnoty.length === 0) return null;
  const serazene = [...hodnoty].sort((a, b) => a - b);
  const stred = serazene.length >> 1;
  return serazene.length % 2 === 1 ? serazene[stred]! : (serazene[stred - 1]! + serazene[stred]!) / 2;
}

const cisloZ = (h: HodnotaDeniku | undefined): number => (typeof h === "number" ? h : 0);
const anoZ = (h: HodnotaDeniku | undefined): boolean => h === true;
const textZ = (h: HodnotaDeniku | undefined): string | null => (typeof h === "string" ? h : null);

/** Co se o jednom hráči v jedné úrovni ví. */
interface HracVUrovni {
  otevreni: number;
  zkousek: number;
  pruchodu: number;
  /** Zkoušek a sekund do prvního průchodu; null, dokud žádný není. */
  zkousekDoPruchodu: number | null;
  sekundDoPruchodu: number | null;
  /** Sekundy z dřívějších návštěv úrovně (z událostí o jejím opuštění). */
  sekundDriv: number;
  medaile: { pruchod: boolean; rozpocet: boolean; mistrovska: boolean };
}

/**
 * Souhrn z dávek deníku. Dávky nemusejí být seřazené; řadí se podle hráče, sezení a pořadí.
 * Sezení téhož hráče se řadí podle abecedy jejich čísel, což nemusí být podle času: na počty
 * to vliv nemá, čas do průchodu je proto jen přibližný u hráčů s více sezeními za den.
 */
export function souhrnDeniku(davky: readonly DavkaDeniku[]): SouhrnDeniku {
  const serazene = [...davky].sort(
    (a, b) =>
      a.hlavicka.hrac.localeCompare(b.hlavicka.hrac) ||
      a.hlavicka.sezeni.localeCompare(b.hlavicka.sezeni) ||
      a.poradi - b.poradi,
  );
  const hraci = new Set<string>();
  const sezeni = new Set<string>();
  const novi = new Set<string>();
  const dotykovi = new Set<string>();
  const chyby = new Map<string, number>();
  let udalosti = 0;
  let chyb = 0;
  let vazeb = 0;
  /** úroveň → hráč → co se o něm ví */
  const urovne = new Map<string, Map<string, HracVUrovni>>();
  const selhani = new Map<string, Map<string, number>>();

  const hracVUrovni = (uroven: string, hrac: string): HracVUrovni => {
    let hraciUrovne = urovne.get(uroven);
    if (!hraciUrovne) {
      hraciUrovne = new Map();
      urovne.set(uroven, hraciUrovne);
    }
    let zaznam = hraciUrovne.get(hrac);
    if (!zaznam) {
      zaznam = {
        otevreni: 0,
        zkousek: 0,
        pruchodu: 0,
        zkousekDoPruchodu: null,
        sekundDoPruchodu: null,
        sekundDriv: 0,
        medaile: { pruchod: false, rozpocet: false, mistrovska: false },
      };
      hraciUrovne.set(hrac, zaznam);
    }
    return zaznam;
  };

  const zpracuj = (hrac: string, u: UdalostDeniku): void => {
    udalosti += 1;
    const data = u.data ?? {};
    if (u.druh === "sezeni.start" && !anoZ(data.navrat)) novi.add(hrac);
    if (u.druh === "chyba") {
      chyb += 1;
      const zprava = textZ(data.zprava) ?? "neznámá chyba";
      chyby.set(zprava, (chyby.get(zprava) ?? 0) + 1);
    }
    if (u.druh === "vazba.odeslana") vazeb += 1;
    if (u.uroven === undefined) return;
    const zaznam = hracVUrovni(u.uroven, hrac);
    if (u.druh === "uroven.otevrena") zaznam.otevreni += 1;
    else if (u.druh === "uroven.opustena") zaznam.sekundDriv += cisloZ(data.sekund);
    else if (u.druh === "zkouska.konec" && (data.pokus === null || data.pokus === undefined)) {
      zaznam.zkousek += 1;
      if (anoZ(data.pruchod)) {
        zaznam.pruchodu += 1;
        if (zaznam.zkousekDoPruchodu === null) {
          zaznam.zkousekDoPruchodu = zaznam.zkousek;
          zaznam.sekundDoPruchodu = zaznam.sekundDriv + cisloZ(data.sekund);
        }
      } else {
        const prvni = data.prvni;
        let duvod = "bez porušení";
        if (prvni !== null && typeof prvni === "object" && !Array.isArray(prvni)) {
          duvod = `${textZ(prvni.prvek) ?? "?"}/${textZ(prvni.zpusob) ?? "?"}`;
        }
        let pocty = selhani.get(u.uroven);
        if (!pocty) {
          pocty = new Map();
          selhani.set(u.uroven, pocty);
        }
        pocty.set(duvod, (pocty.get(duvod) ?? 0) + 1);
      }
      const medaile = data.medaile;
      if (medaile !== null && typeof medaile === "object" && !Array.isArray(medaile)) {
        zaznam.medaile.pruchod ||= anoZ(medaile.pruchod);
        zaznam.medaile.rozpocet ||= anoZ(medaile.rozpocet);
        zaznam.medaile.mistrovska ||= anoZ(medaile.mistrovska);
      }
    }
  };

  for (const davka of serazene) {
    const { hrac } = davka.hlavicka;
    hraci.add(hrac);
    sezeni.add(`${hrac}/${davka.hlavicka.sezeni}`);
    if (davka.hlavicka.dotyk) dotykovi.add(hrac);
    for (const u of davka.udalosti) zpracuj(hrac, u);
  }

  const souhrnUrovni: SouhrnUrovne[] = [...urovne.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([uroven, hraciUrovne]) => {
      const zaznamy = [...hraciUrovne.values()];
      const soucet = (cti: (z: HracVUrovni) => number): number => zaznamy.reduce((s, z) => s + cti(z), 0);
      const minut = median(zaznamy.flatMap((z) => (z.sekundDoPruchodu === null ? [] : [z.sekundDoPruchodu / 60])));
      return {
        uroven,
        hracu: zaznamy.length,
        otevreni: soucet((z) => z.otevreni),
        zkousek: soucet((z) => z.zkousek),
        pruchodu: soucet((z) => z.pruchodu),
        hracuSPruchodem: zaznamy.filter((z) => z.pruchodu > 0).length,
        hracuBezZkousky: zaznamy.filter((z) => z.zkousek === 0).length,
        zkousekDoPruchodu: median(zaznamy.flatMap((z) => (z.zkousekDoPruchodu === null ? [] : [z.zkousekDoPruchodu]))),
        minutDoPruchodu: minut === null ? null : Math.round(minut * 10) / 10,
        medaile: {
          pruchod: zaznamy.filter((z) => z.medaile.pruchod).length,
          rozpocet: zaznamy.filter((z) => z.medaile.rozpocet).length,
          mistrovska: zaznamy.filter((z) => z.medaile.mistrovska).length,
        },
        selhani: Object.fromEntries([...(selhani.get(uroven) ?? new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1])),
      };
    });

  return {
    hracu: hraci.size,
    sezeni: sezeni.size,
    novych: novi.size,
    dotykovych: dotykovi.size,
    udalosti,
    chyb,
    vazeb,
    chyby: [...chyby.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([zprava, pocet]) => ({ zprava, pocet })),
    urovne: souhrnUrovni,
  };
}
