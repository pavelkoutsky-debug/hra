// Těžká doprava: užitková vozidla, ocelobetonová mostovka a provoz v obou směrech.
import { describe, expect, it } from "vitest";
import { vlastnostiPrutu } from "../src/data/katalog";
import type { NavrhMostu } from "../src/data/navrh";
import type { PolozkaJizdnihoRadu, Uroven } from "../src/data/uroven";
import { TIHOVE_ZRYCHLENI } from "../src/jadro/integrator";
import { JEDE } from "../src/zkouska/provoz";
import type { VysledekZkousky } from "../src/zkouska/protokol";
import { Kreslic, urovenRegrese } from "../src/zkouska/regrese";
import { hmotnostUcastnika, jeVozidlo, modelUcastnika } from "../src/zkouska/vozidla";
import { Zkouska } from "../src/zkouska/zkouska";

const g = TIHOVE_ZRYCHLENI;

/** Okresní silnice: 24 m, dva jízdní pruhy (7 m), zábradlí a vozovka 600 kg/m. */
function silnice(jizdniRad: PolozkaJizdnihoRadu[], rozpeti = 24): Uroven {
  return {
    ...urovenRegrese({ rozpeti, sirka: 7, vybaveni: 600 }),
    povolenePrvky: ["mostovka-drevo", "mostovka-ocelobeton", "ocel-lehka", "ocel-tezka"],
    jizdniRad,
  };
}

/** Prattova příhrada z těžké oceli nad ocelobetonovou mostovkou z polí po šesti metrech. */
function prihradovyMost(rozpeti = 24, vyska = 5): NavrhMostu {
  const k = new Kreslic();
  for (let x = 0; x < rozpeti; x += 6) {
    k.prut("mostovka-ocelobeton", [x, 0], [x + 6, 0]);
    k.prut("ocel-tezka", [x, vyska], [x + 6, vyska]);
    const kStredu = x < rozpeti / 2;
    k.prut("ocel-tezka", kStredu ? [x, vyska] : [x, 0], kStredu ? [x + 6, 0] : [x + 6, vyska]);
  }
  for (let x = 0; x <= rozpeti; x += 6) k.prut("ocel-tezka", [x, 0], [x, vyska]);
  return k.navrh();
}

function dojed(zkouska: Zkouska): VysledekZkousky {
  let pojistka = 0;
  while (!zkouska.hotovo) {
    zkouska.pokracuj(1);
    expect(pojistka++).toBeLessThan(200);
  }
  return zkouska.vysledek();
}

describe("užitková vozidla", () => {
  it("mají hmotnost, počet náprav a rychlost podle koncepce", () => {
    const ocekavane = [
      ["dodavka", 3500, 2, 50],
      ["autobus", 18000, 2, 40],
      ["nakladni", 26000, 3, 40],
      ["souprava", 40000, 5, 40],
    ] as const;
    for (const [druh, hmotnost, naprav, rychlost] of ocekavane) {
      const model = modelUcastnika(druh)!;
      expect(hmotnostUcastnika(model), druh).toBeCloseTo(hmotnost, 6);
      expect(model.napravy, druh).toHaveLength(naprav);
      expect(model.rychlost * 3.6, druh).toBeCloseTo(rychlost, 9);
      expect(jeVozidlo(druh)).toBe(true);
      // Nápravy jsou seřazené od čela dozadu a vejdou se do délky vozu.
      const odstupy = model.napravy.map((n) => n.odstup);
      expect([...odstupy].sort((a, b) => a - b)).toEqual(odstupy);
      expect(odstupy.at(-1)!).toBeLessThan(model.delka);
      // V koloně se vozy nepřekrývají.
      expect(model.rozestup).toBeGreaterThan(model.delka + 5);
    }
    expect(jeVozidlo("chodec")).toBe(false);
    expect(jeVozidlo("cyklista")).toBe(false);
  });

  it("žádná náprava nenese víc než 11,5 t a kola poskakují mezi 8 a 16 Hz", () => {
    for (const druh of ["dodavka", "autobus", "nakladni", "souprava"] as const) {
      for (const n of modelUcastnika(druh)!.napravy) {
        expect(n.odpruzena + n.neodpruzena, druh).toBeLessThanOrEqual(11500);
        // Náprava mezi pneumatikou a pérováním: vlastní frekvence poskakování kol.
        const hz = Math.sqrt((n.kontakt.tuhost + n.perovani!.tuhost) / n.neodpruzena) / (2 * Math.PI);
        expect(hz, druh).toBeGreaterThan(8);
        expect(hz, druh).toBeLessThan(16);
      }
    }
  });

  it("stojící nákladní auto tlačí na vozovku 7 + 9,5 + 9,5 tuny a nehýbe se", () => {
    const zkouska = new Zkouska(silnice([{ cas: 5, trasa: "silnice", smer: 1, druh: "nakladni" }]), prihradovyMost(), 1);
    zkouska.pokracuj(1);
    const bremena = zkouska.provoz.bremena[0]!;
    expect(bremena.sila[0]! / (7000 * g)).toBeCloseTo(1, 6);
    expect(bremena.sila[1]! / (9500 * g)).toBeCloseTo(1, 6);
    expect(bremena.sila[2]! / (9500 * g)).toBeCloseTo(1, 6);
    const s = zkouska.simulace.soustava;
    for (const i of zkouska.ucastnici[0]!.karoserie) expect(Math.abs(s.vy[i]!)).toBeLessThan(1e-9);
  });
});

