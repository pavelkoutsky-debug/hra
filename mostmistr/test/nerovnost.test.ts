// Nerovnost vozovky: profil silnice a dynamické zvýšení, které vozidlům na mostě přidá.
import { describe, expect, it } from "vitest";
import type { NavrhMostu } from "../src/data/navrh";
import type { PolozkaJizdnihoRadu, TridaNerovnosti, Uroven } from "../src/data/uroven";
import { odchylkaNerovnosti, vyskaNerovnosti, vytvorNerovnost } from "../src/jadro/nerovnost";
import { Kreslic, urovenRegrese } from "../src/zkouska/regrese";
import { Zkouska } from "../src/zkouska/zkouska";

describe("profil vozovky", () => {
  it("stejná násada dá stejnou silnici, jiná násada jinou", () => {
    const a = vytvorNerovnost(-20, 60, "B", 7);
    const b = vytvorNerovnost(-20, 60, "B", 7);
    const c = vytvorNerovnost(-20, 60, "B", 8);
    expect(Array.from(a.vysky)).toEqual(Array.from(b.vysky));
    expect(Array.from(a.vysky)).not.toEqual(Array.from(c.vysky));
    expect(a.x0).toBe(-20);
    expect(a.x0 + a.krok * (a.vysky.length - 1)).toBeGreaterThanOrEqual(60);
  });

  it("vyšší třída je táž silnice, jen dvakrát hrbolatější", () => {
    const a = vytvorNerovnost(0, 100, "A", 3);
    const b = vytvorNerovnost(0, 100, "B", 3);
    const c = vytvorNerovnost(0, 100, "C", 3);
    for (let i = 0; i < a.vysky.length; i += 17) {
      expect(b.vysky[i]! / a.vysky[i]!).toBeCloseTo(2, 9);
      expect(c.vysky[i]! / a.vysky[i]!).toBeCloseTo(4, 9);
    }
    expect(odchylkaNerovnosti("A") * 1000).toBeCloseTo(3.97, 2);
    expect(odchylkaNerovnosti("B") * 1000).toBeCloseTo(7.95, 2);
    expect(odchylkaNerovnosti("C") * 1000).toBeCloseTo(15.9, 1);
  });

  it("výšky kolísají kolem nuly s odchylkou třídy a na metru se změní tolik, kolik má normové spektrum", () => {
    const profil = vytvorNerovnost(0, 5000, "B", 11);
    const n = profil.vysky.length;
    let soucet = 0;
    let ctverce = 0;
    let prirustky = 0;
    const metr = Math.round(1 / profil.krok);
    for (let i = 0; i < n; i++) {
      soucet += profil.vysky[i]!;
      ctverce += profil.vysky[i]! ** 2;
      if (i + metr < n) prirustky += (profil.vysky[i + metr]! - profil.vysky[i]!) ** 2;
    }
    const sigma = odchylkaNerovnosti("B");
    expect(Math.abs(soucet / n)).toBeLessThan(0.2 * sigma);
    expect(Math.sqrt(ctverce / n) / sigma).toBeGreaterThan(0.85);
    expect(Math.sqrt(ctverce / n) / sigma).toBeLessThan(1.1);
    // Náhodná procházka s návratem na 10 m: rozptyl změny na metr je 2σ²(1 − e^(−1/10)).
    const ocekavany = 2 * sigma * sigma * (1 - Math.exp(-0.1));
    expect(prirustky / (n - metr) / ocekavany).toBeGreaterThan(0.75);
    expect(prirustky / (n - metr) / ocekavany).toBeLessThan(1.15);
  });

  it("mezi vzorky je profil hladký, prochází vzorky a mimo rozsah pokračuje vodorovně", () => {
    const profil = vytvorNerovnost(10, 40, "C", 5);
    for (let i = 0; i < profil.vysky.length; i += 7) {
      expect(vyskaNerovnosti(profil, profil.x0 + i * profil.krok)).toBeCloseTo(profil.vysky[i]!, 12);
    }
    // Žádný skok: po milimetru se výška změní nejvýš o zlomek milimetru.
    let nejvetsiSkok = 0;
    for (let x = 9; x < 41; x += 0.001) {
      nejvetsiSkok = Math.max(nejvetsiSkok, Math.abs(vyskaNerovnosti(profil, x + 0.001) - vyskaNerovnosti(profil, x)));
    }
    expect(nejvetsiSkok).toBeLessThan(0.0003);
    expect(vyskaNerovnosti(profil, -100)).toBe(profil.vysky[0]);
    expect(vyskaNerovnosti(profil, 1000)).toBe(profil.vysky[profil.vysky.length - 1]);
  });
});

