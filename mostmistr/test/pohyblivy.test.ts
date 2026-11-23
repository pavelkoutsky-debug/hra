// Pohyblivý most ve zkoušce: fáze zvedání a sklápění, zámky, písty a lodě.
import { describe, expect, it } from "vitest";
import { PIST } from "../src/data/katalog";
import { VERZE_NAVRHU, zamkyNavrhu, zkontrolujNavrh, type NavrhMostu } from "../src/data/navrh";
import { nactiUroven, type Uroven } from "../src/data/uroven";
import type { Udalost } from "../src/zkouska/protokol";
import { urovenRegrese } from "../src/zkouska/regrese";
import { sestavMost } from "../src/zkouska/stavba";
import { Zkouska } from "../src/zkouska/zkouska";

/**
 * Plavební kanál široký 12 m: čep sklopného mostu je v levé opěře (0, 0), pravá opěra (12, 0)
 * má ložisko a pod čepem je ve zdi kotva (0, −3) pro patu pístu. Most se zvedá ve 4. sekundě
 * a sklápí ve 12.; mezi tím propluje loď vysoká 6 m.
 */
function kanal(zmeny: Partial<Uroven> = {}): Uroven {
  return {
    ...urovenRegrese({ rozpeti: 12, kotvy: [{ x: 0, y: -3, typ: "pevna" }], sirka: 7, vybaveni: 300 }),
    hladina: -6,
    povolenePrvky: ["mostovka-ocel", "ocel-lehka", "ocel-tezka", "pist"],
    pohyb: { zvednout: 4, sklopit: 12 },
    lode: [{ cas: 8, trvani: 3, xMin: 4, xMax: 11, vyska: 9 }],
    jizdniRad: [
      { cas: 0, trasa: "silnice", smer: 1, druh: "auto" },
      { cas: 22, trasa: "silnice", smer: -1, druh: "auto" },
    ],
    ...zmeny,
  };
}

/** Jednokřídlý sklopný most: svařená ocelová mostovka, píst z kotvy pod čepem, zámek na pravé opěře. */
function kridlo(zdvih: number, zamek = true): NavrhMostu {
  return {
    verze: VERZE_NAVRHU,
    uroven: "9-99",
    stycniky: [
      { id: 0, x: 0, y: 0 },
      { id: 1, x: 3, y: 0, svar: true },
      { id: 2, x: 6, y: 0, svar: true },
      { id: 3, x: 9, y: 0, svar: true },
      { id: 4, x: 12, y: 0, ...(zamek ? { zamek: true } : {}) },
      { id: 5, x: 0, y: -3 },
    ],
    pruty: [
      { id: 0, a: 0, b: 1, prvek: "mostovka-ocel" },
      { id: 1, a: 1, b: 2, prvek: "mostovka-ocel" },
      { id: 2, a: 2, b: 3, prvek: "mostovka-ocel" },
      { id: 3, a: 3, b: 4, prvek: "mostovka-ocel" },
      { id: 4, a: 5, b: 1, prvek: "pist", zdvih },
    ],
  };
}

function probehni(uroven: Uroven, navrh: NavrhMostu): { zkouska: Zkouska; udalosti: Udalost[] } {
  expect(zkontrolujNavrh(navrh, uroven)).toEqual([]);
  const zkouska = new Zkouska(uroven, navrh, 1);
  const udalosti: Udalost[] = [];
  while (!zkouska.hotovo) {
    udalosti.push(...zkouska.pokracuj(0.5).udalosti);
    if (zkouska.simulace.cas > 120) throw new Error("zkouška neskončila");
  }
  return { zkouska, udalosti };
}

