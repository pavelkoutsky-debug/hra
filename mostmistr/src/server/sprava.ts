// Správa pro zadavatele: jedna adresa `/api/sprava`, všechno za heslem správce. Deník a zpětnou
// vazbu obsluhuje `obsluha.ts`, denní rozbor `rozbor.ts` a žebříčky tenhle soubor:
//
//   GET  /api/sprava?co=zebricky                     žebříčky nynější verze fyziky (řádky každého měřítka)
//   GET  /api/sprava?co=zebricek-most&klic=…&most=…  kód mostu ze zápisu (k otevření ve hře)
//   POST /api/sprava?co=zebricek-smazat              { znacka, uroven } smaže zápisy hráče v úrovni
//   GET  /api/sprava?co=zebricek-pocty&den=…         počty dne (ověření, zápisy, odmítnutí)
//   POST /api/sprava?co=smazat-hrace                 { hrac, od } smaže deník, zprávy a řádky žebříčků
//                                                    hráče, po částech → { smazano, dalsi } (`uklid.ts`)
//
// Výpis dnů deníku (`co=dny`) a podklady rozboru (`co=podklady`) při tom pustí úklid starých dat.
//
// Vedle hesla správce (`MM_SPRAVCE_HESLO`) existuje heslo jen pro denní rozbor
// (`MM_ROZBOR_HESLO`): otevírá podklady a rozbory a nic dalšího.

import { VERZE_FYZIKY } from "../jadro/verze";
import { chyba, DEN, denZ, ID_HRACE, odpoved, overSpravce, spravuj, stejne, teloJson, type ProstrediServeru } from "./obsluha";
import { spravujRozbor } from "./rozbor";
import { SoubehZapisu } from "./sklad";
import { smazHrace, uklid } from "./uklid";
import { mostZeZebricku, poctyZebricku, smazZeZebricku, zebrickyProSpravu } from "./zebricek";

const ZNACKA = /^[0-9a-f]{16}$/;
const ID_UROVNE = /^[1-8]-\d{2}$/;

async function spravujZebricky(zadost: Request, p: ProstrediServeru): Promise<Response | null> {
  const dotaz = new URL(zadost.url).searchParams;
  const co = dotaz.get("co") ?? "";
  if (co === "zebricky" && zadost.method === "GET") {
    return odpoved(200, { verze: VERZE_FYZIKY, zebricky: await zebrickyProSpravu(p.sklad, VERZE_FYZIKY) });
  }
  if (co === "zebricek-most" && zadost.method === "GET") {
    const kod = await mostZeZebricku(p.sklad, dotaz.get("klic") ?? "", dotaz.get("most") ?? "");
    return kod === null ? chyba(404, "takový most v žebříčku není") : odpoved(200, { kod });
  }
  if (co === "zebricek-pocty" && zadost.method === "GET") {
    const den = dotaz.get("den") ?? denZ(p.ted());
    if (!DEN.test(den)) return chyba(400, "chybí den ve tvaru RRRR-MM-DD");
    return odpoved(200, { den, pocty: await poctyZebricku(p.sklad, den) });
  }
  if (co === "zebricek-smazat" && zadost.method === "POST") {
    const telo = await teloJson(zadost, 4 * 1024);
    if (telo instanceof Response) return telo;
    const co2 = telo.data as { znacka?: unknown; uroven?: unknown } | null;
    if (typeof co2 !== "object" || co2 === null || typeof co2.znacka !== "string" || !ZNACKA.test(co2.znacka)) return chyba(400, "chybí značka hráče");
    // Značka hráče platí jen pro svou úroveň, takže bez úrovně by nebylo co mazat.
    if (typeof co2.uroven !== "string" || !ID_UROVNE.test(co2.uroven)) return chyba(400, "chybí úroveň");
    try {
      return odpoved(200, { smazano: await smazZeZebricku(p.sklad, VERZE_FYZIKY, co2.znacka, co2.uroven) });
    } catch {
      // Žebříček se při mazání pořád měnil (zápis s podmínkou se nepovedl): nic se nepřepsalo.
      return chyba(503, "žebříček se zrovna měnil a smazání se nepovedlo; zkus to znovu");
    }
  }
  return null;
}

