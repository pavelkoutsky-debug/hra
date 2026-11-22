// Náhledový server Vite žádné funkce Netlify nemá, takže by každá dávka deníku hraní skončila
// chybou 404 v konzoli prohlížeče. Testy, které deník nezkoumají, si proto nechají dávky a
// zpětnou vazbu jen potvrdit. Skutečnou obsluhu zapojuje `denik.e2e.ts`.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { PreviewServer } from "vite";

export function prijimejDenik(server: PreviewServer): void {
  const potvrd = (stav: number, telo: string) => (zadost: IncomingMessage, odpoved: ServerResponse): void => {
    zadost.resume();
    zadost.on("end", () => {
      odpoved.statusCode = stav;
      if (telo) odpoved.setHeader("content-type", "application/json");
      odpoved.end(telo);
    });
  };
  // Na začátek řady, před obsluhu souborů, která by na neznámou cestu odpověděla sama.
  server.middlewares.stack.unshift(
    { route: "/api/denik", handle: potvrd(204, "") },
    { route: "/api/vazba", handle: potvrd(201, '{"id":"20260101T000000-000000"}') },
  );
}
