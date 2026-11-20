import type { Rozmer } from "./kamera";

/**
 * Plátno výkresu: hlídá velikost a hustotu pixelů a překresluje nejvýš jednou za snímek.
 * Kreslicí funkce dostane kontext, jehož jednotkou je CSS pixel.
 */
export class Platno {
  readonly #canvas: HTMLCanvasElement;
  readonly #ctx: CanvasRenderingContext2D;
  readonly #kresli: (ctx: CanvasRenderingContext2D, rozmer: Rozmer) => void;
  readonly #priZmeneRozmeru: (rozmer: Rozmer, predchozi: Rozmer) => void;
  #rozmer: Rozmer = { sirka: 0, vyska: 0 };
  #naplanovano = false;

  constructor(
    canvas: HTMLCanvasElement,
    kresli: (ctx: CanvasRenderingContext2D, rozmer: Rozmer) => void,
    priZmeneRozmeru: (rozmer: Rozmer, predchozi: Rozmer) => void,
  ) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Prohlížeč neposkytl kreslicí kontext plátna.");
    this.#canvas = canvas;
    this.#ctx = ctx;
    this.#kresli = kresli;
    this.#priZmeneRozmeru = priZmeneRozmeru;

    // Konstruktor jen změří velikost. Posluchač změny rozměru se volá až při pozdějších
    // změnách, kdy už má volající hotovou instanci plátna v ruce.
    this.#rozmer = this.#zmer();
    new ResizeObserver(() => this.#prizpusobVelikost()).observe(canvas);
  }

  get rozmer(): Rozmer {
    return this.#rozmer;
  }

  /** Požádá o překreslení v příštím snímku; opakované žádosti se sloučí. */
  prekresli(): void {
    if (this.#naplanovano) return;
    this.#naplanovano = true;
    requestAnimationFrame(() => {
      this.#naplanovano = false;
      this.#ctx.setTransform(this.#hustota(), 0, 0, this.#hustota(), 0, 0);
      this.#kresli(this.#ctx, this.#rozmer);
    });
  }

  #hustota(): number {
    return window.devicePixelRatio || 1;
  }

  /** Nastaví rozlišení plátna podle jeho velikosti na stránce a vrátí ji v CSS pixelech. */
  #zmer(): Rozmer {
    const obrys = this.#canvas.getBoundingClientRect();
    const rozmer: Rozmer = { sirka: Math.max(1, obrys.width), vyska: Math.max(1, obrys.height) };
    const sirkaPx = Math.round(rozmer.sirka * this.#hustota());
    const vyskaPx = Math.round(rozmer.vyska * this.#hustota());
    if (this.#canvas.width !== sirkaPx) this.#canvas.width = sirkaPx;
    if (this.#canvas.height !== vyskaPx) this.#canvas.height = vyskaPx;
    return rozmer;
  }

  #prizpusobVelikost(): void {
    const rozmer = this.#zmer();
    const predchozi = this.#rozmer;
    this.#rozmer = rozmer;
    if (predchozi.sirka !== rozmer.sirka || predchozi.vyska !== rozmer.vyska) {
      this.#priZmeneRozmeru(rozmer, predchozi);
    }
    this.prekresli();
  }
}
