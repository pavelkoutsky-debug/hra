// Čtení a kontrola dat neznámého tvaru (soubory úrovní, uložené mosty, import od hráče).
// Každá chyba nese cestu k místu, kde vznikla, aby šla opravit bez hádání.

export class ChybaDat extends Error {
  readonly cesta: string;

  constructor(cesta: string, zprava: string) {
    super(`${cesta}: ${zprava}`);
    this.name = "ChybaDat";
    this.cesta = cesta;
  }
}

export function objekt(h: unknown, cesta: string): Record<string, unknown> {
  if (typeof h !== "object" || h === null || Array.isArray(h)) {
    throw new ChybaDat(cesta, "očekáván objekt");
  }
  return h as Record<string, unknown>;
}

export function pole(h: unknown, cesta: string): unknown[] {
  if (!Array.isArray(h)) throw new ChybaDat(cesta, "očekáváno pole");
  return h;
}

export interface MezeCisla {
  min?: number;
  max?: number;
  cele?: boolean;
}

export function cislo(h: unknown, cesta: string, meze: MezeCisla = {}): number {
  if (typeof h !== "number" || !Number.isFinite(h)) {
    throw new ChybaDat(cesta, "očekáváno konečné číslo");
  }
  if (meze.cele && !Number.isInteger(h)) throw new ChybaDat(cesta, "očekáváno celé číslo");
  if (meze.min !== undefined && h < meze.min) {
    throw new ChybaDat(cesta, `hodnota ${h} je menší než ${meze.min}`);
  }
  if (meze.max !== undefined && h > meze.max) {
    throw new ChybaDat(cesta, `hodnota ${h} je větší než ${meze.max}`);
  }
  return h;
}

export function text(h: unknown, cesta: string): string {
  if (typeof h !== "string" || h.length === 0) {
    throw new ChybaDat(cesta, "očekáván neprázdný text");
  }
  return h;
}

export function logicka(h: unknown, cesta: string): boolean {
  if (typeof h !== "boolean") throw new ChybaDat(cesta, "očekáváno ano/ne");
  return h;
}

export function jedenZ<T extends string>(h: unknown, cesta: string, moznosti: readonly T[]): T {
  if (typeof h !== "string" || !moznosti.includes(h as T)) {
    throw new ChybaDat(cesta, `očekávána jedna z hodnot: ${moznosti.join(", ")}`);
  }
  return h as T;
}

export function neboNull<T>(h: unknown, cti: (h: unknown) => T): T | null {
  return h === null ? null : cti(h);
}

export function volitelne<T>(h: unknown, cti: (h: unknown) => T): T | undefined {
  return h === undefined ? undefined : cti(h);
}

/** Přečte pole a každou položku předá čtečce spolu s její cestou. */
export function polozky<T>(h: unknown, cesta: string, cti: (h: unknown, cesta: string) => T): T[] {
  return pole(h, cesta).map((p, i) => cti(p, `${cesta}[${i}]`));
}

/** Odmítne klíče, které formát nezná. Překlep v souboru úrovně tak neprojde potichu. */
export function jenZnameKlice(o: Record<string, unknown>, cesta: string, zname: readonly string[]): void {
  for (const klic of Object.keys(o)) {
    if (!zname.includes(klic)) throw new ChybaDat(`${cesta}.${klic}`, "neznámý klíč");
  }
}
