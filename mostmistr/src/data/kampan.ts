// Odemykání úrovní kampaně. Uvnitř kapitoly se jde po jedné; další kapitola se otevře, jakmile
// jsou v té předchozí projité dvě úrovně. Kdo se zasekne na konci kapitoly, má kam jít dál.

/** Kolik úrovní kapitoly stačí projít, aby se otevřela kapitola další. */
export const UROVNI_K_DALSI_KAPITOLE = 2;

/** Číslo kapitoly z id úrovně, např. „1“ pro „1-03“. */
export function kapitolaUrovne(id: string): string {
  return id.split("-")[0] ?? "";
}

/** Na co zamčená úroveň čeká: na předchozí úroveň své kapitoly, nebo na úrovně kapitoly předchozí. */
export type Zamek = { druh: "uroven"; uroven: string } | { druh: "kapitola"; kapitola: string; zbyva: number };

export interface StavUrovne {
  /** Úroveň má medaili za průchod. */
  projita: boolean;
  /** Hráč v ní má rozestavěný most. */
  rozestavena: boolean;
}

/**
 * Zámky úrovní kampaně v jejím pořadí: null u úrovně odemčené, jinak na co čeká.
 *
 * Úroveň, kterou hráč už prošel nebo ve které má rozestavěný most, zůstává odemčená, i kdyby
 * podle dnešních pravidel nebyla (před dřív vydanou kapitolu se později zařadily nové).
 */
export function zamkyKampane(idUrovni: readonly string[], stav: (id: string) => StavUrovne): (Zamek | null)[] {
  const projitoVKapitole = new Map<string, number>();
  const urovniVKapitole = new Map<string, number>();
  for (const id of idUrovni) {
    const kapitola = kapitolaUrovne(id);
    urovniVKapitole.set(kapitola, (urovniVKapitole.get(kapitola) ?? 0) + 1);
    if (stav(id).projita) projitoVKapitole.set(kapitola, (projitoVKapitole.get(kapitola) ?? 0) + 1);
  }
  return idUrovni.map((id, poradi) => {
    const { projita, rozestavena } = stav(id);
    const predchozi = idUrovni[poradi - 1];
    if (predchozi === undefined || projita || rozestavena) return null;
    const kapitola = kapitolaUrovne(id);
    const predchoziKapitola = kapitolaUrovne(predchozi);
    if (predchoziKapitola === kapitola) return stav(predchozi).projita ? null : { druh: "uroven", uroven: predchozi };
    // První úroveň kapitoly: stačí dvě projité úrovně kapitoly předchozí (nebo všechny, má-li jich míň).
    const potreba = Math.min(UROVNI_K_DALSI_KAPITOLE, urovniVKapitole.get(predchoziKapitola) ?? 0);
    const zbyva = potreba - (projitoVKapitole.get(predchoziKapitola) ?? 0);
    return zbyva > 0 ? { druh: "kapitola", kapitola: predchoziKapitola, zbyva } : null;
  });
}
