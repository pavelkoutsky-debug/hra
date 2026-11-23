// Klidné úseky zkoušky (`klidneUseky` a `klidneUsekyZkousky` v `src/hra/rezie.ts`): přehrávání
// je samo zrychlí, takže se nesmějí překrývat s ničím, co stojí za vidění. Zkouší se úseky
// složené stejně, jako je skládá hra, a proti událostem, výsledku a jízdnímu řádu zkoušky.
import { describe, expect, it } from "vitest";
import type { NavrhMostu } from "../src/data/navrh";
import type { Uroven } from "../src/data/uroven";
import { HLUCHO, klidneUseky, klidneUsekyZkousky, klidnyUsek, prahKmitaniKlidu, type KlidnyUsek } from "../src/hra/rezie";
import { MEZE_KOMFORTU } from "../src/jadro/komfort";
import { VERZE_FYZIKY } from "../src/jadro/verze";
import { BehZkousky } from "../src/zkouska/beh";
import type { Udalost, VysledekZkousky, ZpravaZeZkousky } from "../src/zkouska/protokol";
import { JEDE, lideNaMosteVeSnimku, type PopisUcastnika } from "../src/zkouska/provoz";
import { Zaznam, type Snimek } from "../src/zkouska/zaznam";
import { nactiKampan, nasadaUrovne } from "../urovne/index";
import { RESENI } from "../urovne/reseni";

const kampan = nactiKampan();
const uroven = (id: string): Uroven => kampan.find((u) => u.id === id)!;

/** Zkouška tak, jak ji vidí obrazovka úrovně: záznam, účastníci, události a výsledek. */
interface Prubeh {
  uroven: Uroven;
  zaznam: Zaznam;
  ucastnici: PopisUcastnika[];
  udalosti: Udalost[];
  vysledek: VysledekZkousky;
  trvani: number;
}

function prubehZkousky(u: Uroven, navrh: NavrhMostu): Prubeh {
  const zpravy: ZpravaZeZkousky[] = [];
  const beh = new BehZkousky((zprava) => zpravy.push(zprava));
  beh.prijmi({ typ: "start", vstup: { uroven: u, navrh, nasada: nasadaUrovne(u), verzeFyziky: VERZE_FYZIKY } });
  let pojistka = 0;
  while (beh.pokracuj(1)) expect(pojistka++).toBeLessThan(600);
  const zaznam = new Zaznam();
  const udalosti: Udalost[] = [];
  let ucastnici: PopisUcastnika[] = [];
  let vysledek: VysledekZkousky | null = null;
  for (const zprava of zpravy) {
    if (zprava.typ === "zacatek") ucastnici = zprava.ucastnici;
    if (zprava.typ === "konec") vysledek = zprava.vysledek;
    if (zprava.typ !== "zaznam") continue;
    zprava.topologie.forEach((t) => zaznam.pridejTopologii(t));
    zprava.snimky.forEach((s) => zaznam.pridej(s));
    udalosti.push(...zprava.udalosti);
  }
  expect(vysledek).not.toBeNull();
  return { uroven: u, zaznam, ucastnici, udalosti, vysledek: vysledek!, trvani: zaznam.snimky.at(-1)?.cas ?? 0 };
}

const pocitaSe = (p: Prubeh, s: Snimek): boolean => lideNaMosteVeSnimku(p.uroven, p.ucastnici, s.provoz, s.polohy);

/**
 * Klidné úseky přesně tak, jak je skládá hra (`klidneUsekyBehu` v `src/hra/uroven.ts`).
 * S `dlouha` se i kratší zkouška posoudí jako dlouhá: tak se dá zkoušet, co by stupeň „klid“
 * udělal s brzděním nebo pádem, kdyby zkouška trvala déle (pískoviště takové zkoušky má).
 */
function usekyHry(p: Prubeh, dlouha?: number): KlidnyUsek[] {
  return klidneUsekyZkousky(p.zaznam, {
    mez: MEZE_KOMFORTU[p.uroven.nejhorsiKomfort - 1]!,
    budic: false,
    lode: p.uroven.lode,
    ucastnici: p.ucastnici,
    udalosti: p.udalosti,
    pocitaSe: (s) => pocitaSe(p, s),
    ...(dlouha === undefined ? {} : { dlouha }),
  });
}

/** Jak dlouho trvá přehrání děje dlouhého `trvani` s danými úseky při zvolené rychlosti 1×, s. */
function dobaPrehrani(useky: readonly KlidnyUsek[], trvani: number): number {
  return useky.reduce((doba, u) => doba - (u.po - u.od) * (1 - 1 / u.rychlost), trvani);
}

