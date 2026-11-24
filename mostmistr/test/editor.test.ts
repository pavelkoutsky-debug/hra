// Stavební režim bez prohlížeče: úpravy návrhu, pravidla kreslení, výběr a historie.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KATALOG, STUPNE_TLUMENI } from "../src/data/katalog";
import { zkontrolujNavrh } from "../src/data/navrh";
import { nactiUroven } from "../src/data/uroven";
import { Editor } from "../src/editor/editor";
import { duvodProtiPrutu, lzeZacit } from "../src/editor/pravidla";
import {
  bezOsamelychStycniku,
  nastavSvar,
  nastavTlumeni,
  nastavZamek,
  nastavZavazi,
  nastavZdvih,
  posunStycnik,
  prazdnyNavrh,
  pridejPrut,
  smaz,
  zmenPrvek,
  zrcadli,
} from "../src/editor/upravy";
import potok from "../urovne/1-01.json";
import kanal from "../urovne/7-01.json";
import dveKridla from "../urovne/7-02.json";
import auto from "../urovne/1-03.json";

const uroven = nactiUroven(potok);
const B = (x: number, y: number) => ({ x, y });

describe("úpravy návrhu", () => {
  it("přidání prutu založí styčníky a původní návrh nezmění", () => {
    const prazdny = prazdnyNavrh("1-01");
    const jeden = pridejPrut(prazdny, B(0, 0), B(4, 0), "mostovka-drevo");
    expect(prazdny.pruty).toHaveLength(0);
    expect(jeden.stycniky).toEqual([{ id: 0, x: 0, y: 0 }, { id: 1, x: 4, y: 0 }]);
    expect(jeden.pruty).toEqual([{ id: 0, a: 0, b: 1, prvek: "mostovka-drevo" }]);
    const dva = pridejPrut(jeden, B(4, 0), B(8, 0), "mostovka-drevo");
    expect(dva.stycniky).toHaveLength(3);
    expect(dva.pruty[1]).toEqual({ id: 1, a: 1, b: 2, prvek: "mostovka-drevo" });
  });

  it("prut na místě existujícího ho jen přepíše na jiný prvek", () => {
    const jeden = pridejPrut(prazdnyNavrh("1-01"), B(0, 0), B(4, 0), "mostovka-drevo");
    const prepsany = pridejPrut(jeden, B(4, 0), B(0, 0), "drevo-lehke");
    expect(prepsany.pruty).toEqual([{ id: 0, a: 0, b: 1, prvek: "drevo-lehke" }]);
  });

  it("smazání styčníku odstraní i jeho pruty a styčníky, které osiřely", () => {
    let navrh = pridejPrut(prazdnyNavrh("1-01"), B(0, 0), B(4, 0), "mostovka-drevo");
    navrh = pridejPrut(navrh, B(4, 0), B(8, 0), "mostovka-drevo");
    navrh = pridejPrut(navrh, B(0, 0), B(4, 2), "drevo-lehke");
    const bezStredu = smaz(navrh, new Set(), new Set([1]));
    expect(bezStredu.pruty.map((p) => p.id)).toEqual([2]);
    expect(bezStredu.stycniky.map((s) => s.id)).toEqual([0, 3]);
    expect(smaz(navrh, new Set([2]), new Set()).stycniky.map((s) => s.id)).toEqual([0, 1, 2]);
  });

  it("nová id nikdy neopakují id smazaných sousedů v tomtéž návrhu", () => {
    let navrh = pridejPrut(prazdnyNavrh("1-01"), B(0, 0), B(4, 0), "mostovka-drevo");
    navrh = pridejPrut(navrh, B(4, 0), B(8, 0), "mostovka-drevo");
    navrh = smaz(navrh, new Set([0]), new Set());
    navrh = pridejPrut(navrh, B(4, 0), B(4, 2), "drevo-lehke");
    expect(new Set(navrh.pruty.map((p) => p.id)).size).toBe(navrh.pruty.length);
    expect(new Set(navrh.stycniky.map((s) => s.id)).size).toBe(navrh.stycniky.length);
  });

  it("posun styčníku na obsazené místo odmítne", () => {
    const navrh = pridejPrut(prazdnyNavrh("1-01"), B(0, 0), B(4, 0), "mostovka-drevo");
    expect(posunStycnik(navrh, 1, B(0, 0))).toBeNull();
    expect(posunStycnik(navrh, 1, B(3, 1))!.stycniky[1]).toEqual({ id: 1, x: 3, y: 1 });
  });

  it("změna prvku a úklid osamělých styčníků", () => {
    const navrh = pridejPrut(prazdnyNavrh("1-01"), B(0, 0), B(4, 0), "mostovka-drevo");
    expect(zmenPrvek(navrh, [0], "drevo-lehke").pruty[0]!.prvek).toBe("drevo-lehke");
    expect(zmenPrvek(navrh, [0], "mostovka-drevo")).toBe(navrh);
    expect(bezOsamelychStycniku({ ...navrh, pruty: [] }).stycniky).toEqual([]);
  });

  it("zrcadlení doplní druhou polovinu mostu a podruhé už nic nepřidá", () => {
    let navrh = pridejPrut(prazdnyNavrh("1-01"), B(0, 0), B(4, 0), "mostovka-drevo");
    navrh = pridejPrut(navrh, B(0, 0), B(4, 2), "drevo-lehke");
    navrh = pridejPrut(navrh, B(4, 0), B(4, 2), "drevo-lehke");
    const cely = zrcadli(navrh, 4);
    expect(cely.pruty).toHaveLength(5); // svislice leží na ose a zrcadlí se sama na sebe
    expect(cely.stycniky.some((s) => s.x === 8 && s.y === 0)).toBe(true);
    expect(zrcadli(cely, 4)).toBe(cely);
    // Jen vybraný prut.
    expect(zrcadli(navrh, 4, new Set([0])).pruty).toHaveLength(4);
  });
});

