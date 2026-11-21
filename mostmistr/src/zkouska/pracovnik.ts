// Vstupní bod Web Workeru: předává zprávy mezi hrou a během zkoušky a zkoušku po dávkách
// počítá, aby mezi nimi stihl přijmout zastavení nebo nový start.
import { BehZkousky } from "./beh";
import type { ZpravaProZkousku, ZpravaZeZkousky } from "./protokol";

/** Část rozhraní pracovního vlákna, kterou potřebujeme; knihovnu WebWorker kvůli tomu nezapínáme. */
interface ProstrediPracovnika {
  postMessage(zprava: ZpravaZeZkousky, prenest?: ArrayBufferLike[]): void;
  onmessage: ((udalost: { data: ZpravaProZkousku }) => void) | null;
}

/** Kolik sekund děje se spočítá najednou. */
const DAVKA_DEJE = 0.25;

const prostredi = self as unknown as ProstrediPracovnika;
const beh = new BehZkousky((zprava, prenest) => prostredi.postMessage(zprava, prenest));
let naplanovano = false;

function davka(): void {
  naplanovano = false;
  if (beh.pokracuj(DAVKA_DEJE)) naplanuj();
}

function naplanuj(): void {
  if (naplanovano) return;
  naplanovano = true;
  setTimeout(davka, 0);
}

prostredi.onmessage = (udalost) => {
  beh.prijmi(udalost.data);
  if (beh.bezi) naplanuj();
};