describe("stavba pohyblivého mostu", () => {
  it("píst je pružina o tuhosti sloupce oleje a zámek na opěře nemá druhou stranu", () => {
    const stavba = sestavMost(kanal(), kridlo(1.5));
    expect(stavba.pisty).toHaveLength(1);
    const pist = stavba.popis.prvky[stavba.pisty[0]!.prvek]!;
    // Píst z (0, −3) do (3, 0) měří 4,24 m: 92 MN / 4,24 m = 21,7 MN/m.
    expect(pist.tuhost!).toBeCloseTo(PIST.tuhostKratDelka / Math.sqrt(18), 3);
    expect(stavba.pisty[0]).toMatchObject({ prut: 4, zdvih: 1.5 });
    expect(stavba.zamky).toEqual([{ stycnik: 4, prvky: [] }]);
  });

  it("zámek mezi křídly pozná, které pruty patří druhému křídlu", () => {
    // Obě opěry mají čep a pod každým je kotva pro píst.
    const uroven = kanal({
      kotvy: [
        { x: 0, y: 0, typ: "pevna" },
        { x: 12, y: 0, typ: "pevna" },
        { x: 0, y: -3, typ: "pevna" },
        { x: 12, y: -3, typ: "pevna" },
      ],
    });
    const navrh: NavrhMostu = {
      verze: VERZE_NAVRHU,
      uroven: "9-99",
      stycniky: [
        { id: 0, x: 0, y: 0 },
        { id: 1, x: 3, y: 0, svar: true },
        { id: 2, x: 6, y: 0, zamek: true },
        { id: 3, x: 9, y: 0, svar: true },
        { id: 4, x: 12, y: 0 },
        { id: 5, x: 0, y: -3 },
        { id: 6, x: 12, y: -3 },
      ],
      pruty: [
        { id: 0, a: 0, b: 1, prvek: "mostovka-ocel" },
        { id: 1, a: 1, b: 2, prvek: "mostovka-ocel" },
        { id: 2, a: 2, b: 3, prvek: "mostovka-ocel" },
        { id: 3, a: 3, b: 4, prvek: "mostovka-ocel" },
        { id: 4, a: 5, b: 1, prvek: "pist", zdvih: 1.5 },
        { id: 5, a: 6, b: 3, prvek: "pist", zdvih: 1.5 },
      ],
    };
    expect(zamkyNavrhu(navrh, uroven)).toEqual([{ stycnik: 2, druh: "kridla", druhaStrana: [2] }]);
    const stavba = sestavMost(uroven, navrh);
    expect(stavba.zamky).toHaveLength(1);
    expect(stavba.zamky[0]!.stycnik).toBe(2);
    // Druhé křídlo vede do zámku prutem 2; jeho díl u styčníku 2 je jediný prvek druhé strany.
    expect(stavba.zamky[0]!.prvky).toHaveLength(1);
    const prvek = stavba.popis.prvky[stavba.zamky[0]!.prvky[0]!]!;
    expect(prvek.prut).toBe(2);
    expect(prvek.a === 2 || prvek.b === 2).toBe(true);
  });

  it("pravidla: zámek jen na pohyblivém mostě, ne ve vetknutí, a musí něco rozpojovat; zdvih do poloviny délky", () => {
    const pevny = kanal({ pohyb: null, lode: [] });
    expect(zkontrolujNavrh(kridlo(1.5), pevny).map((p) => p.druh)).toEqual(["zamek-nepovoleny"]);
    expect(zkontrolujNavrh(kridlo(1.5, false), pevny)).toEqual([]);
    // Píst měří 4,24 m: zdvih 2 m ještě ano, 2,25 m už ne (ani záporný).
    expect(zkontrolujNavrh(kridlo(2), kanal())).toEqual([]);
    expect(zkontrolujNavrh(kridlo(2.25), kanal()).map((p) => p.druh)).toEqual(["zdvih-mimo-rozsah"]);
    expect(zkontrolujNavrh(kridlo(-2.25), kanal()).map((p) => p.druh)).toEqual(["zdvih-mimo-rozsah"]);
    // Zámek uprostřed svařeného křídla nic nerozpojí: obě strany drží pohromadě... ne, právě on je spojuje.
    const uprostred = kridlo(1.5);
    uprostred.stycniky[2] = { id: 2, x: 6, y: 0, zamek: true };
    expect(zamkyNavrhu(uprostred, kanal()).find((z) => z.stycnik === 2)?.druh).toBe("kridla");
    // Zámek ve styčníku, jehož pruty spojuje ještě jiná cesta (trojúhelník), nerozpojí nic.
    const trojuhelnik = kridlo(1.5);
    trojuhelnik.stycniky.push({ id: 6, x: 6, y: 2 });
    trojuhelnik.stycniky[2] = { id: 2, x: 6, y: 0, zamek: true };
    trojuhelnik.pruty.push({ id: 5, a: 1, b: 6, prvek: "ocel-lehka" }, { id: 6, a: 6, b: 3, prvek: "ocel-lehka" });
    expect(zkontrolujNavrh(trojuhelnik, kanal()).map((p) => p.druh)).toContain("zamek-nedeli");
    const vetknuty = kridlo(1.5);
    const sVetknutim = kanal({ kotvy: [{ x: 0, y: 0, typ: "pevna" }, { x: 12, y: 0, typ: "vetknuti" }, { x: 0, y: -3, typ: "pevna" }] });
    expect(zkontrolujNavrh(vetknuty, sVetknutim).map((p) => p.druh)).toContain("zamek-na-vetknuti");
  });
});

