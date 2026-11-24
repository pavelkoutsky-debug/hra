// Kód mostu pro sdílení odkazem (`src/data/sdileni.ts`): most se z odkazu vrátí přesně takový,
// jaký do něj šel, a poškozený nebo zkrácený odkaz se odmítne, místo aby otevřel jiný most.
import { describe, expect, it } from "vitest";
import { ChybaDat } from "../src/data/kontrola";
import { nactiNavrh, navrhNaText, type NavrhMostu } from "../src/data/navrh";
import {
  kodMostuVTextu,
  mostBezVypnutych,
  NEJDELSI_KOD_MOSTU,
  odkazNaMost,
  rozkodujMost,
  stavVyzvyOdkazu,
  VERZE_KODU_MOSTU,
  zakodujMost,
} from "../src/data/sdileni";
import { vyrezObrazku } from "../src/vykres/obrazek";
import { Zkouska } from "../src/zkouska/zkouska";
import { nactiKampan, nasadaUrovne } from "../urovne/index";
import { MOSTY_UKAZEK, RESENI } from "../urovne/reseni";
import { MERITKA_SAMPIONU, sampionUrovne } from "../urovne/vyzvy";

const kampan = nactiKampan();

/** Všechny mosty, které hra zná: referenční, ty, co spadnout mají, další pro výzvy, šampioni a mosty ukázek. */
function znameMosty(): { nazev: string; navrh: NavrhMostu }[] {
  const mosty: { nazev: string; navrh: NavrhMostu }[] = [];
  for (const [id, reseni] of Object.entries(RESENI)) {
    mosty.push({ nazev: `${id} průchod`, navrh: reseni.pruchod }, { nazev: `${id} rozpočet`, navrh: reseni.rozpocet }, { nazev: `${id} mistrovská`, navrh: reseni.mistrovska });
    for (const pad of reseni.pady) mosty.push({ nazev: `${id} ${pad.nazev}`, navrh: pad.navrh });
    for (const dalsi of reseni.vyzvy ?? []) mosty.push({ nazev: `${id} ${dalsi.nazev}`, navrh: dalsi.navrh });
    for (const meritko of MERITKA_SAMPIONU) {
      const sampion = sampionUrovne(id, meritko);
      if (sampion) mosty.push({ nazev: `${id} šampion ${meritko}`, navrh: sampion });
    }
  }
  for (const [id, navrh] of Object.entries(MOSTY_UKAZEK)) mosty.push({ nazev: `ukázka ${id}`, navrh });
  return mosty;
}

/** Jednoduchý stálý generátor náhody pro pokusy s poškozeným kódem. */
function nahoda(nasada: number): () => number {
  let stav = nasada >>> 0;
  return () => {
    stav = (Math.imul(stav, 1664525) + 1013904223) >>> 0;
    return stav / 2 ** 32;
  };
}

