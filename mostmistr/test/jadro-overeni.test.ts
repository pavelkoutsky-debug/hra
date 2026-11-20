// Ověřovací úlohy z kapitoly 7.10 koncepce, které nemají vlastní soubor:
// velká natočení, lana, vzpěr a konvergence.
import { describe, expect, it } from "vitest";
import { vytvorBremena, zatizeniBremeny } from "../src/jadro/bremena";
import { krok, spoctiSily, TIHOVE_ZRYCHLENI } from "../src/jadro/integrator";
import {
  choleskehoRozklad,
  najdiRovnovahu,
  nejvyssiFrekvence,
  sestavMaticiTuhosti,
  vlastniTvarySoustavy,
} from "../src/jadro/matice";
import { Simulace } from "../src/jadro/simulace";
import { LANO, sestavSoustavu, type PopisSoustavy, type Soustava } from "../src/jadro/soustava";
import { zvolKrok } from "../src/jadro/stabilita";
import { volneStupne } from "../src/jadro/stupne";
import { vytvorTrasu } from "../src/jadro/trasa";
import { HEB200, HEB200_BEZ_SMYKU, nosnik, type Prurez } from "./pomucky-jadra";

describe("konzola stočená koncovým momentem", () => {
  const L = 10;
  const EI = HEB200_BEZ_SMYKU.EI;

  /** Postupně přitíží konec konzoly momentem M a vrátí polohu konce. */
  function stoc(dilu: number, uhel: number): { x: number; y: number; cos: number } {
    const s = sestavSoustavu(nosnik(HEB200_BEZ_SMYKU, L, dilu, "konzola"));
    const stupne = volneStupne(s);
    const vnejsi = new Float64Array(stupne.length);
    const kroku = Math.ceil(uhel / 0.2);
    for (let i = 1; i <= kroku; i++) {
      vnejsi[stupne.indexOf(3 * dilu + 2)] = ((i / kroku) * uhel * EI) / L;
      expect(najdiRovnovahu(s, stupne, vnejsi, 0)).toBeGreaterThanOrEqual(0);
    }
    return { x: s.x[dilu]!, y: s.y[dilu]!, cos: s.cosN[dilu]! };
  }

  // Čistý ohyb dává kruhový oblouk o poloměru EI/M: konec je v (R·sin θ, R·(1 − cos θ)).
  // Prvek měří natočení svých konců sinem, takže moment M stočí prvek délky h o úhel
  // arcsin(M·h/EI) místo M·h/EI. Chyba roste s třetí mocninou úhlu připadajícího na prvek;
  // celý kruh proto potřebuje jemnější dělení než čtvrtkruh. V mostě se prvek sám ohne
  // o zlomky stupně a chyba je neměřitelná.
  for (const [nazev, uhel, dilu] of [
    ["čtvrtkruh", Math.PI / 2, 20],
    ["půlkruh", Math.PI, 20],
    ["celý kruh", 2 * Math.PI, 48],
  ] as const) {
    it(`${nazev}: konec leží na kruhovém oblouku`, () => {
      const konec = stoc(dilu, uhel);
      const R = L / uhel;
      expect(Math.abs(konec.x - R * Math.sin(uhel)) / L).toBeLessThan(0.005);
      expect(Math.abs(konec.y - R * (1 - Math.cos(uhel))) / L).toBeLessThan(0.005);
      expect(konec.cos).toBeCloseTo(Math.cos(uhel), 2);
    });
  }

  it("s jemnějším dělením se chyba zmenšuje", () => {
    const chyba = (dilu: number): number => {
      const konec = stoc(dilu, Math.PI);
      const R = L / Math.PI;
      return Math.hypot(konec.x, konec.y - 2 * R);
    };
    const hruba = chyba(8);
    const jemna = chyba(16);
    // Dvojnásobný počet prvků zmenší chybu zhruba čtyřikrát.
    expect(jemna).toBeLessThan(hruba / 3);
  });
});

