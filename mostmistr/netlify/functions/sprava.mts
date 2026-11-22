// Správa zpětné vazby a deníku hraní pro zadavatele; chráněná heslem z proměnné prostředí
// MM_SPRAVCE_HESLO. Logika je v `src/server/obsluha.ts`.
import { prostrediNetlify, type KontextNetlify } from "../../src/server/netlify";
import { spravuj } from "../../src/server/obsluha";

export default (zadost: Request, kontext: KontextNetlify): Promise<Response> => spravuj(zadost, prostrediNetlify(kontext));

// Omezení počtu žádostí brání i hádání hesla hrubou silou.
export const config = {
  path: "/api/sprava",
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
