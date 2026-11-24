// Rysy mostu a věta o principu v nápovědě: co nápověda o mostě autora tvrdí, musí na něm být.
import { describe, expect, it } from "vitest";
import { principMostu, rysyMostu, type NosnaSoustava } from "../src/data/rysy";
import { jeKlicTextu } from "../src/ui/slovnik";
import { EN } from "../src/ui/slovnik-en";
import { rozeberMost } from "../src/zkouska/rozbor";
import { Kreslic } from "../src/data/kreslic";
import { nactiKampan } from "../urovne/index";
import { RESENI } from "../urovne/reseni";

const kampan = nactiKampan();
/** Úrovně, které mají nápovědu (zkouškové ji nemají). */
const sNapovedou = kampan.filter((u) => !u.zkouskova);
const MOSTY = ["pruchod", "rozpocet", "mistrovska"] as const;

/**
 * Čím nesou mosty autora: ten, který projde, most pro medaili za rozpočet a mistrovský.
 * Když se referenční most změní, patří sem nová hodnota (a s ní se změní věta i skica v nápovědě).
 */
const SOUSTAVY: Record<string, readonly [NosnaSoustava, NosnaSoustava, NosnaSoustava]> = {
  "1-01": ["trojuhelnik-nad", "trojuhelnik-nad", "trojuhelnik-pod"],
  "1-02": ["prihrada-nad", "vzpery", "vzpery"],
  "1-03": ["prihrada-nad", "prihrada-nad", "prihrada-nad"],
  "1-04": ["vzpery", "vzpery", "vzpery"],
  "2-01": ["prihrada-nad", "prihrada-nad", "prihrada-nad"],
  "2-02": ["prihrada-nad", "prihrada-nad", "prihrada-nad"],
  "2-03": ["prihrada-nad", "prihrada-nad", "prihrada-nad"],
  "2-04": ["prihrada-nad", "prihrada-nad", "prihrada-nad"],
  "3-01": ["prihrada-nad", "prihrada-nad", "prihrada-nad"],
  "3-02": ["prihrada-nad", "prihrada-nad", "prihrada-nad"],
  "3-03": ["prihrada-nad", "prihrada-pod", "prihrada-pod"],
  "3-04": ["prihrada-nad", "prihrada-nad", "vzpery"],
  "4-01": ["prihrada-nad", "prihrada-pod", "prihrada-pod"],
  "4-02": ["nosnik", "nosnik", "nosnik"],
  "4-03": ["zaveseny", "zaveseny", "zaveseny"],
  "4-04": ["visuty", "visuty", "visuty"],
  "5-01": ["prihrada-nad", "prihrada-nad", "prihrada-nad"],
  "5-02": ["prihrada-nad", "prihrada-nad", "prihrada-nad"],
  "5-03": ["prihrada-nad", "prihrada-nad", "prihrada-nad"],
  "5-04": ["prihrada-nad", "prihrada-nad", "prihrada-nad"],
  "6-01": ["prihrada-nad", "prihrada-nad", "prihrada-nad"],
  "6-02": ["prihrada-pod", "prihrada-pod", "prihrada-pod"],
  "6-03": ["prihrada-pod", "prihrada-pod", "prihrada-pod"],
  "6-04": ["mezi-patry", "mezi-patry", "mezi-patry"],
  "7-01": ["zvedaci", "zvedaci", "zvedaci"],
  "7-02": ["zvedaci", "zvedaci", "zvedaci"],
  "7-03": ["zvedaci", "zvedaci", "zvedaci"],
  "7-04": ["zvedaci", "zvedaci", "zvedaci"],
  "8-01": ["zaveseny", "zaveseny", "zaveseny"],
  "8-02": ["zaveseny", "zaveseny", "zaveseny"],
  "8-03": ["zvedaci", "zvedaci", "zvedaci"],
};

