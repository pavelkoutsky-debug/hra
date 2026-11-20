import { describe, expect, it } from "vitest";
import { krok, spoctiSily } from "../src/jadro/integrator";
import { nejvyssiFrekvence } from "../src/jadro/matice";
import { spoctiVnitrniSily } from "../src/jadro/sily";
import { sestavSoustavu, type PopisPrvku, type PopisSoustavy, type Soustava } from "../src/jadro/soustava";
import { mezKroku } from "../src/jadro/stabilita";
import { volneStupne } from "../src/jadro/stupne";
import { momentNaKonciA } from "../src/jadro/zatizeni";
import { popisPrutu } from "../src/zkouska/stavba";

type Prut = Omit<PopisPrvku, "a" | "b">;
const OCEL: Prut = popisPrutu("ocel-lehka", 3);
const DREVO: Prut = popisPrutu("drevo-lehke", 3);
const Mp = OCEL.unosnost!.moment;
const Ny = OCEL.unosnost!.tah;

/** Prut s oběma konci drženými; deformace se vnucuje posunem a natočením konce b. */
function drzenyPrut(prut: Prut, L: number): Soustava {
  return sestavSoustavu({
    stycniky: [
      { x: 0, y: 0, pevneX: true, pevneY: true, pevneNatoceni: true },
      { x: L, y: 0, pevneX: true, pevneY: true, pevneNatoceni: true },
    ],
    prvky: [{ ...prut, a: 0, b: 1 }],
  });
}

describe("tah přes mez kluzu", () => {
  const L = 4;
  const tuhost = OCEL.EA / L;
  const protazeniNaKluzu = Ny / tuhost;
  const silaPo = (s: Soustava, protazeni: number): number => {
    s.x[1] = L + protazeni;
    spoctiVnitrniSily(s);
    return s.osovaSila[0]!;
  };

  it("pod mezí kluzu je prut pružný a nic trvalého nezůstane", () => {
    const s = drzenyPrut(OCEL, L);
    expect(silaPo(s, 0.9 * protazeniNaKluzu) / Ny).toBeCloseTo(0.9, 9);
    expect(s.plastDelka[0]).toBe(0);
    expect(silaPo(s, 0)).toBeCloseTo(0, 3);
  });

  it("nad mezí kluzu síla roste jen zpevněním a prut se trvale protáhne", () => {
    const s = drzenyPrut(OCEL, L);
    const sila = silaPo(s, 5 * protazeniNaKluzu);
    expect(sila).toBeGreaterThan(Ny);
    expect(sila).toBeLessThan(1.1 * Ny); // pružně by to bylo pětkrát víc
    expect(s.plastDelka[0]).toBeGreaterThan(3.9 * protazeniNaKluzu);
    // Síla leží na přímce zpevnění mezi mezí kluzu a pevností.
    const zpevneni = (OCEL.tvarny!.silaPretrzeni - Ny) / (OCEL.tvarny!.mezniProtazeni * L);
    expect(sila).toBeCloseTo(Ny + zpevneni * s.plastDelka[0]!, 0);
    // Po odlehčení zůstane trvalé protažení: síla klesne na nulu dřív, než se prut vrátí.
    expect(silaPo(s, s.plastDelka[0]!)).toBeCloseTo(0, 0);
    expect(s.plastickaPrace).toBeGreaterThan(0);
  });

  it("při mezním protažení dosáhne síla pevnosti v tahu", () => {
    const s = drzenyPrut(OCEL, L);
    const mezni = OCEL.tvarny!.mezniProtazeni * L;
    // Postupně, jako ve skutečné zkoušce; plastické protažení se sčítá krok po kroku.
    let sila = 0;
    for (let i = 1; i <= 400; i++) sila = silaPo(s, (i / 400) * (mezni + 1.3 * protazeniNaKluzu));
    expect(s.plastDelka[0]! / mezni).toBeCloseTo(1, 2);
    expect(sila / OCEL.tvarny!.silaPretrzeni).toBeCloseTo(1, 2);
  });

  it("dřevo se plasticky nedeformuje ani nad svou únosností", () => {
    const s = drzenyPrut(DREVO, L);
    const sila = silaPo(s, (2 * DREVO.unosnost!.tah) / (DREVO.EA / L));
    expect(sila / DREVO.unosnost!.tah).toBeCloseTo(2, 9);
    expect(s.plastDelka[0]).toBe(0);
  });
});

