// Případ 9-05 Havarijní komise (kapitola 6): železniční most na vlečce přes údolí úrovně 6-02,
// 36 m. Pod mostem je chráněná niva (stavět se smí jen nad kolejí), přes most jede lokomotiva
// se čtyřmi loženými nákladními vozy (88 t a 4 × 90 t).
//
// Most: kolejiště po šesti metrech a nad ním nízká Prattova příhrada, jen dva metry vysoká
// (svislice v každém styčníku, diagonály od horního pásu dolů ke středu). Stavitel věděl, že
// u nízké příhrady se vzpírá tlačený horní pás, a udělal ho celý z těžkého profilu; krajní
// šikminy (z opěry do horního pásu) nechal lehké jako svislice a diagonály. Jenže nízká
// příhrada má u opěr největší smyk a krajní šikmina nese celou reakci opěry: při výšce 2 m je
// v ní tlak přes trojnásobek reakce a lehký profil dlouhý 6,3 m se vzepře.
//
// Co hráč uvidí: vlak vjede zleva a v 2,4 s se vzepře levá krajní šikmina (zpomalený záběr
// u levé opěry), konec příhrady ztratí oporu, mostovka se u opěry propadne a vozy spadnou.
// Pravá krajní šikmina má do té chvíle 62 %. Těžký horní pás má jen kolem 40 %.
//
// Oprava komise (2 změny): obě krajní šikminy z těžkého profilu. Nejvíc pak nese kolejiště
// (63 %), šikminy kolem 30 %. Když hráč zesílí jen tu, která povolila (jedna změna), vlak
// dojede dál a vzepře se pravá: příčina je stejná na obou koncích.
//
// Slepé opravy: zesílit jen levou šikminu; těžké svislice u opěr (šikmina nese pořád totéž);
// vyšší příhrada uprostřed (horní pás zvednutý na 3 m ve třech styčnících, krajní šikminy
// zůstanou stejně strmé, takže se vzepřou dál).

import type { PripadHavarie } from "../../src/data/havarie";
import type { IdPrvku } from "../../src/data/katalog";
import { Kreslic } from "../../src/data/kreslic";
import type { NavrhMostu } from "../../src/data/navrh";
import { urovenPripadu } from "./pomoc";

const O: IdPrvku = "ocel-lehka";
const TO: IdPrvku = "ocel-tezka";

const ROZPETI = 36;
const POLE = 6;
const VYSKA = 2;

const uroven = urovenPripadu(5, "Most na vlečce", "6-02", {
  // Trolej nad kolejí tu není; chráněná je niva pod mostem, jako v 6-01.
  zakazaneZony: [{ xMin: 0.5, yMin: -16, xMax: ROZPETI - 0.5, yMax: -0.5 }],
  jizdniRad: [{ cas: 0, trasa: "kolej", smer: 1, druh: "lokomotiva", vozy: [{ druh: "vuz-nakladni", pocet: 4 }] }],
});

interface Upravy {
  /** Prvek levé a pravé krajní šikminy. */
  levaSikmina?: IdPrvku;
  pravaSikmina?: IdPrvku;
  /** Prvek svislic u opěr (x = 6 a 30). */
  krajniSvislice?: IdPrvku;
  /** Výška horního pásu ve styčnících 12, 18 a 24 m. */
  vyskaStredu?: number;
}

/** Most od začátku: vlastní kreslič, aby každý most měl svá pole. */
function most(upravy: Upravy = {}): NavrhMostu {
  const k = new Kreslic(uroven.id);
  const vyska = (x: number): number => (x >= 12 && x <= 24 ? (upravy.vyskaStredu ?? VYSKA) : VYSKA);
  for (let x = 0; x < ROZPETI; x += POLE) k.prut("kolejiste", [x, 0], [x + POLE, 0]);
  // Krajní šikminy z opěr do horního pásu.
  k.prut(upravy.levaSikmina ?? O, [0, 0], [POLE, VYSKA]);
  k.prut(upravy.pravaSikmina ?? O, [ROZPETI - POLE, VYSKA], [ROZPETI, 0]);
  // Horní pás z těžkého profilu.
  for (let x = POLE; x < ROZPETI - POLE; x += POLE) k.prut(TO, [x, vyska(x)], [x + POLE, vyska(x + POLE)]);
  // Svislice v každém styčníku kolejiště.
  for (let x = POLE; x <= ROZPETI - POLE; x += POLE) {
    const krajni = x === POLE || x === ROZPETI - POLE;
    k.prut(krajni ? (upravy.krajniSvislice ?? O) : O, [x, 0], [x, vyska(x)]);
  }
  // Diagonály od horního pásu dolů ke středu.
  for (let x = POLE; x < ROZPETI - POLE; x += POLE) {
    if (x < ROZPETI / 2) k.prut(O, [x, vyska(x)], [x + POLE, 0]);
    else k.prut(O, [x, 0], [x + POLE, vyska(x + POLE)]);
  }
  return k.navrh();
}

export const pripad05: PripadHavarie = {
  uroven,
  kapitola: "6",
  most: most(),
  oprava: most({ levaSikmina: TO, pravaSikmina: TO }),
  slepe: [
    { nazev: "těžká jen levá krajní šikmina, která povolila", navrh: most({ levaSikmina: TO }) },
    { nazev: "těžké svislice u opěr", navrh: most({ krajniSvislice: TO }) },
    { nazev: "vyšší příhrada uprostřed (horní pás na 3 m)", navrh: most({ vyskaStredu: 3 }) },
  ],
};
