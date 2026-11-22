// Účastníci provozu, jejich jízda po trase a dopad na terén.
import { describe, expect, it } from "vitest";
import type { PolozkaJizdnihoRadu, Uroven } from "../src/data/uroven";
import { krok, spoctiSily, TIHOVE_ZRYCHLENI } from "../src/jadro/integrator";
import { sestavSoustavu, type Soustava } from "../src/jadro/soustava";
import { pridejKontaktSTerenem, vyskaTerenuV, vytvorTeren } from "../src/jadro/teren";
import { CEKA, JEDE, PREJEL } from "../src/zkouska/provoz";
import { Kreslic, urovenRegrese } from "../src/zkouska/regrese";
import { hmotnostUcastnika, modelUcastnika } from "../src/zkouska/vozidla";
import { Zkouska } from "../src/zkouska/zkouska";

const g = TIHOVE_ZRYCHLENI;

describe("modely účastníků", () => {
  it("mají hmotnost podle koncepce: chodec 80 kg, cyklista 95 kg, auto 1,5 t", () => {
    expect(hmotnostUcastnika(modelUcastnika("chodec")!)).toBeCloseTo(80, 9);
    expect(hmotnostUcastnika(modelUcastnika("cyklista")!)).toBeCloseTo(95, 9);
    expect(hmotnostUcastnika(modelUcastnika("auto")!)).toBeCloseTo(1500, 9);
  });

  it("chodec jde rychlostí kadence krát délka kroku a s kadencí roste síla kroku", () => {
    const pomaly = modelUcastnika("chodec", 1.6)!;
    const rychly = modelUcastnika("chodec", 2.2)!;
    expect(pomaly.rychlost).toBeCloseTo(1.2, 9);
    expect(rychly.rychlost).toBeCloseTo(1.65, 9);
    expect(rychly.buzeni!.amplitudy[0]!).toBeGreaterThan(pomaly.buzeni!.amplitudy[0]!);
    // První harmonická nepřesáhne polovinu váhy.
    expect(modelUcastnika("chodec", 3)!.buzeni!.amplitudy[0]!).toBeCloseTo(0.5 * 80 * g, 6);
  });

  it("auto jede 50 km/h, cyklista kolem 20 km/h", () => {
    expect(modelUcastnika("auto")!.rychlost * 3.6).toBeCloseTo(50, 9);
    expect(modelUcastnika("cyklista")!.rychlost * 3.6).toBeCloseTo(19.8, 9);
  });

  it("druhy, které hra zatím neumí, model nemají", () => {
    expect(modelUcastnika("lokomotiva")).toBeNull();
    expect(modelUcastnika("traktor")).toBeNull();
  });
});

/** Úroveň s tuhou ocelovou lávkou, po které něco jede; most je tak tuhý, že se chová jako zem. */
function uroven(jizdniRad: PolozkaJizdnihoRadu[]): Uroven {
  return { ...urovenRegrese({ rozpeti: 12, sirka: 3 }), povolenePrvky: ["mostovka-drevo", "ocel-tezka"], jizdniRad };
}

function tuhyMost() {
  const k = new Kreslic();
  for (let x = 0; x < 12; x += 4) {
    k.prut("mostovka-drevo", [x, 0], [x + 4, 0]);
    k.prut("ocel-tezka", [x, 0], [x + 4, 0]);
  }
  k.svarVse();
  return k.navrh();
}

