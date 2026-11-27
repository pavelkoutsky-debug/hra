// Kde a proč se skládá most, který nemá pod vlastní tíhou klidovou polohu.
//
// „Nemá klidovou polohu“ ještě neznamená, že spadne: klidovou polohu nenajde ani most s jedním
// volně visícím prutem, řetěz mostovky mezi dvěma pevnými podporami (prověsí se o pár decimetrů
// a drží tahem) nebo most na dvou posuvných ložiskách. Za složení se proto počítá jen to, co
// hráč jako složení uvidí: mostovka se pod vlastní tíhou propadne. Most se nechá chvíli padat
// (kousek skutečného děje bez provozu) a měří se, o kolik klesly styčníky mostovky.
// Stejný posudek používá stavba (značka, než hráč spustí zkoušku), výsledek zkoušky i zpomalený
// záběr, takže všechny tři ukazují na totéž místo. Volně visící prut je jen poznámka.

import type { Bod } from "../data/geometrie";
import { KATALOG } from "../data/katalog";
import type { NavrhMostu } from "../data/navrh";
import type { Uroven } from "../data/uroven";
import { prazdnySnimek, Zaznam } from "./zaznam";
import { Zkouska } from "./zkouska";

/** Jak dlouho se most nechá padat, než se posoudí, v sekundách děje. */
export const DOBA_POSUDKU = 1;
/** Kdy je skládání dobře vidět: na ten okamžik míří zpomalený záběr. */
export const OKAMZIK_SLOZENI = 0.6;
/**
 * O kolik musí styčník mostovky klesnout, aby to bylo složení, v metrech. Řetěz mostovky mezi
 * pevnými podporami se prověsí nejvýš o půl metru a zastaví se; co padá, je za sekundu o metry níž.
 */
const PROPAD_SLOZENI = 1;
/**
 * Když mezitím něco povolilo nebo sjelo z podpory, stačí menší propad: ten už se nezastaví.
 * Most, který mechanismus není a jen neunese sám sebe, se do první poruchy pohne o milimetry.
 */
const PROPAD_S_PORUCHOU = 0.15;
/** O kolik se musí pohnout volný konec prutu, aby stál za poznámku, v metrech. */
const POHYB_VOLNEHO_KONCE = 0.15;
/** Stejné poklesy (souměrný most) se od sebe liší jen zaokrouhlením: vyhrává styčník s nižším číslem. */
const SHODA = 1e-3;

/**
 * Proč se most skládá:
 * - `podpory`: drží se nejvýš jedné podpory, takže se celý převrátí;
 * - `mostovka`: ve styčníku se stýká jen mostovka a nic ho nepodpírá ani nenese;
 * - `ztuzeni`: styčník nese i jiné pruty, ale konstrukce se v něm zlomí jako v kloubu.
 */
export type DuvodSlozeni = "podpory" | "mostovka" | "ztuzeni";

export interface Slozeni {
  /** Pořadí styčníku mostovky v návrhu, který se propadá nejvíc. */
  stycnik: number;
  /** Jeho poloha na výkresu, m. */
  misto: Bod;
  duvod: DuvodSlozeni;
}

/** Prut, který drží jen za jeden konec a při zkoušce se rozkýve; most kvůli němu nespadne. */
export interface VolnyPrut {
  /** Pořadí prutu v návrhu. */
  prut: number;
  /** Poloha jeho volného konce na výkresu, m. */
  misto: Bod;
}

/** Posudek mostu bez klidové polohy: složí se (kde a proč), a když ne, jestli na něm visí volný prut. */
export interface PosudekStability {
  slozeni: Slozeni | null;
  volny: VolnyPrut | null;
}

/** Most, o kterém není co říct. */
export const BEZ_NALEZU: PosudekStability = { slozeni: null, volny: null };

/**
 * Posoudí most bez klidové polohy ze začátku záznamu jeho zkoušky. Vrací null, dokud záznam
 * nesahá dost daleko (do `DOBA_POSUDKU`, nebo do první změny stavby, tedy do chvíle, kdy něco
 * povolilo nebo sjelo z podpory). Styčníky návrhu mají ve stavbě stejné pořadí jako v návrhu.
 * `dopocitano` říká, že záznam už delší nebude: posoudí se z toho, co je.
 */
