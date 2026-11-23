// Jazyk hry v prohlížeči: čeština nebo angličtina. Platí volba hráče uložená v paměti
// prohlížeče; dokud žádná není, rozhodne jazyk prohlížeče (čeština a slovenština dostanou
// češtinu, všichni ostatní angličtinu). Adresou `?jazyk=en` nebo `?jazyk=cs` jde jazyk vnutit
// a uloží se. Přepnutí stránku načte znovu: texty jsou rozeseté po celé obrazovce a po výkresu.

import { JAZYKY, nastavJazyk, t, type Jazyk } from "./slovnik";

export const KLIC_JAZYKA = "mostmistr.jazyk";

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

function uloz(jazyk: Jazyk): void {
  try {
    window.localStorage.setItem(KLIC_JAZYKA, jazyk);
  } catch {
    // Bez paměti prohlížeče platí volba jen pro tuhle stránku (drží ji adresa).
  }
}

/** Jazyk podle adresy, uložené volby a jazyka prohlížeče, v tomhle pořadí. */
export function zjistiJazyk(): Jazyk {
  const zAdresy = new URLSearchParams(window.location.search).get("jazyk");
  if (jeJazyk(zAdresy)) {
    uloz(zAdresy);
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
      uloz(druhy);
      // Adresa nesmí dál vnucovat původní jazyk.
      const adresa = new URL(window.location.href);
      adresa.searchParams.delete("jazyk");
      window.location.href = adresa.toString();
    });
  }
  return jazyk;
}
