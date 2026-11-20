// Měřicí nástroje musí samy fungovat: referenční mosty jsou stabilní a měření doběhne.
import { describe, expect, it } from "vitest";
import { nejvyssiFrekvence } from "../src/jadro/matice";
import { sestavSoustavu } from "../src/jadro/soustava";
import { volneStupne } from "../src/jadro/stupne";
import { prihradovyMost, REFERENCNI_MOSTY } from "../mereni/mosty";
import { PRUREZY, rychlostVlny } from "../mereni/prurezy";
import { zmerVykon } from "../mereni/vykon";

describe("referenční mosty", () => {
  it("největší má 300 styčníků a kolem 600 prutů", () => {
    const most = prihradovyMost({ ...REFERENCNI_MOSTY[2]!, svarene: false });
    expect(most.popis.stycniky).toHaveLength(300);
    expect(most.popis.prvky).toHaveLength(597);
  });

  it("krok určuje nejkratší prut: počet kroků odpovídá rychlosti vlny dělené délkou", () => {
    for (const zadani of REFERENCNI_MOSTY) {
      for (const svarene of [false, true]) {
        const s = sestavSoustavu(prihradovyMost({ ...zadani, svarene }).popis);
        const krokuNaSekundu = nejvyssiFrekvence(s, volneStupne(s)) / 2;
        // Horní mez: nejrychlejší vlna (dřevo a ocel, ~5 200 m/s) v nejkratším prutu.
        const mez = Math.max(rychlostVlny(PRUREZY["ocel-lehka"]), rychlostVlny(PRUREZY["drevo-lehke"])) / zadani.delkaPole;
        expect(krokuNaSekundu).toBeLessThanOrEqual(mez * 1.001);
        expect(krokuNaSekundu).toBeGreaterThan(mez * 0.5);
      }
    }
  });
});

describe("měření výkonu", () => {
  it("doběhne pro všechny mosty a dá smysluplná čísla", () => {
    const prubezne: string[] = [];
    const vysledky = zmerVykon(() => performance.now(), (v) => prubezne.push(v.nazev), 20);
    expect(vysledky).toHaveLength(6);
    expect(prubezne).toHaveLength(6);
    for (const v of vysledky) {
      expect(v.krokuNaSekundu).toBeGreaterThan(1000);
      expect(v.holeJadro.mikrosekundNaKrok).toBeGreaterThan(0);
      expect(v.sProvozem.mikrosekundNaKrok).toBeGreaterThan(v.holeJadro.mikrosekundNaKrok * 0.5);
      expect(v.prvniFrekvence).toBeGreaterThan(0.1);
    }
  }, 120_000);
});
