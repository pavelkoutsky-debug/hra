// Stavební režim bez prohlížeče: úpravy návrhu, pravidla kreslení, výběr a historie.
import { describe, expect, it } from "vitest";
import { zkontrolujNavrh } from "../src/data/navrh";
import { nactiUroven } from "../src/data/uroven";
import { Editor } from "../src/editor/editor";
import { duvodProtiPrutu, lzeZacit } from "../src/editor/pravidla";
import { bezOsamelychStycniku, posunStycnik, prazdnyNavrh, pridejPrut, smaz, zmenPrvek, zrcadli } from "../src/editor/upravy";
import potok from "../urovne/1-01.json";
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
    e.tahni(B(6, 0));
    expect(e.tah).toMatchObject({ duvod: "prut-dlouhy" });
    expect(e.pust()).toBe(false);
    expect(e.navrh.pruty).toHaveLength(0);
    expect(e.posledniDuvod).toBe("prut-dlouhy");
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