describe("zkouška jednokřídlého sklopného mostu", () => {
  it("auto přejede, most se odemkne a zvedne, loď propluje, most se sklopí a zamkne a druhé auto přejede", () => {
    const { zkouska, udalosti } = probehni(kanal(), kridlo(1.5));
    const v = zkouska.vysledek();
    const pohyb = udalosti.filter((u) => u.druh === "pohyb").map((u) => (u.druh === "pohyb" ? u.faze : ""));
    expect(pohyb).toEqual(["odemceno", "zvednuto", "sklapeni", "zamceno"]);
    const cas = (faze: string): number => udalosti.find((u) => u.druh === "pohyb" && u.faze === faze)!.cas;
    expect(cas("odemceno")).toBeCloseTo(4, 2);
    // Zdvih 1,5 m rychlostí 0,4 m/s s rozjezdem a dojezdem po 1 s: 3,75 + 1 = 4,75 s.
    expect(cas("zvednuto") - cas("odemceno")).toBeGreaterThan(4.6);
    expect(cas("zvednuto") - cas("odemceno")).toBeLessThan(4.9);
    expect(cas("sklapeni")).toBeCloseTo(12, 2);
    expect(cas("zamceno")).toBeGreaterThan(16.7);
    expect(cas("zamceno")).toBeLessThan(20);
    expect(udalosti.filter((u) => u.druh === "lod")).toMatchObject([{ lod: 0, stav: "proplula" }]);
    expect(udalosti.filter((u) => u.druh === "prujezd")).toHaveLength(2);
    expect(v).toMatchObject({ pruchod: true, prejelo: 2, spadlo: 0, poruseni: 0, rozpad: false });
    expect(v.lode).toEqual({ celkem: 1, proplulo: 1, narazilo: 0 });
    expect(v.pohyb).toMatchObject({ zvednuto: true, zamceno: true, pretizenychPistu: 0 });
    // Křídlo 12 m váží asi 20 t; k čepu to dělá 1 180 kNm a píst na rameni 2,1 m drží přes 500 kN.
    expect(v.pohyb!.nejvetsiSilaPistu).toBeGreaterThan(450_000);
    expect(v.pohyb!.nejvetsiSilaPistu).toBeLessThan(PIST.nejvetsiSila);
    // Konec mostu dosedl na opěru; ráz je znát, ale křídlo ho vydrželo.
    expect(v.pohyb!.razDosednuti).toBeGreaterThan(0);
    expect(v.medaile.pruchod).toBe(true);
  });

  it("píst s malým zdvihem most nezvedne dost a loď narazí", () => {
    const { zkouska, udalosti } = probehni(kanal(), kridlo(0.25));
    const v = zkouska.vysledek();
    expect(udalosti.filter((u) => u.druh === "lod")).toMatchObject([{ lod: 0, stav: "narazila" }]);
    expect(v.lode).toEqual({ celkem: 1, proplulo: 0, narazilo: 1 });
    // Most se jinak zvedl, sklopil i zamkl a auta přejela; zkouška přesto neprošla.
    expect(v.pohyb).toMatchObject({ zvednuto: true, zamceno: true });
    expect(v).toMatchObject({ pruchod: false, prejelo: 2 });
    expect(v.medaile.pruchod).toBe(false);
  });

  it("bez zámku drží konec mostu ložisko: píst ho nezvedne, přetlakový ventil povolí a loď narazí", () => {
    const { zkouska } = probehni(kanal(), kridlo(1.5, false));
    const v = zkouska.vysledek();
    expect(v.pohyb).toMatchObject({ zvednuto: false, pretizenychPistu: 1 });
    expect(v.pohyb!.nejvetsiSilaPistu).toBeLessThan(1.06 * PIST.nejvetsiSila);
    expect(v.lode.narazilo).toBe(1);
    expect(v.pruchod).toBe(false);
  });

  it("pevný most dost vysoko nad vodou loď nezajímá; nízký pevný most ano", () => {
    // Bez pístu a zámku je to prostý nosník ve výšce 0, loď vysoká 9 m nad hladinou −6 do něj narazí.
    const pevny = kridlo(1.5, false);
    pevny.pruty.pop();
    pevny.stycniky.pop();
    const nizky = probehni(kanal(), pevny).zkouska.vysledek();
    expect(nizky.lode.narazilo).toBe(1);
    expect(nizky.pohyb).toMatchObject({ zvednuto: true, zamceno: true });
    const mala = kanal({ lode: [{ cas: 8, trvani: 3, xMin: 4, xMax: 11, vyska: 5 }] });
    const vysoky = probehni(mala, pevny).zkouska.vysledek();
    expect(vysoky.lode).toEqual({ celkem: 1, proplulo: 1, narazilo: 0 });
    expect(vysoky.pruchod).toBe(true);
  });

  it("stejný most dá dvakrát stejný otisk", () => {
    const a = probehni(kanal(), kridlo(1.5)).zkouska.vysledek();
    const b = probehni(kanal(), kridlo(1.5)).zkouska.vysledek();
    expect(a.otisk).toBe(b.otisk);
  });
});

