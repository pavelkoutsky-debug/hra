// Odhad kmitání mostu pod lidmi při stavbě (`src/zkouska/odhad.ts`): lidé jako hmoty na
// pružinách, ustálená odezva, a hlavně srovnání se zkouškou. Odhad má říct předem to, co
// zkouška potvrdí; kde se mýlí, smí to být jen těsně u meze.
import { describe, expect, it } from "vitest";
import { Kreslic } from "../src/data/kreslic";
import type { NavrhMostu } from "../src/data/navrh";
import { urovenSandboxu } from "../src/data/sandbox";
import type { Uroven } from "../src/data/uroven";
import { TIHOVE_ZRYCHLENI } from "../src/jadro/integrator";
import { MEZE_KOMFORTU } from "../src/jadro/komfort";
import { poddajnost, rezonancniKrivka, zakladOdezvy, zmenenyZaklad } from "../src/jadro/odezva";
import { sestavSoustavu } from "../src/jadro/soustava";
import { volneStupne } from "../src/jadro/stupne";
import { najdiKlid } from "../src/jadro/ustaleni";
import { cinitelSpicky, mostovkaTrasy, ODHAD_U_MEZE, POCET_TVARU_ODHADU } from "../src/zkouska/odhad";
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

interface Doplnky {
  /** Polohy styčníků mostovky, m; bez nich pole po 4 m. */
  xs?: readonly number[];
  /** Závaží v každém vnitřním styčníku mostovky, kg. */
  zavazi?: number;
  /** Laděné tlumiče: x styčníku mostovky, hmotnost, frekvence. */
  tlumice?: readonly (readonly [number, number, number])[];
}

/** Ocelová příhrada nad dřevěnou mostovkou; `vysky` jsou výšky horního pásu nad každým vnitřním styčníkem mostovky. */
function lavka(id: string, vysky: readonly number[], d: Doplnky = {}): NavrhMostu {
  const xs = d.xs ?? Array.from({ length: vysky.length + 2 }, (_, i) => 4 * i);
  const rozpeti = xs.at(-1)!;
  const k = new Kreslic(id);
  for (let i = 0; i + 1 < xs.length; i++) k.prut("mostovka-drevo", [xs[i]!, 0], [xs[i + 1]!, 0]);
  const O = "ocel-lehka" as const;
  const horni = vysky.map((h, i) => [xs[i + 1]!, h] as [number, number]);
  k.prut(O, [0, 0], horni[0]!);
  k.prut(O, horni.at(-1)!, [rozpeti, 0]);
  for (let i = 0; i + 1 < horni.length; i++) k.prut(O, horni[i]!, horni[i + 1]!);
  for (const [x, h] of horni) k.prut(O, [x, 0], [x, h]);
  for (let i = 0; i + 1 < horni.length; i++) {
    const kStredu = horni[i]![0] < rozpeti / 2;
    k.prut(O, kStredu ? horni[i]! : [horni[i]![0], 0], kStredu ? [horni[i + 1]![0], 0] : horni[i + 1]!);
  }
  if (d.zavazi) for (const x of xs.slice(1, -1)) k.bod(x, 0, { zavazi: d.zavazi });
  for (const [x, hmota, frekvence] of d.tlumice ?? []) k.bod(x, 0, { tlumic: { hmota, frekvence } });
  return k.navrh();
}

