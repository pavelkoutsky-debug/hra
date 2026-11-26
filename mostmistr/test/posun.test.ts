// Posun víc styčníků naráz (nástroj Výběr a posun, šipky): úprava návrhu, pravidla, kotvy,
// historie kroků a počítání změn v Havarijní komisi. Bez prohlížeče.
import { describe, expect, it } from "vitest";
import type { NavrhMostu } from "../src/data/navrh";
import { zkontrolujNavrh } from "../src/data/navrh";
import { nactiUroven } from "../src/data/uroven";
import { zmenyMostu } from "../src/data/zmeny";
import { Editor } from "../src/editor/editor";
import { duvodProtiPosunuSkupiny } from "../src/editor/pravidla";
import { nastavPredpeti, nastavSvar, nastavZavazi, posunStycniky, prazdnyNavrh, pridejPrut } from "../src/editor/upravy";
import potok from "../urovne/1-01.json";
import auto from "../urovne/1-03.json";
import udoli from "../urovne/4-01.json";
import { RESENI } from "../urovne/reseni";

const B = (x: number, y: number) => ({ x, y });
const most = RESENI["1-03"]!.pruchod;
const urovenAuta = nactiUroven(auto);
const idV = (navrh: NavrhMostu, x: number, y: number): number => navrh.stycniky.find((s) => s.x === x && s.y === y)!.id;
const mista = (navrh: NavrhMostu): string[] => navrh.stycniky.map((s) => `${s.x};${s.y}`).sort();

/** Editor s mostem 1-03 (mostovka 0–16 m a příhrada s horním pásem ve 3 m). */
function sPrihradou(): Editor {
  return new Editor(urovenAuta, most);
}

/** Vybere rámečkem všechno v obdélníku (nástrojem výběru, z prázdného místa). */
function vyberRamem(e: Editor, od: { x: number; y: number }, k: { x: number; y: number }): void {
  e.stiskni(od, { posouvat: true, bezKresleni: true });
  e.tahni(k);
  e.pust();
}

describe("posun skupiny styčníků: úprava návrhu", () => {
  it("posune dané styčníky o stejný kus, ostatní stojí a pruty k nim se natáhnou", () => {
    const horni = new Set([idV(most, 4, 3), idV(most, 8, 3), idV(most, 12, 3)]);
    const nizsi = posunStycniky(most, horni, 0, -1)!;
    expect(mista(nizsi)).toEqual(["0;0", "12;0", "12;2", "16;0", "4;0", "4;2", "8;0", "8;2"]);
    // Pruty i id zůstávají: mění se jen místa styčníků. Původní návrh se nemění.
    expect(nizsi.pruty).toBe(most.pruty);
    expect(mista(most)).toContain("8;3");
    // Nulový posun nic nezmění, prázdná skupina taky ne.
    expect(posunStycniky(most, horni, 0, 0)).toBe(most);
    expect(posunStycniky(most, new Set(), 1, 0)).toBe(most);
  });

  it("posunutý styčník se nesmí slít se styčníkem, který stojí; mezi sebou se posunuté nesrazí", () => {
    // Horní styčník 8;3 o metr dolů a 4;3 o 4 m doprava by padly na místa, kde něco stojí.
    expect(posunStycniky(most, new Set([idV(most, 8, 3)]), 0, -3)).toBeNull();
    expect(posunStycniky(most, new Set([idV(most, 4, 3)]), 4, 0)).toBeNull();
    expect(duvodProtiPosunuSkupiny(most, urovenAuta, new Set([idV(most, 4, 3)]), 4, 0)).toBe("stycniky-na-stejnem-miste");
    // Celý horní pás o 4 m doprava: 4;3 jde na místo 8;3, které se samo posouvá dál. To je v pořádku.
    const horni = new Set([idV(most, 4, 3), idV(most, 8, 3), idV(most, 12, 3)]);
    expect(posunStycniky(most, horni, 4, 0)).not.toBeNull();
  });

  it("nastavení prutů a styčníků zůstává jako při posunu jednoho styčníku (napínák, svar, závaží)", () => {
    const uroven = nactiUroven(potok);
    let navrh = pridejPrut(prazdnyNavrh(uroven.id), B(0, 0), B(4, 3), "lano");
    navrh = pridejPrut(navrh, B(4, 3), B(8, 0), "drevo-lehke");
    navrh = nastavPredpeti(navrh, new Set([0]), () => 0.2);
    navrh = nastavSvar(navrh, new Set([idV(navrh, 4, 3)]), true);
    navrh = nastavZavazi(navrh, new Set([idV(navrh, 4, 3)]), () => 300);
    const posunuty = posunStycniky(navrh, new Set([idV(navrh, 4, 3)]), 0, 1)!;
    expect(posunuty.pruty.find((p) => p.prvek === "lano")!.predpeti).toBe(0.2);
    expect(posunuty.stycniky.find((s) => s.x === 4)).toMatchObject({ y: 4, svar: true, zavazi: 300 });
  });
});

