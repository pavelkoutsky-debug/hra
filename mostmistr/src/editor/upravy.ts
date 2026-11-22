// Úpravy návrhu mostu: čisté funkce, které z návrhu udělají nový. Původní návrh se
// nemění, takže historie úprav (zpět a znovu) je jen řada návrhů.

import type { Bod } from "../data/geometrie";
import { KATALOG, PREDPETI_LANA, type IdPrvku } from "../data/katalog";
import { VERZE_NAVRHU, type NavrhMostu, type PrutNavrhu, type StycnikNavrhu, type TlumicStycniku } from "../data/navrh";

export function prazdnyNavrh(idUrovne: string): NavrhMostu {
  return { verze: VERZE_NAVRHU, uroven: idUrovne, stycniky: [], pruty: [] };
}

export function stycnikV(navrh: NavrhMostu, bod: Bod): StycnikNavrhu | undefined {
  return navrh.stycniky.find((s) => s.x === bod.x && s.y === bod.y);
}

function volneId(polozky: readonly { id: number }[]): number {
  let nejvyssi = -1;
  for (const p of polozky) if (p.id > nejvyssi) nejvyssi = p.id;
  return nejvyssi + 1;
}

/** Existuje už prut mezi styčníky `a` a `b` (v libovolném směru)? */
export function prutMezi(navrh: NavrhMostu, a: number, b: number): PrutNavrhu | undefined {
  return navrh.pruty.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
}

/** Nový prut daného prvku s výchozím nastavením: lano je od začátku mírně napnuté. */
function novyPrut(id: number, a: number, b: number, prvek: IdPrvku): PrutNavrhu {
  const prut: PrutNavrhu = { id, a, b, prvek };
  if (KATALOG[prvek].druh === "lano") prut.predpeti = PREDPETI_LANA.vychozi;
  return prut;
}

/**
 * Přidá prut mezi dvěma body rastru; styčníky, které v nich ještě nejsou, založí.
 * Když tam prut už je, jen mu změní prvek.
 */
export function pridejPrut(navrh: NavrhMostu, a: Bod, b: Bod, prvek: IdPrvku): NavrhMostu {
  const stycniky = [...navrh.stycniky];
  const idV = (bod: Bod): number => {
    const existujici = stycniky.find((s) => s.x === bod.x && s.y === bod.y);
    if (existujici) return existujici.id;
    const id = volneId(stycniky);
    stycniky.push({ id, x: bod.x, y: bod.y });
    return id;
  };
  const idA = idV(a);
  const idB = idV(b);
  const stavajici = prutMezi(navrh, idA, idB);
  if (stavajici) return zmenPrvek(navrh, [stavajici.id], prvek);
  return { ...navrh, stycniky, pruty: [...navrh.pruty, novyPrut(volneId(navrh.pruty), idA, idB, prvek)] };
}

/** Odstraní styčníky, do kterých nevede žádný prut. */
export function bezOsamelychStycniku(navrh: NavrhMostu): NavrhMostu {
  const pouzite = new Set<number>();
  for (const p of navrh.pruty) {
    pouzite.add(p.a);
    pouzite.add(p.b);
  }
  if (navrh.stycniky.every((s) => pouzite.has(s.id))) return navrh;
  return { ...navrh, stycniky: navrh.stycniky.filter((s) => pouzite.has(s.id)) };
}

/** Smaže dané pruty a styčníky; se styčníkem zmizí i všechny pruty, které do něj vedou. */
export function smaz(navrh: NavrhMostu, pruty: ReadonlySet<number>, stycniky: ReadonlySet<number>): NavrhMostu {
  const zbyle = navrh.pruty.filter((p) => !pruty.has(p.id) && !stycniky.has(p.a) && !stycniky.has(p.b));
  return bezOsamelychStycniku({ ...navrh, pruty: zbyle });
}

