// Deník hraní napojený na prohlížeč: paměť, síť, pravidelné odesílání, odeslání při zavření
// stránky a zápis chyb, které prohlížeč ohlásí. Jedna stránka má jeden deník.

import { Denik, type PametDeniku } from "./denik";

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

/** Odešle JSON na adresu téhož webu; vrací odpověď serveru, nebo null, když se to nepovedlo. */
async function odesli(adresa: string, telo: string): Promise<Response | null> {
  try {
    const odpoved = await fetch(adresa, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: telo,
      // Malou žádost prohlížeč dokončí, i když hráč mezitím přejde jinam.
      keepalive: telo.length < 60_000,
    });
    return odpoved.ok ? odpoved : null;
  } catch {
    return null;
  }
}

/** Odešle zpětnou vazbu a vrátí její číslo; null, když ji server nepřijal. */
export async function odesliVazbu(adresa: string, telo: string): Promise<{ id: string } | null> {
  const odpoved = await odesli(adresa, telo);
  if (!odpoved) return null;
  try {
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

/** Deník této stránky; při prvním volání ho založí a napojí na události prohlížeče. */
export function denikHry(): Denik {
  if (denik) return denik;
  const novy = new Denik({
    trvala: pamet("localStorage"),
    sezeni: pamet("sessionStorage"),
    ted: () => Date.now(),
    nahoda: nahodneCislo,
    posli: async (adresa, telo, naOdchodu) => {
      if (naOdchodu && typeof navigator.sendBeacon === "function") {
        return navigator.sendBeacon(adresa, new Blob([telo], { type: "application/json" }));
      }
      return (await odesli(adresa, telo)) !== null;
    },
    hra: __VERZE_HRY__,
    sestaveni: __OTISK_SESTAVENI__,
    jazyk: navigator.language || "",
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
  window.addEventListener("pagehide", naOdchodu);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") naOdchodu();
  });
  window.addEventListener("error", (udalost) => {
    novy.zapis("chyba", {
      zprava: String(udalost.message).slice(0, 300),
      zdroj: zdrojChyby(udalost.filename),
      radek: udalost.lineno ?? 0,
    });
  });
  window.addEventListener("unhandledrejection", (udalost) => {
    const duvod: unknown = udalost.reason;
    novy.zapis("chyba", { zprava: String(duvod instanceof Error ? duvod.message : duvod).slice(0, 300), zdroj: "promise" });
  });
  return novy;
}

/** Zapne nebo vypne záznam a promítne to do stavu stránky (pro vypínač a testy). */
export function nastavZaznam(zapnuto: boolean): void {
  const d = denikHry();
  d.zapnuto = zapnuto;
  document.body.dataset.denik = zapnuto ? "zapnuto" : "vypnuto";
}
