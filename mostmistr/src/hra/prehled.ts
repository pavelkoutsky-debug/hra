// Přehled kampaně: kapitoly, karty úrovní s náhledem výkresu, medailemi a zámky.

import { zakladVyzev } from "../../urovne/vyzvy";
import { kapitolaUrovne, zamkyKampane, type Zamek } from "../data/kampan";
import { BEZ_MEDAILI } from "../data/ulozeni";
import { prahyVyzev } from "../data/vyzvy";
import type { Denik } from "../denik/denik";
import type { Uroven } from "../data/uroven";
import { prvek, udaj } from "../ui/dom";
import { koruny } from "../ui/formaty";
import { jeKlicTextu, nazevUrovne, t } from "../ui/slovnik";
import { celyVyrez } from "../vykres/kamera";
import { nakresliNavrh } from "../vykres/navrh";
import { nakresliVykres } from "../vykres/vykres";
import { znackyMedaili } from "./medaile";
import { OZNAMENI_M12, type Uloziste } from "./uloziste";
import { pripojVazbu } from "./vazba";
import { popisVyzev, stupneVyzev } from "./vyzvy";
import { pripojZaznam } from "./zaznam";

const SIRKA_NAHLEDU = 280;
const VYSKA_NAHLEDU = 170;

/** Nakreslí na kartu zmenšený výkres úrovně s rozpracovaným mostem. */
function nakresliNahled(canvas: HTMLCanvasElement, uroven: Uroven, uloziste: Uloziste): void {
  const hustota = window.devicePixelRatio || 1;
  canvas.width = Math.round(SIRKA_NAHLEDU * hustota);
  canvas.height = Math.round(VYSKA_NAHLEDU * hustota);
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;
  ctx.setTransform(hustota, 0, 0, hustota, 0, 0);
  const rozmer = { sirka: SIRKA_NAHLEDU, vyska: VYSKA_NAHLEDU };
  const kamera = celyVyrez(uroven.vyrez, rozmer, 4);
  nakresliVykres(ctx, { uroven, kamera, rozmer, kurzor: null, nahled: true });
  const navrh = uloziste.navrh(uroven.id);
  if (navrh) {
    nakresliNavrh(ctx, kamera, rozmer, {
      navrh,
      vybranePruty: new Set(),
      vybraneStycniky: new Set(),
      tah: null,
      zacatek: null,
      problemy: [],
      obalka: null,
    });
  }
}

function kartaUrovne(uroven: Uroven, zamek: Zamek | null, uloziste: Uloziste): HTMLElement {
  const rekord = uloziste.rekord(uroven.id);
  const odemceno = uloziste.odemcenoVse || zamek === null;

  const polozka = document.createElement("li");
  polozka.className = "karta";
  polozka.dataset.uroven = uroven.id;
  polozka.dataset.zamceno = String(!odemceno);
  if (uroven.zkouskova) polozka.dataset.zkouskova = "true";

  const obal = document.createElement(odemceno ? "a" : "div");
  obal.className = "karta__obal";
  if (obal instanceof HTMLAnchorElement) obal.href = `?uroven=${uroven.id}`;

  const nahled = document.createElement("canvas");
  nahled.className = "karta__nahled";
  nahled.setAttribute("aria-hidden", "true");
  nakresliNahled(nahled, uroven, uloziste);

  const hlavicka = document.createElement("span");
  hlavicka.className = "karta__hlavicka";
  const id = document.createElement("span");
  id.className = "karta__id";
  id.textContent = uroven.id;
  const nazev = document.createElement("span");
  nazev.className = "karta__nazev";
  nazev.textContent = nazevUrovne(uroven);
  hlavicka.append(id, nazev);
  if (uroven.zkouskova) {
    // Zkouška kapitoly: bez ukázky a bez nápovědy. Štítek to řekne dřív, než ji hráč otevře.
    const stitek = document.createElement("span");
    stitek.className = "karta__stitek";
    stitek.textContent = t("prehled.zkouska");
    stitek.title = t("prehled.zkouska.popis");
    hlavicka.append(stitek);
  }

  const stav = document.createElement("span");
  stav.className = "karta__stav";
  if (!odemceno && zamek) {
    stav.textContent =
      zamek.druh === "uroven"
        ? t("prehled.zamceno", { uroven: zamek.uroven })
        : t(zamek.zbyva === 1 ? "prehled.zamceno.kapitola.jedna" : "prehled.zamceno.kapitola", { kapitola: zamek.kapitola, zbyva: zamek.zbyva });
  } else {
    const { znaky, popis } = znackyMedaili(uroven, rekord?.medaile ?? BEZ_MEDAILI);
    const medaile = document.createElement("span");
    medaile.className = "karta__medaile";
    medaile.textContent = znaky;
    medaile.title = popis;
    medaile.setAttribute("aria-label", popis);
    const cena = document.createElement("span");
    const nejlepsi = rekord?.nejlepsiCena ?? null;
    cena.textContent =
      nejlepsi !== null
        ? t("prehled.nejlepsiCena", { cena: koruny(nejlepsi) })
        : t(uloziste.navrh(uroven.id)?.pruty.length ? "prehled.rozpracovano" : "prehled.nezkouseno");
    stav.append(medaile, cena);
    // Výzvy o efektivitu: součet stupňů, jakmile je úroveň projitá.
    const zaklad = rekord?.medaile.pruchod ? zakladVyzev(uroven) : null;
    if (zaklad) {
      const prahy = prahyVyzev(zaklad);
      const vyzvy = document.createElement("span");
      vyzvy.className = "karta__vyzvy";
      const { soucet } = stupneVyzev(prahy, rekord);
      vyzvy.textContent = t("vyzvy.prehled", { soucet });
      vyzvy.title = popisVyzev(prahy, rekord);
      vyzvy.dataset.vyzvy = String(soucet);
      stav.append(vyzvy);
    }
  }

  obal.append(nahled, hlavicka, stav);
  polozka.append(obal);
  return polozka;
}