describe("pravidla kreslení", () => {
  it("začít lze jen z kotvy, ze základu nebo ze styčníku mostu", () => {
    const prazdny = prazdnyNavrh("1-01");
    expect(lzeZacit(prazdny, uroven, B(0, 0))).toBe(true);
    expect(lzeZacit(prazdny, uroven, B(8, 0))).toBe(true);
    expect(lzeZacit(prazdny, uroven, B(4, 0))).toBe(false);
    const sMostovkou = pridejPrut(prazdny, B(0, 0), B(4, 0), "mostovka-drevo");
    expect(lzeZacit(sMostovkou, uroven, B(4, 0))).toBe(true);
  });

  it("hlídá délku, povolené prvky, terén a výřez", () => {
    const prazdny = prazdnyNavrh("1-01");
    expect(duvodProtiPrutu(prazdny, uroven, B(0, 0), B(4, 0), "mostovka-drevo")).toBeNull();
    expect(duvodProtiPrutu(prazdny, uroven, B(0, 0), B(0, 0), "mostovka-drevo")).toBe("prut-kratky");
    expect(duvodProtiPrutu(prazdny, uroven, B(0, 0), B(5, 0), "mostovka-drevo")).toBe("prut-dlouhy");
    expect(duvodProtiPrutu(prazdny, uroven, B(0, 0), B(4, 0), "ocel-lehka")).toBe("prvek-nepovoleny");
    expect(duvodProtiPrutu(prazdny, uroven, B(0, 0), B(-2, -2), "drevo-lehke")).toBe("stycnik-v-terenu");
    expect(duvodProtiPrutu(prazdny, uroven, B(0, 0), B(-4, 0), "drevo-lehke")).toBeNull();
    expect(duvodProtiPrutu(prazdny, nactiUroven(auto), B(0, 0), B(0, 12), "drevo-lehke")).toBe("stycnik-mimo-vyrez");
  });

  it("překročený rozpočet kreslení neblokuje, jen zkoušku", () => {
    const chuda = { ...uroven, rozpocet: 5000 };
    const prazdny = prazdnyNavrh("1-01");
    expect(duvodProtiPrutu(prazdny, chuda, B(0, 0), B(4, 0), "mostovka-drevo")).toBeNull();
    expect(zkontrolujNavrh(pridejPrut(prazdny, B(0, 0), B(4, 0), "mostovka-drevo"), chuda)).toEqual([{ druh: "nad-rozpocet" }]);
  });
});