describe("jízda po mostě", () => {
  it("auto před vyjetím stojí v klidu: pneumatiky nesou přesně jeho tíhu", () => {
    const zkouska = new Zkouska(uroven([{ cas: 5, trasa: "silnice", smer: 1, druh: "auto" }]), tuhyMost(), 1);
    zkouska.pokracuj(1);
    const bremena = zkouska.provoz.bremena[0]!;
    expect(zkouska.provoz.stavy[0]).toBe(CEKA);
    expect((bremena.sila[0]! + bremena.sila[1]!) / (1500 * g)).toBeCloseTo(1, 6);
    // Přední náprava nese 55 % karoserie a své kolo.
    expect(bremena.sila[0]! / ((0.55 * 1340 + 80) * g)).toBeCloseTo(1, 6);
    // Nic se nehýbe.
    const s = zkouska.simulace.soustava;
    for (const i of zkouska.ucastnici[0]!.karoserie) expect(Math.abs(s.vy[i]!)).toBeLessThan(1e-9);
  });

  it("karoserie se po šťouchnutí houpe na pérování frekvencí 1,3 Hz a kmitání rychle odezní", () => {
    const zkouska = new Zkouska(uroven([{ cas: 50, trasa: "silnice", smer: 1, druh: "auto" }]), tuhyMost(), 1);
    const s = zkouska.simulace.soustava;
    const karoserie = zkouska.ucastnici[0]!.karoserie[0]!;
    const klid = s.y[karoserie]!;
    s.vy[karoserie] = -0.3;
    const pruchody: number[] = [];
    let predchozi = 0;
    let nejvetsiNaKonci = 0;
    while (zkouska.simulace.cas < 4) {
      zkouska.simulace.krok();
      const vychylka = s.y[karoserie]! - klid;
      if (predchozi < 0 && vychylka >= 0) pruchody.push(zkouska.simulace.cas);
      predchozi = vychylka;
      if (zkouska.simulace.cas > 3.5) nejvetsiNaKonci = Math.max(nejvetsiNaKonci, Math.abs(vychylka));
    }
    const perioda = pruchody[1]! - pruchody[0]!;
    // Tlumená frekvence je o pár procent nižší než 1,3 Hz; pneumatika ji ještě o něco sníží.
    expect(1 / perioda).toBeGreaterThan(1.1);
    expect(1 / perioda).toBeLessThan(1.3);
    expect(nejvetsiNaKonci).toBeLessThan(0.001);
  });

  it("účastníci vyjíždějí podle jízdního řádu, skupina za sebou, protisměr z druhého břehu", () => {
    const zkouska = new Zkouska(
      uroven([
        { cas: 0, trasa: "silnice", smer: 1, druh: "cyklista", pocet: 2 },
        { cas: 2, trasa: "silnice", smer: -1, druh: "auto" },
      ]),
      tuhyMost(),
      1,
    );
    const s = zkouska.simulace.soustava;
    const [prvni, druhy, auto] = zkouska.ucastnici;
    // Druhý cyklista stojí čtyři metry za prvním; auto čeká za pravým břehem.
    expect(s.x[prvni!.kola[0]!]! - s.x[druhy!.kola[0]!]!).toBeCloseTo(4, 9);
    expect(s.x[auto!.kola[0]!]!).toBeGreaterThan(12);
    zkouska.pokracuj(1);
    expect(Array.from(zkouska.provoz.stavy)).toEqual([JEDE, JEDE, CEKA]);
    expect(s.vx[prvni!.kola[0]!]).toBeCloseTo(5.5, 9);
    expect(s.vx[auto!.kola[0]!]).toBe(0);
    zkouska.pokracuj(1.5);
    expect(zkouska.provoz.stavy[2]).toBe(JEDE);
    expect(s.vx[auto!.kola[0]!]).toBeCloseTo(-50 / 3.6, 9);
    while (!zkouska.hotovo) zkouska.pokracuj(1);
    expect(Array.from(zkouska.provoz.stavy)).toEqual([PREJEL, PREJEL, PREJEL]);
    expect(zkouska.vysledek().pruchod).toBe(true);
    // Průjezd se hlásí, až je za mostem i poslední kolo: první cyklista dřív než druhý.
    const casy = zkouska.provoz.udalosti.map((u) => u.cas);
    expect(casy).toHaveLength(3);
    expect(zkouska.provoz.udalosti[0]).toMatchObject({ druh: "prujezd", polozka: 0, clen: 0 });
  });

  it("při přejezdu tuhého mostu kolísá síla kol jen o zlomek tíhy", () => {
    const zkouska = new Zkouska(uroven([{ cas: 0, trasa: "silnice", smer: 1, druh: "auto" }]), tuhyMost(), 1);
    const bremena = zkouska.provoz.bremena[0]!;
    let nejmensi = Infinity;
    let nejvetsi = 0;
    while (!zkouska.hotovo) {
      zkouska.simulace.krok();
      const soucet = bremena.sila[0]! + bremena.sila[1]!;
      nejmensi = Math.min(nejmensi, soucet);
      nejvetsi = Math.max(nejvetsi, soucet);
      if (zkouska.provoz.hotovo) break;
    }
    expect(nejmensi / (1500 * g)).toBeGreaterThan(0.9);
    expect(nejvetsi / (1500 * g)).toBeLessThan(1.1);
  });
});

