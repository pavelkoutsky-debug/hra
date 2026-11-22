// Přehled kampaně: kapitoly, karty úrovní s náhledem výkresu, medailemi a zámky.

import { BEZ_MEDAILI } from "../data/ulozeni";
import type { Uroven } from "../data/uroven";
import { prvek, udaj } from "../ui/dom";
import { koruny } from "../ui/formaty";
import { jeKlicTextu, t } from "../ui/slovnik";
import { celyVyrez } from "../vykres/kamera";
import { nakresliNavrh } from "../vykres/navrh";
import { nakresliVykres } from "../vykres/vykres";
import { znackyMedaili } from "./medaile";
import type { Uloziste } from "./uloziste";

const SIRKA_NAHLEDU = 280;
const VYSKA_NAHLEDU = 170;

/** Číslo kapitoly z id úrovně, např. 1 pro „1-03“. */
function kapitolaUrovne(uroven: Uroven): string {
  return uroven.id.split("-")[0] ?? "";
}

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

function kartaUrovne(uroven: Uroven, predchozi: Uroven | undefined, uloziste: Uloziste): HTMLElement {
  const rekord = uloziste.rekord(uroven.id);
  // Úroveň, kterou hráč už jednou prošel, zůstává odemčená, i když před ni později přibyla
  // nová kapitola (kapitola 3 se zařadila před dřív vydanou kapitolu 5).
  const odemceno =
    uloziste.odemcenoVse ||
    predchozi === undefined ||
    uloziste.rekord(predchozi.id)?.medaile.pruchod === true ||
    rekord?.medaile.pruchod === true;

  const polozka = document.createElement("li");
  polozka.className = "karta";
  polozka.dataset.uroven = uroven.id;
  polozka.dataset.zamceno = String(!odemceno);

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
  nazev.textContent = uroven.nazev;
  hlavicka.append(id, nazev);

  const stav = document.createElement("span");
  stav.className = "karta__stav";
  if (!odemceno && predchozi) {
    stav.textContent = t("prehled.zamceno", { uroven: predchozi.id });
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
  }

  obal.append(nahled, hlavicka, stav);
  polozka.append(obal);
  return polozka;
}

/** Spustí přehled kampaně. `hlaseni` je zpráva, kterou má přehled ukázat nahoře (neznámá úroveň). */
export function spustPrehled(kampan: readonly Uroven[], uloziste: Uloziste, hlaseni = ""): void {
  prvek("#obrazovka-prehled", HTMLElement).hidden = false;
  const kapitoly = prvek(".prehled__kapitoly", HTMLElement);
  const volba = prvek("#odemknout-vse", HTMLInputElement);

  const vykresli = (): void => {
    const cisla = [...new Set(kampan.map(kapitolaUrovne))];
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
            .map((uroven, poradi) => ({ uroven, predchozi: kampan[poradi - 1] }))
            .filter(({ uroven }) => kapitolaUrovne(uroven) === cislo)
            .map(({ uroven, predchozi }) => kartaUrovne(uroven, predchozi, uloziste)),
        );
        oddil.append(nadpis, tema, seznam);
        return oddil;
      }),
    );
  };

  volba.checked = uloziste.odemcenoVse;
  volba.addEventListener("change", () => {
    uloziste.odemcenoVse = volba.checked;
    vykresli();
  });

  const zpravy = [hlaseni];
  if (!uloziste.trvale) zpravy.push(t("prehled.bezPameti"));
  if (uloziste.poskozeno) zpravy.push(t("prehled.poskozeno"));
  const text = zpravy.filter((z) => z !== "").join(" ");
  const poleHlaseni = udaj("prehled-hlaseni");
  poleHlaseni.textContent = text;
  poleHlaseni.hidden = text === "";

  udaj("prehled-verze").textContent = `${t("hra.nazev")} ${__VERZE_HRY__} · ${__OTISK_SESTAVENI__}`;
  vykresli();
  document.body.dataset.rezim = "prehled";
}
