// Případ 9-01 Havarijní komise (kapitola 1): dřevěný silniční most přes hluboké údolí úrovně
// 1-04, 24 m. Přes most jedou dvě auta a proti nim dodávka.
//
// Most: dřevěná mostovka po čtyřech metrech a nad ní čtyři metry vysoká příhrada. Stavitel si
// z kampaně pamatoval, že krajní šikminy a horní pás mají být z těžkého trámu, a udělal je tak;
// svislice a diagonály jsou z lehkého. Diagonály vedou od horního pásu dolů ke středu mostu,
// takže je provoz natahuje, jen v druhém poli zleva (4–8 m) je diagonála obrácená: vede od
// mostovky nahoru ke středu. Taková diagonála se pod provozem tlačí a lehký trám dlouhý 5,7 m
// se vzepře. Auta ji ještě přejedou (81 %), pod dodávkou se vzepře v 5,1 s; síla v ní je asi
// 1,3násobek toho, co lehký trám v tlaku unese (stejná diagonála z těžkého trámu nese 53 kN,
// lehká měla při 33 kN využití 81 %).
//
// Co hráč uvidí: zpomalený záběr na vzpírající se diagonálu ve druhém poli, pole se pak
// zkosí, mostovka se propadne a dodávka spadne. Číslo využití u té diagonály je jediné vysoké.
//
// Oprava komise (2 změny): obrácenou diagonálu odebrat a nakreslit ji správně, od horního
// pásu dolů ke středu (4,4)–(8,0): tažená diagonála z lehkého trámu nese 23 %. Funguje
// i jedna změna, stejná diagonála z těžkého trámu (to je také správné řešení, jen dražší).
//
// Slepé opravy: těžké svislice vedle obrácené diagonály (síla v ní se nezmění) a vzpěra
// z kotvy ve svahu pod styčník u opěry (podpírá jiné pole než to, které se zkosí).

import type { PripadHavarie } from "../../src/data/havarie";
import type { IdPrvku } from "../../src/data/katalog";
import { Kreslic } from "../../src/data/kreslic";
import type { NavrhMostu } from "../../src/data/navrh";
import { urovenPripadu } from "./pomoc";

const L: IdPrvku = "drevo-lehke";
const T: IdPrvku = "drevo-tezke";

const uroven = urovenPripadu(1, "Most přes rokli", "1-04");

const ROZPETI = 24;
const POLE = 4;
const VYSKA = 4;

interface Upravy {
  /** Diagonála druhého pole zleva vede správně (od horního pásu dolů ke středu). */
  spravnaDiagonala?: boolean;
  /** Prvek diagonály druhého pole. */
  diagonala?: IdPrvku;
  /** Prvek svislic po stranách druhého pole (x = 4 a 8). */
  svislice?: IdPrvku;
  /** Další pruty (vzpěry z kotev). */
  navic?: (k: Kreslic) => void;
}

/** Most od začátku: vlastní kreslič, aby každý most měl svá pole. */
function most(upravy: Upravy = {}): NavrhMostu {
  const k = new Kreslic(uroven.id);
  const n = ROZPETI / POLE;
  for (let i = 0; i < n; i++) k.prut("mostovka-drevo", [i * POLE, 0], [(i + 1) * POLE, 0]);
  // Krajní šikminy a horní pás z těžkého trámu.
  k.prut(T, [0, 0], [POLE, VYSKA]);
  k.prut(T, [ROZPETI - POLE, VYSKA], [ROZPETI, 0]);
  for (let i = 1; i < n - 1; i++) k.prut(T, [i * POLE, VYSKA], [(i + 1) * POLE, VYSKA]);
  // Svislice z lehkého trámu.
  for (let i = 1; i < n; i++) {
    const x = i * POLE;
    k.prut(x === 4 || x === 8 ? (upravy.svislice ?? L) : L, [x, 0], [x, VYSKA]);
  }
  // Diagonály z lehkého trámu, od horního pásu dolů ke středu; ve druhém poli obrácená.
  for (let i = 1; i < n - 1; i++) {
    const x = i * POLE;
    if (i === 1) {
      const prvek = upravy.diagonala ?? L;
      if (upravy.spravnaDiagonala) k.prut(prvek, [x, VYSKA], [x + POLE, 0]);
      else k.prut(prvek, [x, 0], [x + POLE, VYSKA]);
      continue;
    }
    const kStredu = x + POLE / 2 <= ROZPETI / 2;
    k.prut(L, kStredu ? [x, VYSKA] : [x, 0], kStredu ? [x + POLE, 0] : [x + POLE, VYSKA]);
  }
  upravy.navic?.(k);
  return k.navrh();
}

export const pripad01: PripadHavarie = {
  uroven,
  kapitola: "1",
  most: most(),
  oprava: most({ spravnaDiagonala: true }),
  slepe: [
    { nazev: "těžké svislice vedle obrácené diagonály", navrh: most({ svislice: T }) },
    { nazev: "vzpěra z kotvy ve svahu pod styčník u opěry", navrh: most({ navic: (k) => k.prut(T, [4, -6], [4, 0]) }) },
  ],
};
