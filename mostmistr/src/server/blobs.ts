// Úložiště záznamů v Netlify Blobs. Jediný soubor serveru, který zná Netlify; obsluha
// žádostí s ním mluví přes rozhraní `SkladZaznamu`.

import { getStore, type Store } from "@netlify/blobs";
import type { SkladZaznamu } from "./sklad";

/** Jméno úložiště v Netlify Blobs; je společné všem nasazením webu. */
export const JMENO_ULOZISTE = "mostmistr";

/**
 * Sklad nad daným úložištěm Netlify Blobs. Čte se pokud možno „silně“ (hned po zápisu je
 * vidět nová hodnota); prostředí, které to neumí, čte běžně a změna se projeví do minuty.
 */
export function skladNadBlobs(bezne: Store, silne: Store | null = null): SkladZaznamu {
  /** Zkusí čtení ze silného úložiště, při potíži z běžného. */
  const cti = async <T>(dotaz: (uloziste: Store) => Promise<T>): Promise<T> => {
    if (silne) {
      try {
        return await dotaz(silne);
      } catch {
        // Prostředí bez silného čtení: spadne se na běžné.
      }
    }
    return dotaz(bezne);
  };
  return {
    cti: (klic) => cti((u) => u.get(klic, { type: "json" }) as Promise<unknown>),
    zapis: async (klic, hodnota) => {
      await bezne.setJSON(klic, hodnota);
    },
    klice: async (predpona) => {
      const { blobs } = await cti((u) => u.list({ prefix: predpona }));
      return blobs.map((b) => b.key).sort();
    },
    slozky: async (predpona) => {
      const { directories } = await cti((u) => u.list({ prefix: predpona, directories: true }));
      // Netlify vrací složky celou cestou; rozhraní chce jen jméno pod předponou.
      return directories
        .map((d) => (d.startsWith(predpona) ? d.slice(predpona.length) : d).replace(/\/$/, ""))
        .filter((d) => d.length > 0)
        .sort();
    },
  };
}

/** Sklad webu na Netlify; nastavení si knihovna bere z prostředí funkce. */
export function skladNetlify(): SkladZaznamu {
  return skladNadBlobs(getStore(JMENO_ULOZISTE), getStore({ name: JMENO_ULOZISTE, consistency: "strong" }));
}
