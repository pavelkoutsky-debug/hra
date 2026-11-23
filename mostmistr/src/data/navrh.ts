import { cenaNavrhu } from "./cena";
import { jeUvnitr, type Bod, type Obdelnik } from "./geometrie";
import { ID_PRVKU, KATALOG, LADENY_TLUMIC, NEJMENSI_DELKA, PREDPETI_LANA, type IdPrvku } from "./katalog";
import { ChybaDat, cislo, jedenZ, jenZnameKlice, logicka, polozky, text, objekt, volitelne } from "./kontrola";
import { prevedNaAktualni, type Prevod } from "./prevody";
import { bodNaTrase, vyskaTerenu, type Trasa, type Uroven } from "./uroven";

export const VERZE_NAVRHU = 3;

/** Převody ze starších verzí formátu návrhu; viz `prevedNaAktualni`. */
const PREVODY_NAVRHU: readonly Prevod[] = [
  // 1 → 2: styčník může nést laděný tlumič. Starší návrhy ho neznaly a nic se v nich nemění.
  (stary) => stary,
  // 2 → 3: předpětí lana smí být záporné (povolené lano, delší než nakreslené) i větší než 1.
  // Starší návrhy měly jen 0 až 1 a nic se v nich nemění.
  (stary) => stary,
];

/** Laděný tlumič zavěšený pod styčníkem: hmotnost závaží v kg a frekvence ladění v Hz. */
export interface TlumicStycniku {
  hmota: number;
  frekvence: number;
}

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
  /** Laděný tlumič zavěšený pod styčníkem. */
  tlumic?: TlumicStycniku;
}

