// Případ 9-04 Havarijní komise (kapitola 4: lana, pylony, kotevní lana, napínáky a dopnutí).
// Údolí úrovně 4-04 „Náklad století“: silnice 72 m přes rokli, základy pylonů na březích za
// opěrami (x = −4 a 76) a kotvy pro kotevní lana dál od rokle (x = −18 a 90). Přes most jede
// nadměrný náklad 120 t a za ním proti němu dvě nákladní auta; jízdní řád je z úrovně.
//
// Spadlý most: zavěšený most se dvěma betonovými pylony vysokými 14 m. Z hlavy každého pylonu
// vede vějíř šesti lan do mostovky (do styčníku 36 z obou stran) a dozadu nosné kotevní lano do
// kotvy. Obě kotevní lana jsou ale uchycená na pylonech ve výšce 11 m, tři metry pod hlavou, kam
// vedou lana vějíře. Hlavu tak nic nedrží: vějíř ohýbá konec pylonu nad kotevním lanem jako
// konzolu a ohyb se přenáší až k patě. Lana jsou dopnutá (tlačítko Dopnout lana) a mostovka drží
// tvar, takže most na výkresu vypadá v pořádku; pylony ale mají už bez provozu využití kolem 85 %
// a samotné nákladní auto (26 t) levý pylon zlomí.
//
// Co hráč uvidí: první poruší ohyb levého pylonu u paty (−4, 0)–(−4, 11) zhruba v sedmé sekundě,
// když nadměrný náklad vjede na levou polovinu mostu, a most se zřítí. Dopnout lana znovu nic
// nezmění (už dopnutá jsou). Nabízí se opravit levý pylon, kde to povolilo: kotevní lano z hlavy
// levého pylonu i s dopnutím vydrží, dokud náklad nepřejede na pravou půlku; tam pak povolí pravý
// pylon, který má stejnou chybu. A kotevní lana z hlav bez nového dopnutí nestačí také: nová lana
// visí volně, dokud se pylon neohne, protože dopnutá nízká lana nesou všechno.
//
// Oprava komise (dvě změny): obě kotevní lana přepojit z dříku pylonu do jeho hlavy (přepojený
// prut je jedna změna). Napínáky můžou zůstat, jak byly: most projde s využitím do 58 %. Projde
// i druhá cesta, nízká lana nechat, z hlav natáhnout nová a všechno znovu dopnout (tři změny).

import { PREDPETI_LANA, type IdPrvku } from "../../src/data/katalog";
import { Kreslic } from "../../src/data/kreslic";
import type { PripadHavarie } from "../../src/data/havarie";
import type { NavrhMostu } from "../../src/data/navrh";
import { urovenPripadu } from "./pomoc";

const LANO: IdPrvku = "lano";
const NOSNE: IdPrvku = "lano-nosne";

const ROZPETI = 72;
/** Základy pylonů a kotvy kotevních lan (levý a pravý břeh). */
const PYLON = [-4, 76] as const;
const KOTVA = [-18, 90] as const;
/** Výška hlavy pylonů a výška, ze které vedou kotevní lana spadlého mostu. */
const HLAVA = 14;
const NIZKO = 11;
/** Styčníky mostovky, do kterých vedou lana z levého a z pravého pylonu. */
const VEJIR = [
  [6, 12, 18, 24, 30, 36],
  [36, 42, 48, 54, 60, 66],
] as const;

const uroven = urovenPripadu(4, "Most se dvěma pylony", "4-04");

interface Volby {
  /** Kotevní lana levého a pravého pylonu: výšky, ze kterých vedou do kotvy. */
  kotevni: readonly [readonly number[], readonly number[]];
  /** Napínáky lan v pořadí, v jakém jsou nakreslená; bez nich výchozí, jak lana editor položí. */
  predpeti?: readonly number[];
}

/** Pylon (pilíř) od základu do hlavy se styčníky ve výškách `uchyty`; díl měří nejvýš 12 m. */
function pylon(k: Kreslic, x: number, uchyty: readonly number[]): void {
  const vysky = [...new Set([0, ...uchyty, HLAVA])].sort((a, b) => a - b);
  for (let i = 0; i + 1 < vysky.length; i++) {
    for (let y = vysky[i]!; y < vysky[i + 1]!; y += 12) k.prut("pilir", [x, y], [x, Math.min(vysky[i + 1]!, y + 12)]);
  }
}

/**
 * Most od začátku vlastním kresličem: mostovka, vějíře lan obou pylonů, kotevní lana levého
 * a pravého pylonu (v pořadí výšek z `kotevni`) a nakonec pylony.
 */