describe("plastický kloub", () => {
  const L = 4;
  const KROKU = 400;

  /**
   * Postupně natočí konec b o `uhel` a posune ho napříč o `posun`. Plastická deformace
   * závisí na cestě, proto se deformace vnucuje po malých krocích jako v simulaci.
   */
  function zdeformuj(s: Soustava, uhel: number, posun: number): void {
    // Při posunu napříč se konec zároveň přitáhne, aby se délka spojnice neměnila;
    // jinak by se prut natahoval jako lano a tah by ohyb zastínil.
    const delka = s.x[1]!;
    for (let i = 1; i <= KROKU; i++) {
      const podil = i / KROKU;
      s.cosN[1] = Math.cos(uhel * podil);
      s.sinN[1] = Math.sin(uhel * podil);
      s.y[1] = posun * podil;
      s.x[1] = Math.sqrt(delka * delka - s.y[1]! * s.y[1]!);
      spoctiVnitrniSily(s);
    }
  }

  it("natočení jednoho konce: kloub vznikne tam a druhý konec zůstane pružný", () => {
    const s = drzenyPrut(OCEL, L);
    // Pružně by natočení 0,2 rad dalo na konci b moment mnohonásobně nad únosností.
    expect(s.kBB[0]! * Math.sin(0.2)).toBeGreaterThan(5 * Mp);
    zdeformuj(s, 0.2, 0);
    expect(Math.abs(s.momentB[0]!) / Mp).toBeCloseTo(1, 9);
    expect(Math.abs(s.plastB[0]!)).toBeGreaterThan(0.15);
    // Do vetknutí a se přenese jen část momentu: (2 − Φ)/(4 + Φ), bez smyku polovina.
    const prenos = (2 - s.fi[0]!) / (4 + s.fi[0]!);
    expect(Math.abs(momentNaKonciA(s, 0)) / Mp).toBeCloseTo(prenos, 6);
    expect(s.plastA[0]).toBe(0);
  });

  it("příčný posun konce: klouby vzniknou na obou koncích", () => {
    const s = drzenyPrut(OCEL, L);
    zdeformuj(s, 0, 0.3);
    expect(Math.abs(momentNaKonciA(s, 0)) / Mp).toBeCloseTo(1, 6);
    expect(Math.abs(s.momentB[0]!) / Mp).toBeCloseTo(1, 6);
    expect(Math.abs(s.plastA[0]!)).toBeGreaterThan(0.03);
    expect(Math.abs(s.plastB[0]!)).toBeGreaterThan(0.03);
  });

  it("po odlehčení zůstane trvalé natočení", () => {
    const s = drzenyPrut(OCEL, L);
    zdeformuj(s, 0.2, 0);
    const trvale = Math.abs(s.plastB[0]!);
    const prace = s.plastickaPrace;
    expect(prace).toBeGreaterThan(Mp * 0.15);
    // Malé vrácení zpět je pružné: moment klesne, trvalé natočení se nemění.
    s.cosN[1] = Math.cos(0.199);
    s.sinN[1] = Math.sin(0.199);
    spoctiVnitrniSily(s);
    expect(Math.abs(s.momentB[0]!)).toBeLessThan(Mp);
    expect(Math.abs(s.plastB[0]!)).toBe(trvale);
    expect(s.plastickaPrace).toBe(prace);
  });

  it("osová síla plastickou únosnost v ohybu snižuje", () => {
    const s = drzenyPrut(OCEL, L);
    s.x[1] = L + (0.5 * Ny) / (OCEL.EA / L); // tah na polovině meze kluzu
    zdeformuj(s, 0, 0.3);
    expect(s.osovaSila[0]! / Ny).toBeCloseTo(0.5, 6);
    expect(Math.abs(s.momentB[0]!) / Mp).toBeCloseTo(0.5, 6);
    expect(Math.abs(momentNaKonciA(s, 0)) / Mp).toBeCloseTo(0.5, 6);
  });

  it("dřevěný prut zůstává pružný", () => {
    const s = drzenyPrut(DREVO, L);
    zdeformuj(s, 0.2, 0);
    expect(Math.abs(s.momentB[0]!)).toBeGreaterThan(3 * DREVO.unosnost!.moment);
    expect(s.plastA[0]).toBe(0);
    expect(s.plastB[0]).toBe(0);
  });
});

