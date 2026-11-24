// Slovníček pojmů: odborná slova, která hra používá, s jednou až dvěma větami vysvětlení.
// Slovo v textu (zadání, výsledek zkoušky, nápověda) je podtržené a po kliknutí ukáže
// vysvětlení v bublině; celý slovníček je v okně z odkazu pod zadáním v paletě.

import { prvek, udaj } from "./dom";
import { aktualniJazyk, t, type Jazyk } from "./slovnik";

export const POJMY = [
  "mostovka",
  "prut",
  "stycnik",
  "podpora",
  "kotva",
  "rozpeti",
  "kloub",
  "prihrada",
  "pas",
  "tah-tlak",
  "vzper",
  "vyuziti",
  "svar",
  "plasticky-kloub",
  "kmitani",
  "vlastni-frekvence",
  "rezonance",
  "tlumic",
  "ladeny-tlumic",
  "dopnuti",
  "plavebni-profil",
  "inzenyrsky-rozpocet",
] as const;
export type Pojem = (typeof POJMY)[number];

/**
 * Tvary slova, podle kterých se pojem v textu pozná. Jen tvary, které nejde splést s jiným
 * slovem: „vzpěru“ je i čtvrtý pád vzpěry, a tak se pozná jen „vzpěr“, „vzpěrem“ a „ve vzpěru“,
 * a „vzpěr“ ne po slovech, po kterých jde o druhý pád vzpěr („bez vzpěr“, „rozpěry vzpěr“).
 * Delší vzor má přednost (plastický kloub před kloubem, laděný tlumič před tlumičem). Každý
 * vzor dostane při hledání hranici slova vlevo (`sHranici`): „turnbuckle“ není „buckle“.
 */
