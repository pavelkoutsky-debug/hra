// Odhad kmitání mostu pod lidmi při stavbě (`src/zkouska/odhad.ts`): lidé jako hmoty na
// pružinách, ustálená odezva, a hlavně srovnání se zkouškou. Odhad má říct předem to, co
// zkouška potvrdí; kde se mýlí, smí to být jen těsně u meze.
import { describe, expect, it } from "vitest";
import { Kreslic } from "../src/data/kreslic";
import type { NavrhMostu } from "../src/data/navrh";
import type { Uroven } from "../src/data/uroven";
import { TIHOVE_ZRYCHLENI } from "../src/jadro/integrator";
import { MEZE_KOMFORTU } from "../src/jadro/komfort";
import { poddajnost, rezonancniKrivka, zakladOdezvy, zmenenyZaklad } from "../src/jadro/odezva";
import { sestavSoustavu } from "../src/jadro/soustava";
import { volneStupne } from "../src/jadro/stupne";
import { najdiKlid } from "../src/jadro/ustaleni";
import { cinitelSpicky, mostovkaTrasy, POCET_TVARU_ODHADU } from "../src/zkouska/odhad";
import type { RozborMostu } from "../src/zkouska/protokol";
import { rozeberMost } from "../src/zkouska/rozbor";
import { sestavMost } from "../src/zkouska/stavba";
import { Zkouska } from "../src/zkouska/zkouska";
import { nactiKampan, nasadaUrovne } from "../urovne/index";
import { RESENI } from "../urovne/reseni";

const kampan = nactiKampan();
const uroven = (id: string): Uroven => kampan.find((u) => u.id === id)!;
const pad = (id: string, nazev: string): NavrhMostu => RESENI[id]!.pady.find((p) => p.nazev.includes(nazev))!.navrh;
const mez = (u: Uroven): number => MEZE_KOMFORTU[u.nejhorsiKomfort - 1]!;

function zkousej(u: Uroven, navrh: NavrhMostu) {
  const zkouska = new Zkouska(u, navrh, nasadaUrovne(u));
  let pojistka = 0;
  while (!zkouska.hotovo) {
    zkouska.pokracuj(1);
    expect(pojistka++).toBeLessThan(400);
  }
  return zkouska.vysledek();
}

/** Skupina, která most podle odhadu rozkmitá nejvíc. */
const nejhorsi = (rozbor: RozborMostu) => rozbor.odhad!.skupiny.reduce((a, b) => (b.zrychleni > a.zrychleni ? b : a));

/** Ocelová příhrada nad dřevěnou mostovkou s poli 4 m; `vysky` jsou výšky horního pásu nad každým vnitřním styčníkem. */
function lavka(id: string, vysky: readonly number[]): NavrhMostu {
  const pole = 4;
  const rozpeti = pole * (vysky.length + 1);
  const k = new Kreslic(id);
  for (let x = 0; x < rozpeti; x += pole) k.prut("mostovka-drevo", [x, 0], [x + pole, 0]);
  const O = "ocel-lehka" as const;
  const horni = vysky.map((h, i) => [pole * (i + 1), h] as [number, number]);
  k.prut(O, [0, 0], horni[0]!);
  k.prut(O, horni.at(-1)!, [rozpeti, 0]);
  for (let i = 0; i + 1 < horni.length; i++) k.prut(O, horni[i]!, horni[i + 1]!);
  for (const [x, h] of horni) k.prut(O, [x, 0], [x, h]);
  for (let i = 0; i + 1 < horni.length; i++) {
    const kStredu = horni[i]![0] < rozpeti / 2;
    k.prut(O, kStredu ? horni[i]! : [horni[i]![0], 0], kStredu ? [horni[i + 1]![0], 0] : horni[i + 1]!);
  }
  return k.navrh();
}