/** Silniční most 24 m: ocelobetonová mostovka a Prattova příhrada z lehké oceli, výška 4 m. */
function most(): NavrhMostu {
  const k = new Kreslic();
  for (let x = 0; x < 24; x += 6) {
    k.prut("mostovka-ocelobeton", [x, 0], [x + 6, 0]);
    k.prut("ocel-lehka", [x, 4], [x + 6, 4]);
    const kStredu = x < 12;
    k.prut("ocel-lehka", kStredu ? [x, 4] : [x, 0], kStredu ? [x + 6, 0] : [x + 6, 4]);
  }
  for (let x = 0; x <= 24; x += 6) k.prut("ocel-lehka", [x, 0], [x, 4]);
  return k.navrh();
}

function silnice(nerovnost: TridaNerovnosti, jizdniRad: PolozkaJizdnihoRadu[]): Uroven {
  return {
    ...urovenRegrese({ rozpeti: 24, sirka: 7, vybaveni: 600 }),
    nerovnost,
    povolenePrvky: ["mostovka-ocelobeton", "ocel-lehka"],
    jizdniRad,
  };
}

/** Největší průhyb středu mostu při přejezdu, m. */
function pruhyb(nerovnost: TridaNerovnosti, druh: "nakladni" | "autobus", nasada: number, rychlost?: number): number {
  const navrh = most();
  const stred = navrh.stycniky.findIndex((s) => s.x === 12 && s.y === 0);
  const jizda: PolozkaJizdnihoRadu = { cas: 0, trasa: "silnice", smer: 1, druh };
  if (rychlost !== undefined) jizda.rychlost = rychlost;
  const zkouska = new Zkouska(silnice(nerovnost, [jizda]), navrh, nasada);
  const s = zkouska.simulace.soustava;
  const klid = s.y[stred]!;
  let nejvic = 0;
  let pojistka = 0;
  while (!zkouska.provoz.hotovo) {
    zkouska.simulace.krok();
    nejvic = Math.max(nejvic, klid - s.y[stred]!);
    if (pojistka++ > 5e6) throw new Error("Vůz nedojel.");
  }
  return nejvic;
}

describe("dynamické zvýšení od nerovností (kritérium milníku M4a)", () => {
  const NASADY = [1, 2, 3, 4, 5, 6];
  const staticky = pruhyb("zadna", "nakladni", 1, 0.7);
  const prumer = (trida: TridaNerovnosti): number => {
    let soucet = 0;
    for (const nasada of NASADY) soucet += pruhyb(trida, "nakladni", nasada) / staticky;
    return soucet / NASADY.length;
  };
  const rovna = pruhyb("zadna", "nakladni", 1) / staticky;
  const nova = prumer("A");
  const bezna = prumer("B");
  const rozbita = prumer("C");

  it("po dokonale rovné vozovce přidá jízda rychlostí 40 km/h proti kroku jen pár procent", () => {
    expect(staticky * 1000).toBeGreaterThan(2);
    expect(rovna).toBeGreaterThan(0.99);
    expect(rovna).toBeLessThan(1.08);
  });

  it("nová vozovka skoro nic nepřidá, běžná kolem desetiny, rozbitá čtvrtinu i víc", () => {
    expect(nova).toBeLessThan(1.1);
    expect(bezna).toBeGreaterThan(1.05);
    expect(bezna).toBeLessThan(1.25);
    expect(rozbita).toBeGreaterThan(1.15);
    expect(rozbita).toBeLessThan(1.5);
    expect(bezna).toBeGreaterThan(nova);
    expect(rozbita).toBeGreaterThan(bezna);
  });

  it("stejná úroveň má vždy stejnou silnici: výsledek se opakuje na bit", () => {
    expect(pruhyb("B", "nakladni", 4)).toBe(pruhyb("B", "nakladni", 4));
    expect(pruhyb("B", "nakladni", 4)).not.toBe(pruhyb("B", "nakladni", 5));
  });

  it("chodce nerovnosti nezajímají: přes hrbolatý most přejde stejně jako přes rovný", () => {
    const prejdi = (nerovnost: TridaNerovnosti): string => {
      const zkouska = new Zkouska(
        silnice(nerovnost, [{ cas: 0, trasa: "silnice", smer: 1, druh: "chodec", pocet: 2 }]),
        most(),
        3,
      );
      while (!zkouska.hotovo) zkouska.pokracuj(1);
      return zkouska.vysledek().otisk;
    };
    expect(prejdi("C")).toBe(prejdi("zadna"));
  });

  it("vůz čekající před mostem stojí na hrbolaté silnici v klidu", () => {
    const zkouska = new Zkouska(silnice("C", [{ cas: 5, trasa: "silnice", smer: 1, druh: "autobus" }]), most(), 2);
    zkouska.pokracuj(1);
    const s = zkouska.simulace.soustava;
    for (const i of zkouska.ucastnici[0]!.karoserie) expect(Math.abs(s.vy[i]!)).toBeLessThan(1e-9);
  });
}, 300_000);
