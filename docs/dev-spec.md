# sifra: מפרט למפתחים

חלק ממסמך הפדגוגיה של sifra. תוכן העניינים: [pedagogy.md](pedagogy.md).

## נספח א: למפתחים

הנספח הזה בשביל מי שכותב את הקוד והבדיקות. הבעלים לא צריך לקרוא אותו: כל בדיקה מתוארת בשורה
אחת בעברית בכלל שלה ([§2](rules.md)). הערות בקוד יהיו באנגלית (`decisions.md`).

### א.1 מה המחולל והמשחק מייצאים

```js
// A level. skill and demo always; the rest are the parameters from skills.md.
{ skill: 'num.parts.make-ten', demo: true, structure: 'part-whole', unknown: 'part',
  max: 10, model: 'frame', look: 'dots', options: 4, terms: false, helpEstimate: false }
// terms and helpEstimate are static per level (§4.1, §4.8): makeRound is pure and does not see
// the child's history. There is no grade anywhere at run time (owner decision 2026-10-14).
// needsReading stays false in v1: no reading-dependent rounds (owner decision 2026-10-14, §8.1 ט).

// makeRound(level, rng) returns plain data. Every field is logged with each attempt.
{
  skill, structure, unknown, look, model, eqform,   // copied from the level
  picture: [{ role, count, shown }],
  //   role:  'whole' | 'part' | 'unknown' | 'added' | 'removed'
  //   shown: 'items' (countable) | 'tag' (covered, digit on the cover) | 'covered' (the ? cover)
  //   Rounds without quantities describe their own picture instead (§4.12–§4.14):
  //   lengths: [{ length, start, upright, bent, fixed }] in hidden units; shapes: [{ vertices,
  //   open, curvedSide, rounded }]; clocks: { h, m, hourHand }; picto: rows of { kind, value }
  //   plus key.
  helpPicture,                          // look: 'symbols' only: what "show me the picture" draws
  equation: { left: [...], right: [...] } | null,   // small tree; '?' is a leaf
  text,                                 // the one sentence, or ''
  terms: [{ at, word }],                // labels on the solved exercise; [] unless terms: true.
                                        //   at: path of a number leaf in equation (frac.*: a part
                                        //   in picture); word: from the locked list, or ½ / ¼
  answer,
  choices: [{ value, rule }],           // choice rounds only
}

// Mixed levels: the session planner picks the structure (or the question, `ask`) and calls
// makeRound({ ...level, structure }, rng) or makeRound({ ...level, ask }, rng).

export const rules = { /* ruleId: (round) => value | null */ };      // one formula per id (§4.2)
export function classify(round, result) { /* -> 'correct' | ruleId */ } // build and estimate rounds
```

- `classify` returns `'build.other'` or `'line.estimate-off'` when no rule explains the result.
- The catalog in [§4.2](depth/errors.md) (between `<!-- catalog -->` and `<!-- /catalog -->`) is the source for
  each rule's value type and display id. The generic test parses it, or a JSON copy generated
  from it, and fails on any rule a game uses that is not in it.
- Display ids ([§4.1](depth/README.md)) are names of drawing functions in `lib/` or in the game, once a second game
  needs them.

### א.2 How each check is implemented

- **R1 [auto]:** for every leaf number in `equation`, some group in `picture` has that `count`
  and `shown` in `items` or `tag`. The `?` leaf maps to the group with role `unknown`, whose
  `shown` is `covered`, or `items` when the task is to count a visible group (counting rounds,
  the `?` bracket in comparison). Solve the tree for `?`; it must equal `answer` and that group's
  `count`. Rounds without an
  equation: `answer` equals the count of the asked group. `look: 'symbols'`: run on
  `helpPicture`. `text` is '' or from the locked template list, has no `[0-9]`, at most six
  words, and no U+05BD. `terms` is `[]` when the level has `terms: false`; otherwise every `word`
  is from the locked label list (or `½` / `¼` in `frac.*`), has no U+05BD, and every `at` points to
  a number leaf that exists in `equation` (in `frac.*`, to a part group in `picture`). The words
  are not `text`, so the sentence checks above do not cover them. Branches for rounds without
  quantities:
  - lengths (`meas.length.compare`): `answer` is computed from the listed lengths; every nonzero
    difference is at least one hidden unit; no tick or countable part is drawn;
  - shapes (`geo.shape.polygons`): a pure classifier over the vertex data (closed, straight sides,
    corner count, right corners, equal sides) puts `answer` in the tray's class;
  - clocks (`meas.time.clock`): the time shown by the given clock (`read`) or by the correct
    option (`match`, `wind`) equals `answer`;
  - picture graphs (`data.picto.read`): rows carry values with the key applied; `answer` is
    computed from them;
  - estimation (`addsub.multi.estimate`, `ask: about`): `answer` is the nearest ten of the
    equation's value, and no number in the round ends in 5.
