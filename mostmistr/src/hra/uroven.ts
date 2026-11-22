// Obrazovka úrovně: stavba mostu na výkresu, zkouška v pracovním vlákně, přehrávání
// záznamu na časové ose a vyhodnocení s medailemi.

import { cenaNavrhu, hmotnostNavrhu } from "../data/cena";
import type { Bod } from "../data/geometrie";
import { jeUvnitr } from "../data/geometrie";
import { KATALOG, LADENY_TLUMIC, type IdPrvku } from "../data/katalog";
import { ChybaDat } from "../data/kontrola";
import { navrhNaText, navrhZTextu, type DruhProblemu, type NavrhMostu } from "../data/navrh";
import { BEZ_MEDAILI, type Rekord } from "../data/ulozeni";
import type { Uroven } from "../data/uroven";
import { Editor } from "../editor/editor";
import { prekazkyZkousky } from "../editor/pravidla";
import { prazdnyNavrh } from "../editor/upravy";
import { MEZE_KOMFORTU } from "../jadro/komfort";
import { ZPUSOB_OHYB, ZPUSOB_SMYK, ZPUSOB_TAH, ZPUSOB_TLAK, ZPUSOB_ZADNY } from "../jadro/namahani";
import { NASLEDEK_KLOUB, NASLEDEK_ODPOJENI } from "../jadro/poruseni";
import { VERZE_FYZIKY } from "../jadro/verze";
import { prvek, udaj } from "../ui/dom";
import { cislo, datum, hmotnost, koruny, meritkoVykresu, procenta } from "../ui/formaty";
import { posunPrehravani, zapisCasu, type StavPrehravani } from "../ui/prehravani";
import { jeKlicTextu, t, type KlicTextu } from "../ui/slovnik";
import { celyVyrez, obrazNaSvet, omezNaVyrez, posunO, svetNaObraz, zoomKolem, type Kamera } from "../vykres/kamera";
import { nakresliKonstrukci } from "../vykres/konstrukce";
import { nakresliNavrh, tloustkaPrutu } from "../vykres/navrh";
import { pripojOvladani } from "../vykres/ovladani";
import { Platno } from "../vykres/platno";
import { nakresliProvoz } from "../vykres/provoz";
import { nakresliCislaVyuziti, type CisloVyuziti } from "../vykres/cisla";
import { nakresliKrivku, stropGrafu, vrcholyKrivky } from "../vykres/grafy";
import { nakresliVykres } from "../vykres/vykres";
import { KlientZkousky } from "../zkouska/klient";
import { jeClovek, type PopisUcastnika } from "../zkouska/provoz";
import type { RozborMostu, Udalost, VysledekZkousky, ZpravaZeZkousky } from "../zkouska/protokol";
import { lidiVRade, rytmusLidi } from "../zkouska/vozidla";
import { CARA_SKRYTA, prazdnySnimek, Zaznam, type Snimek, type Topologie } from "../zkouska/zaznam";
import { DRUHY_ZVUKU, Poslech, type Zvuk } from "../zvuk/deje";
import { Ozvuceni } from "../zvuk/ozvuceni";
import { nasadaUrovne } from "../../urovne/index";
import { ukazkaUrovne } from "../../urovne/ukazky";
import { Ukazka } from "./ukazka";
import { vypisMedaile, znackyMedaili } from "./medaile";
import { HLASITOSTI, type Uloziste } from "./uloziste";

/** Volný okraj kolem výřezu při zobrazení celého výkresu, v pixelech. */
const OKRAJ_VYKRESU = 28;
const KROK_ZOOMU_TLACITKEM = 1.25;
/** Jak daleko od prutu se při zkoušce ještě počítá kliknutí na něj, v pixelech. */
const DOSAH_KLIKNUTI = 9;
/** Kolik porušení výsledek vypíše jmenovitě; zbytek shrne počtem. */
const NEJVIC_VYPSANYCH_PORUSENI = 5;
/** Po jaké době zmizí hlášení, které na nic nečeká, v milisekundách. */
const DOBA_HLASENI = 6000;
/** O kolik sekund děje posune záznam jeden krok krokování. */
const KROK_ZAZNAMU = 0.02;
/** Brnknutí: kolik newtonů přidá metr tažení myší a největší síla. */
const SILA_NA_METR = 4000;
const NEJVETSI_BRNKNUTI = 8000;
const NEJMENSI_BRNKNUTI = 200;
/** Rozsah osy frekvencí v Hz a jak blízko vlastní frekvenci je krok „u ní“ (poměrně). */
const ROZSAH_OSY = 6;
const PASMO_SHODY = 0.08;
/** Prodleva mezi úpravou návrhu a žádostí o rozbor, v milisekundách. */
const PRODLEVA_ROZBORU = 200;
/** Animace tvaru kmitání při stavbě: kolikrát za sekundu se most zhoupne a jak daleko (podíl rozpětí). */
const FREKVENCE_ANIMACE = 0.8;
const VYCHYLKA_ANIMACE = 0.035;
/** Jak daleko do stran zvuk zní, když je jeho zdroj na kraji plátna (1 je úplně v jednom uchu). */
const SIRKA_ZVUKU = 0.85;

/** Jedna zkouška mostu: záznam, který plní pracovní vlákno, a nakonec výsledek. */
interface Beh {
  /** Návrh, který se zkoušel. Dokud ho hráč nezmění, platí pro něj obálka namáhání. */
  navrh: NavrhMostu;
  zaznam: Zaznam;
  ucastnici: PopisUcastnika[];
  udalosti: Udalost[];
  /** Délka děje v sekundách: nejdřív očekávaná, po doběhnutí skutečná. */
  trvani: number;
  spocitanoVse: boolean;
  vysledek: VysledekZkousky | null;
  vysledekUkazan: boolean;
  /** Hráč chtěl skočit na konec dřív, než byl spočítaný. */
  naKonecPoVypoctu: boolean;
  /** Prut, na který hráč při přehrávání klikl (pořadí v návrhu). */
  oznaceny: number | null;
  /** Pokus s brnknutím, ne zkouška: nepočítá se do medailí ani do obálky. */
  brnknuti: boolean;
}

function nazevZpusobu(zpusob: number): KlicTextu {
  if (zpusob === ZPUSOB_TAH) return "zkusebna.zpusob.tah";
  if (zpusob === ZPUSOB_TLAK) return "zkusebna.zpusob.tlak";
  if (zpusob === ZPUSOB_OHYB) return "zkusebna.zpusob.ohyb";
  if (zpusob === ZPUSOB_SMYK) return "zkusebna.zpusob.smyk";
  return "zkusebna.zpusob.vzper";
}

function nazevNasledku(nasledek: number): KlicTextu {
  if (nasledek === NASLEDEK_KLOUB) return "zkusebna.nasledek.kloub";
  if (nasledek === NASLEDEK_ODPOJENI) return "zkusebna.nasledek.odpojeni";
  return "zkusebna.nasledek.rozlomeni";
}

function nazevPrvku(id: IdPrvku): string {
  return t(`prvek.${id}`);
}

function vzdalenostOdUsecky(p: Bod, a: Bod, b: Bod): number {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const delka2 = ux * ux + uy * uy;
  let podil = delka2 > 0 ? ((p.x - a.x) * ux + (p.y - a.y) * uy) / delka2 : 0;
  podil = Math.max(0, Math.min(1, podil));
  return Math.hypot(p.x - (a.x + podil * ux), p.y - (a.y + podil * uy));
}

/** Je cílem události pole, do kterého se píše? Klávesové zkratky ho nechávají být. */
function jePsaciPole(cil: EventTarget | null): boolean {
  return cil instanceof Element && cil.closest("textarea, select, input:not([type=range]):not([type=checkbox])") !== null;
}

/**
 * Spustí obrazovku úrovně. `kampan` je pořadí úrovní pro odkaz na další; úroveň mimo
 * kampaň (zkušební výkres) další nemá.
 */
