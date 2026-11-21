// Ukázky v okně se zadáním: scény musí opravdu předvádět to, co tvrdí jejich popisky,
// a zvětšení pohybu nesmí rozhodit, kdo na čem stojí.
import { describe, expect, it } from "vitest";
import { zkontrolujNavrh } from "../src/data/navrh";
import { jeKlicTextu } from "../src/ui/slovnik";
import { hezkeZvetseni, nejvetsiVychylka, zvetsiPohyb } from "../src/vykres/zvetseni";
import type { VysledekZkousky } from "../src/zkouska/protokol";
import { CARA_MOSTOVKA, CARA_PRUT, STYCNIK_BEZNY, STYCNIK_SKRYTY, type Topologie } from "../src/zkouska/zaznam";
import { Zkouska } from "../src/zkouska/zkouska";
import { nactiKampan, nasadaUrovne } from "../urovne/index";
import { ukazkaUrovne, type StranaUkazky } from "../urovne/ukazky";

const kampan = nactiKampan();

function prehraj(strana: StranaUkazky): VysledekZkousky {
  const zkouska = new Zkouska(strana.uroven, strana.navrh, nasadaUrovne(strana.uroven));
  let pojistka = 0;
  while (!zkouska.hotovo) {
    zkouska.pokracuj(1);
    expect(pojistka++).toBeLessThan(200);
  }
  return zkouska.vysledek();
}

describe("ukázky k úrovním", () => {
  it("mají je úrovně, které učí něco nového, a ke každé jsou texty", () => {
    const sUkazkou = kampan.filter((u) => ukazkaUrovne(u) !== null).map((u) => u.id);
    expect(sUkazkou).toEqual(["1-01", "2-02", "2-03", "2-04"]);
    for (const id of sUkazkou) {
      for (const cast of ["a", "b", "popis"]) expect(jeKlicTextu(`ukazka.${id}.${cast}`), `${id}.${cast}`).toBe(true);
    }
  });

  it("souvislost se skutečností má první úroveň a celá druhá kapitola", () => {
    const sTextem = kampan.filter((u) => jeKlicTextu(`skutecnost.${u.id}`)).map((u) => u.id);
    expect(sTextem).toEqual(["1-01", "2-01", "2-02", "2-03", "2-04"]);
  });

  for (const uroven of kampan) {
    const ukazka = ukazkaUrovne(uroven);
    if (!ukazka) continue;
    describe(`ukázka ${uroven.id}`, () => {
      it("oba mosty vyhovují pravidlům úrovně (až na rozpočet)", () => {
        for (const strana of [ukazka.a, ukazka.b]) {
          const problemy = zkontrolujNavrh(strana.navrh, strana.uroven).filter((p) => p.druh !== "nad-rozpocet");
          expect(problemy).toEqual([]);
        }
      });

      const a = prehraj(ukazka.a);
      const b = prehraj(ukazka.b);

      it("levý most neobstojí, pravý ano", () => {
        expect(a.pruchod).toBe(false);
        expect(b.pruchod).toBe(true);
        expect(a.rozpad || b.rozpad).toBe(false);
      });

      if (uroven.id !== "1-01") {
        it("rozdíl dělá kmitání, ne pevnost: nikdo nespadne, nic se nezlomí a vlevo se houpe mnohem víc", () => {
          expect(a).toMatchObject({ spadlo: 0, poruseni: 0 });
          expect(a.komfort!.zrychleni).toBeGreaterThan(2.5 * b.komfort!.zrychleni);
          expect(a.komfort!.trida).toBe(4);
        });

        it("ukázka netrvá déle než půl minuty", () => {
          expect(Math.max(a.trvani, b.trvani)).toBeLessThan(32);
        });
      }
    }, 120_000);
  }
});