/** Řetěz z `dilu` lanových prvků mezi dvěma pevnými body ve stejné výšce. */
function lano(rozpeti: number, delkaLana: number, dilu: number, EA: number, hmotnostNaMetr: number): Soustava {
  const popis: PopisSoustavy = { stycniky: [], prvky: [] };
  if (delkaLana > rozpeti * 1.0001) {
    // Výchozí tvar je kruhový oblouk se stejně dlouhými tětivami, takže žádný prvek není
    // na začátku napjatý; přesný tvar najde výpočet. Poloviční středový úhel oblouku φ
    // splňuje sin(φ)/sin(φ/dílů) = rozpětí/délka prvku.
    const prvek = delkaLana / dilu;
    let dolni = 1e-6;
    let horni = Math.PI / 2;
    for (let i = 0; i < 100; i++) {
      const fi = 0.5 * (dolni + horni);
      if (Math.sin(fi) / Math.sin(fi / dilu) > rozpeti / prvek) dolni = fi;
      else horni = fi;
    }
    const fi = 0.5 * (dolni + horni);
    const R = prvek / (2 * Math.sin(fi / dilu));
    for (let i = 0; i <= dilu; i++) {
      const uhel = -fi + (2 * fi * i) / dilu;
      popis.stycniky.push({ x: rozpeti / 2 + R * Math.sin(uhel), y: R * (Math.cos(fi) - Math.cos(uhel)) });
    }
  } else {
    for (let i = 0; i <= dilu; i++) popis.stycniky.push({ x: (rozpeti * i) / dilu, y: 0 });
  }
  popis.stycniky[0]!.pevneX = popis.stycniky[0]!.pevneY = true;
  popis.stycniky[dilu]!.pevneX = popis.stycniky[dilu]!.pevneY = true;
  for (let i = 0; i < dilu; i++) {
    popis.prvky.push({
      a: i,
      b: i + 1,
      druh: LANO,
      EA,
      EI: 0,
      GAs: Infinity,
      hmotnostNaMetr,
      polomerSetrvacnosti: 0,
      klidovaDelka: delkaLana / dilu,
    });
  }
  return sestavSoustavu(popis);
}

describe("lano", () => {
  it("volně zavěšené lano se ustálí do řetězovky", () => {
    const rozpeti = 40;
    const delka = 44;
    const dilu = 40;
    const mu = 20;
    // Ocelové lano o průřezu 25 cm²; protažení pod vlastní tíhou je nepatrné.
    const s = lano(rozpeti, delka, dilu, 160e9 * 25e-4, mu);
    // Povolené lano přímým výpočtem najít nejde, ustálí se časovou simulací se silným tlumením.
    const stupne = volneStupne(s);
    const dt = zvolKrok(nejvyssiFrekvence(s, stupne), 0);
    const nastaveni = { dt, tiha: TIHOVE_ZRYCHLENI, alfa: 3 };
    spoctiSily(s, TIHOVE_ZRYCHLENI, nastaveni.alfa);
    for (let i = 0; i < 12 / dt; i++) krok(s, nastaveni);

    // Parametr řetězovky a z délky lana: 2a·sinh(D/2a) = S.
    let dolni = 1;
    let horni = 1000;
    for (let i = 0; i < 100; i++) {
      const a = 0.5 * (dolni + horni);
      if (2 * a * Math.sinh(rozpeti / (2 * a)) > delka) dolni = a;
      else horni = a;
    }
    const a = 0.5 * (dolni + horni);
    const pruves = a * (Math.cosh(rozpeti / (2 * a)) - 1);
    expect(-s.y[dilu / 2]! / pruves).toBeGreaterThan(0.995);
    expect(-s.y[dilu / 2]! / pruves).toBeLessThan(1.005);
    // Tvar: y(x) = a·(cosh((x − D/2)/a) − cosh(D/2a)); styčníky jsou rozmístěné po délce lana.
    for (const i of [dilu / 8, dilu / 4, (3 * dilu) / 8]) {
      const naRetezovce = a * (Math.cosh((s.x[i]! - rozpeti / 2) / a) - Math.cosh(rozpeti / (2 * a)));
      expect(s.y[i]! / naRetezovce).toBeCloseTo(1, 2);
    }
    // Síla v laně ve vzdálenosti s od nejnižšího bodu (měřeno po laně) je μ·g·√(a² + s²):
    // uprostřed μ·g·a, u závěsu největší. Síla v prvku odpovídá jeho středu.
    const sila = (odStredu: number): number => mu * TIHOVE_ZRYCHLENI * Math.sqrt(a * a + odStredu * odStredu);
    const prvek = delka / dilu;
    expect(s.osovaSila[dilu / 2]! / sila(prvek / 2)).toBeCloseTo(1, 3);
    expect(s.osovaSila[0]! / sila(delka / 2 - prvek / 2)).toBeCloseTo(1, 3);
  });

  it("napjaté lano kmitá jako struna: f_n = n/(2L)·√(T/μ)", () => {
    const rozpeti = 30;
    const dilu = 30;
    const mu = 20;
    const EA = 160e9 * 25e-4;
    const sila = 500_000;
    // Předpětí: lano je kratší o T·L/EA.
    const s = lano(rozpeti, rozpeti / (1 + sila / EA), dilu, EA, mu);
    const stupne = volneStupne(s);
    const vnejsi = new Float64Array(stupne.length);
    expect(najdiRovnovahu(s, stupne, vnejsi, 0)).toBeGreaterThanOrEqual(0);
    expect(s.osovaSila[3]! / sila).toBeCloseTo(1, 6);
    const tvary = vlastniTvarySoustavy(s, stupne, 3)!;
    // Natažené lano je na metr o něco lehčí: jeho hmota se rozloží na větší délku.
    const muNapjate = mu / (1 + sila / EA);
    for (let n = 1; n <= 3; n++) {
      const struna = (n * Math.PI * Math.sqrt(sila / muNapjate)) / rozpeti;
      // Řetěz soustředěných hmot má frekvence nepatrně nižší: sin(x)/x pro x = nπ/(2·dílů).
      const x = (n * Math.PI) / (2 * dilu);
      expect(tvary.omega[n - 1]! / struna).toBeCloseTo(Math.sin(x) / x, 4);
      expect(tvary.omega[n - 1]! / struna).toBeGreaterThan(0.995);
    }
  });
});