describe("editor", () => {
  /** Editor, do kterého se kreslí tahy myší z bodu do bodu. */
  function novy(): { e: Editor; zmen: () => number; tahni: (od: [number, number], k: [number, number]) => boolean } {
    let zmen = 0;
    const e = new Editor(uroven, prazdnyNavrh("1-01"), () => zmen++);
    return {
      e,
      zmen: () => zmen,
      tahni: (od, k) => {
        e.stiskni(B(od[0], od[1]));
        e.tahni(B((od[0] + k[0]) / 2, (od[1] + k[1]) / 2));
        e.tahni(B(k[0], k[1]));
        return e.pust();
      },
    };
  }

  it("tažením z kotvy nakreslí prut zvoleným prvkem; kurzor se chytá rastru", () => {
    const { e, tahni } = novy();
    expect(e.prvek).toBe("mostovka-drevo");
    expect(tahni([0.1, -0.1], [3.8, 0.2])).toBe(true);
    expect(e.navrh.pruty).toEqual([{ id: 0, a: 0, b: 1, prvek: "mostovka-drevo" }]);
    e.zvolPrvek("drevo-lehke");
    expect(tahni([4, 0], [4, 2])).toBe(true);
    expect(e.navrh.pruty[1]!.prvek).toBe("drevo-lehke");
  });

  it("během tažení ví, jestli prut půjde položit, a neplatný prut nepoloží", () => {
    const { e } = novy();
    e.stiskni(B(0, 0));
    expect(e.tah).toMatchObject({ druh: "prut", od: { x: 0, y: 0 } });
    e.tahni(B(3, 0));
    expect(e.tah).toMatchObject({ k: { x: 3, y: 0 }, duvod: null });
    // Trám delší, než prvek dovoluje, se odmítne (mostovka by se rozdělila na díly).
    e.zvolPrvek("drevo-lehke");
    e.tahni(B(7, 0));
    expect(e.tah).toMatchObject({ duvod: "prut-dlouhy" });
    expect(e.pust()).toBe(false);
    expect(e.navrh.pruty).toHaveLength(0);
    expect(e.posledniDuvod).toBe("prut-dlouhy");
  });

  it("tah, který na stejné díly rozdělit nejde, rozdělí na co nejmíň dílů: 5 m je 3 + 2, ne 5 × 1", () => {
    const { e } = novy();
    e.stiskni(B(0, 0));
    e.tahni(B(5, 0));
    expect(e.tah).toMatchObject({ duvod: null, dilu: 2, deleni: [0.6] });
    expect(e.pust()).toBe(true);
    expect(e.navrh.pruty).toHaveLength(2);
    expect(e.navrh.stycniky.map((st) => st.x).sort((a, b) => a - b)).toEqual([0, 3, 5]);
    // Sedm metrů jsou čtyři a tři.
    const dalsi = novy().e;
    dalsi.stiskni(B(0, 0));
    dalsi.tahni(B(7, 0));
    expect(dalsi.tah).toMatchObject({ duvod: null, dilu: 2 });
    expect(dalsi.pust()).toBe(true);
    expect(dalsi.navrh.stycniky.map((st) => st.x).sort((a, b) => a - b)).toEqual([0, 4, 7]);
  });

  it("mostovku delší než jeden díl rozdělí na stejné díly", () => {
    const { e } = novy();
    e.stiskni(B(0, 0));
    e.tahni(B(8, 0));
    expect(e.tah).toMatchObject({ duvod: null, dilu: 2 });
    expect(e.pust()).toBe(true);
    expect(e.navrh.pruty).toHaveLength(2);
    expect(e.navrh.stycniky.map((st) => st.x).sort((a, b) => a - b)).toEqual([0, 4, 8]);
  });

  it("z místa, kde nic není, se kreslit nezačne", () => {
    const { e, tahni } = novy();
    expect(tahni([4, 0], [6, 0])).toBe(false);
    expect(e.navrh.pruty).toHaveLength(0);
  });

  it("zpět a znovu procházejí historií; nová úprava větev znovu zahodí", () => {
    const { e, tahni } = novy();
    tahni([0, 0], [4, 0]);
    tahni([4, 0], [8, 0]);
    expect(e.lzeZpet).toBe(true);
    e.zpet();
    expect(e.navrh.pruty).toHaveLength(1);
    expect(e.lzeZnovu).toBe(true);
    e.znovu();
    expect(e.navrh.pruty).toHaveLength(2);
    e.zpet();
    tahni([4, 0], [4, 2]);
    expect(e.lzeZnovu).toBe(false);
    e.zpet();
    e.zpet();
    expect(e.navrh.pruty).toHaveLength(0);
    expect(e.lzeZpet).toBe(false);
  });

  it("výměna mostu za jiný zapomene historii: Zpět cizí most nevrátí", () => {
    const { e, tahni } = novy();
    tahni([0, 0], [4, 0]);
    tahni([4, 0], [8, 0]);
    const vlastni = e.navrh;
    // Most z odkazu: jiný návrh téže úrovně.
    const cizi = pridejPrut(pridejPrut(prazdnyNavrh(uroven.id), B(0, 0), B(4, 0), "mostovka-drevo"), B(0, 0), B(2, 2), "drevo-lehke");
    e.vymen(cizi);
    expect(e.navrh).toBe(cizi);
    expect(e.lzeZpet).toBe(false);
    expect(e.lzeZnovu).toBe(false);
    expect(e.posledniAkce).toBe("import");
    // Úprava cizího mostu jde vzít zpět jen k němu, ne dál k mostu hráče.
    tahni([4, 0], [8, 0]);
    e.zpet();
    expect(e.navrh).toBe(cizi);
    expect(e.lzeZpet).toBe(false);
    // A zpátky: ani tady Zpět cizí most nevrátí.
    e.vymen(vlastni);
    expect(e.navrh).toBe(vlastni);
    expect(e.lzeZpet).toBe(false);
    expect(e.lzeZnovu).toBe(false);
  });

  it("kliknutím vybere prut nebo styčník, Shift přidává, Delete maže", () => {
    const { e, tahni } = novy();
    tahni([0, 0], [4, 0]);
    tahni([4, 0], [8, 0]);
    e.zvolPrvek("drevo-lehke");
    tahni([0, 0], [4, 2]);
    // Klik doprostřed prvního pole mostovky.
    e.stiskni(B(2, 0.1));
    e.pust();
    expect([...e.vybranePruty]).toEqual([0]);
    e.stiskni(B(6, 0), { pridat: true });
    e.pust();
    expect([...e.vybranePruty].sort()).toEqual([0, 1]);
    // Klik na styčník bez Shiftu výběr nahradí.
    e.stiskni(B(4, 2));
    e.pust();
    expect([...e.vybranePruty]).toEqual([]);
    expect([...e.vybraneStycniky]).toEqual([3]);
    expect(e.smazVybrane()).toBe(true);
    expect(e.navrh.pruty.map((p) => p.id)).toEqual([0, 1]);
    expect(e.neconiJeVybrano).toBe(false);
    // Klik do prázdna výběr zruší.
    e.vyberVse();
    e.stiskni(B(-3, 4));
    e.pust();
    expect(e.neconiJeVybrano).toBe(false);
  });

  it("tažením z prázdného místa vybere obdélníkem pruty, které má celé uvnitř", () => {
    const { e, tahni } = novy();
    tahni([0, 0], [4, 0]);
    tahni([4, 0], [8, 0]);
    e.zvolPrvek("drevo-lehke");
    tahni([0, 0], [4, 2]);
    tahni([4, 2], [8, 0]);
    e.stiskni(B(2.5, 3));
    expect(e.tah).toMatchObject({ druh: "obdelnik" });
    e.tahni(B(9, -1));
    e.pust();
    // Uvnitř jsou styčníky (4,0), (8,0), (4,2): pravé pole mostovky a pravá krokev.
    expect([...e.vybranePruty].sort()).toEqual([1, 3]);
    expect(e.vybraneStycniky.size).toBe(3);
  });

  it("volba prvku změní vybrané pruty, pokud to pravidla dovolí", () => {
    const { e, tahni } = novy();
    e.zvolPrvek("drevo-lehke");
    tahni([0, 0], [4, 3]); // 5 m: pro mostovku příliš dlouhé
    tahni([0, 0], [4, 0]);
    e.vyberVse();
    e.zvolPrvek("mostovka-drevo");
    expect(e.navrh.pruty.map((p) => p.prvek)).toEqual(["drevo-lehke", "mostovka-drevo"]);
    expect(e.posledniDuvod).toBe("prut-dlouhy");
  });

  it("posun styčníku s klávesou Alt přesune konce prutů; nedovolený posun vrátí", () => {
    const { e, tahni } = novy();
    e.zvolPrvek("drevo-lehke");
    tahni([0, 0], [4, 2]);
    e.stiskni(B(4, 2), { posouvat: true });
    e.tahni(B(4, 3));
    expect(e.tah).toMatchObject({ druh: "posun", duvod: null });
    expect(e.pust()).toBe(true);
    expect(e.navrh.stycniky[1]).toEqual({ id: 1, x: 4, y: 3 });
    e.stiskni(B(4, 3), { posouvat: true });
    e.tahni(B(7, 4)); // 8,06 m: lehké dřevo smí mít nejvýš 6 m
    expect(e.pust()).toBe(false);
    expect(e.posledniDuvod).toBe("prut-dlouhy");
    expect(e.navrh.stycniky[1]).toEqual({ id: 1, x: 4, y: 3 });
  });

  it("zrcadlení dostaví druhou polovinu podle osy trasy", () => {
    const { e, tahni } = novy();
    tahni([0, 0], [4, 0]);
    e.zvolPrvek("drevo-lehke");
    tahni([0, 0], [4, 2]);
    tahni([4, 0], [4, 2]);
    expect(e.zrcadli()).toBe(true);
    expect(e.navrh.pruty).toHaveLength(5);
    expect(zkontrolujNavrh(e.navrh, uroven)).toEqual([]);
    expect(e.zrcadli()).toBe(false);
  });

  it("zrcadlení spojí pás dotažený k ose s jeho obrazem v jeden prut; kde do styčníku vede ještě něco, nechá ho být", () => {
    const { e, tahni } = novy();
    tahni([0, 0], [4, 0]);
    e.zvolPrvek("drevo-lehke");
    tahni([0, 0], [2, 2]);
    tahni([2, 2], [4, 2]);
    expect(e.zrcadli()).toBe(true);
    const bod = (id: number): [number, number] => {
      const st = e.navrh.stycniky.find((x) => x.id === id)!;
      return [st.x, st.y];
    };
    const konce = e.navrh.pruty.map((p) => [bod(p.a), bod(p.b)].sort((p1, p2) => p1[0] - p2[0] || p1[1] - p2[1]));
    // Horní pás je jeden prut od (2, 2) do (6, 2); styčník na ose zmizel a s ním i kloub.
    expect(konce).toContainEqual([[2, 2], [6, 2]]);
    expect(e.navrh.stycniky.some((st) => st.x === 4 && st.y === 2)).toBe(false);
    // Mostovka se nespojila: čtyřmetrová pole jsou nejdelší, jaká jdou, a osmimetrové by pravidla nepustila.
    expect(konce).toContainEqual([[0, 0], [4, 0]]);
    expect(konce).toContainEqual([[4, 0], [8, 0]]);
    expect(e.navrh.pruty).toHaveLength(5);
    expect(zkontrolujNavrh(e.navrh, uroven)).toEqual([]);
    // Krok zpět vrátí stav před zrcadlením celý.
    e.zpet();
    expect(e.navrh.pruty).toHaveLength(3);
  });

  it("hlásí každou změnu, kterou je potřeba překreslit nebo uložit", () => {
    const { e, zmen, tahni } = novy();
    tahni([0, 0], [4, 0]);
    expect(zmen()).toBe(1);
    e.zpet();
    expect(zmen()).toBe(2);
    e.zvolPrvek("drevo-lehke");
    expect(zmen()).toBe(3);
  });

  it("Escape zruší rozdělaný tah", () => {
    const { e } = novy();
    e.stiskni(B(0, 0));
    e.tahni(B(3, 0));
    e.zrusTah();
    expect(e.tah).toBeNull();
    expect(e.pust()).toBe(false);
    expect(e.navrh.pruty).toHaveLength(0);
  });
});

