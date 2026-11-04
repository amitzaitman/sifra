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

/** A form a level deals (architecture 2.2): its unknown and eqform, else the level's (eqform 'standard'), and its weight. */
interface LevelForm { unknown?: string; eqform?: string; w: number }

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
  eqform?: string;
  ask?: string | string[];
  max?: number;
  min?: number;
  /** false: no dots under the cards' numbers (skills.md, design 6.5) */
  cardDots?: boolean;
  /** false: the ladder never steps down from this level to the one before it (skills.md, architecture 3.4) */
  down?: boolean;
  /** the forms makeRound deals, by weight (architecture 2.2); required when `unknown` is an array */
  forms?: LevelForm[];
  /** numbers in the level's range that are never an answer, each for a reason (architecture 4.2) */
  exclude?: number[];
  /** rules of the skill's list whose display this level's picture cannot draw on some round, each for a reason (architecture 2.2) */
  undrawn?: string[];
  /** why one card holds the answer in 80% of the level's rounds or more (R4, architecture 2.2); none does today */
  samePlace?: string;
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

/** The demo's hand (architecture 2.6): it taps an element, or steps back to its place off the picture. */
interface Hand {
  /**
   * shows the hand and moves it onto el (the page scrolls so it and the hand are on screen), then taps; el is a play
   * target, and the game then touches it as a tap in play would (architecture 2.6)
   */
  tap(el: Element): Promise<void>;
  /**
   * hides the hand, then puts it back at its place at the foot of the round, before a hint or a tour it would cover;
   * hidden, because on a short phone that place lies on the cards (architecture 2.6). The hand starts hidden.
   */
  rest(): Promise<void>;
}

/** A wrong tap, as the shell hands it to view.miss (architecture 2.4) */
interface Miss {
  value: any;
  rule: string;
  /** RULES[rule].display */
  display: string;
  /** the help step: 1, 2 or 3 (2.5) */
  step: 1 | 2 | 3;
  /** the round's first miss: its display stays to the next tap (step 1, or step 2 with 3 options) */
  first: boolean;
}

interface RoundView {
  miss?(miss: Miss): Promise<void>;
  solve?(): Promise<void>;
  picture?(): void;
  demo?(hand: Hand): Promise<void>;
  /** the picture's description, read again after the solve, setEquation and ctx.relabel() (a getter where it changes) */
  readonly label?: string;
}

interface RenderContext {
  signal: AbortSignal;
  /** In 'thumb' render draws before it returns: the shell catches only a synchronous throw (architecture 2.4, 3.9). */
  mode: 'play' | 'demo' | 'thumb';
  solved: boolean;
  setEquation(equation: Equation): void;
  /**
   * Game 3 (architecture 2.4): show only these tokens of the equation row, by index in [...left, '=', ...right];
   * the rest keep their place, hidden, and the row is aria-busy. null shows all. A no-op in thumbs, after the
   * solve and after abort; setEquation draws a fully built row.
   */
  build(indices: number[] | null): void;
  /** reads the view's label again, after a change the shell does not see (a counter moved, bug hunt #24); a no-op in thumbs */
  relabel(): void;
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
  /** the display ids (RULES[rule].display) that view.miss draws (architecture 2.1); it throws on any other */
  displays: string[];
  /** whether this round's picture can draw a wrong choice's display (architecture 2.1); makeRound deals no choice it says no to */
  canShow?(round: Round, choice: Choice): boolean;
  /** why a wrong choice's display does not fit the picture (architecture 4.2), null when it does */
  budget?(round: Round, choice: Choice): string | null;
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
  /** the taps during those demos by kind (shell/taps.js TAP_KINDS), for the attempt's demoTaps (architecture 3.9) */
  demoTaps?: Partial<Record<'auto' | 'how', Record<string, number>>>;
  /** the presses on the locked cards during those demos, for the attempt's lockedTaps.demo */
  demoLocked?: number;
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
/** raw: the stored text this tab read or wrote last (refresh, architecture 3.9) */
interface Store { storage: Storage | null; data: Stored; writable: boolean; raw: string | null }