- **R1 [browser]:** hide all text nodes with a stylesheet and screenshot the round; every control
  has an icon element (`[data-icon]`).
- **R2 [auto]:** the [§4.6](depth/addsub-meaning.md) table is encoded as data. `(structure, unknown)` must be a row; the
  equation's shape must match the row's form (or its reversed form when `eqform: 'reversed'`).
  Over 200 seeds every declared pair appears. On the first level of a story structure (not
  `equation`) in a game's list, `max(numbers) <= 5`, whatever the skill: there is no grade to relax
  it (owner decision 2026-10-14). Levels with no symbol yet (`muldiv.share.equal` levels 1–2, [§4.10](depth/muldiv.md))
  return `equation: null`: R2 checks the structure and unknown only, and R1 uses the no-equation
  branch.
- **R3 [auto]:** each skill's allowed model order (the "מודל" line of each skill in its strand file under `depth/`; the line is defined in [§4.1](depth/README.md)) is encoded as data.
  Along a game's level list for one skill, the model index never decreases; within the same model
  and `max`, the look index (objects < dots < symbols) never decreases. `precision` (clock) counts
  as range, like `max`. A level with `helpEstimate: true` has skill `addsub.multi.two-digit` or
  `addsub.multi.column`, and an earlier level in the same game has skill `addsub.multi.estimate`.
  A level with `terms: true` has a skill in `addsub.*`, `muldiv.*` or `frac.*` ([§4.1](depth/README.md)), and not
  `addsub.multi.whole-tens`. `terms` is the level's own property: whether a level should have it
  is a review question against its depth table, never a grade (levels and progression are
  independent of grade, owner decision 2026-10-14).
- **R3, R11 [unit]:** planner tests. With history from yesterday: 1–2 review rounds at the last
  passed level or one below, drawn from any skill the child passed a level of, in any game (no
  grade band; a game far along the map is reviewed like the first two). Nothing due:
  the skill with the nearest due date. No history: no review. A failed review does not change the
  level. Mixed level: at least two structures (or `ask` values), and the switch rate between
  consecutive rounds is about 0.4 over many sessions. Levels: up after 4 first-try successes in
  a row; down after 2 rounds with help among the last 4 (review and mixed rounds excluded). Fast
  climb: one level per first-try success; the first miss returns to the last level passed on the
  first try. Stuck child (about 10 rounds at a level over different sessions, under half
  first-try): the first prerequisite of the skill (base, plus conditional ones whose condition the
  level meets) without "mastered" that has a level in some existing game, starting at the last
  level passed there, or its first level; if none, the previous level of the same skill (the
  previous level in the game's list at a skill's first level; stay at the game's first level);
  the demo runs again; the event is logged with the level returned to and any prerequisite that no
  game offers. Test cases: a prerequisite that no game offers (`num.parts.split` needs
  `count.set.how-many`, which neither `ten-frame` nor `balance` has) returns the child to the
  previous level and logs `count.set.how-many`; a prerequisite that another game offers is chosen
  over the previous level (stuck in `eq.sign.missing` with `eq.sign.same-as` mastered: go to
  `num.parts.split` in `ten-frame`).
- **R4 [auto], choice rounds:** `answer` within the level's range; options distinct (deep
  equality) and include `answer`; for every wrong option `deepEqual(rules[rule](round), value)`
  and `value !== answer`; the value matches the rule's declared type; numbers fit the button
  (`String(value).length <= 4` at 64px, `<= 3` at 56px); option count is 4, or 3 in the allowed
  cases; at least two non-`slip.*` rules when the skill lists them; `keyword.*` present in text
  levels with inconsistent wording, absent in levels without text.
- **R4 [auto], build and estimate rounds:** for every rule in the skill's list that has a formula,
  `classify(round, rules[r](round)) === r`; `classify(round, answer) === 'correct'`. Clock wind
  rounds classify to `'correct'`, `clock.next-hour`, `clock.half-flip` or `build.other`. Shape
  collect rounds classify by the rule order in [§4.12](depth/geometry.md).
