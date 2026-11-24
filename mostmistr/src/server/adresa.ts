// Adresa žádosti na jednom místě: odkud žádost přišla, skupina adres, otisk skupiny s tajnou
// solí dne a počítadla žádostí na skupinu adres a den (strop žebříčku, deníku a zpětné vazby).
//
// Adresa se bere jen z hlavičky `x-nf-client-connection-ip`, kterou přidává Netlify. Hlavičku
// `x-forwarded-for` si klient napíše sám, takže by si s ní každá žádost vymyslela čistý strop.
// Místní server a testy dodají adresu funkcí `ProstrediServeru.adresa`.
//
// Adresa se nikam neukládá. Počítadla leží pod otiskem skupiny: HMAC-SHA-256 s náhodnou solí dne,
// která je jen v úložišti (`sul/<den>.json`) a úklid ji po dvou dnech smaže (`uklid.ts`). Bez soli
// by šel otisk zvrátit hrubou silou (všech adres IPv4 je jen čtyři miliardy); po smazání soli
// už nejde přiřadit vůbec.
//
// Úložiště:
//   sul/<den>.json                        { sul } náhodná sůl dne (256 bitů, šestnáctkově)
//   adresa/<druh>/<den>/<otisk>.json      { pocet } kolik žádostí si skupina adres ten den vyžádala
//   adresa/<druh>/<den>/bez-adresy.json   totéž pro všechny žádosti, u kterých se adresa nepoznala

import type { ProstrediServeru } from "./obsluha";
import { SoubehZapisu, upravSPodminkou, type SkladZaznamu } from "./sklad";

/** Na co se počítají žádosti skupiny adres. */
export type DruhPocitadla = "zebricek" | "denik" | "vazba";

/** Sůl dne v paměti instance funkce: klíč HMAC podle dne. */
export type PametSoli = Map<string, Promise<CryptoKey>>;

/** Kolik dní si paměť instance soli drží (dnešek a pár dní zpátky, kvůli žádostem kolem půlnoci). */
const DNI_V_PAMETI = 3;

/** IPv4 v obvyklém zápisu (bez úvodních nul); null, když to IPv4 není. */
function ctyrka(text: string): number[] | null {
  const casti = text.split(".");
  if (casti.length !== 4) return null;
  const cisla = casti.map((c) => (/^\d{1,3}$/.test(c) ? Number(c) : Number.NaN));
  return cisla.every((n) => n <= 255) ? cisla : null;
}

/** Osm šestnáctibitových skupin IPv6 po rozvinutí `::`; null, když to IPv6 není. */
function sestka(text: string): number[] | null {
  const pulky = text.split("::");
  if (pulky.length > 2) return null;
  const rozeber = (cast: string, smiCtyrku: boolean): number[] | null => {
    if (cast === "") return [];
    const skupiny: number[] = [];
    const kusy = cast.split(":");
    for (const [i, kus] of kusy.entries()) {
      if (smiCtyrku && i === kusy.length - 1 && kus.includes(".")) {
        // IPv4 na konci zápisu (::ffff:192.0.2.1) jsou dvě poslední skupiny.
        const v4 = ctyrka(kus);
        if (!v4) return null;
        skupiny.push(v4[0]! * 256 + v4[1]!, v4[2]! * 256 + v4[3]!);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/.test(kus)) return null;
      skupiny.push(parseInt(kus, 16));
    }
    return skupiny;
  };
  if (pulky.length === 1) {
    const vse = rozeber(text, true);
    return vse && vse.length === 8 ? vse : null;
  }
  const leva = rozeber(pulky[0]!, false);
  const prava = rozeber(pulky[1]!, true);
  if (!leva || !prava || leva.length + prava.length > 7) return null;
  return [...leva, ...new Array<number>(8 - leva.length - prava.length).fill(0), ...prava];
}

/**
 * Skupina adres, na kterou se počítají stropy: adresa IPv4 celá, u IPv6 jen předpona /64
 * (první čtyři skupiny). Domácí přípojka s IPv6 dostává celou /64, takže strop na jednu adresu
 * IPv6 by šel obejít střídáním adres. IPv4 zabalená do IPv6 (`::ffff:192.0.2.1`) je IPv4.
 * Null, když text adresa není.
 */
export function skupinaAdresy(text: string | null | undefined): string | null {
  if (typeof text !== "string") return null;
  let adresa = text.trim().toLowerCase();
  if (adresa.startsWith("[")) {
    const konec = adresa.indexOf("]");
    if (konec < 0) return null;
    adresa = adresa.slice(1, konec);
  }
  const zona = adresa.indexOf("%");
  if (zona >= 0) adresa = adresa.slice(0, zona);
  if (adresa.length === 0 || adresa.length > 64) return null;
  const v4 = ctyrka(adresa);
  if (v4) return v4.join(".");
  if (!adresa.includes(":")) return null;
  const s = sestka(adresa);
  if (!s) return null;
  if (s.slice(0, 5).every((x) => x === 0) && s[5] === 0xffff) {
    return [s[6]! >> 8, s[6]! & 255, s[7]! >> 8, s[7]! & 255].join(".");
  }
  return `${s
    .slice(0, 4)
    .map((x) => x.toString(16))
    .join(":")}::/64`;
}