describe("posun výběru v editoru", () => {
  it("šipka posune vybrané styčníky o metr; most sníží rámeček a jedna šipka a Zpět ho vrátí jedním krokem", () => {
    const e = sPrihradou();
    // Rámeček přes horní pás příhrady.
    vyberRamem(e, B(3, 2.5), B(13, 3.5));
    expect(e.vybraneStycniky.size).toBe(3);
    expect(e.posunVyberu).toEqual({ pohyblivych: 3, vPodporach: 0 });
    expect(e.posunVybrane(0, -1)).toBe(true);
    expect(e.posledniAkce).toBe("posun");
    expect(e.posledniPosun).toEqual({ stycniku: 3, dx: 0, dy: -1, jak: "klavesa" });
    expect(mista(e.navrh)).toEqual(["0;0", "12;0", "12;2", "16;0", "4;0", "4;2", "8;0", "8;2"]);
    expect(zkontrolujNavrh(e.navrh, urovenAuta).filter((p) => p.druh !== "nad-rozpocet")).toEqual([]);
    // Výběr zůstává: další šipka posune tytéž styčníky.
    expect(e.vybraneStycniky.size).toBe(3);
    expect(e.posunVybrane(0, -1)).toBe(true);
    expect(mista(e.navrh)).toContain("8;1");
    e.zpet();
    expect(mista(e.navrh)).toContain("8;2");
    e.zpet();
    expect(e.navrh).toBe(most);
    expect(e.lzeZpet).toBe(false);
  });

  it("vybrané pruty posunou oba své konce", () => {
    const e = sPrihradou();
    const horniPas = most.pruty.find((p) => {
      const a = most.stycniky.find((s) => s.id === p.a)!;
      const b = most.stycniky.find((s) => s.id === p.b)!;
      return a.y === 3 && b.y === 3;
    })!;
    e.vyberJenPrut(horniPas.id);
    // Výběr kvůli nastavení (lano po nakreslení, napínák) se šipkami neposouvá: šipky posunou pohled.
    expect(e.posunVyberu).toBeNull();
    e.zrusVyber();
    e.vybranePruty.add(horniPas.id);
    expect(e.posunVyberu).toEqual({ pohyblivych: 2, vPodporach: 0 });
    expect(e.posunVybrane(0, 1)).toBe(true);
    expect(e.navrh.stycniky.filter((s) => s.y === 4)).toHaveLength(2);
  });

  it("styčníky v kotvách a na základech zůstanou stát, pruty k nim se natáhnou", () => {
    const uroven = nactiUroven(potok);
    let navrh = pridejPrut(prazdnyNavrh(uroven.id), B(0, 0), B(2, 2), "drevo-lehke");
    navrh = pridejPrut(navrh, B(2, 2), B(4, 2), "drevo-lehke");
    const e = new Editor(uroven, navrh);
    e.vyberVse();
    expect(e.posunVyberu).toEqual({ pohyblivych: 2, vPodporach: 1 });
    expect(e.posunVybrane(1, 0)).toBe(true);
    expect(mista(e.navrh)).toEqual(["0;0", "3;2", "5;2"]);
    // Když jsou vybrané jen styčníky v kotvách, není co posunout.
    e.zrusVyber();
    e.vybraneStycniky.add(idV(e.navrh, 0, 0));
    expect(e.posunVyberu).toEqual({ pohyblivych: 0, vPodporach: 1 });
    expect(e.posunVybrane(0, 1)).toBe(false);
    expect(mista(e.navrh)).toEqual(["0;0", "3;2", "5;2"]);

    // Pilíř na základu: základ stojí, hlava pilíře se posune a pilíř se nakloní.
    const pilire = nactiUroven(udoli);
    let sPilirem = pridejPrut(prazdnyNavrh(pilire.id), B(18, -12), B(18, -4), "pilir");
    sPilirem = pridejPrut(sPilirem, B(18, -4), B(12, -4), "mostovka-ocelobeton");
    const p = new Editor(pilire, sPilirem);
    p.vyberVse();
    expect(p.posunVyberu).toEqual({ pohyblivych: 2, vPodporach: 1 });
    expect(zkontrolujNavrh(sPilirem, pilire)).toEqual([]);
    expect(p.posunVybrane(1, 0)).toBe(true);
    expect(mista(p.navrh)).toEqual(["13;-4", "18;-12", "19;-4"]);
  });

  it("posun, který by porušil pravidla, se neprovede a editor řekne proč", () => {
    // Celý most o metr dolů: kotvy stojí a mostovka by vjela do zakázané zóny pod sebou.
    const e = sPrihradou();
    e.vyberVse();
    expect(e.posunVybrane(0, -1)).toBe(false);
    expect(e.posledniDuvod).toBe("stycnik-v-zakazane-zone");
    expect(e.navrh).toBe(most);
    expect(e.lzeZpet).toBe(false);
    // Horní pás o 3 m dolů by se slil s mostovkou.
    vyberRamem(e, B(3, 2.5), B(13, 3.5));
    expect(e.posunVybrane(0, -3)).toBe(false);
    expect(e.posledniDuvod).toBe("stycniky-na-stejnem-miste");
    // Krajní pruty horního pásu: 4 m doprava by protáhlo šikmý prut ze 4;3 do 0;0 přes 6 m.
    expect(e.posunVybrane(4, 0)).toBe(false);
    expect(e.posledniDuvod).toBe("prut-dlouhy");
    // Pilíř smí být nakloněný nejvýš o polovinu výšky.
    const pilire = nactiUroven(udoli);
    const p = new Editor(pilire, pridejPrut(prazdnyNavrh(pilire.id), B(18, -12), B(18, -4), "pilir"));
    p.vyberVse();
    expect(p.posunVybrane(4, 0)).toBe(true);
    expect(p.posunVybrane(1, 0)).toBe(false);
    expect(p.posledniDuvod).toBe("pilir-sikmy");
  });

  it("tah za vybraný styčník posune celý výběr; tah za nevybraný jen ten jeden styčník", () => {
    const e = sPrihradou();
    vyberRamem(e, B(3, 2.5), B(13, 3.5));
    e.stiskni(B(8, 3), { posouvat: true, bezKresleni: true });
    expect(e.tah).toMatchObject({ druh: "posun", skupina: expect.arrayContaining([idV(most, 4, 3), idV(most, 8, 3), idV(most, 12, 3)]) });
    e.tahni(B(8, 2));
    expect(e.tah).toMatchObject({ duvod: null });
    e.tahni(B(8, 0));
    expect(e.tah).toMatchObject({ duvod: "stycniky-na-stejnem-miste" });
    e.tahni(B(8, 2.2));
    expect(e.pust()).toBe(true);
    expect(e.posledniPosun).toEqual({ stycniku: 3, dx: 0, dy: -1, jak: "tah" });
    expect(mista(e.navrh)).toEqual(["0;0", "12;0", "12;2", "16;0", "4;0", "4;2", "8;0", "8;2"]);
    // Jeden krok Zpět.
    e.zpet();
    expect(e.navrh).toBe(most);
    // Kliknutí bez tažení za styčník výběru výběr nahradí tím jedním styčníkem.
    vyberRamem(e, B(3, 2.5), B(13, 3.5));
    e.stiskni(B(8, 3), { posouvat: true, bezKresleni: true });
    e.pust();
    expect([...e.vybraneStycniky]).toEqual([idV(most, 8, 3)]);
    // Tah za styčník mimo výběr posune jen jeho (jako dřív).
    vyberRamem(e, B(3, 2.5), B(13, 3.5));
    e.stiskni(B(8, 0), { posouvat: true, bezKresleni: true });
    expect(e.tah).toMatchObject({ druh: "posun" });
    expect(e.tah && "skupina" in e.tah).toBe(false);
  });

  it("tah za vybraný styčník v kotvě táhne ostatní, kotva stojí", () => {
    const uroven = nactiUroven(potok);
    let navrh = pridejPrut(prazdnyNavrh(uroven.id), B(0, 0), B(2, 2), "drevo-lehke");
    navrh = pridejPrut(navrh, B(2, 2), B(4, 2), "drevo-lehke");
    const e = new Editor(uroven, navrh);
    e.vyberVse();
    e.stiskni(B(0, 0), { posouvat: true, bezKresleni: true });
    e.tahni(B(0, 1));
    expect(e.pust()).toBe(true);
    expect(mista(e.navrh)).toEqual(["0;0", "2;3", "4;3"]);
  });
});