describe("ocelobetonová mostovka", () => {
  it("je proti dřevěné několikrát těžší, únosnější a mnohem tužší", () => {
    const drevo = vlastnostiPrutu("mostovka-drevo", 7)!;
    const beton = vlastnostiPrutu("mostovka-ocelobeton", 7)!;
    expect(beton.hmotnostNaMetr).toBeCloseTo(7 * 520, 6);
    expect(beton.hmotnostNaMetr / drevo.hmotnostNaMetr).toBeGreaterThan(10);
    expect(beton.unosnost.moment / 1000).toBeCloseTo(7 * 317.2, 0);
    expect(beton.unosnost.moment / drevo.unosnost.moment).toBeGreaterThan(8);
    expect(beton.EI / drevo.EI).toBeGreaterThan(80);
    // V tahu nese jen ocel, v tlaku hlavně beton.
    expect(beton.unosnost.tah / 1e6).toBeCloseTo(7 * 1.836, 2);
    expect(beton.unosnost.tlak).toBeGreaterThan(4 * beton.unosnost.tah);
    expect(beton.tvarny).toBe(true);
    expect(beton.pretrzeni!.sila).toBeGreaterThan(beton.unosnost.tah);
  });

  it("šestimetrové pole unese nákladní auto s rezervou; dřevěné pole je pod ním mnohem blíž mezi", () => {
    const nakladak: PolozkaJizdnihoRadu[] = [{ cas: 0, trasa: "silnice", smer: 1, druh: "nakladni" }];
    const pole = (prvek: "mostovka-drevo" | "mostovka-ocelobeton", delka: number, sirka: number): VysledekZkousky => {
      const k = new Kreslic();
      k.prut(prvek, [0, 0], [delka, 0]);
      return dojed(new Zkouska({ ...silnice(nakladak, delka), sirkaMostovky: sirka }, k.navrh(), 1));
    };
    const beton = pole("mostovka-ocelobeton", 6, 7);
    expect(beton).toMatchObject({ pruchod: true, poruseni: 0, spadlo: 0 });
    expect(beton.nejvetsiVyuziti).toBeGreaterThan(0.1);
    expect(beton.nejvetsiVyuziti).toBeLessThan(0.5);
    // Dřevěná mostovka přes dva pruhy na kratší pole nákladní auto ještě unese, ale skoro bez rezervy.
    const drevo = pole("mostovka-drevo", 4, 7);
    expect(drevo.nejvetsiVyuziti).toBeGreaterThan(2 * beton.nejvetsiVyuziti);
    expect(drevo.nejvetsiVyuziti).toBeGreaterThan(0.7);
    // V jednom pruhu (3,5 m) pod ním praskne. Čtyři metry auto přeletí dřív, než pole spadne,
    // takže přejede; most je ale zlomený.
    const uzke = pole("mostovka-drevo", 4, 3.5);
    expect(uzke.nejvetsiVyuziti).toBeGreaterThan(1);
    expect(uzke.poruseni).toBeGreaterThan(0);
  }, 60_000);
});

