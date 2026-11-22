// Železnice: kolejiště, modely lokomotivy a vozů, vlak v jízdním řádu, nerovnost koleje
// se styky a průjezd vlaku po mostě.
import { describe, expect, it } from "vitest";
import { hmotnostNavrhu } from "../src/data/cena";
import { jeKolejove, KATALOG, vlastnostiPrutu } from "../src/data/katalog";
import { ChybaDat } from "../src/data/kontrola";
import type { NavrhMostu } from "../src/data/navrh";
import { nactiUroven, VERZE_UROVNE, type PolozkaJizdnihoRadu, type Uroven } from "../src/data/uroven";
import { DELKA_KOLEJNICE, KOLEJ, vyskaNerovnosti, vytvorNerovnost } from "../src/jadro/nerovnost";
import type { PopisSoustavy } from "../src/jadro/soustava";
import { VERZE_FYZIKY } from "../src/jadro/verze";
import { BehZkousky } from "../src/zkouska/beh";
import { naplanujProvoz } from "../src/zkouska/provoz";
import type { VysledekZkousky, ZpravaZeZkousky } from "../src/zkouska/protokol";
import { Kreslic, urovenRegrese } from "../src/zkouska/regrese";
import { sestavMost } from "../src/zkouska/stavba";
import { hmotnostUcastnika, modelUcastnika, umiBrzdit } from "../src/zkouska/vozidla";
import { Zkouska } from "../src/zkouska/zkouska";

const g = 9.80665;

/** Úroveň s jednou kolejí v nulové výšce od x = 0 do x = rozpětí. */
function trat(jizdniRad: PolozkaJizdnihoRadu[], rozpeti = 24, uprava: Partial<Uroven> = {}): Uroven {
  const zaklad = urovenRegrese({ rozpeti, sirka: 5, vybaveni: 800 });
  return {
    ...zaklad,
    trasy: [{ id: "kolej", druh: "kolej", zacatek: { x: 0, y: 0 }, konec: { x: rozpeti, y: 0 } }],
    povolenePrvky: ["kolejiste", "ocel-lehka", "ocel-tezka"],
    jizdniRad,
    ...uprava,
  };
}

const VLAK: PolozkaJizdnihoRadu = {
  cas: 0,
  trasa: "kolej",
  smer: 1,
  druh: "lokomotiva",
  vozy: [
    { druh: "vuz-nakladni", pocet: 2 },
    { druh: "vuz-prazdny", pocet: 1 },
  ],
};

/** Kolejiště ze čtyř polí po 6 m a nad ním příhrada z těžké oceli s horním pásem ve výšce 5 m. */
function prihrada(): NavrhMostu {
  const k = new Kreslic();
  for (let x = 0; x < 24; x += 6) k.prut("kolejiste", [x, 0], [x + 6, 0]);
  k.prut("ocel-tezka", [0, 0], [6, 5]);
  k.prut("ocel-tezka", [6, 5], [12, 5]);
  k.prut("ocel-tezka", [12, 5], [18, 5]);
  k.prut("ocel-tezka", [18, 5], [24, 0]);
  for (const x of [6, 12, 18]) k.prut("ocel-lehka", [x, 0], [x, 5]);
  k.prut("ocel-lehka", [6, 5], [12, 0]);
  k.prut("ocel-lehka", [18, 5], [12, 0]);
  return k.navrh();
}

function jenKolejiste(): NavrhMostu {
  const k = new Kreslic();
  for (let x = 0; x < 24; x += 6) k.prut("kolejiste", [x, 0], [x + 6, 0]);
  return k.navrh();
}