describe("ustálená odezva s připojenými těly", () => {
  const u = uroven("2-03");
  const navrh = pad("2-03", "bez závaží");
  const stavba = sestavMost(u, navrh);
  const s = sestavSoustavu(stavba.popis);
  const stupne = volneStupne(s);
  expect(najdiKlid(s, stupne, TIHOVE_ZRYCHLENI)).toBe(true);
  const { stycniky, xs } = mostovkaTrasy(stavba, 0);
  const zaklad = zakladOdezvy(s, stupne, stycniky, 0.01, POCET_TVARU_ODHADU)!;
  const p = stycniky.length;

  it("mostovka trasy je seřazená od břehu k břehu a poddajnost bez těl dává rezonanční křivku", () => {
    expect(xs[0]).toBe(0);
    expect(xs.at(-1)).toBe(32);
    expect([...xs]).toEqual([...xs].sort((a, b) => a - b));
    const frekvence = [1.5, 2.4, 2.66, 3.2, 6];
    const krivka = rezonancniKrivka(s, stupne, stycniky, frekvence, 0.01)!;
    frekvence.forEach((f, k) => {
      const G = poddajnost(zaklad, f)!;
      let nejvic = 0;
      for (let j = 0; j < p; j++) nejvic = Math.max(nejvic, Math.hypot(G.re[j * p + j]!, G.im[j * p + j]!));
      expect((2 * Math.PI * f) ** 2 * nejvic, `${f} Hz`).toBeCloseTo(krivka[k]!, 9);
    });
  });

  it("poddajnost je souměrná (síla tady, výchylka tam, a naopak) a podepřený styčník se nehne", () => {
    const G = poddajnost(zaklad, 2.3)!;
    for (let j = 0; j < p; j++) {
      for (let k = 0; k < j; k++) expect(G.re[j * p + k]!).toBeCloseTo(G.re[k * p + j]!, 12);
    }
    // První a poslední styčník mostovky leží na podporách.
    for (let k = 0; k < p; k++) expect(Math.hypot(G.re[k]!, G.im[k]!)).toBe(0);
  });

  it("těžká hmota na měkké pružině mostem nehne, na tuhé pružině ho zpomalí jako přidaná váha", () => {
    const stred = Math.floor(p / 2);
    const naStred = (hodnota: number): Float64Array => {
      const pole = new Float64Array(p);
      pole[stred] = hodnota;
      return pole;
    };
    const odezva = (f: number, re?: Float64Array, im?: Float64Array): number => {
      const G = poddajnost(zaklad, f, re, im)!;
      return Math.hypot(G.re[stred * p + stred]!, G.im[stred * p + stred]!);
    };
    // Dynamická tuhost tuhé hmoty m je −mω²: pod vlastní frekvencí mostu odezvu zvětší (most se
    // k té frekvenci přiblíží), nad ní zmenší.
    const m = 2000;
    const w = (f: number): number => 2 * Math.PI * f;
    expect(odezva(2.2, naStred(-m * w(2.2) ** 2))).toBeGreaterThan(1.3 * odezva(2.2));
    expect(odezva(2.66, naStred(-m * w(2.66) ** 2))).toBeLessThan(0.5 * odezva(2.66));
    // Nulová tuhost je totéž co nic.
    expect(odezva(2.3, naStred(0), naStred(0))).toBeCloseTo(odezva(2.3), 15);
    // Čistý tlumič (jen imaginární část) rezonanční špičku srazí.
    expect(odezva(2.66, naStred(0), naStred(w(2.66) * 20000))).toBeLessThan(0.3 * odezva(2.66));
  });

  it("tužší most kmitá rychleji, těžší pomaleji; tvary zůstávají", () => {
    const tuzsi = zmenenyZaklad(zaklad, 1.3, 1);
    const tezsi = zmenenyZaklad(zaklad, 1, 2);
    expect(tuzsi.omega[0]!).toBeCloseTo(zaklad.omega[0]! * Math.sqrt(1.3), 9);
    expect(tezsi.omega[0]!).toBeCloseTo(zaklad.omega[0]! / Math.SQRT2, 9);
    expect(tezsi.fi[5]!).toBeCloseTo(zaklad.fi[5]! / Math.SQRT2, 12);
    expect(zmenenyZaklad(zaklad, 1, 1).tlumeni).toEqual(zaklad.tlumeni);
    // Statická poddajnost (hluboko pod první frekvencí) klesne s tuhostí, s hmotou se nezmění.
    const staticky = (z: typeof zaklad): number => {
      const G = poddajnost(z, 0.05)!;
      const stred = Math.floor(p / 2);
      return G.re[stred * p + stred]!;
    };
    expect(staticky(tuzsi)).toBeCloseTo(staticky(zaklad) / 1.3, 6);
    expect(staticky(tezsi)).toBeCloseTo(staticky(zaklad), 5);
  });
});