describe("mezní zatížení vetknutého nosníku", () => {
  // Nosník 8 m vetknutý na obou koncích pod rovnoměrným zatížením. První plastické klouby
  // vzniknou ve vetknutích při w = 12·M_p/L²; díky přerozdělení momentů nosník unese
  // 16·M_p/L², o třetinu víc. Teprve pak vznikne třetí kloub uprostřed a nosník se zhroutí.
  const L = 8;
  const DILU = 8;
  const mezni = (16 * Mp) / (L * L);

  function nosnik(): PopisSoustavy {
    const popis: PopisSoustavy = { stycniky: [], prvky: [] };
    for (let i = 0; i <= DILU; i++) popis.stycniky.push({ x: (L * i) / DILU, y: 0 });
    for (let i = 0; i < DILU; i++) popis.prvky.push({ ...OCEL, a: i, b: i + 1 });
    Object.assign(popis.stycniky[0]!, { pevneX: true, pevneY: true, pevneNatoceni: true });
    // Pravý konec se smí posouvat vodorovně, aby nosník nenesl zatížení tahem jako lano.
    Object.assign(popis.stycniky[DILU]!, { pevneY: true, pevneNatoceni: true });
    return popis;
  }

  /** Pomalu zatíží nosník na `podil` mezního zatížení, podrží a vrátí stav. */
  function zatiz(podil: number): { s: Soustava; pruhyb: number; rychlost: number } {
    const s = sestavSoustavu(nosnik());
    const dt = 0.8 * mezKroku(nejvyssiFrekvence(s, volneStupne(s)));
    const dilek = L / DILU;
    const nabeh = 0.6;
    let cas = 0;
    const nastaveni = {
      dt,
      tiha: 0,
      // Silné tlumení úměrné hmotě: zatěžování je pomalé, kmitání nás tu nezajímá.
      alfa: 150,
      dalsiSily: (soustava: Soustava) => {
        const w = podil * mezni * Math.min(1, cas / nabeh);
        for (let i = 1; i < DILU; i++) soustava.fy[i] = soustava.fy[i]! - w * dilek;
      },
    };
    spoctiSily(s, 0, 0);
    const kroku = Math.round(1.2 / dt);
    for (let i = 0; i < kroku; i++) {
      cas = (i + 1) * dt;
      krok(s, nastaveni);
    }
    return { s, pruhyb: -s.y[DILU / 2]!, rychlost: Math.abs(s.vy[DILU / 2]!) };
  }

  it("při 95 % mezního zatížení stojí, i když ve vetknutích už vznikly plastické klouby", () => {
    const { s, pruhyb, rychlost } = zatiz(0.95);
    // Zatížení je o čtvrtinu nad tím, při kterém vetknutí zplastizují (12 ze 16).
    expect(Math.abs(s.plastA[0]!)).toBeGreaterThan(1e-4);
    expect(Math.abs(s.plastB[DILU - 1]!)).toBeGreaterThan(1e-4);
    expect(pruhyb).toBeGreaterThan(0.05);
    expect(pruhyb).toBeLessThan(0.25);
    expect(rychlost).toBeLessThan(0.01);
    // Uprostřed kloub zatím není.
    expect(Math.abs(s.plastB[DILU / 2 - 1]!) + Math.abs(s.plastA[DILU / 2]!)).toBeLessThan(1e-9);
  });

  it("při 105 % mezního zatížení se hroutí", () => {
    const { s, pruhyb, rychlost } = zatiz(1.05);
    // Silné tlumení pád zpomaluje, ale nosník už nezastaví: uprostřed vznikl třetí kloub
    // a průhyb dál roste.
    expect(Math.abs(s.plastB[DILU / 2 - 1]!) + Math.abs(s.plastA[DILU / 2]!)).toBeGreaterThan(0.02);
    expect(pruhyb).toBeGreaterThan(0.3);
    expect(rychlost).toBeGreaterThan(0.2);
  });

  it("pod zatížením prvního zplastizování zůstává pružný", () => {
    const { s, pruhyb } = zatiz(0.7); // 11,2 z 12
    for (let e = 0; e < DILU; e++) {
      expect(s.plastA[e]).toBe(0);
      expect(s.plastB[e]).toBe(0);
    }
    // Pružný průhyb vetknutého nosníku: w·L⁴/(384·EI), se smykem o něco víc.
    const w = 0.7 * mezni;
    const pruzny = (w * L ** 4) / (384 * OCEL.EI);
    expect(pruhyb / pruzny).toBeGreaterThan(1);
    expect(pruhyb / pruzny).toBeLessThan(1.2);
  });
});