export interface PrutNavrhu {
  id: number;
  /** Id koncových styčníků. */
  a: number;
  b: number;
  prvek: IdPrvku;
  /**
   * Nastavení napínáku lana jako předpětí: podíl pevnosti, kterým by lano táhlo, kdyby jeho
   * konce zůstaly, kde jsou nakreslené. Kladné lano zkracuje, záporné prodlužuje; viz `PREDPETI_LANA`.
   */
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
  jenZnameKlice(o, cesta, ["id", "x", "y", "svar", "zamek", "zavazi", "tlumic"]);
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
  const tlumic = volitelne(o.tlumic, (v) => {
    const t = objekt(v, `${cesta}.tlumic`);
    jenZnameKlice(t, `${cesta}.tlumic`, ["hmota", "frekvence"]);
    return {
      hmota: cislo(t.hmota, `${cesta}.tlumic.hmota`, { min: 0 }),
      frekvence: cislo(t.frekvence, `${cesta}.tlumic.frekvence`, { min: 0 }),
    };
  });
  if (tlumic !== undefined) s.tlumic = tlumic;
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
  const predpeti = volitelne(o.predpeti, (v) => cislo(v, `${cesta}.predpeti`, { min: PREDPETI_LANA.nejmensi, max: PREDPETI_LANA.nejvetsi }));
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
  | "svar-nepovoleny"
  | "pilir-mimo-zaklad"
  | "pilir-sikmy"
  | "zaklad-jen-pilir"
  | "stycnik-v-terenu"
  | "prut-v-zakazane-zone"
  | "zavazi-nepovolene"
  | "ladeny-tlumic-nepovoleny"
  | "ladeny-tlumic-mimo-rozsah"
  | "tlumeni-mimo-rozsah"
  | "predpeti-mimo-rozsah"
  | "kolejiste-mimo-kolej"
  | "mostovka-na-koleji"
  | "nad-rozpocet";

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
    if ((s.zavazi ?? 0) > uroven.nejvetsiZavazi) problemy.push({ druh: "zavazi-nepovolene", stycnik: s.id });
    if (s.tlumic) {
      const { hmota, frekvence } = s.tlumic;
      if (hmota > uroven.nejvetsiTlumic) problemy.push({ druh: "ladeny-tlumic-nepovoleny", stycnik: s.id });
      const mimo =
        hmota < LADENY_TLUMIC.nejmensiHmota ||
        frekvence < LADENY_TLUMIC.nejmensiFrekvence - 1e-9 ||
        frekvence > LADENY_TLUMIC.nejvetsiFrekvence + 1e-9;
      if (mimo) problemy.push({ druh: "ladeny-tlumic-mimo-rozsah", stycnik: s.id });
    }
    // Pod povrchem terénu se staví jen v kotvách a na základech.
    const vOpore = uroven.kotvy.some((k) => k.x === s.x && k.y === s.y) || uroven.zaklady.some((z) => z.x === s.x && z.y === s.y);
    if (!vOpore && s.y < vyskaTerenu(uroven, s.x) - 1e-9) problemy.push({ druh: "stycnik-v-terenu", stycnik: s.id });
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
    const rozsah = polozka.tlumeni;
    if (rozsah && p.tlumeni !== undefined && (p.tlumeni < rozsah.nejmensi || p.tlumeni > rozsah.nejvetsi)) {
      problemy.push({ druh: "tlumeni-mimo-rozsah", prut: p.id });
    }
    if (p.predpeti !== undefined && (p.predpeti < PREDPETI_LANA.nejmensi || p.predpeti > PREDPETI_LANA.nejvetsi)) {
      problemy.push({ druh: "predpeti-mimo-rozsah", prut: p.id });
    }
    if (uroven.zakazaneZony.some((z) => useckaProtinaVnitrek(a, b, z))) {
      problemy.push({ druh: "prut-v-zakazane-zone", prut: p.id });
    }
    // Kolejiště patří jen na kolej a na kolej nepatří nic jiného: vlak po silniční mostovce
    // nepojede a propadl by jí, aniž by hráč tušil proč.
    if (polozka.druh === "mostovka") {
      const poKoleji = uroven.trasy.some((t) => t.druh === "kolej" && bodNaTrase(t, a) && bodNaTrase(t, b));
      if (p.prvek === "kolejiste" && !poKoleji) problemy.push({ druh: "kolejiste-mimo-kolej", prut: p.id });
      else if (p.prvek !== "kolejiste" && poKoleji) problemy.push({ druh: "mostovka-na-koleji", prut: p.id });
    }
    if (polozka.druh === "pilir") {
      // Pilíř je sloup: smí se naklonit, ale ne ležet. Položený by sloužil jako betonový trám
      // několikrát únosnější než mostovka, a to pilíř ve hře být nemá.
      if (2 * Math.abs(b.x - a.x) > Math.abs(b.y - a.y)) problemy.push({ druh: "pilir-sikmy", prut: p.id });
    } else {
      // Základ je patka pilíře; jiný prut do něj nevede (opěry a kotvy lan jsou kotvy úrovně).
      const naZaklade = (s: StycnikNavrhu): boolean =>
        uroven.zaklady.some((z) => z.x === s.x && z.y === s.y) && !uroven.kotvy.some((k) => k.x === s.x && k.y === s.y);
      if (naZaklade(a) || naZaklade(b)) problemy.push({ druh: "zaklad-jen-pilir", prut: p.id });
    }
  }
  for (const id of pilireMimoZaklad(navrh, uroven)) problemy.push({ druh: "pilir-mimo-zaklad", prut: id });
  if (uroven.rozpocet !== null && cenaNavrhu(navrh) > uroven.rozpocet) problemy.push({ druh: "nad-rozpocet" });
  return problemy;
}

/** Úsek trasy bez mostovky: od kterého do kterého metru (souřadnice x) na trase nic neleží. */
export interface MezeraTrasy {
  trasa: Trasa;
  od: number;
  do: number;
}

