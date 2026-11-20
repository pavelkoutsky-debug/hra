// Měřicí stránka: spustí měření v pracovním vlákně a ukáže tabulku výsledků.
// Je to nástroj pro vývoj, ne součást hry; proto má texty přímo u sebe.
import { cislo } from "../src/ui/formaty";
import type { ZpravaMereni } from "./pracovnik";
import type { VysledekMereni } from "./vykon";

const tlacitko = document.querySelector<HTMLButtonElement>("#spustit")!;
const kopirovat = document.querySelector<HTMLButtonElement>("#kopirovat")!;
const telo = document.querySelector<HTMLTableSectionElement>("#vysledky tbody")!;
const stav = document.querySelector<HTMLElement>("#stav")!;
const prostredi = document.querySelector<HTMLElement>("#prostredi")!;

prostredi.textContent = `${navigator.userAgent} · jader: ${navigator.hardwareConcurrency} · sestavení ${__VERZE_HRY__} ${__OTISK_SESTAVENI__}`;

let vysledky: VysledekMereni[] = [];

function radek(v: VysledekMereni): HTMLTableRowElement {
  const tr = document.createElement("tr");
  const bunky = [
    v.nazev,
    v.svarene ? "svařený" : "kloubový",
    `${v.stycniku} / ${v.prutu} / ${v.kol}`,
    String(v.stupnu),
    cislo(v.krokuNaSekundu, 0),
    cislo(v.prvniFrekvence, 2),
    cislo(v.holeJadro.mikrosekundNaKrok, 2),
    `${cislo(v.holeJadro.nasobekRealnehoCasu, 1)}×`,
    cislo(v.sProvozem.mikrosekundNaKrok, 2),
    `${cislo(v.sProvozem.nasobekRealnehoCasu, 1)}×`,
    cislo(v.priprava.nejvyssiFrekvence + v.priprava.rovnovaha + v.priprava.vlastniTvary, 0),
  ];
  for (const text of bunky) {
    const td = document.createElement("td");
    td.textContent = text;
    tr.append(td);
  }
  return tr;
}

tlacitko.addEventListener("click", () => {
  tlacitko.disabled = true;
  kopirovat.disabled = true;
  vysledky = [];
  telo.replaceChildren();
  stav.textContent = "Měřím…";
  stav.dataset.stav = "bezi";

  const pracovnik = new Worker(new URL("./pracovnik.ts", import.meta.url), { type: "module" });
  const dokonci = (text: string, stavMereni: string): void => {
    stav.textContent = text;
    stav.dataset.stav = stavMereni;
    tlacitko.disabled = false;
    pracovnik.terminate();
  };
  pracovnik.onmessage = (udalost: MessageEvent<ZpravaMereni>) => {
    const zprava = udalost.data;
    if (zprava.typ === "vysledek") {
      vysledky.push(zprava.vysledek);
      telo.append(radek(zprava.vysledek));
    } else if (zprava.typ === "hotovo") {
      kopirovat.disabled = false;
      dokonci("Hotovo.", "hotovo");
    } else {
      dokonci(`Měření selhalo: ${zprava.zprava}`, "chyba");
    }
  };
  pracovnik.onerror = (udalost) => dokonci(`Měření selhalo: ${udalost.message}`, "chyba");
  const trvaniMs = Number(new URLSearchParams(location.search).get("trvani") ?? 500);
  pracovnik.postMessage({ trvaniMs });
});

kopirovat.addEventListener("click", () => {
  const text = JSON.stringify({ prostredi: prostredi.textContent, vysledky }, null, 1);
  void navigator.clipboard.writeText(text).then(() => {
    stav.textContent = "Zkopírováno do schránky.";
  });
});

// Pro automatické měření: výsledky jsou dostupné i skriptu, který stránku řídí.
Object.assign(window, { vysledkyMereni: (): VysledekMereni[] => vysledky });
