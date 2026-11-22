// Příjem deníku hraní: hra sem posílá dávky událostí. Logika je v `src/server/obsluha.ts`.
import { prostrediNetlify } from "../../src/server/netlify";
import { prijmiDenik } from "../../src/server/obsluha";

export default (zadost: Request): Promise<Response> => prijmiDenik(zadost, prostrediNetlify());

export const config = { path: "/api/denik" };