describe("kód mostu", () => {
  const mosty = znameMosty();

  it("každý most, který hra zná, se z kódu vrátí stejný a kód se vejde do adresy", () => {
    expect(mosty.length).toBeGreaterThan(200);
    let nejdelsi = 0;
    for (const { nazev, navrh } of mosty) {
      const kod = zakodujMost(navrh);
      expect(kod, nazev).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(rozkodujMost(kod), nazev).toEqual(mostBezVypnutych(nactiNavrh(JSON.parse(navrhNaText(navrh)))));
      // Stejný most dá vždycky stejný kód.
      expect(zakodujMost(rozkodujMost(kod)), nazev).toBe(kod);
      nejdelsi = Math.max(nejdelsi, kod.length);
      // Kód je několikrát kratší než zápis JSON z Exportu.
      expect(kod.length, nazev).toBeLessThan(navrhNaText(navrh).length / 3);
    }
    // I největší most kampaně dá odkaz, který projde poštou a chatem bez zkrácení.
    expect(nejdelsi).toBeLessThan(1500);
    expect(nejdelsi).toBeLessThan(NEJDELSI_KOD_MOSTU);
  });

  it("čísla nese přesně: necelá, záporná, velká i zápornou nulu", () => {
    const zaklad = RESENI["4-03"]!.mistrovska;
    const lano = zaklad.pruty.find((p) => p.predpeti !== undefined)!;
    const most: NavrhMostu = {
      ...zaklad,
      stycniky: zaklad.stycniky.map((s, i) => (i === 1 ? { ...s, zavazi: 1234.5, tlumic: { hmota: 1e6 + 0.25, frekvence: 2.2000000000000006 } } : s)),
      pruty: zaklad.pruty.map((p) => (p.id === lano.id ? { ...p, predpeti: -0.049999999999999996, zdvih: -0, tuhost: 2 ** 41, tlumeni: 0.1 + 0.2 } : p)),
    };
    const zpet = rozkodujMost(zakodujMost(most));
    const prut = zpet.pruty.find((p) => p.id === lano.id)!;
    expect(prut.predpeti).toBe(-0.049999999999999996);
    expect(Object.is(prut.zdvih, -0)).toBe(true);
    expect(prut.tuhost).toBe(2 ** 41);
    expect(prut.tlumeni).toBe(0.30000000000000004);
    expect(zpet.stycniky[1]).toMatchObject({ zavazi: 1234.5, tlumic: { hmota: 1000000.25, frekvence: 2.2000000000000006 } });
  });

  it("zachová pořadí i čísla prutů a styčníků, i když po mazání nejdou po řadě", () => {
    const zaklad = RESENI["1-03"]!.pruchod;
    // Jako po mazání a kreslení v editoru: id nejdou po řadě a pruty jsou zapsané pozpátku.
    const most: NavrhMostu = {
      ...zaklad,
      stycniky: zaklad.stycniky.map((s) => ({ ...s, id: s.id * 3 + 7 })).reverse(),
      pruty: zaklad.pruty.map((p) => ({ ...p, id: p.id * 5 + 2, a: p.b * 3 + 7, b: p.a * 3 + 7 })).reverse(),
    };
    expect(rozkodujMost(zakodujMost(most))).toEqual(most);
    // Vypnutý přepínač je totéž co žádný.
    const sVypnutym: NavrhMostu = { ...zaklad, stycniky: zaklad.stycniky.map((s) => ({ ...s, svar: false, zamek: false })) };
    expect(rozkodujMost(zakodujMost(sVypnutym))).toEqual(zaklad);
  });

  it("most z kódu dopadne ve zkoušce bit po bitu stejně jako originál", () => {
    for (const id of ["1-03", "4-03", "5-03", "7-04"]) {
      const uroven = kampan.find((u) => u.id === id)!;
      const otisk = (navrh: NavrhMostu): string => {
        const zkouska = new Zkouska(uroven, navrh, nasadaUrovne(uroven));
        while (!zkouska.hotovo) zkouska.pokracuj(1);
        return zkouska.vysledek().otisk;
      };
      const original = RESENI[id]!.mistrovska;
      expect(otisk(rozkodujMost(zakodujMost(original))), id).toBe(otisk(original));
    }
  }, 120_000);

  it("zkrácený nebo poškozený kód odmítne s kódem chyby, nikdy neotevře jiný most", () => {
    const most = RESENI["3-02"]!.mistrovska;
    const kod = zakodujMost(most);
    const ocekavejPoskozeny = (text: string): void => {
      let chyba: unknown;
      try {
        rozkodujMost(text);
      } catch (e) {
        chyba = e;
      }
      expect(chyba, text.slice(0, 20)).toBeInstanceOf(ChybaDat);
      expect((chyba as ChybaDat).kod).toBe("odkaz-poskozeny");
    };
    // Zkrácení na každé délce (zalomený e-mail, limit zprávy).
    for (let delka = 0; delka < kod.length; delka++) ocekavejPoskozeny(kod.slice(0, delka));
    ocekavejPoskozeny(`${kod}A`);
    ocekavejPoskozeny(`${kod}AAAA`);
    ocekavejPoskozeny(`${kod.slice(0, 10)}%${kod.slice(11)}`);
    ocekavejPoskozeny("A".repeat(NEJDELSI_KOD_MOSTU + 1));
    // Záměna jednoho znaku: kontrolní součet ji skoro vždy chytí; co projde, musí být most
    // se správnou vnitřní stavbou (nikdy výjimka jiného druhu) a je toho mizivě málo.
    const los = nahoda(13);
    const abeceda = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let proslo = 0;
    const POKUSU = 3000;
    for (let i = 0; i < POKUSU; i++) {
      const misto = Math.floor(los() * kod.length);
      let znak = abeceda[Math.floor(los() * 64)]!;
      if (znak === kod[misto]) znak = znak === "A" ? "B" : "A";
      const zmeneny = kod.slice(0, misto) + znak + kod.slice(misto + 1);
      try {
        const navrh = rozkodujMost(zmeneny);
        expect(nactiNavrh(JSON.parse(navrhNaText(navrh)))).toEqual(navrh);
        proslo += 1;
      } catch (e) {
        expect(e).toBeInstanceOf(ChybaDat);
      }
    }
    expect(proslo).toBeLessThan(POKUSU / 1000);
  });

  it("náhodné bajty se správným součtem nikdy neshodí hru: buď most, nebo chyba dat", () => {
    // Kdo si kód vyrobí sám (nebo ho poškodí i se součtem), dostane nejvýš `ChybaDat`.
    const los = nahoda(7);
    const abeceda = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    for (let i = 0; i < 4000; i++) {
      const delka = 4 + Math.floor(los() * 60);
      let text = "";
      for (let j = 0; j < delka; j++) text += abeceda[Math.floor(los() * 64)]!;
      try {
        rozkodujMost(text);
      } catch (e) {
        expect(e, text).toBeInstanceOf(ChybaDat);
      }
    }
  });

  it("most z novější hry pozná a řekne to vlastním kódem chyby", () => {
    const most = RESENI["1-01"]!.pruchod;
    const kod = zakodujMost(most);
    expect(VERZE_KODU_MOSTU).toBe(1);
    // Most ve formátu návrhu, který tahle hra ještě nezná (kód ho nese zvlášť od své verze).
    let chyba: unknown;
    try {
      rozkodujMost(zakodujMost({ ...most, verze: 5 as unknown as NavrhMostu["verze"] }));
    } catch (e) {
      chyba = e;
    }
    expect(chyba).toBeInstanceOf(ChybaDat);
    expect((chyba as ChybaDat).kod).toBe("novejsi-verze");
    expect(rozkodujMost(kod).verze).toBe(most.verze);
  });
});

