// Stránka „zvuky“: každý zvuk hry jde pustit zvlášť a všechny se tu změří. Je to nástroj
// pro ladění, ne součást hry; proto má texty přímo u sebe.
import type { Zvuk } from "../src/zvuk/deje";
import { zmerDej, zmerZvuk, type MereniZvuku } from "../src/zvuk/mereni";
import { Syntezator, vytvorVystup } from "../src/zvuk/syntezator";
import { cislo } from "../src/ui/formaty";

interface Ukazka {
  id: string;
  nazev: string;
  zvuk: Zvuk;
}

function zvuk(druh: Zvuk["druh"], material: Zvuk["material"], sila: number, velikost: number, puvod = -1): Zvuk {
  return { druh, cas: 0, x: 0, y: 0, sila, velikost, material, odstin: 0.31, puvod };
}

export const UKAZKY: readonly Ukazka[] = [
  { id: "vrzani-drevo", nazev: "Vrzání dřeva", zvuk: zvuk("vrzani", "drevo", 0.8, 0.4) },
  { id: "vrzani-ocel", nazev: "Sténání oceli", zvuk: zvuk("vrzani", "ocel", 0.8, 0.5) },
  { id: "lupnuti-drevo", nazev: "Lupnutí dřeva", zvuk: zvuk("lupnuti", "drevo", 0.8, 0.4) },
  { id: "lupnuti-ocel", nazev: "Cinknutí oceli", zvuk: zvuk("lupnuti", "ocel", 0.8, 0.5) },
  { id: "zlom-drevo", nazev: "Zlom dřeva", zvuk: zvuk("zlom", "drevo", 1, 0.4) },
  { id: "zlom-ocel", nazev: "Zlom oceli", zvuk: zvuk("zlom", "ocel", 1, 0.5) },
  { id: "zlom-lano", nazev: "Prasknutí lana", zvuk: zvuk("zlom", "lano", 1, 0.5) },
  { id: "zlom-beton", nazev: "Zlom betonu", zvuk: zvuk("zlom", "beton", 1, 0.7) },
  { id: "sjeti", nazev: "Sjetí z ložiska", zvuk: zvuk("sjeti", "drevo", 0.9, 0.6) },
  { id: "splouchnuti-clovek", nazev: "Šplouchnutí: člověk", zvuk: zvuk("splouchnuti", "ocel", 0.8, 0.16, 0) },
  { id: "splouchnuti-auto", nazev: "Šplouchnutí: auto", zvuk: zvuk("splouchnuti", "ocel", 1, 0.7, 0) },
  { id: "dopad-trosky", nazev: "Dopad trosek", zvuk: zvuk("dopad", "drevo", 0.8, 0.4) },
  { id: "dopad-auto", nazev: "Dopad auta", zvuk: zvuk("dopad", "ocel", 1, 0.7, 0) },
  { id: "krok-chodec", nazev: "Krok chodce", zvuk: zvuk("krok", "drevo", 0.4, 1 / 12, 0) },
  { id: "krok-bezec", nazev: "Doskok běžce", zvuk: zvuk("krok", "drevo", 0.6, 1 / 12, 0) },
  { id: "krok-utvar", nazev: "Krok útvaru", zvuk: zvuk("krok", "drevo", 0.9, 1, 0) },
  { id: "spara-kolo", nazev: "Spára: jízdní kolo", zvuk: zvuk("spara", "drevo", 0.36, 0.18, 0) },
  { id: "spara-auto", nazev: "Spára: auto", zvuk: zvuk("spara", "drevo", 0.68, 0.71, 0) },
  { id: "drnceni", nazev: "Drnčení mostovky", zvuk: zvuk("drnceni", "drevo", 0.6, 0.3) },
  { id: "brnk", nazev: "Brnknutí", zvuk: zvuk("brnk", "drevo", 0.7, 0.5) },
];

const poleSily = document.querySelector<HTMLInputElement>("#sila")!;
const poleTempa = document.querySelector<HTMLSelectElement>("#tempo")!;
const poleValeni = document.querySelector<HTMLInputElement>("#valeni")!;
const stav = document.querySelector<HTMLElement>("#stav")!;
const telo = document.querySelector<HTMLTableSectionElement>("#mereni tbody")!;

let ctx: AudioContext | null = null;
let synt: Syntezator | null = null;
let poradi = 0;

