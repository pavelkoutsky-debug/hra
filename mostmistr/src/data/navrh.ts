import { jeUvnitr } from "./geometrie";
import { ID_PRVKU, KATALOG, NEJMENSI_DELKA, type IdPrvku } from "./katalog";
import { ChybaDat, cislo, jedenZ, jenZnameKlice, logicka, polozky, text, objekt, volitelne } from "./kontrola";
import { prevedNaAktualni, type Prevod } from "./prevody";
import type { Uroven } from "./uroven";

export const VERZE_NAVRHU = 1;

/** Převody ze starších verzí formátu návrhu; viz `prevedNaAktualni`. */
const PREVODY_NAVRHU: readonly Prevod[] = [];

export interface StycnikNavrhu {
  id: number;
  /** Poloha na rastru 1 m. */
  x: number;
  y: number;
  /** Tuhý spoj všech připojených prutů. Výchozí je kloub. */
  svar?: boolean;
  /** Dělicí zámek zvedacího mostu. */
  zamek?: boolean;
  /** Přidaná hmota v kg. */
  zavazi?: number;
}

export interface PrutNavrhu {
  id: number;
  /** Id koncových styčníků. */
  a: number;
  b: number;
  prvek: IdPrvku;
  /** Předpětí lana jako podíl jeho pevnosti, 0 až 1. */
  predpeti?: number;
  /** Tuhost pružiny v N/m. */
  tuhost?: number;
  /** Součinitel tlumiče v N·s/m. */
  tlumeni?: number;
  /** Délka vysunutého pístu v metrech. */
  vysunuti?: number;
}

/** Most, jak ho hráč nakreslil. Neobsahuje ceny ani výsledky; ty se počítají z katalogu a zkouškou. */
export interface NavrhMostu {
  verze: typeof VERZE_NAVRHU;
  /** Id úrovně, pro kterou návrh vznikl. */
  uroven: string;
  stycniky: StycnikNavrhu[];
  pruty: PrutNavrhu[];
}

function stycnik(h: unknown, cesta: string): StycnikNavrhu {
  const o = objekt(h, cesta);
  jenZnameKlice(o, cesta, ["id", "x", "y", "svar", "zamek", "zavazi"]);
  const s: StycnikNavrhu = {
    id: cislo(o.id, `${cesta}.id`, { min: 0, cele: true }),
    x: cislo(o.x, `${cesta}.x`, { cele: true }),
    y: cislo(o.y, `${cesta}.y`, { cele: true }),
  };
  const svar = volitelne(o.svar, (v) => logicka(v, `${cesta}.svar`));
  if (svar !== undefined) s.svar = svar;
  const zamek = volitelne(o.zamek, (v) => logicka(v, `${cesta}.zamek`));
  if (zamek !== undefined) s.zamek = zamek;
  const zavazi = volitelne(o.zavazi, (v) => cislo(v, `${cesta}.zavazi`, { min: 0 }));
  if (zavazi !== undefined) s.zavazi = zavazi;
  return s;
}

function prut(h: unknown, cesta: string): PrutNavrhu {
  const o = objekt(h, cesta);
  jenZnameKlice(o, cesta, ["id", "a", "b", "prvek", "predpeti", "tuhost", "tlumeni", "vysunuti"]);
  const p: PrutNavrhu = {
    id: cislo(o.id, `${cesta}.id`, { min: 0, cele: true }),
    a: cislo(o.a, `${cesta}.a`, { min: 0, cele: true }),
    b: cislo(o.b, `${cesta}.b`, { min: 0, cele: true }),
    prvek: jedenZ(o.prvek, `${cesta}.prvek`, ID_PRVKU),
  };
  const predpeti = volitelne(o.predpeti, (v) => cislo(v, `${cesta}.predpeti`, { min: 0, max: 1 }));
  if (predpeti !== undefined) p.predpeti = predpeti;
  const tuhost = volitelne(o.tuhost, (v) => cislo(v, `${cesta}.tuhost`, { min: 0 }));
  if (tuhost !== undefined) p.tuhost = tuhost;
  const tlumeni = volitelne(o.tlumeni, (v) => cislo(v, `${cesta}.tlumeni`, { min: 0 }));
  if (tlumeni !== undefined) p.tlumeni = tlumeni;
  const vysunuti = volitelne(o.vysunuti, (v) => cislo(v, `${cesta}.vysunuti`, { min: 0 }));
  if (vysunuti !== undefined) p.vysunuti = vysunuti;
  return p;
}

/**
 * Přečte návrh mostu z dat neznámého tvaru a zkontroluje jeho vnitřní stavbu:
 * jedinečná id, pruty mezi existujícími styčníky. Pravidla úrovně hlídá `zkontrolujNavrh`.
 */