describe("vzpěr", () => {
  /**
   * Najde půlením sílu, při které tečná matice tuhosti přestane být kladně definitní,
   * tedy konstrukce sama vybočí. `zatiz` vrací soustavu v rovnováze pod silou P, nebo null.
   */
  function kritickaSila(zatiz: (P: number) => Soustava | null, horniOdhad: number): number {
    let dolni = 0;
    let horni = horniOdhad;
    for (let i = 0; i < 30; i++) {
      const P = 0.5 * (dolni + horni);
      const s = zatiz(P);
      let stabilni = false;
      if (s) {
        const stupne = volneStupne(s);
        stabilni = choleskehoRozklad(sestavMaticiTuhosti(s, stupne), stupne.length);
      }
      if (stabilni) dolni = P;
      else horni = P;
    }
    return 0.5 * (dolni + horni);
  }

  function sloup(prurez: Prurez, vyska: number, dilu: number, P: number): Soustava | null {
    const popis: PopisSoustavy = { stycniky: [], prvky: [] };
    for (let i = 0; i <= dilu; i++) popis.stycniky.push({ x: 0, y: (vyska * i) / dilu });
    for (let i = 0; i < dilu; i++) popis.prvky.push({ ...prurez, a: i, b: i + 1 });
    popis.stycniky[0]!.pevneX = popis.stycniky[0]!.pevneY = true;
    popis.stycniky[dilu]!.pevneX = true;
    const s = sestavSoustavu(popis);
    const stupne = volneStupne(s);
    const vnejsi = new Float64Array(stupne.length);
    vnejsi[stupne.indexOf(3 * dilu + 1)] = -P;
    return najdiRovnovahu(s, stupne, vnejsi, 0) >= 0 ? s : null;
  }

  it("dělený kloubově uložený sloup vybočí při Eulerově síle", () => {
    const vyska = 8;
    const euler = (Math.PI ** 2 * HEB200_BEZ_SMYKU.EI) / vyska ** 2;
    const pomer = (dilu: number): number =>
      kritickaSila((sila) => sloup(HEB200_BEZ_SMYKU, vyska, dilu, sila), 2 * euler) / euler;
    // Prvek sám se pod tlakem neohýbá, vybočení se děje ve styčnících. Kritická síla proto
    // vychází o (π/n)²/12 vyšší, kde n je počet prvků na půlvlnu vybočení.
    for (const dilu of [4, 8, 16]) {
      const ocekavany = 1 + (Math.PI / dilu) ** 2 / 12;
      expect(pomer(dilu) / ocekavany).toBeGreaterThan(0.997);
      expect(pomer(dilu) / ocekavany).toBeLessThan(1.003);
    }
    expect(pomer(16)).toBeLessThan(1.005);
  });

  it("nedělený sloup sám nevybočí: proto se pruty skrytě dělí a vzpěr se navíc posuzuje", () => {
    const vyska = 8;
    const euler = (Math.PI ** 2 * HEB200_BEZ_SMYKU.EI) / vyska ** 2;
    // Jediný prvek s klouby na obou koncích nemá příčný stupeň volnosti, kterým by vybočil.
    const P = kritickaSila((sila) => sloup({ ...HEB200_BEZ_SMYKU, kloubA: true, kloubB: true }, vyska, 1, sila), 3 * euler);
    expect(P / euler).toBeGreaterThan(2.9);
  });

  it("smyková poddajnost kritickou sílu snižuje podle Engessera", () => {
    const vyska = 3;
    const euler = (Math.PI ** 2 * HEB200.EI) / vyska ** 2;
    const engesser = euler / (1 + euler / HEB200.GAs);
    const P = kritickaSila((sila) => sloup(HEB200, vyska, 12, sila), 2 * euler);
    expect(P / engesser).toBeGreaterThan(0.98);
    expect(P / engesser).toBeLessThan(1.02);
    expect(engesser / euler).toBeLessThan(0.95);
  });

  it("rám s kloubovými patkami vybočí stranou při síle z rovnice kh·tan(kh) = 6·I_b·h/(I_c·L_b)", () => {
    const h = 6;
    const sirka = 6;
    const dilu = 6;
    const EI = HEB200_BEZ_SMYKU.EI;
    const ram = (P: number): Soustava | null => {
      const popis: PopisSoustavy = { stycniky: [], prvky: [] };
      // Levý sloup zdola nahoru, příčel zleva doprava, pravý sloup shora dolů.
      for (let i = 0; i <= dilu; i++) popis.stycniky.push({ x: 0, y: (h * i) / dilu });
      for (let i = 1; i <= dilu; i++) popis.stycniky.push({ x: (sirka * i) / dilu, y: h });
      for (let i = 1; i <= dilu; i++) popis.stycniky.push({ x: sirka, y: h - (h * i) / dilu });
      const posledni = popis.stycniky.length - 1;
      for (let i = 0; i < posledni; i++) popis.prvky.push({ ...HEB200_BEZ_SMYKU, a: i, b: i + 1 });
      popis.stycniky[0]!.pevneX = popis.stycniky[0]!.pevneY = true;
      popis.stycniky[posledni]!.pevneX = popis.stycniky[posledni]!.pevneY = true;
      // Kloubové patky.
      popis.prvky[0]!.kloubA = true;
      popis.prvky[posledni - 1]!.kloubB = true;
      const s = sestavSoustavu(popis);
      const stupne = volneStupne(s);
      const vnejsi = new Float64Array(stupne.length);
      vnejsi[stupne.indexOf(3 * dilu + 1)] = -P;
      vnejsi[stupne.indexOf(3 * (2 * dilu) + 1)] = -P;
      return najdiRovnovahu(s, stupne, vnejsi, 0) >= 0 ? s : null;
    };
    // Kořen rovnice x·tan(x) = 6 (stejné průřezy, příčel stejně dlouhá jako sloup).
    let dolni = 0.1;
    let horni = Math.PI / 2 - 1e-9;
    for (let i = 0; i < 100; i++) {
      const x = 0.5 * (dolni + horni);
      if (x * Math.tan(x) < (6 * h) / sirka) dolni = x;
      else horni = x;
    }
    const kh = 0.5 * (dolni + horni);
    const ocekavana = (kh * kh * EI) / (h * h);
    const P = kritickaSila(ram, 2 * ocekavana);
    expect(P / ocekavana).toBeGreaterThan(0.99);
    expect(P / ocekavana).toBeLessThan(1.01);
    // Pro srovnání: sloup bez příčného posunu hlavy by unesl víc než čtyřnásobek.
    expect(ocekavana / ((Math.PI ** 2 * EI) / (h * h))).toBeLessThan(0.25);
  });

  it("v čase: sloup s nepatrnou křivostí pod 95 % Eulerovy síly stojí, nad 105 % vybočí", () => {
    const vyska = 8;
    const dilu = 8;
    const euler = (Math.PI ** 2 * HEB200_BEZ_SMYKU.EI) / vyska ** 2;
    const vyboceni = (podil: number): number => {
      const popis: PopisSoustavy = { stycniky: [], prvky: [] };
      // Počáteční křivost: sinusová vlna s amplitudou jedné tisíciny výšky.
      for (let i = 0; i <= dilu; i++) {
        popis.stycniky.push({ x: (vyska / 1000) * Math.sin((Math.PI * i) / dilu), y: (vyska * i) / dilu });
      }
      for (let i = 0; i < dilu; i++) popis.prvky.push({ ...HEB200_BEZ_SMYKU, a: i, b: i + 1 });
      popis.stycniky[0]!.pevneX = popis.stycniky[0]!.pevneY = true;
      popis.stycniky[dilu]!.pevneX = true;
      popis.stycniky[dilu]!.hmota = 2000;
      const s = sestavSoustavu(popis);
      const sim = new Simulace(s, {
        tiha: 0,
        utlum: 0.05,
        // Síla naroste během půl sekundy a pak se drží.
        zatizeni: {
          pridejSily: (soustava, cas) => {
            soustava.fy[dilu] = soustava.fy[dilu]! - Math.min(1, cas / 0.5) * podil * euler;
          },
        },
      });
      while (sim.cas < 3 && Math.abs(s.x[dilu / 2]!) < 1) sim.krok();
      return Math.abs(s.x[dilu / 2]!);
    };
    // Pod kritickou silou se křivost zvětší 1/(1 − P/P_E)krát: z 8 mm na 16 cm.
    expect(vyboceni(0.95)).toBeLessThan(0.25);
    expect(vyboceni(1.05)).toBeGreaterThan(1);
  });
});

