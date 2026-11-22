import { zkontrolujNavrh } from "../data/navrh";
import { VERZE_FYZIKY } from "../jadro/verze";
import type { RozborMostu, ZpravaProZkousku, ZpravaZeZkousky } from "./protokol";
import { rozeberMost } from "./rozbor";
import { Zkouska } from "./zkouska";

/**
 * Běh zkoušky nezávislý na tom, kudy zprávy tečou. Ve hře ho obaluje Web Worker
 * (`pracovnik.ts`), v testech se volá přímo.
 *
 * Po zprávě „start“ zkoušku připraví a ohlásí „zacatek“. Samotný výpočet postupuje voláním
 * `pokracuj`, které pošle další část záznamu a nakonec výsledek; volající tak určuje,
 * jak často se mezi dávkami podívá na nové zprávy (zastavení, nový start).
 */
export class BehZkousky {
  readonly #posli: (zprava: ZpravaZeZkousky, prenest?: ArrayBufferLike[]) => void;
  #zkouska: Zkouska | null = null;

  constructor(posli: (zprava: ZpravaZeZkousky, prenest?: ArrayBufferLike[]) => void) {
    this.#posli = posli;
  }

  /** Běží zkouška, kterou je potřeba dál počítat? */
  get bezi(): boolean {
    return this.#zkouska !== null;
  }

  prijmi(zprava: ZpravaProZkousku): void {
    switch (zprava.typ) {
      case "ahoj":
        this.#posli({ typ: "pripraveno", verzeFyziky: VERZE_FYZIKY });
        return;
      case "start":
        this.#zkouska = null;
        this.#start(zprava);
        return;
      case "stop":
        this.#zkouska = null;
        return;
      case "rozbor": {
        // Rozbor běžící zkoušku neruší. Most, který porušuje pravidla úrovně nebo se nedá
        // sestavit, rozbor nemá; rozpočet při tom nehraje roli.
        let rozbor: RozborMostu | null = null;
        try {
          const prekazky = zkontrolujNavrh(zprava.navrh, zprava.uroven).filter((p) => p.druh !== "nad-rozpocet");
          if (prekazky.length === 0) rozbor = rozeberMost(zprava.uroven, zprava.navrh);
        } catch {
          rozbor = null;
        }
        this.#posli({ typ: "rozbor", id: zprava.id, rozbor });
        return;
      }
    }
  }

  #start(zprava: Extract<ZpravaProZkousku, { typ: "start" }>): void {
    const { vstup } = zprava;
    if (vstup.verzeFyziky !== VERZE_FYZIKY) {
      this.#posli({
        typ: "chyba",
        kod: "jina-verze-fyziky",
        podrobnosti: `hra ${vstup.verzeFyziky}, simulace ${VERZE_FYZIKY}`,
      });
      return;
    }
    // Brnknout a rozkmitat budičem se smí i most dražší, než je rozpočet: pokus nic nehodnotí.
    const pokus = vstup.brnknuti !== undefined || vstup.budic !== undefined;
    const problemy = zkontrolujNavrh(vstup.navrh, vstup.uroven).filter((p) => !(pokus && p.druh === "nad-rozpocet"));
    if (problemy.length > 0) {
      this.#posli({ typ: "chyba", kod: "neplatny-vstup", podrobnosti: problemy.map((p) => p.druh).join(", ") });
      return;
    }
    try {
      const zkouska = new Zkouska(vstup.uroven, vstup.navrh, vstup.nasada, vstup.brnknuti, vstup.budic);
      this.#zkouska = zkouska;
      this.#posli({
        typ: "zacatek",
        trvani: zkouska.trvani,
        dt: zkouska.simulace.dt,
        ucastnici: zkouska.ucastnici.map((u) => ({ ...u })),
      });
    } catch (chyba) {
      this.#posli({ typ: "chyba", kod: "vypocet-selhal", podrobnosti: chyba instanceof Error ? chyba.message : String(chyba) });
    }
  }

  /**
   * Spočítá nejvýš `sekundDeje` děje, pošle záznam a po doběhnutí výsledek.
   * Vrací true, dokud zbývá co počítat.
   */
  pokracuj(sekundDeje: number): boolean {
    const zkouska = this.#zkouska;
    if (!zkouska) return false;
    try {
      const davka = zkouska.pokracuj(sekundDeje);
      this.#posli(
        { typ: "zaznam", ...davka },
        davka.snimky.flatMap((s) => [s.polohy.buffer, s.vyuziti.buffer]),
      );
      if (zkouska.hotovo) {
        this.#zkouska = null;
        this.#posli({ typ: "konec", vysledek: zkouska.vysledek() });
        return false;
      }
      return true;
    } catch (chyba) {
      this.#zkouska = null;
      this.#posli({ typ: "chyba", kod: "vypocet-selhal", podrobnosti: chyba instanceof Error ? chyba.message : String(chyba) });
      return false;
    }
  }
}
