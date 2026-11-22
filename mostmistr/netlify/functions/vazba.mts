// Příjem zpětné vazby hráčů. Logika je v `src/server/obsluha.ts`.
import { prostrediNetlify, type KontextNetlify } from "../../src/server/netlify";
import { prijmiVazbu } from "../../src/server/obsluha";

export default (zadost: Request, kontext: KontextNetlify): Promise<Response> => prijmiVazbu(zadost, prostrediNetlify(kontext));

// Zprávu píše člověk: deset za minutu z jedné adresy je víc než dost.
export const config = {
  path: "/api/vazba",
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
