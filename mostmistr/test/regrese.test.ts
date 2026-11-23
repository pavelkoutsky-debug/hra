// Regresní sada: otisky referenčních mostů a doplňkové kontroly z kapitoly 7.10 koncepce.
//
// Otisky se zapisují příkazem `npm run otisky`. Kdykoli se některý změní, změnila se fyzika:
// zvyš `VERZE_FYZIKY`, zapiš do docs/STAV.md, co se změnilo, a otisky zapiš znovu.
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { NavrhMostu } from "../src/data/navrh";
import type { Uroven } from "../src/data/uroven";
import { VERZE_FYZIKY } from "../src/jadro/verze";
import ulozene from "../src/zkouska/regrese-otisky.json";
import {
  Kreslic,
  nahoda,
  Otisk,
  pripravScenar,
  SCENARE,
  SCENARE_ZKOUSEK,
  spustScenar,
  spustScenarZkousky,
  urovenRegrese,
  type Scenar,
  type ZadaniScenare,
} from "../src/zkouska/regrese";

const ZAPIS = process.env.MM_ZAPIS_OTISKU === "1";
const SOUBOR = new URL("../src/zkouska/regrese-otisky.json", import.meta.url).pathname;
const otisky: Record<string, string> = ulozene.otisky;

describe("otisky referenčních mostů", () => {
  const nove: Record<string, string> = {};

  it("sada má kolem dvaceti scénářů s jedinečnými jmény", () => {
    expect(SCENARE.length).toBeGreaterThanOrEqual(20);
    expect(new Set(SCENARE.map((s) => s.id)).size).toBe(SCENARE.length);
  });

  for (const scenar of SCENARE) {
    it(`${scenar.id}: otisk se nezměnil`, () => {
      const vysledek = spustScenar(scenar);
      expect(vysledek.rozpadla).toBe(false);
      // Zřícení je jen tam, kde být má.
      if (scenar.zriceni) expect(vysledek.poruseni).toBeGreaterThan(0);
      else expect(vysledek.poruseni).toBe(0);
      nove[scenar.id] = vysledek.otisk;
      if (!ZAPIS) expect(vysledek.otisk, "změnil se výsledek výpočtu: viz hlavička tohoto souboru").toBe(otisky[scenar.id]);
    }, 60_000);
  }

  for (const scenar of SCENARE_ZKOUSEK) {
    it(`${scenar.id}: otisk celé zkoušky se nezměnil`, () => {
      const vysledek = spustScenarZkousky(scenar);
      expect(vysledek.rozpadla).toBe(false);
      expect(vysledek.poruseni).toBe(0);
      expect(vysledek.kroku).toBeGreaterThan(1000);
      nove[scenar.id] = vysledek.otisk;
      if (!ZAPIS) expect(vysledek.otisk, "změnil se výsledek výpočtu: viz hlavička tohoto souboru").toBe(otisky[scenar.id]);
    }, 120_000);
  }

  it("uložené otisky patří k aktuální verzi fyziky a ke všem scénářům", () => {
    if (ZAPIS) {
      writeFileSync(SOUBOR, `${JSON.stringify({ verzeFyziky: VERZE_FYZIKY, otisky: nove }, null, 2)}\n`);
      return;
    }
    expect(ulozene.verzeFyziky).toBe(VERZE_FYZIKY);
    expect(Object.keys(otisky).sort()).toEqual([...SCENARE, ...SCENARE_ZKOUSEK].map((s) => s.id).sort());
  });
});

describe("otisk", () => {
  it("závisí na každém bitu každého čísla a na pořadí", () => {
    const otisk = (cisla: number[]): string => {
      const o = new Otisk();
      for (const c of cisla) o.pridej(c);
      return o.hodnota;
    };
    const zaklad = otisk([1, 2, 3]);
    expect(zaklad).toMatch(/^[0-9a-f]{16}$/);
    expect(otisk([1, 2, 3])).toBe(zaklad);
    expect(otisk([1, 2, 3 + 2 ** -51])).not.toBe(zaklad);
    expect(otisk([2, 1, 3])).not.toBe(zaklad);
    expect(otisk([1, 2])).not.toBe(zaklad);
    // Kladná a záporná nula jsou pro výpočet totéž.
    expect(otisk([0])).toBe(otisk([-0]));
  });

  it("stejný scénář dá při opakování stejný otisk", () => {
    const scenar = SCENARE.find((s) => s.id === "pretizeni-drevo")!;
    expect(spustScenar(scenar).otisk).toBe(spustScenar(scenar).otisk);
  });
});

