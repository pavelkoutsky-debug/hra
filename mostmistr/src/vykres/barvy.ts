// Barvy modráku. Žlutá je vyhrazená pro varování; běžné prvky výkresu ji nepoužívají.
export const BARVY = {
  pozadi: "#103f78",
  mimoVykres: "rgba(4, 20, 46, 0.5)",
  cara: "#cfe3ff",
  caraSilna: "#ffffff",
  popisek: "#8fb4e6",
  voda: "#8fd0ff",
  zakaz: "#ff8a7a",
  varovani: "#ffd166",
} as const;

export const PISMO = '"DejaVu Sans Mono", "Cascadia Mono", Consolas, Menlo, monospace';

/** Světlá čára výkresu s danou průhledností. */
export function cara(alfa: number): string {
  return `rgba(207, 227, 255, ${alfa})`;
}
