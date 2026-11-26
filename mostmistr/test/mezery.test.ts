// Rozbor mezery v mostovce pro značku při stavbě (hlášení hráče z 1-02: „lidé padají skrze
// položenou mostovku na zemi“).
import { describe, expect, it } from "vitest";
import { Kreslic } from "../src/data/kreslic";
import { mostovkaVypadaHotove, mostovkaZaBrehem, rozborMezery } from "../src/data/mezery";
import { mezeryTras } from "../src/data/navrh";
import { nactiKampan } from "../urovne/index";
import { RESENI } from "../urovne/reseni";

const kampan = nactiKampan();
const uroven = (id: string) => kampan.find((u) => u.id === id)!;
const cyklostezka = uroven("1-02");

type Prut = [string, [number, number], [number, number]];
function most(pruty: Prut[], id = "1-02") {
  const k = new Kreslic(id);
  for (const [prvek, a, b] of pruty) k.prut(prvek as Parameters<Kreslic["prut"]>[0], a, b);
  return k.navrh();
}
const D = "mostovka-drevo";
const L = "drevo-lehke";

describe("rozbor mezery v mostovce", () => {
  it("mostovka přes kraj břehu bez styčníku: značka na kraji břehu, i když most vypadá hotově", () => {
    // Tah 0 → 13 m, jak ho editor dělil před opravou: 4 + 3 + 3 + 3 m.
    const n = most([
      [D, [0, 0], [4, 0]],
      [D, [4, 0], [7, 0]],
      [D, [7, 0], [10, 0]],
      [D, [10, 0], [13, 0]],
      [L, [2, -3], [4, 0]],
      [L, [10, -3], [7, 0]],
      [L, [10, -3], [10, 0]],
    ]);
    const nalez = rozborMezery(n, cyklostezka);
    expect(nalez).toMatchObject({ druh: "presah", misto: { x: 12, y: 0 }, prut: 3, mezera: { od: 10, do: 12 } });
    expect(mostovkaVypadaHotove(n, cyklostezka)).toBe(true);
  });

  it("mostovka po svazích a dně údolí: lidé jdou po trase nahoře, mostovka leží mimo ni", () => {
    const n = most([
      [D, [0, 0], [2, -3]],
      [D, [2, -3], [6, -3]],
      [D, [6, -3], [10, -3]],
      [D, [10, -3], [12, 0]],
    ]);
    const nalez = rozborMezery(n, cyklostezka);
    expect(nalez?.druh).toBe("mimo-trasu");
    expect(nalez?.mezera).toMatchObject({ od: 0, do: 12 });
    // Ze dvou čtyřmetrových dílů na dně (stejný překryv) bere první.
    expect(nalez?.prut).toBe(1);
    expect(mostovkaVypadaHotove(n, cyklostezka)).toBe(true);
  });

  it("mostovka, která na břeh nedosáhne, a díra uprostřed; rozestavěný most nevypadá hotově", () => {
    const kratka = most([
      [D, [0, 0], [4, 0]],
      [D, [4, 0], [8, 0]],
      [D, [8, 0], [11, 0]],
    ]);
    expect(rozborMezery(kratka, cyklostezka)).toMatchObject({ druh: "breh", misto: { x: 11, y: 0 }, prut: null });
    expect(mostovkaVypadaHotove(kratka, cyklostezka)).toBe(false);
    const zprava = most([[D, [12, 0], [8, 0]]]);
    expect(rozborMezery(zprava, cyklostezka)).toMatchObject({ druh: "breh", misto: { x: 8, y: 0 } });
    expect(rozborMezery(most([]), cyklostezka)).toMatchObject({ druh: "breh", misto: { x: 0, y: 0 } });
    const dira = most([
      [D, [0, 0], [4, 0]],
      [D, [8, 0], [12, 0]],
    ]);
    expect(rozborMezery(dira, cyklostezka)).toMatchObject({ druh: "uprostred", misto: { x: 6, y: 0 }, mezera: { od: 4, do: 8 } });
    expect(mostovkaVypadaHotove(dira, cyklostezka)).toBe(false);
  });

  it("mostovka od břehu k břehu žádnou mezeru nemá", () => {
    for (const r of [RESENI["1-02"]!.pruchod, RESENI["1-02"]!.mistrovska]) {
      expect(rozborMezery(r, cyklostezka)).toBeNull();
      expect(mostovkaVypadaHotove(r, cyklostezka)).toBe(false);
    }
  });

  it("mostovka jen na břehu za koncem trasy se hlásí; mosty autorů ji nemají", () => {
    const n = most([
      [D, [0, 0], [4, 0]],
      [D, [4, 0], [8, 0]],
      [D, [8, 0], [12, 0]],
      [D, [12, 0], [16, 0]],
      [L, [2, -3], [4, 0]],
      [L, [10, -3], [8, 0]],
    ]);
    expect(mezeryTras(n, cyklostezka)).toEqual([]);
    expect(mostovkaZaBrehem(n, cyklostezka)).toEqual({ prut: 3, misto: { x: 14, y: 0 } });
    for (const u of kampan) {
      const r = RESENI[u.id];
      if (!r) continue;
      for (const navrh of [r.pruchod, r.rozpocet, r.mistrovska, ...(r.vyzvy ?? []).map((v) => v.navrh)]) {
        expect(mostovkaZaBrehem(navrh, u), u.id).toBeNull();
        expect(rozborMezery(navrh, u), u.id).toBeNull();
      }
    }
  });
});