function zkousej(u: Uroven, navrh: NavrhMostu, nasada = 7): VysledekZkousky {
  const zpravy: ZpravaZeZkousky[] = [];
  const beh = new BehZkousky((zprava) => zpravy.push(zprava));
  beh.prijmi({ typ: "start", vstup: { uroven: u, navrh, nasada, verzeFyziky: VERZE_FYZIKY } });
  expect(zpravy[0]!.typ, JSON.stringify(zpravy[0])).toBe("zacatek");
  let pojistka = 0;
  while (beh.pokracuj(0.5)) expect(pojistka++).toBeLessThan(600);
  const konec = zpravy.at(-1)!;
  if (konec.typ !== "konec") throw new Error(`Zkouška neskončila výsledkem: ${JSON.stringify(konec)}`);
  return konec.vysledek;
}

describe("kolejiště", () => {
  it("je jedna kolej na dvou podélnících: šířka mostovky ho nenásobí a vybavení úrovně nenese", () => {
    expect(KATALOG.kolejiste).toMatchObject({ druh: "mostovka", hotovo: true, nejvetsiDelka: 6 });
    const uzke = vlastnostiPrutu("kolejiste", 3)!;
    const siroke = vlastnostiPrutu("kolejiste", 12)!;
    expect(siroke).toEqual(uzke);
    expect(uzke.hmotnostNaMetr).toBe(560);
    // Dva podélníky IPE 600: plastický moment 2 × 3 512 cm³ × 400 MPa.
    expect(uzke.unosnost.moment).toBeCloseTo(2 * 3512e-6 * 400e6, 3);
    expect(uzke.EI).toBeCloseTo(210e9 * 2 * 92080e-8, 3);
    // Pod podvozkem loženého vozu (2 × 22,5 t uprostřed pole 6 m) se prohne zhruba o 5 mm.
    expect((45_000 * g * 6 * 6 * 6) / (48 * uzke.EI)).toBeLessThan(0.0055);
    // Hmotnost mostu: 24 m kolejiště po 560 kg, vybavení úrovně (800 kg/m) se nepřičte.
    expect(hmotnostNavrhu(jenKolejiste(), trat([]))).toBeCloseTo(24 * 560, 6);
    const stavba = sestavMost(trat([]), jenKolejiste());
    expect(stavba.popis.prvky.every((p) => p.hmotnostNaMetr === 560)).toBe(true);
  });

  it("patří jen ke koleji: silnice ho za mostovku nepočítá a kolej nepočítá silniční mostovku", () => {
    const k = new Kreslic();
    for (let x = 0; x < 24; x += 6) k.prut("kolejiste", [x, 0], [x + 6, 0]);
    const koleje = k.navrh();
    expect(sestavMost(trat([]), koleje).trasy).toEqual([{ id: "kolej", pruty: [0, 1, 2, 3] }]);
    const silnice = { ...urovenRegrese({ rozpeti: 24 }), povolenePrvky: ["kolejiste" as const] };
    expect(sestavMost(silnice, koleje).trasy).toEqual([{ id: "silnice", pruty: [] }]);
    const d = new Kreslic();
    for (let x = 0; x < 24; x += 4) d.prut("mostovka-drevo", [x, 0], [x + 4, 0]);
    expect(sestavMost(trat([]), d.navrh()).trasy).toEqual([{ id: "kolej", pruty: [] }]);
  });
});

