// Upozornění, že hra vede anonymní deník hraní, a vypínač záznamu. Upozornění je v přehledu
// kampaně, v okně se zadáním úrovně a v paletě úrovně (hráč může přijít rovnou do úrovně,
// kde má rozestavěný most a zadání se mu neotevře) a ukazuje se, dokud ho hráč nepotvrdí
// nebo záznam nevypne. Po vypnutí na jeho místě zůstane potvrzení, že se už nic neodesílá.

import type { Denik } from "../denik/denik";
import { nastavZaznam, priZmeneVolby } from "../denik/prohlizec";
import { t } from "../ui/slovnik";

/** Napojí všechna upozornění na stránce (`[data-udaj="zaznam-upozorneni"]`) a vypínač `#zaznam-hrani`. */
export function pripojZaznam(denik: Denik): void {
  const upozorneni = [...document.querySelectorAll<HTMLElement>('[data-udaj="zaznam-upozorneni"]')];
  const vypinac = document.querySelector<HTMLInputElement>("#zaznam-hrani");

  /** Hráč právě záznam vypnul tlačítkem v upozornění a ještě si nepřečetl potvrzení. */
  let potvrzujeVypnuti = false;

  const obnov = (): void => {
    if (denik.zapnuto) potvrzujeVypnuti = false;
    for (const u of upozorneni) {
      u.hidden = !potvrzujeVypnuti && (denik.upozorneno || !denik.zapnuto);
      u.dataset.stav = potvrzujeVypnuti ? "vypnuto" : "upozorneni";
      const text = u.querySelector("span");
      if (text) text.textContent = t(potvrzujeVypnuti ? "denik.vypnuto" : "denik.upozorneni");
      const vypnout = u.querySelector<HTMLElement>('[data-akce="zaznam-vypnout"]');
      if (vypnout) vypnout.hidden = potvrzujeVypnuti;
    }
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
      potvrzujeVypnuti = false;
      denik.potvrdUpozorneni();
      obnov();
    });
    u.querySelector('[data-akce="zaznam-vypnout"]')?.addEventListener("click", () => {
      nastavZaznam(false);
      denik.potvrdUpozorneni();
      potvrzujeVypnuti = !denik.zapnuto;
      obnov();
    });
  }
  vypinac?.addEventListener("change", () => {
    nastavZaznam(vypinac.checked);
    denik.potvrdUpozorneni();
    potvrzujeVypnuti = false;
    obnov();
  });
  obnov();
}
