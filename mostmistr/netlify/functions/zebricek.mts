// Žebříčky: čtení žebříčku úrovně a zápis mostu, který si server sám přepočítá. Logika je
// v `src/server/zebricek.ts`, zkouška mostu v `src/server/overeni.ts`.
import { prostrediNetlify, type KontextNetlify } from "../../src/server/netlify";
import { overovacKampane } from "../../src/server/overeni";
import { obsluzZebricek } from "../../src/server/zebricek";

// Úrovně se čtou jednou na spuštěnou funkci, ne při každé žádosti.
const overovac = overovacKampane();

export default (zadost: Request, kontext: KontextNetlify): Promise<Response> => obsluzZebricek(zadost, prostrediNetlify(kontext), overovac);

// Zápis znamená zkoušku mostu na serveru (jednotky sekund): hráč jich víc než pár za minutu
// nepošle, a kdo jich posílá desítky, zkouší server zahltit.
export const config = {
  path: "/api/zebricek",
  rateLimit: { windowLimit: 40, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