/**
 * Kde na trasách úrovně chybí mostovka: úseky mezi konci trasy, nad kterými neleží žádný
 * prut mostovky správného druhu (kolejiště na koleji, silniční mostovka jinde). Provoz v nich
 * nemá po čem jet a spadne; výsledek zkoušky podle toho hráči řekne proč.
 */
export function mezeryTras(navrh: NavrhMostu, uroven: Uroven): MezeraTrasy[] {
  const podleId = new Map(navrh.stycniky.map((s) => [s.id, s]));
  const mezery: MezeraTrasy[] = [];
  for (const trasa of uroven.trasy) {
    const kolej = trasa.druh === "kolej";
    const useky: [number, number][] = [];
    for (const p of navrh.pruty) {
      if (KATALOG[p.prvek].druh !== "mostovka" || (p.prvek === "kolejiste") !== kolej) continue;
      const a = podleId.get(p.a);
      const b = podleId.get(p.b);
      if (!a || !b || !bodNaTrase(trasa, a) || !bodNaTrase(trasa, b)) continue;
      useky.push([Math.min(a.x, b.x), Math.max(a.x, b.x)]);
    }
    useky.sort((p, q) => p[0] - q[0]);
    let pokryto = Math.min(trasa.zacatek.x, trasa.konec.x);
    const konec = Math.max(trasa.zacatek.x, trasa.konec.x);
    for (const [od, po] of useky) {
      if (od > pokryto + 1e-9) mezery.push({ trasa, od: pokryto, do: Math.min(od, konec) });
      if (po > pokryto) pokryto = po;
    }
    if (pokryto < konec - 1e-9) mezery.push({ trasa, od: pokryto, do: konec });
  }
  return mezery;
}

/**
 * Pilíře (id prutů), které nestojí na základu: pilíř musí začínat v základu vyznačeném
 * v úrovni, nebo navazovat na pilíř, který na základu stojí.
 */
export function pilireMimoZaklad(navrh: NavrhMostu, uroven: Uroven): number[] {
  const pilire = navrh.pruty.filter((p) => KATALOG[p.prvek].druh === "pilir");
  if (pilire.length === 0) return [];
  const podleId = new Map(navrh.stycniky.map((s) => [s.id, s]));
  // Styčníky, kterých se dotýká pilíř stojící na základu; začíná se v základech.
  const nesene = new Set<number>();
  for (const s of navrh.stycniky) {
    if (uroven.zaklady.some((z) => z.x === s.x && z.y === s.y)) nesene.add(s.id);
  }
  const stoji = new Set<number>();
  let pribylo = true;
  while (pribylo) {
    pribylo = false;
    for (const p of pilire) {
      if (stoji.has(p.id) || !podleId.has(p.a) || !podleId.has(p.b)) continue;
      if (!nesene.has(p.a) && !nesene.has(p.b)) continue;
      stoji.add(p.id);
      nesene.add(p.a);
      nesene.add(p.b);
      pribylo = true;
    }
  }
  return pilire.filter((p) => !stoji.has(p.id)).map((p) => p.id);
}

/**
 * Prochází úsečka a–b vnitřkem obdélníku? Dotyk hrany nebo rohu se nepočítá: po hraně
 * zakázané zóny se stavět smí. Ořezání úsečky obdélníkem (Liang–Barsky).
 */
export function useckaProtinaVnitrek(a: Bod, b: Bod, z: Obdelnik): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let od = 0;
  let po = 1;
  const orez = (smer: number, vzdalenost: number): boolean => {
    if (smer === 0) return vzdalenost > 0; // rovnoběžně s hranou: musí ležet ostře uvnitř pásu
    const t = vzdalenost / smer;
    if (smer < 0) od = Math.max(od, t);
    else po = Math.min(po, t);
    return od < po;
  };
  return (
    orez(-dx, a.x - z.xMin) && orez(dx, z.xMax - a.x) && orez(-dy, a.y - z.yMin) && orez(dy, z.yMax - a.y) && po - od > 1e-9
  );
}