describe("modely vlaku", () => {
  it("lokomotiva váží 88 t, ložený vůz 90 t, prázdný 22 t a osobní 45 t; každé má čtyři dvojkolí", () => {
    const hmotnosti = { lokomotiva: 88_000, "vuz-nakladni": 90_000, "vuz-prazdny": 22_000, "vuz-osobni": 45_000 } as const;
    for (const [druh, hmotnost] of Object.entries(hmotnosti) as [keyof typeof hmotnosti, number][]) {
      const model = modelUcastnika(druh)!;
      expect(hmotnostUcastnika(model), druh).toBeCloseTo(hmotnost, 6);
      expect(model.napravy).toHaveLength(4);
      expect(jeKolejove(druh)).toBe(true);
      // Dvojkolí jsou uvnitř vozidla a jdou za sebou od čela.
      const odstupy = model.napravy.map((n) => n.odstup);
      expect(odstupy).toEqual([...odstupy].sort((a, b) => a - b));
      expect(odstupy[0]!).toBeGreaterThan(0);
      expect(odstupy[3]!).toBeLessThan(model.delka);
      expect(model.rychlost * 3.6).toBeCloseTo(60, 9);
    }
    expect(jeKolejove("auto")).toBe(false);
    expect(umiBrzdit("lokomotiva")).toBe(true);
    expect(umiBrzdit("vuz-nakladni")).toBe(false);
  });

  it("lokomotiva a osobní vůz mají mezi dvojkolím a skříní rám podvozku, nákladní vůz ne", () => {
    for (const druh of ["lokomotiva", "vuz-osobni"] as const) {
      for (const n of modelUcastnika(druh)!.napravy) {
        expect(n.podvozek, druh).toBeDefined();
        // Skříň se na druhotném vypružení houpe pomaleji než vše nad dvojkolím na prvotním.
        const druhotne = Math.sqrt(n.perovani!.tuhost / n.odpruzena) / (2 * Math.PI);
        const prvotni = Math.sqrt(n.podvozek!.tuhost / (n.odpruzena + n.podvozek!.hmota)) / (2 * Math.PI);
        expect(druhotne).toBeLessThan(prvotni);
      }
    }
    const skrin = modelUcastnika("vuz-osobni")!.napravy[0]!;
    expect(Math.sqrt(skrin.perovani!.tuhost / skrin.odpruzena) / (2 * Math.PI)).toBeCloseTo(1.1, 6);
    for (const [druh, frekvence] of [["vuz-nakladni", 2.6], ["vuz-prazdny", 5]] as const) {
      const n = modelUcastnika(druh)!.napravy[0]!;
      expect(n.podvozek).toBeUndefined();
      expect(Math.sqrt(n.perovani!.tuhost / n.odpruzena) / (2 * Math.PI)).toBeCloseTo(frekvence, 6);
    }
  });
});

