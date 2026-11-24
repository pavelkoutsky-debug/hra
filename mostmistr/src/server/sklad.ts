// Úložiště záznamů na serveru: zpětná vazba hráčů a dávky deníku hraní.
// Obsluha žádostí zná jen toto rozhraní; na Netlify za ním stojí Netlify Blobs
// (`blobs.ts`), v testech paměť.

export interface SkladZaznamu {
  /** Záznam pod klíčem (rozebraný JSON); null, když tam žádný není. */
  cti(klic: string): Promise<unknown>;
  zapis(klic: string, hodnota: unknown): Promise<void>;
  /**
   * Záznam i se značkou jeho verze, pro zápis s podmínkou; `znacka` null znamená, že pod
   * klíčem nic není, a prázdná, že úložiště značku nevede (zápis s ní projde vždy).
   */
  ctiSeZnackou(klic: string): Promise<{ hodnota: unknown; znacka: string | null }>;
  /**
   * Zapíše jen tehdy, když se záznam od přečtení nezměnil (`znacka` z `ctiSeZnackou`; null =
   * záznam ještě neexistoval). Vrací, jestli se zapsalo; když ne, někdo zapsal mezitím a volající
   * má záznam přečíst a zkusit to znovu. Tak dva souběžné zápisy nepřepíšou jeden druhý.
   */
  zapisPokud(klic: string, hodnota: unknown, znacka: string | null): Promise<boolean>;
  /** Smaže záznam pod klíčem; když tam žádný není, nestane se nic. */
  smaz(klic: string): Promise<void>;
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
  /** Kolikrát se pod klíč zapsalo: značka verze pro zápis s podmínkou. */
  readonly #verze = new Map<string, number>();

  cti(klic: string): Promise<unknown> {
    const zapis = this.#zaznamy.get(klic);
    return Promise.resolve(zapis === undefined ? null : (JSON.parse(zapis) as unknown));
  }

  zapis(klic: string, hodnota: unknown): Promise<void> {
    this.#zaznamy.set(klic, JSON.stringify(hodnota));
    this.#verze.set(klic, (this.#verze.get(klic) ?? 0) + 1);
    return Promise.resolve();
  }

  ctiSeZnackou(klic: string): Promise<{ hodnota: unknown; znacka: string | null }> {
    const zapis = this.#zaznamy.get(klic);
    if (zapis === undefined) return Promise.resolve({ hodnota: null, znacka: null });
    return Promise.resolve({ hodnota: JSON.parse(zapis) as unknown, znacka: String(this.#verze.get(klic) ?? 0) });
  }

  zapisPokud(klic: string, hodnota: unknown, znacka: string | null): Promise<boolean> {
    const dnes = this.#zaznamy.has(klic) ? String(this.#verze.get(klic) ?? 0) : null;
    if (dnes !== znacka) return Promise.resolve(false);
    return this.zapis(klic, hodnota).then(() => true);
  }

  smaz(klic: string): Promise<void> {
    this.#zaznamy.delete(klic);
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

/** Zápis s podmínkou se ani po opakování nepovedl: někdo záznam pořád měnil. */
export class SoubehZapisu extends Error {}

/** Kolikrát se zkusí zápis s podmínkou, když záznam mezitím změnil někdo jiný. */
const POKUSU_O_ZAPIS = 6;

/**
 * Zápis s podmínkou a s opakováním: přečte, upraví, zapíše; když mezitím zapsal někdo jiný,
 * znovu. Když se to nepovede ani napotřetí… pošesté, vzdá to (`SoubehZapisu`): zápis bez
 * podmínky by přepsal cizí zápis, a to je horší než požádat o nový pokus. `zapsat: undefined`
 * znamená „nic neměnit“.
 */
export async function upravSPodminkou<T>(
  sklad: SkladZaznamu,
  klic: string,
  zmena: (dnes: unknown) => { zapsat: unknown; vysledek: T },
): Promise<T> {
  for (let pokus = 0; pokus < POKUSU_O_ZAPIS; pokus++) {
    const { hodnota, znacka } = await sklad.ctiSeZnackou(klic);
    const { zapsat, vysledek } = zmena(hodnota);
    if (zapsat === undefined || (await sklad.zapisPokud(klic, zapsat, znacka))) return vysledek;
  }
  throw new SoubehZapisu(klic);
}
