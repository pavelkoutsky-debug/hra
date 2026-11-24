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
    // Pád vlákna. Chyba ve skriptu vlákna (mimo výpočet) přijde jako ErrorEvent s místem v kódu;
    // soubor vlákna, který nešel načíst (stará záložka po novém nasazení), jen jako událost bez
    // řádku a bez zprávy. Ten se hlásí zvlášť, protože pomůže načíst stránku znovu.
    this.#pracovnik.onerror = (udalost: Event) => {
      const vKodu = udalost instanceof ErrorEvent && (udalost.lineno > 0 || udalost.message !== "");
      const zprava: ZpravaZeZkousky = vKodu
        ? { typ: "chyba", kod: "vypocet-selhal", podrobnosti: udalost.message }
        : { typ: "chyba", kod: "skript-nenacten" };
      for (const posluchac of this.#posluchaci) posluchac(zprava);
    };
  }

  posli(zprava: ZpravaProZkousku): void {
    this.#pracovnik.postMessage(zprava);
  }

  /** Ukončí pracovní vlákno i s rozpočítanou zkouškou; klient pak už nic nepřijme. */
  ukonci(): void {
    this.#posluchaci.clear();
    this.#pracovnik.terminate();
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
        if (zprava.typ === "pripraveno") {
          odhlas();
          vyres(zprava.verzeFyziky);
        } else if (zprava.typ === "chyba") {
          odhlas();
          zamitni(new Error(zprava.podrobnosti ?? zprava.kod));
        }
      });
      this.posli({ typ: "ahoj" });
    });
  }
}
