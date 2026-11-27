// Kde si most při zkoušce lehl na zem: typické mosty nováčka v 1-01 s podpěrou dolů do údolí.
import { describe, expect, it } from "vitest";
import type { IdPrvku } from "../src/data/katalog";
import { Kreslic } from "../src/data/kreslic";
import type { NavrhMostu } from "../src/data/navrh";
import { najdiOpreni } from "../src/zkouska/opreni";
import { Zaznam } from "../src/zkouska/zaznam";
import { Zkouska } from "../src/zkouska/zkouska";
import { nactiKampan, nasadaUrovne } from "../urovne/index";
import { RESENI } from "../urovne/reseni";

const uroven = nactiKampan().find((u) => u.id === "1-01")!;
const M: IdPrvku = "mostovka-drevo";
const L: IdPrvku = "drevo-lehke";

function most(pruty: [IdPrvku, [number, number], [number, number]][]): NavrhMostu {
  const k = new Kreslic("1-01");
  for (const [prvek, a, b] of pruty) k.prut(prvek, a, b);
  return k.navrh();
}

/** Celá zkouška do záznamu, jak ho dostává obrazovka úrovně. */
function zaznamZkousky(navrh: NavrhMostu): { zaznam: Zaznam; opreno: boolean } {
  const zkouska = new Zkouska(uroven, navrh, nasadaUrovne(uroven));
  const zaznam = new Zaznam();
  while (!zkouska.hotovo) {
    const davka = zkouska.pokracuj(1);
    davka.topologie.forEach((t) => zaznam.pridejTopologii(t));
    davka.snimky.forEach((s) => zaznam.pridej(s));
  }
  return { zaznam, opreno: zkouska.vysledek().opreno };
}

const mostovka: [IdPrvku, [number, number], [number, number]][] = [
  [M, [0, 0], [4, 0]],
  [M, [4, 0], [8, 0]],
];

describe("místo, kde most ležel na zemi", () => {
  it("podpěra svedená na dno údolí: pata podpěry", () => {
    const navrh = most([...mostovka, [L, [4, 0], [4, -3]]]);
    const { zaznam, opreno } = zaznamZkousky(navrh);
    expect(opreno).toBe(true);
    expect(najdiOpreni(uroven, navrh, zaznam)).toMatchObject({ misto: { x: 4, y: -3 }, noha: true });
  });

  it("kozy na dně údolí: jedna z jejich pat", () => {
    const navrh = most([...mostovka, [L, [4, 0], [3, -3]], [L, [4, 0], [5, -3]], [L, [3, -3], [5, -3]]]);
    const { zaznam, opreno } = zaznamZkousky(navrh);
    expect(opreno).toBe(true);
    const opreni = najdiOpreni(uroven, navrh, zaznam);
    expect(opreni?.noha).toBe(true);
    expect(opreni?.misto.y).toBe(-3);
  });

  it("most autora se země nedotkne", () => {
    const navrh = RESENI["1-01"]!.pruchod;
    const { zaznam, opreno } = zaznamZkousky(navrh);
    expect(opreno).toBe(false);
    expect(najdiOpreni(uroven, navrh, zaznam)).toBeNull();
  });
});