const vUseku = (useky: readonly KlidnyUsek[], cas: number): boolean => useky.some((u) => cas >= u.od && cas <= u.po);

/** Ověří, že v žádném zrychleném úseku není nic, co stojí za vidění. */
function overUseky(p: Prubeh, useky: readonly KlidnyUsek[]): void {
  const mez = MEZE_KOMFORTU[p.uroven.nejhorsiKomfort - 1]!;
  const popis = `${p.uroven.id}`;
  for (const usek of useky) {
    expect(usek.po - usek.od).toBeGreaterThanOrEqual(usek.rychlost === HLUCHO.rychlost ? HLUCHO.nejkratsi : HLUCHO.nejkratsiKlid);
    expect([HLUCHO.rychlost, HLUCHO.rychlostKlidu]).toContain(usek.rychlost);
    for (const s of p.zaznam.snimky) {
      if (s.cas < usek.od || s.cas > usek.po) continue;
      // Kmitání ve zrychleném úseku nikdy nedosáhne meze úrovně, ať je špička jakákoli.
      expect(s.kmitani, `${popis}: kmitání v čase ${s.cas}`).toBeLessThan(HLUCHO.stropMeze * mez + 1e-9);
      expect(Math.max(...Array.from(s.vyuziti, Math.abs), 0), `${popis}: využití v čase ${s.cas}`).toBeLessThan(HLUCHO.vyuziti);
      if (usek.rychlost === HLUCHO.rychlost) {
        expect(Array.from(s.provoz).includes(JEDE), `${popis}: v čase ${s.cas} někdo jede`).toBe(false);
        expect(s.kmitani).toBeLessThan(HLUCHO.kmitani * HLUCHO.drzeniPrazdna);
      }
    }
  }
  // Žádná nehoda (porušení, pád, sjetí, překlopení, náraz) a nic po první z nich.
  const nehody = p.udalosti.filter(
    (u) => u.druh === "poruseni" || u.druh === "sjeti" || u.druh === "pad" || (u.druh === "pohyb" && u.faze === "preklopeno") || (u.druh === "lod" && u.stav === "narazila"),
  );
  const prvni = Math.min(...nehody.map((u) => u.cas), Infinity);
  for (const usek of useky) expect(usek.po, `${popis}: úsek ${usek.od}–${usek.po} sahá za první událost v ${prvni}`).toBeLessThanOrEqual(prvni);
  // Chvíle, kdy kmitání poprvé přesáhlo mez úrovně, a chvíle, kdy kmital most nejvíc.
  const komfort = p.vysledek.komfort;
  if (komfort?.prekroceno !== null && komfort?.prekroceno !== undefined) {
    expect(vUseku(useky, komfort.prekroceno), `${popis}: překročení meze v ${komfort.prekroceno}`).toBe(false);
  }
  if (komfort && komfort.zrychleni >= HLUCHO.kmitani) expect(vUseku(useky, komfort.cas), `${popis}: největší kmitání v ${komfort.cas}`).toBe(false);
  // Brzdění vozidla na mostě.
  for (const u of p.ucastnici) {
    if (!u.brzdeni) continue;
    for (const usek of useky) {
      expect(usek.po <= u.brzdeni.od || usek.od >= u.brzdeni.rozjezd, `${popis}: úsek ${usek.od}–${usek.po} se kryje s brzděním`).toBe(true);
    }
  }
  // Lodě.
  for (const lod of p.uroven.lode) {
    for (const usek of useky) expect(usek.po <= lod.cas || usek.od >= lod.cas + lod.trvani, `${popis}: úsek se kryje s lodí`).toBe(true);
  }
}

