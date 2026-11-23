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
import okresniSilnice from "./3-01.json";
import podVedenim from "./3-02.json";
import linka from "./3-03.json";
import kolona from "./3-04.json";
import triPole from "./4-01.json";
import ramovyMost from "./4-02.json";
import naLanech from "./4-03.json";
import nakladStoleti from "./4-04.json";
import nabrezi from "./5-01.json";
import mestskyBeh from "./5-02.json";
import slavnost from "./5-03.json";
import koncert from "./5-04.json";
import prvniVlak from "./6-01.json";
import rychlik from "./6-02.json";
import uhelnyVlak from "./6-03.json";
import dvePatra from "./6-04.json";
import zvedaciMost from "./7-01.json";
import dveKridla from "./7-02.json";
import dlouheKridlo from "./7-03.json";
import velkyPristav from "./7-04.json";

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
  okresniSilnice,
  podVedenim,
  linka,
  kolona,
  triPole,
  ramovyMost,
  naLanech,
  nakladStoleti,
  nabrezi,
  mestskyBeh,
  slavnost,
  koncert,
  prvniVlak,
  rychlik,
  uhelnyVlak,
  dvePatra,
  zvedaciMost,
  dveKridla,
  dlouheKridlo,
  velkyPristav,
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
