/** Hod d20. Volitelný rng kvůli testům. */
export function rollD20(rng: () => number = Math.random): number {
  return Math.floor(rng() * 20) + 1;
}

/** Předhozené kostky pro jeden GM tah. */
export function preRollDice(count = 3, rng: () => number = Math.random): number[] {
  return Array.from({ length: count }, () => rollD20(rng));
}
