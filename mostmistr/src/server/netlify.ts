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

/** Co funkce Netlify dostává jako druhý argument; z něj se pozná, o jaké nasazení jde. */
export interface KontextNetlify {
  deploy?: { context?: string };
}

/**
 * Prostředí pro obsluhu žádosti. Druh nasazení (`production`, `deploy-preview`, `dev`…) je
 * v kontextu funkce; proměnná CONTEXT existuje jen při sestavení. Když se nepozná, bere se
 * nasazení jako náhled: do úložiště ostrého webu se tak omylem nic nedostane.
 */
export function prostrediNetlify(kontext?: KontextNetlify): ProstrediServeru {
  const prostredi = kontext?.deploy?.context ?? promenna("CONTEXT") ?? "neznamo";
  return {
    sklad: skladNetlify(prostredi === "production"),
    ted: () => new Date(),
    nahoda: () => Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => b.toString(16).padStart(2, "0")).join(""),
    prostredi,
    hesloSpravce: promenna("MM_SPRAVCE_HESLO"),
  };
}
