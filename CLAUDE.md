# sifra: notes for Claude and coding agents

Math games for Israeli elementary-school children, in Hebrew, for phones and tablets.
Grades 1-2 first, growing game by game to grade 6. Static site on GitHub Pages: no
server, no build step, no audio.

Status: planning, no code yet. The pedagogy doc comes before the first game.

## Where things are

- `docs/decisions.md`: the owner's decisions and why (Hebrew). Don't reverse one without asking.
- `docs/pedagogy.md`: the binding rules (R1-R11) every game follows, the grade 1-6 map, grade 1-2 depth, the error-rule catalogue, the first two games and the owner's open questions (§8.1). Draft: the owner hasn't answered §8.1 yet. Appendix A is for developers.
- `docs/skills.md`: every skill id with prerequisites and error-rule ids. Ids are stable: never rename one that a game or a saved record uses.

## Product rules

- Silent: no speech, no sound, no audio code.
- Every round can be solved from the picture and the exercise. At most one short pointed sentence.
- No timers inside games: the child taps "הַבָּא". No coins, streaks, stars or clocks.
- No adult tools in v1. No accounts, analytics or network service at play time.
- Tap input only, until a game needs dragging.
- Target Safari 16.4+ and current Chrome. Nothing is transpiled, so don't use newer features.

## Ready to grow (enforced, not optional)

1. A game exports `meta`, `levels`, `makeRound(level, rng)` and `render(host, round, { signal, onAttempt })`. `makeRound` is pure: no DOM, no storage, no `Math.random`.
2. The shell owns levels, storage and the session. A session is a list of `{ game, level, seed }`; review rounds from earlier days use the same path.
3. Every attempt is recorded: child, game, level, skill, seed, day, outcome (`first` | `help` | `shown`), wrong rules chosen, ms. The storage key is versioned, with `migrate()`.
4. Every level names a skill id from `docs/skills.md`.
5. Every choice is `{ value, rule }`, and every wrong choice has a rule. One generic test runs every game x level x 200 seeds.
6. Drawing code for a representation takes `(host, data)` only and uses the role colour tokens (whole, part, unknown, added, removed), so it can move to `lib/` unchanged.
7. `#/dev/<game>/<level>/<seed>` shows any round.

## Shared code

- `lib/` modules import nothing. Shared code stays under 600 lines.
- Code moves to `lib/` only when a second game needs it. An option only one game uses stays in that game.

## Hebrew and layout

- RTL page. Equations, number lines and digit rows use `dir="ltr"`.
- Hebrew is written with nikud in the source. No meteg (U+05BD). Address children in the plural.
- Buttons at least 64px (56px allowed for a row of five on a 320px screen). No horizontal scroll at 320px.
- Code comments are short and in English. Docs the owner reads are in Hebrew.

## Tools (planned)

- Plain JavaScript with JSDoc, checked by `tsc --checkJs`. `node:test` for logic. Playwright on Chromium and WebKit (iPhone).
- One CI workflow that tests and deploys to Pages.
- Before a new game goes live: a manual iPhone check, logged with a date in `docs/device-checks.md`.

## Reuse from AlefBet

Only the files listed in `docs/decisions.md` (section "מה לוקחים מ-AlefBet"), copied in when
a game needs them. Don't port AlefBet's runtime, story kit, speech chain or build.

## Working rules

- One step per branch.
- For decisions that are the owner's, gather the facts and ask a multiple-choice question,
  rating each option with up to five stars and listing the recommended option first.
