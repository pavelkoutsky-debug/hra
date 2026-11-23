// Drobné pomůcky pro práci se stránkou, společné hře i zkušebně.
import { procenta } from "./formaty";
import { jeKlicTextu, t } from "./slovnik";

/** Najde prvek stránky a ověří jeho typ; chybějící prvek je chyba v šabloně stránky. */
export function prvek<T extends Element>(selektor: string, typ: new () => T): T {
  const nalezeny = document.querySelector(selektor);
  if (!(nalezeny instanceof typ)) throw new Error(`Na stránce chybí prvek ${selektor}.`);
  return nalezeny;
}

/** Prvek, do kterého se zapisuje údaj daného jména (atribut data-udaj). */
export function udaj(jmeno: string): HTMLElement {
  return prvek(`[data-udaj="${jmeno}"]`, HTMLElement);
}

/**
 * Zapíše do nadpisu text, jehož jednotka v hranatých závorkách na konci („Průhyb [mm]“)
 * zůstane, jak je napsaná: nadpisy se píšou verzálkami a z mm by bylo MM.
 */
export function nadpisSJednotkou(uzel: HTMLElement, text: string): void {
  const zacatek = text.lastIndexOf(" [");
  if (zacatek < 0 || !text.endsWith("]")) {
    uzel.textContent = text;
    return;
  }
  const jednotka = document.createElement("span");
  jednotka.className = "jednotka";
  jednotka.textContent = text.slice(zacatek + 1);
  uzel.replaceChildren(`${text.slice(0, zacatek)} `, jednotka);
}

/** Doplní do stránky texty ze slovníku podle atributů data-text a data-popis. */
export function doplnTexty(): void {
  for (const uzel of document.querySelectorAll<HTMLElement>("[data-text]")) {
    const klic = uzel.dataset.text ?? "";
    if (!jeKlicTextu(klic)) continue;
    if (uzel.tagName === "H3") nadpisSJednotkou(uzel, t(klic));
    else uzel.textContent = t(klic);
  }
  for (const uzel of document.querySelectorAll<HTMLElement>("[data-popis]")) {
    const klic = uzel.dataset.popis ?? "";
    if (jeKlicTextu(klic)) {
      uzel.setAttribute("aria-label", t(klic));
      uzel.title = t(klic);
    }
  }
  // Procenta v jazyce hry (česky s mezerou, anglicky bez): atribut nese podíl, 1 je 100 %.
  for (const uzel of document.querySelectorAll<HTMLElement>("[data-procenta]")) {
    uzel.textContent = procenta(Number(uzel.dataset.procenta));
  }
  // Titulek stránky podle jazyka: klíč je na kořeni dokumentu.
  const titulek = document.documentElement.dataset.titulek ?? "";
  if (jeKlicTextu(titulek)) document.title = t(titulek);
  // Zkrácený text pro úzké okno: styl ho z atributu data-kratce ukáže místo plného.
  for (const uzel of document.querySelectorAll<HTMLElement>("[data-kratce-text]")) {
    const klic = uzel.dataset.kratceText ?? "";
    if (jeKlicTextu(klic)) uzel.dataset.kratce = t(klic);
  }
}
