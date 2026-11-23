// Strojové zeštíhlení referenčního mostu: „šampion“ výzev o efektivitu.
//
// Zlato výzvy nemá padat hráči, který jen postaví most podobný mostu autora. Šampion je
// referenční most, ze kterého stroj ubral všechno, co šlo ubrat, aniž by přestal projít
// zkouškou bez porušeného prutu: slabší a levnější (nebo lehčí) prvky, zbytečné pruty, svary,
// závaží a tlumiče, a styčníky posunul tak, aby pruty byly kratší. Je to most, ke kterému se
// hráč dostane stejnou cestou: dívat se na využití a ubírat tam, kde je rezerva.
//
// Šampioni se neukládají celí, jen jako seznam úprav referenčního mostu (`sampioni.json`);
// `pouzijUpravy` z něj most zase složí. Hledání (`zestihli`) pouští zkoušku, proto ji dostává
// zvenku: tenhle soubor načítá i hra a jádro zkoušky do něj nepatří.

import { cenaNavrhu, hmotnostNavrhu } from "../src/data/cena";
import { KATALOG, KROK_ZAVAZI, LADENY_TLUMIC, type IdPrvku } from "../src/data/katalog";
import type { NavrhMostu } from "../src/data/navrh";
import type { Uroven } from "../src/data/uroven";

/** Čím se šampion měří: cenou, nebo hmotností. */
export type Meritko = "cena" | "hmotnost";

/**
 * Jedna úprava mostu. Pruty a styčníky se jmenují svým `id` z návrhu, takže seznam úprav
 * platí, i když se pořadí v návrhu změní.
 */
export type Uprava =
  /** Prut z jiného prvku téhož druhu. */
  | { prut: number; prvek: IdPrvku }
  /** Prut pryč; styčník, na kterém pak nic nezbylo, zmizí s ním. */
  | { prut: number; pryc: true }
  /**
   * Styčník pryč se vším, co na něm visí. Dva dílce mostovky, které spojoval, nahradí jeden
   * (id a prvek prvního z nich); styčník, kde mostovka končí, odstranit nejde.
   */
  | { stycnik: number; pryc: true }
  /** Styčník se svarem, nebo bez něj. */
  | { stycnik: number; svar: boolean }
  /** Jiné závaží na styčníku v kg; 0 je žádné. */
  | { stycnik: number; zavazi: number }
  /** Laděný tlumič s jinou hmotou v kg; 0 je žádný. */
  | { stycnik: number; tlumic: number }
  /** Styčník na jiném místě rastru. */
  | { stycnik: number; x: number; y: number };

function klic(u: Uprava): string {
  if ("prut" in u) return "pryc" in u ? `p${u.prut}-` : `p${u.prut}>${u.prvek}`;
  if ("pryc" in u) return `s${u.stycnik}-`;
  if ("svar" in u) return `s${u.stycnik}${u.svar ? "+" : ""}`;
  if ("zavazi" in u) return `z${u.stycnik}>${u.zavazi}`;
  if ("tlumic" in u) return `t${u.stycnik}>${u.tlumic}`;
  return `x${u.stycnik}>${u.x},${u.y}`;
}

