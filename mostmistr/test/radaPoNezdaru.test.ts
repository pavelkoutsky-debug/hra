// Rada po druhém stejném nezdaru: kdy je to „podruhé stejně“ a kdy se rada smí ukázat.
import { describe, expect, it } from "vitest";
import { ID_PRVKU } from "../src/data/katalog";
import {
  DRUHY_RADY,
  druhPoruseni,
  maSilnejsiPrvek,
  novaPametRady,
  rozhodniRadu,
  samHledal,
  urovenRadi,
  vratRadu,
  type Nezdar,
  type PametRady,
  type ZkouskaProRadu,
} from "../src/hra/radaPoNezdaru";
import { ZPUSOB_OHYB, ZPUSOB_SMYK, ZPUSOB_TAH, ZPUSOB_TLAK, ZPUSOB_VZPER } from "../src/jadro/namahani";
import { nactiKampan } from "../urovne/index";

const vzperLehkeho: Nezdar = { druh: "vzper", prvek: "drevo-lehke", maRada: true };
const vzperTezkeho: Nezdar = { druh: "vzper", prvek: "drevo-tezke", maRada: true };
const ohybMostovky: Nezdar = { druh: "ohyb", prvek: "mostovka-drevo", maRada: true };
const kmitani: Nezdar = { druh: "kmitani", prvek: null, maRada: true };
const mezera: Nezdar = { druh: "mezera", prvek: null, maRada: false };

const zkouska = (nezdar: Nezdar | null, jinak: Partial<ZkouskaProRadu> = {}): ZkouskaProRadu => ({ pokus: false, host: false, nezdar, ...jinak });

/** Pustí řadu zkoušek a vrátí, ke kterým se rada ukázala (druh, nebo null). */
function rada(zkousky: (ZkouskaProRadu | "hledal")[], radi = true, pamet: PametRady = novaPametRady()): (string | null)[] {
  const ukazano: (string | null)[] = [];
  for (const z of zkousky) {
    if (z === "hledal") {
      pamet = samHledal(pamet);
      continue;
    }
    const r = rozhodniRadu(pamet, z, radi);
    pamet = r.pamet;
    ukazano.push(r.ukazat?.druh ?? null);
  }
  return ukazano;
}