export function posudStabilitu(uroven: Uroven, navrh: NavrhMostu, zaznam: Zaznam, dopocitano = false): PosudekStability | null {
  const { snimky } = zaznam;
  const stavba = zaznam.topologie[0];
  if (snimky.length === 0 || !stavba) return dopocitano ? BEZ_NALEZU : null;
  // Přes porušení se stavba mění a čísla styčníků by neseděla: měří se jen do prvního z nich.
  let kdy = -1;
  let porucha = false;
  for (let i = 1; i < snimky.length; i++) {
    if (snimky[i]!.topologie !== snimky[0]!.topologie) {
      kdy = snimky[i - 1]!.cas;
      porucha = true;
      break;
    }
    if (snimky[i]!.cas >= DOBA_POSUDKU) {
      kdy = DOBA_POSUDKU;
      break;
    }
  }
  if (kdy < 0) {
    if (!dopocitano) return null;
    kdy = zaznam.konec;
  }

  const zacatek = prazdnySnimek();
  const pozdeji = prazdnySnimek();
  zaznam.stavV(0, zacatek);
  zaznam.stavV(kdy, pozdeji);
  const stycniku = Math.min(navrh.stycniky.length, stavba.stycniku);
  const poradi = new Map(navrh.stycniky.map((s, i) => [s.id, i]));
  // Které pruty se v kterém styčníku stýkají.
  const pruty: number[][] = navrh.stycniky.map(() => []);
  navrh.pruty.forEach((p, i) => {
    for (const id of [p.a, p.b]) {
      const s = poradi.get(id);
      if (s !== undefined) pruty[s]!.push(i);
    }
  });
  const jeMostovka = (prut: number): boolean => KATALOG[navrh.pruty[prut]!.prvek].druh === "mostovka";
  // Podpory se berou z úrovně, ne ze stavby: styčník se závažím na podpoře stavba značí jinak.
  const naKotve = (s: number): boolean => {
    const st = navrh.stycniky[s]!;
    return uroven.kotvy.some((k) => k.x === st.x && k.y === st.y) || uroven.zaklady.some((z) => z.x === st.x && z.y === st.y);
  };

  // Složení: styčník mostovky, který klesl nejvíc.
  let propad = 0;
  let ktery = -1;
  for (let s = 0; s < stycniku; s++) {
    if (naKotve(s) || !pruty[s]!.some(jeMostovka)) continue;
    const pokles = zacatek.polohy[2 * s + 1]! - pozdeji.polohy[2 * s + 1]!;
    if (pokles > propad * (1 + SHODA)) {
      propad = pokles;
      ktery = s;
    }
  }
  if (ktery >= 0 && propad >= (porucha ? PROPAD_S_PORUCHOU : PROPAD_SLOZENI)) {
    const st = navrh.stycniky[ktery]!;
    let ukotveno = 0;
    for (let s = 0; s < stycniku; s++) if (naKotve(s)) ukotveno++;
    const duvod: DuvodSlozeni = ukotveno < 2 ? "podpory" : pruty[ktery]!.every(jeMostovka) ? "mostovka" : "ztuzeni";
    return { slozeni: { stycnik: ktery, misto: { x: st.x, y: st.y }, duvod }, volny: null };
  }

  // Jinak aspoň volný prut: konec, do kterého vede jediný prut a který se rozkýval.
  let pohyb = POHYB_VOLNEHO_KONCE * POHYB_VOLNEHO_KONCE;
  let volny: VolnyPrut | null = null;
  for (let s = 0; s < stycniku; s++) {
    if (pruty[s]!.length !== 1 || naKotve(s)) continue;
    const dx = pozdeji.polohy[2 * s]! - zacatek.polohy[2 * s]!;
    const dy = pozdeji.polohy[2 * s + 1]! - zacatek.polohy[2 * s + 1]!;
    const posun = dx * dx + dy * dy;
    if (posun > pohyb * (1 + SHODA)) {
      pohyb = posun;
      volny = { prut: pruty[s]![0]!, misto: { x: navrh.stycniky[s]!.x, y: navrh.stycniky[s]!.y } };
    }
  }
  return { slozeni: null, volny };
}

/**
 * Posoudí most přímo z návrhu: když nemá klidovou polohu, nechá ho bez provozu chvíli padat.
 * Most, který klidovou polohu má, a most, který se nedá sestavit, vyjde bez nálezu.
 */