describe("jízda po silničním mostě", () => {
  for (const druh of ["dodavka", "autobus", "nakladni", "souprava"] as const) {
    it(`${druh} přejede příhradový most z těžké oceli a nic se neporuší`, () => {
      const zkouska = new Zkouska(silnice([{ cas: 0, trasa: "silnice", smer: 1, druh }]), prihradovyMost(), 1);
      const vysledek = dojed(zkouska);
      expect(vysledek).toMatchObject({ pruchod: true, ucastniku: 1, prejelo: 1, spadlo: 0, poruseni: 0 });
      expect(vysledek.nejvetsiVyuziti).toBeLessThan(0.9);
      // Vozidla nejsou lidé: kmitání mostovky se pod nimi jako komfort chodců nehodnotí.
      expect(vysledek.komfort?.zrychleni ?? 0).toBe(0);
    }, 60_000);
  }

  it("těžší vůz namáhá most víc; souprava je těžší než nákladní auto, ale delší než půl mostu", () => {
    const [dodavka, autobus, nakladni, souprava] = (["dodavka", "autobus", "nakladni", "souprava"] as const).map(
      (druh) => dojed(new Zkouska(silnice([{ cas: 0, trasa: "silnice", smer: 1, druh }]), prihradovyMost(), 1)).nejvetsiVyuziti,
    );
    expect(autobus!).toBeGreaterThan(dodavka!);
    expect(nakladni!).toBeGreaterThan(autobus!);
    // Čtyřicet tun rozložených na 12 m náprav zatíží 24m most zhruba jako 26 t na šesti metrech.
    expect(souprava!).toBeGreaterThan(autobus!);
    expect(souprava! / nakladni!).toBeGreaterThan(0.9);
    expect(souprava! / nakladni!).toBeLessThan(1.3);
  }, 120_000);

  it("provoz v obou směrech: vozy se na mostě potkají a všechny přejedou", () => {
    const zkouska = new Zkouska(
      silnice([
        { cas: 0, trasa: "silnice", smer: 1, druh: "nakladni", pocet: 2 },
        { cas: 0, trasa: "silnice", smer: -1, druh: "autobus" },
      ]),
      prihradovyMost(),
      1,
    );
    const s = zkouska.simulace.soustava;
    const [prvni, druhy, autobus] = zkouska.ucastnici;
    // Druhé nákladní auto stojí o rozestup za prvním, autobus čeká za pravým břehem čelem doleva.
    expect(s.x[prvni!.kola[0]!]! - s.x[druhy!.kola[0]!]!).toBeCloseTo(modelUcastnika("nakladni")!.rozestup, 9);
    expect(s.x[autobus!.kola[0]!]!).toBeGreaterThan(24);
    expect(s.x[autobus!.kola[1]!]!).toBeGreaterThan(s.x[autobus!.kola[0]!]!);
    let potkaliSe = false;
    let pojistka = 0;
    while (!zkouska.hotovo) {
      zkouska.pokracuj(0.1);
      const xNakladni = s.x[prvni!.kola[0]!]!;
      const xAutobus = s.x[autobus!.kola[0]!]!;
      const naMoste = (x: number): boolean => x > 0 && x < 24;
      if (zkouska.provoz.stavy[0] === JEDE && zkouska.provoz.stavy[2] === JEDE && naMoste(xNakladni) && naMoste(xAutobus)) {
        if (Math.abs(xNakladni - xAutobus) < 3) potkaliSe = true;
      }
      expect(pojistka++).toBeLessThan(2000);
    }
    expect(potkaliSe).toBe(true);
    expect(zkouska.vysledek()).toMatchObject({ pruchod: true, ucastniku: 3, prejelo: 3, spadlo: 0, poruseni: 0 });
  }, 120_000);
});

