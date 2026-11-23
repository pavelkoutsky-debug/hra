// Medaile úrovně na stránce: seznam s podmínkami a krátký zápis značkami.

import type { Medaile } from "../data/ulozeni";
import { kdoCestuje, type Uroven } from "../data/uroven";
import { MEZE_KOMFORTU } from "../jadro/komfort";
import { cislo, koruny, procenta } from "../ui/formaty";
import { jeClovek } from "../zkouska/provoz";
import { t, type KlicTextu } from "../ui/slovnik";

const ZNAK_ZISKANE = "◆";
const ZNAK_CHYBEJICI = "◇";

interface RadekMedaile {
  nazev: KlicTextu;
  podminka: string;
  ziskana: boolean;
}

/** Medaile, které úroveň uděluje, s podmínkou slovy. */
const KLIC_CESTUJICICH = {
  autobus: "medaile.mistrovska.cestujici",
  vlak: "medaile.mistrovska.cestujiciVlaku",
  oboji: "medaile.mistrovska.cestujiciObojich",
} as const;

/** Jde číslo beze ztráty napsat na jedno desetinné místo? Limit 0,25 by jinak vyšel jako 0,3. */
function naDesetiny(hodnota: number): boolean {
  return Math.abs(hodnota * 10 - Math.round(hodnota * 10)) < 1e-9;
}

/** Podmínka mistrovské medaile slovy; null, když ji úroveň nemá. */
export function podminkaMistrovske(uroven: Uroven): string | null {
  const bonus = uroven.mistrovska;
  if (bonus === null) return null;
  return bonus.druh === "rezerva"
    ? t("medaile.mistrovska.rezerva", { limit: procenta(bonus.limit) })
    : bonus.druh === "komfort-chodcu"
      ? t("medaile.mistrovska.komfort", { limit: cislo(bonus.limit, naDesetiny(bonus.limit) ? 1 : 2) })
      : bonus.druh === "komfort-cestujicich"
        ? t(KLIC_CESTUJICICH[kdoCestuje(uroven) ?? "autobus"], { limit: cislo(bonus.limit, 2) })
        : bonus.druh === "dosednuti"
          ? t("medaile.mistrovska.dosednuti", { limit: cislo(bonus.limit / 1000, 0) })
          : t("medaile.mistrovska.jina");
}

function radky(uroven: Uroven, medaile: Readonly<Medaile>): RadekMedaile[] {
  // Kde jdou přes most lidé, patří k průchodu i to, že se pod nimi most nerozkmitá. Platí to
  // i v úrovních bez osy frekvencí (první kapitola): zkouška mez hlídá všude, kde lidé jdou,
  // a podmínka nesmí mlčet o něčem, kvůli čemu most neprojde.
  const lide = uroven.jizdniRad.some((p) => jeClovek(p.druh));
  const pruchod = lide
    ? t("medaile.pruchod.podminkaSKmitanim", { limit: cislo(MEZE_KOMFORTU[uroven.nejhorsiKomfort - 1]!, 1) })
    : t("medaile.pruchod.podminka");
  const seznam: RadekMedaile[] = [{ nazev: "medaile.pruchod", podminka: pruchod, ziskana: medaile.pruchod }];
  if (uroven.inzenyrskyRozpocet !== null) {
    seznam.push({
      nazev: "medaile.rozpocet",
      podminka: t("medaile.rozpocet.podminka", { castka: koruny(uroven.inzenyrskyRozpocet) }),
      ziskana: medaile.rozpocet,
    });
  }
  const mistrovska = podminkaMistrovske(uroven);
  if (mistrovska !== null) seznam.push({ nazev: "medaile.mistrovska", podminka: mistrovska, ziskana: medaile.mistrovska });
  return seznam;
}

/**
 * Naplní seznam `<ul class="medaile">` medailemi úrovně. S `drive` (medaile z rekordu úrovně)
 * odliší medaili, kterou tenhle most nezískal, ale hráč ji už má z jiného pokusu: medaile se
 * mezi pokusy sčítají a prázdný kosočtverec by vypadal, jako by o ni přišel.
 */
export function vypisMedaile(
  seznam: HTMLElement,
  uroven: Uroven,
  medaile: Readonly<Medaile>,
  drive?: Readonly<Medaile>,
): void {
  const zDrivejska = drive ? radky(uroven, drive).map((r) => r.ziskana) : [];
  seznam.replaceChildren(
    ...radky(uroven, medaile).map((radek, i) => {
      const polozka = document.createElement("li");
      const uzMa = !radek.ziskana && zDrivejska[i] === true;
      polozka.dataset.ziskana = uzMa ? "drive" : String(radek.ziskana);
      const znak = document.createElement("span");
      znak.className = "medaile__znak";
      znak.textContent = radek.ziskana || uzMa ? ZNAK_ZISKANE : ZNAK_CHYBEJICI;
      znak.title = t(radek.ziskana ? "medaile.ziskana" : uzMa ? "medaile.drive" : "medaile.chybi");
      const nazev = document.createElement("span");
      nazev.className = "medaile__nazev";
      nazev.textContent = t(radek.nazev);
      const podminka = document.createElement("span");
      podminka.className = "medaile__podminka";
      podminka.textContent = uzMa ? `${radek.podminka} ${t("medaile.drive.poznamka")}` : radek.podminka;
      polozka.append(znak, nazev, podminka);
      return polozka;
    }),
  );
}

/**
 * Medaile do pruhu výsledku: tři značky s názvem vedle sebe; podmínka je v bublině a celá
 * v podrobnostech výsledku.
 */
export function vypisMedailePruhu(seznam: HTMLElement, uroven: Uroven, medaile: Readonly<Medaile>, drive?: Readonly<Medaile>): void {
  const zDrivejska = drive ? radky(uroven, drive).map((r) => r.ziskana) : [];
  seznam.replaceChildren(
    ...radky(uroven, medaile).map((radek, i) => {
      const polozka = document.createElement("li");
      const uzMa = !radek.ziskana && zDrivejska[i] === true;
      polozka.dataset.ziskana = uzMa ? "drive" : String(radek.ziskana);
      const stav = t(radek.ziskana ? "medaile.ziskana" : uzMa ? "medaile.drive" : "medaile.chybi");
      polozka.title = `${stav}: ${radek.podminka}`;
      // Stav medaile nese jen znak a barva: čtečce obrazovky se řekne slovy.
      polozka.setAttribute("aria-label", `${t(radek.nazev)}: ${stav}`);
      const znak = document.createElement("span");
      znak.className = "medaile__znak";
      znak.textContent = radek.ziskana || uzMa ? ZNAK_ZISKANE : ZNAK_CHYBEJICI;
      const nazev = document.createElement("span");
      nazev.textContent = t(radek.nazev);
      polozka.append(znak, nazev);
      return polozka;
    }),
  );
}

/** Krátký zápis medailí značkami, např. „◆◆◇“, a jeho čtený popis. */
export function znackyMedaili(uroven: Uroven, medaile: Readonly<Medaile>): { znaky: string; popis: string } {
  const seznam = radky(uroven, medaile);
  return {
    znaky: seznam.map((r) => (r.ziskana ? ZNAK_ZISKANE : ZNAK_CHYBEJICI)).join(" "),
    popis: seznam.map((r) => `${t(r.nazev)}: ${t(r.ziskana ? "medaile.ziskana" : "medaile.chybi")}`).join(", "),
  };
}
