// Úklid starých dat a smazání všeho od jednoho hráče.
//
// Úklid (`uklid`) maže soli a počitadla adres starší než dva dny (`adresa.ts`), dávky deníku
// starší než `DNI_UCHOVANI_DENIKU` a zprávy zpětné vazby starší než `DNI_UCHOVANI_VAZEB`. Na jedno
// volání smaže nejvýš `NEJVIC_UKLIDU` záznamů, zbytek dodělá příště; volá se při podkladech
// denního rozboru (úloha je stahuje každý den) a při výpisu dnů na stránce správce.
//
// Smazání hráče (`smazHrace`, správa `POST /api/sprava?co=smazat-hrace` { hrac, od }) projde po
// částech dávky deníku, zprávy zpětné vazby a žebříčky a smaže všechno s daným číslem hráče.
// Pokračuje se kurzorem `dalsi`: je to poslední hotový klíč a klíče se procházejí v abecedním
// pořadí (`denik/` < `vazba/` < `zebricek/`), takže kurzor stačí jeden.

import { DEN, denZ, jeVazba, kliceDne, klicVytahu, prectiVse, provedVse, zKliceDavky } from "./obsluha";
import type { SkladZaznamu } from "./sklad";
import { smazHraceZeZebricku } from "./zebricek";

/** Jak dlouho se drží deník hraní, dní. */
export const DNI_UCHOVANI_DENIKU = 365;
/** Jak dlouho se drží zprávy zpětné vazby (i s kontakty), dní. */
export const DNI_UCHOVANI_VAZEB = 730;
/** Jak dlouho se drží soli a počitadla adres, dní (dnešek a dva dny zpátky). */
export const DNI_UCHOVANI_ADRES = 2;
/** Nejvíc záznamů, které úklid smaže na jedno volání (funkce má na odpověď omezený čas). */
export const NEJVIC_UKLIDU = 400;
/** Nejvíc záznamů, které smazání hráče na jednu žádost přečte nebo smaže. */
export const NEJVIC_NA_SMAZANI_HRACE = 400;
/** Nejvíc dnů deníku, jejichž klíče smazání hráče na jednu žádost vypíše. */
const NEJVIC_DNU_NA_SMAZANI_HRACE = 60;

function denPred(den: string, dni: number): string {
  return denZ(new Date(Date.parse(`${den}T00:00:00Z`) - dni * 86_400_000));
}

/**
 * Smaže stará data, nejvýš `NEJVIC_UKLIDU` záznamů. Vrací, kolik smazal a jestli je hotovo
 * (false: zbylo víc, než se vešlo, dodělá se příště).
 */
export async function uklid(sklad: SkladZaznamu, ted: Date): Promise<{ smazano: number; hotovo: boolean }> {
  const dnes = denZ(ted);
  let zbyva = NEJVIC_UKLIDU;
  const smaz = async (klice: readonly string[]): Promise<boolean> => {
    const ted = klice.slice(0, zbyva);
    await provedVse(ted, (klic) => sklad.smaz(klic));
    zbyva -= ted.length;
    return ted.length === klice.length;
  };

  // Soli a počitadla adres: starší než dva dny už nic nepočítají.
  const mezAdres = denPred(dnes, DNI_UCHOVANI_ADRES);
  await smaz((await sklad.klice("sul/")).filter((k) => k < `sul/${mezAdres}`));
  const slozkyPocitadel = [...(await sklad.slozky("adresa/")).map((druh) => `adresa/${druh}/`), "zebricek-adresa/", "overuje/"];
  for (const slozka of slozkyPocitadel) {
    for (const den of await sklad.slozky(slozka)) {
      if (zbyva <= 0) return { smazano: NEJVIC_UKLIDU, hotovo: false };
      if (den < mezAdres) await smaz(await sklad.klice(`${slozka}${den}/`));
    }
  }

  // Deník hraní: celé dny starší než doba uchování, i s uloženým výtahem dne.
  const mezDeniku = denPred(dnes, DNI_UCHOVANI_DENIKU);
  for (const den of await sklad.slozky("denik/")) {
    if (zbyva <= 0) return { smazano: NEJVIC_UKLIDU, hotovo: false };
    if (!DEN.test(den) || den >= mezDeniku) continue;
    if (await smaz(await kliceDne(sklad, den, true))) await smaz([klicVytahu(den)]);
  }

  // Zpětná vazba: číslo zprávy začíná dnem příjmu (RRRRMMDDT…). Zpráva i položka seznamu.
  const mezVazeb = denPred(dnes, DNI_UCHOVANI_VAZEB).replace(/-/g, "");
  const stareVazby = (await sklad.klice("vazba/")).filter((k) => k < `vazba/${mezVazeb}`);
  const stareVSeznamu = (await sklad.klice("vazba-seznam/")).filter((k) => k < `vazba-seznam/${mezVazeb}`);
  await smaz(stareVSeznamu);
  await smaz(stareVazby);

  return { smazano: NEJVIC_UKLIDU - zbyva, hotovo: zbyva > 0 };
}