describe("závaží a tlumiče", () => {
  const lavka = nactiUroven(JSON.parse(readFileSync(new URL("../urovne/2-04.json", import.meta.url), "utf-8")));

  function sMostovkou(): Editor {
    const editor = new Editor(lavka, prazdnyNavrh("2-04"));
    for (let x = 0; x < 32; x += 4) {
      editor.stiskni(B(x, 0));
      editor.tahni(B(x + 4, 0));
      editor.pust();
    }
    return editor;
  }

  it("úpravy: závaží se nastaví, nula ho odebere a původní návrh se nezmění", () => {
    const navrh = pridejPrut(prazdnyNavrh("2-04"), B(0, 0), B(4, 0), "mostovka-drevo");
    const tezsi = nastavZavazi(navrh, new Set([1]), (kg) => kg + 300);
    expect(navrh.stycniky[1]).toEqual({ id: 1, x: 4, y: 0 });
    expect(tezsi.stycniky[1]).toEqual({ id: 1, x: 4, y: 0, zavazi: 300 });
    expect(nastavZavazi(tezsi, new Set([1]), () => 0).stycniky[1]).toEqual({ id: 1, x: 4, y: 0 });
    expect(nastavZavazi(tezsi, new Set([1]), (kg) => kg)).toBe(tezsi);
  });

  it("úpravy: tlumení se zapíše k prutu", () => {
    const navrh = pridejPrut(prazdnyNavrh("2-04"), B(8, 0), B(8, -4), "tlumic");
    expect(nastavTlumeni(navrh, new Set([0]), () => 75_000).pruty[0]).toMatchObject({ prvek: "tlumic", tlumeni: 75_000 });
  });

  it("vybranému styčníku jde přidávat a ubírat závaží po krocích až do meze úrovně", () => {
    const editor = sMostovkou();
    expect(editor.zavaziVyberu).toBeNull();
    expect(editor.zmenZavazi(1)).toBe(false);
    // Nástroj výběru: kliknutí na styčník bez tažení ho vybere.
    editor.stiskni(B(16, 0), { posouvat: true, bezKresleni: true });
    editor.pust();
    expect(editor.zavaziVyberu).toBe(0);
    expect(editor.zmenZavazi(1)).toBe(true);
    expect(editor.zmenZavazi(1)).toBe(true);
    expect(editor.zavaziVyberu).toBe(200);
    expect(editor.zmenZavazi(-1)).toBe(true);
    expect(editor.zavaziVyberu).toBe(100);
    for (let i = 0; i < 40; i++) editor.zmenZavazi(1);
    expect(editor.zavaziVyberu).toBe(lavka.nejvetsiZavazi);
    expect(zkontrolujNavrh(editor.navrh, lavka)).toEqual([]);
    editor.zpet();
    expect(editor.zavaziVyberu).toBeLessThan(lavka.nejvetsiZavazi);
  });

  it("závaží nad mez úrovně a tlumič mimo rozsah kontrola návrhu odmítne", () => {
    const editor = sMostovkou();
    const navrh = editor.navrh;
    const pretizeny = nastavZavazi(navrh, new Set([navrh.stycniky[2]!.id]), () => lavka.nejvetsiZavazi + 100);
    expect(zkontrolujNavrh(pretizeny, lavka).map((p) => p.druh)).toEqual(["zavazi-nepovolene"]);
    const sTlumicem = pridejPrut(navrh, B(8, 0), B(8, -4), "tlumic");
    const id = sTlumicem.pruty.at(-1)!.id;
    expect(zkontrolujNavrh(sTlumicem, lavka)).toEqual([]);
    expect(zkontrolujNavrh(nastavTlumeni(sTlumicem, new Set([id]), () => 1e7), lavka).map((p) => p.druh)).toEqual([
      "tlumeni-mimo-rozsah",
    ]);
    // V první kapitole závaží není vůbec.
    const potokSZavazim = nastavZavazi(pridejPrut(prazdnyNavrh("1-01"), B(0, 0), B(4, 0), "mostovka-drevo"), new Set([1]), () => 100);
    expect(zkontrolujNavrh(potokSZavazim, uroven).map((p) => p.druh)).toContain("zavazi-nepovolene");
  });

  it("vybranému tlumiči jde přepínat sílu po stupních", () => {
    const editor = sMostovkou();
    editor.zvolPrvek("tlumic");
    editor.stiskni(B(8, 0));
    editor.tahni(B(8, -4));
    expect(editor.pust()).toBe(true);
    expect(editor.tlumeniVyberu).toBeNull();
    editor.stiskni(B(8, -2), { bezKresleni: true });
    editor.pust();
    expect(editor.tlumeniVyberu).toBe(KATALOG.tlumic.tlumeni!.vychozi);
    expect(editor.zmenTlumeni(1)).toBe(true);
    expect(editor.tlumeniVyberu).toBe(75_000);
    for (let i = 0; i < 20; i++) editor.zmenTlumeni(1);
    expect(editor.tlumeniVyberu).toBe(STUPNE_TLUMENI.at(-1));
    for (let i = 0; i < 20; i++) editor.zmenTlumeni(-1);
    expect(editor.tlumeniVyberu).toBe(STUPNE_TLUMENI[0]);
    expect(zkontrolujNavrh(editor.navrh, lavka)).toEqual([]);
  });

  it("zrcadlení přenese na druhou stranu i tlumič s nastavením a závaží", () => {
    const editor = sMostovkou();
    editor.zvolPrvek("tlumic");
    editor.stiskni(B(8, 0));
    editor.tahni(B(8, -4));
    editor.pust();
    editor.stiskni(B(8, -2), { bezKresleni: true });
    editor.pust();
    editor.zmenTlumeni(1);
    editor.zrusVyber();
    editor.stiskni(B(12, 0), { bezKresleni: true });
    editor.pust();
    editor.zmenZavazi(1);
    editor.zrusVyber();
    expect(editor.zrcadli()).toBe(true);
    const navrh = editor.navrh;
    const pravy = navrh.pruty.find((p) => {
      const a = navrh.stycniky.find((s) => s.id === p.a)!;
      return p.prvek === "tlumic" && a.x === 24;
    });
    expect(pravy).toMatchObject({ tlumeni: 75_000 });
    expect(navrh.stycniky.find((s) => s.x === 20 && s.y === 0)).toMatchObject({ zavazi: 100 });
    expect(zkontrolujNavrh(navrh, lavka)).toEqual([]);
  });
});

