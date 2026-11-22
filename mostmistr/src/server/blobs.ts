// Úložiště záznamů v Netlify Blobs. Jediný soubor serveru, který zná Netlify; obsluha
// žádostí s ním mluví přes rozhraní `SkladZaznamu`.

import { getStore, type Store } from "@netlify/blobs";
import type { SkladZaznamu } from "./sklad";

/**
 * Jména úložišť v Netlify Blobs. Úložiště je společné všem nasazením webu, proto má ostrý
 * web jedno a náhledy pull requestů a pokusná nasazení druhé: náhled tak nevidí zprávy
 * hráčů a hraní při zkoušení náhledu nekazí statistiky.
 */
export const ULOZISTE_OSTRE = "mostmistr";
export const ULOZISTE_NAHLEDU = "mostmistr-nahled";

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
    smaz: async (klic) => {
      await bezne.delete(klic);
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

/** Sklad webu na Netlify pro ostrý web nebo pro náhledy; nastavení si knihovna bere z prostředí funkce. */
export function skladNetlify(ostry: boolean): SkladZaznamu {
  const jmeno = ostry ? ULOZISTE_OSTRE : ULOZISTE_NAHLEDU;
  return skladNadBlobs(getStore(jmeno), getStore({ name: jmeno, consistency: "strong" }));
}