describe("rysy referenčních mostů", () => {
  it("každý most autora nese tak, jak říká tabulka", () => {
    // Zkouškové úrovně nápovědu nemají (hráč má lekce kapitoly spojit sám), takže v tabulce nejsou.
    expect(Object.keys(SOUSTAVY).sort()).toEqual(sNapovedou.map((u) => u.id).sort());
    for (const uroven of sNapovedou) {
      MOSTY.forEach((most, i) => {
        expect(rysyMostu(RESENI[uroven.id]![most], uroven).soustava, `${uroven.id} ${most}`).toBe(SOUSTAVY[uroven.id]![i]);
      });
    }
  });

  it("mosty pro medaile se od průchodu liší tam, kde se liší jejich stavba", () => {
    const u = (id: string) => kampan.find((x) => x.id === id)!;
    // 2-04: mistrovský most má navíc viskózní tlumiče.
    expect(rysyMostu(RESENI["2-04"]!.pruchod, u("2-04")).viskozniTlumice).toBe(false);
    expect(rysyMostu(RESENI["2-04"]!.mistrovska, u("2-04")).viskozniTlumice).toBe(true);
    // 7-02: most pro průchod má křídla ztužená pruty (do inženýrského rozpočtu se nevejde),
    // most pro mistrovskou ne.
    expect(rysyMostu(RESENI["7-02"]!.pruchod, u("7-02")).ztuzeni).toBe(true);
    expect(rysyMostu(RESENI["7-02"]!.mistrovska, u("7-02")).ztuzeni).toBe(false);
  });

  it("vzpěry do kotev pod mostovkou nejsou příhrada s dolním pásem", () => {
    const u = (id: string) => kampan.find((x) => x.id === id)!;
    // 1-04: vzpěradla opřená o svahy; s věšadlem nad mostovkou navíc to věta řekne.
    expect(principMostu(rysyMostu(RESENI["1-04"]!.pruchod, u("1-04")))).toEqual(["vzpery"]);
    expect(principMostu(rysyMostu(RESENI["1-04"]!.rozpocet, u("1-04")))).toEqual(["vzpery"]);
    const zaklad = RESENI["1-04"]!.pruchod;
    const misto = (id: number): [number, number] => {
      const st = zaklad.stycniky.find((x) => x.id === id)!;
      return [st.x, st.y];
    };
    const sVesadlem = new Kreslic("1-04");
    for (const p of zaklad.pruty) sVesadlem.prut(p.prvek, misto(p.a), misto(p.b));
    sVesadlem.prut("drevo-lehke", [8, 0], [12, 2]);
    sVesadlem.prut("drevo-lehke", [12, 2], [16, 0]);
    sVesadlem.prut("drevo-lehke", [12, 0], [12, 2]);
    expect(principMostu(rysyMostu(sVesadlem.navrh(), u("1-04")))).toEqual(["vzpery", "vesadlo.navic"]);
    // 3-04: příhrada nad mostovkou a k tomu nohy na skálu uprostřed údolí. Most, který má
    // spadnout, protože je nemá, dostane jinou větu.
    expect(principMostu(rysyMostu(RESENI["3-04"]!.pruchod, u("3-04")))).toEqual(["prihrada-nad", "vzpery.navic"]);
    const bezPodpery = RESENI["3-04"]!.pady.find((p) => p.nazev.includes("bez pilíře"))!.navrh;
    expect(principMostu(rysyMostu(bezPodpery, u("3-04")))).toEqual(["prihrada-nad"]);
    // 3-03 a 6-02: příhrada pod mostovkou bez kotev pod ní zůstává příhradou.
    expect(rysyMostu(RESENI["3-03"]!.rozpocet, u("3-03")).soustava).toBe("prihrada-pod");
    expect(rysyMostu(RESENI["6-02"]!.pruchod, u("6-02")).soustava).toBe("prihrada-pod");
  });

  it("přídavky se poznají: pilíře, svary, závaží, laděný tlumič, zámek, počet křídel a pylonů", () => {
    const rysy = (id: string) => rysyMostu(RESENI[id]!.pruchod, kampan.find((x) => x.id === id)!);
    expect(rysy("4-01")).toMatchObject({ pilire: true, svary: false });
    // Pylony lanového mostu a pilíře spojitého nosníku nejsou „pilíře pod příhradou“.
    expect(rysy("4-02")).toMatchObject({ pilire: false, svary: true, svaryMeziPodporami: true });
    // Zavěšený most 4-03 má jediný pylon (úroveň má jediný základ), visutý 4-04 dva.
    expect(rysy("4-03")).toMatchObject({ pilire: false, pylonu: 1, pylonyNaOperach: false });
    expect(rysy("4-04")).toMatchObject({ pilire: false, pylonu: 2, pylonyNaOperach: false });
    expect(rysy("2-03")).toMatchObject({ zavazi: true, ladeneTlumice: false, pylonu: 0 });
    expect(rysy("5-02")).toMatchObject({ zavazi: false, ladeneTlumice: true });
    expect(rysy("7-01")).toMatchObject({ kridel: 1, zamek: true });
    expect(rysy("7-02")).toMatchObject({ kridel: 2, zamek: true });
    // Jedno křídlo se dvěma písty (8-03, most pro mistrovskou) je pořád jedno křídlo se zámkem na břehu.
    expect(rysyMostu(RESENI["8-03"]!.mistrovska, kampan.find((u) => u.id === "8-03")!)).toMatchObject({ kridel: 1, zamek: true });
    expect(principMostu(rysyMostu(RESENI["8-03"]!.mistrovska, kampan.find((u) => u.id === "8-03")!))).toEqual(["zvedaci.jedno", "zamek.breh", "ztuzeni"]);
    // Ocelové stožáry lávky 8-02 jsou pylony (skica je nekreslí jako jediný pylon uprostřed)
    // a nejsou příhrada.
    expect(rysyMostu(RESENI["8-02"]!.mistrovska, kampan.find((u) => u.id === "8-02")!)).toMatchObject({ soustava: "zaveseny", pylonu: 2, pylonyNaOperach: true, prihradaNavic: false, ladeneTlumice: true });
    // Stožár ze tří dílů a žádná příhrada: věta o ztužující příhradě nezazní.
    const k = new Kreslic("8-02");
    for (let x = 0; x < 60; x += 6) k.prut("mostovka-ocelobeton", [x, 0], [x + 6, 0]);
    for (const [x, kotva] of [[0, -16], [60, 76]] as const) {
      for (let y = 0; y < 9; y += 3) k.prut("ocel-lehka", [x, y], [x, y + 3]);
      k.prut("lano", [x, 9], [kotva, 0]);
      for (const d of [6, 12, 18, 24]) k.prut("lano", [x, 9], [x === 0 ? d : 60 - d, 0]);
    }
    expect(rysyMostu(k.navrh(), kampan.find((u) => u.id === "8-02")!)).toMatchObject({ soustava: "zaveseny", pylonu: 2, prihradaNavic: false });
    // Zavěšený most se dvěma kotevními lany do jedné kotvy (8-01) není visutý.
    expect(rysyMostu(RESENI["8-01"]!.mistrovska, kampan.find((u) => u.id === "8-01")!)).toMatchObject({ soustava: "zaveseny", pylonu: 2 });
    expect(rysy("1-01")).toMatchObject({
      kridel: 0,
      zamek: false,
      pilire: false,
      svary: false,
      zavazi: false,
      ladeneTlumice: false,
      viskozniTlumice: false,
      ztuzeni: false,
      vzperyNavic: false,
      vesadloNavic: false,
    });
  });

  it("holá mostovka a pár prutů se nepočítají za příhradu", () => {
    const uroven = kampan.find((x) => x.id === "1-03")!;
    const jenMostovka = new Kreslic("1-03");
    for (let x = 0; x < 16; x += 4) jenMostovka.prut("mostovka-drevo", [x, 0], [x + 4, 0]);
    expect(rysyMostu(jenMostovka.navrh(), uroven).soustava).toBe("mostovka");
    expect(principMostu(rysyMostu(jenMostovka.navrh(), uroven))).toEqual(["mostovka"]);
  });
});