/** Most po úpravách; původní návrh nemění. Úprava prutu nebo styčníku, který v mostě není, je chyba. */
export function pouzijUpravy(navrh: NavrhMostu, upravy: readonly Uprava[]): NavrhMostu {
  let stycniky = navrh.stycniky.map((s) => ({ ...s }));
  let pruty = navrh.pruty.map((p) => ({ ...p }));
  for (const u of upravy) {
    if ("prut" in u) {
      const prut = pruty.find((p) => p.id === u.prut);
      if (!prut) throw new Error(`úprava jmenuje prut ${u.prut}, který v mostě není`);
      if ("pryc" in u) {
        pruty = pruty.filter((p) => p !== prut);
        const zbyle = new Set(pruty.flatMap((p) => [p.a, p.b]));
        stycniky = stycniky.filter((s) => zbyle.has(s.id));
      } else prut.prvek = u.prvek;
      continue;
    }
    const stycnik = stycniky.find((s) => s.id === u.stycnik);
    if (!stycnik) throw new Error(`úprava jmenuje styčník ${u.stycnik}, který v mostě není`);
    if ("pryc" in u) {
      const mostovka = pruty.filter((p) => (p.a === u.stycnik || p.b === u.stycnik) && KATALOG[p.prvek].druh === "mostovka");
      if (mostovka.length !== 0 && mostovka.length !== 2) throw new Error(`styčník ${u.stycnik} nejde odstranit: končí v něm mostovka`);
      const [prvni, druhy] = mostovka;
      if (prvni && druhy) {
        const konec = (p: (typeof pruty)[number]): number => (p.a === u.stycnik ? p.b : p.a);
        if (prvni.a === u.stycnik) prvni.a = konec(druhy);
        else prvni.b = konec(druhy);
      }
      pruty = pruty.filter((p) => p === prvni || (p.a !== u.stycnik && p.b !== u.stycnik));
      const zbyle = new Set(pruty.flatMap((p) => [p.a, p.b]));
      stycniky = stycniky.filter((s) => zbyle.has(s.id));
    } else if ("svar" in u) {
      if (u.svar) stycnik.svar = true;
      else delete stycnik.svar;
    } else if ("zavazi" in u) {
      if (u.zavazi > 0) stycnik.zavazi = u.zavazi;
      else delete stycnik.zavazi;
    } else if ("tlumic" in u) {
      if (u.tlumic > 0 && stycnik.tlumic) stycnik.tlumic = { ...stycnik.tlumic, hmota: u.tlumic };
      else delete stycnik.tlumic;
    } else {
      stycnik.x = u.x;
      stycnik.y = u.y;
    }
  }
  return { ...navrh, stycniky, pruty };
}

/**
 * Úpravy, které svaří každý styčník, kde se stýkají dva dílce mostovky. Mostovka pak nese jako
 * spojitý nosník a hledání z ní může ubrat konstrukci, kterou kloubová mostovka potřebuje:
 * jiný začátek hledání, ne úspora.
 */
export function svarMostovky(navrh: NavrhMostu): Uprava[] {
  return navrh.stycniky
    .filter((s) => !s.svar && navrh.pruty.filter((p) => (p.a === s.id || p.b === s.id) && KATALOG[p.prvek].druh === "mostovka").length === 2)
    .map((s) => ({ stycnik: s.id, svar: true }));
}

/** Hodnota mostu v měřítku výzvy: cena v Kč, nebo hmotnost v kg. */
export function hodnotaMostu(navrh: NavrhMostu, uroven: Uroven, meritko: Meritko): number {
  return meritko === "cena" ? cenaNavrhu(navrh) : hmotnostNavrhu(navrh, uroven);
}

const SOUSEDE: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/**
 * Úpravy, které most v měřítku zlevní nebo odlehčí, od největší úspory. Mostovka se neodstraňuje
 * (bez ní provoz nepřejede) a prvek se mění jen za jiný téhož druhu, který úroveň dovoluje.
 * Styčník se posouvá o metr, když nenese mostovku, nestojí v podpoře a není to zámek: kratší
 * pruty jsou levnější. Celý styčník se odstraňuje i s pruty, které v něm končí; mostovka se
 * přes něj spojí. Jestli most po úpravě projde kontrolou návrhu, se tu neřeší.
 */
