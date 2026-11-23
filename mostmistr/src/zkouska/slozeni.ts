// Kde a proč se skládá most, který nemá pod vlastní tíhou klidovou polohu.
//
// Takový most nic neutrhne: některý styčník prostě nic nedrží a konstrukce se v něm složí.
// Místo se hledá krátkým kouskem skutečného děje (most se nechá chvilku padat a vezme se
// styčník návrhu, který se hnul nejvíc), důvod se pak určí z toho, co se v tom styčníku stýká.
// Stejný rozbor používá stavba (varování, než hráč spustí zkoušku), výsledek zkoušky
// i zpomalený záběr, takže všechny tři ukazují na totéž místo.

import type { Bod } from "../data/geometrie";
import { KATALOG } from "../data/katalog";
import type { NavrhMostu } from "../data/navrh";
import type { Uroven } from "../data/uroven";
import { TIHOVE_ZRYCHLENI } from "../jadro/integrator";
import { najdiRovnovahu } from "../jadro/matice";
import { sestavSoustavu } from "../jadro/soustava";
import { volneStupne } from "../jadro/stupne";
import { sestavMost } from "./stavba";
import { prazdnySnimek, STYCNIK_SKRYTY, type Topologie, Zaznam } from "./zaznam";
import { Zkouska } from "./zkouska";

/** Za jak dlouho děje je skládání vidět a dá se z něj poznat místo, v sekundách. */
export const OKAMZIK_SLOZENI = 0.35;
/** Když se most začne trhat dřív, než uplyne tahle doba, z pohybu se místo složení poznat nedá. */
const NEJKRATSI_POHYB = 0.1;
/** Zlomek tíhy, kterým se zkouší, jestli je most mechanismus (viz `jeMechanismus`). */
const NEPATRNA_TIHA = 1e-3;

/**
 * Proč se most skládá:
 * - `podpory`: drží se nejvýš jedné podpory, takže se celý převrátí nebo ujede;
 * - `volny-konec`: prut drží jen za jeden konec a kýve se;
 * - `mostovka`: ve styčníku se stýká jen mostovka a nic ho nepodpírá ani nenese;
 * - `ztuzeni`: styčník drží pruty, které se proti sobě můžou natočit (čtyřúhelník bez úhlopříčky).
 */
export type DuvodSlozeni = "podpory" | "volny-konec" | "mostovka" | "ztuzeni";

export interface Slozeni {
  /** Pořadí styčníku v návrhu, kde se most začíná skládat; −1, když to styčník návrhu není. */
  stycnik: number;
  /** Poloha toho místa na výkresu, m. */
  misto: Bod;
  duvod: DuvodSlozeni;
  /** Prut, kterého se důvod týká (pořadí v návrhu): u volného konce ten, který se kýve. */
  prut: number | null;
}

/**
 * Které styčníky stavby jsou styčníky návrhu: konce prutů a místa, kde se pruty stýkají.
 * Výpočet dělí dlouhé pruty na kusy; styčník uprostřed prutu spojuje právě dva kusy téhož prutu.
 */
function stycnikyNavrhu(stavba: Topologie): Uint8Array {
  const prvni = new Int32Array(stavba.stycniku).fill(-2);
  const pocet = new Uint8Array(stavba.stycniku);
  const ruzne = new Uint8Array(stavba.stycniku);
  for (let e = 0; e < stavba.prut.length; e++) {
    const prut = stavba.prut[e]!;
    if (prut < 0) continue;
    for (const i of [stavba.prvekA[e]!, stavba.prvekB[e]!]) {
      if (pocet[i]! < 255) pocet[i]!++;
      if (prvni[i] === -2) prvni[i] = prut;
      else if (prvni[i] !== prut) ruzne[i] = 1;
    }
  }
  const vysledek = new Uint8Array(stavba.stycniku);
  for (let i = 0; i < stavba.stycniku; i++) vysledek[i] = pocet[i]! > 0 && (ruzne[i] === 1 || pocet[i] !== 2) ? 1 : 0;
  return vysledek;
}

/**
 * Styčník návrhu, který se od začátku děje do času `doCasu` pohnul nejvíc: u mostu bez klidové
 * polohy místo, kde se začíná skládat. Vrací jeho pořadí a polohu na začátku; null, dokud
 * záznam tak daleko nesahá nebo se nic nepohnulo.
 */
