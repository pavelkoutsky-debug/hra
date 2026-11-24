// Referenční mosty zkouškové úrovně 3-05 „Nad kolejištěm“: silnice 54 m přes zářez s kolejištěm.
// Nad vozovkou vede vedení (výš než dva metry se stavět nesmí, jako v 3-02), pod vozovkou je mezi
// 6,5 a 47,5 m průjezdný profil (hlouběji než metr se stavět nesmí) a obě opěry jsou jen posuvná
// ložiska: pevně drží jen dvě skalní kotvy ve svazích (jako skála v 3-04, jenže u krajů, ne
// uprostřed). Nohy z kotev dosáhnou jen do prvního styčníku mostovky, takže mezi nimi zbývá 42 m
// pod dvoumetrovým stropem. Přes most jede kolona pěti nákladních aut, která na něm zabrzdí, a
// proti ní autobus; vozovka má nerovnost B.
//
// Jak mosty nesou: nohy podpírají mostovku 6 m od opěr a krajní pole s ložiskem drží konec mostu
// dole, takže příhrada mezi nohami je na obou koncích vetknutá. U noh je mostovka tlačená (to
// beton umí) a horní pás tažený, uprostřed je to naopak a horní pás se vzpírá.

import type { IdPrvku } from "../../src/data/katalog";
import { Kreslic } from "../../src/data/kreslic";
import type { NavrhMostu } from "../../src/data/navrh";
import type { ReseniUrovne } from "../reseni";

const O: IdPrvku = "ocel-lehka";
const TO: IdPrvku = "ocel-tezka";
type Bod = [number, number];

const ROZPETI = 54;
/** Strop pod vedením: výš styčník být nesmí. */
const STROP = 2;
/** Skalní kotva v levém svahu; pravá leží zrcadlově. */
const KOTVA: Bod = [1, -8];

function navrh(stav: (k: Kreslic) => void): NavrhMostu {
  const k = new Kreslic("3-05");
  stav(k);
  return k.navrh();
}

/** Ocelobetonová mostovka z devíti polí po šesti metrech. */
function vozovka(k: Kreslic): void {
  for (let x = 0; x < ROZPETI; x += 6) k.prut("mostovka-ocelobeton", [x, 0], [x + 6, 0]);
}

/** Prut a jeho zrcadlový obraz podle středu mostu; prut souměrný sám se sebou jen jednou. */
function soumerne(k: Kreslic, prvek: IdPrvku, a: Bod, b: Bod): void {
  k.prut(prvek, a, b);
  const za: Bod = [ROZPETI - a[0], a[1]];
  const zb: Bod = [ROZPETI - b[0], b[1]];
  const stejny = (p: Bod, q: Bod): boolean => p[0] === q[0] && p[1] === q[1];
  if ((stejny(za, b) && stejny(zb, a)) || (stejny(za, a) && stejny(zb, b))) return;
  k.prut(prvek, za, zb);
}

/** Nohy ze skalních kotev do prvního styčníku mostovky od každé opěry. */
function nohy(k: Kreslic, prvek: IdPrvku): void {
  soumerne(k, prvek, KOTVA, [6, 0]);
}

/**
 * Příhrada se svislicemi pod stropem, jak ji učila 3-02 a 3-04: krajní šikminy a horní pás
 * z prvku `pas`, svislice nad každým styčníkem mostovky a diagonály klesající ke středu z lehkého
 * profilu. `noha` je profil noh ze skalních kotev; bez něj se most o skálu neopírá.
 */
function seSvislicemi(pas: IdPrvku, noha: IdPrvku | null): NavrhMostu {
  return navrh((k) => {
    vozovka(k);
    soumerne(k, pas, [0, 0], [6, STROP]);
    for (let x = 6; x <= 24; x += 6) soumerne(k, pas, [x, STROP], [x + 6, STROP]);
    for (let x = 6; x <= 24; x += 6) soumerne(k, O, [x, 0], [x, STROP]);
    for (let x = 6; x <= 18; x += 6) soumerne(k, O, [x, STROP], [x + 6, 0]);
    k.prut(O, [24, 0], [30, STROP]);
    if (noha) nohy(k, noha);
  });
}

/**
 * Trojúhelníková příhrada pod stropem: horní styčníky nad středy polí, z každého dvě šikminy do
 * sousedních styčníků mostovky, všechny z lehkého profilu. `pas` jsou profily úseků horního pásu
 * od opěry ke středu (3–9, 9–15, 15–21 a 21–33 m; pravá půlka zrcadlově). Nad styčníky mostovky
 * ze seznamu `svislice` (jen levá půlka: 6, 12, 18 nebo 24 m) stojí svislice z lehkého profilu
 * a horní pás tam má styčník: jeho pruty pak měří tři metry místo šesti a ve vzpěru unesou víc.
 */
function trojuhelnikova(pas: readonly [IdPrvku, IdPrvku, IdPrvku, IdPrvku], svislice: readonly number[], noha: IdPrvku = TO): NavrhMostu {
  return navrh((k) => {
    vozovka(k);
    pas.forEach((prvek, i) => {
      const od = 3 + 6 * i;
      if (svislice.includes(od + 3)) {
        soumerne(k, prvek, [od, STROP], [od + 3, STROP]);
        soumerne(k, prvek, [od + 3, STROP], [od + 6, STROP]);
        soumerne(k, O, [od + 3, 0], [od + 3, STROP]);
      } else {
        soumerne(k, prvek, [od, STROP], [od + 6, STROP]);
      }
    });
    for (let x = 3; x <= 27; x += 6) {
      soumerne(k, O, [x - 3, 0], [x, STROP]);
      if (x < 27) soumerne(k, O, [x, STROP], [x + 3, 0]);
    }
    nohy(k, noha);
  });
}

