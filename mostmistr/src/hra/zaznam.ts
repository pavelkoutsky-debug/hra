// Upozornění, že hra vede anonymní deník hraní, a vypínač záznamu. Upozornění je v přehledu
// kampaně i v okně se zadáním úrovně (hráč může přijít rovnou do úrovně) a ukazuje se,
// dokud ho hráč nepotvrdí nebo záznam nevypne.

import type { Denik } from "../denik/denik";
import { nastavZaznam } from "../denik/prohlizec";

/** Napojí všechna upozornění na stránce (`[data-udaj="zaznam-upozorneni"]`) a vypínač `#zaznam-hrani`. */
export function pripojZaznam(denik: Denik): void {
  const upozorneni = [...document.querySelectorAll<HTMLElement>('[data-udaj="zaznam-upozorneni"]')];
  const vypinac = document.querySelector<HTMLInputElement>("#zaznam-hrani");

  const obnov = (): void => {
    for (const u of upozorneni) u.hidden = denik.upozorneno || !denik.zapnuto;
    if (vypinac) vypinac.checked = denik.zapnuto;
  };

  for (const u of upozorneni) {
    u.querySelector('[data-akce="zaznam-rozumim"]')?.addEventListener("click", () => {
      denik.potvrdUpozorneni();
      obnov();
    });
    u.querySelector('[data-akce="zaznam-vypnout"]')?.addEventListener("click", () => {
      nastavZaznam(false);
      denik.potvrdUpozorneni();
      obnov();
    });
  }
  vypinac?.addEventListener("change", () => {
    nastavZaznam(vypinac.checked);
    denik.potvrdUpozorneni();
    obnov();
  });
  obnov();
}