/** Polohy styčníků mostu po doběhnutí scénáře. */
function konecnePolohy(zadani: ZadaniScenare, trvani: number): { x: Float64Array; y: Float64Array; pocet: number } {
  const { simulace, stavba } = pripravScenar(zadani);
  // Počet styčníků mostu před přidáním vozidel už ve stavbě není; vozidla jsou za nimi.
  const pocet = stavba.popis.stycniky.length - (zadani.vozy?.length ?? 0);
  while (simulace.cas < trvani && !simulace.rozpadla) simulace.krok();
  expect(simulace.rozpadla).toBe(false);
  expect(simulace.porusena).toBe(false);
  return { x: simulace.soustava.x.slice(0, pocet), y: simulace.soustava.y.slice(0, pocet), pocet };
}

/** Největší svislý posun styčníku proti nakreslené poloze, pro měřítko odchylek. */
function nejvetsiPruhyb(zadani: ZadaniScenare, y: Float64Array): number {
  const stavba = pripravScenar(zadani).stavba;
  let nejvetsi = 0;
  for (let i = 0; i < y.length; i++) nejvetsi = Math.max(nejvetsi, Math.abs(y[i]! - stavba.popis.stycniky[i]!.y));
  return nejvetsi;
}

const KLIDNE = ["prihrada-drevena", "prihrada-ocelova-svarena", "oblouk", "lavka-chodci", "pilir"];

describe("poloviční krok", () => {
  for (const id of KLIDNE) {
    it(`${id}: s polovičním krokem vyjde v toleranci totéž`, () => {
      const scenar = SCENARE.find((s) => s.id === id)!;
      const cely = konecnePolohy(scenar.zadani(), scenar.trvani);
      const zadani = scenar.zadani();
      const polovicni = konecnePolohy({ ...zadani, nastaveni: { ...zadani.nastaveni, zkraceniKroku: 0.5 } }, scenar.trvani);
      const meritko = nejvetsiPruhyb(scenar.zadani(), cely.y);
      let odchylka = 0;
      for (let i = 0; i < cely.pocet; i++) odchylka = Math.max(odchylka, Math.abs(cely.y[i]! - polovicni.y[i]!));
      // Průhyby jsou milimetry; odchylka mezi kroky má být zlomek procenta z nich.
      expect(meritko).toBeGreaterThan(1e-4);
      expect(odchylka / meritko).toBeLessThan(0.01);
    }, 60_000);
  }
});

/** Zrcadlový obraz zadání podle svislé osy uprostřed rozpětí. */
function zrcadlo(z: ZadaniScenare): ZadaniScenare {
  const trasa = z.uroven.trasy[0]!;
  const osa = trasa.zacatek.x + trasa.konec.x;
  const uroven: Uroven = {
    ...z.uroven,
    kotvy: z.uroven.kotvy.map((k) => ({ ...k, x: osa - k.x })),
    zaklady: z.uroven.zaklady.map((b) => ({ ...b, x: osa - b.x })),
  };
  const navrh: NavrhMostu = { ...z.navrh, stycniky: z.navrh.stycniky.map((s) => ({ ...s, x: osa - s.x })) };
  const zadani: ZadaniScenare = { ...z, uroven, navrh };
  if (z.vozy) zadani.vozy = z.vozy.map((v) => ({ ...v, x: osa - v.x, rychlost: -v.rychlost }));
  if (z.sily) zadani.sily = z.sily.map((s) => ({ ...s, x: osa - (s.x ?? 0), rychlost: -(s.rychlost ?? 0) }));
  return zadani;
}

