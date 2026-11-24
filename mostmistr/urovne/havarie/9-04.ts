// Případ 9-04 Havarijní komise (kapitola 4: lana, pylony, kotevní lana, napínáky a dopnutí).
// Údolí úrovně 4-04 „Náklad století“: silnice 72 m přes rokli, základy pylonů na březích za
// opěrami (x = −4 a 76) a kotvy pro kotevní lana dál od rokle (x = −18 a 90). Přes most jede
// nadměrný náklad 120 t a za ním proti němu dvě nákladní auta.
//
// Spadlý most: zavěšený most se dvěma betonovými pylony vysokými 14 m. Z hlavy každého pylonu
// vede vějíř šesti lan do mostovky (do styčníku 36 z obou stran) a dozadu nosné kotevní lano do
// kotvy. Levé kotevní lano je v pořádku; pravé je uchycené na pylonu ve výšce 10 m, čtyři metry
// pod hlavou, kam vedou lana vějíře. Vějíř táhne hlavu do rokle a kotevní lano ji nedrží: konec
// pylonu nad ním je konzola, kterou lana ohýbají. K tomu nikdo nesáhl na napínáky (lana mají
// výchozí předpětí, jak je editor položil), takže se mostovka prověsí o půl metru a lana dosednou,
// teprve když se protáhnou a pylony se ohnou.
//
// Co hráč uvidí: první poruší ohyb pravého pylonu nad základem (76, 0)–(76, 10) zhruba v páté
// sekundě, kdy nadměrný náklad teprve vjíždí na levou polovinu mostu: povolí pylon na druhé straně,
// než je náklad. Při stavbě ho značka upozorní na průvěs mostovky a výsledek poradí dopnout lana.
// Samotné dopnutí ale nestačí (pylon ohnutý lany: rada o kotevním laně) a samotné kotevní lano
// z hlavy bez dopnutí také ne (prověšená mostovka ohne levý pylon).
//
// Oprava komise (dvě změny): nosné kotevní lano z hlavy pravého pylonu do kotvy (90, 0) a dopnutí
// lan (napínáky všech lan jsou jedna změna). Původní nízké kotevní lano může zůstat.

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
/** Výška hlavy pylonů a výška, ze které vede pravé kotevní lano spadlého mostu. */
const HLAVA = 14;
const NIZKO = 10;
/** Styčníky mostovky, do kterých vedou lana z levého a z pravého pylonu. */
const LEVY_VEJIR = [6, 12, 18, 24, 30, 36];
const PRAVY_VEJIR = [36, 42, 48, 54, 60, 66];

const uroven = urovenPripadu(4, "Most přes Hlubokou rokli", "4-04");

interface Volby {
  /** Kotevní lana pravého pylonu: výšky, ze kterých vedou do kotvy. */
  pravaKotevni: readonly number[];
  /** Z čeho je kotevní lano z hlavy pravého pylonu, když tam nějaké vede. */
  zHlavy?: IdPrvku;
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

/** Most od začátku vlastním kresličem: mostovka, vějíře lan, kotevní lana a pylony. */
function most(volby: Volby): NavrhMostu {
  const k = new Kreslic(uroven.id);
  for (let x = 0; x < ROZPETI; x += 6) k.prut("mostovka-ocelobeton", [x, 0], [x + 6, 0]);
  for (const x of LEVY_VEJIR) k.prut(LANO, [PYLON[0], HLAVA], [x, 0]);
  for (const x of PRAVY_VEJIR) k.prut(LANO, [PYLON[1], HLAVA], [x, 0]);
  k.prut(NOSNE, [PYLON[0], HLAVA], [KOTVA[0], 0]);
  for (const y of volby.pravaKotevni) k.prut(y === HLAVA ? (volby.zHlavy ?? NOSNE) : NOSNE, [PYLON[1], y], [KOTVA[1], 0]);
  pylon(k, PYLON[0], []);
  pylon(k, PYLON[1], volby.pravaKotevni);
  const navrh = k.navrh();
  let lano = 0;
  return {
    ...navrh,
    pruty: navrh.pruty.map((p) => (p.prvek === LANO || p.prvek === NOSNE ? { ...p, predpeti: volby.predpeti?.[lano++] ?? PREDPETI_LANA.vychozi } : p)),
  };
}

/** Napínáky, jak je spočítalo dopnutí (`dopniLana`), v pořadí lan v `most`. */
const PREDPETI = {
  oprava: [] as readonly number[],
  jenDopnout: [] as readonly number[],
  obycejne: [] as readonly number[],
};

export const pripad04: PripadHavarie = {
  uroven,
  kapitola: "4",
  most: most({ pravaKotevni: [NIZKO] }),
  oprava: most({ pravaKotevni: [NIZKO, HLAVA], predpeti: PREDPETI.oprava }),
  slepe: [
    // Tlačítko Dopnout lana: mostovka se srovná, ale hlavu pravého pylonu dál nic nedrží.
    { nazev: "jen dopnout lana", navrh: most({ pravaKotevni: [NIZKO], predpeti: PREDPETI.jenDopnout }) },
    // Správné kotevní lano, ale napínáky zůstaly výchozí: prověšená mostovka ohne levý pylon.
    { nazev: "kotevní lano z hlavy bez dopnutí", navrh: most({ pravaKotevni: [NIZKO, HLAVA] }) },
    // Kotevní lano z hlavy, ale jen obyčejné (závěsné), a dopnutí: hlavu neudrží.
    { nazev: "obyčejné kotevní lano z hlavy a dopnutí", navrh: most({ pravaKotevni: [NIZKO, HLAVA], zHlavy: LANO, predpeti: PREDPETI.obycejne }) },
  ],
};
