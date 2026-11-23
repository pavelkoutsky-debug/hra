// Klidné úseky zkoušky (`klidneUseky` v `src/hra/rezie.ts`): přehrávání je samo zrychlí, takže
// se nesmějí překrývat s ničím, co stojí za vidění.
import { describe, expect, it } from "vitest";
import type { NavrhMostu } from "../src/data/navrh";
import type { Uroven } from "../src/data/uroven";
import { HLUCHO, klidneUseky, klidnyUsek, type KlidnyUsek } from "../src/hra/rezie";
import { VERZE_FYZIKY } from "../src/jadro/verze";
import { BehZkousky } from "../src/zkouska/beh";
import type { ZpravaZeZkousky } from "../src/zkouska/protokol";
import { JEDE } from "../src/zkouska/provoz";
import { Zaznam } from "../src/zkouska/zaznam";
import { nactiKampan, nasadaUrovne } from "../urovne/index";
import { RESENI } from "../urovne/reseni";

const kampan = nactiKampan();
const uroven = (id: string): Uroven => kampan.find((u) => u.id === id)!;

function zaznamZkousky(u: Uroven, navrh: NavrhMostu): Zaznam {
  const zpravy: ZpravaZeZkousky[] = [];
  const beh = new BehZkousky((zprava) => zpravy.push(zprava));
  beh.prijmi({ typ: "start", vstup: { uroven: u, navrh, nasada: nasadaUrovne(u), verzeFyziky: VERZE_FYZIKY } });
  let pojistka = 0;
  while (beh.pokracuj(1)) expect(pojistka++).toBeLessThan(600);
  const zaznam = new Zaznam();
  for (const zprava of zpravy) {
    if (zprava.typ !== "zaznam") continue;
    zprava.topologie.forEach((t) => zaznam.pridejTopologii(t));
    zprava.snimky.forEach((s) => zaznam.pridej(s));
  }
  return zaznam;
}

/** Jak dlouho trvá přehrání děje dlouhého `trvani` s danými úseky při zvolené rychlosti 1×, s. */
function dobaPrehrani(useky: readonly KlidnyUsek[], trvani: number): number {
  return useky.reduce((doba, u) => doba - (u.po - u.od) * (1 - 1 / u.rychlost), trvani);
}

/** Ověří, že v žádném zrychleném úseku není nic, co stojí za vidění. */
function overUseky(zaznam: Zaznam, useky: readonly KlidnyUsek[], kmitani: number): void {
  for (const usek of useky) {
    expect(usek.po - usek.od).toBeGreaterThanOrEqual(HLUCHO.nejkratsi);
    expect([HLUCHO.rychlost, HLUCHO.rychlostKlidu]).toContain(usek.rychlost);
    for (const s of zaznam.snimky) {
      if (s.cas < usek.od || s.cas > usek.po) continue;
      expect(s.kmitani, `kmitání v čase ${s.cas}`).toBeLessThan(kmitani);
      expect(Math.max(...Array.from(s.vyuziti, Math.abs), 0), `využití v čase ${s.cas}`).toBeLessThan(HLUCHO.vyuziti);
      if (usek.rychlost === HLUCHO.rychlost) {
        expect(Array.from(s.provoz).includes(JEDE), `v čase ${s.cas} někdo jede`).toBe(false);
        expect(s.kmitani).toBeLessThan(HLUCHO.kmitani);
      }
    }
  }
}

