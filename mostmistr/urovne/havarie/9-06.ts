// Případ 9-06 Havarijní komise (kapitola 7): sklopný most přes kanál úrovně 7-05, 20 m.
// Strojovna je jen v levé zdi (čep v x = 0, kotvy pro píst 3 a 5 m pod ním), vpravo pouhé
// ložisko. Nejdřív přejede dodávka a dvě auta, pak se most zvedne pro loď, sklopí se a přes
// most jede nákladní auto a autobus.
//
// Most: jedno dvacetimetrové křídlo z ocelové mostovky (pole 6, 4, 5 a 5 m), zámek na pravé
// opěře a píst z mělké kotvy (3 m pod čepem) do styčníku šest metrů od čepu se zdvihem
// 1,5 m. Dvě chyby:
// - styčník mostovky deset metrů od čepu není svařený: v zavřeném mostě to nevadí (konec křídla
//   leží v zámku), ale při zvedání se v něm vnější polovina křídla sklopí dolů;
// - píst z mělké kotvy má k čepu krátké rameno: křídlo zvedne, ale zvednuté ho neudrží
//   (přetlakový ventil povolí) a křídlo klesne lodi do cesty.
//
// Co hráč uvidí: zámek se odemkne, píst zvedá kořen křídla a vnější polovina visí v nesvařeném
// styčníku dolů (věta „zalomené křídlo“), loď do ní narazí, po sklopení zámek nezapadne
// a nákladní auto s autobusem spadnou. Žádný prut se přitom neporuší (nejvíc 24 %): příčina je
// v tom, co na výkresu chybí, ne v tom, co je slabé. Kdo svaří styčník (první, co ho napadne),
// uvidí druhou chybu: křídlo se zvedne vcelku, ale klesne a loď narazí (věta „píst neudržel“).
//
// Oprava komise (3 změny): svar ve styčníku 10 m od čepu a píst přeložený do hluboké kotvy
// (odebrat mělký, nakreslit nový z kotvy 5 m pod čepem do téhož styčníku se zdvihem 2,75 m;
// křídlo se zvedne o 56°). Nic nejede přes 47 %, ráz dosednutí 0,83 MN. Stejně dobře jde
// pata pístu přetáhnout do hluboké kotvy (posunutý styčník) a přenastavit zdvih: také tři změny.
//
// Slepé opravy: jen svar (píst neudrží); svar a druhý píst z hluboké kotvy vedle mělkého (mělký
// píst se zdvihem 1,5 m zastaví křídlo dřív, než ho hluboký zvedne, loď narazí; s jiným zdvihem
// druhého pístu je to malý zdvih nebo totéž); píst v hluboké kotvě bez svaru (křídlo se zalomí,
// loď narazí do visící poloviny a zámek pak nezapadne). Samotný větší zdvih nepomůže: s 2 m
// píst křídlo s nesvařeným styčníkem zalomí stejně a od 2,25 m je zdvih za úvratí.

import type { PripadHavarie } from "../../src/data/havarie";
import { Kreslic } from "../../src/data/kreslic";
import type { NavrhMostu } from "../../src/data/navrh";
import { urovenPripadu } from "./pomoc";

const uroven = urovenPripadu(6, "Most u loděnice", "7-05");

const ROZPETI = 20;
/** Vnitřní styčníky mostovky (metry od čepu). */
const UZLY = [6, 10, 15];
/** Styčník, který stavitel zapomněl svařit. */
const NESVARENY = 10;
/** Píst vede z kotvy pod čepem do styčníku šest metrů od čepu. */
const KAM: [number, number] = [6, 0];
const MELKY = { hloubka: 3, zdvih: 1.5 };
const HLUBOKY = { hloubka: 5, zdvih: 2.75 };

interface Upravy {
  /** Svařit i styčník 10 m od čepu. */
  svar?: boolean;
  /** Písty: z mělké kotvy (jak ho stavitel nakreslil), z hluboké, nebo oba. */
  pisty?: ("melky" | "hluboky")[];
  /** Jiný zdvih mělkého pístu. */
  zdvihMelkeho?: number;
}

/** Most od začátku: vlastní kreslič, aby každý most měl svá pole. */
function most(upravy: Upravy = {}): NavrhMostu {
  const k = new Kreslic(uroven.id);
  const xs = [0, ...UZLY, ROZPETI];
  for (let i = 0; i + 1 < xs.length; i++) k.prut("mostovka-ocel", [xs[i]!, 0], [xs[i + 1]!, 0]);
  for (const x of UZLY) if (x !== NESVARENY || upravy.svar) k.bod(x, 0, { svar: true });
  k.bod(ROZPETI, 0, { zamek: true });
  for (const pist of upravy.pisty ?? ["melky"]) {
    const p = pist === "melky" ? { ...MELKY, zdvih: upravy.zdvihMelkeho ?? MELKY.zdvih } : HLUBOKY;
    k.prut("pist", [0, -p.hloubka], KAM, { zdvih: p.zdvih });
  }
  return k.navrh();
}

export const pripad06: PripadHavarie = {
  uroven,
  kapitola: "7",
  most: most(),
  oprava: most({ svar: true, pisty: ["hluboky"] }),
  slepe: [
    { nazev: "jen svar zalomeného styčníku", navrh: most({ svar: true }) },
    { nazev: "svar a druhý píst z hluboké kotvy vedle mělkého", navrh: most({ svar: true, pisty: ["melky", "hluboky"] }) },
    { nazev: "píst přeložený do hluboké kotvy, bez svaru", navrh: most({ pisty: ["hluboky"] }) },
  ],
};