describe("vlak v jízdním řádu", () => {
  const zapis = (jizdniRad: unknown[], druhTrasy = "kolej"): unknown => {
    const u = trat([]);
    return JSON.parse(JSON.stringify({ ...u, trasy: [{ ...u.trasy[0]!, druh: druhTrasy }], jizdniRad }));
  };

  it("úroveň starší verze se převede beze změny; vlak s vozy projde kontrolou", () => {
    const stara = { ...(zapis([]) as Record<string, unknown>), verze: 4, trasy: [{ id: "kolej", druh: "silnice", zacatek: { x: 0, y: 0 }, konec: { x: 24, y: 0 } }] };
    expect(nactiUroven(stara).verze).toBe(VERZE_UROVNE);
    const u = nactiUroven(zapis([{ ...VLAK, pocet: 2, rychlost: 20 }]));
    expect(u.jizdniRad[0]).toEqual({ ...VLAK, pocet: 2, rychlost: 20 });
  });

  it("odmítne vozy bez lokomotivy, vlak na silnici, auto na koleji, neznámý vůz a příliš dlouhý vlak", () => {
    const chyba = (jizdniRad: unknown[], druhTrasy?: string): string => {
      try {
        nactiUroven(zapis(jizdniRad, druhTrasy));
      } catch (e) {
        if (e instanceof ChybaDat) return e.message;
        throw e;
      }
      return "";
    };
    expect(chyba([{ cas: 0, trasa: "kolej", smer: 1, druh: "vuz-nakladni" }])).toContain("vůz bez lokomotivy nejede");
    expect(chyba([{ cas: 0, trasa: "kolej", smer: 1, druh: "auto", vozy: [{ druh: "vuz-nakladni", pocet: 1 }] }])).toContain("vozy smí táhnout jen lokomotiva");
    expect(chyba([VLAK], "silnice")).toContain("kolejové vozidlo potřebuje trasu druhu „kolej“");
    expect(chyba([{ cas: 0, trasa: "kolej", smer: 1, druh: "auto" }])).toContain("po koleji jezdí jen lokomotiva s vozy");
    expect(chyba([{ ...VLAK, vozy: [{ druh: "auto", pocet: 1 }] }])).toContain("vozy[0].druh");
    expect(chyba([{ ...VLAK, vozy: [{ druh: "vuz-nakladni", pocet: 40 }] }])).toContain("nejvýš 40 vozidel");
    expect(chyba([{ ...VLAK, vozy: [{ druh: "vuz-nakladni", pocet: 39 }] }])).toBe("");
  });

  it("naplánuje lokomotivu a vozy nárazník na nárazník, každý se svým druhem a všechny stejně rychle", () => {
    const popis: PopisSoustavy = { stycniky: [], prvky: [] };
    const plan = naplanujProvoz(popis, trat([{ ...VLAK, rychlost: 12 }]), 1, g);
    expect(plan.ucastnici.map((u) => u.druh)).toEqual(["lokomotiva", "vuz-nakladni", "vuz-nakladni", "vuz-prazdny"]);
    expect(plan.ucastnici.map((u) => u.clen)).toEqual([0, 1, 2, 3]);
    expect(plan.ucastnici.every((u) => u.rychlost === 12 && u.polozka === 0)).toBe(true);
    // Čelo lokomotivy stojí sekundu jízdy před mostem; první dvojkolí každého vozidla je
    // o délku předchozích vozidel dál.
    const prvniKola = plan.ucastnici.map((u) => popis.stycniky[u.kola[0]!]!.x);
    expect(prvniKola[0]).toBeCloseTo(-12 - 2.85, 9);
    expect(prvniKola[1]).toBeCloseTo(-12 - 16.8 - 1.62, 9);
    expect(prvniKola[2]).toBeCloseTo(-12 - 16.8 - 14.04 - 1.62, 9);
    expect(prvniKola[3]).toBeCloseTo(-12 - 16.8 - 2 * 14.04 - 1.62, 9);
    // Šestnáct dvojkolí na koleji; lokomotiva má navíc čtyři rámy podvozků.
    expect(plan.kontakty[0]).toHaveLength(16);
    expect(plan.ucastnici[0]!.karoserie).toHaveLength(4);
    expect(popis.stycniky).toHaveLength(4 * 3 + 3 * 4 * 2);
    // Hmota všech styčníků je hmotnost vlaku.
    const hmota = popis.stycniky.reduce((s, st) => s + (st.hmota ?? 0), 0);
    expect(hmota).toBeCloseTo(88_000 + 2 * 90_000 + 22_000, 6);
    // Vlak v klidu stojí v rovnováze: každá pružina je stlačená tíhou toho, co nese.
    for (const prvek of popis.prvky) {
      if (prvek.klidovaDelka === undefined) continue;
      const a = popis.stycniky[prvek.a]!;
      const b = popis.stycniky[prvek.b]!;
      if (a.x !== b.x) continue; // spojení mezi nápravami
      expect(prvek.klidovaDelka).toBeGreaterThan(b.y - a.y);
    }
  });

  it("dvě lokomotivy v čele a vlak v protisměru", () => {
    const popis: PopisSoustavy = { stycniky: [], prvky: [] };
    const plan = naplanujProvoz(popis, trat([{ ...VLAK, pocet: 2, smer: -1, vozy: [{ druh: "vuz-osobni", pocet: 1 }] }]), 1, g);
    expect(plan.ucastnici.map((u) => u.druh)).toEqual(["lokomotiva", "lokomotiva", "vuz-osobni"]);
    const rychlost = modelUcastnika("lokomotiva")!.rychlost;
    const prvniKola = plan.ucastnici.map((u) => popis.stycniky[u.kola[0]!]!.x);
    expect(prvniKola[0]).toBeCloseTo(24 + rychlost + 2.85, 9);
    expect(prvniKola[2]).toBeCloseTo(24 + rychlost + 2 * 16.8 + 2.45, 9);
  });
});

