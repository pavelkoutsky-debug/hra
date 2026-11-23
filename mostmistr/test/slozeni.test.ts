// Most bez klidové polohy: složí se (kde a proč), nebo na něm jen visí volný prut?
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { NavrhMostu } from "../src/data/navrh";
import type { Uroven } from "../src/data/uroven";
import { Kreslic, urovenRegrese } from "../src/zkouska/regrese";
import { rozeberMost } from "../src/zkouska/rozbor";
import { BEZ_NALEZU, najdiSlozeni } from "../src/zkouska/slozeni";
import { Zkouska } from "../src/zkouska/zkouska";
import { nactiKampan } from "../urovne/index";
import { RESENI } from "../urovne/reseni";
import { ukazkaUrovne } from "../urovne/ukazky";

const PRVKY = ["mostovka-drevo", "drevo-lehke", "drevo-tezke"] as const;

function uroven(uprava: Partial<Parameters<typeof urovenRegrese>[0]> = {}): Uroven {
  return { ...urovenRegrese({ rozpeti: 12, sirka: 3, vybaveni: 100, ...uprava }), povolenePrvky: [...PRVKY], jizdniRad: [] };
}

function most(kresli: (k: Kreslic) => void): NavrhMostu {
  const k = new Kreslic();
  for (let x = 0; x < 12; x += 4) k.prut("mostovka-drevo", [x, 0], [x + 4, 0]);
  kresli(k);
  return k.navrh();
}

/** Příhrada, která stojí: horní pás ve výšce 3 m, svislice a jedna úhlopříčka. */
function prihrada(k: Kreslic): void {
  k.prut("drevo-lehke", [0, 0], [4, 3]);
  k.prut("drevo-lehke", [4, 3], [8, 3]);
  k.prut("drevo-lehke", [8, 3], [12, 0]);
  k.prut("drevo-lehke", [4, 0], [4, 3]);
  k.prut("drevo-lehke", [8, 0], [8, 3]);
  k.prut("drevo-lehke", [4, 3], [8, 0]);
}

/** Poloha styčníku návrhu podle pořadí. */
const poloha = (navrh: NavrhMostu, stycnik: number): [number, number] => [navrh.stycniky[stycnik]!.x, navrh.stycniky[stycnik]!.y];

describe("most, který se složí vlastní vahou", () => {
  it("stabilní most a prázdný návrh jsou bez nálezu", () => {
    const navrh = most(prihrada);
    expect(najdiSlozeni(uroven(), navrh)).toEqual(BEZ_NALEZU);
    expect(rozeberMost(uroven(), navrh)).toMatchObject({ stabilni: true, slozeni: null, volny: null });
    expect(najdiSlozeni(uroven(), new Kreslic().navrh())).toEqual(BEZ_NALEZU);
  });

  it("jen mostovka: propadá se styčník mostovky, který nic nedrží", () => {
    const navrh = most(() => {});
    const { slozeni, volny } = najdiSlozeni(uroven(), navrh);
    expect(volny).toBeNull();
    expect(slozeni).toMatchObject({ duvod: "mostovka" });
    expect([4, 8]).toContain(poloha(navrh, slozeni!.stycnik)[0]);
    expect(slozeni!.misto).toEqual({ x: poloha(navrh, slozeni!.stycnik)[0], y: 0 });
    // Rozbor při stavbě hlásí totéž.
    expect(rozeberMost(uroven(), navrh)).toMatchObject({ stabilni: false, slozeni, volny: null });
  });

  it("krokve bez sloupku: střed mostovky pod vrcholem nic nenese", () => {
    const k = new Kreslic();
    k.prut("mostovka-drevo", [0, 0], [6, 0]);
    k.prut("mostovka-drevo", [6, 0], [12, 0]);
    k.prut("drevo-tezke", [0, 0], [6, 4]);
    k.prut("drevo-tezke", [6, 4], [12, 0]);
    const navrh = k.navrh();
    const { slozeni } = najdiSlozeni(uroven(), navrh);
    expect(slozeni).toMatchObject({ duvod: "mostovka", misto: { x: 6, y: 0 } });
  });

  it("půlka krokví: značka je na styčníku mostovky, který se propadne, ne na vrcholu hotového trojúhelníku", () => {
    // Mostovka 0–4–8, sloupek 4,0–4,2 a levá krokev 0,0–4,2: trojúhelník vlevo drží, vpravo nic.
    const k = new Kreslic();
    k.prut("mostovka-drevo", [0, 0], [4, 0]);
    k.prut("mostovka-drevo", [4, 0], [8, 0]);
    k.prut("drevo-lehke", [4, 0], [4, 2]);
    k.prut("drevo-lehke", [0, 0], [4, 2]);
    const navrh = k.navrh();
    const { slozeni } = najdiSlozeni(uroven({ rozpeti: 8 }), navrh);
    expect(slozeni).toMatchObject({ duvod: "ztuzeni", misto: { x: 4, y: 0 } });
  });

  it("obdélníková pole bez úhlopříček: láme se ve styčníku, který nese i jiné pruty", () => {
    const navrh = most((k) => {
      k.prut("drevo-lehke", [0, 0], [0, 3]);
      k.prut("drevo-lehke", [0, 3], [4, 3]);
      k.prut("drevo-lehke", [4, 3], [8, 3]);
      k.prut("drevo-lehke", [8, 3], [12, 3]);
      k.prut("drevo-lehke", [12, 3], [12, 0]);
      k.prut("drevo-lehke", [4, 0], [4, 3]);
      k.prut("drevo-lehke", [8, 0], [8, 3]);
    });
    const { slozeni } = najdiSlozeni(uroven(), navrh);
    expect(slozeni).toMatchObject({ duvod: "ztuzeni" });
    expect(poloha(navrh, slozeni!.stycnik)[1]).toBe(0);
  });

  it("stejný most dá pokaždé stejný posudek", () => {
    const navrh = most(() => {});
    const prvni = najdiSlozeni(uroven(), navrh);
    for (let i = 0; i < 3; i++) expect(najdiSlozeni(uroven(), navrh)).toEqual(prvni);
  });
});