describe("činitel špičky volně jdoucích lidí", () => {
  it("lidé s jedním rytmem ho nemají; roste s šířkou pásma kadencí a s dobou přechodu", () => {
    expect(cinitelSpicky(0, 60)).toBe(1);
    expect(cinitelSpicky(0.14, 5)).toBe(1);
    // Běžecký závod: pásmo 0,14 Hz, přechod asi 20 s.
    expect(cinitelSpicky(0.14, 21.5)).toBeCloseTo(1.18, 1);
    // Dav: trojnásobek kroku má pásmo 0,9 Hz a dav jde mostem skoro minutu.
    expect(cinitelSpicky(0.9, 56)).toBeCloseTo(1.98, 1);
    expect(cinitelSpicky(0.9, 56)).toBeGreaterThan(cinitelSpicky(0.3, 56));
    expect(cinitelSpicky(0.3, 56)).toBeGreaterThan(cinitelSpicky(0.3, 20));
  });
});

describe("most s lidmi", () => {
  it("lidé nejsou mrtvá váha: pomalý most zpomalí víc, než kolik váží, rychlý o něco zrychlí", () => {
    // Kontrola výpočtů M11 změřila v simulaci: lávka 2,66 Hz rezonuje s 24 lidmi na 2,15 Hz
    // (rozbor s lidmi jako tuhou hmotou říkal 2,48), lávka 4,93 Hz na 5,10 Hz (rozbor říkal 4,59).
    const nizka = rozeberMost(uroven("2-03"), pad("2-03", "bez závaží"));
    expect(nizka.frekvence[0]!).toBeCloseTo(2.66, 1);
    expect(nizka.frekvenceObsazeneho[0]!).toBeGreaterThan(2.05);
    expect(nizka.frekvenceObsazeneho[0]!).toBeLessThan(2.3);
    const dvoumetrova = rozeberMost(uroven("2-04"), RESENI["2-04"]!.pruchod);
    expect(dvoumetrova.frekvence[0]!).toBeCloseTo(4.93, 1);
    expect(dvoumetrova.frekvenceObsazeneho[0]!).toBeGreaterThan(5);
    expect(dvoumetrova.frekvenceObsazeneho[0]!).toBeLessThan(5.25);
  });

  it("rezonanční křivka s lidmi je nižší než prázdná: těla kmitání tlumí", () => {
    const u: Uroven = { ...uroven("2-03"), rezonancniKrivka: true };
    const rozbor = rozeberMost(u, pad("2-03", "bez závaží"));
    const prazdny = Math.max(...rozbor.krivka!.prazdny);
    const obsazeny = Math.max(...rozbor.krivka!.obsazeny!.slice(0, 160));
    expect(obsazeny).toBeLessThan(0.6 * prazdny);
    expect(rozbor.krivka!.obsazeny).toHaveLength(rozbor.krivka!.prazdny.length);
  });

  it("úroveň bez lidí a úroveň bez osy frekvencí odhad nemají", () => {
    expect(rozeberMost(uroven("3-01"), RESENI["3-01"]!.pruchod).odhad).toBeNull();
    const kapitola1 = rozeberMost(uroven("1-01"), RESENI["1-01"]!.pruchod);
    expect(kapitola1.odhad).toBeNull();
    expect(kapitola1.frekvenceObsazeneho).toEqual([]);
    expect(kapitola1.smer).toBeNull();
  });
});