export function najdiSlozeni(uroven: Uroven, navrh: NavrhMostu): PosudekStability {
  if (navrh.pruty.length === 0) return BEZ_NALEZU;
  let zkouska: Zkouska;
  try {
    zkouska = new Zkouska(uroven, navrh, 1);
  } catch {
    return BEZ_NALEZU;
  }
  if (!zkouska.bezRovnovahy) return BEZ_NALEZU;
  const zaznam = new Zaznam();
  let posudek: PosudekStability | null = null;
  // Po kouscích, ať se počítá jen tak dlouho, jak je potřeba.
  for (let pojistka = 0; pojistka < 12 && posudek === null; pojistka++) {
    const davka = zkouska.pokracuj(DOBA_POSUDKU / 4);
    davka.topologie.forEach((t) => zaznam.pridejTopologii(t));
    davka.snimky.forEach((s) => zaznam.pridej(s));
    posudek = posudStabilitu(uroven, navrh, zaznam, zkouska.hotovo);
  }
  return posudek ?? BEZ_NALEZU;
}

/** O kolik se musí styčník mostovky při zkoušce zhoupnout nahoru a dolů, aby stál za řeč (m). */
const HOUPANI = 0.05;

/**
 * Most bez klidové polohy, který se vlastní vahou nesložil (propadl se o méně než metr), ale
 * pod provozem se houpe: styčník mostovky mimo podpory, který se do první změny stavby pohnul
 * svisle nejvíc, a proč ho nic nedrží (stejně jako u složení). Mostovka z krátkých dílů pod
 * nízkým trojúhelníkem tak v 1-01 neprošla na kmitání a hráč neměl jak poznat proč. Jen čte
 * záznam; hodnocení zkoušky to nemění. Null, když se žádný styčník mostovky znatelně nehoupal.
 */
export function kdeSeHoupe(uroven: Uroven, navrh: NavrhMostu, zaznam: Zaznam): Slozeni | null {
  const { snimky } = zaznam;
  const stavba = zaznam.topologie[0];
  if (snimky.length === 0 || !stavba) return null;
  const stycniku = Math.min(navrh.stycniky.length, stavba.stycniku);
  const poradi = new Map(navrh.stycniky.map((s, i) => [s.id, i]));
  const pruty: number[][] = navrh.stycniky.map(() => []);
  navrh.pruty.forEach((p, i) => {
    for (const id of [p.a, p.b]) {
      const s = poradi.get(id);
      if (s !== undefined) pruty[s]!.push(i);
    }
  });
  const jeMostovka = (prut: number): boolean => KATALOG[navrh.pruty[prut]!.prvek].druh === "mostovka";
  const naKotve = (s: number): boolean => {
    const st = navrh.stycniky[s]!;
    return uroven.kotvy.some((k) => k.x === st.x && k.y === st.y) || uroven.zaklady.some((z) => z.x === st.x && z.y === st.y);
  };
  const nejniz = new Array<number>(stycniku).fill(Infinity);
  const nejvys = new Array<number>(stycniku).fill(-Infinity);
  const snimek = prazdnySnimek();
  const prvni = snimky[0]!.topologie;
  for (const s of snimky) {
    if (s.topologie !== prvni) break;
    zaznam.stavV(s.cas, snimek);
    for (let i = 0; i < stycniku; i++) {
      const y = snimek.polohy[2 * i + 1]!;
      if (y < nejniz[i]!) nejniz[i] = y;
      if (y > nejvys[i]!) nejvys[i] = y;
    }
  }
  // Styčník, ve kterém se stýká jen mostovka, nedrží nic: když se houpe, je to on, i kdyby se
  // sousední styčník s trojúhelníkem houpal o kus víc (pohne se s ním).
  const nejvic = (jen: (s: number) => boolean): number => {
    let ktery = -1;
    let rozkmit = HOUPANI;
    for (let s = 0; s < stycniku; s++) {
      if (naKotve(s) || !pruty[s]!.some(jeMostovka) || !jen(s)) continue;
      const r = nejvys[s]! - nejniz[s]!;
      if (r > rozkmit * (1 + SHODA)) {
        rozkmit = r;
        ktery = s;
      }
    }
    return ktery;
  };
  const volny = nejvic((s) => pruty[s]!.every(jeMostovka));
  const ktery = volny >= 0 ? volny : nejvic(() => true);
  if (ktery < 0) return null;
  let ukotveno = 0;
  for (let s = 0; s < stycniku; s++) if (naKotve(s)) ukotveno++;
  const st = navrh.stycniky[ktery]!;
  const duvod: DuvodSlozeni = ukotveno < 2 ? "podpory" : pruty[ktery]!.every(jeMostovka) ? "mostovka" : "ztuzeni";
  return { stycnik: ktery, misto: { x: st.x, y: st.y }, duvod };
}
