// Případ 9-03 Havarijní komise (kapitola 3: ocel, ocelobetonová mostovka, těžká vozidla,
// brzdění). Údolí úrovně 3-04 „Kolona“: silnice 48 m, uprostřed údolí skála s pevnou kotvou
// (24, −10), obě opěry jsou jen posuvná ložiska. Přes most jede kolona čtyř nákladních aut, která
// u pravé opěry prudce zabrzdí (zpomalení 7 m/s², nouzové brzdění), a proti ní autobus.
//
// Spadlý most: třímetrová Prattova příhrada z lehkého profilu nad mostovkou a pod jejím středem
// jediná svislá noha z těžkého profilu ze skály. Svisle nese dobře: příhrada má tři podpory a nic
// v ní nejede přes 80 %. Jenže noha je kyvadlo (kloub na skále, kloub pod mostovkou) a obě opěry
// se posouvají: vodorovně most nedrží nic. Brzdící kolona most potáhne doprava, noha se nakloní,
// mostovka sjíždí z ložisek a příhrada se nad nohou zlomí.
//
// Co hráč uvidí: první poruší vzpěr diagonály nad nohou (24, 0)–(30, 3) zhruba v páté sekundě,
// když kolona brzdí; noha sama je skoro nevyužitá. Slepá oprava je zesílit tu diagonálu nebo
// přidat jednu šikmou nohu. Bez brzdění by týž most prošel (79 %): příčina je vodorovná síla,
// kterou nemá co zachytit.
//
// Oprava komise (dvě změny): dvě šikmé nohy z těžkého profilu ze skály do styčníků 18 a 30.
// S nohou do V je skála pevný bod mostu a příhrada má podpory po 18 a 6 metrech; nic nejede přes
// 60 %. Jediná šikmá noha nestačí: pod brzdící kolonou se přetíží diagonála nad svislou nohou.

import type { IdPrvku } from "../../src/data/katalog";
import { Kreslic } from "../../src/data/kreslic";
import type { PripadHavarie } from "../../src/data/havarie";
import type { NavrhMostu } from "../../src/data/navrh";
import { urovenPripadu } from "./pomoc";

const O: IdPrvku = "ocel-lehka";
const TO: IdPrvku = "ocel-tezka";

const ROZPETI = 48;
const VYSKA = 3;
/** Pevná kotva na skále uprostřed údolí. */
const SKALA: [number, number] = [24, -10];

const uroven = urovenPripadu(3, "Most pod Skalkou", "3-04", {
  jizdniRad: [
    { cas: 0, trasa: "silnice", smer: 1, druh: "nakladni", pocet: 4, rozestup: 12, brzdeni: { misto: 44, stani: 3, zpomaleni: 7 } },
    { cas: 0, trasa: "silnice", smer: -1, druh: "autobus" },
  ],
});

interface Volby {
  /** Styčníky mostovky, do kterých vedou nohy ze skály. */
  nohy: readonly number[];
  /** Pruty příhrady (podle souřadnic konců) z těžkého profilu. */
  tezke?: readonly string[];
}

const klic = (a: [number, number], b: [number, number]): string => `${a[0]},${a[1]}-${b[0]},${b[1]}`;

/**
 * Most od začátku vlastním kresličem: ocelobetonová mostovka po šesti metrech, nad ní Prattova
 * příhrada (horní pás, svislice nad každým styčníkem a diagonály klesající ke středu) a nohy ze skály.
 */
function most(volby: Volby): NavrhMostu {
  const k = new Kreslic(uroven.id);
  const prut = (a: [number, number], b: [number, number]): void => {
    k.prut(volby.tezke?.includes(klic(a, b)) ? TO : O, a, b);
  };
  for (let x = 0; x < ROZPETI; x += 6) k.prut("mostovka-ocelobeton", [x, 0], [x + 6, 0]);
  prut([0, 0], [6, VYSKA]);
  prut([ROZPETI - 6, VYSKA], [ROZPETI, 0]);
  for (let x = 6; x < ROZPETI - 6; x += 6) prut([x, VYSKA], [x + 6, VYSKA]);
  for (let x = 6; x <= ROZPETI - 6; x += 6) prut([x, 0], [x, VYSKA]);
  for (let x = 6; x < ROZPETI - 6; x += 6) {
    if (x < ROZPETI / 2) prut([x, VYSKA], [x + 6, 0]);
    else prut([x, 0], [x + 6, VYSKA]);
  }
  for (const x of volby.nohy) k.prut(TO, SKALA, [x, 0]);
  return k.navrh();
}

export const pripad03: PripadHavarie = {
  uroven,
  kapitola: "3",
  most: most({ nohy: [24] }),
  oprava: most({ nohy: [24, 18, 30] }),
  slepe: [
    // Zesílit prut, který povolil první: diagonála nad nohou vydrží, ale most dál nemá pevný bod.
    { nazev: "těžká diagonála nad nohou", navrh: most({ nohy: [24], tezke: [klic([24, 0], [30, VYSKA])] }) },
    // Šikmá noha pod místem, kde to povolilo: pod brzdící kolonou se zlomí diagonála nad svislou nohou.
    { nazev: "jedna šikmá noha do 30 m", navrh: most({ nohy: [24, 30] }) },
    { nazev: "jedna šikmá noha do 18 m", navrh: most({ nohy: [24, 18] }) },
  ],
};
