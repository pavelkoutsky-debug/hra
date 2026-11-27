// Výzvy o efektivitu na stránce: seznam tří výzev úrovně s tím, co hráč dokázal, jaký má
// stupeň a co chce stupeň další. Pravidla a prahy jsou v `src/data/vyzvy.ts`.

import { platnyZlom, zastaralyZlom, type Rekord } from "../data/ulozeni";
import {
  dalsiPrah,
  DRUHY_VYZEV,
  mensiJeLepsi,
  stupenVyzvy,
  zobrazenaHodnota,
  type DruhVyzvy,
  type PrahyVyzev,
  type StupenVyzvy,
  type ZakladVyzev,
} from "../data/vyzvy";
import { VERZE_FYZIKY } from "../jadro/verze";
import { celeCislo, cislo, koruny, procenta } from "../ui/formaty";
import { t } from "../ui/slovnik";

const ZNAK_STUPNE = "●";
const ZNAK_BEZ_STUPNE = "○";

/**
 * Hodnota výzvy slovy: cena v korunách, hmotnost v kg nebo t, únosnost v tunách na 100 000 Kč.
 * Píše přesně to číslo, podle kterého se stupně porovnávají (`zobrazenaHodnota`).
 */
export function zapisVyzvy(druh: DruhVyzvy, hodnota: number): string {
  const videt = zobrazenaHodnota(druh, hodnota);
  if (druh === "cena") return koruny(videt);
  if (druh === "hmotnost") {
    // Tři platné číslice: do deseti tun v kilogramech, výš v tunách.
    if (videt < 10_000) return `${celeCislo(videt)}\u00a0kg`;
    return `${cislo(videt / 1000, videt < 100_000 ? 1 : 0)}\u00a0t`;
  }
  return t("vyzva.zlom.hodnota", { tun: cislo(videt, 1) });
}

/**
 * Co hráč ve výzvě zatím dokázal; null, dokud ji neměřil. Únosnost změřená jinou verzí
 * fyziky se nepočítá (viz `platnyZlom`).
 */
export function hodnotaVyzvy(druh: DruhVyzvy, rekord: Rekord | undefined): number | null {
  if (!rekord) return null;
  return druh === "cena" ? rekord.nejlepsiCena : druh === "hmotnost" ? rekord.nejlepsiHmotnost : platnyZlom(rekord, VERZE_FYZIKY);
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
 * referenční most) slouží k poznámce, o kolik je hráč lepší než autor hry. `tento` je to, co
 * ve výzvách změřila právě skončená zkouška (ve výsledku zkoušky; jinde se nedává);
 * `poruseny` říká, že most prošel, ale něco se na něm porušilo, a do ceny ani hmotnosti se
 * proto nepočítá. `doZlomuPodVice`: tlačítko Do zlomu je v paletě schované pod „Více“ (první
 * kapitola) a věta, která na něj posílá, to musí říct.
 */
export function vypisVyzvy(
  seznam: HTMLElement,
  prahy: PrahyVyzev,
  zaklad: ZakladVyzev,
  rekord: Rekord | undefined,
  tento: Partial<Record<DruhVyzvy, number | null>> = {},
  poruseny = false,
  doZlomuPodVice = false,
): void {
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
      // Rekord změřený starší verzí výpočtu neplatí; hráč má vědět, proč zmizel.
      if (hodnota === null && druh === "zlom" && zastaralyZlom(rekord, VERZE_FYZIKY)) casti.push(t("vyzva.zlom.zastaralo"));
      else if (hodnota === null) casti.push(t(druh === "zlom" ? (doZlomuPodVice ? "vyzva.zlom.nezkouseno.vice" : "vyzva.zlom.nezkouseno") : poruseny ? "vyzva.poruseny" : "vyzva.nezmereno"));
      else {
        // Řádek ukazuje rekord. Když právě zkoušený most dopadl jinak, řekne to, jinak by pod
        // sebou stála dvě různá čísla bez vysvětlení.
        const ted = tento[druh];
        const jinak = ted !== null && ted !== undefined && zobrazenaHodnota(druh, ted) !== zobrazenaHodnota(druh, hodnota);
        casti.push(
          jinak ? t("vyzva.rekord", { rekord: zapisVyzvy(druh, hodnota), tento: zapisVyzvy(druh, ted) }) : zapisVyzvy(druh, hodnota),
          t(`vyzva.stupen.${stupen}`),
        );
        // Kdo je lepší než nejlepší referenční most, má to vědět: zlato je jen jeho úroveň.
        const autor = druh === "zlom" ? zaklad.zlom : zaklad[druh];
        const lepsi = mensiJeLepsi(druh) ? (autor - hodnota) / autor : (hodnota - autor) / autor;
        if (lepsi >= 0.005) casti.push(t("vyzva.lepsiNezAutor", { podil: procenta(lepsi) }));
        if (poruseny && druh !== "zlom") casti.push(t("vyzva.poruseny"));
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