/** Změní prvek daných prutů; parametry, které k novému prvku nepatří, zahodí. */
export function zmenPrvek(navrh: NavrhMostu, pruty: Iterable<number>, prvek: IdPrvku): NavrhMostu {
  const menene = new Set(pruty);
  let zmena = false;
  const nove = navrh.pruty.map((p) => {
    if (!menene.has(p.id) || p.prvek === prvek) return p;
    zmena = true;
    return novyPrut(p.id, p.a, p.b, prvek);
  });
  return zmena ? { ...navrh, pruty: nove } : navrh;
}

/** Nastaví závaží daným styčníkům; `kg` dostane dosavadní hodnotu a vrátí novou (0 závaží odebere). */
export function nastavZavazi(
  navrh: NavrhMostu,
  stycniky: ReadonlySet<number>,
  kg: (dosavadni: number) => number,
): NavrhMostu {
  let zmena = false;
  const nove = navrh.stycniky.map((s) => {
    if (!stycniky.has(s.id)) return s;
    const dosavadni = s.zavazi ?? 0;
    const hodnota = Math.max(0, kg(dosavadni));
    if (hodnota === dosavadni) return s;
    zmena = true;
    const { zavazi: _stare, ...bez } = s;
    return hodnota > 0 ? { ...bez, zavazi: hodnota } : bez;
  });
  return zmena ? { ...navrh, stycniky: nove } : navrh;
}

/**
 * Nastaví laděný tlumič daným styčníkům; `novy` dostane dosavadní (nebo undefined) a vrátí
 * nový, případně undefined, když má tlumič zmizet.
 */
export function nastavLadenyTlumic(
  navrh: NavrhMostu,
  stycniky: ReadonlySet<number>,
  novy: (dosavadni: TlumicStycniku | undefined) => TlumicStycniku | undefined,
): NavrhMostu {
  let zmena = false;
  const nove = navrh.stycniky.map((s) => {
    if (!stycniky.has(s.id)) return s;
    const tlumic = novy(s.tlumic);
    if (tlumic?.hmota === s.tlumic?.hmota && tlumic?.frekvence === s.tlumic?.frekvence) return s;
    zmena = true;
    const { tlumic: _stary, ...bez } = s;
    return tlumic ? { ...bez, tlumic: { hmota: tlumic.hmota, frekvence: tlumic.frekvence } } : bez;
  });
  return zmena ? { ...navrh, stycniky: nove } : navrh;
}

/** Nastaví součinitel tlumení daným prutům; `hodnota` dostane dosavadní (nebo undefined) a vrátí novou. */
export function nastavTlumeni(
  navrh: NavrhMostu,
  pruty: ReadonlySet<number>,
  hodnota: (dosavadni: number | undefined) => number,
): NavrhMostu {
  let zmena = false;
  const nove = navrh.pruty.map((p) => {
    if (!pruty.has(p.id)) return p;
    const nova = hodnota(p.tlumeni);
    if (nova === p.tlumeni) return p;
    zmena = true;
    return { ...p, tlumeni: nova };
  });
  return zmena ? { ...navrh, pruty: nove } : navrh;
}

/**
 * Nastaví napínáky daných lan (předpětí v rozsahu `PREDPETI_LANA`; záporné lano povoluje);
 * `hodnota` dostane id lana a dosavadní předpětí a vrátí nové. Jiných prutů než lan se nedotkne.
 */
export function nastavPredpeti(
  navrh: NavrhMostu,
  pruty: ReadonlySet<number>,
  hodnota: (id: number, dosavadni: number) => number,
): NavrhMostu {
  let zmena = false;
  const nove = navrh.pruty.map((p) => {
    if (!pruty.has(p.id) || KATALOG[p.prvek].druh !== "lano") return p;
    const dosavadni = p.predpeti ?? 0;
    const nova = Math.max(PREDPETI_LANA.nejmensi, Math.min(PREDPETI_LANA.nejvetsi, hodnota(p.id, dosavadni)));
    if (nova === dosavadni && p.predpeti !== undefined) return p;
    zmena = true;
    return { ...p, predpeti: nova };
  });
  return zmena ? { ...navrh, pruty: nove } : navrh;
}