describe("nerovnost koleje", () => {
  it("bezstyková kolej má jen milimetrové vlny; stykovaná má po 25 m propad", () => {
    const hladka = vytvorNerovnost(-50, 150, "A", 5, "kolej");
    const stykovana = vytvorNerovnost(-50, 150, "B", 5, "kolej");
    const zanedbana = vytvorNerovnost(-50, 150, "C", 5, "kolej");
    const odchylka = (vysky: Float64Array): number => Math.sqrt(vysky.reduce((s, v) => s + v * v, 0) / vysky.length);
    expect(odchylka(hladka.vysky)).toBeGreaterThan(0.0003);
    expect(odchylka(hladka.vysky)).toBeLessThan(0.0012);
    // Silnice stejné třídy je řádově hrbolatější.
    expect(odchylka(vytvorNerovnost(-50, 150, "A", 5).vysky)).toBeGreaterThan(3 * odchylka(hladka.vysky));

    // Styky: rozdíl proti kolejnici bez styků (stejná násada, stejné vlny, dvakrát vyšší).
    const propady: number[] = [];
    for (let i = 0; i < stykovana.vysky.length; i++) {
      const propad = 2 * hladka.vysky[i]! - stykovana.vysky[i]!;
      if (propad > KOLEJ.B.styk - 1e-9) propady.push(stykovana.x0 + i * stykovana.krok);
      expect(propad).toBeGreaterThan(-1e-12);
      expect(propad).toBeLessThan(KOLEJ.B.styk + 1e-12);
    }
    expect(propady.length).toBe(8);
    for (let i = 1; i < propady.length; i++) expect(propady[i]! - propady[i - 1]!).toBeCloseTo(DELKA_KOLEJNICE, 9);
    // Zanedbaná trať má styky na stejných místech a dvakrát hlubší.
    const dno = propady[3]!;
    expect(4 * vyskaNerovnosti(hladka, dno) - vyskaNerovnosti(zanedbana, dno)).toBeCloseTo(KOLEJ.C.styk, 9);
    // Stejná násada dá stejnou kolej, jiná násada jinou.
    expect(vytvorNerovnost(-50, 150, "B", 5, "kolej").vysky).toEqual(stykovana.vysky);
    expect(vytvorNerovnost(-50, 150, "B", 6, "kolej").vysky).not.toEqual(stykovana.vysky);
  });
});