- **Geared clocks [unit]:** every drawn clock has `hourHand === h + m / 60`, except the option
  whose rule is `clock.hour-hand-still`.
- **R5 [browser]:** `page.clock.install()` before `goto`. Tap a tagged wrong option: it is removed,
  `[data-display="<id>"]` is visible, and the attempt is logged with the rule.
  `page.clock.runFor(60000)` changes nothing. Second miss: the structure hint is visible. Third:
  only the answer remains, the last tour digit equals `answer` (it counts the unknown from 1 when
  the unknown is a part, and counts on when it is the whole), and the outcome is `shown`. With
  `page.emulateMedia({ reducedMotion: 'reduce' })`, options accept taps right after a miss.
- **R5 [auto]:** every rule a game uses has a display id from the catalog column.
- **R6 [unit]:** drawing functions are pure `(host, data)`; test the computed layout: frame items
  left to right, top row first; tick 0 leftmost; rows of five above 4 items except
  `arrangement: 'scattered' | 'spread'` and the unit strip (`model: 'units'`); a numeral on every tick in small ranges except
  `marks: 'landmarks' | 'ends'`; a ten-frame tray has role `whole` only in `num.parts.make-ten`
  levels, otherwise no role (`--frame`).
- **R6 [browser]:** x of the first dot < x of the second; elements with `data-role` have the
  role token's computed colour; only one cover component (`.cover`) exists.
- **R7 [browser, Chromium and WebKit]:** every `[data-math]` element has the attribute
  `dir="ltr"` (or is a `<bdi dir="ltr">`), computed `direction` is `ltr`, and the x of each
  character (via `Range.getBoundingClientRect` per character) increases in source order.
  Background: CSS `direction: ltr` on an inline element inside an RTL paragraph does not isolate
  it; a flex row in an RTL page reverses order. Measured locally in Chromium 141 (Playwright
  build 1194); WebKit not yet measured.
- **R8 [auto]:** substitute `answer`, evaluate both sides, they are equal; exactly one `=`. In
  levels that mix `eqform`, at least 25% of 200 seeds are non-standard.
- **R9 [browser]:** first entry to a level with `demo: true` runs the demo, and no attempt is
  logged for the demo round. Tapping the hand icon logs help.
- **R10 [browser]:** while a round waits, `document.getAnimations()` targets only elements with a
  quantity `data-role`. After `page.clock.runFor(60000)` no new element appears. No element
  outside `[data-demo]` has a computed `animation-delay` or `transition-delay` above about 0.3s.
  One test per suite waits 60 s in real time. Why: Playwright's fake clock controls JavaScript
  timers, not CSS animations, so a hint behind `animation-delay: 10s` would pass the clock test.
- **R10 [code]:** no `setTimeout` or `setInterval` in game code. Every wait for `animationend`
  also listens for `animationcancel`, and finishes at once when
  `matchMedia('(prefers-reduced-motion: reduce)').matches` or `el.getAnimations().length === 0`
  (iOS "Reduce Motion" often yields `animation: none`, and `animationend` never fires). Text
  templates contain no word from the closed reward-word list; "שעון" and "מטבע" are not on it.

### א.3 Local checks

- Number words ([§3.2](map.md), [§4.5](depth/place-value.md)) were checked against ICU 74 / CLDR spell-out data.
- Level thresholds and guessing odds (R4, [§5.4](pedagogy.md)) were computed with a formula and a simulation. The
  R4 table was recomputed on 2026-10-14 for the chosen rule (up after 4 in a row, down after 2
  help rounds among the last 4, empty window at the start) by value iteration over (streak, last
  four outcomes).
- The docs are checked by `npm test` (`tests/docs.test.js`): skill ids across skills.md, the map and
  the depth files, prerequisites and cycles, rule lists per depth section, the catalogue, displays,
  models, meteg, and relative links.

### א.4 Exporting the attempt log (owner decision 2026-10-14, §8.1 ח)

The decision is in [§8.1](pedagogy.md) ח.

- A route on the hidden dev page, for example `#/dev/export`, downloads the attempt log as JSON:
  the versioned storage key's content as stored, plus the schema version.
- Nothing in the child's UI links to it, and it shows nothing a child or parent sees in normal
  use. Only the owner uses it, on test devices, like the rest of `#/dev`.
- It reads storage only when opened, never at module load (`decisions.md`).
