import { cenaNavrhu } from "./cena";
import { jeUvnitr, type Bod, type Obdelnik } from "./geometrie";
import { ID_PRVKU, KATALOG, LADENY_TLUMIC, NEJMENSI_DELKA, PIST, PREDPETI_LANA, zdvihPistu, type IdPrvku } from "./katalog";
import { ChybaDat, cislo, jedenZ, jenZnameKlice, logicka, polozky, text, objekt, volitelne } from "./kontrola";
import { prevedNaAktualni, type Prevod } from "./prevody";
import { bodNaTrase, vyskaTerenu, type Trasa, type Uroven } from "./uroven";

export const VERZE_NAVRHU = 4;

/** Převody ze starších verzí formátu návrhu; viz `prevedNaAktualni`. */
const PREVODY_NAVRHU: readonly Prevod[] = [
  // 1 → 2: styčník může nést laděný tlumič. Starší návrhy ho neznaly a nic se v nich nemění.
  (stary) => stary,
  // 2 → 3: předpětí lana smí být záporné (povolené lano, delší než nakreslené) i větší než 1.
  // Starší návrhy měly jen 0 až 1 a nic se v nich nemění.
  (stary) => stary,
  // 3 → 4: píst nese zdvih (smí být záporný) místo délky po vysunutí. Písty do té doby hra
  // neuměla, takže starší návrh žádný mít nemůže; kdyby měl, údaj se zahodí.
  (stary) => ({
    ...stary,
    pruty: Array.isArray(stary.pruty)
      ? stary.pruty.map((p: unknown) => {
          if (typeof p !== "object" || p === null || !("vysunuti" in p)) return p;
          const { vysunuti: _vysunuti, ...zbytek } = p as Record<string, unknown>;
          return zbytek;
        })
      : stary.pruty,
  }),
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
  /**
   * Zdvih pístu v metrech: o kolik se píst při zvedání mostu prodlouží; záporný se zkracuje.
   * Když chybí, bere se výchozí (`zdvihPistu`).
   */
  zdvih?: number;
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
  jenZnameKlice(o, cesta, ["id", "a", "b", "prvek", "predpeti", "tuhost", "tlumeni", "zdvih"]);
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
  const zdvih = volitelne(o.zdvih, (v) => cislo(v, `${cesta}.zdvih`, { min: -8, max: 8 }));
  if (zdvih !== undefined) p.zdvih = zdvih;
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
  | "pilir-pahyl"
  | "kotva-jen-tlumic"
  | "stycnik-v-terenu"
  | "prut-v-zakazane-zone"
  | "zavazi-nepovolene"
  | "ladeny-tlumic-nepovoleny"
  | "ladeny-tlumic-mimo-rozsah"
  | "tlumeni-mimo-rozsah"
  | "predpeti-mimo-rozsah"
  | "zdvih-mimo-rozsah"
  | "zdvih-za-uvrati"
  | "zamek-nepovoleny"
  | "zamek-na-vetknuti"
  | "zamek-nedeli"
  | "zamek-vic-casti"
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
    if (s.zamek && !uroven.pohyb) problemy.push({ druh: "zamek-nepovoleny", stycnik: s.id });
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
    if (polozka.druh === "pist") {
      if (Math.abs(zdvihPistu(p.zdvih, delka)) > PIST.nejvetsiPodilZdvihu * delka + 1e-9) {
        problemy.push({ druh: "zdvih-mimo-rozsah", prut: p.id });
      } else if (uroven.pohyb) {
        const otoceni = otoceniKridla(navrh, uroven, p);
        if (otoceni !== null && otoceni.cos < COS_NEJVETSIHO_OTOCENI) problemy.push({ druh: "zdvih-za-uvrati", prut: p.id });
      }
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
    // Kotva vyhrazená tlumiči: nic jiného se o ni neopře.
    if (polozka.druh !== "tlumic") {
      const vyhrazena = (s: StycnikNavrhu): boolean => uroven.kotvy.some((k) => k.jen === "tlumic" && k.x === s.x && k.y === s.y);
      if (vyhrazena(a) || vyhrazena(b)) problemy.push({ druh: "kotva-jen-tlumic", prut: p.id });
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
  for (const id of prutyNaPahyluPilire(navrh)) problemy.push({ druh: "pilir-pahyl", prut: id });
  for (const z of zamkyNavrhu(navrh, uroven)) {
    if (z.druh === "vetknuti") problemy.push({ druh: "zamek-na-vetknuti", stycnik: z.stycnik });
    else if (z.druh === "nedeli") problemy.push({ druh: "zamek-nedeli", stycnik: z.stycnik });
    else if (z.druh === "vic") problemy.push({ druh: "zamek-vic-casti", stycnik: z.stycnik });
  }
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
 * Zámek návrhu a co při odemknutí udělá. `opera`: styčník leží na opěře s ložiskem (posuvná
 * kotva) a odemknutí mu vezme podporu. `kridla`: styčník spojuje dvě části mostu, které jinak
 * pohromadě nedrží; `druhaStrana` jsou id prutů, které při odemknutí odejdou s druhou částí.
 * Ostatní jsou chyby návrhu. `vetknuti`: zámek na čepu (pevné kotvě), ve vetknutí nebo na
 * základu; čep křídlo drží a zámek by ho pustil celé. `nedeli`: zámek nic nerozpojí. `vic`:
 * v zámku se potkávají tři a víc částí (počítá se i píst).
 */
export interface ZamekNavrhu {
  stycnik: number;
  druh: "opera" | "kridla" | "vetknuti" | "nedeli" | "vic";
  druhaStrana: number[];
}

/** Kosinus největšího úhlu, o který smí píst křídlo otočit: 70°. */
export const COS_NEJVETSIHO_OTOCENI = 0.3420201433256687;
/** Největší úhel otočení křídla ve stupních; jen pro texty. */
export const NEJVETSI_OTOCENI_KRIDLA = 70;

/**
 * O kolik píst křídlo otočí, když se vysune o svůj zdvih: kosinus úhlu otočení. Čep křídla se
 * hledá takto: pata pístu je konec v kotvě, do které nevede nic jiného než písty; druhý konec
 * drží křídlo, tedy pruty, ke kterým se od něj dá dojít bez pístů a bez průchodu zámkem. Čep
 * je jediná pevná kotva křídla bez zámku. Kde čep takhle určit nejde (píst mezi dvěma částmi
 * mostu, křídlo na dvou kotvách), vrací null a nic se nehlídá.
 *
 * Délka pístu L splňuje L² = D² + r² − 2·D·r·cos γ, kde D je vzdálenost paty od čepu, r
 * vzdálenost úchytu od čepu a γ úhel mezi nimi. Největší je v úvrati (γ = 180°), kde píst
 * leží v přímce s čepem a nemá žádné rameno; zdvih, který by vedl za ni, dá kosinus −1.
 * Jen sčítání, násobení, dělení a odmocnina, aby pravidlo vyšlo ve všech prohlížečích stejně.
 */
export function otoceniKridla(navrh: NavrhMostu, uroven: Uroven, pist: PrutNavrhu): { cos: number } | null {
  const podleId = new Map(navrh.stycniky.map((s) => [s.id, s]));
  const a = podleId.get(pist.a);
  const b = podleId.get(pist.b);
  if (!a || !b) return null;
  const jePist = (p: PrutNavrhu): boolean => KATALOG[p.prvek].druh === "pist";
  const kotva = (s: StycnikNavrhu): Uroven["kotvy"][number] | undefined => uroven.kotvy.find((k) => k.x === s.x && k.y === s.y);
  const jenPisty = (s: StycnikNavrhu): boolean => navrh.pruty.every((p) => (p.a !== s.id && p.b !== s.id) || jePist(p));
  const pataA = kotva(a) !== undefined && jenPisty(a);
  const pataB = kotva(b) !== undefined && jenPisty(b);
  if (pataA === pataB) return null;
  const pata = pataA ? a : b;
  const uchyt = pataA ? b : a;

  // Křídlo: všechno, k čemu se od úchytu dojde po prutech bez pístů; zámkem se neprochází.
  const kridlo = new Set<number>([uchyt.id]);
  const fronta = [uchyt.id];
  while (fronta.length > 0) {
    const i = fronta.pop()!;
    if (i !== uchyt.id && podleId.get(i)?.zamek) continue;
    for (const p of navrh.pruty) {
      if (jePist(p) || (p.a !== i && p.b !== i)) continue;
      const j = p.a === i ? p.b : p.a;
      if (kridlo.has(j)) continue;
      kridlo.add(j);
      fronta.push(j);
    }
  }
  let cep: StycnikNavrhu | null = null;
  for (const id of kridlo) {
    const s = podleId.get(id);
    if (!s || s.zamek) continue;
    const k = kotva(s);
    if (!k) continue;
    // Křídlo držené druhou kotvou se neotáčí; zámek by ji musel pustit.
    if (k.typ !== "pevna" || cep !== null) return null;
    cep = s;
  }
  if (!cep) return null;

  const D2 = (pata.x - cep.x) * (pata.x - cep.x) + (pata.y - cep.y) * (pata.y - cep.y);
  const r2 = (uchyt.x - cep.x) * (uchyt.x - cep.x) + (uchyt.y - cep.y) * (uchyt.y - cep.y);
  const L02 = (pata.x - uchyt.x) * (pata.x - uchyt.x) + (pata.y - uchyt.y) * (pata.y - uchyt.y);
  if (!(D2 > 0) || !(r2 > 0) || !(L02 > 0)) return null;
  const L0 = Math.sqrt(L02);
  const L = L0 + zdvihPistu(pist.zdvih, L0);
  const dvaDr = 2 * Math.sqrt(D2 * r2);
  const cos0 = (D2 + r2 - L02) / dvaDr;
  const cosT = (D2 + r2 - L * L) / dvaDr;
  // Délka, na kterou píst v žádné poloze křídla nedosáhne (za úvratí, nebo kratší než složený).
  if (!(cosT > -1 && cosT < 1)) return { cos: -1 };
  const sin0 = Math.sqrt(Math.max(0, 1 - cos0 * cos0));
  const sinT = Math.sqrt(1 - cosT * cosT);
  return { cos: cosT * cos0 + sinT * sin0 };
}

/**
 * Rozebere zámky návrhu. Části mostu se hledají v návrhu, ze kterého se vyjmou všechny
 * styčníky se zámkem mimo kotvy: pruty u zámku patří k téže části, když jejich vzdálené
 * konce spojuje cesta, která žádným takovým zámkem neprochází.
 */
export function zamkyNavrhu(navrh: NavrhMostu, uroven: Uroven): ZamekNavrhu[] {
  const zamky = navrh.stycniky.filter((s) => s.zamek);
  if (zamky.length === 0) return [];
  const vysledek: ZamekNavrhu[] = [];
  const mezi = new Set<number>();
  for (const s of zamky) {
    const kotva = uroven.kotvy.find((k) => k.x === s.x && k.y === s.y);
    const zaklad = uroven.zaklady.some((z) => z.x === s.x && z.y === s.y);
    // Zámek na opěře patří na ložisko. Čep (pevná kotva) křídlo drží i při zvedání.
    if (zaklad || (kotva && kotva.typ !== "posuvna")) vysledek.push({ stycnik: s.id, druh: "vetknuti", druhaStrana: [] });
    else if (kotva) vysledek.push({ stycnik: s.id, druh: "opera", druhaStrana: [] });
    else mezi.add(s.id);
  }
  if (mezi.size === 0) return vysledek;

  // Části mostu bez zámků mezi křídly: každý styčník dostane číslo své části.
  const cast = new Map<number, number>();
  const sousede = new Map<number, number[]>();
  for (const p of navrh.pruty) {
    if (mezi.has(p.a) || mezi.has(p.b)) continue;
    (sousede.get(p.a) ?? sousede.set(p.a, []).get(p.a)!).push(p.b);
    (sousede.get(p.b) ?? sousede.set(p.b, []).get(p.b)!).push(p.a);
  }
  let casti = 0;
  for (const s of navrh.stycniky) {
    if (mezi.has(s.id) || cast.has(s.id)) continue;
    const fronta = [s.id];
    cast.set(s.id, casti);
    while (fronta.length > 0) {
      const i = fronta.pop()!;
      for (const j of sousede.get(i) ?? []) {
        if (cast.has(j)) continue;
        cast.set(j, casti);
        fronta.push(j);
      }
    }
    casti += 1;
  }
  for (const s of zamky) {
    if (!mezi.has(s.id)) continue;
    // Pruty u zámku podle části, do které vede jejich druhý konec; prut mezi dvěma zámky
    // nepatří k žádné části a tvoří vlastní skupinu.
    const skupiny = new Map<number, number[]>();
    let samostatne = -1;
    for (const p of navrh.pruty) {
      if (p.a !== s.id && p.b !== s.id) continue;
      const druhy = p.a === s.id ? p.b : p.a;
      const klic = cast.get(druhy) ?? samostatne--;
      const skupina = skupiny.get(klic);
      if (skupina) skupina.push(p.id);
      else skupiny.set(klic, [p.id]);
    }
    if (skupiny.size !== 2) {
      vysledek.push({ stycnik: s.id, druh: skupiny.size > 2 ? "vic" : "nedeli", druhaStrana: [] });
      continue;
    }
    const [, druha] = [...skupiny.values()];
    vysledek.push({ stycnik: s.id, druh: "kridla", druhaStrana: druha! });
  }
  return vysledek;
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
 * Pruty, které stojí na pahýlu pilíře: na hlavě pilíře, která není styčníkem mostovky. Na takové
 * hlavě smí být jen lano (pylon). Jinak by šlo drahý pilíř nahradit metrem betonu a levným
 * ocelovým sloupem nad ním: do základu smí jen pilíř, ale výš už cokoli (nález kontroly
 * obtížnosti M12; v 4-01 tak šla rozpočtová medaile za 85 % inženýrského rozpočtu). Vzpěry
 * z dříku pilíře (ze styčníku, nad kterým pilíř pokračuje) i příhrada ve styčníku mostovky
 * nad pilířem zůstávají.
 */
export function prutyNaPahyluPilire(navrh: NavrhMostu): number[] {
  const jePilir = (p: PrutNavrhu): boolean => KATALOG[p.prvek].druh === "pilir";
  if (!navrh.pruty.some(jePilir)) return [];
  const podleId = new Map(navrh.stycniky.map((s) => [s.id, s]));
  const vysledek: number[] = [];
  for (const s of navrh.stycniky) {
    const uStycniku = navrh.pruty.filter((p) => p.a === s.id || p.b === s.id);
    const pilire = uStycniku.filter(jePilir);
    if (pilire.length === 0) continue;
    // Hlava pilíře: žádný pilíř z ní nevede výš.
    const pokracuje = pilire.some((p) => (podleId.get(p.a === s.id ? p.b : p.a)?.y ?? -Infinity) > s.y);
    if (pokracuje || uStycniku.some((p) => KATALOG[p.prvek].druh === "mostovka")) continue;
    for (const p of uStycniku) {
      const druh = KATALOG[p.prvek].druh;
      if (druh !== "pilir" && druh !== "lano") vysledek.push(p.id);
    }
  }
  return vysledek;
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
