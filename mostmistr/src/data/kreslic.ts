// Pomocník pro psaní návrhů mostů v kódu: referenční řešení úrovní, regresní mosty, testy.

import type { IdPrvku } from "./katalog";
import { VERZE_NAVRHU, type NavrhMostu, type PrutNavrhu, type StycnikNavrhu } from "./navrh";

/** Pomocník pro psaní návrhů: styčníky podle souřadnic, pruty podle koncových bodů. */
export class Kreslic {
  readonly stycniky: StycnikNavrhu[] = [];
  readonly pruty: PrutNavrhu[] = [];
  readonly #podleMista = new Map<string, number>();

  /** `uroven` je id úrovně, pro kterou návrh vzniká. */
  constructor(readonly uroven = "9-99") {}

  /** Id styčníku v daném místě; když tam žádný není, založí ho. */
  bod(x: number, y: number, vlastnosti: Partial<StycnikNavrhu> = {}): number {
    const klic = `${x},${y}`;
    let id = this.#podleMista.get(klic);
    if (id === undefined) {
      id = this.stycniky.length;
      this.stycniky.push({ id, x, y });
      this.#podleMista.set(klic, id);
    }
    Object.assign(this.stycniky[id]!, vlastnosti);
    return id;
  }

  prut(prvek: IdPrvku, a: [number, number], b: [number, number], vlastnosti: Partial<PrutNavrhu> = {}): number {
    const id = this.pruty.length;
    this.pruty.push({ id, a: this.bod(a[0], a[1]), b: this.bod(b[0], b[1]), prvek, ...vlastnosti });
    return id;
  }

  /** Označí všechny dosud založené styčníky jako svařené. */
  svarVse(): void {
    for (const st of this.stycniky) st.svar = true;
  }

  navrh(): NavrhMostu {
    return { verze: VERZE_NAVRHU, uroven: this.uroven, stycniky: this.stycniky, pruty: this.pruty };
  }
}
