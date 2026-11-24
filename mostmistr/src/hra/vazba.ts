// Okno se zpětnou vazbou hráče: druh zprávy, text, jak ho hra baví, volitelný kontakt a
// přílohy (rozestavěný most a poslední kroky z deníku). Odesílá se na server hry; okno je
// společné přehledu kampaně i obrazovce úrovně.

import type { Denik } from "../denik/denik";
import { nastavZaznam, odesliVazbu, priZmeneVolby } from "../denik/prohlizec";
import { DRUHY_VAZBY, NEJDELSI_VAZBA, type DruhVazby, type ZpetnaVazba } from "../denik/udalosti";
import { prvek, udaj } from "../ui/dom";
import { t } from "../ui/slovnik";
import { pripojSoukromi } from "./soukromi";

/** Odkud okno bere to, co se ke zprávě přikládá. */
export interface ZdrojVazby {
  /** Úroveň, ve které hráč právě je; v přehledu kampaně žádná. */
  uroven: () => string | undefined;
  /** Zápis mostu, který má hráč na výkresu; undefined, když žádný nemá. */
  navrh: () => string | undefined;
}

export interface OknoVazby {
  /** Otevře okno; `druh` předvolí druh zprávy. */
  otevri(druh?: DruhVazby): void;
}

/** Napojí okno zpětné vazby na stránku: tlačítka `[data-akce="vazba"]` ho otevírají. */
export function pripojVazbu(denik: Denik, zdroj: ZdrojVazby): OknoVazby {
  const okno = prvek("#okno-vazba", HTMLDialogElement);
  const text = prvek("#vazba-text", HTMLTextAreaElement);
  const kontakt = prvek("#vazba-kontakt", HTMLInputElement);
  const prilohy = prvek("#vazba-prilohy", HTMLInputElement);
  const past = prvek("#vazba-web", HTMLInputElement);
  const odeslat = prvek('[data-akce="vazba-odeslat"]', HTMLButtonElement);
  const prepinacZaznamu = prvek('[data-akce="vazba-zaznam"]', HTMLButtonElement);
  const hlaseni = udaj("vazba-hlaseni");
  let hodnoceni: number | null = null;
  let odesilaSe = false;

  text.maxLength = NEJDELSI_VAZBA;

  const druh = (): DruhVazby => {
    const zvoleny = okno.querySelector<HTMLInputElement>('input[name="vazba-druh"]:checked')?.value;
    return DRUHY_VAZBY.find((d) => d === zvoleny) ?? "jine";
  };

  const obnov = (): void => {
    for (const tlacitko of okno.querySelectorAll<HTMLButtonElement>("[data-hodnoceni]")) {
      tlacitko.setAttribute("aria-pressed", String(Number(tlacitko.dataset.hodnoceni) === hodnoceni));
    }
    odeslat.disabled = odesilaSe || text.value.trim().length === 0;
    udaj("vazba-zaznam").textContent = t(
      !denik.lzeZapnout ? "denik.bezPameti" : denik.zapnuto ? "vazba.zaznam.zapnuty" : "vazba.zaznam.vypnuty",
    );
    prepinacZaznamu.textContent = t(denik.zapnuto ? "vazba.zaznam.vypnout" : "vazba.zaznam.zapnout");
    prepinacZaznamu.hidden = !denik.lzeZapnout;
    // Bez mostu a v přehledu není co přikládat kromě posledních kroků.
    udaj("vazba-prilohy").textContent = t(
      zdroj.navrh() !== undefined ? "vazba.prilohy.most" : zdroj.uroven() !== undefined ? "vazba.prilohy.kroky.uroven" : "vazba.prilohy.kroky",
    );
    const pocet = udaj("vazba-pocet");
    pocet.textContent = t("vazba.pocet", { pocet: text.value.length, nejvic: NEJDELSI_VAZBA });
    pocet.dataset.plny = String(text.value.length >= 0.9 * NEJDELSI_VAZBA);
  };

  const otevri = (predvoleny?: DruhVazby): void => {
    if (okno.open) return;
    if (predvoleny) {
      const volba = okno.querySelector<HTMLInputElement>(`input[name="vazba-druh"][value="${predvoleny}"]`);
      if (volba) volba.checked = true;
    }
    hlaseni.textContent = "";
    delete okno.dataset.odeslano;
    // Kdo si záznam hraní vypnul, tomu se kroky ze hry samy nepřikládají; zaškrtnout je může.
    prilohy.checked = denik.zapnuto;
    obnov();
    okno.showModal();
    text.focus();
    denik.zapis("vazba.otevrena", {}, zdroj.uroven());
  };

  for (const tlacitko of document.querySelectorAll<HTMLButtonElement>('[data-akce="vazba"]')) {
    tlacitko.addEventListener("click", () => otevri());
  }
  for (const tlacitko of okno.querySelectorAll<HTMLButtonElement>("[data-hodnoceni]")) {
    tlacitko.addEventListener("click", () => {
      const hodnota = Number(tlacitko.dataset.hodnoceni);
      hodnoceni = hodnoceni === hodnota ? null : hodnota;
      obnov();
    });
  }
  text.addEventListener("input", obnov);
  prepinacZaznamu.addEventListener("click", () => {
    nastavZaznam(!denik.zapnuto);
    if (!denik.zapnuto) prilohy.checked = false;
    obnov();
  });

  // Odeslat je výchozí tlačítko formuláře, takže Enter v poli s e-mailem zprávu odešle
  // (dřív okno zavřel a zpráva se ztratila). Okno zavírá jen tlačítko Zavřít a Escape.
  const formular = prvek("#okno-vazba form", HTMLFormElement);
  formular.addEventListener("submit", (udalost) => {
    const tlacitko = udalost.submitter;
    if (tlacitko instanceof HTMLButtonElement && tlacitko.value === "zavrit") return;
    udalost.preventDefault();
    odesli();
  });

  const odesli = (): void => {
    const zprava = text.value.trim();
    if (zprava.length === 0 || odesilaSe) return;
    const vazba: Omit<ZpetnaVazba, "hlavicka"> & { web?: string } = { druh: druh(), text: zprava };
    if (hodnoceni !== null) vazba.hodnoceni = hodnoceni;
    const kam = kontakt.value.trim();
    if (kam.length > 0) vazba.kontakt = kam;
    const uroven = zdroj.uroven();
    if (uroven !== undefined) vazba.uroven = uroven;
    if (prilohy.checked) {
      const navrh = zdroj.navrh();
      if (navrh !== undefined) vazba.navrh = navrh;
      vazba.udalosti = denik.posledni();
    }
    // Past na roboty: pole, které člověk nevidí; vyplněné znamená, že to člověk nebyl.
    if (past.value.length > 0) vazba.web = past.value;
    odesilaSe = true;
    hlaseni.textContent = t("vazba.odesilaSe");
    obnov();
    void denik.posliVazbu(vazba, odesliVazbu).then((id) => {
      odesilaSe = false;
      if (id === null) {
        okno.dataset.odeslano = "ne";
        hlaseni.textContent = t("vazba.nepodarilo");
      } else {
        okno.dataset.odeslano = "ano";
        hlaseni.textContent = t(kam.length > 0 ? "vazba.diky.kontakt" : "vazba.diky");
        text.value = "";
        hodnoceni = null;
      }
      obnov();
    });
  };

  // Hráč přepnul záznam jinde (vypínač v přehledu, jiný panel prohlížeče).
  priZmeneVolby(obnov);
  obnov();
  const oknoVazby: OknoVazby = { otevri };
  // Okno Soukromí a kontakt žije všude, kde okno zpětné vazby (odkazuje na něj a naopak).
  pripojSoukromi(denik, oknoVazby);
  return oknoVazby;
}