export function nactiNavrh(data: unknown): NavrhMostu {
  const c = "navrh";
  const o = prevedNaAktualni(data, VERZE_NAVRHU, PREVODY_NAVRHU, c);
  jenZnameKlice(o, c, ["verze", "uroven", "stycniky", "pruty"]);

  const navrh: NavrhMostu = {
    verze: VERZE_NAVRHU,
    uroven: text(o.uroven, `${c}.uroven`),
    stycniky: polozky(o.stycniky, `${c}.stycniky`, stycnik),
    pruty: polozky(o.pruty, `${c}.pruty`, prut),
  };

  const idStycniku = new Set<number>();
  navrh.stycniky.forEach((s, i) => {
    if (idStycniku.has(s.id)) throw new ChybaDat(`${c}.stycniky[${i}].id`, "id styčníku se opakuje");
    idStycniku.add(s.id);
  });
  const idPrutu = new Set<number>();
  navrh.pruty.forEach((p, i) => {
    if (idPrutu.has(p.id)) throw new ChybaDat(`${c}.pruty[${i}].id`, "id prutu se opakuje");
    idPrutu.add(p.id);
    if (p.a === p.b) throw new ChybaDat(`${c}.pruty[${i}]`, "prut začíná i končí ve stejném styčníku");
    if (!idStycniku.has(p.a)) throw new ChybaDat(`${c}.pruty[${i}].a`, `styčník ${p.a} v návrhu není`);
    if (!idStycniku.has(p.b)) throw new ChybaDat(`${c}.pruty[${i}].b`, `styčník ${p.b} v návrhu není`);
  });
  return navrh;
}

export function navrhNaText(navrh: NavrhMostu): string {
  return JSON.stringify(navrh);
}

export function navrhZTextu(zapis: string): NavrhMostu {
  let data: unknown;
  try {
    data = JSON.parse(zapis);
  } catch {
    throw new ChybaDat("navrh", "text není platný zápis mostu");
  }
  return nactiNavrh(data);
}

export type DruhProblemu =
  | "jina-uroven"
  | "stycnik-mimo-vyrez"
  | "stycnik-v-zakazane-zone"
  | "stycniky-na-stejnem-miste"
  | "prut-dvakrat"
  | "prut-kratky"
  | "prut-dlouhy"
  | "prvek-nepovoleny"
  | "prvek-neni-hotovy"
  | "svar-nepovoleny";

/** Porušení pravidla úrovně. `stycnik` a `prut` jsou id z návrhu. */
export interface ProblemNavrhu {
  druh: DruhProblemu;
  stycnik?: number;
  prut?: number;
}

/**
 * Zkontroluje návrh proti pravidlům úrovně a katalogu. Vrací všechny problémy najednou,
 * aby je editor mohl ukázat přímo na výkresu; prázdný seznam znamená, že most lze zkoušet.
 */
export function zkontrolujNavrh(navrh: NavrhMostu, uroven: Uroven): ProblemNavrhu[] {
  const problemy: ProblemNavrhu[] = [];
  if (navrh.uroven !== uroven.id) problemy.push({ druh: "jina-uroven" });

  const podleId = new Map(navrh.stycniky.map((s) => [s.id, s]));
  const obsazeno = new Map<string, number>();
  for (const s of navrh.stycniky) {
    if (!jeUvnitr(uroven.vyrez, s)) problemy.push({ druh: "stycnik-mimo-vyrez", stycnik: s.id });
    // Zóna zakazuje vnitřek; styčník na její hraně je v pořádku.
    const vZone = uroven.zakazaneZony.some(
      (z) => s.x > z.xMin && s.x < z.xMax && s.y > z.yMin && s.y < z.yMax,
    );
    if (vZone) problemy.push({ druh: "stycnik-v-zakazane-zone", stycnik: s.id });
    const klic = `${s.x},${s.y}`;
    if (obsazeno.has(klic)) problemy.push({ druh: "stycniky-na-stejnem-miste", stycnik: s.id });
    else obsazeno.set(klic, s.id);
    if (s.svar && !uroven.povoleneSvary) problemy.push({ druh: "svar-nepovoleny", stycnik: s.id });
  }

  const dvojice = new Set<string>();
  for (const p of navrh.pruty) {
    const a = podleId.get(p.a);
    const b = podleId.get(p.b);
    if (!a || !b) continue; // nactiNavrh to nepustí; pojistka pro ručně složený návrh
    const klic = p.a < p.b ? `${p.a}-${p.b}` : `${p.b}-${p.a}`;
    if (dvojice.has(klic)) problemy.push({ druh: "prut-dvakrat", prut: p.id });
    dvojice.add(klic);

    const delka = Math.hypot(b.x - a.x, b.y - a.y);
    const polozka = KATALOG[p.prvek];
    if (delka < NEJMENSI_DELKA) problemy.push({ druh: "prut-kratky", prut: p.id });
    if (delka > polozka.nejvetsiDelka + 1e-9) problemy.push({ druh: "prut-dlouhy", prut: p.id });
    if (!uroven.povolenePrvky.includes(p.prvek)) problemy.push({ druh: "prvek-nepovoleny", prut: p.id });
    if (!polozka.hotovo) problemy.push({ druh: "prvek-neni-hotovy", prut: p.id });
  }
  return problemy;
}