/** Kurzor smazání hráče: klíč v úložišti, kde předchozí žádost skončila. */
const KURZOR = /^(denik|vazba|zebricek)\/[0-9A-Za-z._/-]{0,300}$/;

/** Smazání všeho od jednoho hráče (žádost o smazání údajů); jen s heslem správce. */
async function spravujMazaniHrace(zadost: Request, p: ProstrediServeru): Promise<Response | null> {
  const co = new URL(zadost.url).searchParams.get("co") ?? "";
  if (co !== "smazat-hrace" || zadost.method !== "POST") return null;
  const telo = await teloJson(zadost, 4 * 1024);
  if (telo instanceof Response) return telo;
  const data = telo.data as { hrac?: unknown; od?: unknown } | null;
  if (typeof data !== "object" || data === null || typeof data.hrac !== "string" || !ID_HRACE.test(data.hrac)) return chyba(400, "chybí platné číslo hráče");
  const od = data.od ?? null;
  if (od !== null && (typeof od !== "string" || !KURZOR.test(od))) return chyba(400, "neplatný kurzor (od)");
  try {
    return odpoved(200, await smazHrace(p.sklad, data.hrac, od));
  } catch (e) {
    if (e instanceof SoubehZapisu) return chyba(503, "žebříček se zrovna měnil a smazání se nepovedlo; zkus to znovu");
    throw e;
  }
}

/** Pustí úklid starých dat; jeho chyba žádost neshodí (úklid se dodělá příště). */
async function uklidPotichu(p: ProstrediServeru): Promise<void> {
  try {
    await uklid(p.sklad, p.ted());
  } catch {
    // Úklid je vnitřní věc serveru: kvůli němu žádost správce selhat nesmí.
  }
}

/** Nejkratší heslo pro denní rozbor: má to být dlouhý náhodný řetězec, ne slovo. */
export const NEJKRATSI_HESLO_ROZBORU = 16;

/**
 * Přišla žádost s heslem pro denní rozbor? Úloha, která rozbor píše, čte texty od hráčů (cizí
 * vstup, který se ji může pokusit navést k něčemu jinému), a proto nedostává heslo správce:
 * její heslo otevírá jen podklady a rozbory. Zprávy s kontakty, deník ani mazání ne.
 */
async function jeAnalytik(zadost: Request, p: ProstrediServeru): Promise<boolean> {
  const heslo = p.hesloRozboru ?? null;
  if (heslo === null || heslo.length < NEJKRATSI_HESLO_ROZBORU || heslo === p.hesloSpravce) return false;
  const hlavicka = zadost.headers.get("authorization") ?? "";
  return hlavicka.startsWith("Bearer ") && (await stejne(hlavicka.slice(7), heslo));
}

/** Celá správa: ověří heslo a žádost předá tomu, komu patří. */
export async function spravujVse(zadost: Request, p: ProstrediServeru): Promise<Response> {
  if (await jeAnalytik(zadost, p)) {
    return (await spravujRozbor(zadost, p, true)) ?? chyba(403, "tohle heslo smí jen číst podklady a ukládat denní rozbor");
  }
  const odmitnuti = await overSpravce(zadost, p);
  if (odmitnuti) return odmitnuti;
  const co = new URL(zadost.url).searchParams.get("co");
  if (co === "dny" && zadost.method === "GET") await uklidPotichu(p);
  return (await spravujRozbor(zadost, p, false)) ?? (await spravujZebricky(zadost, p)) ?? (await spravujMazaniHrace(zadost, p)) ?? spravuj(zadost, p);
}
