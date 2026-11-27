// Medaile úrovně na stránce: seznam s podmínkami a krátký zápis značkami.

import type { Medaile } from "../data/ulozeni";
import { kdoCestuje, type Uroven } from "../data/uroven";
import { MEZE_KOMFORTU } from "../jadro/komfort";
import { cislo, koruny, procenta } from "../ui/formaty";
import { jeClovek } from "../zkouska/provoz";
import { aktualniJazyk, t, type KlicTextu } from "../ui/slovnik";
import type { VysledekZkousky } from "../zkouska/protokol";

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

/**
 * Využití prutu, jak ho píše výsledek: těsně u meze mistrovské medaile na desetinu procenta,
 * aby „25 %“ u medaile „do 25 %“, kterou most nedostal (má 25,09 %), nevypadalo jako chyba hry.
 */
export function zapisVyuzitiUMeze(podil: number, mez: number | null): string {
  return mez !== null && podil !== mez && Math.round(podil * 100) === Math.round(mez * 100)
    ? `${cislo(podil * 100, 2)}${aktualniJazyk() === "cs" ? "\u00a0" : ""}%`
    : procenta(podil);
}

/** Zrychlení v m/s² na dvě místa; těsně u meze na tři, aby nevypadalo stejně jako mez. */
export function zrychleniUMeze(hodnota: number, mez: number | null): string {
  return mez !== null && hodnota !== mez && cislo(hodnota, 2) === cislo(mez, 2) ? cislo(hodnota, 3) : cislo(hodnota, 2);
}

/** Síla v kN, jak ji píše výsledek; těsně u meze na desetinu. */
function silaUMeze(newtony: number, mez: number): string {
  const kN = (n: number, mist: number): string => `${cislo(n / 1000, mist)} kN`;
  return newtony !== mez && kN(newtony, 0) === kN(mez, 0) ? kN(newtony, 1) : kN(newtony, 0);
}

/** Proč tenhle most medaili nezískal; po medailích v pořadí, null u získané. */
export interface ProcMedaile {
  pruchod: string | null;
  rozpocet: string | null;
  mistrovska: string | null;
}

/**
 * Krátký důvod s čísly ke každé medaili, kterou most ze zkoušky `v` nezískal. Počítá se
 * stejně jako medaile ve zkoušce (`src/zkouska/zkouska.ts`) a píše stejnými formáty jako
 * řádky výsledku: hráč nemusí čísla porovnávat sám.
 */
export function procNeziskal(uroven: Uroven, v: VysledekZkousky): ProcMedaile {
  const pruchod = v.medaile.pruchod ? null : t("medaile.proc.pruchod");
  let rozpocet: string | null = null;
  if (!v.medaile.rozpocet && uroven.inzenyrskyRozpocet !== null) {
    if (!v.medaile.pruchod) rozpocet = t("medaile.proc.nejdrivPruchod");
    else {
      const duvody: string[] = [];
      if (!v.neporuseny) {
        if (v.poruseni > 0) duvody.push(t("medaile.proc.povolilo"));
        else if (v.nejvetsiVyuziti > 1 + 1e-9) {
          let prut = 0;
          v.obalka.forEach((o, i) => {
            if (o.vyuziti > (v.obalka[prut]?.vyuziti ?? 0)) prut = i;
          });
          duvody.push(t("medaile.proc.pretizeno", { prut: prut + 1, vyuziti: procenta(v.nejvetsiVyuziti) }));
        } else duvody.push(t("medaile.proc.sjelo"));
      }
      if (v.cena > uroven.inzenyrskyRozpocet) duvody.push(t("medaile.proc.drazsi", { castka: koruny(v.cena - uroven.inzenyrskyRozpocet) }));
      rozpocet = duvody.join("; ") || null;
    }
  }
  let mistrovska: string | null = null;
  const bonus = uroven.mistrovska;
  if (!v.medaile.mistrovska && bonus !== null) {
    if (!v.medaile.rozpocet) mistrovska = t(uroven.inzenyrskyRozpocet !== null ? "medaile.proc.nejdrivRozpocet" : "medaile.proc.nejdrivPruchod");
    else if (bonus.druh === "rezerva")
      mistrovska = t("medaile.proc.vyuziti", { hodnota: zapisVyuzitiUMeze(v.nejvetsiVyuziti, bonus.limit), mez: procenta(bonus.limit) });
    else if (bonus.druh === "komfort-chodcu")
      mistrovska = v.komfort
        ? t("medaile.proc.kmitani", { hodnota: zrychleniUMeze(v.komfort.zrychleni, bonus.limit), mez: cislo(bonus.limit, naDesetiny(bonus.limit) ? 1 : 2) })
        : t("medaile.proc.nemereno");
    else if (bonus.druh === "komfort-cestujicich")
      mistrovska =
        v.komfortCestujicich && v.komfortCestujicich.zrychleni > 0
          ? t("medaile.proc.cestujici", { hodnota: zrychleniUMeze(v.komfortCestujicich.zrychleni, bonus.limit), mez: cislo(bonus.limit, 2) })
          : t("medaile.proc.nemereno");
    else if (bonus.druh === "dosednuti")
      mistrovska =
        v.pohyb && v.pohyb.razDosednuti > 0
          ? t("medaile.proc.dosednuti", { hodnota: silaUMeze(v.pohyb.razDosednuti, bonus.limit), mez: `${cislo(bonus.limit / 1000, 0)} kN` })
          : t("medaile.proc.nedosedl");
    else mistrovska = t("medaile.mistrovska.jina");
  }
  return { pruchod, rozpocet, mistrovska };
}

