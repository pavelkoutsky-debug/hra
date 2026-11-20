import { describe, expect, it } from "vitest";
import { TIHOVE_ZRYCHLENI } from "../src/jadro/integrator";
import { ULOZNA_DELKA, uvolniSjeta, vytvorLoziska } from "../src/jadro/loziska";
import { Simulace } from "../src/jadro/simulace";
import { sestavSoustavu } from "../src/jadro/soustava";
import { DREVENY_TRAM, nosnik } from "./pomucky-jadra";

describe("posuvná podpora s úložnou délkou", () => {
  it("najde jen podpory, které drží svislý posun a vodorovný nechávají volný", () => {
    const s = sestavSoustavu(nosnik(DREVENY_TRAM, 8, 4, "prosty"));
    const loziska = vytvorLoziska(s);
    expect([...loziska.stycnik]).toEqual([4]);
    expect(loziska.x0[0]).toBe(8);
    expect(loziska.delka).toBe(ULOZNA_DELKA);
  });

  it("drží, dokud se konec posune o míň než úložnou délku, pak ho pustí", () => {
    const s = sestavSoustavu(nosnik(DREVENY_TRAM, 8, 4, "prosty"));
    const loziska = vytvorLoziska(s);
    const sjete: number[] = [];

    s.x[4] = 8 - 0.9 * ULOZNA_DELKA;
    expect(uvolniSjeta(s, loziska, sjete)).toBe(0);
    expect(s.podpora[4]! & 2).toBe(2);

    s.x[4] = 8 - 1.1 * ULOZNA_DELKA;
    expect(uvolniSjeta(s, loziska, sjete)).toBe(1);
    expect(sjete).toEqual([4]);
    expect(s.podpora[4]! & 2).toBe(0);

    // Podruhé už není co uvolnit.
    expect(uvolniSjeta(s, loziska, sjete)).toBe(0);
  });

  it("celý nosník na ložisku jen dýchá: v simulaci z něj nesjede", () => {
    const s = sestavSoustavu(nosnik(DREVENY_TRAM, 8, 4, "prosty"));
    const sim = new Simulace(s, { tiha: TIHOVE_ZRYCHLENI, utlum: 0.02, loziska: vytvorLoziska(s) });
    while (sim.cas < 1) sim.krok();
    expect(sim.sjeti).toEqual([]);
    expect(sim.porusena).toBe(false);
    expect(Math.abs(s.x[4]! - 8)).toBeLessThan(0.01);
  });

  it("nosník s kloubem uprostřed se prolomí, sjede z ložiska a konec spadne", () => {
    const popis = nosnik(DREVENY_TRAM, 8, 4, "prosty");
    // Kloub uprostřed udělá z nosníku mechanismus: dvě ramena, která se prolomí dolů.
    popis.prvky[1]!.kloubB = true;
    popis.prvky[2]!.kloubA = true;
    popis.stycniky[2]!.y = -0.05;
    const s = sestavSoustavu(popis);
    const sim = new Simulace(s, { tiha: TIHOVE_ZRYCHLENI, utlum: 0.02, loziska: vytvorLoziska(s) });
    let nejniz = 0;
    while (sim.cas < 3 && !sim.rozpadla) {
      sim.krok();
      nejniz = Math.min(nejniz, s.y[4]!);
    }
    expect(sim.rozpadla).toBe(false);
    expect(sim.sjeti.map((u) => u.stycnik)).toEqual([4]);
    expect(sim.porusena).toBe(true);
    // Volný konec už nedrží nic: zhoupne se hluboko pod pevnou podporu.
    expect(nejniz).toBeLessThan(-4);
  });
});