describe("vlak na mostě", () => {
  it("příhradový most z těžké oceli vlak unese; samotné kolejiště přes 24 m ne", () => {
    const vysledek = zkousej(trat([VLAK]), prihrada());
    expect(vysledek).toMatchObject({ pruchod: true, ucastniku: 4, prejelo: 4, spadlo: 0, poruseni: 0 });
    expect(vysledek.nejvetsiVyuziti).toBeGreaterThan(0.1);
    expect(vysledek.nejvetsiVyuziti).toBeLessThan(1);
    // Největší svislé reakce podpor dohromady unesou most a tu část vlaku, která se na něj vejde.
    const reakce = vysledek.reakce.reduce((s, r) => s + r.svisla, 0);
    expect(reakce).toBeGreaterThan(100_000 * g);
    expect(reakce).toBeLessThan(260_000 * g);

    const bezPrihrady = zkousej(trat([VLAK]), jenKolejiste());
    expect(bezPrihrady.pruchod).toBe(false);
    expect(bezPrihrady.spadlo).toBeGreaterThan(0);
  }, 120_000);

  /** Největší síla dvojkolí na kolej na mostě (násobek klidové) a největší zrychlení skříní, m/s². */
  function jizda(nerovnost: Uroven["nerovnost"], vozy: PolozkaJizdnihoRadu["vozy"], rychlost: number, nasada: number): { sila: number; skrin: number } {
    const zkouska = new Zkouska(trat([{ ...VLAK, vozy, rychlost }], 24, { nerovnost }), prihrada(), nasada);
    const s = zkouska.simulace.soustava;
    const b = zkouska.provoz.bremena[0]!;
    const skrine = zkouska.ucastnici.flatMap((u) => u.karoserie);
    const klidova = Float64Array.from(b.sila, Math.abs);
    const minule = new Float64Array(skrine.length);
    let sila = 0;
    let skrin = 0;
    let cas = 0;
    for (let krok = 0; !zkouska.provoz.hotovo; krok++) {
      zkouska.simulace.krok();
      if (krok === 0) klidova.set(Float64Array.from(b.sila, Math.abs));
      for (let i = 0; i < b.pocet; i++) {
        const x = s.x[b.stycnik[i]!]!;
        if (x > 0 && x < 24) sila = Math.max(sila, Math.abs(b.sila[i]!) / klidova[i]!);
      }
      const dt = zkouska.simulace.cas - cas;
      cas = zkouska.simulace.cas;
      skrine.forEach((uzel, j) => {
        if (krok > 0) skrin = Math.max(skrin, Math.abs(s.vy[uzel]! - minule[j]!) / dt);
        minule[j] = s.vy[uzel]!;
      });
      expect(krok).toBeLessThan(1e6);
    }
    return { sila, skrin };
  }

  it("po rovné koleji jede vlak klidně; na stycích kola do koleje udeří, lehký vůz poměrně nejvíc", () => {
    const lozene = [{ druh: "vuz-nakladni" as const, pocet: 3 }];
    const prazdne = [{ druh: "vuz-prazdny" as const, pocet: 3 }];
    // Dokonale rovná kolej a bezstyková kolej: síla dvojkolí kolísá o procenta.
    expect(jizda("zadna", lozene, 60 / 3.6, 1).sila).toBeLessThan(1.1);
    expect(jizda("A", lozene, 60 / 3.6, 1).sila).toBeLessThan(1.15);
    // Styk hluboký 3 mm při 60 km/h: ložené dvojkolí (22,5 t) přitlačí zhruba o polovinu víc.
    const naStycich = jizda("B", lozene, 60 / 3.6, 1).sila;
    expect(naStycich).toBeGreaterThan(1.25);
    expect(naStycich).toBeLessThan(1.7);
    // Ráz skoro nezávisí na nákladu, takže u prázdného vozu (5,5 t na nápravu) je to násobek klidové síly.
    expect(jizda("B", prazdne, 80 / 3.6, 1).sila).toBeGreaterThan(1.8);
    // Zanedbaná trať s dvojnásobnými styky bije víc.
    expect(jizda("C", lozene, 60 / 3.6, 1).sila).toBeGreaterThan(naStycich + 0.2);
  }, 120_000);

  it("skříň osobního vozu na měkkém vypružení rázy od styků odfiltruje; ložený nákladní vůz se houpe víc", () => {
    const osobni = [{ druh: "vuz-osobni" as const, pocet: 2 }];
    const hladka = jizda("A", osobni, 100 / 3.6, 2);
    const stykovana = jizda("B", osobni, 100 / 3.6, 2);
    expect(hladka.skrin).toBeLessThan(0.5);
    expect(stykovana.skrin).toBeLessThan(1);
    expect(stykovana.skrin).toBeGreaterThan(hladka.skrin);
    // Dvojkolí osobního vozu na stycích bije stejně jako každé jiné.
    expect(stykovana.sila).toBeGreaterThan(1.6);
    expect(jizda("B", [{ druh: "vuz-nakladni", pocet: 2 }], 60 / 3.6, 2).skrin).toBeGreaterThan(stykovana.skrin);
  }, 120_000);

  it("zkouška s vlakem dá se stejnou násadou pokaždé stejný výsledek", () => {
    const u = trat([{ ...VLAK, vozy: [{ druh: "vuz-osobni", pocet: 1 }] }], 24, { nerovnost: "B" });
    const prvni = zkousej(u, prihrada(), 11);
    const druhy = zkousej(u, prihrada(), 11);
    expect(druhy.nejvetsiVyuziti).toBe(prvni.nejvetsiVyuziti);
    expect(druhy.obalka).toEqual(prvni.obalka);
  }, 120_000);
});