describe("Havarijní komise a posun skupiny", () => {
  const druhy = (zmeny: ReturnType<typeof zmenyMostu>): string[] => zmeny.map((z) => z.druh);
  const horni = new Set([idV(most, 4, 3), idV(most, 8, 3), idV(most, 12, 3)]);

  it("posun víc styčníků naráz je tolik změn, kolik styčníků se pohnulo", () => {
    expect(druhy(zmenyMostu(most, posunStycniky(most, new Set([idV(most, 8, 3)]), 0, 1)!))).toEqual(["stycnik-posunut"]);
    expect(druhy(zmenyMostu(most, posunStycniky(most, new Set([idV(most, 4, 3), idV(most, 8, 3)]), 0, -1)!))).toEqual([
      "stycnik-posunut",
      "stycnik-posunut",
    ]);
    expect(druhy(zmenyMostu(most, posunStycniky(most, horni, 0, -1)!))).toEqual(["stycnik-posunut", "stycnik-posunut", "stycnik-posunut"]);
    // Horní pás o rastr doprava: styčníky padnou jeden na místo druhého. Pořád tři změny.
    expect(druhy(zmenyMostu(most, posunStycniky(most, horni, 1, 0)!))).toEqual(["stycnik-posunut", "stycnik-posunut", "stycnik-posunut"]);
    expect(druhy(zmenyMostu(most, posunStycniky(most, horni, 4, 0)!))).toEqual(["stycnik-posunut", "stycnik-posunut", "stycnik-posunut"]);
  });

  it("posun výběru v editoru tam a zpátky žádná změna není", () => {
    const e = sPrihradou();
    vyberRamem(e, B(3, 2.5), B(13, 3.5));
    e.posunVybrane(0, -1);
    expect(zmenyMostu(most, e.navrh)).toHaveLength(3);
    e.posunVybrane(0, 1);
    expect(zmenyMostu(most, e.navrh)).toEqual([]);
  });
});