const TVARY: Record<Jazyk, Record<Pojem, RegExp>> = {
  cs: {
    mostovka: /mostovk(?:a|y|u|ou|ami)(?![\p{L}])/iu,
    prut: /prut(?:u|em|y|ů|ech)?(?![\p{L}])/iu,
    stycnik: /styčník(?:u|em|y|ů|ech)?(?![\p{L}])/iu,
    kmitani: /kmitání(?:m)?(?![\p{L}])/iu,
    podpora: /(?:pevn|posuvn)(?:á|é|ou|ých|ými) podpor(?:a|y|u|ou|ami)?(?![\p{L}])|podpor(?:a|y|u|ou|ami)(?![\p{L}])/iu,
    kotva: /kotv(?:a|y|u|ou|ami|ách)(?![\p{L}])/iu,
    "tah-tlak": /(?:tažen|tlačen)(?:ý|ého|ém|é|ých|ými) prut(?:u|em|y|ů|ech)?(?![\p{L}])|tah(?:u|em)? (?:a|i|nebo) tlak(?:u|em)?(?![\p{L}])/iu,
    tlumic: /tlumič(?:e|i|em|ů|ích)?(?![\p{L}])/iu,
    "plasticky-kloub": /plastick(?:ý|ého|ém|é|ých|ými) kloub(?:u|em|y|ů|ech)?/iu,
    "ladeny-tlumic": /laděn(?:ý|ého|ému|ém|ým|é|ých) tlumič(?:e|i|em|ů|ích)?/iu,
    "vlastni-frekvence": /vlastní(?:ch)? frekvenc(?:e|i|í|ím)/iu,
    "plavebni-profil": /plavební(?:ho|m)? profil(?:u|em)?/iu,
    "inzenyrsky-rozpocet": /inženýrsk(?:ý|ého|ém|ým) rozpoč(?:et|tu|tem)/iu,
    vzper: /(?:ve vzpěru|vzpěrem|(?<!(?:bez|ze|u|od|do|pár|dvojic[ei]|rozpěr[ya]?|několik|kolik|tolik|\d+|pět|šest|osm|deset)\s)vzpěr(?![\p{L}]))/iu,
    vyuziti: /využit(?:í|ím|ý|ého|ému)(?![\p{L}])/iu,
    rezonance: /rezonanc(?:e|i|í)(?![\p{L}])/iu,
    kloub: /kloub(?:u|em|y|ů)?(?![\p{L}])/iu,
    svar: /svar(?:u|em|y|ů)?(?![\p{L}])/iu,
    pas: /(?:horní|dolní|tlačený|tažený) pás(?:u|em|y)?(?![\p{L}])|pás(?:y|ech) příhrady|v pásech/iu,
    prihrada: /příhrad(?:a|y|u|ě|ou)(?![\p{L}])/iu,
    rozpeti: /rozpětí(?![\p{L}])/iu,
    dopnuti: /dopnutí(?![\p{L}])/iu,
  },
  en: {
    mostovka: /decks?(?![\p{L}])/iu,
    prut: /members?(?![\p{L}])/iu,
    stycnik: /joints?(?![\p{L}])/iu,
    kmitani: /vibrations?(?![\p{L}])/iu,
    podpora: /(?:fixed|sliding|roller) (?:support|bearing)s?(?![\p{L}])|supports?(?![\p{L}])/iu,
    kotva: /anchor(?:s|age|ages)?(?![\p{L}])/iu,
    "tah-tlak": /tension (?:and|or) compression|(?:member|bar)s? in (?:tension|compression)/iu,
    tlumic: /dampers?(?![\p{L}])/iu,
    "plasticky-kloub": /plastic hinges?/iu,
    "ladeny-tlumic": /tuned mass dampers?/iu,
    "vlastni-frekvence": /natural frequenc(?:y|ies)/iu,
    "plavebni-profil": /navigation (?:clearance|channel)/iu,
    "inzenyrsky-rozpocet": /engineer(?:’s|'s|ing) budget/iu,
    vzper: /buckl(?:ing|es?|ed)(?![\p{L}])/iu,
    vyuziti: /utilis(?:ation|ed)(?![\p{L}])/iu,
    rezonance: /resonan(?:ce|t)(?![\p{L}])/iu,
    kloub: /hinges?(?![\p{L}])/iu,
    svar: /weld(?:s|ed)?(?![\p{L}])/iu,
    pas: /(?:top|bottom) chords?|chords?(?![\p{L}])/iu,
    prihrada: /truss(?:es)?(?![\p{L}])/iu,
    rozpeti: /(?<![\p{L}])span(?![\p{L}])/iu,
    dopnuti: /tensioning(?![\p{L}])/iu,
  },
};

/** Vzor, který nezačne uprostřed slova. */
const sHranici = (vzor: RegExp): RegExp => new RegExp(`(?<![\\p{L}])(?:${vzor.source})`, vzor.flags);
const VZORY: Record<Jazyk, Record<Pojem, RegExp>> = {
  cs: Object.fromEntries(POJMY.map((pojem) => [pojem, sHranici(TVARY.cs[pojem])])) as Record<Pojem, RegExp>,
  en: Object.fromEntries(POJMY.map((pojem) => [pojem, sHranici(TVARY.en[pojem])])) as Record<Pojem, RegExp>,
};

/** Událost na `document`, kterou slovníček hlásí rozkliknutý pojem (`detail.co`, `detail.pojem`). */
export const UDALOST_SLOVNICKU = "mostmistr:slovnicek";

/** První výskyt některého pojmu v textu: kde začíná, jak je dlouhý a který pojem to je. */
export function najdiPojem(text: string, jazyk: Jazyk, bez: ReadonlySet<Pojem> = new Set()): { od: number; delka: number; pojem: Pojem } | null {
  let nejlepsi: { od: number; delka: number; pojem: Pojem } | null = null;
  for (const pojem of POJMY) {
    const vzor = VZORY[jazyk][pojem];
    if (bez.has(pojem)) continue;
    const nalez = vzor.exec(text);
    if (!nalez) continue;
    // Dřívější výskyt vyhrává; při stejném začátku delší (plastický kloub, ne kloub).
    if (!nejlepsi || nalez.index < nejlepsi.od || (nalez.index === nejlepsi.od && nalez[0].length > nejlepsi.delka)) {
      nejlepsi = { od: nalez.index, delka: nalez[0].length, pojem };
    }
  }
  return nejlepsi;
}

const BEZ_POJMU = "button, a, summary, h1, h2, h3, textarea, input, select, [data-bez-pojmu]";

/**
 * Označí v textech pod `koren` první výskyt každého pojmu jako tlačítko `.pojem`. Text uvnitř
 * tlačítek, odkazů a nadpisů nechává být. Volá se po každém zapsání textu: dřívější značky
 * zápis textu smazal a prvek, který je ještě má, se přeskočí.
 */
export function oznacPojmy(koren: HTMLElement): void {
  if (koren.querySelector(".pojem")) return;
  const jazyk = aktualniJazyk();
  const pouzite = new Set<Pojem>();
  const pruchod = document.createTreeWalker(koren, NodeFilter.SHOW_TEXT);
  const uzly: Text[] = [];
  for (let uzel = pruchod.nextNode(); uzel; uzel = pruchod.nextNode()) {
    if (uzel instanceof Text && !uzel.parentElement?.closest(BEZ_POJMU)) uzly.push(uzel);
  }
  for (let uzel of uzly) {
    for (;;) {
      const nalez = najdiPojem(uzel.data, jazyk, pouzite);
      if (!nalez) break;
      pouzite.add(nalez.pojem);
      const zbytek = uzel.splitText(nalez.od);
      const dalsi = zbytek.splitText(nalez.delka);
      const tlacitko = document.createElement("button");
      tlacitko.type = "button";
      tlacitko.className = "pojem";
      tlacitko.dataset.pojem = nalez.pojem;
      tlacitko.textContent = zbytek.data;
      tlacitko.title = t(`pojem.${nalez.pojem}.text`);
      zbytek.replaceWith(tlacitko);
      // Čárka nebo tečka hned za pojmem se nesmí zalomit na další řádek sama (úzké okno).
      const interpunkce = /^[,.;:!?)\]“”…]+/u.exec(dalsi.data);
      if (interpunkce) {
        const zaNi = dalsi.splitText(interpunkce[0].length);
        const celek = document.createElement("span");
        celek.className = "pojem__celek";
        tlacitko.replaceWith(celek);
        celek.append(tlacitko, dalsi);
        uzel = zaNi;
      } else uzel = dalsi;
    }
  }
}

