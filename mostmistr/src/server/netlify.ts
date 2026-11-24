// Prostředí serveru na Netlify: úložiště v Netlify Blobs, hodiny, náhoda a nastavení
// z proměnných prostředí. Funkce v `netlify/functions/` jsou jen tenké obálky nad obsluhou.

import type { PametSoli } from "./adresa";
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

/**
 * Soli dnů v paměti instance funkce, zvlášť pro úložiště ostrého webu a náhledů: sůl se tak
 * z úložiště čte jednou za den a instanci, ne při každé žádosti.
 */
const PAMETI_SOLI: Record<"ostra" | "nahled", PametSoli> = { ostra: new Map(), nahled: new Map() };

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
  const ostry = prostredi === "production";
  // Adresu hráče bere obsluha z hlavičky `x-nf-client-connection-ip` (`adresa.ts`).
  return {
    sklad: skladNetlify(ostry),
    pametSoli: PAMETI_SOLI[ostry ? "ostra" : "nahled"],
    ted: () => new Date(),
    nahoda: () => Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => b.toString(16).padStart(2, "0")).join(""),
    prostredi,
    hesloSpravce: promenna("MM_SPRAVCE_HESLO"),
    hesloRozboru: promenna("MM_ROZBOR_HESLO"),
  };
}