export function spustUroven(uroven: Uroven, kampan: readonly Uroven[], uloziste: Uloziste): void {
  prvek("#obrazovka-uroven", HTMLElement).hidden = false;
  const canvas = prvek("#obrazovka-uroven .vykres__platno", HTMLCanvasElement);
  const poleSouradnic = udaj("souradnice");
  const poleMeritka = udaj("meritko");
  const poleHlaseni = udaj("hlaseni");
  const tlacitkoZkousky = prvek('[data-akce="zkouska"]', HTMLButtonElement);
  const tlacitkoPrehrat = prvek('[data-akce="prehrat"]', HTMLButtonElement);
  const tlacitkaRychlosti = [...document.querySelectorAll<HTMLButtonElement>("#obrazovka-uroven [data-rychlost]")];
  const tahlo = prvek("#cas", HTMLInputElement);
  const pruhSpocitano = prvek("#obrazovka-uroven .osa__spocitano", HTMLElement);
  const znackyOsy = prvek("#obrazovka-uroven .osa__znacky", HTMLElement);
  const panelVysledku = prvek(".vysledek", HTMLElement);
  const paletaPrvku = prvek(".paleta__prvky", HTMLElement);
  const rozpocet = prvek(".rozpocet", HTMLElement);
  const okno = prvek("#okno", HTMLDialogElement);
  const obsahOkna = prvek("#okno-obsah", HTMLTextAreaElement);
  const oknoZadani = prvek("#okno-zadani", HTMLDialogElement);
  const prepinacCisel = prvek('[data-akce="cisla"]', HTMLButtonElement);
  const tlacitkoZvuku = prvek('[data-akce="zvuk"]', HTMLButtonElement);
  const panelAnalyzy = udaj("analyza");
  const tlacitkoAnalyzy = prvek('[data-akce="analyza"]', HTMLButtonElement);
  const platnoKrivky = prvek('[data-udaj="krivka"]', HTMLCanvasElement);

  // ---- Stav ----

  // Skutečný výchozí pohled nastaví až `ukazCelyVykres` na konci, kdy je známá velikost plátna.
  let kamera: Kamera = { x: 0, y: 0, meritko: 20 };
  /** Dokud hráč pohled nezměnil, drží se při změně velikosti okna celý výkres. */
  let pohledJeVychozi = true;
  /** Poslední místo kurzoru na plátně v pixelech; null, když je mimo plátno. */
  let mistoKurzoru: Bod | null = null;
  /** Bod rastru pod kurzorem; null mimo výřez úrovně. */
  let kurzor: Bod | null = null;

  let rezim: "stavba" | "zkouska" = "stavba";
  let nastroj: "kresleni" | "vyber" | "brnknuti" = "kresleni";
  /** Rozdělané brnknutí: styčník (pořadí v návrhu), místo stisku a kurzoru v pixelech plátna. */
  let brnk: { stycnik: number; od: Bod; k: Bod } | null = null;
  /** Poslední rozbor mostu; undefined, dokud se počítá, null, když most rozebrat nejde. */
  let rozbor: RozborMostu | null | undefined;
  let idRozboru = 0;
  let casovacRozboru: number | undefined;
  const maLidi = uroven.jizdniRad.some((p) => jeClovek(p.druh));
  /** Ukázka v okně se zadáním; běží, jen dokud je okno otevřené. */
  let ukazka: Ukazka | null = null;
  /** Poslední zkouška; její obálka platí, dokud je `beh.navrh` právě upravovaný návrh. */
  let beh: Beh | null = null;
  let klient: KlientZkousky | null = null;
  /** Výsledky poslední a předposlední dokončené zkoušky, pro porovnání pokusů. */
  let posledniVysledek: VysledekZkousky | null = null;
  let predchoziVysledek: VysledekZkousky | null = null;
  let prehravani: StavPrehravani = { cas: 0, bezi: false, rychlost: 1 };
  const snimek: Snimek = prazdnySnimek();
  let rekord: Rekord | undefined = uloziste.rekord(uroven.id);
  let casovacHlaseni: number | undefined;
  /** Ukazovat u prutů čísla využití? */
  let cisla = uloziste.cislaVyuziti;
  const ozvuceni = new Ozvuceni(uloziste.hlasitost);
  ozvuceni.priZmeneStavu = () => obnovZvuk();
  /** Poslech právě přehrávané zkoušky: říká, co má v kterém okamžiku záznamu zaznít. */
  let poslech: Poslech | null = null;
  /** Je analytický panel rozbalený? V úrovni s rezonanční křivkou začíná otevřený. */
  let analyzaOtevrena = uroven.rezonancniKrivka;
  /** Horní okraj svislé osy rezonanční křivky; drží se, aby bylo vidět, že úprava špičku snížila. */
  let stropKrivky = 0;
  /** Který tvar kmitání se právě na výkresu předvádí (pořadí v rozboru); null žádný. */
  let tvarKmitani: number | null = null;

  // Pomocné vlákno pro rozbory mostu při stavbě; zkoušky mají každá vlastní.
  const pomocny = new KlientZkousky();
  pomocny.poslouchej((zprava) => {
    if (zprava.typ !== "rozbor" || zprava.id !== idRozboru) return;
    rozbor = zprava.rozbor;
    obnovOsuFrekvenci();
    obnovAnalyzu();
  });

  const ulozeny = uloziste.navrh(uroven.id);
  let naposledUlozeny: NavrhMostu | null = ulozeny ?? null;
  const editor = new Editor(uroven, ulozeny ?? prazdnyNavrh(uroven.id), poZmeneNavrhu);

  // ---- Výkres ----

  const platno = new Platno(canvas, kresli, () => {
    if (pohledJeVychozi) kamera = pohledNaCelyVykres();
    obnovPohled();
  });

  function pohledNaCelyVykres(): Kamera {
    return celyVyrez(uroven.vyrez, platno.rozmer, OKRAJ_VYKRESU);
  }

  /** Platí obálka namáhání z poslední zkoušky pro návrh, který je právě na výkresu? */
  function platnaObalka(): VysledekZkousky | null {
    return beh !== null && !beh.brnknuti && beh.vysledek !== null && beh.navrh === editor.navrh ? beh.vysledek : null;
  }

  function kresli(ctx: CanvasRenderingContext2D, rozmer: { sirka: number; vyska: number }): void {
    if (rezim === "zkouska" && beh) {
      nakresliVykres(ctx, { uroven, kamera, rozmer, kurzor: null });
      const stavba = beh.zaznam.stavV(prehravani.cas, snimek);
      if (stavba) {
        if (beh.oznaceny !== null) zvyrazniPrut(ctx, stavba, beh.oznaceny);
        // Pruty mají při zkoušce stejnou tloušťku jako při stavbě.
        const pruty = beh.navrh.pruty;
        nakresliKonstrukci(ctx, kamera, rozmer, stavba, snimek, 0, (e) => {
          const prut = pruty[stavba.prut[e]!];
          return prut ? tloustkaPrutu(prut.prvek, kamera.meritko) : undefined;
        });
        // Čísla patří ke konstrukci; auta a chodci je při průjezdu na chvíli zakryjí.
        if (cisla) nakresliCislaVyuziti(ctx, cislaZeSnimku(stavba, pruty));
        nakresliProvoz(ctx, kamera, rozmer, beh.ucastnici, snimek);
        return;
      }
    } else {
      nakresliVykres(ctx, { uroven, kamera, rozmer, kurzor });
    }
    // Stavba, nebo zkouška, ze které ještě nedorazil první snímek.
    const stavi = rezim === "stavba";
    const svet = stavi && mistoKurzoru ? obrazNaSvet(kamera, rozmer, mistoKurzoru) : null;
    const obalka = platnaObalka()?.obalka ?? null;
    nakresliNavrh(ctx, kamera, rozmer, {
      navrh: stavi ? navrhVPohybu() : editor.navrh,
      vybranePruty: editor.vybranePruty,
      vybraneStycniky: editor.vybraneStycniky,
      tah: stavi ? editor.tah : null,
      zacatek: svet && nastroj === "kresleni" ? editor.mistoZacatku(svet) : null,
      problemy: prekazkyZkousky(editor.navrh, uroven),
      obalka: obalka?.map((o) => ({ vyuziti: o.vyuziti, tah: o.zpusob === ZPUSOB_TAH })) ?? null,
    });
    if (cisla && obalka && !editor.tah) nakresliCislaVyuziti(ctx, cislaZObalky(obalka.map((o) => o.vyuziti)));
    if (brnk) nakresliBrnknuti(ctx, brnk);
  }

  /** Síla brnknutí v newtonech podle toho, jak daleko hráč styčník stáhl. */
  /**
   * Návrh tak, jak se má právě nakreslit: když se předvádí tvar kmitání, jsou jeho styčníky
   * vychýlené podle tvaru a houpají se. Rozbor patří právě tomuto návrhu; po každé úpravě
   * se zahodí a spočítá znovu.
   */
  function navrhVPohybu(): NavrhMostu {
    const navrh = editor.navrh;
    const tvar = tvarKmitani !== null ? rozbor?.tvary[tvarKmitani] : undefined;
    if (!tvar || tvar.length !== 2 * navrh.stycniky.length || editor.tah) return navrh;
    const trasa = uroven.trasy[0];
    const rozpeti = trasa ? trasa.konec.x - trasa.zacatek.x : 20;
    const amplituda = Math.max(0.35, Math.min(1.5, VYCHYLKA_ANIMACE * rozpeti));
    const vychylka = amplituda * Math.sin((2 * Math.PI * FREKVENCE_ANIMACE * performance.now()) / 1000);
    return {
      ...navrh,
      stycniky: navrh.stycniky.map((st, i) => ({ ...st, x: st.x + vychylka * tvar[2 * i]!, y: st.y + vychylka * tvar[2 * i + 1]! })),
    };
  }

  function silaBrnknuti(b: { od: Bod; k: Bod }): number {
    const metru = Math.max(0, b.k.y - b.od.y) / kamera.meritko;
    return Math.min(NEJVETSI_BRNKNUTI, metru * SILA_NA_METR);
  }

  /** Šipka tahu od styčníku dolů s velikostí síly. */
  function nakresliBrnknuti(ctx: CanvasRenderingContext2D, b: { stycnik: number; od: Bod; k: Bod }): void {
    const st = editor.navrh.stycniky[b.stycnik];
    if (!st) return;
    const pata = bodNavrhu(st);
    const delka = Math.max(0, b.k.y - b.od.y);
    if (delka < 4) return;
    const hrot = { x: pata.x, y: pata.y + delka };
    ctx.save();
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(pata.x, pata.y);
    ctx.lineTo(hrot.x, hrot.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hrot.x, hrot.y + 2);
    ctx.lineTo(hrot.x - 6, hrot.y - 9);
    ctx.lineTo(hrot.x + 6, hrot.y - 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** Poloha styčníku návrhu na plátně. */
  function bodNavrhu(stycnik: { x: number; y: number }): Bod {
    return svetNaObraz(kamera, platno.rozmer, stycnik);
  }

  /** Čísla využití pro stavbu: největší využití každého prutu z poslední zkoušky. */
  function cislaZObalky(vyuziti: readonly number[]): CisloVyuziti[] {
    const navrh = editor.navrh;
    const podleId = new Map(navrh.stycniky.map((st) => [st.id, st]));
    const polozky: CisloVyuziti[] = [];
    navrh.pruty.forEach((prut, poradi) => {
      const a = podleId.get(prut.a);
      const b = podleId.get(prut.b);
      if (a && b) polozky.push({ a: bodNavrhu(a), b: bodNavrhu(b), vyuziti: vyuziti[poradi] ?? 0 });
    });
    return polozky;
  }

  /**
   * Čísla využití pro přehrávání: u každého prutu návrhu největší okamžité využití jeho
   * prvků. Číslo sedí mezi koncovými styčníky prutu, takže po prutu neposkakuje, i když je
   * uvnitř rozdělený na víc dílů.
   */
  function cislaZeSnimku(stavba: Topologie, pruty: readonly { a: number; b: number }[]): CisloVyuziti[] {
    const nejvetsi = new Float32Array(pruty.length);
    for (let e = 0; e < stavba.prvekA.length; e++) {
      const prut = stavba.prut[e]!;
      if (prut < 0 || prut >= pruty.length || stavba.cara[e] === CARA_SKRYTA) continue;
      const vyuziti = Math.abs(snimek.vyuziti[e] ?? 0);
      if (vyuziti > nejvetsi[prut]!) nejvetsi[prut] = vyuziti;
    }
    // Styčníky návrhu jsou v soustavě první a ve stejném pořadí.
    const poradiStycniku = new Map(beh?.navrh.stycniky.map((st, i) => [st.id, i]) ?? []);
    const polozky: CisloVyuziti[] = [];
    pruty.forEach((prut, poradi) => {
      const a = poradiStycniku.get(prut.a);
      const b = poradiStycniku.get(prut.b);
      if (a === undefined || b === undefined) return;
      polozky.push({ a: bodSnimku(a), b: bodSnimku(b), vyuziti: nejvetsi[poradi]! });
    });
    return polozky;
  }

  /** Podloží prut světlou září, aby šel při přehrávání najít. */
  function zvyrazniPrut(ctx: CanvasRenderingContext2D, stavba: Topologie, prut: number): void {
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(143, 208, 255, 0.6)";
    ctx.lineWidth = tloustkaPrutu(editor.navrh.pruty[prut]?.prvek ?? "drevo-lehke", kamera.meritko) + 10;
    ctx.beginPath();
    for (let e = 0; e < stavba.prvekA.length; e++) {
      if (stavba.prut[e] !== prut || stavba.cara[e] === CARA_SKRYTA) continue;
      const a = bodSnimku(stavba.prvekA[e]!);
      const b = bodSnimku(stavba.prvekB[e]!);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Poloha styčníku z právě zobrazeného snímku záznamu, v pixelech plátna. */
  function bodSnimku(stycnik: number): Bod {
    return svetNaObraz(kamera, platno.rozmer, { x: snimek.polohy[2 * stycnik]!, y: snimek.polohy[2 * stycnik + 1]! });
  }

  /** Přepočítá vše, co závisí na kameře a kurzoru, a požádá o překreslení. */
  function obnovPohled(): void {
    kurzor = null;
    if (mistoKurzoru && rezim === "stavba") {
      const svet = obrazNaSvet(kamera, platno.rozmer, mistoKurzoru);
      const bod = { x: Math.round(svet.x), y: Math.round(svet.y) };
      if (jeUvnitr(uroven.vyrez, bod)) kurzor = bod;
    }
    poleMeritka.textContent = meritkoVykresu(kamera.meritko);
    poleSouradnic.textContent = kurzor
      ? t("souradnice.bod", { x: cislo(kurzor.x, 0), y: cislo(kurzor.y, 0) })
      : "";
    // Pro testy v prohlížeči: kde na plátně leží který bod světa.
    canvas.dataset.kamera = `${kamera.x};${kamera.y};${kamera.meritko}`;
    platno.prekresli();
  }

  function zmenPohled(nova: Kamera): void {
    kamera = omezNaVyrez(nova, uroven.vyrez, platno.rozmer);
    pohledJeVychozi = false;
    obnovPohled();
  }

  function zoomuj(kotva: Bod, faktor: number): void {
    // Oddálit lze nejvýš na celý výkres; na té mezi se pohled rovnou vystředí.
    const nejmensi = pohledNaCelyVykres().meritko;
    const nova = zoomKolem(kamera, platno.rozmer, kotva, faktor, nejmensi);
    if (nova.meritko <= nejmensi) ukazCelyVykres();
    else zmenPohled(nova);
  }

  function zoomujNaStred(faktor: number): void {
    zoomuj({ x: platno.rozmer.sirka / 2, y: platno.rozmer.vyska / 2 }, faktor);
  }

  function ukazCelyVykres(): void {
    kamera = pohledNaCelyVykres();
    pohledJeVychozi = true;
    obnovPohled();
  }

  // ---- Hlášení ----

  function ukazHlaseni(text: string, druh: "varovani" | "info", docasne: boolean): void {
    window.clearTimeout(casovacHlaseni);
    poleHlaseni.textContent = text;
    poleHlaseni.dataset.druh = druh;
    if (docasne) casovacHlaseni = window.setTimeout(skryjHlaseni, DOBA_HLASENI);
  }

  function skryjHlaseni(): void {
    window.clearTimeout(casovacHlaseni);
    poleHlaseni.textContent = "";
  }

  function textDuvodu(duvod: DruhProblemu, prvekPrutu: IdPrvku | null): string {
    if (duvod === "prut-dlouhy") {
      return prvekPrutu
        ? t("duvod.prut-dlouhy", { prvek: nazevPrvku(prvekPrutu), delka: cislo(KATALOG[prvekPrutu].nejvetsiDelka, 0) })
        : t("duvod.prut-dlouhy.obecne");
    }
    return t(`duvod.${duvod}`);
  }

  /** Řekne, proč rozdělaný tah nepůjde dokončit; jinak hlášení o tahu skryje. */
  function hlasTah(): void {
    const tah = editor.tah;
    if (!tah || tah.druh === "obdelnik") return;
    const vMiste = tah.k.x === tah.od.x && tah.k.y === tah.od.y;
    if (tah.duvod && !vMiste) ukazHlaseni(textDuvodu(tah.duvod, tah.druh === "prut" ? editor.prvek : null), "varovani", false);
    else skryjHlaseni();
  }

  function zapisObalky(vysledek: VysledekZkousky, prut: number): string {
    const obalka = vysledek.obalka[prut];
    if (!obalka || obalka.zpusob === ZPUSOB_ZADNY || !(obalka.vyuziti > 0)) {
      return t("obalka.bezNamahani", { prut: prut + 1 });
    }
    return t("obalka.prut", {
      prut: prut + 1,
      vyuziti: procenta(obalka.vyuziti),
      zpusob: t(nazevZpusobu(obalka.zpusob)),
      cas: zapisCasu(obalka.cas),
    });
  }

  /** Cena prvku slovy: za metr nebo za kus, s největší délkou. */
  function zapisCenyPrvku(id: IdPrvku): string {
    const polozka = KATALOG[id];
    return "zaMetr" in polozka.cena
      ? t("paleta.cenaZaMetr", { cena: koruny(polozka.cena.zaMetr), delka: cislo(polozka.nejvetsiDelka, 0) })
      : t("paleta.cenaZaKus", { cena: koruny(polozka.cena.zaKus), delka: cislo(polozka.nejvetsiDelka, 0) });
  }

  /**
   * Položka jízdního řádu slovy: krátce pro lištu („0 s → 2× chodec“), nebo celou větou
   * pro okno se zadáním („2× chodec zleva, vyráží v čase 0 s“).
   */
  function zapisJizdy(polozka: Uroven["jizdniRad"][number], vetou = false): string {
    const klic = `provoz.${polozka.druh}`;
    const nazev = jeKlicTextu(klic) ? t(klic) : t("provoz.jiny");
    const pocet = polozka.pocet ?? 1;
    const skupina = lidiVRade(polozka.druh, uroven.sirkaMostovky) > 1 || polozka.druh === "bezecky-zavod";
    let kdo =
      polozka.druh === "utvar"
        ? t("provoz.utvar.popis", { pocet })
        : skupina
          ? t("provoz.skupina.popis", { kdo: nazev, pocet })
          : pocet > 1
            ? t("rad.vice", { pocet, kdo: nazev })
            : nazev;
    // Kde se hraje o rezonanci, patří ke každému člověku i frekvence jeho kroku.
    const rytmus = jeClovek(polozka.druh) ? rytmusLidi(polozka.druh, polozka.kadence) : null;
    if (uroven.osaFrekvenci && rytmus) {
      const klicRytmu =
        polozka.druh === "skakajici-dav" ? "provoz.skoky" : rytmus.rozptyl > 0 ? "provoz.krokKolem" : "provoz.krok";
      kdo = t(klicRytmu, { kdo, f: cislo(rytmus.f, 1) });
    }
    const cas = cislo(polozka.cas, Number.isInteger(polozka.cas) ? 0 : 1);
    if (vetou) {
      const odkud = t(polozka.smer === 1 ? "zadani.provoz.zleva" : "zadani.provoz.zprava");
      return t("zadani.provoz.polozka", { kdo, odkud, cas });
    }
    return t("rad.polozka", { cas, smer: polozka.smer === 1 ? "→" : "←", kdo });
  }

  // ---- Stavba ----

  function vytvorPaletu(): void {
    paletaPrvku.replaceChildren(
      ...uroven.povolenePrvky.map((id, poradi) => {
        const polozka = KATALOG[id];
        const tlacitko = document.createElement("button");
        tlacitko.type = "button";
        tlacitko.className = "paleta__tlacitko paleta__tlacitko--prvek";
        tlacitko.dataset.prvek = id;
        tlacitko.disabled = !polozka.hotovo;
        const klavesa = document.createElement("kbd");
        klavesa.textContent = String(poradi + 1);
        const nazev = document.createElement("span");
        nazev.className = "paleta__nazev";
        nazev.textContent = nazevPrvku(id);
        const cena = document.createElement("span");
        cena.className = "paleta__cena";
        cena.textContent = zapisCenyPrvku(id);
        const ukazka = document.createElement("span");
        ukazka.className = "paleta__ukazka";
        ukazka.style.height = `${Math.round(tloustkaPrutu(id, 30))}px`;
        tlacitko.append(klavesa, nazev, ukazka, cena);
        tlacitko.addEventListener("click", () => zvolPrvek(id));
        return tlacitko;
      }),
    );
  }

  function zvolPrvek(id: IdPrvku): void {
    if (rezim !== "stavba" || !KATALOG[id].hotovo) return;
    nastroj = "kresleni";
    editor.zvolPrvek(id);
    if (editor.posledniDuvod) ukazHlaseni(textDuvodu(editor.posledniDuvod, id), "varovani", true);
    obnovStavbu();
  }

  /** Volá editor po každé změně návrhu, výběru nebo rozdělaného tahu. */
  function poZmeneNavrhu(): void {
    if (editor.navrh !== naposledUlozeny) {
      naposledUlozeny = editor.navrh;
      uloziste.ulozNavrh(editor.navrh);
      naplanujRozbor();
    }
    obnovStavbu();
  }

  /** Po úpravě návrhu požádá s malou prodlevou o nový rozbor mostu (osa frekvencí). */
  function naplanujRozbor(): void {
    if (!uroven.osaFrekvenci) return;
    window.clearTimeout(casovacRozboru);
    rozbor = undefined;
    idRozboru += 1;
    const id = idRozboru;
    const navrh = editor.navrh;
    casovacRozboru = window.setTimeout(() => pomocny.posli({ typ: "rozbor", id, uroven, navrh }), PRODLEVA_ROZBORU);
    obnovOsuFrekvenci();
  }

  /**
   * Kroky lidí z jízdního řádu: frekvence v Hz, kdo tak jde a jak široké pásmo jeho krok
   * zabírá (dav nejde jedním rytmem); každá frekvence jednou.
   */
  function krokyLidi(): { f: number; kdo: string; pasmo: number }[] {
    const kroky = new Map<number, { kdo: string; pasmo: number }>();
    for (const polozka of uroven.jizdniRad) {
      if (!jeClovek(polozka.druh)) continue;
      const rytmus = rytmusLidi(polozka.druh, polozka.kadence);
      if (!rytmus || kroky.has(rytmus.f)) continue;
      const klic = `provoz.${polozka.druh}`;
      // Dvě směrodatné odchylky na každou stranu pokryjí skoro všechny lidi ve skupině.
      kroky.set(rytmus.f, { kdo: jeKlicTextu(klic) ? t(klic) : t("provoz.jiny"), pasmo: 2 * rytmus.rozptyl });
    }
    return [...kroky].map(([f, krok]) => ({ f, ...krok })).sort((a, b) => a.f - b.f);
  }

  /** Překreslí osu frekvencí: stupnici, kroky lidí a vlastní frekvence mostu. */
  function obnovOsuFrekvenci(): void {
    const osa = udaj("osa-frekvenci");
    osa.hidden = !uroven.osaFrekvenci;
    if (!uroven.osaFrekvenci) return;
    const znacky = prvek(".frekvence__znacky", HTMLElement);
    const misto = (f: number): string => `${(100 * Math.min(1, f / ROZSAH_OSY)).toFixed(1)}%`;
    const znacka = (trida: string, f: number, popis: string): HTMLElement => {
      const uzel = document.createElement("span");
      uzel.className = trida;
      uzel.style.left = misto(f);
      uzel.title = popis;
      return uzel;
    };
    const uzly: HTMLElement[] = [];
    for (let hz = 0; hz <= ROZSAH_OSY; hz++) {
      const dilek = znacka("frekvence__dilek", hz, "");
      const cislice = document.createElement("span");
      cislice.textContent = String(hz);
      dilek.append(cislice);
      uzly.push(dilek);
    }
    const kroky = krokyLidi();
    for (const krok of kroky) {
      const popis = t("frekvence.znacka.krok", { kdo: krok.kdo, f: cislo(krok.f, 1) });
      for (const nasobek of [1, 2]) {
        if (nasobek * krok.f > ROZSAH_OSY) continue;
        const trida = nasobek === 1 ? "frekvence__krok" : "frekvence__krok frekvence__krok--dvojnasobek";
        uzly.push(znacka(trida, nasobek * krok.f, popis));
        if (krok.pasmo > 0) {
          // Skupina, která nejde jedním rytmem, zabírá na ose pásmo.
          const pasmo = znacka("frekvence__pasmo", nasobek * (krok.f - krok.pasmo), popis);
          pasmo.style.width = `${((100 * 2 * nasobek * krok.pasmo) / ROZSAH_OSY).toFixed(1)}%`;
          uzly.push(pasmo);
        }
      }
    }

    let text = "";
    let shoda = false;
    if (rozbor === undefined) text = t("frekvence.pocitaSe");
    else if (rozbor === null || !rozbor.stabilni || rozbor.frekvence.length === 0) text = t("frekvence.bezMostu");
    else {
      const prazdny = rozbor.frekvence[0]!;
      const obsazeny = rozbor.frekvenceObsazeneho[0];
      for (const f of rozbor.frekvence) {
        if (f <= ROZSAH_OSY) uzly.push(znacka("frekvence__most", f, t("frekvence.znacka.most", { f: cislo(f, 2) })));
      }
      if (obsazeny !== undefined && obsazeny <= ROZSAH_OSY) {
        uzly.push(
          znacka("frekvence__most frekvence__most--obsazeny", obsazeny, t("frekvence.znacka.obsazeny", { f: cislo(obsazeny, 2) })),
        );
      }
      text =
        obsazeny !== undefined
          ? t("frekvence.mostSLidmi", { prazdny: cislo(prazdny, 2), obsazeny: cislo(obsazeny, 2) })
          : t("frekvence.most", { prazdny: cislo(prazdny, 2) });
      // Krok nebo jeho dvojnásobek u první vlastní frekvence (mezi obsazeným a prázdným mostem).
      const dolni = (obsazeny ?? prazdny) * (1 - PASMO_SHODY);
      const horni = prazdny * (1 + PASMO_SHODY);
      for (const krok of kroky) {
        if (krok.f + krok.pasmo >= dolni && krok.f - krok.pasmo <= horni) {
          text = t("frekvence.shoda", { krok: cislo(krok.f, 1) });
          shoda = true;
          break;
        }
        if (2 * (krok.f + krok.pasmo) >= dolni && 2 * (krok.f - krok.pasmo) <= horni) {
          text = t("frekvence.shodaDvojnasobku", { krok: cislo(krok.f, 1) });
          shoda = true;
        }
      }
    }
    znacky.replaceChildren(...uzly);
    udaj("frekvence-popis").textContent = text;
    osa.dataset.stav = shoda ? "shoda" : "";
    if (rozbor && rozbor.frekvence.length > 0) osa.dataset.frekvence = rozbor.frekvence[0]!.toFixed(3);
    else delete osa.dataset.frekvence;
  }

  /** Promítne návrh do lišty, palety a popisového pole a překreslí výkres. */
  function obnovStavbu(): void {
    const navrh = editor.navrh;
    const cena = cenaNavrhu(navrh);
    const stavi = rezim === "stavba";

    // Rozpočet.
    const plneni = prvek(".rozpocet__plneni", HTMLElement);
    const ryska = prvek(".rozpocet__ryska", HTMLElement);
    const pruh = prvek(".rozpocet__pruh", HTMLElement);
    if (uroven.rozpocet !== null) {
      udaj("rozpocet-popis").textContent = t("rozpocet.nadpis");
      udaj("rozpocet").textContent = t("rozpocet.zRozpoctu", { cena: koruny(cena), rozpocet: koruny(uroven.rozpocet) });
      plneni.style.width = `${(100 * Math.min(1, cena / uroven.rozpocet)).toFixed(1)}%`;
      const inz = uroven.inzenyrskyRozpocet;
      ryska.hidden = inz === null;
      if (inz !== null) ryska.style.left = `${(100 * Math.min(1, inz / uroven.rozpocet)).toFixed(1)}%`;
      rozpocet.dataset.stav = cena > uroven.rozpocet ? "nad" : inz !== null && cena <= inz ? "inz" : "ok";
    } else {
      udaj("rozpocet-popis").textContent = t("rozpocet.cena");
      udaj("rozpocet").textContent = koruny(cena);
      pruh.hidden = true;
      rozpocet.dataset.stav = "ok";
    }

    // Popisové pole.
    udaj("cena").textContent = koruny(cena);
    udaj("hmotnost").textContent = hmotnost(hmotnostNavrhu(navrh, uroven));

    // Paleta a nástroje.
    for (const tlacitko of paletaPrvku.querySelectorAll<HTMLButtonElement>("[data-prvek]")) {
      tlacitko.setAttribute("aria-pressed", String(nastroj === "kresleni" && tlacitko.dataset.prvek === editor.prvek));
      tlacitko.disabled = !stavi || !KATALOG[tlacitko.dataset.prvek as IdPrvku].hotovo;
    }
    const nastav = (akce: string, povoleno: boolean): void => {
      prvek(`[data-akce="${akce}"]`, HTMLButtonElement).disabled = !(stavi && povoleno);
    };
    nastav("vyber", true);
    prvek('[data-akce="vyber"]', HTMLButtonElement).setAttribute("aria-pressed", String(nastroj === "vyber"));
    const tlacitkoBrnknuti = prvek('[data-akce="brnknout"]', HTMLButtonElement);
    tlacitkoBrnknuti.hidden = !uroven.osaFrekvenci;
    tlacitkoBrnknuti.disabled = !stavi || navrh.pruty.length === 0;
    tlacitkoBrnknuti.setAttribute("aria-pressed", String(nastroj === "brnknuti"));

    // Nastavení toho, co je vybrané: závaží styčníků a síla tlumičů.
    const zavazi = stavi && uroven.nejvetsiZavazi > 0 ? editor.zavaziVyberu : null;
    prvek('[data-nastaveni="zavazi"]', HTMLElement).hidden = zavazi === null;
    if (zavazi !== null) {
      udaj("zavazi").textContent = t("paleta.zavazi.hodnota", { kg: cislo(zavazi, 0) });
      prvek('[data-akce="zavazi-min"]', HTMLButtonElement).disabled = zavazi <= 0;
      prvek('[data-akce="zavazi-plus"]', HTMLButtonElement).disabled = zavazi >= uroven.nejvetsiZavazi;
    }
    const ladeny = stavi && uroven.nejvetsiTlumic >= LADENY_TLUMIC.nejmensiHmota ? editor.ladenyTlumicVyberu : null;
    prvek('[data-nastaveni="ladeny"]', HTMLElement).hidden = ladeny === null;
    if (ladeny !== null) {
      const prepinac = prvek('[data-akce="ladeny-prepnout"]', HTMLButtonElement);
      prepinac.setAttribute("aria-pressed", String(ladeny !== undefined));
      udaj("ladeny-prepnout").textContent = t(ladeny ? "paleta.ladeny.odebrat" : "paleta.ladeny.pridat");
      for (const cast of ["ladeny-hmota", "ladeny-frekvence"]) prvek(`[data-cast="${cast}"]`, HTMLElement).hidden = !ladeny;
      if (ladeny) {
        udaj("ladeny-hmota").textContent = t("paleta.ladeny.hmota", { kg: cislo(ladeny.hmota, 0) });
        udaj("ladeny-frekvence").textContent = t("paleta.ladeny.frekvence", { f: cislo(ladeny.frekvence, 2) });
        prvek('[data-akce="ladeny-hmota-min"]', HTMLButtonElement).disabled = ladeny.hmota <= LADENY_TLUMIC.nejmensiHmota;
        prvek('[data-akce="ladeny-hmota-plus"]', HTMLButtonElement).disabled =
          ladeny.hmota + LADENY_TLUMIC.krokHmoty > uroven.nejvetsiTlumic;
        prvek('[data-akce="ladeny-frekvence-min"]', HTMLButtonElement).disabled =
          ladeny.frekvence <= LADENY_TLUMIC.nejmensiFrekvence;
        prvek('[data-akce="ladeny-frekvence-plus"]', HTMLButtonElement).disabled =
          ladeny.frekvence >= LADENY_TLUMIC.nejvetsiFrekvence;
      }
    }
    const tlumeni = stavi ? editor.tlumeniVyberu : null;
    prvek('[data-nastaveni="tlumeni"]', HTMLElement).hidden = tlumeni === null;
    if (tlumeni !== null) {
      udaj("tlumeni").textContent = t("paleta.tlumeni.hodnota", { hodnota: cislo(tlumeni / 1000, 0) });
      const rozsah = KATALOG.tlumic.tlumeni!;
      prvek('[data-akce="tlumeni-min"]', HTMLButtonElement).disabled = tlumeni <= rozsah.nejmensi;
      prvek('[data-akce="tlumeni-plus"]', HTMLButtonElement).disabled = tlumeni >= rozsah.nejvetsi;
    }
    obnovAnalyzu();
    nastav("smazat", editor.neconiJeVybrano);
    nastav("zrcadlit", navrh.pruty.length > 0);
    nastav("zpet", editor.lzeZpet);
    nastav("znovu", editor.lzeZnovu);
    nastav("smazat-vse", navrh.pruty.length > 0);
    nastav("export", navrh.pruty.length > 0);
    nastav("import", true);

    // Obálka vybraného prutu z poslední zkoušky.
    const obalka = platnaObalka();
    if (stavi && obalka && !editor.tah && editor.vybranePruty.size === 1 && editor.vybraneStycniky.size === 0) {
      const [id] = editor.vybranePruty;
      const poradi = navrh.pruty.findIndex((p) => p.id === id);
      if (poradi >= 0) ukazHlaseni(zapisObalky(obalka, poradi), "info", false);
    }

    document.body.dataset.pruty = String(navrh.pruty.length);
    // Legenda využití je vidět, jen když jsou pruty obarvené: při zkoušce a s platnou obálkou.
    document.body.dataset.vyuziti = String(!stavi || obalka !== null);
    obnovPohled();
  }

  function prepniCisla(): void {
    cisla = !cisla;
    uloziste.cislaVyuziti = cisla;
    prepinacCisel.setAttribute("aria-pressed", String(cisla));
    platno.prekresli();
  }

  // ---- Analytický panel ----

  function prepniAnalyzu(): void {
    analyzaOtevrena = !analyzaOtevrena;
    obnovAnalyzu();
  }

  /** Naplní analytický panel tím, co se v právě zobrazeném režimu dá říct. */
  function obnovAnalyzu(): void {
    const stavi = rezim === "stavba";
    // Při stavbě má panel co ukázat jen tam, kde se hraje o kmitání.
    const kDispozici = uroven.osaFrekvenci;
    tlacitkoAnalyzy.hidden = !kDispozici;
    const otevrena = analyzaOtevrena && kDispozici && stavi;
    tlacitkoAnalyzy.setAttribute("aria-pressed", String(otevrena));
    panelAnalyzy.hidden = !otevrena;
    document.body.dataset.analyza = otevrena ? "otevrena" : "zavrena";
    if (!otevrena) {
      if (tvarKmitani !== null) {
        tvarKmitani = null;
        platno.prekresli();
      }
      return;
    }

    // Dokud se po úpravě mostu počítá nový rozbor, zůstává v panelu ten minulý.
    if (rozbor === undefined) return;
    const krivka = rozbor?.krivka ?? null;
    prvek('[data-cast="krivka"]', HTMLElement).hidden = krivka === null;
    prvek('[data-cast="krivka-popis"]', HTMLElement).hidden = krivka === null;
    if (krivka) {
      const hlavni = krivka.obsazeny ?? krivka.prazdny;
      const vrcholy = vrcholyKrivky(hlavni, krivka.od, krivka.krok);
      const nejvyssi = vrcholy.reduce((a, b) => (b.hodnota > a.hodnota ? b : a), { f: 0, hodnota: 0 });
      let nejvic = 0;
      for (const hodnota of krivka.prazdny) nejvic = Math.max(nejvic, hodnota);
      for (const hodnota of krivka.obsazeny ?? []) nejvic = Math.max(nejvic, hodnota);
      stropKrivky = Math.max(stropKrivky, stropGrafu(nejvic));
      const hustota = window.devicePixelRatio || 1;
      const obrys = platnoKrivky.getBoundingClientRect();
      const sirka = Math.max(1, obrys.width);
      const vyska = Math.max(1, obrys.height);
      platnoKrivky.width = Math.round(sirka * hustota);
      platnoKrivky.height = Math.round(vyska * hustota);
      const ctx = platnoKrivky.getContext("2d");
      if (ctx) {
        ctx.setTransform(hustota, 0, 0, hustota, 0, 0);
        nakresliKrivku(ctx, sirka, vyska, {
          ...krivka,
          kroky: krokyLidi(),
          rozsah: ROZSAH_OSY,
          strop: stropKrivky,
        });
      }
      platnoKrivky.dataset.vrcholu = String(vrcholy.length);
      platnoKrivky.dataset.nejvyssi = nejvyssi.hodnota.toFixed(4);
      platnoKrivky.dataset.strop = String(stropKrivky);
      const klic = krivka.obsazeny ? "analyza.krivka.spickaSLidmi" : "analyza.krivka.spicka";
      udaj("krivka-popis").textContent = t(klic, { hodnota: cislo(nejvyssi.hodnota, 2), f: cislo(nejvyssi.f, 2) });
    }

    const frekvence = rozbor?.stabilni ? rozbor.frekvence : [];
    prvek('[data-cast="tvary"]', HTMLElement).hidden = frekvence.length === 0;
    if (tvarKmitani !== null && tvarKmitani >= frekvence.length) tvarKmitani = null;
    udaj("tvary").replaceChildren(
      ...frekvence.map((f, poradi) => {
        const tlacitko = document.createElement("button");
        tlacitko.type = "button";
        tlacitko.className = "tlacitko";
        tlacitko.dataset.tvar = String(poradi);
        tlacitko.textContent = t("analyza.tvar", { poradi: poradi + 1, f: cislo(f, 2) });
        tlacitko.title = t("analyza.tvar.popis", { f: cislo(f, 2) });
        tlacitko.setAttribute("aria-pressed", String(tvarKmitani === poradi));
        tlacitko.addEventListener("click", () => {
          tvarKmitani = tvarKmitani === poradi ? null : poradi;
          obnovAnalyzu();
          platno.prekresli();
        });
        return tlacitko;
      }),
    );
    udaj("analyza-prazdna").hidden = krivka !== null || frekvence.length > 0;
    document.body.dataset.tvar = tvarKmitani === null ? "" : String(tvarKmitani);
  }

  /** Promítne hlasitost do tlačítka v liště a do háčků pro testy. */
  function obnovZvuk(): void {
    const hlasitost = ozvuceni.hlasitost;
    tlacitkoZvuku.textContent = t(Ozvuceni.dostupne ? `zvuk.${hlasitost}` : "zvuk.nedostupny");
    tlacitkoZvuku.disabled = !Ozvuceni.dostupne;
    tlacitkoZvuku.setAttribute("aria-pressed", String(hlasitost !== "vypnuto"));
    document.body.dataset.zvuk = hlasitost;
    document.body.dataset.zvukKontext = ozvuceni.stav;
    obnovPoctyZvuku();
  }

  /** Kolik zvuků kterého druhu hra zahrála; háček pro testy. Zapisuje jen to, co se změnilo. */
  const zapsanePocty = new Map<string, number>();
  function obnovPoctyZvuku(): void {
    for (const druh of DRUHY_ZVUKU) {
      const pocet = ozvuceni.zaznelo.get(druh) ?? 0;
      if (zapsanePocty.get(druh) === pocet) continue;
      zapsanePocty.set(druh, pocet);
      document.body.setAttribute(`data-zvuku-${druh}`, String(pocet));
    }
  }

  /** Další hlasitost v řadě nahlas, potichu, vypnuto. Novou hlasitost předvede vrznutím. */
  function prepniZvuk(): void {
    if (!Ozvuceni.dostupne) return;
    const dalsi = HLASITOSTI[(HLASITOSTI.indexOf(ozvuceni.hlasitost) + 1) % HLASITOSTI.length]!;
    ozvuceni.nastavHlasitost(dalsi);
    uloziste.hlasitost = dalsi;
    ozvuceni.probud();
    obnovZvuk();
    if (dalsi === "vypnuto") return;
    const ukazka: Zvuk = { druh: "vrzani", cas: 0, x: 0, y: 0, sila: 0.8, velikost: 0.4, material: "drevo", odstin: 0.31, puvod: -1 };
    // Čerstvě vzniklý zvukový kontext se rozbíhá okamžik po gestu.
    window.setTimeout(() => {
      ozvuceni.zahraj([ukazka], () => 0);
      obnovZvuk();
    }, 150);
  }

  /** Odkud zní zvuk z daného místa světa: −1 vlevo až 1 vpravo podle polohy na plátně. */
  function panorama(x: number, y: number): number {
    const misto = svetNaObraz(kamera, platno.rozmer, { x, y });
    const podil = (2 * misto.x) / platno.rozmer.sirka - 1;
    return SIRKA_ZVUKU * Math.max(-1, Math.min(1, podil));
  }

  /**
   * Zavěsí pod vybrané styčníky laděný tlumič, nebo ho odebere. Nový se naladí na první
   * vlastní frekvenci mostu s lidmi, pokud je známá; tu má tlumič krotit nejčastěji.
   */
  function prepniLadenyTlumic(): void {
    if (rezim !== "stavba") return;
    const frekvence = rozbor?.frekvenceObsazeneho[0] ?? rozbor?.frekvence[0] ?? 2;
    editor.prepniLadenyTlumic(Math.min(300, uroven.nejvetsiTlumic), frekvence);
  }

  function smazVybrane(): void {
    if (rezim === "stavba" && editor.smazVybrane()) skryjHlaseni();
  }

  function zrcadli(): void {
    if (rezim !== "stavba") return;
    editor.zrcadli();
    if (editor.posledniDuvod) ukazHlaseni(textDuvodu(editor.posledniDuvod, null), "varovani", true);
  }

  function prepniVyber(): void {
    if (rezim !== "stavba") return;
    nastroj = nastroj === "vyber" ? "kresleni" : "vyber";
    obnovStavbu();
  }

  function prepniBrnknuti(): void {
    if (rezim !== "stavba" || !uroven.osaFrekvenci || editor.navrh.pruty.length === 0) return;
    nastroj = nastroj === "brnknuti" ? "kresleni" : "brnknuti";
    editor.zrusVyber();
    if (nastroj === "brnknuti") ukazHlaseni(t("brnknuti.navod"), "info", false);
    else skryjHlaseni();
    obnovStavbu();
  }

  // ---- Zkouška ----

  function delkaDeje(b: Beh): number {
    return b.spocitanoVse ? b.trvani : Math.max(b.trvani, b.zaznam.konec);
  }

  function spustZkousku(brnknuti?: { stycnik: number; sila: number }): void {
    if (rezim !== "stavba") return;
    editor.zrusTah();
    // Brnknout se dá i mostem dražším, než je rozpočet; zkoušet ne.
    const prekazka = prekazkyZkousky(editor.navrh, uroven).filter((p) => !(brnknuti && p.druh === "nad-rozpocet"))[0];
    if (prekazka) {
      ukazHlaseni(textDuvodu(prekazka.druh, null), "varovani", true);
      return;
    }
    skryjHlaseni();
    editor.zrusVyber();

    // Každá zkouška má vlastní vlákno, takže zprávy z opuštěné zkoušky nemůžou dorazit do nové.
    klient?.ukonci();
    const novy: Beh = {
      navrh: editor.navrh,
      zaznam: new Zaznam(),
      ucastnici: [],
      udalosti: [],
      trvani: 0,
      spocitanoVse: false,
      vysledek: null,
      vysledekUkazan: false,
      naKonecPoVypoctu: false,
      oznaceny: null,
      brnknuti: brnknuti !== undefined,
    };
    beh = novy;
    // Zkoušku pouští gesto hráče, takže smí vzniknout zvuk.
    ozvuceni.probud();
    poslech = new Poslech(uroven, editor.navrh, brnknuti?.stycnik ?? -1);
    try {
      klient = new KlientZkousky();
    } catch (chyba) {
      beh = null;
      poslech = null;
      ukazHlaseni(t("zkouska.chyba", { duvod: chyba instanceof Error ? chyba.message : String(chyba) }), "varovani", false);
      return;
    }
    klient.poslouchej((zprava) => prijmi(novy, zprava));
    klient.posli({
      typ: "start",
      vstup: {
        uroven,
        navrh: editor.navrh,
        nasada: nasadaUrovne(uroven),
        verzeFyziky: VERZE_FYZIKY,
        ...(brnknuti ? { brnknuti } : {}),
      },
    });

    rezim = "zkouska";
    prehravani = { cas: 0, bezi: true, rychlost: prehravani.rychlost };
    panelVysledku.hidden = true;
    document.body.dataset.rezim = rezim;
    document.body.dataset.zkouska = "pocita";
    delete document.body.dataset.otisk;
    obnovStavbu();
    obnovOsu();
  }

  function zpetKeStavbe(): void {
    if (rezim !== "zkouska") return;
    klient?.ukonci();
    klient = null;
    // Nedopočítaná zkouška nemá výsledek ani obálku; zahodí se.
    if (beh && !beh.vysledek) beh = null;
    if (beh) beh.oznaceny = null;
    poslech = null;
    ozvuceni.ztis();
    rezim = "stavba";
    prehravani = { ...prehravani, bezi: false };
    panelVysledku.hidden = true;
    document.body.dataset.rezim = rezim;
    skryjHlaseni();
    obnovMedaile();
    obnovStavbu();
    obnovOsu();
  }

  function prijmi(b: Beh, zprava: ZpravaZeZkousky): void {
    if (b !== beh) return;
    switch (zprava.typ) {
      case "zacatek":
        b.trvani = zprava.trvani;
        b.ucastnici = zprava.ucastnici;
        obnovZnacky();
        obnovOsu();
        break;
      case "zaznam":
        for (const stavba of zprava.topologie) b.zaznam.pridejTopologii(stavba);
        for (const s of zprava.snimky) b.zaznam.pridej(s);
        if (zprava.udalosti.length > 0) {
          b.udalosti.push(...zprava.udalosti);
          obnovZnacky();
        }
        obnovOsu();
        break;
      case "konec": {
        const vysledek = zprava.vysledek;
        b.vysledek = vysledek;
        b.trvani = vysledek.trvani;
        b.spocitanoVse = true;
        klient?.ukonci();
        klient = null;
        if (!b.brnknuti) {
          predchoziVysledek = posledniVysledek;
          posledniVysledek = vysledek;
          if (!vysledek.rozpad) {
            rekord = uloziste.zapocitej(uroven.id, vysledek.medaile, vysledek.cena, VERZE_FYZIKY);
          }
        }
        if (prehravani.cas > b.trvani || b.naKonecPoVypoctu) prehravani = { ...prehravani, cas: b.trvani, bezi: false };
        document.body.dataset.zkouska = "hotovo";
        document.body.dataset.otisk = vysledek.otisk;
        obnovZnacky();
        obnovOsu();
        break;
      }
      case "chyba": {
        const duvod = t(`zkouska.chyba.${zprava.kod}`) + (zprava.podrobnosti ? ` (${zprava.podrobnosti})` : "");
        document.body.dataset.zkouska = "chyba";
        zpetKeStavbe();
        ukazHlaseni(t("zkouska.chyba", { duvod }), "varovani", false);
        break;
      }
      case "pripraveno":
      case "rozbor":
        break;
    }
  }

  /** Promítne stav zkoušky a přehrávání do lišty a časové osy a překreslí výkres. */
  function obnovOsu(): void {
    const zkousi = rezim === "zkouska";
    tlacitkoZkousky.textContent = t(zkousi ? "zkouska.zastavit" : "zkouska.spustit");
    tlacitkoZkousky.setAttribute("aria-pressed", String(zkousi));
    for (const tlacitko of tlacitkaRychlosti) {
      tlacitko.setAttribute("aria-pressed", String(Number(tlacitko.dataset.rychlost) === prehravani.rychlost));
    }
    if (zkousi && beh) {
      const delka = delkaDeje(beh);
      tlacitkoPrehrat.textContent = t(prehravani.bezi ? "zkouska.pozastavit" : "zkouska.prehrat");
      tahlo.max = String(delka > 0 ? delka : 1);
      tahlo.value = String(prehravani.cas);
      const spocitano = beh.spocitanoVse ? 1 : delka > 0 ? Math.min(1, beh.zaznam.konec / delka) : 0;
      pruhSpocitano.style.setProperty("--spocitano", String(spocitano));
      udaj("cas").textContent = beh.spocitanoVse
        ? `${zapisCasu(prehravani.cas)} / ${zapisCasu(delka)}`
        : `${zapisCasu(prehravani.cas)} · ${t("zkouska.pocitaSe")}`;
    }
    platno.prekresli();
  }

  /** Značky na časové ose: výjezdy účastníků, porušení prutů a pády. */
  function obnovZnacky(): void {
    if (!beh) {
      znackyOsy.replaceChildren();
      return;
    }
    const delka = delkaDeje(beh);
    const znacka = (cas: number, druh: string): HTMLElement => {
      const uzel = document.createElement("span");
      uzel.className = `osa__znacka osa__znacka--${druh}`;
      uzel.style.left = `${(100 * Math.min(1, Math.max(0, cas / delka))).toFixed(2)}%`;
      return uzel;
    };
    if (!(delka > 0)) return;
    znackyOsy.replaceChildren(
      ...beh.ucastnici.map((u) => znacka(u.start, "vyjezd")),
      ...beh.udalosti.filter((u) => u.druh !== "prujezd").map((u) => znacka(u.cas, u.druh)),
    );
  }

  function prepniPrehravani(): void {
    if (rezim !== "zkouska" || !beh) return;
    const naKonci = beh.spocitanoVse && prehravani.cas >= beh.trvani;
    prehravani = naKonci ? { ...prehravani, cas: 0, bezi: true } : { ...prehravani, bezi: !prehravani.bezi };
    obnovOsu();
  }

  function skocNa(cas: number): void {
    if (rezim !== "zkouska" || !beh) return;
    prehravani = { ...prehravani, cas: Math.max(0, Math.min(cas, delkaDeje(beh))), bezi: false };
    obnovOsu();
  }

  /** Posune záznam o jeden krok vpřed nebo zpět a přehrávání zastaví. */
  function krokuj(smer: 1 | -1): void {
    skocNa(prehravani.cas + smer * KROK_ZAZNAMU);
  }

  function skocNaKonec(): void {
    if (rezim !== "zkouska" || !beh) return;
    if (beh.spocitanoVse) skocNa(beh.trvani);
    else beh.naKonecPoVypoctu = true;
  }

  /** Prut pod daným místem plátna v právě zobrazeném snímku; null, když tam žádný není. */
  function prutPodMistem(misto: Bod): number | null {
    if (!beh) return null;
    const stavba = beh.zaznam.stavV(prehravani.cas, snimek);
    if (!stavba) return null;
    let nejblizsi: number | null = null;
    let nejmensi = DOSAH_KLIKNUTI;
    for (let e = 0; e < stavba.prvekA.length; e++) {
      const prut = stavba.prut[e]!;
      if (prut < 0 || stavba.cara[e] === CARA_SKRYTA) continue;
      const d = vzdalenostOdUsecky(misto, bodSnimku(stavba.prvekA[e]!), bodSnimku(stavba.prvekB[e]!));
      if (d <= nejmensi) {
        nejmensi = d;
        nejblizsi = prut;
      }
    }
    return nejblizsi;
  }

  /** Kliknutí na prut při přehrávání: skok do okamžiku jeho největšího namáhání. */
  function klikniVeZkousce(misto: Bod): void {
    if (!beh) return;
    const prut = prutPodMistem(misto);
    beh.oznaceny = prut;
    if (prut === null) {
      skryjHlaseni();
      platno.prekresli();
      return;
    }
    if (beh.vysledek) {
      ukazHlaseni(zapisObalky(beh.vysledek, prut), "info", false);
      const obalka = beh.vysledek.obalka[prut];
      if (obalka && obalka.vyuziti > 0) skocNa(obalka.cas);
    }
    platno.prekresli();
  }

  // ---- Výsledek ----

  function obnovMedaile(): void {
    const medaile = rekord?.medaile ?? BEZ_MEDAILI;
    vypisMedaile(udaj("podminky"), uroven, medaile);
    const { znaky, popis } = znackyMedaili(uroven, medaile);
    const pole = udaj("medaile");
    pole.textContent = znaky;
    pole.title = popis;
    pole.setAttribute("aria-label", popis);
  }

  /** Porovnání s minulým pokusem na vlastním řádku; null, když není s čím srovnávat. */
  function rozdil(nove: number, stare: number | undefined, zapis: (hodnota: number) => string): HTMLElement | null {
    if (stare === undefined) return null;
    const d = nove - stare;
    const zmena = zapis(Math.abs(d)) === zapis(0) ? t("vysledek.stejne") : `${d > 0 ? "+" : "−"}${zapis(Math.abs(d))}`;
    const radek = document.createElement("span");
    radek.className = "vysledek__rozdil";
    radek.textContent = t("vysledek.protiMinule", { hodnota: zapis(stare), rozdil: zmena });
    return radek;
  }

  const bezNull = <T,>(polozky: (T | null)[]): T[] => polozky.filter((p): p is T => p !== null);

  function ukazVysledek(b: Beh, vysledek: VysledekZkousky): void {
    b.vysledekUkazan = true;
    // Medaile se v popisovém poli objeví až s výsledkem, ne už během přehrávání.
    obnovMedaile();
    const nadpis = vysledek.rozpad
      ? "vysledek.rozpad"
      : vysledek.brnknuti
        ? "vysledek.brnknuti"
        : vysledek.pruchod
          ? "vysledek.obstal"
          : "vysledek.neobstal";
    udaj("vysledek-nadpis").textContent = t(nadpis);
    panelVysledku.dataset.stav = vysledek.rozpad ? "rozpad" : vysledek.brnknuti ? "brnknuti" : vysledek.pruchod ? "obstal" : "neobstal";
    udaj("vysledek-medaile").hidden = vysledek.brnknuti !== null;

    const vety: string[] = [];
    if (vysledek.rozpad) vety.push(t("vysledek.shrnuti.rozpad"));
    else if (vysledek.brnknuti) {
      const f = vysledek.brnknuti.frekvence;
      vety.push(f === null ? t("vysledek.brnknuti.nic") : t("vysledek.brnknuti.frekvence", { f: cislo(f, 2) }));
    }
    else if (vysledek.ucastniku === 0) vety.push(t("vysledek.shrnuti.bezProvozu"));
    else if (vysledek.prejelo === vysledek.ucastniku && vysledek.spadlo === 0) {
      vety.push(t("vysledek.shrnuti.vsichni", { pocet: vysledek.ucastniku }));
    } else {
      vety.push(
        t("vysledek.shrnuti.cast", { prejelo: vysledek.prejelo, pocet: vysledek.ucastniku, spadlo: vysledek.spadlo }),
      );
    }
    if (vysledek.bezRovnovahy) vety.push(t("vysledek.bezRovnovahy"));
    const komfort = vysledek.komfort;
    if (komfort && komfort.trida > uroven.nejhorsiKomfort && vysledek.spadlo === 0 && !vysledek.rozpad) {
      vety.push(
        komfort.trida === 4
          ? t("vysledek.shrnuti.kmitani")
          : t("vysledek.shrnuti.kmitaniNadMez", { limit: cislo(MEZE_KOMFORTU[uroven.nejhorsiKomfort - 1]!, 1) }),
      );
    }
    udaj("vysledek-shrnuti").textContent = vety.join(" ");
    if (vysledek.brnknuti) document.body.dataset.brnknuti = vysledek.brnknuti.frekvence?.toFixed(3) ?? "";

    // Kmitání mostovky pod lidmi; řádek je jen v úrovních, kde se měří.
    for (const uzel of panelVysledku.querySelectorAll<HTMLElement>('[data-radek="kmitani"]')) uzel.hidden = komfort === null;
    if (komfort) {
      const poleKmitani = udaj("vysledek-kmitani");
      if (komfort.zrychleni > 0) {
        const skok = document.createElement("button");
        skok.type = "button";
        skok.className = "vysledek__skok";
        skok.textContent = t("vysledek.kmitaniHodnota", {
          zrychleni: cislo(komfort.zrychleni, 2),
          trida: t(`komfort.${komfort.trida}`),
          cas: zapisCasu(komfort.cas),
        });
        skok.addEventListener("click", () => skocNa(komfort.cas));
        poleKmitani.replaceChildren(skok);
      } else {
        poleKmitani.textContent = t("vysledek.kmitaniZadne");
      }
      poleKmitani.dataset.trida = String(komfort.trida);
    }

    vypisMedaile(udaj("vysledek-medaile"), uroven, vysledek.medaile);
    udaj("vysledek-cena").replaceChildren(
      ...bezNull([document.createTextNode(koruny(vysledek.cena)), rozdil(vysledek.cena, predchoziVysledek?.cena, koruny)]),
    );

    // Největší využití s odkazem na prut a okamžik, kdy nastalo.
    const poleVyuziti = udaj("vysledek-vyuziti");
    let nejvic = -1;
    vysledek.obalka.forEach((o, i) => {
      if (o.vyuziti > 0 && (nejvic < 0 || o.vyuziti > vysledek.obalka[nejvic]!.vyuziti)) nejvic = i;
    });
    const zmena = rozdil(vysledek.nejvetsiVyuziti, predchoziVysledek?.nejvetsiVyuziti, procenta);
    if (nejvic >= 0) {
      const o = vysledek.obalka[nejvic]!;
      const skok = document.createElement("button");
      skok.type = "button";
      skok.className = "vysledek__skok";
      skok.textContent = t("vysledek.vyuzitiPrutu", {
        vyuziti: procenta(o.vyuziti),
        prut: nejvic + 1,
        zpusob: t(nazevZpusobu(o.zpusob)),
        cas: zapisCasu(o.cas),
      });
      const prut = nejvic;
      skok.addEventListener("click", () => {
        b.oznaceny = prut;
        skocNa(o.cas);
      });
      poleVyuziti.replaceChildren(...bezNull([skok, zmena]));
    } else {
      poleVyuziti.replaceChildren(...bezNull([document.createTextNode(procenta(vysledek.nejvetsiVyuziti)), zmena]));
    }

    // Porušení prutů a sjetí z podpor: každé jde rozkliknout na časové ose.
    const poruseni = b.udalosti.filter((u) => u.druh === "poruseni" || u.druh === "sjeti");
    const radky: HTMLElement[] = poruseni.slice(0, NEJVIC_VYPSANYCH_PORUSENI).map((u) => {
      const polozka = document.createElement("li");
      const skok = document.createElement("button");
      skok.type = "button";
      skok.className = "vysledek__skok";
      skok.textContent =
        u.druh === "poruseni"
          ? t("vysledek.poruseni.radek", {
              cas: zapisCasu(u.cas),
              prut: u.prut + 1,
              zpusob: t(nazevZpusobu(u.zpusob)),
              nasledek: t(nazevNasledku(u.nasledek)),
            })
          : t("vysledek.sjeti.radek", { cas: zapisCasu(u.cas) });
      skok.addEventListener("click", () => {
        b.oznaceny = u.druh === "poruseni" ? u.prut : null;
        // Kousek před zlomem, aby byl vidět celý.
        skocNa(u.cas - 0.05);
      });
      polozka.append(skok);
      return polozka;
    });
    // Prut, kterému se utrhly oba konce naráz, by měl dva stejné řádky.
    for (let i = radky.length - 1; i > 0; i--) {
      if (radky[i]!.textContent === radky[i - 1]!.textContent) radky.splice(i, 1);
    }
    const zbytek = document.createElement("li");
    if (poruseni.length === 0) zbytek.textContent = t("vysledek.poruseni.zadne");
    else if (poruseni.length > NEJVIC_VYPSANYCH_PORUSENI) {
      zbytek.textContent = t("vysledek.poruseni.dalsi", { pocet: poruseni.length - NEJVIC_VYPSANYCH_PORUSENI });
    }
    if (zbytek.textContent) radky.push(zbytek);
    udaj("vysledek-poruseni").replaceChildren(...radky);

    // Další úroveň se nabídne, jakmile je tahle jednou projitá.
    const odkaz = prvek('[data-akce="dalsi"]', HTMLAnchorElement);
    const dalsi = kampan[kampan.findIndex((u) => u.id === uroven.id) + 1];
    const projita = rekord?.medaile.pruchod === true;
    odkaz.hidden = !(dalsi && projita && !vysledek.brnknuti && kampan.some((u) => u.id === uroven.id));
    odkaz.classList.toggle("tlacitko--hlavni", vysledek.pruchod);
    if (dalsi) odkaz.href = `?uroven=${dalsi.id}`;

    udaj("otisk").textContent = t("vysledek.otisk", { otisk: vysledek.otisk });
    panelVysledku.hidden = false;
  }

  // ---- Okno se zadáním úrovně ----

  function naplnZadani(): void {
    udaj("zadani-list").textContent = t("zadani.uroven", { id: uroven.id });
    udaj("zadani-nazev").textContent = uroven.nazev;
    const klic = `zadani.${uroven.id}`;
    udaj("zadani-text").textContent = jeKlicTextu(klic) ? t(klic) : "";

    const polozka = (text: string): HTMLLIElement => {
      const uzel = document.createElement("li");
      uzel.textContent = text;
      return uzel;
    };
    const provoz = uroven.jizdniRad.map((p) => polozka(zapisJizdy(p, true)));
    udaj("zadani-provoz").replaceChildren(...(provoz.length > 0 ? provoz : [polozka(t("zadani.provoz.zadny"))]));

    const stavba = uroven.povolenePrvky
      .filter((id) => KATALOG[id].hotovo)
      .map((id) => polozka(t("zadani.stavba.prvek", { prvek: nazevPrvku(id), cena: zapisCenyPrvku(id) })));
    if (uroven.rozpocet !== null) {
      stavba.push(polozka(t("zadani.stavba.rozpocet", { castka: koruny(uroven.rozpocet) })));
    }
    udaj("zadani-stavba").replaceChildren(...stavba);

    // Souvislost se skutečnými mosty a ukázka toho, co úroveň učí.
    const skutecnost = `skutecnost.${uroven.id}`;
    const poleSkutecnosti = udaj("zadani-skutecnost");
    poleSkutecnosti.hidden = !jeKlicTextu(skutecnost);
    if (jeKlicTextu(skutecnost)) poleSkutecnosti.textContent = t("zadani.skutecnost", { text: t(skutecnost) });
    // Návod k ovládání patří jen k úplně první úrovni.
    udaj("zadani-ovladani").hidden = uroven.id !== kampan[0]?.id;

    const zadaniUkazky = ukazkaUrovne(uroven);
    const oddil = udaj("ukazka");
    oddil.hidden = zadaniUkazky === null;
    if (zadaniUkazky) {
      for (const cast of ["a", "b", "popis"] as const) {
        const klicUkazky = `ukazka.${uroven.id}.${cast}`;
        udaj(`ukazka-${cast}`).textContent = jeKlicTextu(klicUkazky) ? t(klicUkazky) : "";
      }
      ukazka = new Ukazka(oddil, zadaniUkazky);
    }
  }

  function otevriZadani(): void {
    if (oknoZadani.open) return;
    vypisMedaile(udaj("zadani-medaile"), uroven, rekord?.medaile ?? BEZ_MEDAILI);
    oknoZadani.showModal();
    // Okno se otevírá odshora, i když je vyšší než obrazovka; mezerník a Enter ho zavřou.
    prvek('#okno-zadani button[value="zavrit"]', HTMLButtonElement).focus({ preventScroll: true });
    oknoZadani.scrollTop = 0;
    ukazka?.spust();
  }

  // ---- Okno s textem: export, import a diagnostika ----

  function otevriOkno(druh: "export" | "import" | "diagnostika", text: string): void {
    udaj("okno-nadpis").textContent = t(`okno.${druh}.nadpis`);
    udaj("okno-popis").textContent = t(`okno.${druh}.popis`);
    udaj("okno-hlaseni").textContent = "";
    obsahOkna.value = text;
    obsahOkna.readOnly = druh !== "import";
    prvek('[data-akce="okno-kopirovat"]', HTMLButtonElement).hidden = druh === "import";
    prvek('[data-akce="okno-nacist"]', HTMLButtonElement).hidden = druh !== "import";
    okno.dataset.druh = druh;
    okno.showModal();
    if (druh === "import") obsahOkna.focus();
    else obsahOkna.select();
  }

  async function zkopirujObsahOkna(): Promise<void> {
    let zkopirovano = false;
    try {
      await navigator.clipboard.writeText(obsahOkna.value);
      zkopirovano = true;
    } catch {
      obsahOkna.select();
    }
    udaj("okno-hlaseni").textContent = t(zkopirovano ? "okno.zkopirovano" : "okno.nezkopirovano");
  }

  function nactiMostZOkna(): void {
    let navrh: NavrhMostu;
    try {
      navrh = navrhZTextu(obsahOkna.value.trim());
    } catch (chyba) {
      const duvod = chyba instanceof ChybaDat || chyba instanceof Error ? chyba.message : String(chyba);
      udaj("okno-hlaseni").textContent = t("okno.import.chyba", { duvod });
      return;
    }
    if (navrh.uroven !== uroven.id) {
      udaj("okno-hlaseni").textContent = t("okno.import.jinaUroven", { uroven: navrh.uroven });
      return;
    }
    okno.close();
    editor.nahrad(navrh);
    const prekazka = prekazkyZkousky(editor.navrh, uroven)[0];
    if (prekazka) ukazHlaseni(textDuvodu(prekazka.druh, null), "varovani", true);
  }

  function textDiagnostiky(): string {
    const radky = [
      `Mostmistr ${__VERZE_HRY__} · ${__OTISK_SESTAVENI__} · fyzika v${VERZE_FYZIKY}`,
      `Úroveň: ${uroven.id} ${uroven.nazev}`,
      `Prohlížeč: ${navigator.userAgent}`,
      `Most: ${navrhNaText(beh?.navrh ?? editor.navrh)}`,
    ];
    if (beh?.vysledek) {
      radky.push(`Výsledek: ${JSON.stringify(beh.vysledek)}`);
      radky.push(`Události: ${JSON.stringify(beh.udalosti)}`);
    }
    return radky.join("\n");
  }

  // ---- Propojení s ovládáním ----

  pripojOvladani(canvas, {
    posun: (dx, dy) => zmenPohled(posunO(kamera, dx, dy)),
    zoom: zoomuj,
    zoomNaStred: zoomujNaStred,
    celyVykres: ukazCelyVykres,
    kurzor: (misto) => {
      mistoKurzoru = misto;
      obnovPohled();
    },
    leve: {
      stisk: (misto, klavesy) => {
        if (rezim === "zkouska") {
          klikniVeZkousce(misto);
          return;
        }
        if (nastroj === "brnknuti") {
          const id = editor.stycnikU(obrazNaSvet(kamera, platno.rozmer, misto));
          const poradi = id === null ? -1 : editor.navrh.stycniky.findIndex((st) => st.id === id);
          brnk = poradi >= 0 ? { stycnik: poradi, od: misto, k: misto } : null;
          return;
        }
        skryjHlaseni();
        editor.stiskni(obrazNaSvet(kamera, platno.rozmer, misto), {
          pridat: klavesy.shift,
          posouvat: klavesy.alt || nastroj === "vyber",
          bezKresleni: nastroj === "vyber",
        });
        obnovPohled();
      },
      tah: (misto) => {
        if (brnk) {
          brnk.k = misto;
          ukazHlaseni(t("brnknuti.tah", { sila: cislo(silaBrnknuti(brnk) / 1000, 1) }), "info", false);
          platno.prekresli();
          return;
        }
        if (rezim !== "stavba" || !editor.tah) return;
        editor.tahni(obrazNaSvet(kamera, platno.rozmer, misto));
        hlasTah();
        obnovPohled();
      },
      pusteni: () => {
        if (brnk) {
          const pokus = { stycnik: brnk.stycnik, sila: silaBrnknuti(brnk) };
          brnk = null;
          skryjHlaseni();
          if (pokus.sila >= NEJMENSI_BRNKNUTI) spustZkousku(pokus);
          else platno.prekresli();
          return;
        }
        if (rezim !== "stavba") return;
        const kreslil = editor.tah?.druh === "prut";
        editor.pust();
        if (editor.posledniDuvod) {
          ukazHlaseni(textDuvodu(editor.posledniDuvod, kreslil ? editor.prvek : null), "varovani", true);
        }
        obnovStavbu();
      },
      zruseni: () => {
        brnk = null;
        editor.zrusTah();
      },
    },
  });

  const priKliknuti = (akce: string, obsluha: () => void): void => {
    prvek(`[data-akce="${akce}"]`, HTMLElement).addEventListener("click", obsluha);
  };
  priKliknuti("oddalit", () => zoomujNaStred(1 / KROK_ZOOMU_TLACITKEM));
  priKliknuti("priblizit", () => zoomujNaStred(KROK_ZOOMU_TLACITKEM));
  priKliknuti("cely-vykres", ukazCelyVykres);
  priKliknuti("zkouska", () => (rezim === "stavba" ? spustZkousku() : zpetKeStavbe()));
  priKliknuti("vyber", prepniVyber);
  priKliknuti("brnknout", prepniBrnknuti);
  priKliknuti("zavazi-min", () => rezim === "stavba" && editor.zmenZavazi(-1));
  priKliknuti("zavazi-plus", () => rezim === "stavba" && editor.zmenZavazi(1));
  priKliknuti("ladeny-prepnout", prepniLadenyTlumic);
  priKliknuti("ladeny-hmota-min", () => rezim === "stavba" && editor.zmenHmotuTlumice(-1));
  priKliknuti("ladeny-hmota-plus", () => rezim === "stavba" && editor.zmenHmotuTlumice(1));
  for (const [akce, smer] of [["ladeny-frekvence-min", -1], ["ladeny-frekvence-plus", 1]] as const) {
    prvek(`[data-akce="${akce}"]`, HTMLElement).addEventListener("click", (udalost) => {
      // Se Shiftem po čtyřech krocích, tedy o 0,2 Hz.
      if (rezim === "stavba") editor.zmenFrekvenciTlumice(smer * (udalost.shiftKey ? 4 : 1));
    });
  }
  priKliknuti("tlumeni-min", () => rezim === "stavba" && editor.zmenTlumeni(-1));
  priKliknuti("tlumeni-plus", () => rezim === "stavba" && editor.zmenTlumeni(1));
  priKliknuti("smazat", smazVybrane);
  priKliknuti("zrcadlit", zrcadli);
  priKliknuti("zpet", () => rezim === "stavba" && editor.zpet());
  priKliknuti("znovu", () => rezim === "stavba" && editor.znovu());
  priKliknuti("smazat-vse", () => rezim === "stavba" && editor.smazVse());
  priKliknuti("export", () => otevriOkno("export", navrhNaText(editor.navrh)));
  priKliknuti("import", () => rezim === "stavba" && otevriOkno("import", ""));
  priKliknuti("prehrat", prepniPrehravani);
  priKliknuti("na-konec", skocNaKonec);
  priKliknuti("krok-zpet", () => krokuj(-1));
  priKliknuti("krok-vpred", () => krokuj(1));
  priKliknuti("cisla", prepniCisla);
  priKliknuti("zvuk", prepniZvuk);
  priKliknuti("analyza", prepniAnalyzu);
  priKliknuti("analyza-zavrit", prepniAnalyzu);
  platnoKrivky.addEventListener("click", () => {
    // Svislé měřítko křivky se drží; kliknutí ho přizpůsobí tomu, co je vidět teď.
    stropKrivky = 0;
    obnovAnalyzu();
  });
  priKliknuti("zadani", otevriZadani);
  priKliknuti("upravit", zpetKeStavbe);
  priKliknuti("prehrat-znovu", () => {
    if (!beh) return;
    panelVysledku.hidden = true;
    beh.vysledekUkazan = false;
    beh.oznaceny = null;
    skryjHlaseni();
    prehravani = { ...prehravani, cas: 0, bezi: true };
    obnovOsu();
  });
  priKliknuti("diagnostika", () => otevriOkno("diagnostika", textDiagnostiky()));
  priKliknuti("okno-kopirovat", () => void zkopirujObsahOkna());
  priKliknuti("okno-nacist", nactiMostZOkna);

  for (const tlacitko of tlacitkaRychlosti) {
    tlacitko.addEventListener("click", () => {
      prehravani = { ...prehravani, rychlost: Number(tlacitko.dataset.rychlost) };
      obnovOsu();
    });
  }
  tahlo.addEventListener("input", () => skocNa(Number(tahlo.value)));

  // Po kliknutí myší na tlačítko se pozornost vrací na výkres, aby mezerník dál pouštěl
  // zkoušku a nemačkal znovu poslední tlačítko.
  const otevreneOkno = (): boolean => okno.open || oknoZadani.open;
  prvek("#obrazovka-uroven", HTMLElement).addEventListener("click", (udalost) => {
    if (udalost.detail === 0 || otevreneOkno()) return;
    if (udalost.target instanceof Element && udalost.target.closest("button")) canvas.focus({ preventScroll: true });
  });

  window.addEventListener("keydown", (udalost) => {
    if (otevreneOkno() || jePsaciPole(udalost.target)) return;
    const stavi = rezim === "stavba";
    const klavesa = udalost.key.length === 1 ? udalost.key.toLowerCase() : udalost.key;

    if (udalost.ctrlKey || udalost.metaKey) {
      if (!stavi || udalost.altKey) return;
      if (klavesa === "z" && !udalost.shiftKey) editor.zpet();
      else if (klavesa === "y" || (klavesa === "z" && udalost.shiftKey)) editor.znovu();
      else if (klavesa === "a") editor.vyberVse();
      else return;
      udalost.preventDefault();
      return;
    }
    if (udalost.altKey) return;

    switch (klavesa) {
      case " ":
        // Na tlačítku a odkazu mezerník mačká je; zkoušku pouští jen jinde.
        if (udalost.target instanceof HTMLButtonElement || udalost.target instanceof HTMLAnchorElement) return;
        if (udalost.repeat) break;
        if (stavi) spustZkousku();
        else zpetKeStavbe();
        break;
      case "Escape":
        if (stavi) {
          editor.zrusVyber();
          editor.zrusTah();
          skryjHlaseni();
        } else zpetKeStavbe();
        break;
      case "Delete":
      case "Backspace":
        smazVybrane();
        break;
      case "m":
        zrcadli();
        break;
      case "v":
        prepniVyber();
        break;
      case "b":
        prepniBrnknuti();
        break;
      case "p":
        prepniPrehravani();
        break;
      case "End":
        skocNaKonec();
        break;
      case ",":
        if (stavi) return;
        krokuj(-1);
        break;
      case ".":
        if (stavi) return;
        krokuj(1);
        break;
      case "c":
        prepniCisla();
        break;
      case "z":
        prepniZvuk();
        break;
      case "l":
        prepniLadenyTlumic();
        break;
      case "a":
        prepniAnalyzu();
        break;
      default: {
        const poradi = Number(klavesa) - 1;
        const id = Number.isInteger(poradi) ? uroven.povolenePrvky[poradi] : undefined;
        if (!id) return;
        zvolPrvek(id);
      }
    }
    udalost.preventDefault();
  });

  // ---- Přehrávání ----

  const poleKmitani = udaj("kmitani");
  let predchoziSnimekObrazu: number | null = null;
  function snimekObrazu(ted: number): void {
    const uplynulo = predchoziSnimekObrazu === null ? 0 : Math.min(0.1, (ted - predchoziSnimekObrazu) / 1000);
    predchoziSnimekObrazu = ted;
    if (rezim === "zkouska" && beh) {
      const b = beh;
      if (prehravani.bezi) {
        // Dokud se počítá, lze přehrávat jen to, co už je v záznamu, a konec děje není znám.
        const spocitano = b.spocitanoVse ? b.trvani : b.zaznam.konec;
        const novy = posunPrehravani(prehravani, uplynulo, spocitano, b.spocitanoVse ? b.trvani : Infinity);
        if (novy.cas !== prehravani.cas || novy.bezi !== prehravani.bezi) {
          prehravani = novy;
          obnovOsu();
        }
      }
      if (b.vysledek && !b.vysledekUkazan && prehravani.cas >= b.trvani - 1e-6) ukazVysledek(b, b.vysledek);
      // Zvuk: co v právě přehraném úseku záznamu zaznělo. Skok po ose je potichu.
      if (poslech) {
        const zvuky = poslech.posun(b, prehravani.cas);
        if (zvuky.length > 0) {
          // Zpomalené přehrávání zní hlouběji a pomaleji, zrychlené naopak.
          const tempo = Math.max(0.5, Math.min(1.5, Math.pow(prehravani.rychlost, 0.3)));
          ozvuceni.zahraj(zvuky, (z) => panorama(z.x, z.y), tempo);
          obnovPoctyZvuku();
        }
        ozvuceni.valeni(prehravani.bezi ? poslech.valeni : 0, panorama(poslech.valeniX, 0));
      }
      // Okamžité kmitání mostovky v právě přehrávaném okamžiku.
      const meri = maLidi && !b.brnknuti && b.zaznam.stavV(prehravani.cas, snimek) !== null;
      const text = meri ? t("legenda.kmitani", { zrychleni: cislo(snimek.kmitani, 2) }) : "";
      if (poleKmitani.textContent !== text) poleKmitani.textContent = text;
    } else {
      if (poleKmitani.textContent !== "") poleKmitani.textContent = "";
      // Předváděný tvar kmitání se houpe, i když se na výkresu nic jiného neděje.
      if (tvarKmitani !== null && rezim === "stavba") platno.prekresli();
    }
    requestAnimationFrame(snimekObrazu);
  }
  requestAnimationFrame(snimekObrazu);

  // ---- Úvodní naplnění stránky ----

  vytvorPaletu();
  udaj("uroven").textContent = `${uroven.id}  ${uroven.nazev}`;
  udaj("nazev").textContent = uroven.nazev;
  udaj("list").textContent = uroven.id;
  udaj("verze").textContent = `${__VERZE_HRY__} · ${__OTISK_SESTAVENI__}`;
  udaj("datum").textContent = datum(new Date());
  const klicZadani = `zadani.${uroven.id}`;
  udaj("zadani").textContent = jeKlicTextu(klicZadani) ? t(klicZadani) : "";
  document.title = `${uroven.id} ${uroven.nazev} – ${t("hra.nazev")}`;

  udaj("jizdni-rad").replaceChildren(
    ...uroven.jizdniRad.map((polozka) => {
      const uzel = document.createElement("span");
      uzel.className = "osa__polozka";
      uzel.textContent = zapisJizdy(polozka);
      return uzel;
    }),
  );

  naplnZadani();
  oknoZadani.addEventListener("close", () => ukazka?.zastav());
  prepinacCisel.setAttribute("aria-pressed", String(cisla));
  obnovZvuk();
  obnovAnalyzu();
  document.body.dataset.rezim = rezim;
  document.body.dataset.zkouska = "";
  obnovMedaile();
  obnovStavbu();
  obnovOsu();
  ukazCelyVykres();
  // Před stavbou si má hráč přečíst, co ho čeká; k rozestavěnému mostu se zadání nevnucuje.
  if (editor.navrh.pruty.length === 0) otevriZadani();

  // Dotaz na verzi fyziky zároveň ověří, že pracovní vlákno se simulací funguje.
  pomocny
    .zjistiVerziFyziky()
    .then((verze) => {
      udaj("fyzika").textContent = `v${verze}`;
    })
    .catch(() => {
      udaj("fyzika").textContent = t("pole.fyzikaNedostupna");
    });
  if (uroven.osaFrekvenci) naplanujRozbor();
}
