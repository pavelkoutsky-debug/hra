// Příjem deníku hraní: hra sem posílá dávky událostí. Logika je v `src/server/obsluha.ts`.
import { prostrediNetlify, type KontextNetlify } from "../../src/server/netlify";
import { prijmiDenik } from "../../src/server/obsluha";

export default (zadost: Request, kontext: KontextNetlify): Promise<Response> => prijmiDenik(zadost, prostrediNetlify(kontext));

// Hra posílá dávku nejvýš jednou za dvacet sekund a po každé zkoušce; víc než dvě za sekundu
// z jedné adresy není hráč.
export const config = {
  path: "/api/denik",
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
