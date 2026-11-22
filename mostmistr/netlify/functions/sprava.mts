// Správa zpětné vazby a deníku hraní pro zadavatele; chráněná heslem z proměnné prostředí
// MM_SPRAVCE_HESLO. Logika je v `src/server/obsluha.ts`.
import { prostrediNetlify } from "../../src/server/netlify";
import { spravuj } from "../../src/server/obsluha";

export default (zadost: Request): Promise<Response> => spravuj(zadost, prostrediNetlify());

export const config = { path: "/api/sprava" };