/** Zapíše do prvku text a označí v něm pojmy. */
export function textSPojmy(uzel: HTMLElement, text: string): void {
  uzel.textContent = text;
  oznacPojmy(uzel);
}

/**
 * Ukáže bublinu s nadpisem a textem u prvku `kotva` (pod ním; když se tam nevejde, nad ním).
 * Řádky textu oddělené znakem nového řádku se píšou pod sebe. Vrací false, když prohlížeč
 * popover neumí a bublina se neukázala.
 */
export function ukazBublinu(kotva: HTMLElement, nazev: string, text: string, klic = ""): boolean {
  const bublina = prvek("#pojem-bublina", HTMLElement);
  if (typeof bublina.showPopover !== "function") return false;
  udaj("pojem-nazev").textContent = nazev;
  udaj("pojem-text").textContent = text;
  bublina.dataset.pojem = klic;
  if (bublina.matches(":popover-open")) bublina.hidePopover();
  bublina.showPopover();
  // Čtečka obrazovky: tlačítko říká, že bublinu otevřelo a co ji popisuje; po zavření zase ne.
  kotva.setAttribute("aria-expanded", "true");
  kotva.setAttribute("aria-describedby", bublina.id);
  bublina.addEventListener(
    "toggle",
    () => {
      if (bublina.matches(":popover-open")) return;
      kotva.setAttribute("aria-expanded", "false");
      kotva.removeAttribute("aria-describedby");
    },
    { once: true },
  );
  const o = kotva.getBoundingClientRect();
  const sirka = bublina.offsetWidth;
  const vyska = bublina.offsetHeight;
  const vlevo = Math.max(8, Math.min(window.innerWidth - sirka - 8, o.left));
  const dole = o.bottom + 6 + vyska <= window.innerHeight - 8;
  bublina.style.left = `${vlevo}px`;
  bublina.style.top = `${dole ? o.bottom + 6 : Math.max(8, o.top - 6 - vyska)}px`;
  return true;
}

