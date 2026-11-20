import { nactiUroven, type Uroven } from "../src/data/uroven";
import zkusebniVykres from "./0-00.json";

/** Soubory úrovní tak, jak leží na disku; `nactiUrovne` je zkontroluje a převede. */
export const SOUBORY_UROVNI: readonly unknown[] = [zkusebniVykres];

export function nactiUrovne(): Uroven[] {
  return SOUBORY_UROVNI.map(nactiUroven);
}
