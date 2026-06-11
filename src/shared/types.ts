/** Identifikátory archetypů postavy. */
export type ArchetypeId = "ucenec" | "sikula" | "presvedcivy";

/** Atributy postavy, škála 0–3. Hodnota 0 = automatické selhání testu. */
export interface Attributes {
  vedeni: number;
  hbitost: number;
  vymluvnost: number;
  odvaha: number;
}

export type AttributeId = keyof Attributes;

/** Osy chování hráče — řídí výběr konce a reakce světa. */
export interface Axes {
  /** záporná = lstivá cesta, kladná = čestná/veřejná */
  povest: number;
  /** záporná = strach/využití Golema, kladná = soucit */
  golem: number;
  /** postup v odhalení spiknutí (0–10) */
  odhaleni: number;
  /** napětí mezi ghettem a městem (0–10); vysoké = hrozba pogromu */
  pogrom: number;
}

export interface Enemy {
  name: string;
  hp: number;
  maxHp: number;
}

export interface CombatState {
  enemies: Enemy[];
  round: number;
}

/** Kompletní stav hry — drží ho klient, posílá se s každým tahem. */
export interface GameState {
  version: 1;
  archetype: ArchetypeId;
  attributes: Attributes;
  hp: number;
  maxHp: number;
  location: string;
  /** uplynulý herní čas v minutách (limit = TIME_LIMIT_MIN) */
  timeMinutes: number;
  inventory: string[];
  flags: Record<string, boolean | number | string>;
  npcAttitudes: Record<string, number>;
  /** kronika — průběžné shrnutí příběhu, které si GM sám udržuje */
  chronicle: string;
  axes: Axes;
  combat: CombatState | null;
  ending: string | null;
  turn: number;
}

/** Jeden odehraný tah pro historii posílanou GM. */
export interface TurnRecord {
  player: string;
  narration: string;
}

/** Detail testu atributu — zobrazuje se hráči. */
export interface CheckResult {
  attribute: AttributeId;
  action: string;
  roll: number;
  bonus: number;
  total: number;
  difficulty: number;
  success: boolean;
}

/** Částečná změna stavu, kterou vrací GM po každém tahu. */
export interface StatePatch {
  location?: string;
  time_cost_min: number;
  hp_delta?: number;
  inventory_add?: string[];
  inventory_remove?: string[];
  flags_set?: Record<string, boolean | number | string>;
  axes_delta?: Partial<Axes>;
  npc_attitude_delta?: Record<string, number>;
  combat?: CombatState | null;
}

/** Strukturovaná odpověď GM (Opus). */
export interface GmResult {
  narration: string;
  checks: CheckResult[];
  state_patch: StatePatch;
  /** non-null = kompletní nová verze kroniky (nahrazuje starou) */
  chronicle_update: string | null;
  /** non-null = předání řízení dialogu NPC enginu */
  npc_dialogue: { npc_id: string } | null;
  /** non-null = hra končí tímto koncem; narration obsahuje epilog */
  ending: { id: string; title: string } | null;
  quick_actions: string[];
}

/** Strukturovaná odpověď NPC (Haiku). */
export interface NpcResult {
  reply: string;
  end_dialogue: boolean;
  /** nová fakta, která se hráč dozvěděl (zapisují se do stavu a shrnutí pro GM) */
  learned_facts: string[];
  /** posun vztahu NPC k hráči (-2..+2) */
  attitude_delta: number;
}

export interface GmRequestBody {
  state: GameState;
  history: TurnRecord[];
  playerInput: string;
}

export interface NpcRequestBody {
  npcId: string;
  state: GameState;
  dialogue: { speaker: "hrac" | "npc"; text: string }[];
  playerInput: string;
}
