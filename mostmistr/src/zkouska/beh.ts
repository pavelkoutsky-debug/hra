import { VERZE_FYZIKY } from "../jadro/verze";
import type { ZpravaProZkousku, ZpravaZeZkousky } from "./protokol";

/**
 * Běh zkoušky nezávislý na tom, kudy zprávy tečou. Ve hře ho obaluje Web Worker
 * (`pracovnik.ts`), v testech se volá přímo.
 *
 * Zatím umí jen ohlásit verzi fyziky. Jádro je hotové (M1b), ale běh zkoušky s provozem
 * podle jízdního řádu a s hodnocením přijde až s první hratelnou verzí (M2); do té doby
 * zkoušku poctivě odmítne.
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
        this.#posli({ typ: "chyba", kod: "zkouska-neni-hotova" });
        return;
      case "vstup":
      case "stop":
        // Bez běžící simulace není co ovlivnit ani zastavit.
        return;
    }
  }
}
