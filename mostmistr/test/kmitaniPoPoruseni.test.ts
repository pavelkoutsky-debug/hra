// Kmitání pod lidmi se měří i na mostě, který se porušil a stojí dál. Dřív měření prvním
// porušením skončilo: most, na kterém hned na začátku něco povolilo, tak kmitání neměl změřené
// a dostal medaili za průchod, i když by na kmitání propadl (nález z návrhu úrovně 8-02).
import { describe, expect, it } from "vitest";
import { Kreslic } from "../src/data/kreslic";
import type { NavrhMostu } from "../src/data/navrh";
import type { Uroven } from "../src/data/uroven";
import { MEZE_KOMFORTU } from "../src/jadro/komfort";
import type { VysledekZkousky } from "../src/zkouska/protokol";
import { Zkouska } from "../src/zkouska/zkouska";
import { nactiKampan, nasadaUrovne } from "../urovne/index";
import { RESENI } from "../urovne/reseni";

const lavka = nactiKampan().find((u) => u.id === "8-02")!;

function zkousej(uroven: Uroven, navrh: NavrhMostu): { vysledek: VysledekZkousky; prvniPoruseni: number | null } {
  const zkouska = new Zkouska(uroven, navrh, nasadaUrovne(uroven));
  let pojistka = 0;
  while (!zkouska.hotovo) {
    zkouska.pokracuj(1);
    if (pojistka++ > 400) throw new Error("zkouška neskončila");
  }
  return { vysledek: zkouska.vysledek(), prvniPoruseni: zkouska.simulace.udalosti[0]?.cas ?? null };
}

describe("kmitání mostu, který se porušil", { timeout: 120_000 }, () => {
  it("most, na kterém hned něco povolí, ale stojí dál, se pod lidmi měří dál a na kmitání propadne", () => {
    // Údolí 8-02 s kotvou ve skalní stěně nad levým břehem a se svary: šedesátimetrová lávka
    // visí na lanech z té kotvy. Svařená ocelobetonová mostovka se na lanech hned přetíží
    // (plastické klouby), ale most stojí a útvar čtyřiceti lidí v kroku 2 Hz ho rozkmitá.
    const uroven: Uroven = {
      ...lavka,
      povoleneSvary: true,
      zakazaneZony: [],
      kotvy: [...lavka.kotvy, { x: -2, y: 24, typ: "pevna" }],
      jizdniRad: [{ ...lavka.jizdniRad[0]!, cas: 0, smer: 1, druh: "utvar", pocet: 40, kadence: 2 }],
    };
    // Napínáky lan, jak je spočítalo dopnutí (`dopniLana`), od lana k nejbližšímu styčníku.
    const predpeti = [0.043, 0.04, 0.048, 0.054, 0.061, 0.068, 0.077, 0.082, 0.107];
    const k = new Kreslic("8-02");
    for (let x = 0; x < 60; x += 6) k.prut("mostovka-ocelobeton", [x, 0], [x + 6, 0]);
    for (let x = 6; x < 60; x += 6) {
      k.prut("lano", [-2, 24], [x, 0], { predpeti: predpeti[x / 6 - 1]! });
      k.bod(x, 0, { svar: true });
    }
    const { vysledek, prvniPoruseni } = zkousej(uroven, k.navrh());
    // Porušení hned na začátku, nikdo nespadl a všichni přešli: most stojí.
    expect(vysledek.poruseni).toBeGreaterThan(0);
    expect(prvniPoruseni!).toBeLessThan(0.1);
    expect(vysledek.spadlo).toBe(0);
    expect(vysledek.prejelo).toBe(vysledek.ucastniku);
    // Kmitání je změřené, a to až po odeznění rázu porušení; je nad mezí úrovně.
    const mez = MEZE_KOMFORTU[uroven.nejhorsiKomfort - 1]!;
    expect(vysledek.komfort!.zrychleni).toBeGreaterThan(mez);
    expect(vysledek.komfort!.cas).toBeGreaterThan(3);
    expect(vysledek.pruchod).toBe(false);
    expect(vysledek.medaile).toEqual({ pruchod: false, rozpocet: false, mistrovska: false });
  });

  it("most, který se zřítil, kmitání po porušení nehlásí: příčina je pád, ne nepohodlí", () => {
    const pad = RESENI["8-02"]!.pady.find((p) => p.nazev === "jen mostovka")!;
    const { vysledek } = zkousej(lavka, pad.navrh);
    expect(vysledek.pruchod).toBe(false);
    expect(vysledek.spadlo).toBeGreaterThan(0);
    // Do porušení po mostě nikdo nedošel tak daleko, aby ho rozkmital; trosky se nepočítají.
    expect(vysledek.komfort!.zrychleni).toBeLessThan(MEZE_KOMFORTU[lavka.nejhorsiKomfort - 1]!);
    expect(vysledek.komfort!.prekroceno).toBeNull();
  });
});