describe("brzdění na mostě", () => {
  const brzda = { misto: 16, stani: 2 };
  const jizda: PolozkaJizdnihoRadu = { cas: 0, trasa: "silnice", smer: 1, druh: "nakladni", brzdeni: brzda };

  it("vůz zastaví čelem v určeném místě, postojí a rozjede se", () => {
    const zkouska = new Zkouska(silnice([jizda]), prihradovyMost(), 1);
    const u = zkouska.ucastnici[0]!;
    const b = u.brzdeni!;
    const v = 40 / 3.6;
    // Brzdí 5 m/s², takže brzdná dráha je v²/2a a brzdění trvá v/a; rozjíždí se 1,5 m/s².
    expect(b.zpomaleni).toBe(5);
    expect(b.stoji - b.od).toBeCloseTo(v / 5, 9);
    expect(b.rozjezd - b.stoji).toBeCloseTo(2, 9);
    expect(b.jede - b.rozjezd).toBeCloseTo(v / 1.5, 9);
    const s = zkouska.simulace.soustava;
    const predni = u.kola[0]!;
    // Čelo vozu je 1,4 m před přední nápravou.
    const celo = (): number => s.x[predni]! + 1.4;
    while (zkouska.simulace.cas < b.stoji + 1) zkouska.simulace.krok();
    expect(celo()).toBeCloseTo(16, 1);
    expect(s.vx[predni]).toBe(0);
    // Dvě sekundy po rozjezdu jede 3 m/s (plné rychlosti dosáhne až za mostem).
    while (zkouska.simulace.cas < b.rozjezd + 2) zkouska.simulace.krok();
    expect(s.vx[predni]).toBeCloseTo(3, 1);
    const vysledek = dojed(zkouska);
    expect(vysledek).toMatchObject({ pruchod: true, prejelo: 1, spadlo: 0, poruseni: 0 });
    // Zkouška trvá o stání a ztrátu při brzdění a rozjezdu déle než plynulý průjezd.
    const plynule = dojed(new Zkouska(silnice([{ cas: 0, trasa: "silnice", smer: 1, druh: "nakladni" }]), prihradovyMost(), 1));
    expect(vysledek.trvani - plynule.trvani).toBeCloseTo(2 + v / 10 + v / 3, 0);
  }, 60_000);

  it("brzdná síla jde přes mostovku do pevné podpory: hmotnost krát zpomalení", () => {
    const zkouska = new Zkouska(silnice([jizda]), prihradovyMost(), 1);
    const b = zkouska.ucastnici[0]!.brzdeni!;
    const bremena = zkouska.provoz.bremena[0]!;
    // Uprostřed brzdění tlačí kola vozovku dopředu polovinou své tíhy (5 m/s² je 0,51 g).
    while (zkouska.simulace.cas < (b.od + b.stoji) / 2) zkouska.simulace.krok();
    let tlak = 0;
    for (let i = 0; i < bremena.pocet; i++) {
      expect(bremena.podelna[i]).toBeCloseTo(5 / g, 12);
      tlak += bremena.sila[i]!;
    }
    expect(tlak / (26000 * g)).toBeGreaterThan(0.85);
    expect(tlak / (26000 * g)).toBeLessThan(1.15);
    // Přední náprava je přitížená, zadní odlehčené.
    expect(bremena.sila[0]! / (7000 * g)).toBeGreaterThan(1.2);
    expect((bremena.sila[1]! + bremena.sila[2]!) / (19000 * g)).toBeLessThan(0.95);
    const vysledek = dojed(zkouska);
    const pevna = vysledek.reakce.find((r) => r.stycnik === 0)!;
    // Největší vodorovná reakce pevné podpory odpovídá brzdné síle 26 t × 5 m/s² = 130 kN.
    expect(pevna.vodorovna / 1000).toBeGreaterThan(100);
    expect(pevna.vodorovna / 1000).toBeLessThan(190);
    const bezBrzdeni = dojed(new Zkouska(silnice([{ cas: 0, trasa: "silnice", smer: 1, druh: "nakladni" }]), prihradovyMost(), 1));
    expect(bezBrzdeni.reakce.find((r) => r.stycnik === 0)!.vodorovna / 1000).toBeLessThan(20);
  }, 60_000);

  it("kolona brzdí naráz a drží rozestupy; protisměr zastaví čelem na druhou stranu", () => {
    const zkouska = new Zkouska(
      silnice([
        { cas: 0, trasa: "silnice", smer: 1, druh: "nakladni", pocet: 2, rozestup: 12, brzdeni: { misto: 20, stani: 1 } },
        { cas: 0, trasa: "silnice", smer: -1, druh: "dodavka", brzdeni: { misto: 6, stani: 1, zpomaleni: 4 } },
      ]),
      prihradovyMost(),
      1,
    );
    const [prvni, druhy, dodavka] = zkouska.ucastnici;
    expect(druhy!.brzdeni).toEqual(prvni!.brzdeni);
    expect(dodavka!.brzdeni!.zpomaleni).toBe(4);
    const s = zkouska.simulace.soustava;
    while (zkouska.simulace.cas < prvni!.brzdeni!.stoji + 0.5) zkouska.simulace.krok();
    expect(s.x[prvni!.kola[0]!]! + 1.4).toBeCloseTo(20, 1);
    expect(s.x[prvni!.kola[0]!]! - s.x[druhy!.kola[0]!]!).toBeCloseTo(12, 6);
    while (zkouska.simulace.cas < dodavka!.brzdeni!.stoji + 0.5) zkouska.simulace.krok();
    // Dodávka jede doleva: její čelo je metr vlevo od přední nápravy.
    expect(s.x[dodavka!.kola[0]!]! - 1).toBeCloseTo(6, 1);
    expect(dojed(zkouska)).toMatchObject({ pruchod: true, ucastniku: 3, prejelo: 3, spadlo: 0 });
  }, 60_000);

  it("chodců se brzdění netýká: údaj se u lidí přehlíží", () => {
    const zkouska = new Zkouska(
      silnice([{ cas: 0, trasa: "silnice", smer: 1, druh: "chodec", brzdeni: { misto: 10, stani: 5 } }]),
      prihradovyMost(),
      1,
    );
    expect(zkouska.ucastnici[0]!.brzdeni).toBeUndefined();
  });
});