describe("konvergence", () => {
  const L = 20;
  const P = 10_000;
  const v = 20;

  /** Největší průhyb středu při přejezdu síly. */
  function nejvetsiPruhyb(dilu: number, zkraceniKroku: number): number {
    const s = sestavSoustavu(nosnik(HEB200, L, dilu, "prosty"));
    const trasa = vytvorTrasu(
      s,
      Array.from({ length: s.pocetPrvku }, (_, e) => e),
    );
    const bremena = vytvorBremena(trasa, [{ x: 0, rychlost: v, tiha: P }]);
    const sim = new Simulace(s, { tiha: 0, utlum: 0.01, zatizeni: zatizeniBremeny(bremena), zkraceniKroku });
    let nejvetsi = 0;
    while (sim.cas < L / v) {
      sim.krok();
      nejvetsi = Math.max(nejvetsi, -s.y[dilu / 2]!);
    }
    return nejvetsi;
  }

  it("s jemnějším dělením prutů se výsledek ustaluje", () => {
    const hruby = nejvetsiPruhyb(4, 1);
    const stredni = nejvetsiPruhyb(8, 1);
    const jemny = nejvetsiPruhyb(16, 1);
    const nejjemnejsi = nejvetsiPruhyb(32, 1);
    expect(Math.abs(stredni - nejjemnejsi)).toBeLessThan(Math.abs(hruby - nejjemnejsi));
    expect(Math.abs(jemny - nejjemnejsi)).toBeLessThan(Math.abs(stredni - nejjemnejsi));
    // Už dělení po 2,5 m dává průhyb s chybou pod procento.
    expect(Math.abs(stredni / nejjemnejsi - 1)).toBeLessThan(0.01);
  });

  it("poloviční krok dá stejný výsledek", () => {
    const cely = nejvetsiPruhyb(8, 1);
    const polovicni = nejvetsiPruhyb(8, 0.5);
    expect(Math.abs(polovicni / cely - 1)).toBeLessThan(1e-4);
  });
});