describe("zkouška dvoukřídlého sklopného mostu", () => {
  /** Kanál 18 m: čepy v obou opěrách, pod každým kotva pro píst; loď pluje středem. */
  const siroky = (): Uroven => ({
    ...urovenRegrese({
      rozpeti: 18,
      pravaPevna: true,
      kotvy: [
        { x: 0, y: -3, typ: "pevna" },
        { x: 18, y: -3, typ: "pevna" },
      ],
      sirka: 7,
      vybaveni: 300,
    }),
    hladina: -6,
    povolenePrvky: ["mostovka-ocel", "pist"],
    pohyb: { zvednout: 4, sklopit: 12 },
    lode: [{ cas: 8.5, trvani: 3, xMin: 6, xMax: 12, vyska: 12 }],
    jizdniRad: [
      { cas: 0, trasa: "silnice", smer: 1, druh: "auto" },
      { cas: 24, trasa: "silnice", smer: -1, druh: "dodavka" },
    ],
  });
  const dveKridla = (zamek: boolean): NavrhMostu => ({
    verze: VERZE_NAVRHU,
    uroven: "9-99",
    stycniky: [
      { id: 0, x: 0, y: 0 },
      { id: 1, x: 3, y: 0, svar: true },
      { id: 2, x: 6, y: 0, svar: true },
      { id: 3, x: 9, y: 0, ...(zamek ? { zamek: true } : {}) },
      { id: 4, x: 12, y: 0, svar: true },
      { id: 5, x: 15, y: 0, svar: true },
      { id: 6, x: 18, y: 0 },
      { id: 7, x: 0, y: -3 },
      { id: 8, x: 18, y: -3 },
    ],
    pruty: [
      { id: 0, a: 0, b: 1, prvek: "mostovka-ocel" },
      { id: 1, a: 1, b: 2, prvek: "mostovka-ocel" },
      { id: 2, a: 2, b: 3, prvek: "mostovka-ocel" },
      { id: 3, a: 3, b: 4, prvek: "mostovka-ocel" },
      { id: 4, a: 4, b: 5, prvek: "mostovka-ocel" },
      { id: 5, a: 5, b: 6, prvek: "mostovka-ocel" },
      { id: 6, a: 7, b: 1, prvek: "pist", zdvih: 1.5 },
      { id: 7, a: 8, b: 5, prvek: "pist", zdvih: 1.5 },
    ],
  });

  it("křídla se uprostřed rozpojí, zvednou, pustí loď, sklopí a zámek je zase spojí; pak přejede dodávka", () => {
    const { zkouska, udalosti } = probehni(siroky(), dveKridla(true));
    const v = zkouska.vysledek();
    const s = zkouska.simulace.soustava;
    expect(udalosti.filter((u) => u.druh === "pohyb").map((u) => (u.druh === "pohyb" ? u.faze : ""))).toEqual([
      "odemceno",
      "zvednuto",
      "sklapeni",
      "zamceno",
    ]);
    expect(v.lode).toEqual({ celkem: 1, proplulo: 1, narazilo: 0 });
    expect(v).toMatchObject({ pruchod: true, prejelo: 2, spadlo: 0, poruseni: 0, rozpad: false });
    expect(v.pohyb).toMatchObject({ zvednuto: true, zamceno: true, razDosednuti: 0 });
    // Odemknutí přidalo styčník druhého křídla; po zamknutí ho čep drží u prvního na milimetr.
    const druhy = s.pocetStycniku - 1;
    expect(Math.abs(s.x[druhy]! - s.x[3]!)).toBeLessThan(0.002);
    expect(Math.abs(s.y[druhy]! - s.y[3]!)).toBeLessThan(0.002);
  });

  it("bez zámku jsou křídla jeden kus: písty je proti sobě nezvednou a loď narazí", () => {
    const { zkouska } = probehni(siroky(), dveKridla(false));
    const v = zkouska.vysledek();
    expect(v.pohyb!.zvednuto).toBe(false);
    expect(v.lode.narazilo).toBe(1);
    expect(v.pruchod).toBe(false);
  });
});

