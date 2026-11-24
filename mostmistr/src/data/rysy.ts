// Rysy mostu: čím nese a co na něm visí. Čtou se jen z návrhu a z úrovně, bez výpočtu.
// Slouží nápovědě: věta o principu a skica se skládají z rysů mostu autora hry, takže
// o něm nemůžou tvrdit nic, co na něm není.

import { KATALOG } from "./katalog";
import { zamkyNavrhu, type NavrhMostu } from "./navrh";
import type { Uroven } from "./uroven";

/** Čím most nese mostovku. */
export type NosnaSoustava =
  /** Jen mostovka, nic dalšího. */
  | "mostovka"
  /** Pár prutů nad mostovkou nebo pod ní (věšadlo, vzpěradlo). */
  | "trojuhelnik-nad"
  | "trojuhelnik-pod"
  /** Příhrada: řada trojúhelníků nad mostovkou, pod ní, nebo na obou stranách. */
  | "prihrada-nad"
  | "prihrada-pod"
  | "prihrada-obe"
  /** Vzpěry pod mostovkou opřené o kotvy ve svazích nebo na skále (vzpěradlo, bez dolního pásu). */
  | "vzpery"
  /** Dvě mostovky nad sebou spojené příhradou. */
  | "mezi-patry"
  /** Mostovka na pilířích bez dalších prutů (spojitý nosník). */
  | "nosnik"
  /** Šikmá lana z pylonu rovnou do mostovky. */
  | "zaveseny"
  /** Nosné lano přes pylony a závěsy z něj. */
  | "visuty"
  /** Křídlo, které zvedá píst. */
  | "zvedaci";

export interface RysyMostu {
  soustava: NosnaSoustava;
  /** Pilíře jako mezilehlé podpory pod příhradou (ne pylony lanového mostu). */
  pilire: boolean;
  /** Svařené styčníky. */
  svary: boolean;
  /** Závaží ve styčnících. */
  zavazi: boolean;
  /** Laděné tlumiče (závaží na pružině) a viskózní tlumiče (prut, který jen brzdí). */
  ladeneTlumice: boolean;
  viskozniTlumice: boolean;
  /**
   * Kolik křídel zvedací most má: dvě, když je dělí zámek mezi křídly, jinak jedno; 0 u mostu
   * bez pístů. Počet pístů to neříká: jedno křídlo smějí zvedat dva.
   */
  kridel: number;
  /** Dělicí zámek. */
  zamek: boolean;
  /** Lanový most, jehož mostovku ztužuje ještě příhrada z prutů (nese tam, kam lana nedosáhnou). */
  prihradaNavic: boolean;
  /** Zvedací most má křídlo ztužené dalšími pruty. */
  ztuzeni: boolean;
  /** Most, který nese hlavně něco nad mostovkou, se navíc opírá vzpěrami o kotvy pod ní. */
  vzperyNavic: boolean;
  /** Most podepřený zdola má navíc pár prutů nad mostovkou (věšadlo). */
  vesadloNavic: boolean;
  /** Kolik pylonů lanového mostu drží lana (místa, kde se lana sbíhají k pilíři); 0 u mostu bez lan. */
  pylonu: number;
  /** Svary mostovky leží hlavně mezi pilíři, ne nad nimi. */
  svaryMeziPodporami: boolean;
}

/** Do kolika prutů mimo mostovku je to ještě „pár prutů“, ne příhrada. */
const NEJVIC_PRUTU_TROJUHELNIKU = 4;
/** Kolikrát víc prutů musí být na jedné straně mostovky, aby se druhá strana nepočítala. */
const PREVAHA_STRANY = 3;
/** O kolik metrů musí prut přesahovat úroveň mostovky, aby ležel nad ní nebo pod ní. */
const ODSTUP_OD_MOSTOVKY = 0.5;