/** Kolik toho hráč v kampani dokázal: projité úrovně, medaile a stupně výzev o efektivitu. */
export function postupKampani(
  kampan: readonly Uroven[],
  uloziste: Uloziste,
): { projito: number; medaili: number; medailiCelkem: number; vyzev: number; vyzevCelkem: number } {
  const postup = { projito: 0, medaili: 0, medailiCelkem: 0, vyzev: 0, vyzevCelkem: 0 };
  for (const uroven of kampan) {
    const rekord = uloziste.rekord(uroven.id);
    const medaile = rekord?.medaile ?? BEZ_MEDAILI;
    if (medaile.pruchod) postup.projito += 1;
    // Medaili za rozpočet a mistrovskou má jen úroveň, která je uděluje.
    postup.medailiCelkem += 1 + Number(uroven.inzenyrskyRozpocet !== null) + Number(uroven.mistrovska !== null);
    postup.medaili +=
      Number(medaile.pruchod) +
      Number(medaile.rozpocet && uroven.inzenyrskyRozpocet !== null) +
      Number(medaile.mistrovska && uroven.mistrovska !== null);
    const zaklad = zakladVyzev(uroven);
    if (zaklad) {
      postup.vyzevCelkem += 9;
      // Stupně výzev se počítají jen na projité úrovni, stejně jako je ukazuje její karta.
      if (medaile.pruchod) postup.vyzev += stupneVyzev(prahyVyzev(zaklad), rekord).soucet;
    }
  }
  return postup;
}

