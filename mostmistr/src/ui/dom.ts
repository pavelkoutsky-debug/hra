// Drobné pomůcky pro práci se stránkou, společné hře i zkušebně.
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

/** Doplní do stránky texty ze slovníku podle atributů data-text a data-popis. */
export function doplnTexty(): void {
  for (const uzel of document.querySelectorAll<HTMLElement>("[data-text]")) {
    const klic = uzel.dataset.text ?? "";
    if (jeKlicTextu(klic)) uzel.textContent = t(klic);
  }
  for (const uzel of document.querySelectorAll<HTMLElement>("[data-popis]")) {
    const klic = uzel.dataset.popis ?? "";
    if (jeKlicTextu(klic)) {
      uzel.setAttribute("aria-label", t(klic));
      uzel.title = t(klic);
    }
  }
}