/** Vyčte rysy mostu `navrh` v úrovni `uroven`. */
export function rysyMostu(navrh: NavrhMostu, uroven: Uroven): RysyMostu {
  const podleId = new Map(navrh.stycniky.map((s) => [s.id, s]));
  const vysky = uroven.trasy.map((t) => t.zacatek.y);
  const horni = vysky.length > 0 ? Math.max(...vysky) : 0;
  const dolni = vysky.length > 0 ? Math.min(...vysky) : 0;
  let pruty = 0;
  let nad = 0;
  let pod = 0;
  let pilire = 0;
  let lana = 0;
  let pisty = 0;
  let viskozni = 0;
  /** Kotvy úrovně pod mostovkou: do svahů údolí nebo na skálu. */
  const dolniKotvy = uroven.kotvy.filter((k) => k.y < dolni - ODSTUP_OD_MOSTOVKY);
  const naDolniKotve = (id: number): boolean => {
    const st = podleId.get(id);
    return st !== undefined && dolniKotvy.some((k) => k.x === st.x && k.y === st.y);
  };
  let opreno = false;
  /** Kolik lan, pilířů a jiných prutů vede do každého styčníku. */
  const doStycniku = new Map<number, { lana: number; pilire: number; jine: number }>();
  for (const p of navrh.pruty) {
    const druh = KATALOG[p.prvek].druh;
    for (const id of [p.a, p.b]) {
      const pocty = doStycniku.get(id) ?? { lana: 0, pilire: 0, jine: 0 };
      if (druh === "lano") pocty.lana += 1;
      else if (druh === "pilir") pocty.pilire += 1;
      else pocty.jine += 1;
      doStycniku.set(id, pocty);
    }
    if (druh === "prut" && (naDolniKotve(p.a) || naDolniKotve(p.b))) opreno = true;
    if (druh === "pilir") pilire += 1;
    else if (druh === "lano") lana += 1;
    else if (druh === "pist") pisty += 1;
    else if (druh === "tlumic") viskozni += 1;
    else if (druh === "prut") {
      pruty += 1;
      const a = podleId.get(p.a);
      const b = podleId.get(p.b);
      if (!a || !b) continue;
      if (Math.max(a.y, b.y) > horni + ODSTUP_OD_MOSTOVKY) nad += 1;
      if (Math.min(a.y, b.y) < dolni - ODSTUP_OD_MOSTOVKY) pod += 1;
    }
  }
  // Styčník, ve kterém se potkávají jen lana, je bod nosného lana visutého mostu; kotva, do
  // které vedou dvě kotevní lana zavěšeného mostu, jím není. Kde se lana sbíhají k pilíři, je
  // vrchol pylonu.
  const jeKotva = (x: number, y: number): boolean => uroven.kotvy.some((k) => k.x === x && k.y === y) || uroven.zaklady.some((z) => z.x === x && z.y === y);
  let boduNosnehoLana = 0;
  const pylony = new Set<number>();
  let svaruNadPilirem = 0;
  let svaruJinde = 0;
  for (const [id, pocty] of doStycniku) {
    const st = podleId.get(id);
    if (!st) continue;
    if (pocty.lana >= 2 && pocty.pilire === 0 && pocty.jine === 0 && !jeKotva(st.x, st.y)) boduNosnehoLana += 1;
    if (pocty.lana >= 2 && pocty.pilire > 0) pylony.add(st.x);
    if (st.svar === true) {
      if (pocty.pilire > 0) svaruNadPilirem += 1;
      else svaruJinde += 1;
    }
  }

  let soustava: NosnaSoustava;
  if (pisty > 0) soustava = "zvedaci";
  else if (lana > 0) soustava = boduNosnehoLana > 0 ? "visuty" : "zaveseny";
  else if (pruty === 0) soustava = pilire > 0 ? "nosnik" : "mostovka";
  else if (horni > dolni && nad === 0 && pod === 0) soustava = "mezi-patry";
  else {
    const jenNad = pod === 0 || nad >= PREVAHA_STRANY * pod;
    const jenPod = nad === 0 || pod >= PREVAHA_STRANY * nad;
    const malo = pruty <= NEJVIC_PRUTU_TROJUHELNIKU;
    if (jenNad && nad > 0) soustava = malo ? "trojuhelnik-nad" : "prihrada-nad";
    // Pruty pod mostovkou opřené o kotvy ve svazích jsou vzpěry, ne příhrada s dolním pásem.
    else if (jenPod && pod > 0) soustava = opreno ? "vzpery" : malo ? "trojuhelnik-pod" : "prihrada-pod";
    else soustava = "prihrada-obe";
  }
  const nesNad = soustava === "trojuhelnik-nad" || soustava === "prihrada-nad";
  const nesPod = soustava === "trojuhelnik-pod" || soustava === "prihrada-pod" || soustava === "vzpery";
  const lanovy = soustava === "zaveseny" || soustava === "visuty";
  return {
    soustava,
    pilire: pilire > 0 && !lanovy && soustava !== "nosnik",
    svary: navrh.stycniky.some((s) => s.svar === true),
    zavazi: navrh.stycniky.some((s) => (s.zavazi ?? 0) > 0),
    ladeneTlumice: navrh.stycniky.some((s) => s.tlumic !== undefined),
    viskozniTlumice: viskozni > 0,
    kridel: pisty === 0 ? 0 : zamkyNavrhu(navrh, uroven).some((z) => z.druh === "kridla") ? 2 : 1,
    zamek: navrh.stycniky.some((s) => s.zamek === true),
    prihradaNavic: lanovy && pruty > NEJVIC_PRUTU_TROJUHELNIKU,
    ztuzeni: soustava === "zvedaci" && pruty > 0,
    vzperyNavic: opreno && nesNad,
    vesadloNavic: nesPod && nad > 0,
    pylonu: lanovy ? pylony.size : 0,
    svaryMeziPodporami: svaruJinde > svaruNadPilirem,
  };
}

/**
 * Věty o principu mostu jako klíče slovníku (bez předpony `napoveda.princip.`), v pořadí,
 * v jakém se mají číst: nejdřív čím most nese, pak co k tomu má navíc.
 */
export function principMostu(rysy: RysyMostu): string[] {
  const vety: string[] = [];
  if (rysy.soustava === "zvedaci") {
    vety.push(rysy.kridel >= 2 ? "zvedaci.dve" : "zvedaci.jedno");
    if (rysy.zamek) vety.push(rysy.kridel >= 2 ? "zamek.mezi" : "zamek.breh");
    if (rysy.ztuzeni) vety.push("ztuzeni");
    return vety;
  }
  if (rysy.soustava === "nosnik") vety.push(rysy.svary ? "nosnik.svareny" : "nosnik");
  // Zavěšený most s jediným pylonem: věta nesmí mluvit o pylonech.
  else if (rysy.soustava === "zaveseny" && rysy.pylonu === 1) vety.push("zaveseny.jeden");
  else vety.push(rysy.soustava);
  if (rysy.prihradaNavic) vety.push("prihrada.navic");
  if (rysy.vzperyNavic) vety.push("vzpery.navic");
  if (rysy.vesadloNavic) vety.push("vesadlo.navic");
  if (rysy.pilire) vety.push("pilire");
  if (rysy.svary && rysy.soustava !== "nosnik") vety.push("svary");
  if (rysy.zavazi) vety.push("zavazi");
  if (rysy.ladeneTlumice) vety.push("ladene");
  if (rysy.viskozniTlumice) vety.push("viskozni");
  return vety;
}
