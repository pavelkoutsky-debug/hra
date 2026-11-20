// Vstupní bod Web Workeru: jen předává zprávy mezi hrou a během zkoušky.
import { BehZkousky } from "./beh";
import type { ZpravaProZkousku, ZpravaZeZkousky } from "./protokol";

/** Část rozhraní pracovního vlákna, kterou potřebujeme; knihovnu WebWorker kvůli tomu nezapínáme. */
interface ProstrediPracovnika {
  postMessage(zprava: ZpravaZeZkousky): void;
  onmessage: ((udalost: { data: ZpravaProZkousku }) => void) | null;
}

const prostredi = self as unknown as ProstrediPracovnika;
const beh = new BehZkousky((zprava) => prostredi.postMessage(zprava));
prostredi.onmessage = (udalost) => beh.prijmi(udalost.data);
