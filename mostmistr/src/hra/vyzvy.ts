// Výzvy o efektivitu na stránce: seznam tří výzev úrovně s tím, co hráč dokázal, jaký má
// stupeň a co chce stupeň další. Pravidla a prahy jsou v `src/data/vyzvy.ts`.

import type { Rekord } from "../data/ulozeni";
import {
  dalsiPrah,
  DRUHY_VYZEV,
  mensiJeLepsi,
  stupenVyzvy,
  type DruhVyzvy,
  type PrahyVyzev,
  type StupenVyzvy,
  type ZakladVyzev,
} from "../data/vyzvy";
import { TIHOVE_ZRYCHLENI } from "../jadro/integrator";
import { cislo, hmotnost, koruny, procenta } from "../ui/formaty";
import { t } from "../ui/slovnik";

const ZNAK_STUPNE = "●";
const ZNAK_BEZ_STUPNE = "○";

/** Únosnost na korunu (N/Kč) v tunách na 100 000 Kč: číslo, které se dá představit. */
export function tunNaStoTisic(naKorunu: number): number {
  return (naKorunu * 100_000) / TIHOVE_ZRYCHLENI / 1000;
}

/** Hodnota výzvy slovy: cena v korunách, hmotnost v kg nebo t, únosnost v tunách na 100 000 Kč. */
export function zapisVyzvy(druh: DruhVyzvy, hodnota: number): string {
  if (druh === "cena") return koruny(hodnota);
  if (druh === "hmotnost") return hmotnost(hodnota);
  return t("vyzva.zlom.hodnota", { tun: cislo(tunNaStoTisic(hodnota), 1) });
}

/** Co hráč ve výzvě zatím dokázal; null, dokud ji neměřil. */
export function hodnotaVyzvy(druh: DruhVyzvy, rekord: Rekord | undefined): number | null {
  if (!rekord) return null;
  return druh === "cena" ? rekord.nejlepsiCena : druh === "hmotnost" ? rekord.nejlepsiHmotnost : rekord.nejlepsiZlom;
}

/** Stupně všech tří výzev úrovně a jejich součet (0 až 9). */
export function stupneVyzev(prahy: PrahyVyzev, rekord: Rekord | undefined): { stupne: Record<DruhVyzvy, StupenVyzvy>; soucet: number } {
  const stupne = { cena: 0, hmotnost: 0, zlom: 0 } as Record<DruhVyzvy, StupenVyzvy>;
  let soucet = 0;
  for (const druh of DRUHY_VYZEV) {
    stupne[druh] = stupenVyzvy(druh, hodnotaVyzvy(druh, rekord), prahy);
    soucet += stupne[druh];
  }
  return { stupne, soucet };
}

/** Jednořádkový popis výzev úrovně pro přehled kampaně, např. „nejlevnější most: stříbro; …“. */
export function popisVyzev(prahy: PrahyVyzev, rekord: Rekord | undefined): string {
  const { stupne } = stupneVyzev(prahy, rekord);
  return DRUHY_VYZEV.map((druh) => `${t(`vyzva.${druh}`)}: ${t(`vyzva.stupen.${stupne[druh]}`)}`).join("; ");
}

/**
 * Naplní seznam `<ul class="vyzvy">` třemi výzvami úrovně. `zaklad` (co dokázal nejlepší
 * referenční most) slouží k poznámce, o kolik je hráč lepší než autor hry.
 */
export function vypisVyzvy(seznam: HTMLElement, prahy: PrahyVyzev, zaklad: ZakladVyzev, rekord: Rekord | undefined): void {
  seznam.replaceChildren(
    ...DRUHY_VYZEV.map((druh) => {
      const hodnota = hodnotaVyzvy(druh, rekord);
      const stupen = stupenVyzvy(druh, hodnota, prahy);
      const polozka = document.createElement("li");
      polozka.dataset.vyzva = druh;
      polozka.dataset.stupen = String(stupen);
      const znak = document.createElement("span");
      znak.className = "vyzvy__znak";
      znak.textContent = ZNAK_STUPNE.repeat(stupen) + ZNAK_BEZ_STUPNE.repeat(3 - stupen);
      znak.title = t(`vyzva.stupen.${stupen}`);
      const nazev = document.createElement("span");
      nazev.className = "vyzvy__nazev";
      nazev.textContent = t(`vyzva.${druh}`);
      const stav = document.createElement("span");
      stav.className = "vyzvy__stav";
      const casti: string[] = [];
      if (hodnota === null) casti.push(t(druh === "zlom" ? "vyzva.zlom.nezkouseno" : "vyzva.nezmereno"));
      else {
        casti.push(zapisVyzvy(druh, hodnota), t(`vyzva.stupen.${stupen}`));
        // Kdo je lepší než nejlepší referenční most, má to vědět: zlato je jen jeho úroveň.
        const autor = druh === "zlom" ? zaklad.zlom : zaklad[druh];
        const lepsi = mensiJeLepsi(druh) ? (autor - hodnota) / autor : (hodnota - autor) / autor;
        if (lepsi >= 0.005) casti.push(t("vyzva.lepsiNezAutor", { podil: procenta(lepsi) }));
      }
      const prah = dalsiPrah(druh, stupen, prahy);
      if (prah !== null) {
        casti.push(
          t(mensiJeLepsi(druh) ? "vyzva.dalsi.do" : "vyzva.dalsi.od", {
            stupen: t(`vyzva.stupen.${(stupen + 1) as StupenVyzvy}`),
            prah: zapisVyzvy(druh, prah),
          }),
        );
      }
      stav.textContent = casti.join(" · ");
      polozka.append(znak, nazev, stav);
      return polozka;
    }),
  );
}