describe("odhad kmitání proti zkoušce", () => {
  // Pod tímto podílem meze hra říká „v klidu“, nad tímto „nad mezí“ (viz `ODHAD_U_MEZE` v uroven.ts).
  const KLID = 0.75;
  const NAD = 1.25;

  it("referenční mosty všech úrovní s lidmi: odhad je do třetiny od zkoušky a nikdy netvrdí opak", () => {
    let mostu = 0;
    const pomery: number[] = [];
    for (const u of kampan) {
      if (!u.osaFrekvenci || rozeberMost(u, RESENI[u.id]!.pruchod).odhad === null) continue;
      const res = RESENI[u.id]!;
      const mosty: [string, NavrhMostu][] = [["pruchod", res.pruchod], ["rozpocet", res.rozpocet], ["mistrovska", res.mistrovska], ...res.pady.map((x) => [x.nazev, x.navrh] as [string, NavrhMostu])];
      for (const [nazev, navrh] of mosty) {
        const rozbor = rozeberMost(u, navrh);
        if (!rozbor.stabilni || !rozbor.odhad) continue;
        const vysledek = zkousej(u, navrh);
        if (vysledek.poruseni > 0 || vysledek.spadlo > 0 || !vysledek.komfort) continue;
        mostu += 1;
        const zkouska = vysledek.komfort.zrychleni;
        const odhad = rozbor.odhad.zrychleni;
        const popis = `${u.id} ${nazev}: odhad ${odhad.toFixed(2)}, zkouška ${zkouska.toFixed(2)}`;
        // Kde lidé ztrácejí krok (nad 2,5 m/s²), zkouška roste pomaleji než lineární odhad.
        if (zkouska < 2.5) pomery.push(odhad / zkouska);
        expect(odhad / zkouska, popis).toBeGreaterThan(0.6);
        expect(odhad / zkouska, popis).toBeLessThan(zkouska < 2.5 ? 1.35 : 1.6);
        // Most, který na kmitání propadl, odhad nikdy neoznačí za klidný; most, který prošel, nikdy za jasně nevyhovující.
        if (zkouska > mez(u)) expect(odhad, popis).toBeGreaterThanOrEqual(KLID * mez(u));
        else expect(odhad, popis).toBeLessThanOrEqual(NAD * mez(u));
      }
    }
    expect(mostu).toBeGreaterThanOrEqual(30);
    pomery.sort((a, b) => a - b);
    const median = pomery[Math.floor(pomery.length / 2)]!;
    expect(median).toBeGreaterThan(0.85);
    expect(median).toBeLessThan(1.15);
  }, 400_000);

  it("příhrady, u kterých stará osa mlčela a most propadl, odhad pozná (2-04)", () => {
    // Zkoušky z kontroly výpočtů M11 (m/s²): nízké příhrady rozhoupal pochod 2,3 Hz, osa přitom
    // nevarovala u 26 z 26; vyšší příhrady procházely.
    const u = uroven("2-04");
    const zmereno: [string, number][] = [
      ["1111111", 4.15],
      ["2111112", 4.15],
      ["1131311", 4.55],
      ["1212121", 3.44],
      ["1122211", 1.64],
      ["1222221", 1.42],
      ["1333331", 1.66],
      ["1221221", 2.21],
    ];
    for (const [profil, zkouska] of zmereno) {
      const odhad = rozeberMost(u, lavka("2-04", [...profil].map(Number))).odhad!.zrychleni;
      const popis = `${profil}: odhad ${odhad.toFixed(2)}, zkouška ${zkouska}`;
      if (zkouska > 2.5) expect(odhad, popis).toBeGreaterThan(NAD * 2.5);
      else expect(odhad, popis).toBeLessThan(2.5);
      expect(odhad / zkouska, popis).toBeGreaterThan(0.85);
      expect(odhad / zkouska, popis).toBeLessThan(1.45);
    }
  });

  it("odhad jmenuje skupinu a složku kroku, která most rozkmitá, stejně jako pak zkouška", () => {
    // 2-02: nízká příhrada kmitá krokem běhu, dvoumetrová jeho dvojnásobkem.
    expect(nejhorsi(rozeberMost(uroven("2-02"), pad("2-02", "rytmu běhu")))).toMatchObject({ druh: "utvar", slozky: [{ rytmus: 3, nasobek: 1, vTaktu: true }, {}] });
    expect(nejhorsi(rozeberMost(uroven("2-02"), pad("2-02", "dvojnásobku"))).slozky[0]).toMatchObject({ rytmus: 3, nasobek: 2 });
    // 2-04: ze tří útvarů je nejhorší ten s krokem 2,3 Hz; vysokou příhradu trefí jeho trojnásobek.
    const prehlidka = nejhorsi(rozeberMost(uroven("2-04"), pad("2-04", "bez tlumičů")));
    expect(prehlidka.polozka).toBe(2);
    expect(prehlidka.slozky[0]).toMatchObject({ rytmus: 2.3, nasobek: 1 });
    expect(nejhorsi(rozeberMost(uroven("2-04"), pad("2-04", "trojnásobku"))).slozky[0]).toMatchObject({ rytmus: 2.3, nasobek: 3 });
    // 5-04: skákání trefí dvoumetrovou příhradu dvojnásobkem rytmu.
    expect(nejhorsi(rozeberMost(uroven("5-04"), pad("5-04", "bez tlumiče"))).slozky[0]).toMatchObject({ rytmus: 2.2, nasobek: 2, vTaktu: true });
    // 5-01: dav nejde jedním rytmem.
    expect(nejhorsi(rozeberMost(uroven("5-01"), RESENI["5-01"]!.pruchod)).slozky[0]).toMatchObject({ rytmus: 1.7, vTaktu: false });
  });
});