/** Zvukový kontext vzniká až na první kliknutí. */
function syntezator(): { ctx: AudioContext; synt: Syntezator } {
  if (!ctx || !synt) {
    ctx = new AudioContext();
    synt = new Syntezator(ctx, vytvorVystup(ctx, 0.9).vstup);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return { ctx, synt };
}

function tempo(): number {
  return Math.max(0.5, Math.min(1.5, Math.pow(Number(poleTempa.value), 0.3)));
}

/** Zahraje zvuk za `za` sekund; každé puštění má jiný odstín, jako ve hře. */
function pust(vzor: Zvuk, za = 0.02, sila = 1, panorama = 0): void {
  const { ctx, synt } = syntezator();
  poradi++;
  const odstin = (poradi * 0.6180339887) % 1;
  synt.zahraj({ ...vzor, sila: Math.min(1, vzor.sila * sila * Number(poleSily.value)), odstin }, ctx.currentTime + za, panorama, tempo());
  document.body.dataset.pusteno = String(poradi);
}

const seznam = document.querySelector<HTMLElement>("#zvuky")!;
for (const ukazka of UKAZKY) {
  const tlacitko = document.createElement("button");
  tlacitko.type = "button";
  tlacitko.textContent = ukazka.nazev;
  tlacitko.dataset.zvuk = ukazka.id;
  tlacitko.addEventListener("click", () => pust(ukazka.zvuk));
  seznam.append(tlacitko);
}

poleValeni.addEventListener("input", () => syntezator().synt.nastavValeni(Number(poleValeni.value), 0));

function najdi(id: string): Zvuk {
  return UKAZKY.find((u) => u.id === id)!.zvuk;
}

/** Krátké děje složené z jednotlivých zvuků, aby bylo slyšet, jak znějí dohromady. */
const DEJE: Readonly<Record<string, () => void>> = {
  // Vrzání houstne a sílí, pak začne lupat a nakonec trám praskne.
  zatizeni: () => {
    let cas = 0.05;
    for (let i = 0; i < 26; i++) {
      const mira = i / 25;
      pust(najdi("vrzani-drevo"), cas, 0.3 + 0.9 * mira, -0.4 + 0.8 * ((i * 0.37) % 1));
      if (mira > 0.7 && i % 2 === 0) pust(najdi("lupnuti-drevo"), cas + 0.11, mira);
      cas += 0.5 - 0.36 * mira;
    }
    pust(najdi("zlom-drevo"), cas + 0.1);
  },
  zriceni: () => {
    pust(najdi("lupnuti-drevo"), 0.05);
    pust(najdi("lupnuti-drevo"), 0.22);
    pust(najdi("zlom-drevo"), 0.4, 1, -0.2);
    pust(najdi("zlom-drevo"), 0.62, 1, 0.3);
    pust(najdi("sjeti"), 0.75, 1, 0.7);
    pust(najdi("splouchnuti-auto"), 1.5, 1, 0.1);
    pust(najdi("splouchnuti-clovek"), 1.75, 1, -0.3);
    pust(najdi("dopad-trosky"), 1.3, 1, -0.6);
    pust(najdi("splouchnuti-clovek"), 2.1, 0.8, 0.4);
  },
  pochod: () => {
    for (let i = 0; i < 12; i++) {
      pust(najdi("krok-utvar"), 0.05 + i / 2.3, 1, -0.6 + 0.1 * i);
      if (i > 5) pust(najdi("drnceni"), 0.05 + i / 2.3 + 0.2, 0.4 + 0.08 * i);
    }
  },
};
for (const tlacitko of document.querySelectorAll<HTMLButtonElement>("[data-dej]")) {
  tlacitko.addEventListener("click", () => DEJE[tlacitko.dataset.dej ?? ""]?.());
}

function decibely(hodnota: number): string {
  return hodnota > 0 ? cislo(20 * Math.log10(hodnota), 1) : "−∞";
}

/** Změří všechny zvuky; k tomu není potřeba reproduktor ani gesto. */
async function zmer(): Promise<void> {
  stav.textContent = "Měří se…";
  const vysledky: (MereniZvuku & { id: string })[] = [];
  for (const ukazka of UKAZKY) {
    const m = await zmerZvuk(ukazka.zvuk);
    vysledky.push({ id: ukazka.id, ...m });
    const tr = document.createElement("tr");
    tr.dataset.zvuk = ukazka.id;
    tr.dataset.spicka = m.spicka.toFixed(4);
    tr.dataset.rms = m.rms.toFixed(4);
    tr.dataset.delka = m.delka.toFixed(3);
    tr.dataset.jas = m.jas.toFixed(0);
    tr.dataset.platne = String(m.platne);
    for (const text of [ukazka.nazev, cislo(m.spicka, 2), decibely(m.rms), cislo(m.delka, 2), cislo(m.jas, 0)]) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.append(td);
    }
    const vPoradku = m.platne && m.spicka > 0.02 && m.spicka < 1;
    tr.firstElementChild!.setAttribute("data-v-poradku", vPoradku ? "ano" : "ne");
    telo.append(tr);
  }
  stav.textContent = `Změřeno ${vysledky.length} zvuků.`;
  document.body.dataset.stav = "hotovo";
}

// Testy sem posílají zvuky celé zkoušky a nechávají si změřit, jak zní dohromady.
(window as unknown as { mostmistrZvuky: { zmerDej: typeof zmerDej } }).mostmistrZvuky = { zmerDej };

zmer().catch((chyba: unknown) => {
  stav.textContent = `Měření selhalo: ${chyba instanceof Error ? chyba.message : String(chyba)}`;
  document.body.dataset.stav = "chyba";
});
