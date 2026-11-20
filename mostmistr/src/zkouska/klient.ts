import type { ZpravaProZkousku, ZpravaZeZkousky } from "./protokol";

/** Strana hry: drží pracovní vlákno se simulací a rozesílá jeho zprávy posluchačům. */
export class KlientZkousky {
  readonly #pracovnik: Worker;
  readonly #posluchaci = new Set<(zprava: ZpravaZeZkousky) => void>();

  constructor() {
    this.#pracovnik = new Worker(new URL("./pracovnik.ts", import.meta.url), { type: "module" });
    this.#pracovnik.onmessage = (udalost: MessageEvent<ZpravaZeZkousky>) => {
      for (const posluchac of this.#posluchaci) posluchac(udalost.data);
    };
  }

  posli(zprava: ZpravaProZkousku): void {
    this.#pracovnik.postMessage(zprava);
  }

  /** Přihlásí posluchače; vrací funkci, která ho odhlásí. */
  poslouchej(posluchac: (zprava: ZpravaZeZkousky) => void): () => void {
    this.#posluchaci.add(posluchac);
    return () => this.#posluchaci.delete(posluchac);
  }

  /** Zeptá se simulace na verzi fyziky. Zároveň ověří, že pracovní vlákno žije. */
  zjistiVerziFyziky(): Promise<number> {
    return new Promise((vyres, zamitni) => {
      const odhlas = this.poslouchej((zprava) => {
        if (zprava.typ !== "pripraveno") return;
        odhlas();
        vyres(zprava.verzeFyziky);
      });
      this.#pracovnik.onerror = (udalost) => {
        odhlas();
        zamitni(new Error(udalost.message));
      };
      this.posli({ typ: "ahoj" });
    });
  }
}