describe("most, který klidovou polohu nemá, ale nespadne", () => {
  it("volný prut na stojící příhradě je poznámka, ne složení", () => {
    const navrh = most((k) => {
      prihrada(k);
      k.prut("drevo-lehke", [8, 3], [11, 5]);
    });
    // Zkouška klidovou polohu nenajde (prut se kýve), most ale stojí.
    expect(new Zkouska(uroven(), navrh, 1).bezRovnovahy).toBe(true);
    const { slozeni, volny } = najdiSlozeni(uroven(), navrh);
    expect(slozeni).toBeNull();
    expect(volny).toEqual({ prut: navrh.pruty.length - 1, misto: { x: 11, y: 5 } });
    expect(rozeberMost(uroven(), navrh)).toMatchObject({ stabilni: false, slozeni: null, volny });
  });

  it("prut trčící svisle vzhůru taky není složení", () => {
    const navrh = most((k) => {
      prihrada(k);
      k.prut("drevo-lehke", [4, 3], [4, 5]);
    });
    expect(najdiSlozeni(uroven(), navrh).slozeni).toBeNull();
  });

  it("řetěz mostovky mezi dvěma pevnými podporami se prověsí a drží: bez nálezu", () => {
    const k = new Kreslic();
    k.prut("mostovka-drevo", [0, 0], [4, 0]);
    k.prut("mostovka-drevo", [4, 0], [8, 0]);
    const navrh = k.navrh();
    const u = uroven({ rozpeti: 8, pravaPevna: true });
    expect(new Zkouska(u, navrh, 1).bezRovnovahy).toBe(true);
    expect(najdiSlozeni(u, navrh)).toEqual(BEZ_NALEZU);
  });

  it("tažený pás ze dvou kusů v přímce pod stojící příhradou: bez složení", () => {
    const navrh = most((k) => {
      k.prut("drevo-lehke", [0, 0], [4, -3]);
      k.prut("drevo-lehke", [4, -3], [6, -3]);
      k.prut("drevo-lehke", [6, -3], [8, -3]);
      k.prut("drevo-lehke", [8, -3], [12, 0]);
      k.prut("drevo-lehke", [4, 0], [4, -3]);
      k.prut("drevo-lehke", [8, 0], [8, -3]);
      k.prut("drevo-lehke", [4, 0], [8, -3]);
    });
    expect(najdiSlozeni(uroven(), navrh).slozeni).toBeNull();
  });
});

