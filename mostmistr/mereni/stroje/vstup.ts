// Otisky fyziky pro samostatné stroje JavaScriptu (V8 v Node, JavaScriptCore, SpiderMonkey):
// regresní sada a zkouška referenčních mostů všech úrovní kampaně. Výpis musí být ve všech
// strojích stejný do posledního znaku; porovnává ho `porovnej.mjs` (`npm run stroje`).
import { SCENARE, SCENARE_ZKOUSEK, spustScenar, spustScenarZkousky } from "../../src/zkouska/regrese";
import { Zkouska } from "../../src/zkouska/zkouska";
import { nactiKampan, nasadaUrovne } from "../../urovne/index";
import { RESENI } from "../../urovne/reseni";

// Samostatné stroje mají `print`, Node `console.log`.
declare const print: ((radek: string) => void) | undefined;
const pis = (radek: string): void => (typeof print === "function" ? print(radek) : console.log(radek));

for (const s of SCENARE) pis(`scenar ${s.id} ${JSON.stringify(spustScenar(s))}`);
for (const s of SCENARE_ZKOUSEK) pis(`scenar-zkousky ${s.id} ${JSON.stringify(spustScenarZkousky(s))}`);
for (const u of nactiKampan()) {
  for (const klic of ["pruchod", "mistrovska"] as const) {
    const z = new Zkouska(u, RESENI[u.id]![klic], nasadaUrovne(u));
    let pojistka = 0;
    while (!z.hotovo && pojistka++ < 500) z.pokracuj(1);
    const v = z.vysledek();
    pis(`${u.id} ${klic} ${v.otisk} pruchod=${v.pruchod} vyuziti=${v.nejvetsiVyuziti} kmitani=${v.komfort?.zrychleni ?? "-"} trvani=${v.trvani} kroku=${v.kroku}`);
  }
}
pis("hotovo");
