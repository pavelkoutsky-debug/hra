// Jazyk hry v prohlížeči: čeština nebo angličtina. Platí volba hráče uložená v paměti
// prohlížeče; dokud žádná není, rozhodne jazyk prohlížeče (čeština a slovenština dostanou
// češtinu, všichni ostatní angličtinu). Adresou `?jazyk=en` nebo `?jazyk=cs` jde jazyk vnutit
// a uloží se. Přepnutí stránku načte znovu: texty jsou rozeseté po celé obrazovce a po výkresu.

import { JAZYKY, nastavJazyk, t, type Jazyk } from "./slovnik";

export const KLIC_JAZYKA = "mostmistr.jazyk";
/** Značka v paměti panelu: hráč právě přepnul jazyk (kvůli záznamu do deníku hraní). */
const KLIC_PREPNUTI = "mostmistr.jazyk.prepnuto";

/** Přepnul hráč před načtením téhle stránky jazyk? Vrátí nový jazyk a značku smaže. */
export function prepnutyJazyk(): Jazyk | null {
  try {
    const zapis = window.sessionStorage.getItem(KLIC_PREPNUTI);
    window.sessionStorage.removeItem(KLIC_PREPNUTI);
    return jeJazyk(zapis) ? zapis : null;
  } catch {
    return null;
  }
}

function jeJazyk(h: unknown): h is Jazyk {
  return typeof h === "string" && (JAZYKY as readonly string[]).includes(h);
}

function ulozeny(): Jazyk | null {
  try {
    const zapis = window.localStorage.getItem(KLIC_JAZYKA);
    return jeJazyk(zapis) ? zapis : null;
  } catch {
    return null;
  }
}

/** Uloží volbu jazyka; vrátí false, když prohlížeč paměť nedovolí. */
function uloz(jazyk: Jazyk): boolean {
  try {
    window.localStorage.setItem(KLIC_JAZYKA, jazyk);
    return window.localStorage.getItem(KLIC_JAZYKA) === jazyk;
  } catch {
    return false;
  }
}

/**
 * Bez paměti prohlížeče drží volbu jazyka adresa: odkazy uvnitř hry ji ponesou dál, jinak by
 * se hra na další stránce vrátila k jazyku prohlížeče.
 */
function nesJazykVOdkazech(jazyk: Jazyk): void {
  document.addEventListener(
    "click",
    (udalost) => {
      const odkaz = udalost.target instanceof Element ? udalost.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!odkaz) return;
      let adresa: URL;
      try {
        adresa = new URL(odkaz.href, window.location.href);
      } catch {
        return;
      }
      if (adresa.origin !== window.location.origin || adresa.searchParams.has("jazyk")) return;
      adresa.searchParams.set("jazyk", jazyk);
      odkaz.href = adresa.toString();
    },
    true,
  );
}

/** Jazyk podle adresy, uložené volby a jazyka prohlížeče, v tomhle pořadí. */
export function zjistiJazyk(): Jazyk {
  const zAdresy = new URLSearchParams(window.location.search).get("jazyk");
  if (jeJazyk(zAdresy)) {
    if (!uloz(zAdresy)) nesJazykVOdkazech(zAdresy);
    return zAdresy;
  }
  const volba = ulozeny();
  if (volba) return volba;
  const prohlizec = navigator.languages?.[0] ?? navigator.language ?? "cs";
  return /^(cs|sk)\b/i.test(prohlizec) ? "cs" : "en";
}

/**
 * Nastaví jazyk stránky a napojí přepínače `[data-akce="jazyk"]`: tlačítko nese název
 * druhého jazyka v tom jazyce („English“ v české hře) a po kliknutí stránku načte v něm.
 * Volá se jako první věc při startu, ještě než se do stránky doplní texty.
 */
export function pripravJazyk(): Jazyk {
  const jazyk = zjistiJazyk();
  nastavJazyk(jazyk);
  document.documentElement.lang = jazyk;
  document.body.dataset.jazyk = jazyk;
  const druhy: Jazyk = jazyk === "cs" ? "en" : "cs";
  for (const tlacitko of document.querySelectorAll<HTMLElement>('[data-akce="jazyk"]')) {
    tlacitko.textContent = druhy === "en" ? "English" : "Česky";
    tlacitko.title = t("jazyk.prepnout");
    tlacitko.setAttribute("aria-label", t("jazyk.prepnout"));
    tlacitko.setAttribute("lang", druhy);
    tlacitko.addEventListener("click", () => {
      // Adresa nesmí dál vnucovat původní jazyk; bez paměti prohlížeče naopak nese ten nový.
      const adresa = new URL(window.location.href);
      if (uloz(druhy)) adresa.searchParams.delete("jazyk");
      else adresa.searchParams.set("jazyk", druhy);
      // Přepnutí patří do deníku hraní; zapíše ho další stránka (tahle se zahazuje).
      try {
        window.sessionStorage.setItem(KLIC_PREPNUTI, druhy);
      } catch {
        // Bez paměti se přepnutí nezapíše.
      }
      window.location.href = adresa.toString();
    });
  }
  return jazyk;
}