describe("referenční mosty kampaně", () => {
  const urovne = new Map(nactiKampan().map((u) => [u.id, u]));

  it("mosty, které mají spadnout: složení jen tam, kde se mostovka opravdu propadne", () => {
    const prehled: string[] = [];
    let slozeni = 0;
    for (const [id, reseni] of Object.entries(RESENI)) {
      const u = urovne.get(id)!;
      reseni.pady.forEach((pad) => {
        const rozbor = rozeberMost(u, pad.navrh);
        const nalez = rozbor.slozeni?.duvod ?? (rozbor.volny ? "volny-konec" : "nic");
        prehled.push(`${id} ${pad.nazev}: ${rozbor.stabilni ? "stabilni" : nalez}`);
        // Zkouška je soudce: o mostu, který v ní klidovou polohu najde, se nic netvrdí.
        if (!new Zkouska(u, pad.navrh, 1).bezRovnovahy) {
          expect(rozbor.slozeni, `${id} ${pad.nazev}`).toBeNull();
          expect(rozbor.volny, `${id} ${pad.nazev}`).toBeNull();
          return;
        }
        expect(rozbor.stabilni, `${id} ${pad.nazev}`).toBe(false);
        if (rozbor.slozeni) slozeni += 1;
      });
    }
    if (process.env.MM_PREHLED) writeFileSync(process.env.MM_PREHLED, prehled.join("\n"));
    expect(slozeni).toBeGreaterThan(25);
  }, 240_000);

  it("konkrétní mosty dostanou, co jim patří", () => {
    const posudek = (id: string, nazev: string) => {
      const pad = RESENI[id]!.pady.find((p) => p.nazev === nazev);
      if (!pad) throw new Error(`Úroveň ${id} nemá most „${nazev}“.`);
      return rozeberMost(urovne.get(id)!, pad.navrh);
    };
    // Řetěz mostovky a krokve bez sloupku: styčník mostovky nic nedrží.
    expect(posudek("1-01", "jen mostovka").slozeni).toMatchObject({ duvod: "mostovka" });
    expect(posudek("1-01", "krokve bez sloupku").slozeni).toMatchObject({ duvod: "mostovka" });
    expect(posudek("6-01", "jen kolejiště").slozeni).toMatchObject({ duvod: "mostovka" });
    // Pole bez úhlopříček.
    expect(posudek("2-01", "horní pás bez diagonál").slozeni).toMatchObject({ duvod: "ztuzeni" });
    // Zvedací mosty mají obě podpory pevné: samotná mostovka se prověsí jako řetěz a drží.
    // Neprojde, protože se nezvedne; to říká jiná věta, ne kontrola stability.
    expect(posudek("7-02", "jen mostovka")).toMatchObject({ slozeni: null, volny: null });
    expect(posudek("7-04", "jen mostovka")).toMatchObject({ slozeni: null, volny: null });
    // Mostovka na pilířích bez svarů: pole mezi pilíři se propadá, i když mezitím praskne pilíř.
    expect(posudek("4-02", "mostovka na pilířích bez svarů").slozeni).toMatchObject({ duvod: "mostovka" });
    // Příhrada bez pilíře se neskládá: pod vlastní tíhou se jí rozdrtí horní pás (první porušení).
    expect(posudek("3-04", "příhrada bez pilíře")).toMatchObject({ slozeni: null });
    // Horní pás, který se pod vlastní tíhou vzepře, taky není složení.
    expect(posudek("3-02", "dvanáctimetrový horní pás z lehkého profilu se vzpírá")).toMatchObject({ slozeni: null });
  }, 120_000);

  it("závaží na podpoře nezmění důvod: podpory se počítají z úrovně", () => {
    const u = urovne.get("2-03")!;
    const navrh = RESENI["2-03"]!.pady.find((p) => p.nazev === "jen mostovka")!.navrh;
    const kotva = u.kotvy.find((k) => navrh.stycniky.some((s) => s.x === k.x && s.y === k.y))!;
    const seZavazim: NavrhMostu = {
      ...navrh,
      stycniky: navrh.stycniky.map((s) => (s.x === kotva.x && s.y === kotva.y ? { ...s, zavazi: 500 } : s)),
    };
    expect(rozeberMost(u, navrh).slozeni).toMatchObject({ duvod: "mostovka" });
    expect(rozeberMost(u, seZavazim).slozeni).toMatchObject({ duvod: "mostovka" });
  }, 60_000);

  it("most, který úrovní projde, a mosty ukázek, které stojí, jsou bez nálezu", () => {
    for (const [id, reseni] of Object.entries(RESENI)) {
      for (const navrh of [reseni.pruchod, reseni.rozpocet, reseni.mistrovska]) {
        const rozbor = rozeberMost(urovne.get(id)!, navrh);
        expect(rozbor.slozeni, id).toBeNull();
        expect(rozbor.volny, id).toBeNull();
      }
    }
    for (const u of urovne.values()) {
      const ukazka = ukazkaUrovne(u);
      if (!ukazka) continue;
      for (const strana of [ukazka.a, ukazka.b]) {
        // Ukázka smí předvádět i most, který se složí; o stojícím mostě se ale nic tvrdit nesmí.
        if (new Zkouska(strana.uroven, strana.navrh, 1).bezRovnovahy) continue;
        const rozbor = rozeberMost(strana.uroven, strana.navrh);
        expect(rozbor.slozeni, `ukázka ${u.id}`).toBeNull();
        expect(rozbor.volny, `ukázka ${u.id}`).toBeNull();
      }
    }
  }, 240_000);
});
