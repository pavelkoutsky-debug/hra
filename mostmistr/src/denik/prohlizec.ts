// Deník hraní napojený na prohlížeč: paměť, síť, pravidelné odesílání, odeslání při zavření
// stránky a zápis chyb, které prohlížeč ohlásí. Jedna stránka má jeden deník.

import { Denik, KLIC_ZAZNAMU, type PametDeniku, type VysledekOdeslani } from "./denik";

function pamet(ktera: "localStorage" | "sessionStorage"): PametDeniku | null {
  try {
    const sklad = window[ktera];
    const zkouska = "mostmistr.denik.zkouska";
    sklad.setItem(zkouska, "1");
    sklad.removeItem(zkouska);
    return sklad;
  } catch {
    return null;
  }
}

function nahodneCislo(): string {
  const bajty = new Uint8Array(8);
  crypto.getRandomValues(bajty);
  return Array.from(bajty, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Jak dlouho se nejdéle čeká na odpověď serveru, ms; pak se žádost vzdá. Zpětná vazba
 * s přiloženým mostem je větší a na pomalém připojení se déle nahrává.
 */
const NEJDELSI_ODPOVED = 20_000;
const NEJDELSI_ODPOVED_VAZBY = 60_000;

/** Pošle JSON na adresu téhož webu. Když server do `limit` ms neodpoví, žádost zruší a vyhodí chybu. */
async function posliJson(adresa: string, telo: string, limit = NEJDELSI_ODPOVED): Promise<Response> {
  const zruseni = new AbortController();
  const budik = window.setTimeout(() => zruseni.abort(), limit);
  try {
    return await fetch(adresa, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: telo,
      // Malou žádost prohlížeč dokončí, i když hráč mezitím přejde jinam.
      keepalive: telo.length < 60_000,
      signal: zruseni.signal,
    });
  } finally {
    window.clearTimeout(budik);
  }
}

/** Odešle zpětnou vazbu a vrátí její číslo; null, když ji server nepřijal. */
export async function odesliVazbu(adresa: string, telo: string): Promise<{ id: string } | null> {
  try {
    const odpoved = await posliJson(adresa, telo, NEJDELSI_ODPOVED_VAZBY);
    if (!odpoved.ok) return null;
    const data = (await odpoved.json()) as { id?: unknown };
    return typeof data.id === "string" ? { id: data.id } : null;
  } catch {
    return null;
  }
}

/** Jméno souboru bez adresy webu a bez otisku sestavení v názvu, ať jdou chyby sčítat. */
function zdrojChyby(adresa: string | undefined): string {
  if (!adresa) return "";
  return adresa.replace(/^.*\//, "").replace(/-[A-Za-z0-9_]{8}\./, ".").slice(0, 60);
}

let denik: Denik | null = null;
/** Co se má stihnout zapsat, než se při zavírání stránky deník odešle. */
const predOdeslanim: (() => void)[] = [];

/** Co se má překreslit, když se volba záznamu změní jinde (v jiném panelu prohlížeče). */
const poZmeneVolby: (() => void)[] = [];

/** Přihlásí obsluhu, která se zavolá, když hráč přepne záznam v jiném panelu. */
export function priZmeneVolby(obsluha: () => void): void {
  poZmeneVolby.push(obsluha);
}

/**
 * Stopky, které běží jen tehdy, když je stránka vidět: čas strávený v úrovni se nemá
 * počítat, zatímco má hráč hru v panelu na pozadí.
 */
export function stopkyViditelnosti(): () => number {
  let nasbirano = 0;
  let od: number | null = document.visibilityState === "visible" ? Date.now() : null;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") od ??= Date.now();
    else if (od !== null) {
      nasbirano += Date.now() - od;
      od = null;
    }
  });
  return () => nasbirano + (od === null ? 0 : Date.now() - od);
}

/** Přihlásí obsluhu, která se zavolá při opouštění stránky těsně před odesláním deníku. */
export function predOdchodem(obsluha: () => void): void {
  predOdeslanim.push(obsluha);
}

