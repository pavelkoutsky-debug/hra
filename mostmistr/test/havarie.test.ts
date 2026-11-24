// Havarijní komise: každý případ musí jít vyřešit. Spadlý most zkouškou neprojde, oprava
// komise je od něj nejvýš tři změny a projde bez porušení, slepé opravy neprojdou.
import { describe, expect, it } from "vitest";
import {
  cisloPripadu,
  jeIdPripadu,
  KAPITOLA_HAVARII,
  NEJVIC_ZMEN_OPRAVY,
  otevrenePripady,
  postupHavariiZTextu,
  stavOpravy,
  zapisUzavreni,
  type PripadHavarie,
} from "../src/data/havarie";
import { Kreslic } from "../src/data/kreslic";
import { PRIPADY, pripadHavarie } from "../urovne/havarie/index";
import { posudPripad } from "../urovne/havarie/over";
import { urovenPripadu } from "../urovne/havarie/pomoc";
import { nactiKampan } from "../urovne/index";

describe("případy Havarijní komise", () => {
  it("mají id 9-01, 9-02… po řadě, kapitolu z kampaně a nepletou se do kampaně", () => {
    const kapitoly = new Set(nactiKampan().map((u) => u.id.split("-")[0]));
    PRIPADY.forEach((pripad, i) => {
      expect(pripad.uroven.id).toBe(`${KAPITOLA_HAVARII}-${String(i + 1).padStart(2, "0")}`);
      expect(jeIdPripadu(pripad.uroven.id)).toBe(true);
      expect(cisloPripadu(pripad.uroven.id)).toBe(i + 1);
      expect(kapitoly.has(pripad.kapitola), pripad.uroven.id).toBe(true);
      expect(pripad.uroven.rozpocet).toBeNull();
      expect(pripad.uroven.mistrovska).toBeNull();
      expect(pripadHavarie(pripad.uroven.id)).toBe(pripad);
    });
    expect(nactiKampan().some((u) => jeIdPripadu(u.id))).toBe(false);
    expect(pripadHavarie("1-01")).toBeUndefined();
  });

  for (const pripad of PRIPADY) {
    it(`${pripad.uroven.id}: spadlý most neprojde, oprava komise projde nejvýš třemi změnami, slepé opravy neprojdou`, () => {
      const posudek = posudPripad(pripad);
      expect(posudek.vady, posudek.zprava.join("\n")).toEqual([]);
    }, 240_000);
  }
});

describe("pravidla Havarijní komise", () => {
  /** Malý případ pro pravidla: trám přes údolí 1-01 a jeho oprava vzpěrou. */
  function pripad(): PripadHavarie {
    const uroven = urovenPripadu(1, "Zkušební případ", "1-01");
    // Kreslič vrací svá pole, ne snímek: každý most má vlastního.
    const stav = (opraveny: boolean): ReturnType<Kreslic["navrh"]> => {
      const k = new Kreslic(uroven.id);
      k.prut("mostovka-drevo", [0, 0], [4, 0]);
      k.prut("mostovka-drevo", [4, 0], [8, 0]);
      if (opraveny) {
        k.prut("drevo-lehke", [0, 0], [4, 2]);
        k.prut("drevo-lehke", [4, 2], [8, 0]);
        k.prut("drevo-lehke", [4, 2], [4, 0]);
      }
      return k.navrh();
    };
    return { uroven, kapitola: "1", most: stav(false), oprava: stav(true) };
  }

  it("úroveň případu je údolí z kampaně bez rozpočtu a medailí", () => {
    const { uroven } = pripad();
    const vzor = nactiKampan().find((u) => u.id === "1-01")!;
    expect(uroven).toMatchObject({ id: "9-01", nazev: "Zkušební případ", rozpocet: null, inzenyrskyRozpocet: null, mistrovska: null, zkouskova: false });
    expect(uroven.teren).toEqual(vzor.teren);
    expect(uroven.jizdniRad).toEqual(vzor.jizdniRad);
    expect(() => urovenPripadu(2, "Nic", "1-99")).toThrow();
  });

  it("stav opravy počítá změny proti spadlému mostu a hlídá jejich počet", () => {
    const p = pripad();
    expect(stavOpravy(p, p.most)).toEqual({ zmeny: [], zbyva: NEJVIC_ZMEN_OPRAVY, platna: true });
    const tri = stavOpravy(p, p.oprava);
    expect(tri.zmeny).toHaveLength(3);
    expect(tri).toMatchObject({ zbyva: 0, platna: true });
    const k = new Kreslic(p.uroven.id);
    k.prut("mostovka-drevo", [0, 0], [4, 0]);
    k.prut("mostovka-drevo", [4, 0], [8, 0]);
    for (const [a, b] of [[[0, 0], [2, 2]], [[2, 2], [4, 0]], [[4, 0], [6, 2]], [[6, 2], [8, 0]]] as const) k.prut("drevo-lehke", [a[0], a[1]], [b[0], b[1]]);
    expect(stavOpravy(p, k.navrh())).toMatchObject({ zbyva: -1, platna: false });
  });

  it("postup: nejlepší uzavření se pamatuje, horší ho nepřepíše, nesmysly se zahodí", () => {
    let postup = zapisUzavreni({}, "9-01", 3);
    expect(postup).toEqual({ "9-01": 3 });
    postup = zapisUzavreni(postup, "9-01", 2);
    expect(postup).toEqual({ "9-01": 2 });
    expect(zapisUzavreni(postup, "9-01", 3)).toBe(postup);
    expect(postupHavariiZTextu(JSON.stringify(postup))).toEqual(postup);
    expect(postupHavariiZTextu(null)).toEqual({});
    expect(postupHavariiZTextu("{rozbité")).toEqual({});
    expect(postupHavariiZTextu('{"9-01":2,"9-02":0,"9-03":4,"9-04":1.5,"1-01":1,"neco":2,"9-05":"1"}')).toEqual({ "9-01": 2 });
  });

  it("případ se otevře s první projitou úrovní své kapitoly; uzavřený zůstává otevřený", () => {
    const a = pripad();
    const b: PripadHavarie = { ...a, uroven: { ...a.uroven, id: "9-02" }, kapitola: "4" };
    expect(otevrenePripady([a, b], new Set(), {})).toEqual(new Set());
    expect(otevrenePripady([a, b], new Set(["1-02"]), {})).toEqual(new Set(["9-01"]));
    expect(otevrenePripady([a, b], new Set(["1-02", "4-01"]), {})).toEqual(new Set(["9-01", "9-02"]));
    expect(otevrenePripady([a, b], new Set(), { "9-02": 2 })).toEqual(new Set(["9-02"]));
  });
});