/** Svaří dané styčníky (`svar` true), nebo z nich svar odebere. */
export function nastavSvar(navrh: NavrhMostu, stycniky: ReadonlySet<number>, svar: boolean): NavrhMostu {
  let zmena = false;
  const nove = navrh.stycniky.map((s) => {
    if (!stycniky.has(s.id) || (s.svar === true) === svar) return s;
    zmena = true;
    const { svar: _stary, ...bez } = s;
    return svar ? { ...bez, svar: true } : bez;
  });
  return zmena ? { ...navrh, stycniky: nove } : navrh;
}

/**
 * Posune styčník na jiný bod rastru. Vrací null, když tam už jiný styčník je:
 * slučování styčníků tažením by snadno vyrobilo nechtěné pruty nulové délky.
 */
export function posunStycnik(navrh: NavrhMostu, id: number, kam: Bod): NavrhMostu | null {
  const obsazeno = navrh.stycniky.some((s) => s.id !== id && s.x === kam.x && s.y === kam.y);
  if (obsazeno) return null;
  return { ...navrh, stycniky: navrh.stycniky.map((s) => (s.id === id ? { ...s, x: kam.x, y: kam.y } : s)) };
}

/**
 * Doplní zrcadlové obrazy prutů podle svislé osy x = `osa`. Bez výběru zrcadlí celý most,
 * jinak jen vybrané pruty. Pruty, jejichž obraz v návrhu už je, nepřidává.
 */
export function zrcadli(navrh: NavrhMostu, osa: number, jen?: ReadonlySet<number>): NavrhMostu {
  const podleId = new Map(navrh.stycniky.map((s) => [s.id, s]));
  let vysledek = navrh;
  for (const p of navrh.pruty) {
    if (jen && jen.size > 0 && !jen.has(p.id)) continue;
    const a = podleId.get(p.a);
    const b = podleId.get(p.b);
    if (!a || !b) continue;
    const obrazA = { x: 2 * osa - a.x, y: a.y };
    const obrazB = { x: 2 * osa - b.x, y: b.y };
    const stavajiciA = stycnikV(vysledek, obrazA);
    const stavajiciB = stycnikV(vysledek, obrazB);
    if (stavajiciA && stavajiciB && prutMezi(vysledek, stavajiciA.id, stavajiciB.id)) continue;
    vysledek = pridejPrut(vysledek, obrazA, obrazB, p.prvek);
    // Obraz má stejné nastavení jako předloha: tlumení a předpětí prutu, svar a závaží v jeho koncích.
    const idA = stycnikV(vysledek, obrazA)!.id;
    const idB = stycnikV(vysledek, obrazB)!.id;
    if (p.tlumeni !== undefined) {
      const obraz = prutMezi(vysledek, idA, idB)!;
      const tlumeni = p.tlumeni;
      vysledek = nastavTlumeni(vysledek, new Set([obraz.id]), () => tlumeni);
    }
    if (p.predpeti !== undefined) {
      const obraz = prutMezi(vysledek, idA, idB)!;
      const predpeti = p.predpeti;
      vysledek = nastavPredpeti(vysledek, new Set([obraz.id]), () => predpeti);
    }
    for (const [vzor, obraz] of [[a, idA], [b, idB]] as const) {
      if (vzor.svar) vysledek = nastavSvar(vysledek, new Set([obraz]), true);
      const zavazi = vzor.zavazi;
      if (zavazi) vysledek = nastavZavazi(vysledek, new Set([obraz]), (dosavadni) => Math.max(dosavadni, zavazi));
      const tlumic = vzor.tlumic;
      if (tlumic) vysledek = nastavLadenyTlumic(vysledek, new Set([obraz]), (dosavadni) => dosavadni ?? tlumic);
    }
  }
  return vysledek;
}
