// Galerie mostů hráče: pro každou úroveň kampaně nejlepší most, který jí prošel. Z ní se
// skládá závěrečný list kampaně (souhrn a obrázky mostů). Most je uložený jako kód pro
// sdílení (`src/data/sdileni.ts`), takže se vejde do paměti prohlížeče a dá se z něj kdykoli
// znovu postavit i poslat dál.
//
// Bez prohlížeče: čtení a zápis textu a pravidlo, který most je lepší.

import { cenaNavrhu, hmotnostNavrhu } from "./cena";
import type { NavrhMostu } from "./navrh";
import { NEJDELSI_KOD_MOSTU, rozkodujMost } from "./sdileni";
import type { Medaile } from "./ulozeni";
import type { Uroven } from "./uroven";

/** Most v galerii: kód mostu a to, čím si místo zasloužil. */
export interface MostGalerie {
  /** Kód mostu (`zakodujMost`). */
  kod: string;
  /** Cena mostu v Kč. */
  cena: number;
  /** Kolik medailí mu zkouška dala (1 až 3; medaile jdou po schodech). */
  medaili: number;
  /** Zůstal při zkoušce neporušený (nic nepovolilo ani se trvale neohnulo)? */
  neporuseny: boolean;
  /** Verze fyziky, kterou zkouškou prošel. */
  verzeFyziky: number;
}

/** Galerie: id úrovně → nejlepší most, který jí prošel. */
export type Galerie = Record<string, MostGalerie>;

/**
 * Je `novy` most lepší než `stary`, takže má v galerii jeho místo? Rozhoduje počet medailí,
 * při shodě neporušený most před porušeným a nakonec nižší cena. Most změřený starší verzí
 * fyziky ustoupí každému, který projde tou dnešní: jeho medaile už nemusí platit.
 */
export function lepsiMost(stary: MostGalerie | undefined, novy: MostGalerie): boolean {
  if (!stary) return true;
  if (stary.verzeFyziky !== novy.verzeFyziky) return novy.verzeFyziky > stary.verzeFyziky;
  if (novy.medaili !== stary.medaili) return novy.medaili > stary.medaili;
  if (novy.neporuseny !== stary.neporuseny) return novy.neporuseny;
  return Math.round(novy.cena) < Math.round(stary.cena);
}

function jeMost(h: unknown): h is MostGalerie {
  if (typeof h !== "object" || h === null) return false;
  const m = h as Record<string, unknown>;
  return (
    typeof m.kod === "string" &&
    m.kod.length > 0 &&
    m.kod.length <= NEJDELSI_KOD_MOSTU &&
    typeof m.cena === "number" &&
    Number.isFinite(m.cena) &&
    m.cena >= 0 &&
    typeof m.medaili === "number" &&
    Number.isInteger(m.medaili) &&
    m.medaili >= 1 &&
    m.medaili <= 3 &&
    typeof m.neporuseny === "boolean" &&
    typeof m.verzeFyziky === "number" &&
    Number.isInteger(m.verzeFyziky) &&
    m.verzeFyziky >= 1
  );
}

/**
 * Přečte galerii z textu v paměti prohlížeče. Nečitelný zápis dá prázdnou galerii a položky,
 * které nedávají smysl, se zahodí: galerie je ozdoba a nesmí hru zastavit.
 */