describe("dopad na terén", () => {
  /** Volný styčník o hmotnosti 100 kg v daném místě; krokuje se jen s tíhou a terénem. */
  function pust(body: { x: number; y: number }[], x: number, y: number, rychlostX = 0): { s: Soustava; bez: (sekund: number) => void } {
    const s = sestavSoustavu({ stycniky: [{ x, y, hmota: 100 }], prvky: [] });
    s.vx[0] = rychlostX;
    const teren = vytvorTeren(body);
    const nastaveni = { dt: 0.0005, tiha: g, alfa: 0, dalsiSily: (soustava: Soustava) => void pridejKontaktSTerenem(soustava, teren) };
    spoctiSily(s, g, 0);
    return {
      s,
      bez: (sekund) => {
        for (let i = 0; i < sekund / nastaveni.dt; i++) krok(s, nastaveni);
      },
    };
  }

  it("výška terénu se prokládá mezi vrcholy a za krajními pokračuje vodorovně", () => {
    const teren = vytvorTeren([{ x: 0, y: 0 }, { x: 2, y: -4 }, { x: 6, y: -4 }, { x: 8, y: 1 }]);
    expect(vyskaTerenuV(teren, -5)).toBe(0);
    expect(vyskaTerenuV(teren, 1)).toBe(-2);
    expect(vyskaTerenuV(teren, 4)).toBe(-4);
    expect(vyskaTerenuV(teren, 7, 2)).toBe(-1.5);
    expect(vyskaTerenuV(teren, 20)).toBe(1);
  });

  it("styčník puštěný nad rovinou dopadne, neodskakuje donekonečna a zůstane ležet na povrchu", () => {
    const { s, bez } = pust([{ x: -10, y: 0 }, { x: 10, y: 0 }], 0, 3);
    bez(3);
    // Dosednutí o tíhu dělenou tuhostí kontaktu: g/ω² = 2,7 mm.
    expect(s.y[0]!).toBeGreaterThan(-0.004);
    expect(s.y[0]!).toBeLessThan(0);
    expect(Math.abs(s.vy[0]!)).toBeLessThan(1e-3);
  });

  it("na mírném svahu se třením zastaví, po strmém sjede dolů", () => {
    // Součinitel tření 0,7 udrží svah do 35°.
    const mirny = pust([{ x: -10, y: 5 }, { x: 10, y: -5 }], 0, 0.5);
    mirny.bez(4);
    expect(Math.abs(mirny.s.vx[0]!)).toBeLessThan(0.06);
    expect(mirny.s.x[0]!).toBeLessThan(1);
    const strmy = pust([{ x: -10, y: 15 }, { x: 10, y: -15 }, { x: 30, y: -15 }], 0, 0.5);
    strmy.bez(4);
    expect(strmy.s.x[0]!).toBeGreaterThan(8);
  });

  it("styčník, který vletí zboku do kolmé stěny údolí, stěna odrazí zpět a nevystřelí vzhůru", () => {
    // Břeh v nulové výšce, téměř kolmá stěna do hloubky 20 m. Styčník letí vodorovně doleva
    // čtyři metry pod hranou břehu.
    const { s, bez } = pust([{ x: -20, y: 0 }, { x: 0, y: 0 }, { x: 1, y: -20 }, { x: 20, y: -20 }], 1.5, -4, -6);
    let nejvyse = -Infinity;
    for (let i = 0; i < 40; i++) {
      bez(0.05);
      nejvyse = Math.max(nejvyse, s.y[0]!);
    }
    expect(nejvyse).toBeLessThanOrEqual(-4 + 1e-9);
    // Skončil v údolí, ne zarytý v břehu.
    expect(s.x[0]!).toBeGreaterThan(0);
    expect(s.y[0]!).toBeLessThan(-15);
  });
});
