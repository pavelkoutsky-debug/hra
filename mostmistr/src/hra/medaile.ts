// Medaile úrovně na stránce: seznam s podmínkami a krátký zápis značkami.

import type { Medaile } from "../data/ulozeni";
import type { Uroven } from "../data/uroven";
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
function radky(uroven: Uroven, medaile: Readonly<Medaile>): RadekMedaile[] {
  // Kde jdou přes most lidé, patří k průchodu i to, že se pod nimi most nerozkmitá.
  const lide = uroven.jizdniRad.some((p) => jeClovek(p.druh));
  const pruchod =
    lide && uroven.osaFrekvenci
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
  const bonus = uroven.mistrovska;
  if (bonus !== null) {
    seznam.push({
      nazev: "medaile.mistrovska",
      podminka:
        bonus.druh === "rezerva"
          ? t("medaile.mistrovska.rezerva", { limit: procenta(bonus.limit) })
          : bonus.druh === "komfort-chodcu"
            ? t("medaile.mistrovska.komfort", { limit: cislo(bonus.limit, 1) })
            : t("medaile.mistrovska.jina"),
      ziskana: medaile.mistrovska,
    });
  }
  return seznam;
}

/** Naplní seznam `<ul class="medaile">` medailemi úrovně. */
export function vypisMedaile(seznam: HTMLElement, uroven: Uroven, medaile: Readonly<Medaile>): void {
  seznam.replaceChildren(
    ...radky(uroven, medaile).map((radek) => {
      const polozka = document.createElement("li");
      polozka.dataset.ziskana = String(radek.ziskana);
      const znak = document.createElement("span");
      znak.className = "medaile__znak";
      znak.textContent = radek.ziskana ? ZNAK_ZISKANE : ZNAK_CHYBEJICI;
      znak.title = t(radek.ziskana ? "medaile.ziskana" : "medaile.chybi");
      const nazev = document.createElement("span");
      nazev.className = "medaile__nazev";
      nazev.textContent = t(radek.nazev);
      const podminka = document.createElement("span");
      podminka.className = "medaile__podminka";
      podminka.textContent = radek.podminka;
      polozka.append(znak, nazev, podminka);
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