/** Spustí přehled kampaně. `hlaseni` je zpráva, kterou má přehled ukázat nahoře (neznámá úroveň). */
export function spustPrehled(kampan: readonly Uroven[], uloziste: Uloziste, denik: Denik, hlaseni = ""): void {
  prvek("#obrazovka-prehled", HTMLElement).hidden = false;
  const kapitoly = prvek(".prehled__kapitoly", HTMLElement);
  const volba = prvek("#odemknout-vse", HTMLInputElement);

  const vykresli = (): void => {
    const cisla = [...new Set(kampan.map((u) => kapitolaUrovne(u.id)))];
    const zamky = zamkyKampane(
      kampan.map((u) => u.id),
      (id) => ({
        projita: uloziste.rekord(id)?.medaile.pruchod === true,
        rozestavena: (uloziste.navrh(id)?.pruty.length ?? 0) > 0,
      }),
    );
    kapitoly.replaceChildren(
      ...cisla.map((cislo) => {
        const oddil = document.createElement("section");
        oddil.className = "kapitola";
        const klicNazvu = `kapitola.${cislo}.nazev`;
        const klicTematu = `kapitola.${cislo}.tema`;
        const nadpis = document.createElement("h1");
        nadpis.textContent = t("prehled.kapitola", { cislo, nazev: jeKlicTextu(klicNazvu) ? t(klicNazvu) : "" });
        const tema = document.createElement("p");
        tema.className = "kapitola__tema";
        tema.textContent = jeKlicTextu(klicTematu) ? t(klicTematu) : "";
        const seznam = document.createElement("ol");
        seznam.className = "kapitola__urovne";
        seznam.append(
          ...kampan
            .map((uroven, poradi) => ({ uroven, zamek: zamky[poradi] ?? null }))
            .filter(({ uroven }) => kapitolaUrovne(uroven.id) === cislo)
            .map(({ uroven, zamek }) => kartaUrovne(uroven, zamek, uloziste)),
        );
        oddil.append(nadpis, tema, seznam);
        return oddil;
      }),
    );
  };

  // Odemknutí všech úrovní je pomůcka pro zkoušení hry: nabízí se jen s ?vyvoj=1 v adrese.
  // Kdo ji už má zapnutou, vidí ji taky, ať ji může zase vypnout.
  const proVyvoj = new URLSearchParams(window.location.search).get("vyvoj") === "1" || uloziste.odemcenoVse;
  for (const uzel of document.querySelectorAll<HTMLElement>("[data-jen-vyvoj]")) uzel.hidden = !proVyvoj;
  volba.checked = uloziste.odemcenoVse;
  volba.addEventListener("change", () => {
    uloziste.odemcenoVse = volba.checked;
    vykresli();
  });

  const zpravy = [hlaseni];
  if (!uloziste.trvale) zpravy.push(t("prehled.bezPameti"));
  if (uloziste.poskozeno) zpravy.push(t("prehled.poskozeno"));
  // Hráč se starším postupem se jednou dozví, proč má jiné medaile a prázdné rekordy výzev.
  if (uloziste.oznameni === OZNAMENI_M12) {
    zpravy.push(t("prehled.novaPravidla"));
    uloziste.odlozOznameni();
  }
  const text = zpravy.filter((z) => z !== "").join(" ");
  const poleHlaseni = udaj("prehled-hlaseni");
  poleHlaseni.textContent = text;
  poleHlaseni.hidden = text === "";

  // Otisk sestavení je údaj pro hlášení chyb: v patičce je jen v bublině.
  udaj("prehled-verze").textContent = `${t("hra.nazev")} ${__VERZE_HRY__}`;
  udaj("prehled-verze").title = `${__VERZE_HRY__} · ${__OTISK_SESTAVENI__}`;
  vykresli();

  // Postup kampaní: kolik úrovní je projitých, kolik medailí a stupňů výzev hráč má.
  const postup = postupKampani(kampan, uloziste);
  const polePostupu = udaj("prehled-postup");
  const dokonceno = postup.projito === kampan.length && kampan.length > 0;
  polePostupu.textContent = t("prehled.postup", {
    projito: postup.projito,
    urovni: kampan.length,
    medaili: postup.medaili,
    medailiCelkem: postup.medailiCelkem,
    vyzev: postup.vyzev,
    vyzevCelkem: postup.vyzevCelkem,
  });
  polePostupu.title = t("prehled.postup.popis");
  polePostupu.dataset.projito = String(postup.projito);
  polePostupu.dataset.dokonceno = String(dokonceno);
  // Dokončená kampaň má vlastní oznámení: věta přilepená za čísla by zanikla.
  const poleDokonceno = udaj("prehled-dokonceno");
  poleDokonceno.hidden = !dokonceno;
  poleDokonceno.replaceChildren();
  if (dokonceno) {
    const nadpis = document.createElement("strong");
    nadpis.textContent = t("prehled.dokonceno.nadpis");
    poleDokonceno.append(nadpis, document.createTextNode(` ${t("prehled.dokonceno")}`));
  }
  document.body.dataset.rezim = "prehled";

  // Zpětná vazba a deník hraní: v přehledu není most, který by šel přiložit.
  pripojVazbu(denik, { uroven: () => undefined, navrh: () => undefined });
  pripojZaznam(denik);
  const rekordy = kampan.map((u) => uloziste.rekord(u.id)?.medaile);
  denik.zapis("prehled.otevren", {
    proslych: rekordy.filter((m) => m?.pruchod).length,
    medaili: rekordy.reduce((soucet, m) => soucet + (m ? Number(m.pruchod) + Number(m.rozpocet) + Number(m.mistrovska) : 0), 0),
    vyzev: postup.vyzev,
    odemcenoVse: uloziste.odemcenoVse,
  });
}
