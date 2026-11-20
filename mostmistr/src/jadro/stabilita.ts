// Volba kroku explicitní integrace.
//
// Velocity Verlet je stabilní jen s krokem kratším než 2/ω_max, kde ω_max je nejvyšší
// vlastní frekvence soustavy. Tu určuje nejkratší a nejtužší prut: podélná vlna jím
// proběhne za dobu L/c a krok musí být kratší. Tlumení úměrné tuhosti mez dál zkracuje.

/** Podíl meze stability, na kterém se počítá. Rezerva kryje změny tuhosti během zkoušky. */
export const REZERVA_KROKU = 0.9;

/**
 * Poměrný útlum nejvyšší vlastní frekvence, který dodá tlumení úměrné tuhosti.
 * Slouží jen k potlačení numerického zvonění; na frekvence, na kterých záleží
 * (jednotky až desítky Hz), nemá znatelný vliv a krok zkracuje o desetinu.
 */
export const UTLUM_NEJVYSSI_FREKVENCE = 0.1;

/**
 * Mez stability kroku pro soustavu s nejvyšší frekvencí `omegaMax` (rad/s), jejíž
 * nejvyšší tvar má od tlumení úměrného tuhosti poměrný útlum `xi`.
 * Vzorec 2/ω · (√(1 + ξ²) − ξ) je ověřen měřením v testech.
 */
export function mezKroku(omegaMax: number, xi = 0): number {
  return (2 / omegaMax) * (Math.sqrt(1 + xi * xi) - xi);
}

/** Součinitel β tlumení úměrného tuhosti, který dá nejvyšší frekvenci útlum `xi`. */
export function betaProUtlum(omegaMax: number, xi = UTLUM_NEJVYSSI_FREKVENCE): number {
  return (2 * xi) / omegaMax;
}

/** Krok, se kterým se má soustava počítat. */
export function zvolKrok(omegaMax: number, xi = UTLUM_NEJVYSSI_FREKVENCE, rezerva = REZERVA_KROKU): number {
  return rezerva * mezKroku(omegaMax, xi);
}