describe("zvětšení pohybu pro kreslení", () => {
  // Dva díly mostovky mezi styčníky 0–1–2 a chodec (skrytý styčník 3) stojící nad jejím středem.
  const stavba: Topologie = {
    stycniku: 4,
    prvekA: Int32Array.from([0, 1]),
    prvekB: Int32Array.from([1, 2]),
    prut: Int32Array.from([0, 1]),
    cara: Uint8Array.from([CARA_MOSTOVKA, CARA_MOSTOVKA]),
    klouby: new Uint8Array(2),
    podpory: Uint8Array.from([3, 0, 2, 0]),
    znacky: Uint8Array.from([STYCNIK_BEZNY, STYCNIK_BEZNY, STYCNIK_BEZNY, STYCNIK_SKRYTY]),
  };
  const vychozi = Float32Array.from([0, 0, 4, -0.01, 8, 0, -3, 1]);
  // Střed klesl o 2 cm, chodec došel nad čtvrtinu rozpětí (x = 2) a stojí metr nad mostovkou.
  const ted = Float32Array.from([0, 0, 4, -0.03, 8, 0, 2, 0.985]);

  it("svislou výchylku konstrukce násobí, vodorovnou polohu nechává", () => {
    const zvetsene = zvetsiPohyb(stavba, vychozi, ted, 10, new Float32Array(0));
    expect(zvetsene[2]).toBe(4);
    expect(zvetsene[3]).toBeCloseTo(-0.01 + 10 * -0.02, 6);
    expect(zvetsene[1]).toBe(0);
    expect(zvetsene[5]).toBe(0);
  });

  it("chodec klesne o tolik, o kolik zvětšení posunulo mostovku pod ním", () => {
    const zvetsene = zvetsiPohyb(stavba, vychozi, ted, 10, new Float32Array(0));
    // V x = 2 je mostovka v polovině mezi podporou (0) a středem (−0,02): −0,01; zvětšení přidá 9× tolik.
    expect(zvetsene[6]).toBe(2);
    expect(zvetsene[7]).toBeCloseTo(0.985 - 0.09, 6);
    // Mimo mostovku se účastník neposouvá.
    const mimo = Float32Array.from([0, 0, 4, -0.03, 8, 0, -3, 0.985]);
    expect(zvetsiPohyb(stavba, vychozi, mimo, 10, new Float32Array(0))[7]).toBeCloseTo(0.985, 6);
  });

  it("jednonásobek a snímek jiné stavby vrací polohy beze změny", () => {
    expect([...zvetsiPohyb(stavba, vychozi, ted, 1, new Float32Array(0))]).toEqual([...ted]);
    const jina = Float32Array.from([0, 0, 4, -0.03, 8, 0]);
    expect([...zvetsiPohyb(stavba, vychozi, jina, 10, new Float32Array(0))]).toEqual([...jina]);
  });

  it("vstupní pole nemění a cílové pole stejné velikosti použije znovu", () => {
    const kopie = ted.slice();
    const cil = new Float32Array(8);
    expect(zvetsiPohyb(stavba, vychozi, ted, 10, cil)).toBe(cil);
    expect([...ted]).toEqual([...kopie]);
  });

  it("největší výchylka se bere jen z konstrukce, ne z lidí", () => {
    expect(nejvetsiVychylka(stavba, vychozi, ted)).toBeCloseTo(0.02, 6);
    const prut: Topologie = { ...stavba, cara: Uint8Array.from([CARA_PRUT, CARA_PRUT]) };
    expect(nejvetsiVychylka(prut, vychozi, ted)).toBeCloseTo(0.02, 6);
  });

  it("zvětšení se zaokrouhluje dolů na hezké číslo", () => {
    expect(hezkeZvetseni(0.038, 1.1)).toBe(20);
    expect(hezkeZvetseni(0.004, 1.1)).toBe(200);
    expect(hezkeZvetseni(0.6, 1.1)).toBe(1);
    expect(hezkeZvetseni(0, 1.1)).toBe(1);
  });
});
