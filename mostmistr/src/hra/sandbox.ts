// Okno s nastavením sandboxu: údolí (rozpětí, hloubka, voda, základy), druh trasy a provoz.
// Samo nic nepočítá ani neukládá: nastavení přečte z formuláře, zkontroluje a předá dál.

import { ChybaDat } from "../data/kontrola";
import {
  MEZE_SANDBOXU,
  nactiSandbox,
  nejvicVeSkupine,
  nejvicZakladu,
  PROVOZ_SANDBOXU,
  stejneUdoli,
  VERZE_SANDBOXU,
  vychoziPocet,
  vychoziProvoz,
  type DruhProvozuSandboxu,
  type NastaveniSandboxu,
  type PolozkaSandboxu,
} from "../data/sandbox";
import { DRUHY_TRAS, type DruhTrasy } from "../data/uroven";
import { prvek, udaj } from "../ui/dom";
import { t } from "../ui/slovnik";

export interface MoznostiSandboxu {
  /** Má hráč v sandboxu rozestavěný most? Změna údolí ho smaže, proto se na ni okno ptá. */
  maMost: () => boolean;
  /** Hráč potvrdil nové nastavení; `smazatMost`, když se změnilo údolí nebo trasa. */
  pouzij: (nastaveni: NastaveniSandboxu, smazatMost: boolean) => void;
}

/**
 * Co je na nastavení špatně, slovy pro hráče: které pole a jaké má meze. `data` je to, co
 * hráč do formuláře napsal; meze některých polí závisejí na jiných (základy na rozpětí,
 * počet na druhu provozu).
 */
function textChyby(chyba: unknown, data: { rozpeti: number; provoz: { druh: string }[] }): string {
  const cesta = chyba instanceof ChybaDat ? chyba.cesta : "";
  if (cesta === "sandbox.rozpeti") return t("sandbox.chyba.rozpeti", MEZE_SANDBOXU.rozpeti);
  if (cesta === "sandbox.hloubka") return t("sandbox.chyba.hloubka", MEZE_SANDBOXU.hloubka);
  if (cesta === "sandbox.zaklady") {
    return t("sandbox.chyba.zaklady", { rozpeti: data.rozpeti, max: nejvicZakladu(data.rozpeti) });
  }
  const radek = /^sandbox\.provoz\[(\d+)\]\.(pocet|cas|smer)$/.exec(cesta);
  if (radek) {
    const poradi = Number(radek[1]);
    if (radek[2] === "smer") return t("sandbox.chyba.smerKoleje", { radek: poradi + 1 });
    if (radek[2] === "cas") return t("sandbox.chyba.cas", { radek: poradi + 1, max: MEZE_SANDBOXU.cas.max });
    const druh = data.provoz[poradi]?.druh ?? "";
    const znamy = (Object.values(PROVOZ_SANDBOXU).flat() as string[]).includes(druh);
    return t("sandbox.chyba.pocet", {
      radek: poradi + 1,
      min: MEZE_SANDBOXU.pocet.min,
      max: znamy ? nejvicVeSkupine(druh as DruhProvozuSandboxu) : MEZE_SANDBOXU.pocet.max,
    });
  }
  return t("sandbox.chyba", { duvod: chyba instanceof Error ? chyba.message : String(chyba) });
}