describe("věta o principu", () => {
  it("má pro každý referenční most text v obou jazycích", () => {
    const klice = new Set<string>();
    for (const uroven of kampan) {
      for (const most of MOSTY) {
        const vety = principMostu(rysyMostu(RESENI[uroven.id]![most], uroven));
        expect(vety.length, `${uroven.id} ${most}`).toBeGreaterThan(0);
        for (const klic of vety) klice.add(`napoveda.princip.${klic}`);
      }
    }
    for (const klic of klice) {
      expect(jeKlicTextu(klic), klic).toBe(true);
      expect(Object.hasOwn(EN, klic), klic).toBe(true);
    }
    // Různé úrovně mají různé principy: věta není všude stejná.
    expect(klice.size).toBeGreaterThanOrEqual(12);
  });

  it("zvedací most popisuje křídla, zámek a ztužení; ostatní soustavu a přídavky v daném pořadí", () => {
    const rysy = (id: string, most: (typeof MOSTY)[number] = "pruchod") => rysyMostu(RESENI[id]![most], kampan.find((x) => x.id === id)!);
    expect(principMostu(rysy("7-01"))).toEqual(["zvedaci.jedno", "zamek.breh"]);
    expect(principMostu(rysy("7-02", "mistrovska"))).toEqual(["zvedaci.dve", "zamek.mezi"]);
    expect(principMostu(rysy("7-02"))).toEqual(["zvedaci.dve", "zamek.mezi", "ztuzeni"]);
    expect(principMostu(rysy("4-02"))).toEqual(["nosnik.svareny"]);
    expect(principMostu(rysy("4-01"))).toEqual(["prihrada-nad", "pilire"]);
    expect(principMostu(rysy("2-03"))).toEqual(["prihrada-nad", "zavazi"]);
    expect(principMostu(rysy("5-02"))).toEqual(["prihrada-nad", "ladene"]);
    expect(principMostu(rysy("2-04", "mistrovska"))).toEqual(["prihrada-nad", "viskozni"]);
  });

  it("laděný tlumič referenčních mostů je opravdu naladěný na rytmus, který most rozkmitá, jak věta tvrdí", () => {
    let mostu = 0;
    // Jen úrovně s nápovědou: věta o principu se u zkoušek neukazuje (a zkouška 5-05 má dva rytmy
    // a tlumiče naladěné mezi ně).
    for (const uroven of sNapovedou) {
      for (const most of MOSTY) {
        const navrh = RESENI[uroven.id]![most];
        const tlumice = navrh.stycniky.flatMap((s) => (s.tlumic ? [s.tlumic.frekvence] : []));
        if (tlumice.length === 0) continue;
        mostu += 1;
        // Cíl ladění, který hra ukazuje: nejsilnější složka kroku skupiny, která most bez tlumičů
        // rozkmitá nejvíc.
        const odhad = rozeberMost(uroven, navrh).odhadBezTlumicu;
        expect(odhad, `${uroven.id} ${most}`).not.toBeNull();
        const cil = odhad!.skupiny.reduce((a, b) => (b.zrychleni > a.zrychleni ? b : a)).slozky[0]!.frekvence;
        expect(Math.min(...tlumice.map((f) => Math.abs(f - cil) / cil)), `${uroven.id} ${most}`).toBeLessThan(0.05);
      }
    }
    expect(mostu).toBeGreaterThanOrEqual(9);
  });
});
