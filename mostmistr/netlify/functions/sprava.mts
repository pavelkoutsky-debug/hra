// Správa zpětné vazby, deníku hraní, žebříčků a denních rozborů pro zadavatele; chráněná heslem
// z proměnné prostředí MM_SPRAVCE_HESLO. Logika je v `src/server/sprava.ts`.
import { prostrediNetlify, type KontextNetlify } from "../../src/server/netlify";
import { spravujVse } from "../../src/server/sprava";

export default (zadost: Request, kontext: KontextNetlify): Promise<Response> => spravujVse(zadost, prostrediNetlify(kontext));

// Omezení počtu žádostí brání i hádání hesla hrubou silou.
export const config = {
  path: "/api/sprava",
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