describe("pohyblivý most v editoru", () => {
  const jednoKridlo = nactiUroven(kanal);
  const dvoukridly = nactiUroven(dveKridla);

  /** Editor se svařeným křídlem z dílů po `dil` metrech od čepu (0, 0) do `konec`. */
  function sKridlem(urovenMostu: typeof jednoKridlo, konec: number, dil: number): Editor {
    const e = new Editor(urovenMostu, prazdnyNavrh(urovenMostu.id), () => {});
    e.zvolPrvek("mostovka-ocel");
    for (let x = 0; x < konec; x += dil) {
      e.stiskni(B(x, 0));
      e.tahni(B(x + dil, 0));
      e.pust();
    }
    return e;
  }

  const stycnik = (e: Editor, x: number, y: number) => e.navrh.stycniky.find((s) => s.x === x && s.y === y);

  it("úpravy: zámek a svar se v jednom styčníku vylučují; zdvih se zapíše k pístu", () => {
    let navrh = pridejPrut(prazdnyNavrh("7-01"), B(0, 0), B(6, 0), "mostovka-ocel");
    navrh = pridejPrut(navrh, B(6, 0), B(12, 0), "mostovka-ocel");
    navrh = pridejPrut(navrh, B(0, -3), B(6, 0), "pist");
    const stred = navrh.stycniky.find((s) => s.x === 6)!.id;
    const svareny = nastavSvar(navrh, new Set([stred]), true);
    expect(svareny.stycniky.find((s) => s.id === stred)).toMatchObject({ svar: true });
    // Zámek je čep: svar ze styčníku zmizí a zpátky do zamčeného styčníku nejde.
    const zamceny = nastavZamek(svareny, new Set([stred]), true);
    expect(zamceny.stycniky.find((s) => s.id === stred)).toEqual({ id: stred, x: 6, y: 0, zamek: true });
    expect(nastavSvar(zamceny, new Set([stred]), true)).toBe(zamceny);
    // Odebrání zámku nic dalšího nemění a původní návrh zůstává.
    expect(nastavZamek(zamceny, new Set([stred]), false).stycniky.find((s) => s.id === stred)).toEqual({ id: stred, x: 6, y: 0 });
    expect(navrh.stycniky.find((s) => s.id === stred)).toEqual({ id: stred, x: 6, y: 0 });
    const pist = navrh.pruty.find((p) => p.prvek === "pist")!;
    expect(nastavZdvih(navrh, new Set([pist.id]), () => 2).pruty.find((p) => p.id === pist.id)).toMatchObject({ zdvih: 2 });
  });

  it("nově nakreslený píst je vybraný a jeho zdvih jde krokovat; panel zná úhel, o který křídlo zvedne", () => {
    const e = sKridlem(jednoKridlo, 12, 6);
    const zamek = stycnik(e, 12, 0)!;
    e.vyberJenStycnik(zamek.id);
    expect(e.prepniZamek()).toBe(true);
    e.zvolPrvek("pist");
    e.stiskni(B(0, -3));
    e.tahni(B(6, 0));
    expect(e.pust()).toBe(true);
    // Píst z (0, −3) do (6, 0): výchozí zdvih 1 m, největší polovina délky zaokrouhlená na krok.
    expect(e.zdvihVyberu).toMatchObject({ zdvih: 1, nejvetsi: 3.25, ruzne: false });
    expect(e.zmenZdvih(4)).toBe(true);
    const zdvih = e.zdvihVyberu!;
    expect(zdvih.zdvih).toBe(2);
    // Zdvih 2 m zvedne křídlo o 59° (pata 3 m pod čepem, úchyt 6 m od něj).
    expect((Math.acos(zdvih.otoceni!) * 180) / Math.PI).toBeCloseTo(58.9, 0);
    expect(zkontrolujNavrh(e.navrh, jednoKridlo)).toEqual([]);
    // O krok dál už by to bylo přes 70°: panel to ví a kontrola návrhu to odmítne.
    e.zmenZdvih(1);
    expect(e.zdvihVyberu!.otoceni!).toBeLessThan(Math.cos((70 * Math.PI) / 180));
    expect(zkontrolujNavrh(e.navrh, jednoKridlo).map((p) => p.druh)).toEqual(["zdvih-za-uvrati"]);
    // Bez zámku křídlo drží ložisko na opěře a neotočí se: úhel není.
    e.zmenZdvih(-1);
    e.vyberJenStycnik(zamek.id);
    e.prepniZamek();
    const pist = e.navrh.pruty.find((p) => p.prvek === "pist")!;
    e.vyberJenPrut(pist.id);
    expect(e.zdvihVyberu!.otoceni).toBeNull();
  });

  it("zrcadlení křídla nechá v ose styčník pro zámek, ať je křídlo z jakkoli dlouhých dílů", () => {
    for (const dil of [2, 3, 4, 6]) {
      const e = sKridlem(dvoukridly, 12, dil);
      expect(e.zrcadli(), `díly ${dil} m`).toBe(true);
      // Křídla se potkávají ve styčníku (12, 0); mostovka přes osu spojená není.
      expect(stycnik(e, 12, 0), `díly ${dil} m`).toBeDefined();
      expect(e.navrh.pruty).toHaveLength(2 * (12 / dil));
      const stred = stycnik(e, 12, 0)!;
      e.vyberJenStycnik(stred.id);
      expect(e.prepniZamek()).toBe(true);
      expect(zkontrolujNavrh(e.navrh, dvoukridly), `díly ${dil} m`).toEqual([]);
    }
  });

  it("zrcadlení přenese píst se zdvihem a zámek jen tam, kde zámek být smí", () => {
    // Dvoukřídlý most: zámek na konci levého křídla leží v ose a píst dostane obraz se stejným zdvihem.
    const e = sKridlem(dvoukridly, 12, 6);
    e.vyberJenStycnik(stycnik(e, 12, 0)!.id);
    e.prepniZamek();
    e.zvolPrvek("pist");
    e.stiskni(B(0, -5));
    e.tahni(B(6, 0));
    e.pust();
    e.zmenZdvih(6);
    e.zrusVyber();
    expect(e.zrcadli()).toBe(true);
    const pisty = e.navrh.pruty.filter((p) => p.prvek === "pist");
    expect(pisty.map((p) => p.zdvih)).toEqual([2.5, 2.5]);
    expect(e.navrh.stycniky.filter((s) => s.zamek)).toHaveLength(1);
    expect(zkontrolujNavrh(e.navrh, dvoukridly)).toEqual([]);

    // Jednokřídlý most: obraz zámku z opěry (12, 0) by padl na čep (0, 0); tam zámek nepatří.
    const jedno = sKridlem(jednoKridlo, 12, 6);
    jedno.vyberJenStycnik(stycnik(jedno, 12, 0)!.id);
    jedno.prepniZamek();
    jedno.zrusVyber();
    jedno.zrcadli();
    expect(jedno.navrh.stycniky.filter((s) => s.zamek).map((s) => s.x)).toEqual([12]);
  });
});