export function galerieZTextu(zapis: string | null): Galerie {
  if (zapis === null) return {};
  let data: unknown;
  try {
    data = JSON.parse(zapis);
  } catch {
    return {};
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
  const galerie: Galerie = {};
  for (const [uroven, most] of Object.entries(data)) {
    if (/^\d-\d\d$/.test(uroven) && jeMost(most)) {
      galerie[uroven] = { kod: most.kod, cena: most.cena, medaili: most.medaili, neporuseny: most.neporuseny, verzeFyziky: most.verzeFyziky };
    }
  }
  return galerie;
}

export function galerieNaText(galerie: Galerie): string {
  return JSON.stringify(galerie);
}

// ---- Závěrečný list: souhrn kampaně a mosty do obrázků ----

/** Jedna úroveň na závěrečném listu. */
export interface PolozkaListu {
  uroven: Uroven;
  /** Most do obrázku: nejlepší prošlý z galerie, jinak rozestavěný z výkresu, jinak žádný. */
  most: NavrhMostu | null;
  puvod: "galerie" | "rozestaveny" | "zadny";
  /**
   * Medaile ke kartě: u mostu z galerie ty, které dostal právě ten most (hráč může mít z dřívějška
   * víc; součty listu počítají postup, ne galerii), jinak medaile úrovně z uloženého postupu.
   */
  medaile: Medaile;
  /** Cena a hmotnost mostu v obrázku; null, když úroveň most nemá. */
  cena: number | null;
  hmotnost: number | null;
}

/** Co o kampani říká závěrečný list. */
export interface SouhrnListu {
  polozky: PolozkaListu[];
  urovni: number;
  projito: number;
  /** Kolik medailí hráč má a kolik jich kampaň nabízí. */
  medaili: number;
  medailiCelkem: number;
  pocty: { pruchod: number; rozpocet: number; mistrovska: number };
  /** Součty přes mosty z galerie (ty, které svou úrovní prošly). */
  mostu: number;
  cena: number;
  hmotnost: number;
  /** Součet rozpětí přemostěných údolí v metrech. */
  rozpeti: number;
  prutu: number;
  /** Jsou projité všechny úrovně kampaně? */
  dokonceno: boolean;
}

/** Odkud souhrn bere postup hráče: medaile úrovně, galerie a rozestavěný most z výkresu. */
export interface PodkladyListu {
  medaile(idUrovne: string): Medaile | undefined;
  galerie: Galerie;
  rozestaveny(idUrovne: string): NavrhMostu | undefined;
}

/** Rozpětí hlavní trasy úrovně v metrech. */
function rozpetiUrovne(uroven: Uroven): number {
  const trasa = uroven.trasy[0];
  return trasa ? Math.abs(trasa.konec.x - trasa.zacatek.x) : 0;
}

/**
 * Souhrn kampaně pro závěrečný list. Most z galerie, který po změně hry nejde přečíst nebo
 * patří jiné úrovni, se přeskočí a úroveň ukáže rozestavěný most (galerie je ozdoba; medaile
 * a rekordy žijí v uloženém postupu).
 */
export function souhrnListu(kampan: readonly Uroven[], podklady: PodkladyListu): SouhrnListu {
  const souhrn: SouhrnListu = {
    polozky: [],
    urovni: kampan.length,
    projito: 0,
    medaili: 0,
    medailiCelkem: 0,
    pocty: { pruchod: 0, rozpocet: 0, mistrovska: 0 },
    mostu: 0,
    cena: 0,
    hmotnost: 0,
    rozpeti: 0,
    prutu: 0,
    dokonceno: false,
  };
  for (const uroven of kampan) {
    const medaile = podklady.medaile(uroven.id) ?? { pruchod: false, rozpocet: false, mistrovska: false };
    souhrn.medailiCelkem += 1 + Number(uroven.inzenyrskyRozpocet !== null) + Number(uroven.mistrovska !== null);
    if (medaile.pruchod) {
      souhrn.projito += 1;
      souhrn.pocty.pruchod += 1;
    }
    if (medaile.rozpocet && uroven.inzenyrskyRozpocet !== null) souhrn.pocty.rozpocet += 1;
    if (medaile.mistrovska && uroven.mistrovska !== null) souhrn.pocty.mistrovska += 1;

    let most: NavrhMostu | null = null;
    let puvod: PolozkaListu["puvod"] = "zadny";
    const zGalerie = podklady.galerie[uroven.id];
    if (zGalerie) {
      try {
        const navrh = rozkodujMost(zGalerie.kod);
        if (navrh.uroven === uroven.id) {
          most = navrh;
          puvod = "galerie";
        }
      } catch {
        // Kód z jiné verze hry: úroveň ukáže rozestavěný most.
      }
    }
    if (!most) {
      const rozestaveny = podklady.rozestaveny(uroven.id);
      if (rozestaveny && rozestaveny.pruty.length > 0) {
        most = rozestaveny;
        puvod = "rozestaveny";
      }
    }
    const cena = most ? cenaNavrhu(most) : null;
    const hmotnost = most ? hmotnostNavrhu(most, uroven) : null;
    if (most && puvod === "galerie") {
      souhrn.mostu += 1;
      souhrn.cena += cena ?? 0;
      souhrn.hmotnost += hmotnost ?? 0;
      souhrn.rozpeti += rozpetiUrovne(uroven);
      souhrn.prutu += most.pruty.length;
    }
    // Karta nesmí mostu z galerie připsat medaile, které získal jiný most hráče.
    const medaileKarty: Medaile =
      puvod === "galerie" && zGalerie
        ? { pruchod: zGalerie.medaili >= 1, rozpocet: zGalerie.medaili >= 2, mistrovska: zGalerie.medaili >= 3 }
        : medaile;
    souhrn.polozky.push({ uroven, most, puvod, medaile: medaileKarty, cena, hmotnost });
  }
  souhrn.medaili = souhrn.pocty.pruchod + souhrn.pocty.rozpocet + souhrn.pocty.mistrovska;
  souhrn.dokonceno = kampan.length > 0 && souhrn.projito === kampan.length;
  return souhrn;
}
