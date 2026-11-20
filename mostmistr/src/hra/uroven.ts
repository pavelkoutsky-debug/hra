// Obrazovka úrovně: stavba mostu na výkresu, zkouška v pracovním vlákně, přehrávání
// záznamu na časové ose a vyhodnocení s medailemi.

import { cenaNavrhu, hmotnostNavrhu } from "../data/cena";
import type { Bod } from "../data/geometrie";
import { jeUvnitr } from "../data/geometrie";
import { KATALOG, type IdPrvku } from "../data/katalog";
import { ChybaDat } from "../data/kontrola";
import { navrhNaText, navrhZTextu, type DruhProblemu, type NavrhMostu } from "../data/navrh";
import { BEZ_MEDAILI, type Rekord } from "../data/ulozeni";
import type { Uroven } from "../data/uroven";
import { Editor } from "../editor/editor";
import { prekazkyZkousky } from "../editor/pravidla";
import { prazdnyNavrh } from "../editor/upravy";
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
import { nakresliVykres } from "../vykres/vykres";
import { KlientZkousky } from "../zkouska/klient";
import type { PopisUcastnika } from "../zkouska/provoz";
import type { Udalost, VysledekZkousky, ZpravaZeZkousky } from "../zkouska/protokol";
import { CARA_SKRYTA, prazdnySnimek, Zaznam, type Snimek, type Topologie } from "../zkouska/zaznam";
import { nasadaUrovne } from "../../urovne/index";
import { vypisMedaile, znackyMedaili } from "./medaile";
import type { Uloziste } from "./uloziste";

