// Počítání změn mezi původním a opraveným mostem (Havarijní komise): pruty se porovnávají podle
// místa, posunutý styčník je jedna změna a počet nezávisí na cestě, kterou hráč k mostu došel.
import { describe, expect, it } from "vitest";
import { Kreslic } from "../src/data/kreslic";
import type { NavrhMostu } from "../src/data/navrh";
import { zmenyMostu } from "../src/data/zmeny";
import { nastavLadenyTlumic, nastavPredpeti, nastavSvar, nastavZamek, nastavZavazi, nastavZdvih, posunStycnik, pridejPrut, smaz, zmenPrvek } from "../src/editor/upravy";
import { zdvihPistu } from "../src/data/katalog";
import { RESENI } from "../urovne/reseni";

/** Příhrada 1-03: dřevěná mostovka a trámy nad ní. */
const most = RESENI["1-03"]!.pruchod;
const druhy = (zmeny: ReturnType<typeof zmenyMostu>): string[] => zmeny.map((z) => z.druh);
const idV = (navrh: NavrhMostu, x: number, y: number): number => navrh.stycniky.find((s) => s.x === x && s.y === y)!.id;

describe("změny mezi dvěma návrhy mostu", () => {
  it("stejný most nemá žádnou změnu, ani když je zapsaný jinak (jiná id, jiné pořadí)", () => {
    expect(zmenyMostu(most, most)).toEqual([]);
    const jinak: NavrhMostu = {
      ...most,
      stycniky: most.stycniky.map((s) => ({ ...s, id: s.id + 100 })).reverse(),
      pruty: most.pruty.map((p) => ({ ...p, id: p.id + 500, a: p.b + 100, b: p.a + 100 })).reverse(),
    };
    expect(zmenyMostu(most, jinak)).toEqual([]);
  });

  it("přidaný, odebraný a vyměněný prut je každý jedna změna", () => {
    const [a, b] = [most.stycniky[0]!, most.stycniky.at(-1)!];
    const prvni = most.pruty[0]!;
    // Nový prut mezi dvěma styčníky, které spojené nejsou.
    const volne = most.stycniky.find((s) => s.id !== a.id && !most.pruty.some((p) => (p.a === a.id && p.b === s.id) || (p.b === a.id && p.a === s.id)))!;
    const pridany = pridejPrut(most, a, volne, "drevo-tezke");
    expect(zmenyMostu(most, pridany)).toEqual([{ druh: "prut-pridan", prut: pridany.pruty.at(-1)!.id }]);
    const odebrany = smaz(most, new Set([prvni.id]), new Set());
    expect(zmenyMostu(most, odebrany)).toEqual([{ druh: "prut-odebran", prut: prvni.id }]);
    const jinyPrvek = most.pruty.find((p) => p.prvek === "drevo-lehke")!;
    const vymeneny = zmenPrvek(most, [jinyPrvek.id], "drevo-tezke");
    expect(zmenyMostu(most, vymeneny)).toEqual([{ druh: "prvek", prut: jinyPrvek.id }]);
    // Prut smazaný a nakreslený znovu na stejné místo změna není, i když má nové id.
    const sa = most.stycniky.find((s) => s.id === prvni.a)!;
    const sb = most.stycniky.find((s) => s.id === prvni.b)!;
    const znovu = pridejPrut(smaz(most, new Set([prvni.id]), new Set()), sa, sb, prvni.prvek);
    expect(zmenyMostu(most, znovu)).toEqual([]);
    // Tři různé změny naráz se sečtou.
    const tri = zmenPrvek(smaz(pridany, new Set([prvni.id]), new Set()), [jinyPrvek.id], "drevo-tezke");
    expect(druhy(zmenyMostu(most, tri)).sort()).toEqual(["prut-odebran", "prut-pridan", "prvek"]);
    void b;
  });

  it("posunutý styčník je jedna změna, ne dvě za každý jeho prut", () => {
    // Horní styčník příhrady o metr výš: vedou do něj aspoň tři pruty.
    const horni = most.stycniky.filter((s) => s.y > 0).sort((p, q) => q.y - p.y)[0]!;
    const prutuVNem = most.pruty.filter((p) => p.a === horni.id || p.b === horni.id).length;
    expect(prutuVNem).toBeGreaterThanOrEqual(2);
    const posunuty = posunStycnik(most, horni.id, { x: horni.x, y: horni.y + 1 })!;
    expect(zmenyMostu(most, posunuty)).toEqual([{ druh: "stycnik-posunut", stycnik: horni.id }]);
    // Posunutý a vrácený zpět: žádná změna.
    expect(zmenyMostu(most, posunStycnik(posunuty, horni.id, { x: horni.x, y: horni.y })!)).toEqual([]);
    // Počítá se výsledek, ne cesta: styčník smazaný a postavený o metr výš se stejnými pruty
    // je tentýž most jako po posunutí, i když má styčník i pruty jiná id.
    const k = new Kreslic("1-03");
    k.prut("mostovka-drevo", [0, 0], [4, 0]);
    k.prut("drevo-lehke", [0, 0], [2, 2]);
    k.prut("drevo-lehke", [2, 2], [4, 0]);
    const maly = k.navrh();
    const bezVrcholu = smaz(maly, new Set(), new Set([idV(maly, 2, 2)]));
    const jinde = pridejPrut(pridejPrut(bezVrcholu, { x: 0, y: 0 }, { x: 2, y: 3 }, "drevo-lehke"), { x: 2, y: 3 }, { x: 4, y: 0 }, "drevo-lehke");
    const sJinymiId: NavrhMostu = {
      ...jinde,
      stycniky: jinde.stycniky.map((s) => (s.x === 2 && s.y === 3 ? { ...s, id: 77 } : s)),
      pruty: jinde.pruty.map((p, i) => ({ ...p, id: p.id + 40 + i, a: p.a === idV(jinde, 2, 3) ? 77 : p.a, b: p.b === idV(jinde, 2, 3) ? 77 : p.b })),
    };
    for (const navrh of [jinde, sJinymiId]) expect(druhy(zmenyMostu(maly, navrh))).toEqual(["stycnik-posunut"]);
    // Posunutý styčník, kterému hráč navíc vymění jeden prut: posun a výměna, dvě změny,
    // a zase nezáleží na tom, jaká id výsledek má.
    const tezky = pridejPrut(pridejPrut(bezVrcholu, { x: 0, y: 0 }, { x: 2, y: 3 }, "drevo-tezke"), { x: 2, y: 3 }, { x: 4, y: 0 }, "drevo-lehke");
    const tezkySJinymId: NavrhMostu = { ...tezky, stycniky: tezky.stycniky.map((s) => (s.x === 2 && s.y === 3 ? { ...s, id: 78 } : s)), pruty: tezky.pruty.map((p) => ({ ...p, a: p.a === idV(tezky, 2, 3) ? 78 : p.a, b: p.b === idV(tezky, 2, 3) ? 78 : p.b })) };
    for (const navrh of [tezky, tezkySJinymId]) expect(druhy(zmenyMostu(maly, navrh)).sort()).toEqual(["prvek", "stycnik-posunut"]);
    // Jiní sousedé už posun nejsou: styčník, který zmizel, a nový, který s ním nemá společný
    // ani jeden prut, je přestavba prut po prutu, i když editor novému přidělil staré id.
    const k2 = new Kreslic("1-03");
    k2.prut("mostovka-drevo", [0, 0], [4, 0]);
    k2.prut("mostovka-drevo", [4, 0], [8, 0]);
    k2.prut("drevo-lehke", [0, 0], [2, 2]);
    k2.prut("drevo-lehke", [2, 2], [4, 0]);
    const sirsi = k2.navrh();
    const stareId = idV(sirsi, 2, 2);
    const novy = pridejPrut(smaz(sirsi, new Set(), new Set([stareId])), { x: 8, y: 0 }, { x: 6, y: 2 }, "drevo-lehke");
    const noveId = idV(novy, 6, 2);
    const jinam: NavrhMostu = {
      ...novy,
      stycniky: novy.stycniky.map((s) => (s.id === noveId ? { ...s, id: stareId } : s)),
      pruty: novy.pruty.map((p) => ({ ...p, a: p.a === noveId ? stareId : p.a, b: p.b === noveId ? stareId : p.b })),
    };
    expect(druhy(zmenyMostu(sirsi, jinam)).sort()).toEqual(["prut-odebran", "prut-odebran", "prut-pridan"]);
    // Styčník, který si nechal aspoň jeden prut ke stejnému sousedovi, posunutý je: posun a
    // jeden odebraný prut jsou dvě změny místo tří.
    const kSousedovi = pridejPrut(smaz(sirsi, new Set(), new Set([stareId])), { x: 4, y: 0 }, { x: 6, y: 2 }, "drevo-lehke");
    expect(druhy(zmenyMostu(sirsi, kSousedovi)).sort()).toEqual(["prut-odebran", "stycnik-posunut"]);
  });

  it("svar, závaží, laděný tlumič a zámek jsou změna za každý styčník; stejná hodnota změna není", () => {
    const stred = most.stycniky.find((s) => s.y === 0 && s.x > 0)!;
    const jeden = new Set([stred.id]);
    expect(zmenyMostu(most, nastavSvar(most, jeden, true))).toEqual([{ druh: "svar", stycnik: stred.id }]);
    const tezsi = nastavZavazi(most, jeden, () => 800);
    expect(zmenyMostu(most, tezsi)).toEqual([{ druh: "zavazi", stycnik: stred.id }]);
    expect(zmenyMostu(tezsi, nastavZavazi(tezsi, jeden, () => 1200))).toEqual([{ druh: "zavazi", stycnik: stred.id }]);
    expect(zmenyMostu(tezsi, nastavZavazi(tezsi, jeden, () => 800))).toEqual([]);
    expect(zmenyMostu(tezsi, nastavZavazi(tezsi, jeden, () => 0))).toEqual([{ druh: "zavazi", stycnik: stred.id }]);
    const tlumeny = nastavLadenyTlumic(most, jeden, () => ({ hmota: 600, frekvence: 2 }));
    expect(zmenyMostu(most, tlumeny)).toEqual([{ druh: "tlumic", stycnik: stred.id }]);
    expect(zmenyMostu(tlumeny, nastavLadenyTlumic(tlumeny, jeden, () => ({ hmota: 600, frekvence: 2.1 })))).toEqual([{ druh: "tlumic", stycnik: stred.id }]);
    expect(zmenyMostu(tlumeny, nastavLadenyTlumic(tlumeny, jeden, () => ({ hmota: 600, frekvence: 2 })))).toEqual([]);
    expect(zmenyMostu(most, nastavZamek(most, jeden, true))).toEqual([{ druh: "zamek", stycnik: stred.id }]);
    // Dva svary jsou dvě změny.
    const dva = new Set(most.stycniky.filter((s) => s.y === 0).slice(0, 2).map((s) => s.id));
    expect(druhy(zmenyMostu(most, nastavSvar(most, dva, true)))).toEqual(["svar", "svar"]);
  });

  it("napínáky lan jsou dohromady jedna změna; zdvih pístu je změna toho pístu", () => {
    const zaveseny = RESENI["4-03"]!.pruchod;
    const lana = new Set(zaveseny.pruty.filter((p) => p.prvek === "lano" || p.prvek === "lano-nosne").map((p) => p.id));
    expect(lana.size).toBeGreaterThan(2);
    const dopnuty = nastavPredpeti(zaveseny, lana, (_id, bylo) => bylo + 0.05);
    expect(zmenyMostu(zaveseny, dopnuty)).toEqual([{ druh: "napinaky", lan: lana.size }]);
    const jedno = nastavPredpeti(zaveseny, new Set([[...lana][0]!]), () => 0.5);
    expect(zmenyMostu(zaveseny, jedno)).toEqual([{ druh: "napinaky", lan: 1 }]);
    const zvedaci = RESENI["7-01"]!.pruchod;
    const pist = zvedaci.pruty.find((p) => p.prvek === "pist")!;
    const vetsiZdvih = nastavZdvih(zvedaci, new Set([pist.id]), () => 2);
    expect(zmenyMostu(zvedaci, vetsiZdvih)).toEqual([{ druh: "nastaveni", prut: pist.id }]);
  });
  it("počet změn nezávisí na cestě: tažení, smazání a nové nakreslení i řetěz tažení dají totéž", () => {
    // Styčník A se třemi pruty; výsledek je A o metr výš bez svislice. Jednou tažením a
    // smazáním svislice, podruhé smazáním styčníku a nakreslením dvou prutů (nová id).
    for (const aPosledni of [true, false]) {
      const k = new Kreslic("1-03");
      if (!aPosledni) k.bod(4, 3);
      k.prut("mostovka-drevo", [0, 0], [4, 0]);
      k.prut("mostovka-drevo", [4, 0], [8, 0]);
      k.prut("drevo-lehke", [0, 0], [4, 3]);
      k.prut("drevo-lehke", [4, 0], [4, 3]);
      k.prut("drevo-lehke", [8, 0], [4, 3]);
      const puvodni = k.navrh();
      const a = idV(puvodni, 4, 3);
      const tazeny = posunStycnik(puvodni, a, { x: 4, y: 4 })!;
      const svislice = tazeny.pruty.find((p) => [p.a, p.b].includes(idV(tazeny, 4, 0)) && [p.a, p.b].includes(idV(tazeny, 4, 4)))!;
      const cesta1 = smaz(tazeny, new Set([svislice.id]), new Set());
      const bez = smaz(puvodni, new Set(), new Set([a]));
      const cesta2 = pridejPrut(pridejPrut(bez, { x: 0, y: 0 }, { x: 4, y: 4 }, "drevo-lehke"), { x: 4, y: 4 }, { x: 8, y: 0 }, "drevo-lehke");
      expect(druhy(zmenyMostu(puvodni, cesta1)).sort()).toEqual(["prut-odebran", "stycnik-posunut"]);
      expect(druhy(zmenyMostu(puvodni, cesta2)).sort()).toEqual(["prut-odebran", "stycnik-posunut"]);
    }
    // Dvě tažení po sobě, druhé na místo, kde stál první styčník: dvě změny, ne přestavba.
    const k = new Kreslic("1-03");
    for (let x = 0; x < 12; x += 4) k.prut("mostovka-drevo", [x, 0], [x + 4, 0]);
    k.prut("drevo-lehke", [0, 0], [2, 2]);
    k.prut("drevo-lehke", [2, 2], [4, 0]);
    k.prut("drevo-lehke", [4, 0], [6, 2]);
    k.prut("drevo-lehke", [6, 2], [8, 0]);
    const p = k.navrh();
    const prvni = posunStycnik(p, idV(p, 6, 2), { x: 10, y: 2 })!;
    const druhy2 = posunStycnik(prvni, idV(prvni, 2, 2), { x: 6, y: 2 })!;
    expect(druhy(zmenyMostu(p, prvni))).toEqual(["stycnik-posunut"]);
    expect(druhy(zmenyMostu(p, druhy2))).toEqual(["stycnik-posunut", "stycnik-posunut"]);
    // Totéž s přečíslovanými styčníky a pruty v jiném pořadí (id o výsledku nic neříkají).
    const jinak: NavrhMostu = {
      ...druhy2,
      stycniky: druhy2.stycniky.map((s) => ({ ...s, id: 900 - s.id })).reverse(),
      pruty: druhy2.pruty.map((q) => ({ ...q, id: 700 - q.id, a: 900 - q.b, b: 900 - q.a })).reverse(),
    };
    expect(druhy(zmenyMostu(p, jinak))).toEqual(["stycnik-posunut", "stycnik-posunut"]);
    // A zpátky: oba styčníky vrácené na místo nejsou změna.
    const zpet = posunStycnik(posunStycnik(druhy2, idV(druhy2, 6, 2), { x: 2, y: 2 })!, idV(druhy2, 10, 2), { x: 6, y: 2 })!;
    expect(zmenyMostu(p, zpet)).toEqual([]);
  });

  it("nastavení na výchozí hodnotu změna není", () => {
    const k = new Kreslic("7-01");
    k.prut("mostovka-ocel", [0, 0], [6, 0]);
    k.prut("pist", [0, -3], [4, 0]);
    const p = k.navrh();
    const pist = p.pruty.find((q) => q.prvek === "pist")!;
    expect(pist.zdvih).toBeUndefined();
    const vychozi = nastavZdvih(p, new Set([pist.id]), (_id, delka) => zdvihPistu(undefined, delka));
    expect(zmenyMostu(p, vychozi)).toEqual([]);
    const jiny = nastavZdvih(p, new Set([pist.id]), (_id, delka) => zdvihPistu(undefined, delka) + 0.5);
    expect(zmenyMostu(p, jiny)).toEqual([{ druh: "nastaveni", prut: pist.id }]);
  });

  it("závaží nebo laděný tlumič přenesený do jiného styčníku je jedna změna; s jinou hodnotou dvě", () => {
    const dole = most.stycniky.filter((s) => s.y === 0 && s.x > 0);
    const [a, b, c] = [dole[0]!, dole[1]!, dole[2]!];
    const sA = nastavZavazi(most, new Set([a.id]), () => 800);
    const preneseno = nastavZavazi(nastavZavazi(sA, new Set([a.id]), () => 0), new Set([b.id]), () => 800);
    expect(zmenyMostu(sA, preneseno)).toEqual([{ druh: "zavazi-presunuto", stycnik: b.id }]);
    // Jinak těžké závaží jinde není přenesení: jedno ubylo a jiné přibylo.
    const jine = nastavZavazi(nastavZavazi(sA, new Set([a.id]), () => 0), new Set([b.id]), () => 900);
    expect(druhy(zmenyMostu(sA, jine))).toEqual(["zavazi", "zavazi"]);
    // Dvě závaží přenesená a třetí přidané: tři změny.
    const dve = nastavZavazi(most, new Set([a.id, c.id]), () => 800);
    const obe = nastavZavazi(nastavZavazi(dve, new Set([a.id, c.id]), () => 0), new Set([b.id]), () => 800);
    expect(druhy(zmenyMostu(dve, obe)).sort()).toEqual(["zavazi", "zavazi-presunuto"]);
    // Laděný tlumič stejně: stejná hmota i ladění jinde je přenesení.
    const tlumeny = nastavLadenyTlumic(most, new Set([a.id]), () => ({ hmota: 600, frekvence: 2 }));
    const jinde = nastavLadenyTlumic(nastavLadenyTlumic(tlumeny, new Set([a.id]), () => undefined), new Set([b.id]), () => ({ hmota: 600, frekvence: 2 }));
    expect(zmenyMostu(tlumeny, jinde)).toEqual([{ druh: "tlumic-presunut", stycnik: b.id }]);
    const preladeny = nastavLadenyTlumic(nastavLadenyTlumic(tlumeny, new Set([a.id]), () => undefined), new Set([b.id]), () => ({ hmota: 600, frekvence: 2.2 }));
    expect(druhy(zmenyMostu(tlumeny, preladeny))).toEqual(["tlumic", "tlumic"]);
  });
});
