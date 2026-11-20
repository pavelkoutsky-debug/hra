// Pracovní vlákno měřicí stránky: změří výkon a průběžně posílá výsledky.
import { zmerVykon, type VysledekMereni } from "./vykon";

export type ZpravaMereni =
  | { typ: "vysledek"; vysledek: VysledekMereni }
  | { typ: "hotovo" }
  | { typ: "chyba"; zprava: string };

interface ProstrediPracovnika {
  postMessage(zprava: ZpravaMereni): void;
  onmessage: ((udalost: { data: { trvaniMs: number } }) => void) | null;
}

const prostredi = self as unknown as ProstrediPracovnika;
prostredi.onmessage = (udalost) => {
  try {
    zmerVykon(
      () => performance.now(),
      (vysledek) => prostredi.postMessage({ typ: "vysledek", vysledek }),
      udalost.data.trvaniMs,
    );
    prostredi.postMessage({ typ: "hotovo" });
  } catch (chyba) {
    prostredi.postMessage({ typ: "chyba", zprava: chyba instanceof Error ? chyba.message : String(chyba) });
  }
};