export function kandidatiUprav(navrh: NavrhMostu, uroven: Uroven, meritko: Meritko): { uprava: Uprava; uspora: number }[] {
  const upravy: Uprava[] = [];
  const naMostovce = new Set<number>();
  for (const p of navrh.pruty) {
    const druh = KATALOG[p.prvek].druh;
    if (druh === "mostovka") {
      naMostovce.add(p.a);
      naMostovce.add(p.b);
    } else upravy.push({ prut: p.id, pryc: true });
    for (const prvek of uroven.povolenePrvky) {
      if (prvek !== p.prvek && KATALOG[prvek].druh === druh && KATALOG[prvek].hotovo) upravy.push({ prut: p.id, prvek });
    }
  }
  const obsazeno = new Set(navrh.stycniky.map((s) => `${s.x},${s.y}`));
  const podpory = new Set([...uroven.kotvy, ...uroven.zaklady].map((k) => `${k.x},${k.y}`));
  for (const s of navrh.stycniky) {
    const dilcu = navrh.pruty.filter((p) => (p.a === s.id || p.b === s.id) && KATALOG[p.prvek].druh === "mostovka").length;
    if ((dilcu === 0 || dilcu === 2) && !s.zamek) upravy.push({ stycnik: s.id, pryc: true });
    if (s.svar) upravy.push({ stycnik: s.id, svar: false });
    const zavazi = s.zavazi ?? 0;
    if (zavazi > 0) {
      // Žádné, polovina (na krok závaží) a o jeden krok míň.
      const pul = Math.floor(zavazi / 2 / KROK_ZAVAZI) * KROK_ZAVAZI;
      const oKrok = zavazi - KROK_ZAVAZI;
      upravy.push({ stycnik: s.id, zavazi: 0 });
      if (pul > 0 && pul < zavazi) upravy.push({ stycnik: s.id, zavazi: pul });
      if (oKrok > 0 && oKrok !== pul) upravy.push({ stycnik: s.id, zavazi: oKrok });
    }
    if (s.tlumic) {
      const pul = Math.floor(s.tlumic.hmota / 2 / LADENY_TLUMIC.krokHmoty) * LADENY_TLUMIC.krokHmoty;
      upravy.push({ stycnik: s.id, tlumic: 0 });
      if (pul >= LADENY_TLUMIC.nejmensiHmota && pul < s.tlumic.hmota) upravy.push({ stycnik: s.id, tlumic: pul });
    }
    if (naMostovce.has(s.id) || s.zamek || podpory.has(`${s.x},${s.y}`)) continue;
    for (const [dx, dy] of SOUSEDE) {
      if (!obsazeno.has(`${s.x + dx},${s.y + dy}`)) upravy.push({ stycnik: s.id, x: s.x + dx, y: s.y + dy });
    }
  }
  const ted = hodnotaMostu(navrh, uroven, meritko);
  return upravy
    .map((uprava) => ({ uprava, uspora: ted - hodnotaMostu(pouzijUpravy(navrh, [uprava]), uroven, meritko) }))
    .filter((k) => k.uspora > 1e-9)
    .sort((x, y) => y.uspora - x.uspora);
}

export interface Zestihleni {
  /** Úpravy výchozího mostu v pořadí, v jakém je hledání přijalo. */
  upravy: Uprava[];
  navrh: NavrhMostu;
  /** Kolik zkoušek hledání stálo. */
  zkousek: number;
}

/**
 * Ubírá z mostu, dokud je co: zkouší úpravy od největší úspory a nechá si každou, se kterou most
 * pořád `obstoji` (zkouška; `lzePostavit` je levná kontrola návrhu před ní). Úprava jednou
 * odmítnutá se v témž průchodu nezkouší znovu; další průchod ji zkusí zas (odstraněný prut
 * může uvolnit jiný) a hledání končí průchodem, který nic nepřijal, nebo po `nejvicZkousek`
 * zkouškách. Stejný vstup dá vždy stejný výsledek.
 */
export function zestihli(
  uroven: Uroven,
  vychozi: NavrhMostu,
  meritko: Meritko,
  obstoji: (navrh: NavrhMostu) => boolean,
  lzePostavit: (navrh: NavrhMostu) => boolean = () => true,
  nejvicZkousek = 400,
): Zestihleni {
  let navrh = vychozi;
  const upravy: Uprava[] = [];
  let zkousek = 0;
  for (let zmena = true; zmena && zkousek < nejvicZkousek; ) {
    zmena = false;
    const odmitnute = new Set<string>();
    while (zkousek < nejvicZkousek) {
      const dalsi = kandidatiUprav(navrh, uroven, meritko).find((k) => !odmitnute.has(klic(k.uprava)));
      if (!dalsi) break;
      const zkus = pouzijUpravy(navrh, [dalsi.uprava]);
      if (!lzePostavit(zkus)) {
        odmitnute.add(klic(dalsi.uprava));
        continue;
      }
      zkousek++;
      if (obstoji(zkus)) {
        navrh = zkus;
        upravy.push(dalsi.uprava);
        zmena = true;
      } else odmitnute.add(klic(dalsi.uprava));
    }
  }
  return { upravy, navrh, zkousek };
}