/** Lávka v pískovišti s jednou skupinou lidí. */
function piskoviste(rozpeti: number, druh: "skakajici-dav" | "chodec" | "bezec", pocet: number): Uroven {
  return urovenSandboxu({ verze: 1, rozpeti, hloubka: 8, druh: "lavka", voda: true, zaklady: 0, provoz: [{ druh, pocet, smer: 1, cas: 0 }] });
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
  it("lidé s jedním rytmem ho nemají; roste s rozptylem kadencí a s dobou přechodu", () => {
    expect(cinitelSpicky(0, 60)).toBe(1);
    // Úzké pásmo a krátký přechod: řady se sejít nestihnou.
    expect(cinitelSpicky(0.07, 5)).toBe(1);
    // Běžecký závod: rozptyl 0,07 Hz, přechod asi 20 s.
    expect(cinitelSpicky(0.07, 21.5)).toBeGreaterThan(1.05);
    expect(cinitelSpicky(0.07, 21.5)).toBeLessThan(1.25);
    // Dav: trojnásobek kroku má rozptyl 0,45 Hz a dav jde mostem skoro minutu.
    expect(cinitelSpicky(0.45, 56)).toBeGreaterThan(1.4);
    expect(cinitelSpicky(0.45, 56)).toBeGreaterThan(cinitelSpicky(0.15, 56));
    expect(cinitelSpicky(0.15, 56)).toBeGreaterThan(cinitelSpicky(0.15, 20));
  });

  it("počítá s tím, že zkouška kmitání průměruje přes sekundu: rychlé rázy širokého pásma se vyhladí", () => {
    // Bez průměrování by největší výkon z K nezávislých okamžiků byl ln K násobek průměru.
    const bezPrumeru = (rozptyl: number, doba: number): number => Math.sqrt(Math.log(1 + 2 * rozptyl * doba));
    // Úzké pásmo (pomalé rázy) průměrování skoro nezmění, široké ano.
    expect(cinitelSpicky(0.05, 200) / bezPrumeru(0.05, 200)).toBeGreaterThan(0.93);
    expect(cinitelSpicky(0.45, 56) / bezPrumeru(0.45, 56)).toBeLessThan(0.85);
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
  // Pod prvním podílem meze hra říká „v klidu“, nad druhým „nad mezí“.
  const [KLID, NAD] = ODHAD_U_MEZE;

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
        expect(odhad / zkouska, popis).toBeGreaterThan(0.72);
        // U mostu, který na kmitání propadl, smí odhad nadsadit o něco víc (verdikt je stejný):
        // měkkou poloviční visutou lávku v 8-02, kterou rozkmitá malé procesí, nadsazuje o 31 %.
        expect(odhad / zkouska, popis).toBeLessThan(zkouska >= 2.5 ? 1.6 : zkouska > mez(u) ? 1.4 : 1.3);
        // Most, který na kmitání propadl, odhad nikdy neoznačí za klidný; most, který prošel, nikdy za jasně nevyhovující.
        if (zkouska > mez(u)) expect(odhad, popis).toBeGreaterThanOrEqual(KLID * mez(u));
        else expect(odhad, popis).toBeLessThanOrEqual(NAD * mez(u));
      }
    }
    expect(mostu).toBeGreaterThanOrEqual(30);
    pomery.sort((a, b) => a - b);
    const median = pomery[Math.floor(pomery.length / 2)]!;
    expect(median).toBeGreaterThan(0.9);
    expect(median).toBeLessThan(1.1);
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
      // Nad 2,5 m/s² lidé ztrácejí krok a zkouška roste pomaleji než lineární odhad.
      expect(odhad / zkouska, popis).toBeLessThan(zkouska > 2.5 ? 1.6 : 1.3);
    }
  });

  it("mostovka s různě dlouhými poli: místní kmitání pole odhad najde, ať skupina stojí kdekoli (2-02)", () => {
    // Druhá kontrola výpočtů M11: příhrada 5 m nad mostovkou se styčníky po 4, 3, 4, 2 a 3 m.
    // Odhad s osmi pevnými místy skupiny dával 1,84 („klid“), zkouška 2,53 a most propadl.
    const odhad = rozeberMost(uroven("2-02"), lavka("2-02", [5, 5, 5, 5, 5, 5, 5, 5], { xs: [0, 4, 7, 11, 13, 16, 20, 23, 27, 28] })).odhad!.zrychleni;
    expect(odhad).toBeGreaterThan(KLID * 2.5);
    expect(odhad / 2.534).toBeGreaterThan(0.85);
    expect(odhad / 2.534).toBeLessThan(1.2);
  });

  it("skákající dav v pískovišti skáče ve výchozím rytmu, i když ho položka neurčí", () => {
    // Zkouška bere 2,2 Hz; odhad skákání dřív bez zadané kadence nepočítal a hlásil klid (0,37 proti 3,68).
    const u = piskoviste(32, "skakajici-dav", 30);
    const rozbor = rozeberMost(u, lavka(u.id, Array<number>(15).fill(2), { xs: Array.from({ length: 17 }, (_, i) => 2 * i) }));
    expect(rozbor.odhad!.zrychleni / 3.68).toBeGreaterThan(0.85);
    expect(rozbor.odhad!.zrychleni / 3.68).toBeLessThan(1.2);
    expect(nejhorsi(rozbor).slozky[0]).toMatchObject({ rytmus: 2.2, nasobek: 2, vTaktu: true });
    // Tlumič se pak ladí na skákání, ne na chůzi, kterou dav přišel.
    expect(rozbor.tlumic!.cil).toBeCloseTo(4.4, 6);
  });

  it("jednotlivci se stejnou kadencí: s násadou zkoušky odhad zná jejich fáze a sedí se zkouškou", () => {
    // Šedesát chodců na lávce 72 m (zkouška 0,58 m/s²). Bez fází se sčítaly jen výkony a na
    // patnácti mostech recenzenta vyšel odhad na 0,49 až 0,60 zkoušky; s fázemi 0,83 až 1,23.
    const u = piskoviste(72, "chodec", 60);
    const most = lavka(u.id, Array<number>(17).fill(4));
    const sFazemi = rozeberMost(u, most, nasadaUrovne(u)).odhad!.zrychleni;
    expect(sFazemi / 0.58).toBeGreaterThan(0.85);
    expect(sFazemi / 0.58).toBeLessThan(1.2);
    expect(rozeberMost(u, most).odhad!.zrychleni).not.toBe(sFazemi);
  });

  it("odhad jmenuje skupinu a složku kroku, která most rozkmitá, stejně jako pak zkouška", () => {
    // 2-02: nízká příhrada kmitá krokem běhu, dvoumetrová jeho dvojnásobkem.
    const beh = nejhorsi(rozeberMost(uroven("2-02"), pad("2-02", "rytmu běhu")));
    expect(beh.druh).toBe("utvar");
    expect(beh.slozky[0]).toMatchObject({ druh: "utvar", polozka: 0, rytmus: 3, nasobek: 1, vTaktu: true });
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
    // Most hluboko pod mezí radu nepotřebuje a rozbor ji nepočítá.
    expect(rozeberMost(uroven("5-02"), RESENI["5-02"]!.pruchod).smer).toBeNull();
    expect(rozeberMost(uroven("2-04"), RESENI["2-04"]!.mistrovska).smer).toBeNull();
  });

  it("rada počítá se všemi skupinami: tužší most, který jednomu útvaru ujede a jiný trefí, neporadí (2-04)", () => {
    // Druhá kontrola výpočtů M11: příhrada 1 m se závažím 1500 kg v každém styčníku kmitá pod
    // útvarem s krokem 1,7 Hz. Rada spočítaná jen pro něj slibovala s 1,3× tužším mostem čtvrtinu
    // kmitání; zkouška s takovým mostem naměřila 1,44násobek (trefí ho útvar s krokem 2,0 Hz).
    const smer = rozeberMost(uroven("2-04"), lavka("2-04", [1, 1, 1, 1, 1, 1, 1], { zavazi: 1500 })).smer!;
    expect(smer.tuzsi[0]).toBeGreaterThan(1.2);
    // Dvakrát těžší most by pomohl: ujede všem třem rytmům dolů.
    expect(smer.tezsi[1]).toBeLessThan(0.8);
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
      expect(rozbor.tlumic!.cil, id).toBeCloseTo(cil, 6);
      expect(rozbor.odhad!.zrychleni, id).toBeLessThan(0.6 * bez.zrychleni);
      // Bez tlumiče by most propadl, s ním projde: odhad to ví předem.
      expect(bez.zrychleni, id).toBeGreaterThan(1.25 * mez(uroven(id)));
      expect(rozbor.odhad!.zrychleni, id).toBeLessThan(mez(uroven(id)));
    }
  });

  it("most bez tlumiče: rozbor spočítá, co by udělal tlumič naladěný na cíl", () => {
    const rozbor = rozeberMost(uroven("5-02"), pad("5-02", "bez tlumiče"));
    expect(rozbor.odhadBezTlumicu).toBeNull();
    expect(rozbor.tlumic).toMatchObject({ cil: 2.6, polozka: 0, nasobek: 1, preladeny: null, tezsi: null, jinde: null });
    // Zkouška: bez tlumiče 3,7 m/s², s tlumičem 600 kg uprostřed kolem 1,3.
    expect(rozbor.tlumic!.novy!).toBeLessThan(0.5);
    // Úroveň bez laděných tlumičů radu k tlumiči nemá.
    expect(rozeberMost(uroven("2-03"), pad("2-03", "bez závaží")).tlumic).toBeNull();
  });

  it("most se dvěma rytmy: rozbor poradí další tlumič na rytmus, který zbyl, a každému tlumiči dá jeho cíl", () => {
    // 5-05: běžci na 2,4 Hz a průvod na 1,8 Hz. Jeden tlumič zkrotí jen jeden rytmus.
    const u = uroven("5-05");
    const nasada = nasadaUrovne(u);
    const naPruvod = rozeberMost(u, pad("5-05", "jeden tlumič naladěný na průvod"), nasada);
    expect(naPruvod.odhad!.zrychleni).toBeGreaterThan(mez(u));
    expect(naPruvod.tlumic!.cil).toBeCloseTo(1.8, 6);
    // Tlumič na průvod naladěný je; most teď rozkmitají běžci a další tlumič patří na ně.
    expect(naPruvod.tlumic!.preladeny).toBeNull();
    expect(naPruvod.tlumic!.zbyly!.cil).toBeCloseTo(2.4, 6);
    expect(naPruvod.tlumic!.dalsi!).toBeLessThan(0.7);
    expect(naPruvod.tlumic!.dalsi! * naPruvod.odhad!.zrychleni).toBeLessThan(mez(u));
    // Když úprava tlumičů pomůže, tužší most se neradí.
    expect(naPruvod.smer).toBeNull();
    // Dva tlumiče na stejném rytmu: stačí jeden přeladit.
    const obaNaPruvod = rozeberMost(u, pad("5-05", "dva tlumiče, oba naladěné na průvod"), nasada);
    expect(obaNaPruvod.odhad!.zrychleni).toBeGreaterThan(mez(u));
    expect(obaNaPruvod.tlumic!.cile.map((c) => c.cil.toFixed(2))).toEqual(["2.40", "2.40"]);
    expect(obaNaPruvod.tlumic!.jeden!.cil).toBeCloseTo(2.4, 6);
    expect(obaNaPruvod.tlumic!.jeden!.pomer).toBeLessThan(0.7);
    expect(obaNaPruvod.smer).toBeNull();
    // Most autora má každý tlumič na jiném rytmu a rozbor mu je nechává.
    const mistrovska = rozeberMost(u, RESENI["5-05"]!.mistrovska, nasada);
    expect(mistrovska.tlumic!.cile.map((c) => c.cil.toFixed(2)).sort()).toEqual(["1.80", "2.40"]);
    expect(mistrovska.tlumic!.jeden).toBeNull();
    expect(mistrovska.odhad!.zrychleni).toBeLessThan(mez(u));
    // Jediný tlumič má cíl mostu bez tlumičů (jako dřív).
    const jediny = rozeberMost(uroven("5-02"), RESENI["5-02"]!.pruchod);
    expect(jediny.tlumic!.cile).toHaveLength(1);
    expect(jediny.tlumic!.cile[0]!.cil).toBeCloseTo(jediny.tlumic!.cil, 9);
  });

  it("most s tlumičem: rozbor pozná, jestli pomůže přeladění, těžší závaží, nebo jiné místo", () => {
    const u = uroven("5-02");
    const navrh = RESENI["5-02"]!.pruchod;
    const sTlumicem = (tlumic: { hmota: number; frekvence: number }): NavrhMostu => ({ ...navrh, stycniky: navrh.stycniky.map((s) => (s.tlumic ? { ...s, tlumic } : s)) });
    // Rozladěný tlumič: přeladění na rytmus pomůže.
    const rozladeny = rozeberMost(u, sTlumicem({ hmota: 600, frekvence: 3.2 })).tlumic!;
    expect(rozladeny.preladeny!).toBeLessThan(0.9);
    // Lehký tlumič naladěný správně: přeladit nejde, pomůže těžší závaží.
    const lehky = rozeberMost(u, sTlumicem({ hmota: 50, frekvence: 2.6 }));
    expect(lehky.odhad!.zrychleni).toBeGreaterThan(mez(u));
    expect(lehky.odhad!.zrychleni).toBeGreaterThan(2 * rozeberMost(u, navrh).odhad!.zrychleni);
    expect(lehky.tlumic!.preladeny).toBeNull();
    expect(lehky.tlumic!.tezsi!).toBeLessThan(0.6);
    // Tlumič uprostřed mostu jinam nepatří.
    expect(lehky.tlumic!.jinde === null || lehky.tlumic!.jinde > 0.9).toBe(true);
    // 5-03: těžký a naladěný tlumič čtyři metry od opěry (zkouška 3,05 m/s², most propadl).
    // Chybí mu poloha, ne hmotnost: uprostřed mostu by stačil poloviční (zkouška 1,42).
    const uKraje = rozeberMost(uroven("5-03"), lavka("5-03", Array<number>(8).fill(1), { tlumice: [[4, 1200, 2.0]] }));
    expect(uKraje.odhad!.zrychleni / 3.05).toBeGreaterThan(0.8);
    expect(uKraje.tlumic).toMatchObject({ cil: 2, preladeny: null, tezsi: null, jindeX: 16 });
    expect(uKraje.tlumic!.jinde!).toBeLessThan(0.6);
    // Když úprava tlumiče pomůže, tužší a těžší most se nezkouší.
    expect(uKraje.smer).toBeNull();
    const uprostred = rozeberMost(uroven("5-03"), lavka("5-03", Array<number>(8).fill(1), { tlumice: [[16, 600, 2.0]] }));
    expect(uprostred.odhad!.zrychleni / 1.42).toBeGreaterThan(0.85);
    expect(uprostred.odhad!.zrychleni / 1.42).toBeLessThan(1.15);
  });
});