describe("formát úrovně s pohyblivým mostem", () => {
  it("úroveň verze 5 se převede: most se nezvedá a lodě neplují", () => {
    const stara = JSON.parse(JSON.stringify({ ...kanal(), verze: 5 })) as Record<string, unknown>;
    delete stara.pohyb;
    delete stara.lode;
    const u = nactiUroven(stara);
    expect(u.pohyb).toBeNull();
    expect(u.lode).toEqual([]);
  });

  it("verze 6 nese fáze a lodě a hlídá jejich smysl", () => {
    const u = nactiUroven(JSON.parse(JSON.stringify(kanal())));
    expect(u.pohyb).toEqual({ zvednout: 4, sklopit: 12 });
    expect(u.lode).toEqual([{ cas: 8, trvani: 3, xMin: 4, xMax: 11, vyska: 9 }]);
    const spatne = (zmeny: Partial<Uroven>): (() => Uroven) => () => nactiUroven(JSON.parse(JSON.stringify(kanal(zmeny))));
    expect(spatne({ pohyb: { zvednout: 12, sklopit: 4 } })).toThrow(/sklopit/);
    expect(spatne({ hladina: null })).toThrow(/hladinu/);
    expect(spatne({ lode: [{ cas: 8, trvani: 3, xMin: 11, xMax: 4, vyska: 9 }] })).toThrow(/profil/);
  });
});