describe("klidné úseky zkoušky", () => {
  it("zvedací most (7-01): čekání na autobus je prázdno; zvedání, loď a sklápění se nezrychlují", () => {
    const u = uroven("7-01");
    const p = prubehZkousky(u, RESENI["7-01"]!.pruchod);
    const useky = usekyHry(p);
    overUseky(p, useky);
    // Most se sklopí kolem 21. sekundy a autobus vyjíždí ve 27.: mezi tím se jen čeká.
    const prazdno = useky.filter((x) => x.rychlost === HLUCHO.rychlost);
    expect(prazdno.length).toBeGreaterThanOrEqual(1);
    const cekani = prazdno.find((x) => x.od > 20 && x.po < 27)!;
    expect(cekani).toBeDefined();
    expect(cekani.po).toBeLessThanOrEqual(27 - HLUCHO.predstih + 0.1);
    // Ve chvíli, kdy se křídlo zvedá nebo sklápí, se nezrychluje; uprostřed čekání ano.
    expect(klidnyUsek(useky, u.pohyb!.zvednout + 1.5)).toBeNull();
    expect(klidnyUsek(useky, u.pohyb!.sklopit + 1.5)).toBeNull();
    expect(klidnyUsek(useky, (cekani.od + cekani.po) / 2)).toEqual(cekani);
  }, 120_000);

  it("přehlídka (2-04) a dav (5-01): přehrání se zkrátí, chvíle největšího kmitání zůstanou ve zvolené rychlosti", () => {
    for (const [id, nejvys] of [
      ["2-04", 0.6],
      ["5-01", 0.75],
    ] as const) {
      const p = prubehZkousky(uroven(id), RESENI[id]!.pruchod);
      const useky = usekyHry(p);
      overUseky(p, useky);
      expect(useky.length, id).toBeGreaterThan(0);
      // Pár dlouhých úseků, ne přepínání rychlosti každých pár sekund.
      expect(useky.length, id).toBeLessThanOrEqual(4);
      expect(useky.every((x) => x.rychlost === HLUCHO.rychlostKlidu || x.rychlost === HLUCHO.rychlost)).toBe(true);
      expect(dobaPrehrani(useky, p.trvani), `${id}: přehrání z ${p.trvani} s`).toBeLessThan(nejvys * p.trvani);
      // Započítaná špička je to, co hlásí výsledek, a okolo ní se nezrychluje.
      expect(klidnyUsek(useky, p.vysledek.komfort!.cas)).toBeNull();
    }
    expect(klidneUseky(new Zaznam())).toEqual([]);
  }, 240_000);

  it("most, který na kmitání neprojde: překročení meze se nikdy nepřehraje zrychleně (5-01, dvoumetrová příhrada)", () => {
    // Špička 1,3 m/s² při mezi 0,5: šedesát procent špičky by bylo nad mezí a úsek by mez přejel.
    const u = uroven("5-01");
    const pad = RESENI["5-01"]!.pady.find((x) => x.nazev.includes("dvoumetrov"))!;
    const p = prubehZkousky(u, pad.navrh);
    expect(p.vysledek.pruchod).toBe(false);
    expect(p.vysledek.komfort!.prekroceno).not.toBeNull();
    expect(prahKmitaniKlidu(0.5, p.vysledek.komfort!.zrychleni)).toBeCloseTo(0.4, 9);
    overUseky(p, usekyHry(p));
  }, 240_000);

  it("čekání na prázdném mostě se zrychlí, i když křídlo po dosednutí ještě doznívá (kapitola 7)", () => {
    // V 7-04 most zamkne ve 25. sekundě a autobus vyjíždí ve 34.: rychlost styčníků se po
    // dosednutí houpe kolem prahu a stupeň se dřív přepínal snímek od snímku, takže žádný úsek
    // nevydržel tři sekundy a čekání běželo celé. (V 7-01 se čeká jen necelé čtyři sekundy
    // a po odstupech na začátku a na konci není co zrychlit.)
    for (const klic of ["pruchod", "mistrovska"] as const) {
      const p = prubehZkousky(uroven("7-04"), RESENI["7-04"]![klic]);
      const useky = usekyHry(p);
      overUseky(p, useky);
      expect(useky.filter((x) => x.rychlost === HLUCHO.rychlost).length, klic).toBeGreaterThanOrEqual(1);
      expect(dobaPrehrani(useky, p.trvani), klic).toBeLessThan(p.trvani - 2);
    }
  }, 240_000);

  it("práh kmitání: polovina meze, u mostu blízko meze 60 % jeho špičky, nikdy nad 80 % meze", () => {
    expect(prahKmitaniKlidu(2.5, 0.4)).toBeCloseTo(1.25, 9);
    expect(prahKmitaniKlidu(2.5, 2.4)).toBeCloseTo(1.44, 9);
    expect(prahKmitaniKlidu(2.5, 6)).toBeCloseTo(2.0, 9);
    expect(prahKmitaniKlidu(0.5, 1.28)).toBeCloseTo(0.4, 9);
  });

  it("uhelný vlak (6-03): brzdění na viaduktu a okamžik největšího využití se přehrají zvolenou rychlostí", () => {
    const p = prubehZkousky(uroven("6-03"), RESENI["6-03"]!.mistrovska);
    // Zkouška trvá 38 s, takže se v ní stupeň „klid“ nezrychluje vůbec…
    expect(p.trvani).toBeLessThan(HLUCHO.dlouha);
    expect(usekyHry(p)).toEqual([]);
    // …a kdyby byla dlouhá (delší vlak, pískoviště), brzdění a špička využití zůstanou.
    const useky = usekyHry(p, 0);
    overUseky(p, useky);
    const brzdici = p.ucastnici.filter((u) => u.brzdeni);
    expect(brzdici.length).toBeGreaterThan(0);
    for (const u of brzdici) {
      expect(klidnyUsek(useky, u.brzdeni!.od)).toBeNull();
      expect(klidnyUsek(useky, (u.brzdeni!.stoji + u.brzdeni!.rozjezd) / 2)).toBeNull();
    }
    // Okamžik, kdy byl některý prut využitý nejvíc, rozhoduje o bonusu: zrychlený není.
    let casSpicky = 0;
    let nejvic = 0;
    for (const s of p.zaznam.snimky) {
      const v = Math.max(...Array.from(s.vyuziti, Math.abs), 0);
      if (v > nejvic) {
        nejvic = v;
        casSpicky = s.cas;
      }
    }
    expect(klidnyUsek(useky, casSpicky)).toBeNull();
    // Dlouhá zkouška se přesto zkrátí: vlak se po zastavení rozjíždí půl minuty.
    expect(dobaPrehrani(useky, p.trvani)).toBeLessThan(0.7 * p.trvani);
  }, 240_000);

  it("po první události se nezrychluje: pády lidí a trosky si hráč prohlédne (2-04 bez tlumičů, 1-03 pád)", () => {
    for (const [id, cast] of [
      ["1-03", 1],
      ["4-04", 0],
    ] as const) {
      const p = prubehZkousky(uroven(id), RESENI[id]!.pady[cast]!.navrh);
      expect(p.udalosti.some((u) => u.druh === "poruseni" || u.druh === "pad"), id).toBe(true);
      overUseky(p, usekyHry(p));
      overUseky(p, usekyHry(p, 0));
    }
  }, 240_000);

  it("první auto (1-03): špička se bere jen z kmitání pod lidmi, dodávka na prázdné mostovce klid nezmění", () => {
    const p = prubehZkousky(uroven("1-03"), RESENI["1-03"]!.pruchod);
    const vsechno = p.zaznam.snimky.reduce((a, s) => Math.max(a, s.kmitani), 0);
    const zapocitane = p.zaznam.snimky.reduce((a, s) => (pocitaSe(p, s) ? Math.max(a, s.kmitani) : a), 0);
    expect(vsechno).toBeGreaterThan(3 * zapocitane);
    overUseky(p, usekyHry(p));
    overUseky(p, usekyHry(p, 0));
  }, 120_000);

  it("krátká zkouška se má vidět celá: s volbou jenPrazdno se klid se lidmi na mostě nezrychluje", () => {
    // 1-02: lidé jdou po lávce celou zkoušku a most je daleko od mezí, takže by byla zrychlená skoro celá.
    const p = prubehZkousky(uroven("1-02"), RESENI["1-02"]!.pruchod);
    expect(p.trvani).toBeLessThan(HLUCHO.dlouha);
    expect(klidneUseky(p.zaznam, { kmitani: 1.25 }).some((x) => x.rychlost === HLUCHO.rychlostKlidu)).toBe(true);
    expect(klidneUseky(p.zaznam, { kmitani: 1.25, jenPrazdno: true })).toEqual([]);
    expect(usekyHry(p)).toEqual([]);
    // Půlminutové zkoušky, po kterých jdou lidé celou dobu (1-02, 2-01), se nezrychlují také.
    for (const id of ["1-01", "2-01"]) {
      const pul = prubehZkousky(uroven(id), RESENI[id]!.pruchod);
      expect(pul.trvani, id).toBeLessThan(HLUCHO.dlouha);
      expect(usekyHry(pul).filter((x) => x.rychlost === HLUCHO.rychlostKlidu), id).toEqual([]);
    }
    // Čekání na prázdném mostě se zrychlí i s touhle volbou (zvedací most 7-01).
    const most = uroven("7-01");
    const zvedaci = prubehZkousky(most, RESENI["7-01"]!.pruchod);
    const rusno = most.lode.map((lod) => [lod.cas - 1, lod.cas + lod.trvani + 1] as const);
    const useky = klidneUseky(zvedaci.zaznam, { rusno, jenPrazdno: true });
    expect(useky.length).toBeGreaterThanOrEqual(1);
    expect(useky.every((x) => x.rychlost === HLUCHO.rychlost)).toBe(true);
  }, 120_000);
});