describe("rada po druhém stejném nezdaru", () => {
  it("ukáže se podruhé po sobě stejně, potřetí už ne", () => {
    expect(rada([zkouska(vzperLehkeho), zkouska(vzperLehkeho), zkouska(vzperLehkeho), zkouska(vzperLehkeho)])).toEqual([null, "vzper", null, null]);
  });

  it("stejný způsob na jiném prvku nebo jiná příčina není „stejně“", () => {
    expect(rada([zkouska(vzperLehkeho), zkouska(vzperTezkeho)])).toEqual([null, null]);
    expect(rada([zkouska(vzperLehkeho), zkouska(ohybMostovky), zkouska(vzperLehkeho)])).toEqual([null, null, null]);
    expect(rada([zkouska(kmitani), zkouska(kmitani)])).toEqual([null, "kmitani"]);
  });

  it("průchod řadu přeruší; stejná rada v jedné návštěvě zazní jen jednou", () => {
    expect(rada([zkouska(vzperLehkeho), zkouska(null), zkouska(vzperLehkeho)])).toEqual([null, null, null]);
    expect(rada([zkouska(vzperLehkeho), zkouska(vzperLehkeho), zkouska(null), zkouska(vzperLehkeho), zkouska(vzperLehkeho)])).toEqual([null, "vzper", null, null, null]);
    // Jiná rada v téže návštěvě zazní.
    expect(rada([zkouska(vzperLehkeho), zkouska(vzperLehkeho), zkouska(ohybMostovky), zkouska(ohybMostovky)])).toEqual([null, "vzper", null, "ohyb"]);
  });

  it("pokusy a cizí mosty se nepočítají a řadu nepřeruší", () => {
    const pokus = zkouska(ohybMostovky, { pokus: true });
    const cizi = zkouska(ohybMostovky, { host: true });
    expect(rada([zkouska(vzperLehkeho), pokus, cizi, zkouska(null, { pokus: true }), zkouska(vzperLehkeho)])).toEqual([null, null, null, null, "vzper"]);
    expect(rada([zkouska(vzperLehkeho, { pokus: true }), zkouska(vzperLehkeho)])).toEqual([null, null]);
  });

  it("příčina bez rady (mezera v mostovce) se neukáže, ale řadu jiných nezdarů přeruší", () => {
    expect(rada([zkouska(mezera), zkouska(mezera)])).toEqual([null, null]);
    expect(rada([zkouska(vzperLehkeho), zkouska(mezera), zkouska(vzperLehkeho)])).toEqual([null, null, null]);
  });

  it("kdo mezitím sám otevřel nápovědu nebo podrobnosti výsledku, tomu se v té řadě nic nevnucuje", () => {
    expect(rada([zkouska(vzperLehkeho), "hledal", zkouska(vzperLehkeho), zkouska(vzperLehkeho)])).toEqual([null, null, null]);
    // Jiný nezdar začíná novou řadu: hledání z té minulé neplatí.
    expect(rada([zkouska(ohybMostovky), "hledal", zkouska(vzperLehkeho), zkouska(vzperLehkeho)])).toEqual([null, null, "vzper"]);
  });

  it("v úrovni, která neradí (komise, zkouška kapitoly), se neukáže nic", () => {
    expect(rada([zkouska(vzperLehkeho), zkouska(vzperLehkeho)], false)).toEqual([null, null]);
    const kampan = nactiKampan();
    for (const u of kampan) expect(urovenRadi(u, false), u.id).toBe(u.zkouskova !== true);
    expect(urovenRadi(kampan.find((u) => u.id === "1-03")!, true)).toBe(false);
    expect(urovenRadi(kampan.find((u) => u.id === "1-05")!, false)).toBe(false);
  });

  it("rada, kterou hráč neviděl (zkoušku zastavil před výsledkem), smí přijít příště", () => {
    let pamet = rozhodniRadu(novaPametRady(), zkouska(vzperLehkeho), true).pamet;
    const druha = rozhodniRadu(pamet, zkouska(vzperLehkeho), true);
    expect(druha.ukazat).toEqual(vzperLehkeho);
    pamet = vratRadu(druha.pamet, vzperLehkeho);
    expect(rozhodniRadu(pamet, zkouska(vzperLehkeho), true).ukazat).toEqual(vzperLehkeho);
  });

  it("zná druhy porušení, které posílá deník, a silnější prvek jen ten, který úroveň dovoluje", () => {
    expect([ZPUSOB_TAH, ZPUSOB_TLAK, ZPUSOB_VZPER, ZPUSOB_OHYB, ZPUSOB_SMYK].map(druhPoruseni)).toEqual(["tah", "tlak", "vzper", "ohyb", "smyk"]);
    for (const zpusob of [ZPUSOB_TAH, ZPUSOB_TLAK, ZPUSOB_VZPER, ZPUSOB_OHYB, ZPUSOB_SMYK]) expect(DRUHY_RADY).toContain(druhPoruseni(zpusob));
    // 1-02 má jen lehké dřevo, 1-03 i těžké.
    expect(maSilnejsiPrvek("drevo-lehke", ZPUSOB_VZPER, ["mostovka-drevo", "drevo-lehke"])).toBe(false);
    expect(maSilnejsiPrvek("drevo-lehke", ZPUSOB_VZPER, ["mostovka-drevo", "drevo-lehke", "drevo-tezke"])).toBe(true);
    expect(maSilnejsiPrvek("drevo-tezke", ZPUSOB_VZPER, ["mostovka-drevo", "drevo-lehke", "drevo-tezke"])).toBe(false);
    // Mostovka není prut: lehké a těžké dřevo jí nepomůžou.
    expect(maSilnejsiPrvek("mostovka-drevo", ZPUSOB_OHYB, ["mostovka-drevo", "drevo-lehke", "drevo-tezke"])).toBe(false);
    expect(maSilnejsiPrvek("lano", ZPUSOB_TAH, ["lano", "lano-nosne"])).toBe(true);
    // Prvek bez průřezu (tlumič) nemá s čím srovnávat.
    expect(maSilnejsiPrvek("tlumic", ZPUSOB_TAH, [...ID_PRVKU])).toBe(false);
  });
});
