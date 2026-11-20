// Pracovní vlákno zkušebny: počítá případ napřed a po dávkách posílá záznam.
import { BehZkusebny } from "./beh";
import { PRIPADY } from "./pripady";
import type { ZpravaProZkusebnu, ZpravaZeZkusebny } from "./zpravy";

interface ProstrediPracovnika {
  postMessage(zprava: ZpravaZeZkusebny, prenest?: Transferable[]): void;
  onmessage: ((udalost: { data: ZpravaProZkusebnu }) => void) | null;
}

const prostredi = self as unknown as ProstrediPracovnika;

/** Kolik sekund děje se spočítá najednou, než vlákno zkontroluje nové zprávy. */
const DAVKA_DEJE = 0.25;

/** Pořadové číslo běhu; nový požadavek starší běh ukončí. */
let cisloBehu = 0;

prostredi.onmessage = (udalost) => {
  const { pripad: id } = udalost.data;
  const moje = ++cisloBehu;
  const pripad = PRIPADY.find((p) => p.id === id);

  try {
    if (!pripad) throw new Error(`Případ „${id}“ zkušebna nezná.`);
    const pripraveny = pripad.priprav();
    const beh = new BehZkusebny(pripraveny);
    prostredi.postMessage({
      typ: "zacatek",
      pripad: id,
      vyrez: pripraveny.vyrez,
      trvani: pripraveny.trvani,
      dt: beh.dt,
    });

    let ms = 0;
    const davka = (): void => {
      if (moje !== cisloBehu) return;
      try {
        const zacatek = performance.now();
        const { snimky, topologie, udalosti } = beh.pokracuj(DAVKA_DEJE);
        ms += performance.now() - zacatek;
        prostredi.postMessage(
          { typ: "zaznam", pripad: id, snimky, topologie, udalosti },
          snimky.flatMap((s) => [s.polohy.buffer, s.vyuziti.buffer, s.kola.buffer, s.sily.buffer]),
        );
        if (beh.hotovo) {
          prostredi.postMessage({
            typ: "konec",
            pripad: id,
            overeni: beh.vyhodnot(),
            kroku: beh.kroku,
            trvani: beh.cas,
            ms,
          });
        } else {
          setTimeout(davka, 0);
        }
      } catch (chyba) {
        prostredi.postMessage({ typ: "chyba", pripad: id, zprava: chyba instanceof Error ? chyba.message : String(chyba) });
      }
    };
    davka();
  } catch (chyba) {
    prostredi.postMessage({ typ: "chyba", pripad: id, zprava: chyba instanceof Error ? chyba.message : String(chyba) });
  }
};
