// Okno „Soukromí a kontakt“: co hra o hráči ví, kam to jde, jak dlouho to tam leží a jak
// požádat o smazání. Ukazuje číslo hráče (podle něj jde jeho záznam dohledat a smazat)
// a vypínač záznamu hraní. Otevírá ho cokoli s `data-akce="soukromi"` a adresa `?soukromi`;
// je společné přehledu kampaně i obrazovce úrovně (zapojuje ho okno zpětné vazby).

import type { Denik } from "../denik/denik";
import { nastavZaznam, priZmeneVolby } from "../denik/prohlizec";
import { prvek, udaj } from "../ui/dom";
import { t } from "../ui/slovnik";
import { KLIC_ZEBRICKU } from "./uloziste";
import type { OknoVazby } from "./vazba";

/**
 * Číslo, pod kterým hráče vedou žebříčky (jiné a delší než číslo záznamu hraní); null, dokud
 * se do žádného nezapsal. Čte se rovnou z paměti prohlížeče: okno je i v přehledu, kde
 * úložiště úrovně není po ruce.
 */
function cisloVZebriccich(): string | null {
  try {
    const zapis = JSON.parse(window.localStorage.getItem(KLIC_ZEBRICKU) ?? "null") as { hrac?: unknown } | null;
    return typeof zapis?.hrac === "string" && /^[0-9a-f]{8,64}$/.test(zapis.hrac) ? zapis.hrac : null;
  } catch {
    return null;
  }
}

export function pripojSoukromi(denik: Denik, vazba: OknoVazby): void {
  const okno = prvek("#okno-soukromi", HTMLDialogElement);
  const prepinac = prvek('[data-akce="soukromi-zaznam"]', HTMLButtonElement);
  const kopirovat = prvek('[data-akce="soukromi-kopirovat"]', HTMLButtonElement);

  const obnov = (): void => {
    udaj("soukromi-hrac").textContent = denik.cisloHrace;
    const vZebriccich = cisloVZebriccich();
    udaj("soukromi-zebricek").textContent = vZebriccich ?? "";
    udaj("soukromi-zebricek-radek").hidden = vZebriccich === null;
    udaj("soukromi-zaznam").textContent = t(
      !denik.lzeZapnout ? "denik.bezPameti" : denik.zapnuto ? "vazba.zaznam.zapnuty" : "vazba.zaznam.vypnuty",
    );
    prepinac.textContent = t(denik.zapnuto ? "vazba.zaznam.vypnout" : "vazba.zaznam.zapnout");
    prepinac.hidden = !denik.lzeZapnout;
    okno.dataset.zaznam = denik.zapnuto ? "zapnuto" : "vypnuto";
  };

  const otevri = (): void => {
    obnov();
    kopirovat.textContent = t("soukromi.kopirovat");
    if (!okno.open) okno.showModal();
  };

  // Odkazy na okno jsou na víc místech (přehled, upozornění na záznam, okna zpětné vazby
  // a žebříčku) a některé vznikají až za běhu: stačí jedna obsluha na dokumentu.
  document.addEventListener("click", (udalost) => {
    const cil = udalost.target instanceof Element ? udalost.target.closest('[data-akce="soukromi"]') : null;
    if (!cil) return;
    udalost.preventDefault();
    otevri();
  });

  prepinac.addEventListener("click", () => {
    nastavZaznam(!denik.zapnuto);
    obnov();
  });

  kopirovat.addEventListener("click", () => {
    const hotovo = (): void => {
      kopirovat.textContent = t("soukromi.zkopirovano");
    };
    // Schránka nemusí být dostupná (starší prohlížeč, stránka bez zabezpečeného spojení):
    // číslo je vedle tlačítka vypsané a jde označit ručně.
    const vZebriccich = cisloVZebriccich();
    const text = vZebriccich === null ? denik.cisloHrace : `${denik.cisloHrace} / ${vZebriccich}`;
    void navigator.clipboard?.writeText(text).then(hotovo, () => undefined);
  });

  prvek('[data-akce="soukromi-napis"]', HTMLButtonElement).addEventListener("click", () => {
    okno.close();
    vazba.otevri("jine");
  });

  priZmeneVolby(obnov);
  if (new URLSearchParams(window.location.search).has("soukromi")) otevri();
}
