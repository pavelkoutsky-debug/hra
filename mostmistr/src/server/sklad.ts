// Úložiště záznamů na serveru: zpětná vazba hráčů a dávky deníku hraní.
// Obsluha žádostí zná jen toto rozhraní; na Netlify za ním stojí Netlify Blobs
// (`blobs.ts`), v testech paměť.

export interface SkladZaznamu {
  /** Záznam pod klíčem (rozebraný JSON); null, když tam žádný není. */
  cti(klic: string): Promise<unknown>;
  zapis(klic: string, hodnota: unknown): Promise<void>;
  /** Všechny klíče začínající předponou, vzestupně podle abecedy. */
  klice(predpona: string): Promise<string[]>;
  /**
   * „Složky“ přímo pod předponou: části klíčů mezi předponou a dalším lomítkem, každá jednou,
   * vzestupně. Předpona má končit lomítkem (nebo být prázdná).
   */
  slozky(predpona: string): Promise<string[]>;
}

/** Úložiště v paměti pro testy a pro zkoušení stránky správce bez serveru. */
export class SkladVPameti implements SkladZaznamu {
  readonly #zaznamy = new Map<string, string>();

  get pocet(): number {
    return this.#zaznamy.size;
  }

  cti(klic: string): Promise<unknown> {
    const zapis = this.#zaznamy.get(klic);
    return Promise.resolve(zapis === undefined ? null : (JSON.parse(zapis) as unknown));
  }

  zapis(klic: string, hodnota: unknown): Promise<void> {
    this.#zaznamy.set(klic, JSON.stringify(hodnota));
    return Promise.resolve();
  }

  klice(predpona: string): Promise<string[]> {
    return Promise.resolve([...this.#zaznamy.keys()].filter((k) => k.startsWith(predpona)).sort());
  }

  slozky(predpona: string): Promise<string[]> {
    const slozky = new Set<string>();
    for (const klic of this.#zaznamy.keys()) {
      if (!klic.startsWith(predpona)) continue;
      const zbytek = klic.slice(predpona.length);
      const lomitko = zbytek.indexOf("/");
      if (lomitko > 0) slozky.add(zbytek.slice(0, lomitko));
    }
    return Promise.resolve([...slozky].sort());
  }
}