/**
 * Most pro rozpočtovou bez svislice nad 36 m: kolona jede zleva a brzdí u pravé opěry, takže
 * pravá půlka pásu je namáhaná o něco míň a šestimetrový prut 33–39 m vydrží (využití 96 %).
 */
function bezJedneSvislice(): NavrhMostu {
  return navrh((k) => {
    vozovka(k);
    for (let x = 3; x < 51; x += 6) {
      if ([18, 24, 30].includes(x + 3)) {
        k.prut(O, [x, STROP], [x + 3, STROP]);
        k.prut(O, [x + 3, STROP], [x + 6, STROP]);
        k.prut(O, [x + 3, 0], [x + 3, STROP]);
      } else {
        k.prut(O, [x, STROP], [x + 6, STROP]);
      }
    }
    for (let x = 3; x <= 51; x += 6) {
      k.prut(O, [x - 3, 0], [x, STROP]);
      k.prut(O, [x, STROP], [x + 3, 0]);
    }
    nohy(k, TO);
  });
}

/**
 * Most pro rozpočtovou s kraji jako u příhrady se svislicemi: z opěry jedna šikmina do (6, 2),
 * nad nohou svislice a horní pás začíná až tam. Ušetří čtyři metry oceli; využití 99,9 %.
 */
function krajeSeSvislici(): NavrhMostu {
  return navrh((k) => {
    vozovka(k);
    soumerne(k, O, [0, 0], [6, STROP]);
    soumerne(k, O, [6, 0], [6, STROP]);
    soumerne(k, O, [6, STROP], [9, STROP]);
    soumerne(k, O, [9, STROP], [15, STROP]);
    for (const x of [15, 18, 21, 24]) soumerne(k, O, [x, STROP], [x + 3, STROP]);
    for (const x of [18, 24]) soumerne(k, O, [x, 0], [x, STROP]);
    for (let x = 9; x <= 27; x += 6) {
      soumerne(k, O, [x - 3, 0], [x, STROP]);
      if (x < 27) soumerne(k, O, [x, STROP], [x + 3, 0]);
    }
    nohy(k, TO);
  });
}

export const reseni: ReseniUrovne = {
  // Co by hráč postavil z 3-02 a 3-04 dohromady: příhrada se svislicemi, celý horní pás z těžkého
  // profilu a těžké nohy ze skály. Projde, ale do inženýrského rozpočtu se nevejde.
  pruchod: seSvislicemi(TO, TO),
  // Jen lehký profil a těžké nohy: trojúhelníková příhrada, jejíž horní pás uprostřed půlí
  // svislice nad 18 a 24 m. Třímetrové pruty pásu se nevzepřou; nejlevnější most, který projde celý.
  rozpocet: trojuhelnikova([O, O, O, O], [18, 24]),
  // Těžký profil jen tam, kde je pás namáhaný nejvíc: v tahu u opěr (3–9 m) a v tlaku nad středem
  // (21–33 m). Lehký úsek mezi nimi půlí svislice nad 18 m.
  mistrovska: trojuhelnikova([TO, O, O, TO], [18]),
  pady: [
    { nazev: "jen mostovka", navrh: navrh(vozovka) },
    // Tvar, kterým se dá projít 3-04 (lehká příhrada a těžké nohy ze skály), pod dvoumetrovým
    // stropem: šestimetrové pruty horního pásu se nad středem vzepřou.
    { nazev: "lehká příhrada a těžké nohy jako v 3-04", navrh: seSvislicemi(O, TO) },
    // Jen lekce 3-02: těžký horní pás, ale most leží na dvou posuvných ložiskách a o skálu se neopírá.
    { nazev: "těžký pás jako v 3-02, bez noh ze skály", navrh: seSvislicemi(TO, null) },
    // Těžký pás a nohy z lehkého profilu: devítimetrová noha se vzepře už pod vlastní tíhou mostu.
    { nazev: "těžký pás, nohy z lehkého profilu", navrh: seSvislicemi(TO, O) },
    // Most pro rozpočtovou bez čtyř svislic: šestimetrové pruty pásu nad středem se vzepřou.
    { nazev: "lehká trojúhelníková příhrada bez svislic", navrh: trojuhelnikova([O, O, O, O], []) },
    // Most pro rozpočtovou s nohami z lehkého profilu.
    { nazev: "lehká příhrada se svislicemi a lehké nohy", navrh: trojuhelnikova([O, O, O, O], [18, 24], O) },
  ],
  // Dva mosty, které projdou celé a jsou o chlup levnější než most pro rozpočtovou (našel je pokus
  // úroveň porazit). Referenční nejsou: první je nesouměrný, druhý má využití 99,9 %.
  vyzvy: [
    { nazev: "bez svislice nad 36 m (nesouměrný)", navrh: bezJedneSvislice() },
    { nazev: "kraje se svislicí místo dvou šikmin", navrh: krajeSeSvislici() },
  ],
};