/**
 * Skupina adres, ze které žádost přišla (viz `skupinaAdresy`); null, když se adresa nepozná.
 * Na Netlify jen z hlavičky `x-nf-client-connection-ip`; prostředí s vlastní funkcí `adresa`
 * (místní server, testy) bere adresu jen z ní.
 */
export function adresaZadosti(zadost: Request, p: Pick<ProstrediServeru, "adresa">): string | null {
  return skupinaAdresy(p.adresa ? p.adresa(zadost) : zadost.headers.get("x-nf-client-connection-ip"));
}

const klicSoli = (den: string): string => `sul/${den}.json`;
const SUL = /^[0-9a-f]{32,128}$/;

function sulZeZaznamu(h: unknown): string | null {
  const sul = typeof h === "object" && h !== null ? (h as { sul?: unknown }).sul : undefined;
  return typeof sul === "string" && SUL.test(sul) ? sul : null;
}

const sestnactkove = (bajty: Uint8Array): string => Array.from(bajty, (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Sůl dne z úložiště. Když ještě není, založí se (jen když pod klíčem nic není); když ji ve
 * stejnou chvíli založila jiná instance, platí ta její.
 */
async function sulDne(sklad: SkladZaznamu, den: string): Promise<CryptoKey> {
  const klic = klicSoli(den);
  let sul = sulZeZaznamu(await sklad.cti(klic));
  if (sul === null) {
    const nova = sestnactkove(crypto.getRandomValues(new Uint8Array(32)));
    if (await sklad.zapisPokud(klic, { sul: nova }, null)) sul = nova;
    else sul = sulZeZaznamu(await sklad.cti(klic));
    if (sul === null) throw new Error("sůl dne se nepodařilo založit ani přečíst");
  }
  const bajty = new Uint8Array(sul.length / 2);
  for (let i = 0; i < bajty.length; i++) bajty[i] = parseInt(sul.slice(2 * i, 2 * i + 2), 16);
  return crypto.subtle.importKey("raw", bajty, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

/** Paměť soli pro úložiště, které prostředí paměť nedodá (testy): jedna na objekt úložiště. */
const pametiPodleSkladu = new WeakMap<SkladZaznamu, PametSoli>();

function pametSoli(p: Pick<ProstrediServeru, "sklad" | "pametSoli">): PametSoli {
  if (p.pametSoli) return p.pametSoli;
  let pamet = pametiPodleSkladu.get(p.sklad);
  if (!pamet) pametiPodleSkladu.set(p.sklad, (pamet = new Map()));
  return pamet;
}

/**
 * Otisk skupiny adres pro den `den`: HMAC-SHA-256 se solí dne, prvních 24 šestnáctkových znaků.
 * Sůl se čte z úložiště jednou za den a instanci funkce.
 */
export async function otiskAdresy(p: Pick<ProstrediServeru, "sklad" | "pametSoli">, skupina: string, den: string): Promise<string> {
  const pamet = pametSoli(p);
  let klic = pamet.get(den);
  if (!klic) {
    klic = sulDne(p.sklad, den);
    pamet.set(den, klic);
    // Neúspěch se nepamatuje: příští žádost to zkusí znovu.
    klic.catch(() => pamet.delete(den));
    for (const stary of [...pamet.keys()].sort().slice(0, Math.max(0, pamet.size - DNI_V_PAMETI))) pamet.delete(stary);
  }
  const podpis = await crypto.subtle.sign("HMAC", await klic, new TextEncoder().encode(skupina));
  return sestnactkove(new Uint8Array(podpis).slice(0, 12));
}

/** Klíč počítadla skupiny adres; žádosti bez adresy mají jedno společné. */
export async function klicPocitadla(p: Pick<ProstrediServeru, "sklad" | "pametSoli">, druh: DruhPocitadla, skupina: string | null, den: string): Promise<string> {
  return `adresa/${druh}/${den}/${skupina === null ? "bez-adresy" : await otiskAdresy(p, skupina, den)}.json`;
}

function pocetZeZaznamu(h: unknown): number {
  const n = typeof h === "object" && h !== null ? (h as { pocet?: unknown }).pocet : undefined;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

/**
 * Započítá jednu žádost skupiny adres (`null` = adresa se nepoznala) do počítadla dne `den`,
 * jen když ještě není na stropu. `plno`: skupina je na stropu a nic se nezapočítalo.
 * `soubeh`: počítadlo se pořád měnilo a zápis s podmínkou se nepovedl; co s tím, rozhodne
 * volající (deník i žebříček žádost pustí dál).
 */
export async function zapocitejAdresu(
  p: Pick<ProstrediServeru, "sklad" | "pametSoli">,
  druh: DruhPocitadla,
  skupina: string | null,
  den: string,
  strop: number,
): Promise<"ok" | "plno" | "soubeh"> {
  const klic = await klicPocitadla(p, druh, skupina, den);
  let plno = false;
  try {
    await upravSPodminkou(p.sklad, klic, (dnes) => {
      const pocet = pocetZeZaznamu(dnes);
      plno = pocet >= strop;
      return { zapsat: plno ? undefined : { pocet: pocet + 1 }, vysledek: null };
    });
  } catch (chyba) {
    if (chyba instanceof SoubehZapisu) return "soubeh";
    throw chyba;
  }
  return plno ? "plno" : "ok";
}