/** Napojí okno `#okno-sandbox` a vrátí funkci, která ho otevře s daným nastavením. */
export function pripojSandbox(soucasne: NastaveniSandboxu, moznosti: MoznostiSandboxu): { otevri(): void } {
  const okno = prvek("#okno-sandbox", HTMLDialogElement);
  const rozpeti = prvek("#sandbox-rozpeti", HTMLInputElement);
  const hloubka = prvek("#sandbox-hloubka", HTMLInputElement);
  const druh = prvek("#sandbox-druh", HTMLSelectElement);
  const zaklady = prvek("#sandbox-zaklady", HTMLInputElement);
  const voda = prvek("#sandbox-voda", HTMLInputElement);
  const seznam = udaj("sandbox-provoz");
  const hlaseni = udaj("sandbox-hlaseni");
  const pridat = prvek('[data-akce="sandbox-pridat"]', HTMLButtonElement);
  const pouzit = prvek('[data-akce="sandbox-pouzit"]', HTMLButtonElement);
  /** Hráč už jednou viděl varování, že změna údolí smaže most, a potvrzuje ji druhým kliknutím. */
  let potvrzujeSmazani = false;

  const meze = (pole: HTMLInputElement, rozsah: { min: number; max: number }): void => {
    pole.min = String(rozsah.min);
    pole.max = String(rozsah.max);
    pole.step = "1";
  };
  meze(rozpeti, MEZE_SANDBOXU.rozpeti);
  meze(hloubka, MEZE_SANDBOXU.hloubka);
  meze(zaklady, MEZE_SANDBOXU.zaklady);
  druh.replaceChildren(
    ...DRUHY_TRAS.map((d) => {
      const volba = document.createElement("option");
      volba.value = d;
      volba.textContent = t(`sandbox.druh.${d}`);
      return volba;
    }),
  );

  const zvolenyDruh = (): DruhTrasy => DRUHY_TRAS.find((d) => d === druh.value) ?? "silnice";

  /** Řádek jízdního řádu: co, kolik, kterým směrem a kdy. */
  function radek(p: PolozkaSandboxu): HTMLLIElement {
    const polozka = document.createElement("li");
    polozka.className = "sandbox__radek";
    const co = document.createElement("select");
    co.dataset.pole = "druh";
    co.setAttribute("aria-label", t("sandbox.provoz.druh"));
    for (const d of PROVOZ_SANDBOXU[zvolenyDruh()]) {
      const volba = document.createElement("option");
      volba.value = d;
      volba.textContent = t(`sandbox.provoz.${d}`);
      co.append(volba);
    }
    co.value = p.druh;
    const pocet = document.createElement("input");
    pocet.type = "number";
    pocet.dataset.pole = "pocet";
    pocet.min = String(MEZE_SANDBOXU.pocet.min);
    pocet.max = String(nejvicVeSkupine(p.druh));
    pocet.value = String(p.pocet);
    pocet.setAttribute("aria-label", t("sandbox.provoz.pocet"));
    co.addEventListener("change", () => {
      // Jiný druh má jiný rozumný počet: skupina třiceti nadměrných nákladů nedává smysl.
      const novy = co.value as DruhProvozuSandboxu;
      pocet.max = String(nejvicVeSkupine(novy));
      pocet.value = String(vychoziPocet(novy));
    });
    const smer = document.createElement("select");
    smer.dataset.pole = "smer";
    smer.setAttribute("aria-label", t("sandbox.provoz.smer"));
    for (const [hodnota, klic] of [["1", "sandbox.provoz.zleva"], ["-1", "sandbox.provoz.zprava"]] as const) {
      const volba = document.createElement("option");
      volba.value = hodnota;
      volba.textContent = t(klic);
      smer.append(volba);
    }
    smer.value = String(p.smer);
    const cas = document.createElement("input");
    cas.type = "number";
    cas.dataset.pole = "cas";
    cas.min = String(MEZE_SANDBOXU.cas.min);
    cas.max = String(MEZE_SANDBOXU.cas.max);
    cas.step = "1";
    cas.value = String(p.cas);
    cas.setAttribute("aria-label", t("sandbox.provoz.cas"));
    const jednotka = document.createElement("span");
    jednotka.textContent = t("sandbox.provoz.sekund");
    const krat = document.createElement("span");
    krat.textContent = "×";
    const pryc = document.createElement("button");
    pryc.type = "button";
    pryc.className = "tlacitko tlacitko--znak";
    pryc.textContent = "✕";
    pryc.title = t("sandbox.provoz.odebrat");
    pryc.setAttribute("aria-label", t("sandbox.provoz.odebrat"));
    pryc.addEventListener("click", () => {
      polozka.remove();
      obnovPridat();
    });
    polozka.append(pocet, krat, co, smer, cas, jednotka, pryc);
    return polozka;
  }

  /** Plný jízdní řád: tlačítko zůstává klikací a řekne, proč další položku nepřidá. */
  function obnovPridat(): void {
    pridat.setAttribute("aria-disabled", String(seznam.children.length >= MEZE_SANDBOXU.polozek));
  }

  /** Nastavení, jak je teď ve formuláři; čísla mimo meze nechá projít ke kontrole, ta řekne proč. */
  function zFormulare(): { rozpeti: number; provoz: { druh: string }[] } & Record<string, unknown> {
    const provoz = [...seznam.children].map((uzel) => {
      const pole = (jmeno: string): string =>
        uzel.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-pole="${jmeno}"]`)?.value ?? "";
      return { druh: pole("druh"), pocet: Number(pole("pocet")), smer: Number(pole("smer")), cas: Number(pole("cas")) };
    });
    return {
      verze: VERZE_SANDBOXU,
      rozpeti: Number(rozpeti.value),
      hloubka: Number(hloubka.value),
      druh: druh.value,
      voda: voda.checked,
      zaklady: Number(zaklady.value),
      provoz,
    };
  }

  function napln(n: NastaveniSandboxu): void {
    rozpeti.value = String(n.rozpeti);
    hloubka.value = String(n.hloubka);
    druh.value = n.druh;
    zaklady.value = String(n.zaklady);
    voda.checked = n.voda;
    seznam.replaceChildren(...n.provoz.map(radek));
    hlaseni.textContent = "";
    delete hlaseni.dataset.druh;
    potvrzujeSmazani = false;
    pouzit.textContent = t("sandbox.pouzit");
    obnovPridat();
  }

  // Jiná trasa má jiný provoz: co po ní nejezdí, z jízdního řádu zmizí.
  druh.addEventListener("change", () => {
    const povolene: readonly string[] = PROVOZ_SANDBOXU[zvolenyDruh()];
    const zbyle = [...seznam.children].filter((uzel) => povolene.includes(uzel.querySelector<HTMLSelectElement>('[data-pole="druh"]')?.value ?? ""));
    const polozky = zbyle.map((uzel): PolozkaSandboxu => {
      const pole = (jmeno: string): string =>
        uzel.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-pole="${jmeno}"]`)?.value ?? "";
      return { druh: pole("druh") as DruhProvozuSandboxu, pocet: Number(pole("pocet")), smer: Number(pole("smer")) === -1 ? -1 : 1, cas: Number(pole("cas")) };
    });
    // Trasa, po které by nic nejelo, není k ničemu: prázdný řád dostane výchozí provoz.
    seznam.replaceChildren(...(polozky.length > 0 ? polozky : vychoziProvoz(zvolenyDruh())).map(radek));
    obnovPridat();
  });

  pridat.addEventListener("click", () => {
    if (seznam.children.length >= MEZE_SANDBOXU.polozek) {
      hlaseni.dataset.druh = "varovani";
      hlaseni.textContent = t("sandbox.chyba.plno", { max: MEZE_SANDBOXU.polozek });
      return;
    }
    const prvni = PROVOZ_SANDBOXU[zvolenyDruh()][0];
    // Po jedné koleji jedou všechny vlaky stejným směrem jako první.
    const smerPrvniho = Number(seznam.querySelector<HTMLSelectElement>('[data-pole="smer"]')?.value ?? 1) === -1 ? -1 : 1;
    const smer = zvolenyDruh() === "kolej" ? smerPrvniho : 1;
    // Další položka vyráží pět sekund po té poslední, ať se na mostě hned nepotkají.
    let cas = 0;
    for (const uzel of seznam.children) cas = Math.max(cas, Number(uzel.querySelector<HTMLInputElement>('[data-pole="cas"]')?.value ?? 0) + 5);
    seznam.append(radek({ druh: prvni, pocet: vychoziPocet(prvni), smer, cas: Math.min(cas, MEZE_SANDBOXU.cas.max) }));
    obnovPridat();
  });

  pouzit.addEventListener("click", () => {
    let nove: NastaveniSandboxu;
    const data = zFormulare();
    try {
      nove = nactiSandbox(data);
    } catch (chyba) {
      hlaseni.dataset.druh = "varovani";
      hlaseni.textContent = textChyby(chyba, data);
      return;
    }
    const smazat = !stejneUdoli(soucasne, nove) && moznosti.maMost();
    if (smazat && !potvrzujeSmazani) {
      // Jiné údolí znamená jiné opěry a kotvy: rozestavěný most by do něj nepasoval.
      potvrzujeSmazani = true;
      hlaseni.dataset.druh = "varovani";
      hlaseni.textContent = t("sandbox.smazeMost");
      pouzit.textContent = t("sandbox.pouzitASmazat");
      return;
    }
    okno.close();
    moznosti.pouzij(nove, smazat);
  });

  return {
    otevri(): void {
      napln(soucasne);
      okno.showModal();
    },
  };
}
