// Slovníček pojmů: které slovo v textu se pozná jako pojem.
import { describe, expect, it } from "vitest";
import { najdiPojem, POJMY } from "../src/ui/pojmy";
import { TEXTY } from "../src/ui/slovnik";

const pojemV = (text: string, jazyk: "cs" | "en" = "cs"): string | null => {
  const nalez = najdiPojem(text, jazyk);
  return nalez ? `${nalez.pojem}:${text.slice(nalez.od, nalez.od + nalez.delka)}` : null;
};

describe("slovníček pojmů", () => {
  it("každý pojem má název a vysvětlení v obou jazycích", () => {
    for (const pojem of POJMY) {
      for (const jazyk of ["cs", "en"] as const) {
        const texty = TEXTY[jazyk] as Record<string, string | undefined>;
        expect(texty[`pojem.${pojem}`], `${jazyk} ${pojem}`).toBeTruthy();
        expect(texty[`pojem.${pojem}.text`], `${jazyk} ${pojem}`).toBeTruthy();
      }
    }
  });

  it("pozná pojem v českém textu i ve skloňovaném tvaru", () => {
    expect(pojemV("Horní pás nízké příhrady je silně tlačený.")).toBe("pas:Horní pás");
    expect(pojemV("Těžký profil ve vzpěru vydrží desetkrát víc.")).toBe("vzper:ve vzpěru");
    expect(pojemV("Povolil vzpěrem.")).toBe("vzper:vzpěrem");
    expect(pojemV("Prut 6 povolil vzpěrem.")).toBe("prut:Prut");
    expect(pojemV("tomu se říká vzpěr.")).toBe("vzper:vzpěr");
    expect(pojemV("Největší využití 85 %.")).toBe("vyuziti:využití");
    expect(pojemV("Trefuje se do 1. vlastní frekvence mostu.")).toBe("vlastni-frekvence:vlastní frekvence");
    expect(pojemV("Nalaď laděný tlumič na takt kapely.")).toBe("ladeny-tlumic:laděný tlumič");
  });

  it("nesplete si vzpěr se vzpěrou ani kloub s plastickým kloubem", () => {
    // Vzpěra pojem není; kotva, ze které vede, ano.
    expect(pojemV("Vzpěra z kotvy je kratší.")).toBe("kotva:kotvy");
    expect(pojemV("Vzpěra je kratší než příčka.")).toBeNull();
    expect(pojemV("Opři o ně vzpěradla.")).toBeNull();
    // „Vzpěr“ je i druhý pád vzpěr: po předložce nebo počtu jde o vzpěry, ne o vybočení prutu.
    expect(pojemV("Pilíře bez vzpěr")).toBeNull();
    expect(pojemV("Dvojice vzpěr a rozpěry vzpěr.")).toBeNull();
    expect(pojemV("Stačí pět vzpěr.")).toBeNull();
    expect(pojemV("takové místo označí prstenec, plastický kloub.")).toBe("plasticky-kloub:plastický kloub");
    expect(pojemV("Uprostřed je kloub.")).toBe("kloub:kloub");
    // Slovo, které pojmem jen začíná nebo ho má uvnitř, pojem není.
    expect(pojemV("Svařený rám se neohne.")).toBeNull();
    expect(pojemV("Rezonanční křivka.")).toBeNull();
    expect(pojemV("Výsvary a podkloubí.")).toBeNull();
  });

  it("každý pojem slovníčku se v textu pozná, v obou jazycích", () => {
    const cs: Record<(typeof POJMY)[number], string> = {
      mostovka: "Dřevěná mostovka ze dvou dílů.",
      prut: "Každý prut něco stojí.",
      stycnik: "Táhni ze styčníku.",
      kmitani: "Rozhoduje kmitání.",
      podpora: "Vlevo je pevná podpora.",
      kotva: "Ve svazích jsou dvě kotvy.",
      rozpeti: "Na takové rozpětí nestačí.",
      kloub: "Uprostřed je kloub.",
      prihrada: "Postav příhradu.",
      pas: "Dolní pás je tažený.",
      "tah-tlak": "Tažený prut vydrží víc.",
      vzper: "Povolil vzpěrem.",
      vyuziti: "Největší využití je 85 %.",
      svar: "Pomůže svar.",
      "plasticky-kloub": "Vznikl plastický kloub.",
      "vlastni-frekvence": "První vlastní frekvence je nízko.",
      rezonance: "Hrozí rezonance.",
      tlumic: "Přidej tlumič.",
      "ladeny-tlumic": "Zavěs laděný tlumič.",
      dopnuti: "Chybí dopnutí.",
      "plavebni-profil": "Plavební profil musí zůstat volný.",
      "inzenyrsky-rozpocet": "Vejdi se do inženýrského rozpočtu.",
    };
    const en: Record<(typeof POJMY)[number], string> = {
      mostovka: "A timber deck in two pieces.",
      prut: "Every member costs something.",
      stycnik: "Drag from a joint.",
      kmitani: "What matters is vibration.",
      podpora: "On the left is a fixed support.",
      kotva: "There are two anchors in the slopes.",
      rozpeti: "Too much for a single span.",
      kloub: "There is a hinge in the middle.",
      prihrada: "Build a truss.",
      pas: "The bottom chord is in tension.",
      "tah-tlak": "It takes tension and compression.",
      vzper: "It failed by buckling.",
      vyuziti: "The highest utilisation is 85%.",
      svar: "A weld helps.",
      "plasticky-kloub": "A plastic hinge formed.",
      "vlastni-frekvence": "The first natural frequency is low.",
      rezonance: "There is a risk of resonance.",
      tlumic: "Add a damper.",
      "ladeny-tlumic": "Hang a tuned mass damper.",
      dopnuti: "It needs tensioning.",
      "plavebni-profil": "The navigation clearance must stay free.",
      "inzenyrsky-rozpocet": "Stay within the engineer’s budget.",
    };
    for (const pojem of POJMY) {
      expect(najdiPojem(cs[pojem], "cs")?.pojem, `cs ${pojem}`).toBe(pojem);
      expect(najdiPojem(en[pojem], "en")?.pojem, `en ${pojem}`).toBe(pojem);
    }
  });

  it("pozná pojem v anglickém textu", () => {
    expect(pojemV("that is called buckling.", "en")).toBe("vzper:buckling");
    expect(pojemV("a ring, a plastic hinge.", "en")).toBe("plasticky-kloub:plastic hinge");
    expect(pojemV("The top chord of a low truss is in compression.", "en")).toBe("pas:top chord");
    expect(pojemV("New here is the tuned mass damper.", "en")).toBe("ladeny-tlumic:tuned mass damper");
    expect(pojemV("Too much for a single span.", "en")).toBe("rozpeti:span");
    expect(pojemV("The Spanish train.", "en")).toBeNull();
    // Napínák lana (turnbuckle) není vzpěr (buckling) a „unhinged“ není kloub.
    expect(pojemV("Tighten the turnbuckles.", "en")).toBeNull();
    expect(pojemV("An unhinged, prewelded thing.", "en")).toBeNull();
  });

  it("pojem, který už v textu označený je, se přeskočí a najde se další", () => {
    const text = "Horní pás ve vzpěru: pás vybočí.";
    expect(najdiPojem(text, "cs", new Set(["pas"]))?.pojem).toBe("vzper");
    expect(najdiPojem(text, "cs", new Set(["pas", "vzper"]))).toBeNull();
  });
});