describe("odkaz na most", () => {
  const most = RESENI["2-03"]!.rozpocet;

  it("nese úroveň a kód a nic dalšího z adresy, ze které vznikl", () => {
    const odkaz = odkazNaMost("https://mostmistr.netlify.app/?uroven=2-03&jazyk=en&zaznam=vypnout#x", most);
    const adresa = new URL(odkaz);
    expect(adresa.origin + adresa.pathname).toBe("https://mostmistr.netlify.app/");
    expect([...adresa.searchParams.keys()]).toEqual(["uroven", "most"]);
    expect(adresa.searchParams.get("uroven")).toBe("2-03");
    expect(rozkodujMost(adresa.searchParams.get("most")!)).toEqual(most);
    expect(adresa.hash).toBe("");
    // Náhled pull requestu a hra ve složce fungují stejně.
    expect(odkazNaMost("https://deploy-preview-21--mostmistr.netlify.app/hra/index.html", most)).toMatch(
      /^https:\/\/deploy-preview-21--mostmistr\.netlify\.app\/hra\/index\.html\?uroven=2-03&most=[A-Za-z0-9_-]+$/,
    );
  });

  it("Import pozná celý odkaz, jeho konec i samotný kód; zápis JSON nechá být", () => {
    const kod = zakodujMost(most);
    const odkaz = odkazNaMost("https://mostmistr.netlify.app/", most);
    expect(kodMostuVTextu(odkaz)).toBe(kod);
    expect(kodMostuVTextu(`  ${odkaz}\n`)).toBe(kod);
    expect(kodMostuVTextu(`Mrkni na můj most: ${odkaz} (stál 417 932 Kč)`)).toBe(kod);
    expect(kodMostuVTextu(`?uroven=2-03&most=${kod}&jazyk=en`)).toBe(kod);
    expect(kodMostuVTextu(kod)).toBe(kod);
    expect(kodMostuVTextu(navrhNaText(most))).toBeNull();
    expect(kodMostuVTextu("")).toBeNull();
    expect(kodMostuVTextu("ahoj")).toBeNull();
  });
});

