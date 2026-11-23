import type { Rozmer } from "./kamera";

/**
 * Uložená vrstva výkresu. Při přehrávání zkoušky se pohled většinou nehýbe, a tak se rastr,
 * voda a šrafy terénu nakreslí jednou do pomocného plátna a v dalších snímcích se jen
 * přenesou. Dokud se pohled hýbe (klíč se snímek od snímku mění), kreslí se rovnou: ukládat
 * obraz, který se hned zahodí, by stálo víc než kreslení samo.
 */
export class UlozenaVrstva {
  #platno: HTMLCanvasElement | null = null;
  /** Klíč obrazu, který je v pomocném plátně; prázdný, když v něm nic platného není. */
  #ulozeny = "";
  /** Klíč posledního snímku: vrstva se uloží, až když se dvakrát po sobě nezmění. */
  #posledni = "";

  /**
   * Nakreslí vrstvu do `ctx`. `klic` popisuje všechno, na čem obraz závisí (pohled); velikost
   * plátna a hustotu pixelů si vrstva hlídá sama. `kresli` dostane kontext s jednotkou CSS pixel.
   */
  nakresli(ctx: CanvasRenderingContext2D, rozmer: Rozmer, klic: string, kresli: (ctx: CanvasRenderingContext2D) => void): void {
    const hustota = window.devicePixelRatio || 1;
    const sirka = Math.round(rozmer.sirka * hustota);
    const vyska = Math.round(rozmer.vyska * hustota);
    const plny = `${klic}|${sirka}|${vyska}`;
    if (plny !== this.#ulozeny) {
      const stabilni = plny === this.#posledni;
      this.#posledni = plny;
      const pomocny = stabilni ? this.#priprav(sirka, vyska) : null;
      if (!pomocny) {
        this.#ulozeny = "";
        kresli(ctx);
        return;
      }
      pomocny.setTransform(hustota, 0, 0, hustota, 0, 0);
      kresli(pomocny);
      this.#ulozeny = plny;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.#platno!, 0, 0);
    ctx.restore();
  }

  /** Zahodí uložený obraz (změnil se obsah, který klíč nepopisuje). */
  zahod(): void {
    this.#ulozeny = "";
    this.#posledni = "";
  }

  #priprav(sirka: number, vyska: number): CanvasRenderingContext2D | null {
    this.#platno ??= document.createElement("canvas");
    if (this.#platno.width !== sirka) this.#platno.width = sirka;
    if (this.#platno.height !== vyska) this.#platno.height = vyska;
    return this.#platno.getContext("2d", { alpha: false });
  }
}
