// Závěrečný list kampaně (`?list`): souhrn toho, co hráč postavil, a galerie jeho mostů po
// kapitolách. Dokud kampaň není projitá celá, je to průběžný přehled „Moje mosty“; po poslední
// úrovni závěrečný list. Dá se stáhnout jako obrázek.

import { souhrnListu, type PolozkaListu, type SouhrnListu } from "../data/galerie";
import { kapitolaUrovne } from "../data/kampan";
import type { Uroven } from "../data/uroven";
import type { Denik } from "../denik/denik";
import { prvek, udaj } from "../ui/dom";
import { celeCislo, datum, delka, hmotnost, koruny } from "../ui/formaty";
import { jeKlicTextu, nazevUrovne, t } from "../ui/slovnik";
import { nakresliList, nakresliNahledMostu, SIRKA_LISTU, vyskaListu, type ObsahListu } from "../vykres/list";
import { znackyMedaili } from "./medaile";
import type { Uloziste } from "./uloziste";

const SIRKA_NAHLEDU = 280;
const VYSKA_NAHLEDU = 170;

/** Druhý řádek pod náhledem: medaile a cena mostu, nebo proč tu most není. */
function popisPolozky(p: PolozkaListu): string {
  if (!p.most || p.cena === null) return t("list.karta.zadny");
  if (p.puvod === "rozestaveny") return t("list.karta.rozestaveny", { cena: koruny(p.cena) });
  return `${znackyMedaili(p.uroven, p.medaile).znaky} · ${koruny(p.cena)}`;
}

function nazevKapitoly(cislo: string): string {
  const klic = `kapitola.${cislo}.nazev`;
  return t("prehled.kapitola", { cislo, nazev: jeKlicTextu(klic) ? t(klic) : "" });
}

function cislaListu(s: SouhrnListu): { popisek: string; hodnota: string }[] {
  return [
    { popisek: t("list.cislo.urovne"), hodnota: t("list.cislo.zCelku", { kolik: celeCislo(s.projito), celkem: celeCislo(s.urovni) }) },
    { popisek: t("list.cislo.medaile"), hodnota: t("list.cislo.zCelku", { kolik: celeCislo(s.medaili), celkem: celeCislo(s.medailiCelkem) }) },
    { popisek: t("list.cislo.mistrovske"), hodnota: celeCislo(s.pocty.mistrovska) },
    { popisek: t("list.cislo.rozpeti"), hodnota: delka(s.rozpeti) },
    { popisek: t("list.cislo.cena"), hodnota: koruny(s.cena) },
    { popisek: t("list.cislo.hmotnost"), hodnota: hmotnost(s.hmotnost) },
  ];
}

function kartaListu(p: PolozkaListu): HTMLElement {
  const polozka = document.createElement("li");
  polozka.className = "karta karta--list";
  polozka.dataset.uroven = p.uroven.id;
  polozka.dataset.puvod = p.puvod;
  const obal = document.createElement("a");
  obal.className = "karta__obal";
  obal.href = `?uroven=${p.uroven.id}`;

  const nahled = document.createElement("canvas");
  nahled.className = "karta__nahled";
  nahled.setAttribute("aria-hidden", "true");
  const hustota = window.devicePixelRatio || 1;
  nahled.width = Math.round(SIRKA_NAHLEDU * hustota);
  nahled.height = Math.round(VYSKA_NAHLEDU * hustota);
  const ctx = nahled.getContext("2d", { alpha: false });
  if (ctx) {
    ctx.setTransform(hustota, 0, 0, hustota, 0, 0);
    nakresliNahledMostu(ctx, p.uroven, p.most, SIRKA_NAHLEDU, VYSKA_NAHLEDU);
  }

  const hlavicka = document.createElement("span");
  hlavicka.className = "karta__hlavicka";
  const id = document.createElement("span");
  id.className = "karta__id";
  id.textContent = p.uroven.id;
  const nazev = document.createElement("span");
  nazev.className = "karta__nazev";
  nazev.textContent = nazevUrovne(p.uroven);
  hlavicka.append(id, nazev);

  const stav = document.createElement("span");
  stav.className = "karta__stav";
  stav.textContent = popisPolozky(p);
  if (p.most && p.puvod === "galerie") stav.title = znackyMedaili(p.uroven, p.medaile).popis;

  obal.append(nahled, hlavicka, stav);
  polozka.append(obal);
  return polozka;
}

