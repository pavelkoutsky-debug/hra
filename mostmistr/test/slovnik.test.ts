import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { ID_SANDBOXU } from "../src/data/sandbox";
import { NAZVY_UROVNI_EN } from "../src/ui/slovnik-en";
import { aktualniJazyk, jeKlicTextu, nastavJazyk, nazevUrovne, t, TEXTY, type KlicTextu } from "../src/ui/slovnik";
import { nactiUrovne } from "../urovne/index";

/** Místa k doplnění v textu, seřazená: „{x} a {y}“ → ["x", "y"]. */
function mista(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((nalez) => nalez[1]!).sort();
}

describe("slovník", () => {
  it("doplní hodnoty na označená místa", () => {
    expect(t("souradnice.bod", { x: "3", y: "−2" })).toBe("x = 3 m · y = −2 m");
  });

  it("chybějící hodnotu nechá viditelnou, aby se na ni přišlo", () => {
    expect(t("souradnice.bod", { x: "3" })).toBe("x = 3 m · y = {y} m");
  });

  it("stránka odkazuje jen na texty, které ve slovníku jsou", () => {
    const stranka = readFileSync(new URL("../index.html", import.meta.url), "utf-8");
    const klice = [...stranka.matchAll(/data-(?:text|popis)="([^"]+)"/g)].map((nalez) => nalez[1]!);
    expect(klice.length).toBeGreaterThan(5);
    for (const klic of klice) expect(jeKlicTextu(klic), klic).toBe(true);
  });
});

describe("angličtina", () => {
  afterEach(() => nastavJazyk("cs"));

  const klice = Object.keys(TEXTY.cs) as KlicTextu[];

  it("má text ke každému klíči a žádný navíc", () => {
    const chybi = klice.filter((klic) => !(TEXTY.en[klic] ?? "").trim());
    expect(chybi).toEqual([]);
    const navic = Object.keys(TEXTY.en).filter((klic) => !jeKlicTextu(klic));
    expect(navic).toEqual([]);
  });

  it("doplňuje stejné hodnoty jako čeština", () => {
    // Jiné jméno v závorkách by ve hře zůstalo viset jako {jmeno}.
    const jine = klice.filter((klic) => {
      const anglicky = TEXTY.en[klic];
      return anglicky !== undefined && mista(anglicky).join() !== mista(TEXTY.cs[klic]).join();
    });
    expect(jine).toEqual([]);
  });

  it("nenechává v textu českou diakritiku, která tam nepatří", () => {
    // Měna (Kč) a název češtiny na přepínači jazyka česky být mají; jinak jde o zapomenutou větu.
    const ceske = klice.filter((klic) => /[ěščřžýůďťň]/i.test((TEXTY.en[klic] ?? "").replace(/Kč|Česky/g, "")));
    expect(ceske).toEqual([]);
  });

  it("má název každé úrovně, zkušebního výkresu i sandboxu", () => {
    const bezNazvu = [...nactiUrovne().map((u) => u.id), ID_SANDBOXU].filter((id) => !(NAZVY_UROVNI_EN[id] ?? "").trim());
    expect(bezNazvu).toEqual([]);
  });

  it("po přepnutí vrací anglické texty a názvy úrovní", () => {
    const uroven = nactiUrovne().find((u) => u.id === "1-01")!;
    expect(aktualniJazyk()).toBe("cs");
    expect(nazevUrovne(uroven)).toBe("Lávka přes potok");
    const cesky = t("lista.celyVykres");
    nastavJazyk("en");
    expect(t("lista.celyVykres")).not.toBe(cesky);
    expect(nazevUrovne(uroven)).toBe(NAZVY_UROVNI_EN["1-01"]);
    expect(t("hra.nazev")).toBe("Mostmistr");
  });
});