describe("zrcadlově otočený most", () => {
  for (const id of [...KLIDNE, "zaveseny", "pruzne-ulozeni", "dav-na-lavce"]) {
    it(`${id}: dá zrcadlový výsledek`, () => {
      const scenar = SCENARE.find((s) => s.id === id)!;
      const zadani = scenar.zadani();
      const trasa = zadani.uroven.trasy[0]!;
      const osa = trasa.zacatek.x + trasa.konec.x;
      const prime = konecnePolohy(zadani, scenar.trvani);
      const zrcadlove = konecnePolohy(zrcadlo(scenar.zadani()), scenar.trvani);
      const meritko = nejvetsiPruhyb(scenar.zadani(), prime.y);
      let odchylka = 0;
      for (let i = 0; i < prime.pocet; i++) {
        odchylka = Math.max(odchylka, Math.abs(prime.y[i]! - zrcadlove.y[i]!), Math.abs(prime.x[i]! - (osa - zrcadlove.x[i]!)));
      }
      // Shoda není bitová. Výchozí rovnováha, vlastní tvary pro tlumení i nejvyšší frekvence
      // pro volbu kroku se hledají iteračně s konečnou přesností a zrcadlový most k nim dojde
      // jinou cestou; rozdíl je zlomek procenta největšího průhybu.
      expect(odchylka / meritko).toBeLessThan(5e-3);
    }, 60_000);
  }
});

describe("náhodně nakreslené mosty", () => {
  /** Náhodná konstrukce mezi břehy: styčníky na rastru, pruty mezi blízkými styčníky. */
  function nahodnyMost(nasada: number): ZadaniScenare {
    const nahodne = nahoda(nasada);
    const cele = (od: number, po: number): number => od + Math.floor(nahodne() * (po - od + 1));
    const rozpeti = 4 * cele(2, 5);
    const k = new Kreslic();
    for (let x = 0; x < rozpeti; x += 4) k.prut("mostovka-drevo", [x, 0], [x + 4, 0]);
    const body: [number, number][] = [];
    for (let x = 0; x <= rozpeti; x += 4) body.push([x, 0]);
    for (let i = 0; i < cele(2, 8); i++) body.push([cele(0, rozpeti), cele(-4, 5)]);
    const prvky = ["drevo-lehke", "drevo-tezke", "ocel-lehka", "ocel-tezka", "lano"] as const;
    for (let i = 0; i < cele(4, 16); i++) {
      const a = body[cele(0, body.length - 1)]!;
      const b = body[cele(0, body.length - 1)]!;
      const delka = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (delka < 1 || delka > 6) continue;
      const prvek = prvky[cele(0, prvky.length - 1)]!;
      k.prut(prvek, a, b, prvek === "lano" ? { predpeti: 0.1 * nahodne() } : {});
    }
    for (const st of k.stycniky) if (nahodne() < 0.4) st.svar = true;
    const vozy = [];
    for (let i = 0; i < cele(1, 3); i++) {
      vozy.push({ x: -1 - 3 * i, rychlost: 5 + 10 * nahodne(), hmota: 500 + 20000 * nahodne() });
    }
    // Náhodná konstrukce bývá mechanismus bez klidové polohy; začíná se z nakreslené.
    return { uroven: urovenRegrese({ rozpeti }), navrh: k.navrh(), vozy, bezRovnovahy: true };
  }

  it("ať se zřítí jakkoli, výpočet nevyrobí neplatná čísla ani nesmyslné rychlosti", () => {
    let zricenych = 0;
    // Sto padesát mostů: vzácné selhání (ráz tlumiče kola o utržený díl mostovky) se dřív
    // objevilo jednou ze tří set a čtyřicet mostů ho nezachytilo.
    for (let nasada = 1; nasada <= 150; nasada++) {
      const { simulace } = pripravScenar(nahodnyMost(nasada));
      const s = simulace.soustava;
      while (simulace.cas < 1.5 && !simulace.rozpadla) simulace.krok();
      expect(simulace.rozpadla, `násada ${nasada}`).toBe(false);
      for (let i = 0; i < s.pocetStycniku; i++) {
        expect(Number.isFinite(s.x[i]! + s.y[i]! + s.vx[i]! + s.vy[i]! + s.omega[i]!), `násada ${nasada}`).toBe(true);
      }
      if (simulace.porusena) zricenych++;
    }
    // Sada obsahuje mosty, které vydrží, i takové, které se rozpadnou.
    expect(zricenych).toBeGreaterThan(10);
    expect(zricenych).toBeLessThan(150);
  }, 120_000);
});

/** Scénáře použité v tomto souboru existují. */
it("pomocné seznamy odkazují na existující scénáře", () => {
  const zname = new Set(SCENARE.map((s: Scenar) => s.id));
  for (const id of [...KLIDNE, "zaveseny", "pruzne-ulozeni", "dav-na-lavce", "pretizeni-drevo"]) expect(zname.has(id), id).toBe(true);
});