/** Deník této stránky; při prvním volání ho založí a napojí na události prohlížeče. */
export function denikHry(): Denik {
  if (denik) return denik;
  const trvala = pamet("localStorage");
  const sezeni = pamet("sessionStorage");
  // Adresa s `?zaznam=vypnout` (odkazy ze stránky správce) záznam v tomto prohlížeči potichu
  // vypne dřív, než se cokoli zapíše: zkoušení autorů nemá kazit čísla o hráčích.
  if (new URLSearchParams(window.location.search).get("zaznam") === "vypnout") {
    try {
      (trvala ?? sezeni)?.setItem(KLIC_ZAZNAMU, "0");
    } catch {
      // Paměť je plná nebo zakázaná: deník se pak bez ní stejně nevede.
    }
    // Parametr z adresy zmizí: kdo by si adresu zkopíroval a poslal dál, nevypne tím záznam
    // dalším lidem, a obnovení stránky ho nevypne znovu tomu, kdo si ho mezitím zapnul.
    try {
      const adresa = new URL(window.location.href);
      adresa.searchParams.delete("zaznam");
      window.history.replaceState(window.history.state, "", adresa);
    } catch {
      // Bez přepsání adresy se nic nestane; záznam je vypnutý tak jako tak.
    }
  }
  const novy = new Denik({
    trvala,
    sezeni,
    ted: () => Date.now(),
    nahoda: nahodneCislo,
    posli: async (adresa, telo, naOdchodu): Promise<VysledekOdeslani> => {
      if (naOdchodu && typeof navigator.sendBeacon === "function") {
        return navigator.sendBeacon(adresa, new Blob([telo], { type: "application/json" })) ? "prijato" : "nedostupne";
      }
      try {
        const odpoved = await posliJson(adresa, telo);
        if (odpoved.ok) return "prijato";
        // Chybu v žádosti (špatný tvar, moc velká) nemá smysl opakovat; přetížení a chyby serveru ano.
        return odpoved.status >= 400 && odpoved.status < 500 && odpoved.status !== 429 ? "odmitnuto" : "nedostupne";
      } catch {
        return "nedostupne";
      }
    },
    hra: __VERZE_HRY__,
    sestaveni: __OTISK_SESTAVENI__,
    jazyk: (navigator.language || "").slice(0, 20),
    okno: [window.innerWidth, window.innerHeight],
    dotyk: window.matchMedia?.("(pointer: coarse)").matches ?? false,
  });
  denik = novy;

  const stav = (): void => {
    document.body.dataset.denik = novy.zapnuto ? "zapnuto" : "vypnuto";
    document.body.dataset.denikOdeslano = String(novy.odeslano);
  };
  stav();
  window.setInterval(() => {
    novy.tik();
    stav();
  }, 5000);
  const naOdchodu = (): void => void novy.odesli(true);
  window.addEventListener("pagehide", () => {
    for (const obsluha of predOdeslanim) {
      try {
        obsluha();
      } catch {
        // Zápis na rozloučenou nesmí zabránit odeslání toho, co už v deníku je.
      }
    }
    naOdchodu();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") naOdchodu();
  });
  // Stránka vrácená tlačítkem Zpět z paměti prohlížeče má starý stav: vypínač záznamu,
  // čísla dávek i medaile v přehledu. Načte se proto znovu.
  window.addEventListener("pageshow", (udalost) => {
    if (udalost.persisted) window.location.reload();
  });
  // Hráč přepnul záznam v jiném panelu: platí hned i tady.
  window.addEventListener("storage", (udalost) => {
    if (udalost.key !== null && udalost.key !== KLIC_ZAZNAMU) return;
    novy.nactiVolbu();
    stav();
    for (const obsluha of poZmeneVolby) obsluha();
  });
  // Chyby prohlížeče: stejná chyba nejvýš třikrát a nejvýš třicet za stránku. Chyba, která
  // se opakuje v každém snímku, by jinak deník zahltila a vytlačila z něj všechno ostatní.
  const pocetChyb = new Map<string, number>();
  let chybCelkem = 0;
  const zapisChybu = (zprava: string, zdroj: string, radek: number): void => {
    const kolikrat = (pocetChyb.get(zprava) ?? 0) + 1;
    pocetChyb.set(zprava, kolikrat);
    if (kolikrat > 3 || chybCelkem >= 30) return;
    chybCelkem += 1;
    novy.zapis("chyba", { zprava, zdroj, radek });
  };
  window.addEventListener("error", (udalost) => {
    zapisChybu(String(udalost.message).slice(0, 200), zdrojChyby(udalost.filename), udalost.lineno ?? 0);
  });
  window.addEventListener("unhandledrejection", (udalost) => {
    const duvod: unknown = udalost.reason;
    zapisChybu(String(duvod instanceof Error ? duvod.message : duvod).slice(0, 200), "promise", 0);
  });
  return novy;
}

/** Zapne nebo vypne záznam a promítne to do stavu stránky (pro vypínač a testy). */
export function nastavZaznam(zapnuto: boolean): void {
  const d = denikHry();
  d.zapnuto = zapnuto;
  document.body.dataset.denik = d.zapnuto ? "zapnuto" : "vypnuto";
  // Vypínač v přehledu, upozornění i okno zpětné vazby ukazují totéž, ať se přepnulo kdekoli.
  for (const obsluha of poZmeneVolby) obsluha();
}
