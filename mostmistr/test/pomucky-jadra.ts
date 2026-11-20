// Společné stavebnice pro testy jádra.
import { MATERIALY, type Material } from "../src/data/katalog";
import { NOSNIK, type PopisPrvku, type PopisSoustavy } from "../src/jadro/soustava";

export type Prurez = Omit<PopisPrvku, "a" | "b">;

/** Ocelový profil HEB 200, ohyb kolem silné osy. */
export const HEB200: Prurez = {
  druh: NOSNIK,
  EA: 210e9 * 78.1e-4,
  EI: 210e9 * 5696e-8,
  GAs: 81e9 * 24.8e-4,
  hmotnostNaMetr: 61.3,
  polomerSetrvacnosti: Math.sqrt(5696e-8 / 78.1e-4),
};

/** Tentýž profil bez smykové poddajnosti, pro srovnání se vzorci klasického nosníku. */
export const HEB200_BEZ_SMYKU: Prurez = { ...HEB200, GAs: Infinity };

/**
 * Vodorovný nosník délky `delka` z `dilu` stejných prvků. Styčník 0 je vlevo.
 * Podpory: "konzola" = levý konec vetknutý, "prosty" = kloub vlevo a posuvná podpora vpravo.
 */
export function nosnik(prurez: Prurez, delka: number, dilu: number, podpory: "konzola" | "prosty"): PopisSoustavy {
  const popis: PopisSoustavy = { stycniky: [], prvky: [] };
  for (let i = 0; i <= dilu; i++) popis.stycniky.push({ x: (delka * i) / dilu, y: 0 });
  for (let i = 0; i < dilu; i++) popis.prvky.push({ ...prurez, a: i, b: i + 1 });
  const levy = popis.stycniky[0]!;
  const pravy = popis.stycniky[dilu]!;
  levy.pevneX = true;
  levy.pevneY = true;
  if (podpory === "konzola") {
    levy.pevneNatoceni = true;
  } else {
    pravy.pevneY = true;
  }
  return popis;
}

/** Průřez pro `prutZPrurezu`: plocha, moment setrvačnosti, smykové plochy a průřezové moduly. */
interface Rozmery {
  A: number;
  I: number;
  As: number;
  Av?: number;
  W: number;
  Wpl: number;
  hmotnostNaMetr?: number;
}

/**
 * Prut z daného materiálu a průřezu se stejnými pravidly, jakými ho skládá hra z katalogu.
 * Testy jádra mají vlastní pevné průřezy, aby jejich očekávané hodnoty nezávisely na tom,
 * jak se průřezy v katalogu ladí pro hru.
 */
function prutZPrurezu(m: Material, p: Rozmery): Prurez {
  const prut: Prurez = {
    druh: NOSNIK,
    EA: m.E * p.A,
    EI: m.E * p.I,
    GAs: m.G * p.As,
    hmotnostNaMetr: p.hmotnostNaMetr ?? m.hustota * p.A,
    polomerSetrvacnosti: Math.sqrt(p.I / p.A),
    unosnost: {
      tah: m.mez.tah * p.A,
      tlak: m.mez.tlak * p.A,
      moment: m.mez.ohyb * (m.tvarny ? p.Wpl : p.W),
      smyk: m.mez.smyk * (p.Av ?? p.As),
    },
  };
  if (m.tvarny) {
    prut.tvarny = {
      silaPretrzeni: m.pevnostVTahu! * p.A,
      mezniNatoceni: m.mezniNatoceni!,
      mezniProtazeni: m.mezniProtazeni!,
    };
  }
  return prut;
}

/** Dvojice dřevěných trámů 140 × 280 mm z lepeného dřeva: křehký prut. */
export const DREVENY_TRAM: Prurez = prutZPrurezu(MATERIALY.drevo, {
  A: 2 * 0.14 * 0.28,
  I: (2 * 0.14 * 0.28 ** 3) / 12,
  As: (2 * 5 * 0.14 * 0.28) / 6,
  Av: (2 * 2 * 0.14 * 0.28) / 3,
  W: (2 * 0.14 * 0.28 ** 2) / 6,
  Wpl: (2 * 0.14 * 0.28 ** 2) / 4,
});

/** Dvojice ocelových nosníků HEB 200: tvárný prut. */
export const OCELOVY_NOSNIK: Prurez = prutZPrurezu(MATERIALY.ocel, {
  A: 2 * 78.1e-4,
  I: 2 * 5696e-8,
  As: 2 * 24.83e-4,
  W: 2 * 569.6e-6,
  Wpl: 2 * 642.5e-6,
  hmotnostNaMetr: 2 * 61.3,
});