/**
 * Připojí slovníček ke stránce: kliknutí na pojem v textu ukáže bublinu s vysvětlením
 * (`#pojem-bublina`, popover), tlačítko `[data-akce="pojmy"]` otevře okno se všemi pojmy.
 */
export function pripojPojmy(): void {
  const okno = prvek("#okno-pojmy", HTMLDialogElement);
  const seznam = udaj("pojmy-seznam");
  seznam.replaceChildren(
    ...POJMY.flatMap((pojem) => {
      const nazev = document.createElement("dt");
      nazev.textContent = t(`pojem.${pojem}`);
      nazev.dataset.pojem = pojem;
      const text = document.createElement("dd");
      text.textContent = t(`pojem.${pojem}.text`);
      return [nazev, text];
    }),
  );
  // Deník hraní vede obrazovka úrovně; slovníček jí jen řekne, co hráč rozklikl.
  const ohlas = (co: "pojem" | "slovnicek", pojem?: string): void => {
    document.dispatchEvent(new CustomEvent(UDALOST_SLOVNICKU, { detail: { co, ...(pojem === undefined ? {} : { pojem }) } }));
  };
  const ukazOkno = (pojem?: string): void => {
    if (!okno.open) okno.showModal();
    for (const uzel of seznam.querySelectorAll<HTMLElement>("dt")) uzel.classList.toggle("pojmy__vybrany", uzel.dataset.pojem === pojem);
    if (pojem) seznam.querySelector<HTMLElement>(`dt[data-pojem="${pojem}"]`)?.scrollIntoView({ block: "center" });
    else okno.scrollTop = 0;
  };
  // Ťuknutí vedle okna (na ztmavené pozadí) ho zavře: cílem je pak okno samo a místo leží
  // mimo jeho obdélník. Na telefonu je slovníček delší než obrazovka.
  okno.addEventListener("click", (udalost) => {
    if (udalost.target !== okno) return;
    const r = okno.getBoundingClientRect();
    if (udalost.clientX < r.left || udalost.clientX > r.right || udalost.clientY < r.top || udalost.clientY > r.bottom) okno.close();
  });
  document.addEventListener("click", (udalost) => {
    const cil = udalost.target instanceof Element ? udalost.target : null;
    if (cil?.closest('[data-akce="pojmy"]')) {
      ukazOkno();
      ohlas("slovnicek");
      return;
    }
    const tlacitko = cil?.closest<HTMLElement>(".pojem");
    const pojem = tlacitko?.dataset.pojem;
    if (!tlacitko || !pojem) return;
    udalost.preventDefault();
    // Bublina je popover: leží nad oknem zadání a zavře ji kliknutí vedle nebo Esc. Kde
    // prohlížeč popover neumí, otevře se celý slovníček (mimo otevřené okno) a zbývá title.
    const ukazano = ukazBublinu(tlacitko, t(`pojem.${pojem as Pojem}`), t(`pojem.${pojem as Pojem}.text`), pojem);
    if (!ukazano && !document.querySelector("dialog[open]")) ukazOkno(pojem);
    ohlas("pojem", pojem);
  });
}