describe("výzva z odkazu", () => {
  it("vyhrává jen most ostře levnější, a to v korunách, jak je hráč vidí", () => {
    expect(stavVyzvyOdkazu(98_000, 98_985, true)).toEqual({ stav: "vyhra", rozdil: 985 });
    expect(stavVyzvyOdkazu(98_985, 98_985, true)).toEqual({ stav: "shoda", rozdil: 0 });
    expect(stavVyzvyOdkazu(99_500, 98_985, true)).toEqual({ stav: "prohra", rozdil: 515 });
    // Haléře nerozhodují: obě ceny se píšou jako 98 985 Kč.
    expect(stavVyzvyOdkazu(98_984.6, 98_985.4, true).stav).toBe("shoda");
    expect(stavVyzvyOdkazu(98_984.4, 98_985.4, true)).toEqual({ stav: "vyhra", rozdil: 1 });
  });

  it("most, který neprošel nebo se na něm něco porušilo, se nepočítá, i když je levnější", () => {
    expect(stavVyzvyOdkazu(50_000, 98_985, false)).toEqual({ stav: "nepocita", rozdil: 48_985 });
    expect(stavVyzvyOdkazu(120_000, 98_985, false).stav).toBe("nepocita");
  });
});

describe("obrázek výkresu ke sdílení", () => {
  it("výřez ukáže celý most s okrajem, kotvy i základy, a nevyjede z výkresu úrovně", () => {
    for (const uroven of kampan) {
      for (const navrh of [RESENI[uroven.id]!.pruchod, RESENI[uroven.id]!.mistrovska]) {
        const v = vyrezObrazku(uroven, navrh);
        for (const bod of [...navrh.stycniky, ...uroven.kotvy, ...uroven.zaklady]) {
          expect(bod.x, uroven.id).toBeGreaterThanOrEqual(v.xMin);
          expect(bod.x, uroven.id).toBeLessThanOrEqual(v.xMax);
          expect(bod.y, uroven.id).toBeGreaterThanOrEqual(v.yMin);
          expect(bod.y, uroven.id).toBeLessThanOrEqual(v.yMax);
        }
        expect(v.xMin, uroven.id).toBeGreaterThanOrEqual(uroven.vyrez.xMin);
        expect(v.xMax, uroven.id).toBeLessThanOrEqual(uroven.vyrez.xMax);
        expect(v.yMin, uroven.id).toBeGreaterThanOrEqual(uroven.vyrez.yMin);
        expect(v.yMax, uroven.id).toBeLessThanOrEqual(uroven.vyrez.yMax);
        expect(v.xMax - v.xMin, uroven.id).toBeGreaterThan(0);
        expect(v.yMax - v.yMin, uroven.id).toBeGreaterThan(0);
      }
    }
  });
});
