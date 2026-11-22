// Příjem zpětné vazby hráčů. Logika je v `src/server/obsluha.ts`.
import { prostrediNetlify } from "../../src/server/netlify";
import { prijmiVazbu } from "../../src/server/obsluha";

export default (zadost: Request): Promise<Response> => prijmiVazbu(zadost, prostrediNetlify());

export const config = { path: "/api/vazba" };