/** Volný okraj kolem výřezu při zobrazení celého výkresu, v pixelech. */
const OKRAJ_VYKRESU = 28;
const KROK_ZOOMU_TLACITKEM = 1.25;
/** Jak daleko od prutu se při zkoušce ještě počítá kliknutí na něj, v pixelech. */
const DOSAH_KLIKNUTI = 9;
/** Kolik porušení výsledek vypíše jmenovitě; zbytek shrne počtem. */
const NEJVIC_VYPSANYCH_PORUSENI = 5;
/** Po jaké době zmizí hlášení, které na nic nečeká, v milisekundách. */
const DOBA_HLASENI = 6000;

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
  let nastroj: "kresleni" | "vyber" = "kresleni";
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
    return beh !== null && beh.vysledek !== null && beh.navrh === editor.navrh ? beh.vysledek : null;
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
        nakresliProvoz(ctx, kamera, rozmer, beh.ucastnici, snimek);
        return;
      }
    } else {
      nakresliVykres(ctx, { uroven, kamera, rozmer, kurzor });
    }
    // Stavba, nebo zkouška, ze které ještě nedorazil první snímek.
    const stavi = rezim === "stavba";
    const svet = stavi && mistoKurzoru ? obrazNaSvet(kamera, rozmer, mistoKurzoru) : null;
    nakresliNavrh(ctx, kamera, rozmer, {
      navrh: editor.navrh,
      vybranePruty: editor.vybranePruty,
      vybraneStycniky: editor.vybraneStycniky,
      tah: stavi ? editor.tah : null,
      zacatek: svet && nastroj === "kresleni" ? editor.mistoZacatku(svet) : null,
      problemy: prekazkyZkousky(editor.navrh, uroven),
      obalka: platnaObalka()?.obalka.map((o) => o.vyuziti) ?? null,
    });
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
        cena.textContent =
          "zaMetr" in polozka.cena
            ? t("paleta.cenaZaMetr", { cena: koruny(polozka.cena.zaMetr), delka: cislo(polozka.nejvetsiDelka, 0) })
            : t("paleta.cenaZaKus", { cena: koruny(polozka.cena.zaKus), delka: cislo(polozka.nejvetsiDelka, 0) });
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
    }
    obnovStavbu();
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
    obnovPohled();
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

  // ---- Zkouška ----

  function delkaDeje(b: Beh): number {
    return b.spocitanoVse ? b.trvani : Math.max(b.trvani, b.zaznam.konec);
  }

  function spustZkousku(): void {
    if (rezim !== "stavba") return;
    editor.zrusTah();
    const prekazka = prekazkyZkousky(editor.navrh, uroven)[0];
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
    };
    beh = novy;
    try {
      klient = new KlientZkousky();
    } catch (chyba) {
      beh = null;
      ukazHlaseni(t("zkouska.chyba", { duvod: chyba instanceof Error ? chyba.message : String(chyba) }), "varovani", false);
      return;
    }
    klient.poslouchej((zprava) => prijmi(novy, zprava));
    klient.posli({
      typ: "start",
      vstup: { uroven, navrh: editor.navrh, nasada: nasadaUrovne(uroven), verzeFyziky: VERZE_FYZIKY },
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
        predchoziVysledek = posledniVysledek;
        posledniVysledek = vysledek;
        if (!vysledek.rozpad) {
          rekord = uloziste.zapocitej(uroven.id, vysledek.medaile, vysledek.cena, VERZE_FYZIKY);
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
    const nadpis = vysledek.rozpad ? "vysledek.rozpad" : vysledek.pruchod ? "vysledek.obstal" : "vysledek.neobstal";
    udaj("vysledek-nadpis").textContent = t(nadpis);
    panelVysledku.dataset.stav = vysledek.rozpad ? "rozpad" : vysledek.pruchod ? "obstal" : "neobstal";

    const vety: string[] = [];
    if (vysledek.rozpad) vety.push(t("vysledek.shrnuti.rozpad"));
    else if (vysledek.ucastniku === 0) vety.push(t("vysledek.shrnuti.bezProvozu"));
    else if (vysledek.prejelo === vysledek.ucastniku && vysledek.spadlo === 0) {
      vety.push(t("vysledek.shrnuti.vsichni", { pocet: vysledek.ucastniku }));
    } else {
      vety.push(
        t("vysledek.shrnuti.cast", { prejelo: vysledek.prejelo, pocet: vysledek.ucastniku, spadlo: vysledek.spadlo }),
      );
    }
    if (vysledek.bezRovnovahy) vety.push(t("vysledek.bezRovnovahy"));
    udaj("vysledek-shrnuti").textContent = vety.join(" ");

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
    odkaz.hidden = !(dalsi && projita && kampan.some((u) => u.id === uroven.id));
    odkaz.classList.toggle("tlacitko--hlavni", vysledek.pruchod);
    if (dalsi) odkaz.href = `?uroven=${dalsi.id}`;

    udaj("otisk").textContent = t("vysledek.otisk", { otisk: vysledek.otisk });
    panelVysledku.hidden = false;
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
        skryjHlaseni();
        editor.stiskni(obrazNaSvet(kamera, platno.rozmer, misto), {
          pridat: klavesy.shift,
          posouvat: klavesy.alt || nastroj === "vyber",
          bezKresleni: nastroj === "vyber",
        });
        obnovPohled();
      },
      tah: (misto) => {
        if (rezim !== "stavba" || !editor.tah) return;
        editor.tahni(obrazNaSvet(kamera, platno.rozmer, misto));
        hlasTah();
        obnovPohled();
      },
      pusteni: () => {
        if (rezim !== "stavba") return;
        const kreslil = editor.tah?.druh === "prut";
        editor.pust();
        if (editor.posledniDuvod) {
          ukazHlaseni(textDuvodu(editor.posledniDuvod, kreslil ? editor.prvek : null), "varovani", true);
        }
        obnovStavbu();
      },
      zruseni: () => editor.zrusTah(),
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
  priKliknuti("smazat", smazVybrane);
  priKliknuti("zrcadlit", zrcadli);
  priKliknuti("zpet", () => rezim === "stavba" && editor.zpet());
  priKliknuti("znovu", () => rezim === "stavba" && editor.znovu());
  priKliknuti("smazat-vse", () => rezim === "stavba" && editor.smazVse());
  priKliknuti("export", () => otevriOkno("export", navrhNaText(editor.navrh)));
  priKliknuti("import", () => rezim === "stavba" && otevriOkno("import", ""));
  priKliknuti("prehrat", prepniPrehravani);
  priKliknuti("na-konec", skocNaKonec);
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
  prvek("#obrazovka-uroven", HTMLElement).addEventListener("click", (udalost) => {
    if (udalost.detail === 0 || okno.open) return;
    if (udalost.target instanceof Element && udalost.target.closest("button")) canvas.focus({ preventScroll: true });
  });

  window.addEventListener("keydown", (udalost) => {
    if (okno.open || jePsaciPole(udalost.target)) return;
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
      case "p":
        prepniPrehravani();
        break;
      case "End":
        skocNaKonec();
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
      const klic = `provoz.${polozka.druh}`;
      const nazev = jeKlicTextu(klic) ? t(klic) : t("provoz.jiny");
      const pocet = polozka.pocet ?? 1;
      const uzel = document.createElement("span");
      uzel.className = "osa__polozka";
      uzel.textContent = t("rad.polozka", {
        cas: cislo(polozka.cas, Number.isInteger(polozka.cas) ? 0 : 1),
        smer: polozka.smer === 1 ? "→" : "←",
        kdo: pocet > 1 ? t("rad.vice", { pocet, kdo: nazev }) : nazev,
      });
      return uzel;
    }),
  );

  document.body.dataset.rezim = rezim;
  document.body.dataset.zkouska = "";
  obnovMedaile();
  obnovStavbu();
  obnovOsu();
  ukazCelyVykres();

  // Dotaz na verzi fyziky zároveň ověří, že pracovní vlákno se simulací funguje.
  const zkusebni = new KlientZkousky();
  zkusebni
    .zjistiVerziFyziky()
    .then((verze) => {
      udaj("fyzika").textContent = `v${verze}`;
    })
    .catch(() => {
      udaj("fyzika").textContent = t("pole.fyzikaNedostupna");
    })
    .finally(() => zkusebni.ukonci());
}