describe("klidné úseky zkoušky", () => {
  it("zvedací most (7-01): čekání na autobus je prázdno; zvedání, loď a sklápění se nezrychlují", () => {
    const u = uroven("7-01");
    const zaznam = zaznamZkousky(u, RESENI["7-01"]!.pruchod);
    const rusno = u.lode.map((lod) => [lod.cas - 1, lod.cas + lod.trvani + 1] as const);
    const useky = klidneUseky(zaznam, { rusno });
    overUseky(zaznam, useky, Infinity);
    // Most se sklopí kolem 21. sekundy a autobus vyjíždí ve 27.: mezi tím se jen čeká.
    const prazdno = useky.filter((x) => x.rychlost === HLUCHO.rychlost);
    expect(prazdno.length).toBeGreaterThanOrEqual(1);
    const cekani = prazdno.find((x) => x.od > 20 && x.po < 27)!;
    expect(cekani).toBeDefined();
    expect(cekani.po).toBeLessThanOrEqual(27 - HLUCHO.predstih + 0.1);
    for (const usek of useky) {
      for (const [zacatek, konec] of rusno) expect(usek.po <= zacatek || usek.od >= konec, `úsek ${usek.od}–${usek.po} se kryje s lodí`).toBe(true);
    }
    // Ve chvíli, kdy se křídlo zvedá nebo sklápí, se nezrychluje; uprostřed čekání ano.
    expect(klidnyUsek(useky, u.pohyb!.zvednout + 1.5)).toBeNull();
    expect(klidnyUsek(useky, u.pohyb!.sklopit + 1.5)).toBeNull();
    expect(klidnyUsek(useky, (cekani.od + cekani.po) / 2)).toEqual(cekani);
  }, 120_000);

  it("přehlídka (2-04) a dav (5-01): zrychlí se jen to, kde je most daleko od meze kmitání", () => {
    // 2-04, most s tlumiči: kmitá do 1,0 m/s² (mez 2,5, bonus 1,2). Klid je pod polovinou bonusu.
    const prehlidka = zaznamZkousky(uroven("2-04"), RESENI["2-04"]!.mistrovska);
    const useky = klidneUseky(prehlidka, { kmitani: 0.6 });
    overUseky(prehlidka, useky, 0.6);
    const trvani = prehlidka.snimky.at(-1)!.cas;
    expect(useky.length).toBeGreaterThan(0);
    expect(useky.every((x) => x.rychlost === HLUCHO.rychlostKlidu)).toBe(true);
    // Přehrání se zkrátí, ale chvíle, kdy most kmitá nejvíc, zůstávají ve zvolené rychlosti.
    expect(dobaPrehrani(useky, trvani)).toBeLessThan(0.9 * trvani);
    const nejvic = prehlidka.snimky.reduce((a, b) => (b.kmitani > a.kmitani ? b : a));
    expect(klidnyUsek(useky, nejvic.cas)).toBeNull();
    // Nízká lávka bez tlumičů kmitá skoro pořád nad polovinou meze: zrychlí se o dost míň.
    const nizka = zaznamZkousky(uroven("2-04"), RESENI["2-04"]!.pady.find((p) => p.nazev.includes("bez tlumičů"))!.navrh);
    const usekyNizke = klidneUseky(nizka, { kmitani: 0.6 });
    overUseky(nizka, usekyNizke, 0.6);
    const zrychleno = (x: readonly KlidnyUsek[]): number => x.reduce((soucet, y) => soucet + y.po - y.od, 0);
    expect(zrychleno(usekyNizke)).toBeLessThan(zrychleno(useky));
    // 5-01: dav jde mostem přes minutu a klidný most se sotva hne.
    const dav = zaznamZkousky(uroven("5-01"), RESENI["5-01"]!.mistrovska);
    const usekyDavu = klidneUseky(dav, { kmitani: 0.125 });
    overUseky(dav, usekyDavu, 0.125);
    expect(klidneUseky(new Zaznam())).toEqual([]);
  }, 240_000);

  it("krátká zkouška se má vidět celá: s volbou jenPrazdno se klid se lidmi na mostě nezrychluje", () => {
    // 1-01: lidé jdou po lávce celou zkoušku a most je daleko od mezí, takže by byla zrychlená celá.
    const u = uroven("1-01");
    const zaznam = zaznamZkousky(u, RESENI["1-01"]!.pruchod);
    const trvani = zaznam.snimky.at(-1)!.cas;
    expect(trvani).toBeLessThan(HLUCHO.dlouha);
    expect(klidneUseky(zaznam, { kmitani: 1.25 }).some((x) => x.rychlost === HLUCHO.rychlostKlidu)).toBe(true);
    expect(klidneUseky(zaznam, { kmitani: 1.25, jenPrazdno: true })).toEqual([]);
    // Čekání na prázdném mostě se zrychlí i s touhle volbou (zvedací most 7-01).
    const most = uroven("7-01");
    const zvedaci = zaznamZkousky(most, RESENI["7-01"]!.pruchod);
    const rusno = most.lode.map((lod) => [lod.cas - 1, lod.cas + lod.trvani + 1] as const);
    const useky = klidneUseky(zvedaci, { rusno, jenPrazdno: true });
    expect(useky.length).toBeGreaterThanOrEqual(1);
    expect(useky.every((x) => x.rychlost === HLUCHO.rychlost)).toBe(true);
  }, 120_000);
});
