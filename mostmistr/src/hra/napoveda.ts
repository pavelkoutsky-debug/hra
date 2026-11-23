// Nápověda k úrovni: z čeho je most autora hry, který úrovní projde, a jeho obrys na výkresu.
// Je postupná: nejdřív seznam prvků (kolik a čeho), teprve na další kliknutí obrys. Co který
// prut v obrysu je, už hráč musí vymyslet sám.

import type { NavrhMostu } from "../data/navrh";
import { soupisMostu } from "../data/soupis";
import { prvek, udaj } from "../ui/dom";
import { celeCislo, cislo, koruny } from "../ui/formaty";
import { t } from "../ui/slovnik";

export interface MoznostiNapovedy {
  /** Ukáže nebo schová obrys mostu na výkresu. */
  nastavObrys: (videt: boolean) => void;
  /** Hráč otevřel nápovědu (krok 1) nebo si nechal ukázat obrys (krok 2). */
  pouzita: (krok: 1 | 2) => void;
}

export interface Napoveda {
  otevri(): void;
  /** Je obrys právě vidět? */
  readonly obrys: boolean;
}

/**
 * Napojí okno `#okno-napoveda` na most, který úrovní projde. `rozpocetMedaile` je cena, do
 * které se musí vejít most pro medaili za rozpočet (null, když ji úroveň nemá): věta o ceně
 * podle ní řekne pravdu o tom, co most z nápovědy získá.
 */
export function pripojNapovedu(reseni: NavrhMostu, rozpocetMedaile: number | null, moznosti: MoznostiNapovedy): Napoveda {
  const okno = prvek("#okno-napoveda", HTMLDialogElement);
  const seznam = udaj("napoveda-soupis");
  const tlacitko = prvek('[data-akce="napoveda-obrys"]', HTMLButtonElement);
  let obrys = false;

  const soupis = soupisMostu(reseni);
  const polozka = (text: string): HTMLLIElement => {
    const uzel = document.createElement("li");
    uzel.textContent = text;
    return uzel;
  };
  const radky = soupis.prvky.map((r) =>
    polozka(t("napoveda.prvek", { prvek: t(`prvek.${r.prvek}`), prutu: r.prutu, metru: cislo(r.metru, r.metru % 1 === 0 ? 0 : 1) })),
  );
  // Zdvih pístu, hmotnost závaží a ladění tlumiče se z obrysu vyčíst nedají: patří do soupisu.
  if (soupis.zdvihy.length > 0) {
    radky.push(polozka(t("napoveda.zdvih", { zdvihy: soupis.zdvihy.map((z) => `${z > 0 ? "+" : z < 0 ? "−" : ""}${cislo(Math.abs(z), 1)} m`).join(", ") })));
  }
  if (soupis.svaru > 0) radky.push(polozka(t("napoveda.svaru", { pocet: soupis.svaru })));
  if (soupis.zamku > 0) radky.push(polozka(t("napoveda.zamku", { pocet: soupis.zamku })));
  if (soupis.napinaku > 0) radky.push(polozka(t("napoveda.napinaku", { pocet: soupis.napinaku })));
  if (soupis.zavazi > 0) {
    const hmoty = soupis.zavaziPodleHmoty.map((r) => `${r.pocet}× ${celeCislo(r.kg)} kg`).join(", ");
    radky.push(polozka(t("napoveda.zavazi", { pocet: soupis.zavazi, hmoty })));
  }
  if (soupis.tlumicu > 0) {
    const ladeni = soupis.tlumicePodleNastaveni
      .map((r) => t("napoveda.tlumic", { pocet: r.pocet, kg: celeCislo(r.kg), hz: cislo(r.hz, 2) }))
      .join(", ");
    radky.push(polozka(t("napoveda.tlumicu", { pocet: soupis.tlumicu, ladeni })));
  }
  seznam.replaceChildren(...radky);
  // Most z nápovědy je ten nejjednodušší, který projde; co s ním hráč získá, záleží na ceně.
  udaj("napoveda-cena").textContent =
    rozpocetMedaile === null
      ? t("napoveda.cena", { cena: koruny(soupis.cena) })
      : t(soupis.cena <= rozpocetMedaile ? "napoveda.cena.vejdeSe" : "napoveda.cena.draha", {
          cena: koruny(soupis.cena),
          limit: koruny(rozpocetMedaile),
        });

  const obnov = (): void => {
    tlacitko.textContent = t(obrys ? "napoveda.obrys.schovat" : "napoveda.obrys.ukazat");
    tlacitko.setAttribute("aria-pressed", String(obrys));
    document.body.dataset.napoveda = obrys ? "obrys" : "soupis";
  };

  tlacitko.addEventListener("click", () => {
    obrys = !obrys;
    moznosti.nastavObrys(obrys);
    if (obrys) moznosti.pouzita(2);
    obnov();
    // S obrysem se má stavět: okno uhne, ať je výkres vidět.
    if (obrys) okno.close();
  });

  return {
    otevri(): void {
      moznosti.pouzita(1);
      obnov();
      okno.showModal();
    },
    get obrys(): boolean {
      return obrys;
    },
  };
}
