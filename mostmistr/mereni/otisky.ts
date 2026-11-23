// Stránka „shoda výpočtu“: spočítá regresní sadu v tomto prohlížeči a porovná otisky
// s těmi, které vyšly při vývoji. Je to nástroj pro ověřování, ne součást hry; proto má
// texty přímo u sebe.
import { VERZE_FYZIKY } from "../src/jadro/verze";
import { POCET_SCENARU, type VysledekScenare } from "../src/zkouska/regrese";
import ulozene from "../src/zkouska/regrese-otisky.json";
import { cislo } from "../src/ui/formaty";
import type { ZpravaOtisku } from "./otisky-pracovnik";

const ocekavane: Record<string, string> = ulozene.otisky;

const tlacitko = document.querySelector<HTMLButtonElement>("#spustit")!;
const kopirovat = document.querySelector<HTMLButtonElement>("#kopirovat")!;
const telo = document.querySelector<HTMLTableSectionElement>("#vysledky tbody")!;
const stav = document.querySelector<HTMLElement>("#stav")!;
const souhrn = document.querySelector<HTMLElement>("#souhrn")!;
const prostredi = document.querySelector<HTMLElement>("#prostredi")!;

prostredi.textContent = `${navigator.userAgent} · fyzika v${VERZE_FYZIKY} · sestavení ${__VERZE_HRY__} ${__OTISK_SESTAVENI__}`;

let vysledky: (VysledekScenare & { ms: number; shoda: boolean })[] = [];

function radek(bunky: string[], shoda: boolean): HTMLTableRowElement {
  const tr = document.createElement("tr");
  bunky.forEach((text, i) => {
    const td = document.createElement("td");
    td.textContent = text;
    if (i === bunky.length - 1) td.dataset.shoda = shoda ? "ano" : "ne";
    tr.append(td);
  });
  return tr;
}

function spust(): void {
  tlacitko.disabled = true;
  kopirovat.disabled = true;
  vysledky = [];
  telo.replaceChildren();
  souhrn.textContent = "";
  delete souhrn.dataset.shoda;
  stav.textContent = `Počítám… 0 / ${POCET_SCENARU}`;
  document.body.dataset.stav = "pocita";

  const pracovnik = new Worker(new URL("./otisky-pracovnik.ts", import.meta.url), { type: "module" });
  const dokonci = (): void => {
    pracovnik.terminate();
    tlacitko.disabled = false;
    kopirovat.disabled = false;
    stav.textContent = "";
    const nesouhlasi = vysledky.filter((v) => !v.shoda).length + (POCET_SCENARU - vysledky.length);
    souhrn.dataset.shoda = nesouhlasi === 0 ? "ano" : "ne";
    souhrn.textContent =
      nesouhlasi === 0
        ? `Všech ${POCET_SCENARU} otisků souhlasí: tento prohlížeč počítá fyziku bitově stejně jako při vývoji.`
        : `Nesouhlasí ${nesouhlasi} z ${POCET_SCENARU} otisků. Zkopíruj prosím výsledky tlačítkem nahoře a pošli mi je.`;
    document.body.dataset.stav = "hotovo";
  };
  pracovnik.onerror = (udalost) => {
    telo.append(radek(["výpočet selhal", "", "", "", "", "", udalost.message], false));
    dokonci();
  };
  pracovnik.onmessage = (udalost: MessageEvent<ZpravaOtisku>) => {
    const zprava = udalost.data;
    if (zprava.typ === "hotovo") {
      dokonci();
      return;
    }
    if (zprava.typ === "chyba") {
      telo.append(radek([zprava.id, "", "", "", "", ocekavane[zprava.id] ?? "", `✗ ${zprava.zprava}`], false));
      return;
    }
    const v = zprava.vysledek;
    const shoda = !v.rozpadla && v.otisk === ocekavane[v.id];
    vysledky.push({ ...v, ms: zprava.ms, shoda });
    telo.append(
      radek(
        [v.id, cislo(v.kroku, 0), String(v.poruseni), cislo(zprava.ms, 0), v.otisk, ocekavane[v.id] ?? "—", shoda ? "✓ souhlasí" : "✗ nesouhlasí"],
        shoda,
      ),
    );
    stav.textContent = `Počítám… ${vysledky.length} / ${POCET_SCENARU}`;
  };
  pracovnik.postMessage({});
}

tlacitko.addEventListener("click", spust);
kopirovat.addEventListener("click", () => {
  const zapis = JSON.stringify(
    {
      prostredi: navigator.userAgent,
      verzeFyziky: VERZE_FYZIKY,
      sestaveni: `${__VERZE_HRY__} ${__OTISK_SESTAVENI__}`,
      vysledky: vysledky.map((v) => ({ id: v.id, otisk: v.otisk, shoda: v.shoda, kroku: v.kroku, poruseni: v.poruseni, ms: Math.round(v.ms) })),
    },
    null,
    2,
  );
  void navigator.clipboard.writeText(zapis).then(
    () => (stav.textContent = "Zkopírováno do schránky."),
    () => (stav.textContent = "Kopírování se nepovedlo; označ tabulku a zkopíruj ji ručně."),
  );
});

spust();
