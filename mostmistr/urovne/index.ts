import { nactiUroven, type Uroven } from "../src/data/uroven";
import zkusebniVykres from "./0-00.json";
import lavkaPresPotok from "./1-01.json";
import cyklostezka from "./1-02.json";
import prvniAuto from "./1-03.json";
import hlubokeUdoli from "./1-04.json";
import ocelovaLavka from "./2-01.json";
import ranniRozcvicka from "./2-02.json";
import cestnaJednotka from "./2-03.json";
import prehlidka from "./2-04.json";

/** Úrovně kampaně v pořadí, v jakém se hrají. */
const SOUBORY_KAMPANE: readonly unknown[] = [
  lavkaPresPotok,
  cyklostezka,
  prvniAuto,
  hlubokeUdoli,
  ocelovaLavka,
  ranniRozcvicka,
  cestnaJednotka,
  prehlidka,
];

/** Soubory úrovní tak, jak leží na disku; `nactiUrovne` je zkontroluje a převede. */
export const SOUBORY_UROVNI: readonly unknown[] = [zkusebniVykres, ...SOUBORY_KAMPANE];

export function nactiUrovne(): Uroven[] {
  return SOUBORY_UROVNI.map(nactiUroven);
}

/** Úrovně kampaně; zkušební výkres mezi ně nepatří. */
export function nactiKampan(): Uroven[] {
  return SOUBORY_KAMPANE.map(nactiUroven);
}

/**
 * Násada náhody pro zkoušku úrovně: stejná úroveň má vždy stejné fáze kroku chodců,
 * takže stejný most dopadne pokaždé stejně.
 */
export function nasadaUrovne(uroven: Uroven): number {
  let nasada = 2166136261;
  for (let i = 0; i < uroven.id.length; i++) nasada = Math.imul(nasada ^ uroven.id.charCodeAt(i), 16777619);
  return nasada >>> 0;
}