function radky(uroven: Uroven, medaile: Readonly<Medaile>): RadekMedaile[] {
  // Kde jdou přes most lidé, patří k průchodu i to, že se pod nimi most nerozkmitá. Platí to
  // i v úrovních bez osy frekvencí (první kapitola): zkouška mez hlídá všude, kde lidé jdou,
  // a podmínka nesmí mlčet o něčem, kvůli čemu most neprojde.
  const lide = uroven.jizdniRad.some((p) => jeClovek(p.druh));
  const zaklad = lide
    ? t("medaile.pruchod.podminkaSKmitanim", { limit: cislo(MEZE_KOMFORTU[uroven.nejhorsiKomfort - 1]!, 1) })
    : t("medaile.pruchod.podminka");
  // Úroveň, která hlídá průhyb mostovky, to musí říct tam, kde říká ostatní podmínky průchodu.
  const pruchod =
    uroven.nejvetsiPruhyb !== null ? `${zaklad}; ${t("medaile.pruchod.pruhyb", { mm: cislo(1000 * uroven.nejvetsiPruhyb, 0) })}` : zaklad;
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
  proc?: ProcMedaile,
): void {
  const zDrivejska = drive ? radky(uroven, drive).map((r) => r.ziskana) : [];
  const duvody = proc ? [proc.pruchod, proc.rozpocet, proc.mistrovska].filter((_, i) => i === 0 || (i === 1 ? uroven.inzenyrskyRozpocet !== null : uroven.mistrovska !== null)) : [];
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
      // Výsledek zkoušky: proč medaili nedostal právě tenhle most, i když ji hráč má z dřívějška.
      const duvod = radek.ziskana ? null : (duvody[i] ?? null);
      if (duvod) {
        polozka.dataset.proc = duvod;
        const uzel = document.createElement("span");
        uzel.className = "medaile__proc";
        uzel.textContent = t("medaile.proc.uvod", { duvod });
        polozka.append(uzel);
      }
      return polozka;
    }),
  );
}

/**
 * Medaile do pruhu výsledku: tři značky s názvem vedle sebe; podmínka je v bublině a celá
 * v podrobnostech výsledku. `cilRozpoctu` („do 32 500 Kč“) se připíše k rozpočtové medaili,
 * kterou most nezískal jen kvůli ceně: úroveň má dva rozpočty (nad jeden se zkouška nepustí,
 * pod druhý je medaile) a hráč jinak nechápe, proč za most „pod rozpočtem“ medaili nemá.
 */
export function vypisMedailePruhu(seznam: HTMLElement, uroven: Uroven, medaile: Readonly<Medaile>, drive?: Readonly<Medaile>, cilRozpoctu: string | null = null): void {
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
      if (cilRozpoctu !== null && radek.nazev === "medaile.rozpocet" && !radek.ziskana && !uzMa) {
        const cil = document.createElement("small");
        cil.className = "medaile__cil";
        cil.textContent = cilRozpoctu;
        polozka.append(cil);
      }
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