/** Spustí obrazovku závěrečného listu. */
export function spustList(kampan: readonly Uroven[], uloziste: Uloziste, denik: Denik): void {
  prvek("#obrazovka-list", HTMLElement).hidden = false;
  const souhrn = souhrnListu(kampan, {
    medaile: (id) => uloziste.rekord(id)?.medaile,
    galerie: uloziste.galerie,
    rozestaveny: (id) => uloziste.navrh(id),
  });
  const nadpis = t(souhrn.dokonceno ? "list.nadpis.dokonceno" : "list.nadpis.prubezny");
  const veta = souhrn.dokonceno
    ? t("list.veta.dokonceno", { urovni: celeCislo(souhrn.urovni), datum: datum(new Date()) })
    : t("list.veta.prubezny", { projito: celeCislo(souhrn.projito), urovni: celeCislo(souhrn.urovni) });
  const cisla = cislaListu(souhrn);
  const kapitoly = [...new Set(kampan.map((u) => kapitolaUrovne(u.id)))].map((cislo) => ({
    nadpis: nazevKapitoly(cislo),
    polozky: souhrn.polozky.filter((p) => kapitolaUrovne(p.uroven.id) === cislo),
  }));

  udaj("list-oddil").textContent = nadpis;
  udaj("list-nadpis").textContent = nadpis;
  udaj("list-veta").textContent = veta;
  udaj("list-cisla").replaceChildren(
    ...cisla.flatMap((c) => {
      const dt = document.createElement("dt");
      dt.textContent = c.popisek;
      const dd = document.createElement("dd");
      dd.textContent = c.hodnota;
      const obal = document.createElement("div");
      obal.append(dt, dd);
      return [obal];
    }),
  );
  udaj("list-kapitoly").replaceChildren(
    ...kapitoly.map((kapitola) => {
      const oddil = document.createElement("section");
      oddil.className = "kapitola";
      const h = document.createElement("h2");
      h.textContent = kapitola.nadpis;
      const seznam = document.createElement("ol");
      seznam.className = "kapitola__urovne";
      seznam.append(...kapitola.polozky.map(kartaListu));
      oddil.append(h, seznam);
      return oddil;
    }),
  );
  // Úrovně projité dřív, než hra galerii vedla, v ní most nemají: list to přizná.
  const bezMostu = souhrn.polozky.some((p) => p.medaile.pruchod && p.puvod !== "galerie");
  const poznamka = udaj("list-poznamka");
  poznamka.hidden = !bezMostu;
  poznamka.textContent = bezMostu ? t("list.poznamka") : "";

  const stav = document.body.dataset;
  stav.rezim = "list";
  stav.list = souhrn.dokonceno ? "dokonceno" : "prubezny";
  stav.listMostu = String(souhrn.mostu);

  const platno = udaj("list-platno") as HTMLCanvasElement;
  prvek('[data-akce="list-obrazek"]', HTMLButtonElement).addEventListener("click", () => {
    const obsah: ObsahListu = {
      hra: t("hra.nazev"),
      nadpis,
      veta,
      cisla,
      kapitoly: kapitoly.map((kapitola) => ({
        nadpis: kapitola.nadpis,
        dlazdice: kapitola.polozky.map((p) => ({ uroven: p.uroven, most: p.most, nazev: `${p.uroven.id} · ${nazevUrovne(p.uroven)}`, popis: popisPolozky(p) })),
      })),
      adresa: window.location.host,
    };
    platno.width = SIRKA_LISTU;
    platno.height = vyskaListu(obsah);
    const ctx = platno.getContext("2d", { alpha: false });
    if (!ctx) return;
    nakresliList(ctx, obsah);
    platno.toBlob((blob) => {
      if (!blob) return;
      const adresa = URL.createObjectURL(blob);
      const odkaz = document.createElement("a");
      odkaz.href = adresa;
      odkaz.download = "mostmistr-list.png";
      odkaz.click();
      window.setTimeout(() => URL.revokeObjectURL(adresa), 10_000);
      stav.listStazeno = String(blob.size);
      udaj("list-hlaseni").textContent = t("list.stazeno");
      denik.zapis("ovladani", { co: "list-obrazek", dokonceno: souhrn.dokonceno });
    }, "image/png");
  });

  denik.zapis("list.otevren", { dokonceno: souhrn.dokonceno, projito: souhrn.projito, mostu: souhrn.mostu, medaili: souhrn.medaili });
}
