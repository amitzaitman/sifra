# sifra: notes for Claude and coding agents

Math games for Israeli elementary-school children, in Hebrew, for phones and tablets.
Grades 1-2 first, growing game by game to grade 6. Static site on GitHub Pages: no
server, no build step, no audio.

Status: planning, no code yet. The pedagogy doc comes before the first game.

## Where things are

- `docs/decisions.md`: the owner's decisions and why (Hebrew). Don't reverse one without asking.
- The pedagogy doc is split by section; section numbers (§) are the same in every file:
  - `docs/pedagogy.md` (§1, §5-§8): scope and evidence labels, how a silent app teaches (§5 is also the shell's spec), the first two games and their level tables (§6), what not to build on, and §8: the owner's decisions (§8.1), what to check in sources and with a child (§8.2-§8.4), design defaults (§8.5). It starts with an index of all the files.
  - `docs/rules.md` (§2): the eleven binding rules R1-R11 and how each is checked.
  - `docs/map.md` (§3): the grade 1-6 map. Aharoni and the Singapore series ("מתמטיקה יסודית") decide order, notation and teaching; the Ministry curriculum is secondary; §3.6 lists where the order differs from school.
  - `docs/depth/README.md` (§4, §4.1) shared conventions; `docs/depth/errors.md` (§4.2) the error-rule catalogue; one `docs/depth/<strand>.md` per strand (§4.3-§4.14). A game needs rules.md, §4.1, errors.md, the strand file of every skill its levels name, skills.md, dev-spec.md and design.md; ten-frame and balance also need §6 in pedagogy.md, and the shell needs §5.
  - `docs/sources.md` (§9): sources and what was checked. `docs/dev-spec.md` (Appendix A): generator output and how each check is implemented.
- `docs/design.md`: the visual design spec (Hebrew, own section numbers): the chosen direction, the tokens (colours with their roles and contrast, sizes, type, motion) with the `app.css` block, the components (home page, top bar, answer cards, the `?` cover, ten-frame, balance), how each result display and help step is drawn, accessibility checks, and the owner's design decisions (§11).
- `docs/parents-videos.md`: Aharoni's videos per topic for the parents' page. Links unverified until checked.
- `docs/skills.md`: every skill id with prerequisites and error-rule ids. Ids are stable: never rename one that a game or a saved record uses.

## Product rules

- Silent: no speech, no sound, no audio code.
- Every round can be solved from the picture and the exercise. At most one short pointed sentence.
- No timers inside games: the child taps "הַבָּא". No coins, streaks, stars or clocks as rewards or timers (reading a clock and counting coins are maths content).
- No adult tools in v1, except one parents' page of links to Aharoni's videos (`docs/parents-videos.md`). It is reached by a small grey text link on the home page, with no gate. Videos open in YouTube itself; never embed them. No accounts, analytics or network service at play time.
- Home page: one big "הַצַּעַד הַבָּא" button (the first skill in the Aharoni/Singapore order that isn't mastered and whose prerequisites are), and every game open below it. No locks ([§5.12](docs/pedagogy.md)).
- sifra is practice after the child met a concept in class or with objects, not the first meeting: level 1 of a skill starts with pictures of real objects.
- Tap input only, until a game needs dragging.
- Target Safari 16.4+ and current Chrome. Nothing is transpiled, so don't use newer features.

## Ready to grow (enforced, not optional)

1. A game exports `meta`, `levels`, `makeRound(level, rng)` and `render(host, round, { signal, onAttempt })`. `makeRound` is pure: no DOM, no storage, no `Math.random`.
2. The shell owns levels, storage and the session. A session is a list of `{ game, level, seed }`; review rounds from earlier days use the same path.
3. Every attempt is recorded: child, game, level, skill, seed, day, outcome (`first` | `help` | `shown`), wrong rules chosen, ms. The storage key is versioned, with `migrate()`.
4. Every level names a skill id from `docs/skills.md`.
5. Every choice is `{ value, rule }`, and every wrong choice has a rule. One generic test runs every game x level x 200 seeds.
6. Drawing code for a representation takes `(host, data)` only and uses the role colour tokens (whole, part, unknown, added, removed; `docs/design.md` §3), so it can move to `lib/` unchanged.
7. `#/dev/<game>/<level>/<seed>` shows any round.

## Shared code

- `lib/` modules import nothing. Shared code stays under 600 lines.
- Code moves to `lib/` only when a second game needs it. An option only one game uses stays in that game.

## Hebrew and layout

- RTL page. Equations, number lines and digit rows use `dir="ltr"`.
- Hebrew is written with nikud in the source. No meteg (U+05BD). Address children in the plural.
- Buttons at least 64px (56px allowed for a row of five on a 320px screen). No horizontal scroll at 320px.
- Pinch zoom works on every screen: no `maximum-scale` or `user-scalable=no`, and no zoom-lock script. Only `touch-action: manipulation` on the whole site, so a double tap doesn't zoom.
- Code comments are short and in English. Docs the owner reads are in Hebrew.

## Tools (planned)

- Plain JavaScript with JSDoc, checked by `tsc --checkJs`. `node:test` for logic. Playwright on Chromium and WebKit (iPhone).
- `npm test` runs `tests/docs.test.js`, which keeps skill ids, error rules, displays, models, meteg and links consistent across the docs. Run it after every docs change.
- One CI workflow that tests and deploys to Pages.
- Before a new game goes live: a manual iPhone check, logged with a date in `docs/device-checks.md`.

## Reuse from AlefBet

Only the files listed in `docs/decisions.md` (section "מה לוקחים מ-AlefBet"), copied in when
a game needs them. Don't port AlefBet's runtime, story kit, speech chain or build.

## Working rules

- One step per branch.
- For decisions that are the owner's, gather the facts and ask a multiple-choice question,
  rating each option with up to five stars and listing the recommended option first.