describe("rada a ladění tlumiče z odhadu", () => {
  it("řekne, jestli by pomohl tužší, nebo těžší most, a neporadí špatným směrem", () => {
    // 2-02 nízká příhrada (3,43 Hz) nad rytmem běhu 3,0 Hz: tužší most pomůže, těžší by ho
    // k rytmu přitáhl (dřív hra radila „těžší nebo tužší“).
    const beh = rozeberMost(uroven("2-02"), pad("2-02", "rytmu běhu")).smer!;
    expect(beh.tuzsi[0]).toBeLessThan(0.8);
    expect(beh.tezsi[0]).toBeGreaterThan(1.2);
    // 2-03 nízká příhrada: úroveň učí závaží. O třetinu těžší most nestačí, dvakrát těžší ano.
    const pochod = rozeberMost(uroven("2-03"), pad("2-03", "bez závaží")).smer!;
    expect(pochod.tezsi[0]).toBeGreaterThan(0.8);
    expect(pochod.tezsi[1]).toBeLessThan(0.8);
    expect(pochod.tuzsi[0]).toBeLessThan(0.8);
    // Most s laděným tlumičem radu „tužší/těžší“ nedostává: tam se ladí tlumič.
    expect(rozeberMost(uroven("5-02"), RESENI["5-02"]!.pruchod).smer).toBeNull();
  });

  it("cíl ladění je rytmus, který most bez tlumičů rozkmitá nejvíc; tlumič odhad výrazně sníží", () => {
    const cile: [string, number][] = [
      ["5-02", 2.6],
      ["5-03", 2.0],
      ["5-04", 4.4],
    ];
    for (const [id, cil] of cile) {
      const rozbor = rozeberMost(uroven(id), RESENI[id]!.pruchod);
      const bez = rozbor.odhadBezTlumicu!;
      expect(bez.skupiny.reduce((a, b) => (b.zrychleni > a.zrychleni ? b : a)).slozky[0]!.frekvence, id).toBeCloseTo(cil, 6);
      expect(rozbor.odhad!.zrychleni, id).toBeLessThan(0.6 * bez.zrychleni);
      // Bez tlumiče by most propadl, s ním projde: odhad to ví předem.
      expect(bez.zrychleni, id).toBeGreaterThan(1.25 * mez(uroven(id)));
      expect(rozbor.odhad!.zrychleni, id).toBeLessThan(mez(uroven(id)));
    }
  });

  it("lehký tlumič nestačí, i když je naladěný: odhad zůstane vysoko (osa dřív hlásila „tlumič je naladěný“)", () => {
    const u = uroven("5-02");
    const navrh = RESENI["5-02"]!.pruchod;
    const lehky: NavrhMostu = { ...navrh, stycniky: navrh.stycniky.map((s) => (s.tlumic ? { ...s, tlumic: { hmota: 50, frekvence: 2.6 } } : s)) };
    const rozbor = rozeberMost(u, lehky);
    expect(rozbor.odhad!.zrychleni).toBeGreaterThan(mez(u));
    expect(rozbor.odhad!.zrychleni).toBeGreaterThan(2 * rozeberMost(u, navrh).odhad!.zrychleni);
  });
});
