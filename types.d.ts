// Ambient types of the game contract and the stored data (docs/architecture.md sections 2-3).
// Type declarations only, no runtime code.

interface Rng {
  next(): number;
  int(lo: number, hi: number): number;
  pick<T>(list: T[]): T;
  shuffle<T>(list: T[]): T[];
}

type Token = number | '?' | '+' | '−' | '×' | ':';
interface Equation { left: Token[]; right: Token[] }
interface Group { role: 'whole' | 'part' | 'unknown' | 'added' | 'removed'; count: number; shown: 'items' | 'tag' | 'covered' }
interface Choice { value: any; rule: string | null }

/** A level: complete, with a stable id (architecture 2.2). Other keys are skills.md parameters. */
interface Level {
  id: string;
  skill: string;
  demo: boolean;
  options: number;
  model: string;
  look: 'objects' | 'dots' | 'symbols';
  terms: boolean;
  structure?: string | string[];
  unknown?: string | string[];
  eqform?: string | string[];
  ask?: string | string[];
  max?: number;
  min?: number;
  /** false: no dots under the cards' numbers (skills.md, design 6.5) */
  cardDots?: boolean;
  [param: string]: any;
}

/** What makeRound returns (dev-spec A.1, architecture 2.3). Plain data. */
interface Round {
  skill: string;
  structure?: string;
  unknown?: string;
  look: string;
  model: string;
  eqform?: string;
  ask?: string;
  picture: any;
  helpPicture: any;
  equation: Equation | null;
  text: string;
  terms: { at: any; word: string }[];
  answer: any;
  choices: Choice[];
  /** a judging round (architecture 2.3): the exercise's numbers a and b, which every card is made of */
  fact?: number[];
}

interface Hand { tap(el: Element): Promise<void> }

interface RoundView {
  miss?(choice: { value: any; rule: string; display: string }, step: number): Promise<void>;
  solve?(): Promise<void>;
  picture?(): void;
  demo?(hand: Hand): Promise<void>;
  label?: string;
}

interface RenderContext {
  signal: AbortSignal;
  mode: 'play' | 'demo' | 'thumb';
  solved: boolean;
  setEquation(equation: Equation): void;
  onAttempt(value: any): void;
}

/** No grade: levels and progression are independent of school grade (owner decision 2026-10-14). */
interface GameMeta { id: string; title: string; version: number; css: string }

interface Game {
  meta: GameMeta;
  levels: Level[];
  text: string[];
  rules: Record<string, (round: Round) => any>;
  makeRound(level: Level, rng: Rng): Round;
  render(host: HTMLElement, round: Round, ctx: RenderContext): RoundView;
  face?(host: HTMLElement, value: any, round: Round): boolean;
  classify?(round: Round, value: any): string;
}

/** data/skills.js, in the learning order (architecture 3.6) */
interface Skill {
  id: string;
  requires: { base: string[]; when: { if: Record<string, string>; add: string[] }[] };
  rules: string[];
}
/** data/errors.js */
interface RuleInfo { types: string[]; display: string }
/** data/forms.js: 'n' for a number, '?', operators, '∘' for + or − */
interface Shape { left: string[]; right: string[] }
/** start: the ceiling of the structure's first level in a game (R2), null for none (equation) */
interface FormRow { structure: string; unknown: string; forms: Shape[]; reversed: Shape[]; start: number | null }

/** One counted round of a session (architecture 3.3). index -1: filled in when it starts. */
interface Spec {
  game: string;
  index: number;
  seed: number;
  kind: 'new' | 'review' | 'mixed';
  structure?: string;
  ask?: string;
  /** the demos shown before the correct tap, in order: 'auto' on entry, 'how' for the hand */
  demo?: ('auto' | 'how')[];
  record?: any;
}

interface Ladder {
  level: string;
  fast: string | null;
  streak: number;
  window: string[];
  passed: string[];
  at: Record<string, { n: number; first: number; sessions: number; lastSession: number | null }>;
  demoSeen: string[];
  demoDue: string | null;
  /** a stuck return's target level: the next step stays on this game until it is passed */
  hold: string | null;
}

interface SkillState {
  last: string | null;
  passedDay: string | null;
  box: number;
  due: string | null;
  reviewDays: string[];
  lastReviewFirst: boolean | null;
}

interface Child {
  created: string;
  sessions: number;
  games: Record<string, Ladder>;
  skills: Record<string, SkillState>;
  attempts: Record<string, any>[];
  events: Record<string, any>[];
}

interface Stored { schema: number; current: string; children: Record<string, Child> }
interface Store { storage: Storage | null; data: Stored; writable: boolean }
