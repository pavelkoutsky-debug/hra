// Nevhodné přezdívky v žebříčku: krátký seznam hrubých a nenávistných výrazů, česky a anglicky.
// Úplný být nemůže (kdo chce, napíše to jinak); chytí jen to nejběžnější a zbytek z žebříčku
// smaže správce (`co=zebricek-smazat`). Kořeny jsou vybrané tak, aby nechytaly běžná slova a
// jména: co se vyskytuje i uvnitř nevinných slov (Scunthorpe, Yoshitaka, svinec, negramotný,
// retardér), platí jen jako celé slovo.

/** Kořeny, které přezdívka nesmí obsahovat nikde (ani složené z kusů s oddělovači). */
const KORENY = [
  // česky
  "kokot",
  "kurv",
  "picus",
  "picovin",
  "curak",
  "zmrd",
  "debil",
  "kreten",
  "mrdat",
  "mrdka",
  "mrdal",
  "sukat",
  "sukal",
  "soustat",
  "prdel",
  "hovn",
  "sracka",
  "hajzl",
  "jebat",
  "jebal",
  "jebn",
  "kunda",
  "buzna",
  "buzerant",
  "teplous",
  "cigos",
  "hitler",
  // anglicky
  "fuck",
  "bullshit",
  "shithead",
  "bitch",
  "whore",
  "dickhead",
  "cocksuck",
  "asshole",
  "bastard",
  "wanker",
  "pussy",
  "rapist",
  "nigger",
  "nigga",
  "faggot",
  "siegheil",
  "whitepower",
] as const;

/** Výrazy, které vadí jen jako celé slovo přezdívky (nebo celá přezdívka bez oddělovačů). */
const SLOVA = ["pica", "negr", "negri", "svine", "shit", "cunt", "slut", "fag", "retard", "twat", "kike", "spic", "nazi"] as const;

/** Číslice, kterými se píšou písmena (`k0k0t`, `5h1t`). */
const CISLICE: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t" };

/** Malá písmena bez diakritiky, číslice za písmena; oddělovače zůstanou (pro celá slova). */
function zakladniTvar(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[013457]/g, (c) => CISLICE[c]!);
}

/**
 * Je přezdívka (už upravená `upravPrezdivku`) na seznamu nevhodných? Porovnává se bez velikosti
 * písmen, diakritiky a oddělovačů, s číslicemi místo písmen.
 */
export function jeNevhodnaPrezdivka(prezdivka: string): boolean {
  const zaklad = zakladniTvar(prezdivka);
  const souvisle = zaklad.replace(/[^a-z]/g, "");
  if (KORENY.some((koren) => souvisle.includes(koren))) return true;
  const slova = new Set([souvisle, ...zaklad.split(/[^a-z]+/)]);
  return SLOVA.some((slovo) => slova.has(slovo) || slova.has(`${slovo}s`));
}