describe("pohodlí cestujících v autobusu", () => {
  const autobus: PolozkaJizdnihoRadu = { cas: 0, trasa: "silnice", smer: 1, druh: "autobus" };
  /** Nízká příhrada z lehké oceli: unese, ale je měkká. */
  const mekky = (): NavrhMostu => {
    const k = new Kreslic();
    for (let x = 0; x < 24; x += 6) {
      k.prut("mostovka-ocelobeton", [x, 0], [x + 6, 0]);
      k.prut("ocel-lehka", [x, 2], [x + 6, 2]);
      const kStredu = x < 12;
      k.prut("ocel-lehka", kStredu ? [x, 2] : [x, 0], kStredu ? [x + 6, 0] : [x + 6, 2]);
    }
    for (let x = 0; x <= 24; x += 6) k.prut("ocel-lehka", [x, 0], [x, 2]);
    return k.navrh();
  };
  const jed = (navrh: NavrhMostu, uprava: Partial<Uroven> = {}, jizdniRad = [autobus]): VysledekZkousky =>
    dojed(new Zkouska({ ...silnice(jizdniRad), ...uprava }, navrh, 1));

  it("bez autobusu se neměří; s autobusem je to zrychlení jeho karoserie na mostě", () => {
    expect(jed(prihradovyMost(), {}, [{ cas: 0, trasa: "silnice", smer: 1, druh: "nakladni" }]).komfortCestujicich).toBeNull();
    const vysledek = jed(prihradovyMost());
    expect(vysledek.komfortCestujicich).not.toBeNull();
    expect(vysledek.komfortCestujicich!.zrychleni).toBeGreaterThan(0.02);
    expect(vysledek.komfortCestujicich!.zrychleni).toBeLessThan(0.3);
    expect(vysledek.komfortCestujicich!.trida).toBe(1);
    expect(vysledek.komfortCestujicich!.cas).toBeGreaterThan(0);
    // Chodci na mostě nejsou, takže komfort chodců se nehodnotí.
    expect(vysledek.komfort).toBeNull();
  }, 60_000);

  it("na rovné vozovce rozhoduje most: měkký houpe autobusem víc než tuhý", () => {
    const tuhy = jed(prihradovyMost()).komfortCestujicich!.zrychleni;
    const houpavy = jed(mekky()).komfortCestujicich!.zrychleni;
    expect(houpavy).toBeGreaterThan(1.5 * tuhy);
  }, 60_000);

  it("hrbolatá vozovka pohodlí zhorší, ať je most jakýkoli", () => {
    const rovna = jed(prihradovyMost()).komfortCestujicich!.zrychleni;
    const bezna = jed(prihradovyMost(), { nerovnost: "B" }).komfortCestujicich!.zrychleni;
    const rozbita = jed(prihradovyMost(), { nerovnost: "C" }).komfortCestujicich!.zrychleni;
    expect(bezna).toBeGreaterThan(2 * rovna);
    expect(rozbita).toBeGreaterThan(1.5 * bezna);
  }, 60_000);

  it("mistrovskou medaili za pohodlí cestujících dostane jen most pod limitem úrovně", () => {
    const tuhy = jed(prihradovyMost()).komfortCestujicich!.zrychleni;
    const houpavy = jed(mekky()).komfortCestujicich!.zrychleni;
    const limit = (tuhy + houpavy) / 2;
    const bonus: Partial<Uroven> = { mistrovska: { druh: "komfort-cestujicich", limit } };
    expect(jed(prihradovyMost(), bonus).medaile).toMatchObject({ pruchod: true, mistrovska: true });
    expect(jed(mekky(), bonus).medaile).toMatchObject({ pruchod: true, mistrovska: false });
    // Bez autobusu bonus získat nejde.
    expect(jed(prihradovyMost(), bonus, [{ cas: 0, trasa: "silnice", smer: 1, druh: "dodavka" }]).medaile.mistrovska).toBe(false);
  }, 60_000);
});
