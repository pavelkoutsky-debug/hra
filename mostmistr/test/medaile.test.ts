// Podmínky medailí slovy: číslo, které hráč čte, je přesně to, podle kterého hra rozhoduje.
import { describe, expect, it } from "vitest";
import { podminkaMistrovske } from "../src/hra/medaile";
import { nastavJazyk } from "../src/ui/slovnik";
import { nactiKampan } from "../urovne/index";

const kampan = nactiKampan();

describe("podmínka mistrovské medaile", () => {
  it("píše limit bonusu beze ztráty: 0,25 m/s² není 0,3", () => {
    nastavJazyk("cs");
    for (const uroven of kampan) {
      const bonus = uroven.mistrovska!;
      const text = podminkaMistrovske(uroven)!;
      // Poslední číslo ve větě je limit: v procentech, m/s² nebo kN.
      const cisla = [...text.matchAll(/\d+(?:,\d+)?/g)].map((m) => Number(m[0].replace(",", ".")));
      const psano = cisla.at(-1)!;
      const hodnota = bonus.druh === "rezerva" ? psano / 100 : bonus.druh === "dosednuti" ? psano * 1000 : psano;
      expect(hodnota, `${uroven.id}: ${text}`).toBeCloseTo(bonus.limit, 9);
    }
    const nabrezi = kampan.find((u) => u.id === "5-01")!;
    expect(podminkaMistrovske(nabrezi)).toBe("rozpočtová medaile a k ní kmitání mostovky nejvýš 0,25 m/s²");
  });

  it("mistrovská je vždycky rozpočtová a něco k ní, česky i anglicky", () => {
    for (const uroven of kampan) {
      nastavJazyk("cs");
      expect(podminkaMistrovske(uroven), uroven.id).toMatch(/^rozpočtová medaile a k ní /);
      nastavJazyk("en");
      expect(podminkaMistrovske(uroven), uroven.id).toMatch(/^the Budget medal plus /);
    }
    nastavJazyk("cs");
  });
});
