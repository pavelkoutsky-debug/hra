// Upozornění, že hra vede anonymní deník hraní, a vypínač záznamu. Upozornění je v přehledu
// kampaně, v okně se zadáním úrovně a v paletě úrovně (hráč může přijít rovnou do úrovně,
// kde má rozestavěný most a zadání se mu neotevře) a ukazuje se, dokud ho hráč nepotvrdí
// nebo záznam nevypne.

import type { Denik } from "../denik/denik";
import { nastavZaznam, priZmeneVolby } from "../denik/prohlizec";

/** Napojí všechna upozornění na stránce (`[data-udaj="zaznam-upozorneni"]`) a vypínač `#zaznam-hrani`. */
export function pripojZaznam(denik: Denik): void {
  const upozorneni = [...document.querySelectorAll<HTMLElement>('[data-udaj="zaznam-upozorneni"]')];
  const vypinac = document.querySelector<HTMLInputElement>("#zaznam-hrani");

  const obnov = (): void => {
    for (const u of upozorneni) u.hidden = denik.upozorneno || !denik.zapnuto;
    if (vypinac) {
      vypinac.checked = denik.zapnuto;
      // Bez paměti prohlížeče by si hra vypnutí nepamatovala, proto se deník nevede vůbec.
      vypinac.disabled = !denik.lzeZapnout;
    }
  };
  // Hráč přepnul záznam v jiném panelu prohlížeče.
  priZmeneVolby(obnov);

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