function most(volby: Volby): NavrhMostu {
  const k = new Kreslic(uroven.id);
  for (let x = 0; x < ROZPETI; x += 6) k.prut("mostovka-ocelobeton", [x, 0], [x + 6, 0]);
  for (const s of [0, 1]) for (const x of VEJIR[s]!) k.prut(LANO, [PYLON[s]!, HLAVA], [x, 0]);
  for (const s of [0, 1]) for (const y of volby.kotevni[s]!) k.prut(NOSNE, [PYLON[s]!, y], [KOTVA[s]!, 0]);
  // Pylon má styčník ve výšce nízkého kotevního lana vždycky: přepojením lana styčník nezmizí.
  for (const s of [0, 1]) pylon(k, PYLON[s]!, [NIZKO, ...volby.kotevni[s]!]);
  const navrh = k.navrh();
  let lano = 0;
  return {
    ...navrh,
    pruty: navrh.pruty.map((p) => (p.prvek === LANO || p.prvek === NOSNE ? { ...p, predpeti: volby.predpeti?.[lano++] ?? PREDPETI_LANA.vychozi } : p)),
  };
}

/** Napínáky, jak je spočítalo dopnutí (`dopniLana`), v pořadí lan v `most`. */
const PREDPETI = {
  /** Spadlý most: dvanáct lan vějířů a nízká kotevní lana vlevo a vpravo. */
  most: [0.139, 0.166, 0.196, 0.229, 0.264, 0.15, 0.167, 0.268, 0.233, 0.2, 0.171, 0.144, 0.44, 0.447],
  /** Nová lana z hlav a dopnutí: vějíře, vlevo nízké a z hlavy, vpravo nízké a z hlavy. */
  nova: [0.124, 0.15, 0.182, 0.216, 0.253, 0.147, 0.15, 0.256, 0.22, 0.186, 0.155, 0.128, 0.075, 0.262, 0.075, 0.262],
  /** Levé kotevní lano přepojené do hlavy a dopnutí: vějíře, vlevo z hlavy, vpravo nízké. */
  prepojeneLeve: [0.121, 0.148, 0.179, 0.215, 0.251, 0.227, 0.073, 0.266, 0.231, 0.198, 0.168, 0.141, 0.344, 0.405],
  /** Kotevní lano z hlavy jen vlevo: vějíře, vlevo nízké a z hlavy, vpravo nízké. */
  leve: [0.125, 0.151, 0.182, 0.217, 0.254, 0.245, 0.054, 0.265, 0.23, 0.197, 0.167, 0.14, 0.077, 0.294, 0.398],
} as const;

/** Napínáky spadlého mostu a výchozí u nových lan z hlav (hráč lana přidal a nedopnul). */
const V = PREDPETI_LANA.vychozi;
const BEZ_DOPNUTI = {
  obe: [...PREDPETI.most.slice(0, 13), V, PREDPETI.most[13]!, V],
  leve: [...PREDPETI.most.slice(0, 13), V, PREDPETI.most[13]!],
};

export const pripad04: PripadHavarie = {
  uroven,
  kapitola: "4",
  most: most({ kotevni: [[NIZKO], [NIZKO]], predpeti: PREDPETI.most }),
  oprava: most({ kotevni: [[HLAVA], [HLAVA]], predpeti: PREDPETI.most }),
  slepe: [
    // Přepojit lano jen u pylonu, který povolil: pravý má stejnou chybu a zlomí se po něm.
    { nazev: "kotevní lano přepojené do hlavy jen vlevo a dopnutí", navrh: most({ kotevni: [[HLAVA], [NIZKO]], predpeti: PREDPETI.prepojeneLeve }) },
    // Opravit pylon, který povolil: levý vydrží, náklad pak zlomí pravý se stejnou chybou.
    { nazev: "kotevní lano z hlavy jen vlevo a dopnutí", navrh: most({ kotevni: [[NIZKO, HLAVA], [NIZKO]], predpeti: PREDPETI.leve }) },
    // Správná kotevní lana bez nového dopnutí: dopnutá nízká lana nesou všechno a nová visí.
    { nazev: "kotevní lana z hlav bez dopnutí", navrh: most({ kotevni: [[NIZKO, HLAVA], [NIZKO, HLAVA]], predpeti: BEZ_DOPNUTI.obe }) },
    { nazev: "kotevní lano z hlavy jen vlevo bez dopnutí", navrh: most({ kotevni: [[NIZKO, HLAVA], [NIZKO]], predpeti: BEZ_DOPNUTI.leve }) },
  ],
};