/**
 * Smaže část dat hráče s číslem `hrac`: dávky deníku (číslo hráče je v klíči dávky), zprávy
 * zpětné vazby (číslo je v hlavičce zprávy, každou je potřeba přečíst) a řádky ve všech
 * žebříčcích. Na jednu žádost nejvýš `NEJVIC_NA_SMAZANI_HRACE` čtení a smazání; `dalsi` je
 * kurzor pro další žádost, null, když je hotovo.
 *
 * Uložený výtah dne (`vytah/<den>.json`) nese i čísla hráčů a co který z nich v úrovních dělal.
 * Den, ze kterého se hráči něco maže, proto přijde i o výtah (ještě před první smazanou dávkou,
 * aby po přerušené žádosti nezůstal) a souhrn si ho příště spočítá znovu z dávek, které zůstaly.
 */
export async function smazHrace(sklad: SkladZaznamu, hrac: string, od: string | null): Promise<{ smazano: number; dalsi: string | null }> {
  let zbyva = NEJVIC_NA_SMAZANI_HRACE;
  let smazano = 0;
  let posledni = od;
  const za = (klic: string): boolean => od === null || klic > od;

  // Deník po dnech: dny, které kurzor už celé minul, se ani nevypisují.
  let dnu = 0;
  for (const den of (await sklad.slozky("denik/")).filter((d) => DEN.test(d)).sort()) {
    const zacatekDne = `denik/${den}/`;
    if (od !== null && `${zacatekDne}￿` <= od) continue;
    if (dnu >= NEJVIC_DNU_NA_SMAZANI_HRACE) return { smazano, dalsi: posledni !== null && posledni > zacatekDne ? posledni : zacatekDne };
    dnu += 1;
    let vytahSmazan = false;
    for (const klic of (await kliceDne(sklad, den, true)).filter(za)) {
      if (zKliceDavky(klic)?.hrac === hrac) {
        if (zbyva <= 0) return { smazano, dalsi: posledni };
        if (!vytahSmazan) {
          await sklad.smaz(klicVytahu(den));
          vytahSmazan = true;
        }
        await sklad.smaz(klic);
        zbyva -= 1;
        smazano += 1;
      }
      posledni = klic;
    }
  }

  // Zpětná vazba: číslo hráče je v hlavičce zprávy, takže se zprávy čtou po částech.
  const vazby = (await sklad.klice("vazba/")).filter(za);
  for (let i = 0; i < vazby.length; ) {
    if (zbyva <= 0) return { smazano, dalsi: posledni };
    const cast = vazby.slice(i, i + Math.max(1, Math.floor(zbyva / 2)));
    const zpravy = await prectiVse(sklad, cast);
    zbyva -= cast.length;
    const jeho = cast.filter((_, j) => {
      const v = zpravy[j];
      return jeVazba(v) && v.hlavicka.hrac === hrac;
    });
    await provedVse(jeho, async (klic) => {
      await sklad.smaz(`vazba-seznam/${klic.slice("vazba/".length)}`);
      await sklad.smaz(klic);
    });
    zbyva -= jeho.length;
    smazano += jeho.length;
    i += cast.length;
    posledni = cast.at(-1)!;
  }

  // Žebříčky: jeden žebříček je jedno čtení a nejvýš jeden zápis.
  if (zbyva <= 0) return { smazano, dalsi: posledni };
  const zebricky = await smazHraceZeZebricku(sklad, hrac, posledni !== null && posledni.startsWith("zebricek/") ? posledni : null, zbyva);
  smazano += zebricky.smazano;
  return { smazano, dalsi: zebricky.posledni };
}
