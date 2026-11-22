// Prostředí serveru na Netlify: úložiště v Netlify Blobs, hodiny, náhoda a nastavení
// z proměnných prostředí. Funkce v `netlify/functions/` jsou jen tenké obálky nad obsluhou.

import { skladNetlify } from "./blobs";
import type { ProstrediServeru } from "./obsluha";

/** Proměnná prostředí funkce; Netlify ji dává přes `Netlify.env`, Node přes `process.env`. */
function promenna(jmeno: string): string | null {
  const svet = globalThis as {
    Netlify?: { env?: { get(jmeno: string): string | undefined } };
    process?: { env?: Record<string, string | undefined> };
  };
  const hodnota = svet.Netlify?.env?.get(jmeno) ?? svet.process?.env?.[jmeno];
  return hodnota === undefined || hodnota === "" ? null : hodnota;
}

export function prostrediNetlify(): ProstrediServeru {
  return {
    sklad: skladNetlify(),
    ted: () => new Date(),
    nahoda: () => Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => b.toString(16).padStart(2, "0")).join(""),
    prostredi: promenna("CONTEXT") ?? "neznamo",
    hesloSpravce: promenna("MM_SPRAVCE_HESLO"),
  };
}
