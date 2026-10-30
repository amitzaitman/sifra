// A level's forms (architecture 2.2): the forms makeRound deals, each with its weight, as data on
// the level, so the generic test checks each share against the level and not against the code.

/**
 * One of a level's forms, by weight, from one draw of the rng. `at` is where the draw fell inside
 * the form's own share, from 0 to 1, for a game that splits a form further without a second draw.
 * @template {{ w: number }} F
 * @param {F[]} forms
 * @param {Rng} rng
 * @returns {{ form: F, at: number }}
 */
export function pickForm(forms, rng) {
  let x = rng.next() * forms.reduce((n, f) => n + f.w, 0);
  for (const form of forms) {
    if (x < form.w) return { form, at: x / form.w };
    x -= form.w;
  }
  return { form: forms[forms.length - 1], at: 1 };
}
