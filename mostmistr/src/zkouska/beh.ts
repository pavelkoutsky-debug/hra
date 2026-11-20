import { VERZE_FYZIKY } from "../jadro/verze";
import type { ZpravaProZkousku, ZpravaZeZkousky } from "./protokol";

/**
 * Běh zkoušky nezávislý na tom, kudy zprávy tečou. Ve hře ho obaluje Web Worker
 * (`pracovnik.ts`), v testech se volá přímo.
 *
 * V milníku M0 umí jen ohlásit verzi fyziky; samotná simulace přijde s jádrem v M1b.
 */
export class BehZkousky {
  readonly #posli: (zprava: ZpravaZeZkousky) => void;

  constructor(posli: (zprava: ZpravaZeZkousky) => void) {
    this.#posli = posli;
  }

  prijmi(zprava: ZpravaProZkousku): void {
    switch (zprava.typ) {
      case "ahoj":
        this.#posli({ typ: "pripraveno", verzeFyziky: VERZE_FYZIKY });
        return;
      case "start":
        if (zprava.vstup.verzeFyziky !== VERZE_FYZIKY) {
          this.#posli({
            typ: "chyba",
            kod: "jina-verze-fyziky",
            podrobnosti: `hra ${zprava.vstup.verzeFyziky}, simulace ${VERZE_FYZIKY}`,
          });
          return;
        }
        this.#posli({ typ: "chyba", kod: "jadro-neni-hotove" });
        return;
      case "vstup":
      case "stop":
        // Bez běžící simulace není co ovlivnit ani zastavit.
        return;
    }
  }
}