export function prvniPohyb(zaznam: Zaznam, doCasu: number): { stycnik: number; misto: Bod; posun: number } | null {
  if (zaznam.konec < doCasu) return null;
  // Přes porušení se stavba mění a čísla styčníků by neseděla: měří se jen do prvního z nich.
  const { snimky } = zaznam;
  let kdy = doCasu;
  for (let i = 1; i < snimky.length && snimky[i]!.cas <= doCasu; i++) {
    if (snimky[i]!.topologie !== snimky[0]!.topologie) {
      kdy = snimky[i - 1]!.cas;
      break;
    }
  }
  if (kdy < Math.min(NEJKRATSI_POHYB, doCasu)) return null;
  const zacatek = prazdnySnimek();
  const pozdeji = prazdnySnimek();
  const stavba = zaznam.stavV(0, zacatek);
  const stavbaPozdeji = zaznam.stavV(kdy, pozdeji);
  if (!stavba || stavba !== stavbaPozdeji) return null;
  const navrhu = stycnikyNavrhu(stavba);
  let nejvetsi = 0;
  let ktery = -1;
  for (let i = 0; i < stavba.stycniku; i++) {
    if (navrhu[i] !== 1 || stavba.znacky[i] === STYCNIK_SKRYTY || (stavba.podpory[i]! & 3) === 3) continue;
    const dx = pozdeji.polohy[2 * i]! - zacatek.polohy[2 * i]!;
    const dy = pozdeji.polohy[2 * i + 1]! - zacatek.polohy[2 * i + 1]!;
    const posun = dx * dx + dy * dy;
    // Při shodě (souměrný most) vyhrává styčník s nižším číslem: výběr nesmí záviset na zaokrouhlení.
    if (posun > nejvetsi * (1 + 1e-6)) {
      nejvetsi = posun;
      ktery = i;
    }
  }
  if (ktery < 0) return null;
  return { stycnik: ktery, misto: { x: zacatek.polohy[2 * ktery]!, y: zacatek.polohy[2 * ktery + 1]! }, posun: Math.sqrt(nejvetsi) };
}

/**
 * Je most mechanismus, tedy dá se pohnout, aniž by se cokoli natáhlo nebo ohnulo? Pozná se
 * to nepatrným zatížením: tuhá konstrukce se pod ním nepatrně prohne, mechanismus rovnováhu
 * nemá. Most, který klidovou polohu nemá jen proto, že se mu pod vlastní tíhou vzepře prut,
 * mechanismus není: ten nic neskládá, ten neunese sám sebe, a řekne to věta o prvním porušení.
 */
export function jeMechanismus(uroven: Uroven, navrh: NavrhMostu): boolean {
  if (navrh.pruty.length === 0) return false;
  try {
    const s = sestavSoustavu(sestavMost(uroven, navrh).popis);
    const stupne = volneStupne(s);
    if (stupne.length === 0) return false;
    return najdiRovnovahu(s, stupne, new Float64Array(stupne.length), NEPATRNA_TIHA * TIHOVE_ZRYCHLENI) < 0;
  } catch {
    return false;
  }
}

/**
 * Místo a důvod složení z kousku záznamu zkoušky mostu bez klidové polohy. Styčníky návrhu
 * mají ve stavbě stejné pořadí jako v návrhu, takže se dá říct, které pruty se v místě stýkají.
 * Null u mostu, který mechanismus není, a když se místo z pohybu poznat nedá.
 */
export function rozeberSlozeni(uroven: Uroven, navrh: NavrhMostu, zaznam: Zaznam, doCasu = OKAMZIK_SLOZENI): Slozeni | null {
  if (!jeMechanismus(uroven, navrh)) return null;
  const pohyb = prvniPohyb(zaznam, doCasu);
  const stavba = zaznam.topologie[0];
  if (!pohyb || !stavba) return null;
  const stycniku = navrh.stycniky.length;
  const stycnik = pohyb.stycnik < stycniku ? pohyb.stycnik : -1;

  // Kolika podpor se most drží: s jedinou se převrátí nebo ujede celý, ať je jakkoli vyztužený.
  let podepreno = 0;
  for (let i = 0; i < Math.min(stycniku, stavba.stycniku); i++) if ((stavba.podpory[i]! & 3) !== 0) podepreno++;
  if (podepreno < 2) return { stycnik, misto: pohyb.misto, duvod: "podpory", prut: null };
  if (stycnik < 0) return { stycnik, misto: pohyb.misto, duvod: "ztuzeni", prut: null };

  const id = navrh.stycniky[stycnik]!.id;
  const pruty: number[] = [];
  navrh.pruty.forEach((p, poradi) => {
    if (p.a === id || p.b === id) pruty.push(poradi);
  });
  if (pruty.length === 1) return { stycnik, misto: pohyb.misto, duvod: "volny-konec", prut: pruty[0]! };
  const jenMostovka = pruty.length > 0 && pruty.every((p) => KATALOG[navrh.pruty[p]!.prvek].druh === "mostovka");
  return { stycnik, misto: pohyb.misto, duvod: jenMostovka ? "mostovka" : "ztuzeni", prut: null };
}

/**
 * Najde místo a důvod složení přímo z návrhu: nechá most chvilku padat pod vlastní tíhou.
 * Null u mostu, který klidovou polohu má, a u mostu, který se nedá sestavit.
 */
export function najdiSlozeni(uroven: Uroven, navrh: NavrhMostu): Slozeni | null {
  if (navrh.pruty.length === 0) return null;
  let zkouska: Zkouska;
  try {
    zkouska = new Zkouska(uroven, navrh, 1);
  } catch {
    return null;
  }
  if (!zkouska.bezRovnovahy) return null;
  const zaznam = new Zaznam();
  // Po kouscích, ať se počítá jen tak dlouho, jak je potřeba.
  for (let pojistka = 0; pojistka < 8 && zaznam.konec < OKAMZIK_SLOZENI && !zkouska.hotovo; pojistka++) {
    const davka = zkouska.pokracuj(OKAMZIK_SLOZENI / 2);
    davka.topologie.forEach((t) => zaznam.pridejTopologii(t));
    davka.snimky.forEach((s) => zaznam.pridej(s));
  }
  return rozeberSlozeni(uroven, navrh, zaznam, Math.min(OKAMZIK_SLOZENI, zaznam.konec));
}
