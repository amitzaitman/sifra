# sifra: רשימת המיומנויות

טיוטה מ-2026-10-14.
ההסברים, הרמות, הטעויות והעזרה של כל מיומנות נמצאים ב-`docs/pedagogy.md`. המזהים כאן ושם זהים,
ובדיקה אחת תשווה בין שני הקבצים ובין הקוד.

## המזהים

### מזהה מיומנות

- **צורה:** `תחום.נושא.מיומנות`. שלושה חלקים באנגלית, אותיות קטנות, מקף בין מילים.
  לדוגמה `num.parts.make-ten` או `addsub.facts.bridge-add`.
- **מה לא נכנס למזהה:** כיתה, טווח מספרים, מראה ומודל, מקום הנעלם, כיוון, גורם הכפל, שם משחק
  ומספר רמה. כל אלה הם פרמטרים של רמה (בטבלה הבאה). הסיבות:
  - סדר הנושאים בבית הספר משתנה עכשיו, כיתה אחרי כיתה. מזהה עם כיתה היה מתיישן.
  - מקום הנעלם במזהה היה מכפיל את מספר המיומנויות (מבנה × נעלם × ניסוח × טווח), ושובר
    רמות שמערבבות נעלמים בכוונה.
- **פעולה היא פרמטר** (`op`), כשאותו רעיון חל על כמה פעולות. למשל `eq.props.commutative` עם
  `op: add` או `op: mul`, ו-`eq.inverse.ops` עם `op: add` (חיבור וחיסור) או `op: mul` (כפל וחילוק).
  מיומנות שהפעולה היא כל התוכן שלה (למשל `addsub.*` או `muldiv.*`) נשארת בתחום שלה.
- **קריאת מספרים** היא `pv.numeral.read` בכל טווח, עם `max` גדול יותר. `pv.units.*` רק לשמות
  היחידות (אלף, רבבה, מיליון) ולהמרות ביניהן.
- **מזהה לא משתנה, לא נמחק ולא מקבל משמעות אחרת.** מיומנות שיוצאת משימוש נשארת ברשימה
  עם "הוצאה משימוש" ועם המזהה שמחליף אותה. מיומנות שמתגלה כשתיים מקבלת שני מזהים חדשים,
  והישן נשאר עם הניסיונות שלו.
- **צמיחה:** ידע חדש מקבל חלק שלישי חדש בנושא קיים, או נושא חדש בתחום קיים. גרסה חדשה של
  ידע קיים היא ערך חדש של פרמטר, לא מזהה חדש: טווח גדול יותר (`max`), ייצוג חדש (`model`),
  כיוון (`dir`), פעולה אחרת (`op`), או לוח הכפל של 7 (`factor: 7`). תחום חדש נוסף רק לנושא חדש
  לגמרי (למשל `int`).
- **שינוי מול `decisions.md`:** הדוגמה שם, `make-ten.missing-part`, הופכת ל-`num.parts.make-ten`
  עם `unknown: 'part'`. ההחלטה מוסברת ב-`pedagogy.md`, ומחכה לאישור (§8.1 ג).

### מזהה כלל טעות

- **צורה:** `משפחה.שם`, שני חלקים, למשל `pv.reversed` או `given.whole`. מספר החלקים מבדיל
  בינו לבין מזהה מיומנות.
- **הכללים משותפים לכל המיומנויות, ולכל אחד נוסחה אחת.** אותה טעות (למשל ספרות הפוכות) מקבלת
  אותו מזהה בכל משחק, ומיוצרת באותה נוסחה, כדי שמפת מיומנויות בעתיד תוכל לומר "הילד הופך ספרות
  בכל מקום". טעות שצריכה נוסחה אחרת מקבלת מזהה אחר. למשל, `pv.tens-as-ones` פוצל ל-`pv.digits-added`,
  `pv.tens-as-ones` ו-`pv.ten-as-one-object`.
- **`slip.*` הם מעידות, לא תפיסות שגויות.** הם ממלאים מקום כשאין טעות ידועה, ומפה בעתיד
  תשקלל אותם אחרת. גם `build.other` ו-`line.estimate-off` אינם תפיסות שגויות: הם התוצאה של
  סיווג בסיבובי בנייה והערכה, כשאף כלל אחר לא מסביר את מה שהילד עשה.
- כל כלל מוגדר בטבלת כללי הטעות ב-`pedagogy.md` (§4.2): מה הילד חשב, הנוסחה, סוג הערך, התצוגה,
  ומה התמונה מראה אחרי שבוחרים בו.

### מזהי תצוגה

כל כלל טעות מראה מה הבחירה אומרת דרך תצוגה אחת מהרשימה הזו (`pedagogy.md` §4.1):
`count-up`, `overflow`, `flash`, `balance`, `jumps`, `pairs`, `build`, `flag`, `reverse-check`,
`story-replay`, `label-ten`, `regroup`, `place-slot`, `running-sums`, `circle-groups`,
`deal-out`, `overlay`, `lift-cover`, `digit-value`, `line-drop`, `empty-plate`.

### פרמטרים של רמה

כל רמה נושאת מיומנות אחת ופרמטרים מהרשימה הזו. כל ניסיון שומר עותק שלהם, כי הזרע לבדו
לא ישחזר את הסיבוב אם קוד המחולל ישתנה.

| פרמטר | ערכים | מה הוא קובע |
|---|---|---|
| `structure` | `change-add`, `change-take`, `part-whole`, `compare`, `equation`, `equal-groups`, `array`, `share` | מבנה הבעיה. `equation` הוא תרגיל בלי סיפור (שוויון, עובדות, רב-ספרתי). מיומנויות שאינן פעולה לא מצהירות על מבנה |
| `unknown` | בסיפורים: `result`, `change`, `start`, `whole`, `part`, `both`, `difference`, `larger`, `smaller`. ב-`equation`: `result-right`, `result-left`, `right-part`, `left-part`, `both-sides`. בכפל וחילוק: `product`, `group-size`, `groups` | מקום הנעלם. הזוגות המותרים וצורת התרגיל של כל זוג בטבלה ב-`pedagogy.md` §4.6 |
| `max` | `5`, `10`, `20`, `100`, `1000`, `10000` | טווח המספרים. הטווח מתחיל ב-0, אלא אם הרמה אומרת אחרת |
| `model` | `set`, `frame`, `rows`, `scene`, `bundles`, `blocks`, `place-table`, `path`, `line`, `empty-line`, `balance`, `cards`, `tree`, `plates`, `array`, `shapes`, `columns` | מה מצויר (`pedagogy.md` §4.1). לכל מיומנות יש סדר מותר של מודלים, והרמות לא חוזרות בו אחורה (R3) |
| `look` | `objects`, `dots`, `symbols` | כמה מוחשי המודל: חפצי סיפור, נקודות, או תרגיל בלבד |
| `arrangement` | `rows`, `scattered`, `spread` | איך החפצים מסודרים: בשורות של חמש (ברירת המחדל), מפוזרים, או פרוסים לאורך. `scattered` ו-`spread` הם חריג מכוון ל-R6 |
| `bridge` | `none`, `ten`, `hundred` | מעבר עשרת או מאה |
| `regroup` | `no`, `yes` | המרה (פריטה) בדו-ספרתי |
| `wording` | `consistent`, `inconsistent` | בהשוואה עם משפט: המילה מתאימה לפעולה או הפוכה לה. ממתין להחלטת הבעלים (`pedagogy.md` §8.1 ט) |
| `ask` | `pairs`, `more`, `fewer`, `equalize` | בהשוואה: מה שואלים |
| `eqform` | `standard`, `reversed`, `both-sides` | צורת התרגיל סביב `=` |
| `op` | `add`, `sub`, `mul`, `div` | הפעולה, במיומנויות שחלות על כמה פעולות |
| `factor` | `0` עד `10` | גורם הכפל בעובדות כפל |
| `step` | `1`, `2`, `5`, `10`, `100` | גודל הקפיצה בספירה |
| `dir` | `forward`, `back` | כיוון (למשל ב-`count.on.continue`) |
| `marks` | `every`, `tens`, `landmarks`, `ends` | שנתות עם מספר על ישר המספרים. `landmarks` (0, 5, 10 וכדומה) ו-`ends` הם חריג מכוון ל-R6 |
| `format` | `flags`, `zoom`, `estimate` | איך מסמנים מקום על הישר |
| `options` | `3`, `4` | מספר האפשרויות |
| `demo` | `true`, `false` | האם הרמה מתחילה בהדגמה שקטה (R9) |
| `needsReading` | `true`, `false` | שמור. אסור לשימוש עד שהבעלים יחליט (`pedagogy.md` §8.1 ט). עד אז כל רמה היא `false` |

## התחומים

| תחום | שם | מה בו | כיתות |
|---|---|---|---|
| `count` | ספירה | סדר המספרים, ספירת קבוצה, המשך ספירה, דילוגים | א–ב |
| `num` | מושג המספר | ראייה בלי ספירה, השוואה, מספר סודר, ישר המספרים, הרכבים, זוגיות, עיגול | א–ו |
| `pv` | ערך המקום | עשר ועוד, עשרות ואחדות, מאות ואלפים | א–ד |
| `addsub` | חיבור וחיסור | משמעויות, עובדות ואסטרטגיות, רב-ספרתי | א–ד |
| `eq` | שוויון ותכונות | סימן השוויון, המספר החסר, חוקים, פעולות הפוכות, סדרות, סדר פעולות | א–ו |
| `muldiv` | כפל וחילוק | חלוקה הוגנת, קבוצות שוות, מערכים, עובדות, רב-ספרתי, שארית | ב–ו |
| `nt` | התחלקות | גורמים, כפולות, סימני התחלקות, ראשוניים, חזקות | ג–ה |
| `frac` | שברים | חלקים שווים עד חילוק שברים | ב–ו |
| `dec` | שברים עשרוניים | עשיריות עד כפל וחילוק | ה–ו |
| `ratio` | יחס ואחוזים | יחס, קנה מידה, אחוז | ו |
| `int` | מספרים מכוונים | שמור לכיתה ז | ז |
| `geo` | גאומטריה | מצולעים, גופים, ישרים, סימטריה, מעגל | א–ו |
| `meas` | מדידות | אורך, זמן, כסף, משקל, נפח, שטח, היקף, זווית | א–ו |
| `data` | נתונים | גרף תמונות, דיאגרמה, סיכוי, ממוצע | א–ו |

## איך לקרוא את הטבלה

- **כיתה:** הכיתה שבה הנושא נלמד בבית הספר, לפי מה שמצאנו. אף מסמך ישראלי לא נפתח (רק
  תקצירי חיפוש), ולכן כל כיתה היא הערכה. הסימן שאחריה אומר על מה היא נשענת:
  - **[ת]** מסמך של משרד החינוך (התוכנית החדשה או תוכנית תשס"ו), שנראה רק בתקציר או בקטע
    של תוצאת חיפוש.
  - **[ס]** מקור ישראלי משני: ספר לימוד או אתר מורים, שנראה רק בתקציר. בכיתות א–ג, התגיות האלה
    נשענו על סדרת ספרים בשם "שבילים חדשים", **ששמה לא נמצא** בחיפושים של הסוקר. לכן הן ירדו
    ל-[נ], עד שהבעלים יאשר את שם הסדרה (`pedagogy.md` §3.1, §8.2).
  - **[ב]** סדר בינלאומי בלבד (תוכנית הליבה האמריקאית, אנגליה).
  - **[נ]** ניחוש שלנו.
- **דרישות קודמות:** מיומנויות שבאות קודם. בגרסה הראשונה הן קובעות את סדר הרמות בתוך משחק
  ואת סדר המשחקים. שער אוטומטי יגיע רק עם מתכנן מפגשים, ואז הן יהיו שער (`requires`).
  - **צורה שמכונה יכולה לקרוא:** מזהים מופרדים בפסיק הם דרישות בסיס. דרישה שחלה רק על חלק
    מהרמות כתובה אחרי תנאי בסוגריים מרובעים, על פרמטר של רמה: `[max>20] pv.numeral.read`,
    `[bridge=ten] addsub.facts.bridge-add`, `[op=mul] muldiv.meaning.equal-groups`. כמה תנאים
    מופרדים בנקודה-פסיק.
  - בקוד זה יהיה `requires: { base: [...], when: [{ if: { max: '>20' }, add: [...] }] }`.
- **עומק:** "עומק" אומר שב-`pedagogy.md` (§4) יש לה מבנים, מודלים, רמות, טעויות ועזרה. "מפה"
  אומר שיש לה רק מקום, סדר ומזהה. מחקר עומק ייעשה לפני המשחק הראשון שלה.
  - **"מפה (§8.1 י)":** מיומנות מפה של כיתות א–ב, שהעומק שלה נדחה עד החלטת הבעלים.
  - **"ממתין להחלטת הבעלים (§8.1 ט)":** המיומנות תלויה בקריאה, ולא נכנסת למשחק עד ההחלטה.
- **כללי טעות:** בכל מיומנות עומק, הכללים שמייצרים את התשובות השגויות שלה, בסדר העדיפות. במיומנויות
  מפה של כיתות א–ב מופיעים כללים מועמדים בלבד.

בסך הכול 155 מיומנויות פעילות: 57 בעומק (כיתות א–ב; אחת מהן ממתינה להחלטת הבעלים), 16 של
כיתות א–ב ברמת מפה, ו-82 של כיתה ג ומעלה ברמת מפה.

## הטבלה

| מזהה | תחום | כיתה | שם | דרישות קודמות | ייצוג | עומק | כללי טעות |
|---|---|---|---|---|---|---|---|
| `count.set.how-many` | ספירה | א [ת] | כמה יש | — | חפצים, אחר כך נקודות בשורות של חמש; צלחת ריקה ל-0; נגיעה משאירה סימן בלבד | עומק | `count.skipped-one`, `count.double`, `count.row-only`, `zero.counted-as-one`, `pv.teen-reversed`, `slip.far` |
| `count.set.make` | ספירה | א [ב] | בונים קבוצה | `count.set.how-many` | ערמה וצלחת עם שתי שורות של חמש; כפתור ✓ | עומק | `count.skipped-one`, `count.double`, `zero.counted-as-one`, `slip.far`, `build.other` |
| `count.sequence.next` | ספירה | א–ב [ת] | המספר הבא | `count.set.how-many` | מסלול אבנים ממוספר משמאל לימין, מ-0 | עומק | `seq.before-after`, `seq.decade-ten`, `seq.decade-stay`, `seq.decade-skip`, `pv.reversed` |
| `count.on.continue` | ספירה | א [ת] | ממשיכים לספור, קדימה ואחורה (`dir`) | `count.sequence.next`, `count.set.how-many` | מכסה עם ספרה ועוד חפצים גלויים; חפצים שעפים ומשאירים קו מתאר; קפיצות על המסלול | עומק | `count.start-included`, `given.part`, `slip.near` |
| `count.skip.sequence` | ספירה | א–ב [ב] | ספירה בדילוגים | `count.sequence.next` | קשתות קפיצה שוות; צרורות, כפות ידיים, זוגות נעליים | עומק | `skip.by-ones`, `skip.wrong-step`, `skip.decade-snap`, `skip.end-not-count`, `count.start-included` |
| `num.subitize.patterns` | מושג המספר | א [ב] | רואים בלי לספור | `count.set.how-many` | תבניות קובייה, מסגרת עשר, חמש ועוד בשני צבעים | עומק | `count.row-only`, `count.full-frame`, `count.counted-empty`, `pv.digits-added`, `slip.near` |
| `num.compare.sets` | מושג המספר | א [נ] | איפה יותר | `count.set.how-many` | קוביות זהות על כפות מאזניים; ברמת האשליות, שתי שורות בלי מאזניים; שלוש תשובות | עומק | `compare.spread`, `compare.size`, `compare.flipped`, `compare.level-when-close` |
| `num.compare.numbers` | מושג המספר | א–ב [נ] | מי גדול יותר | `num.compare.sets`, `count.sequence.next`; `[max>20] pv.numeral.read` | מספרים על כפות המאזניים; "תראו לי" בונה מוטות וקוביות | עומק | `compare.ones-digit`, `compare.first-digit`, `compare.same-digits-equal`, `compare.flipped`, `compare.level-when-close` |
| `num.compare.signs` | מושג המספר | א–ב [נ] | גדול, קטן, שווה | `num.compare.numbers` | ביטוי משמאל לימין עם מקום לסימן | עומק | `compare.flipped`, `compare.same-digits-equal`, `compare.ones-digit`, `compare.level-when-close` |
| `num.compare.order` | מושג המספר | א–ב [נ] | מהקטן לגדול | `num.compare.numbers` | כרטיסים לתאים משמאל לימין, ואחר כך יורדים לישר | עומק | `compare.ones-digit`, `compare.descending`, `order.adjacent-swap`, `build.other` |
| `num.order.ordinal` | מושג המספר | א [ת] | מספר סודר | `count.sequence.next` | תור של ילדים משמאל לימין, ודגל על הילד ה-n | מפה (§8.1 י) | מועמדים: `ordinal.other-end` |
| `num.line.locate` | מושג המספר | א–ב [ת] | איפה על הישר | `count.sequence.next`; `[max>20] pv.numeral.read` | ישר המספרים: 0 משמאל, דגלים, זום לעשרת | עומק | `line.from-right`, `line.log`, `line.ones-only`, `line.ticks-as-ones`, `line.snapped-landmark`, `count.start-included`, `pv.reversed`, `line.estimate-off` |
| `num.line.read` | מושג המספר | א–ב [ת] | איזה מספר על הישר | `count.sequence.next` | ישר המספרים עם חץ על שנתה | עומק | `line.from-right`, `line.log`, `line.ones-only`, `line.ticks-as-ones`, `line.snapped-landmark`, `count.start-included`, `pv.reversed` |
| `num.parts.split` | מושג המספר | א [נ] | הרכבי המספר | `count.set.how-many` | קבוצה בשני צבעים במבנה מסגרת עשר; מכסה `?` על חלק | עומק | `given.whole`, `given.part`, `op.other`, `zero.counted-as-one`, `slip.near` |
| `num.parts.make-ten` | מושג המספר | א [נ] | משלימים לעשר | `num.parts.split` | מסגרת עשר | עומק | `given.whole`, `given.part`, `op.other`, `zero.counted-as-one`, `slip.near` |
| `num.parity.even-odd` | מושג המספר | ב [נ] | זוגי ואי-זוגי | `count.skip.sequence`, `num.parts.split` | חפצים בזוגות; ארבעה כרטיסים, ובשאלה סמל של זוג או של בודד | עומק | `parity.tens-digit`, `parity.zero`, `count.skipped-one`, `slip.near` |
| `num.round.nearest` | מושג המספר | ג [נ] | עיגול | `num.line.locate`, `pv.numeral.read` | ישר המספרים | מפה | — |
| `pv.teens.ten-and` | ערך המקום | א [ת] | עשר ועוד | `num.subitize.patterns`, `count.sequence.next` | מסגרת מלאה ועוד; צרור ועוד קשיות | עומק | `pv.teen-reversed`, `pv.digits-added`, `pv.ones-only`, `slip.near` |
| `pv.group.bundle` | ערך המקום | א–ב [ת] | קושרים עשרות | `pv.teens.ten-and`, `count.skip.sequence` | קשיות שנקשרות לצרור של עשר, וצרורות לצרור של מאה | עומק | `pv.digits-added`, `pv.reversed`, `pv.miscount-ten`, `count.skipped-one`, `pv.expanded-concat` |
| `pv.numeral.read` | ערך המקום | א–ב [ת] | קוראים מספר, בכל טווח | `pv.group.bundle` | צרורות, אחר כך מוטות וקוביות, אחר כך ספרות | עומק | `pv.reversed`, `pv.teen-reversed`, `pv.digits-added`, `pv.miscount-ten`, `pv.zero-dropped`, `pv.read-by-position`, `pv.loose-ten-ignored`, `pv.concat-counts`, `pv.expanded-concat` |
| `pv.numeral.build` | ערך המקום | א–ב [ת] | בונים מספר | `pv.numeral.read` | עמודות עשרות ואחדות משמאל לימין, עם כפתורי הוספה והורדה; כפתור ✓ | עומק | `pv.reversed`, `pv.digits-added`, `pv.miscount-ten`, `slip.near`, `build.other` |
| `pv.numeral.digit-value` | ערך המקום | א–ב [ת] | כמה שווה הספרה | `pv.numeral.read` | ספרה מסומנת מעל צרורות וקשיות | עומק | `pv.ten-as-one-object`, `pv.wrong-digit`, `pv.whole-number` |
| `pv.numeral.split` | ערך המקום | א–ב [ת] | מפרקים לעשרות ואחדות | `pv.numeral.read` | תרגיל משמאל לימין, והמודל מתפרק לתוך התאים שלו | עומק | `pv.digits-added`, `pv.expanded-concat`, `pv.reversed`, `pv.loose-ten-ignored`, `slip.near` |
| `pv.numeral.ten-more` | ערך המקום | א–ב [ת] | עוד עשר, עוד אחד | `pv.numeral.read`, `count.skip.sequence` | מוט או קובייה שנוספים; קפיצות של 10 על הישר | עומק | `pv.one-for-ten`, `pv.ten-for-one`, `pv.direction-swapped`, `pv.expanded-concat`, `pv.zero-dropped` |
| `pv.numeral.words` | ערך המקום | ב [נ] | ממילים למספר | `pv.numeral.read` | צירוף מילים מנוקד שנדלק חלק אחרי חלק לתוך טבלת מקום. דורש קריאה | עומק, ממתין להחלטת הבעלים (§8.1 ט) | `pv.expanded-concat`, `pv.zero-dropped`, `pv.teen-reversed`, `pv.reversed` |
| `pv.units.thousands` | ערך המקום | ג [ת] | אלף ורבבה: שמות היחידות והמרות | `pv.numeral.read` | טבלת מקום; עשרה לוחות של מאה הם אלף | מפה | — |
| `pv.units.millions` | ערך המקום | ד [ת] | עד מיליון: שמות היחידות והמרות | `pv.units.thousands` | טבלת מקום | מפה | — |
| `addsub.meaning.change-add` | חיבור וחיסור | א [ת] | הוסיפו | `count.set.how-many` | חפצי סיפור, אחר כך נקודות; מכסה `?` על הנעלם | עומק | `op.other`, `given.whole`, `given.part`, `count.start-included`, `slip.near` |
| `addsub.meaning.change-take` | חיבור וחיסור | א [ת] | לקחו | `count.set.how-many` | כמו הוסיפו; חפץ שהלך משאיר קו מתאר | עומק | `op.other`, `given.whole`, `given.part`, `op.swapped-subtraction`, `count.start-included`, `slip.near` |
| `addsub.meaning.part-whole` | חיבור וחיסור | א [ת] | שני חלקים ושלם | `num.parts.split` | סל עם שני צבעים; מכסה `?` מעל צבע אחד | עומק | `op.other`, `given.whole`, `given.part`, `slip.near` |
| `addsub.meaning.compare` | חיבור וחיסור | א–ב [ב] | השוואה | `num.compare.sets`, `addsub.meaning.change-take` | שתי שורות מחוברות בזוגות; סוגר `?` מעל מה שאין לו זוג; בתמונה בלבד | עומק. רמה 7 (משפט) ממתינה להחלטת הבעלים (§8.1 ט) | `given.larger`, `given.smaller`, `op.other`, `slip.near`; ברמה 7 בלבד, אם תאושר: `keyword.added`, `keyword.inverted` |
| `addsub.meaning.mixed` | חיבור וחיסור | א–ב [נ] | איזה סיפור | `addsub.meaning.change-add`, `addsub.meaning.change-take`, `addsub.meaning.part-whole` | אותו מראה לכל המבנים; המתכנן בוחר את המבנה של כל סיבוב | עומק | `op.other`, `given.whole`, `given.part`, `given.larger`, `given.smaller`, `count.start-included`, `slip.near` |
| `addsub.meaning.match-story` | חיבור וחיסור | א–ב [ת] | מתרגיל לסיפור | `addsub.meaning.change-add`, `addsub.meaning.change-take` | כרטיסי סיפור מצוירים לצד תרגיל | עומק | `story.other-op`, `story.roles`, `story.other-numbers`, `story.result-form` |
| `addsub.meaning.two-step` | חיבור וחיסור | ב–ג [ב] | שני שלבים | `addsub.meaning.mixed` | דורש קריאה: ממתין להחלטת הבעלים (§8.1 ט). עוד לא מתוכנן | מפה | ייקבעו במחקר העומק |
| `addsub.facts.count-on` | חיבור וחיסור | א [ת] | סופרים מהגדול | `count.on.continue`, `eq.props.commutative` | מכסה עם ספרה; קפיצות על הישר | עומק | `count.start-included`, `given.part`, `op.other`, `slip.near` |
| `addsub.facts.think-addition` | חיבור וחיסור | א–ב [ת] | חיסור כהשלמה | `num.parts.split`, `count.on.continue` | קפיצות על הישר מהמחסר אל המחוסר | עומק | `line.landing`, `given.part`, `count.start-included`, `op.other` |
| `addsub.facts.doubles` | חיבור וחיסור | א [נ] | כפולים | `count.set.how-many` | שתי שורות זהות | עומק | `double.neighbor`, `given.part`, `slip.near` |
| `addsub.facts.near-doubles` | חיבור וחיסור | א–ב [ב] | כמעט כפולים | `addsub.facts.doubles` | שתי שורות, והאחד העודף מודגש | עומק | `double.no-adjust`, `op.other`, `slip.far` |
| `addsub.facts.teen` | חיבור וחיסור | א [ת] | בעשרת השנייה | `pv.teens.ten-and`, `num.parts.split` | מסגרת מלאה ועוד מסגרת | עומק | `op.other`, `pv.ones-only`, `pv.teen-reversed`, `slip.near` |
| `addsub.facts.bridge-add` | חיבור וחיסור | א [נ] | חיבור במעבר עשרת | `num.parts.make-ten`, `pv.teens.ten-and` | שתי מסגרות עשר: כל נגיעה במונה מעבירה אותו, עד שהראשונה מלאה | עומק | `bridge.whole-second`, `bridge.leftover-only`, `bridge.stopped-at-ten`, `count.start-included`, `slip.near` |
| `addsub.facts.bridge-sub` | חיבור וחיסור | א–ב [נ] | חיסור במעבר עשרת | `addsub.facts.think-addition`, `addsub.facts.teen` | שתי מסגרות: מורידים את הבודדים, ואחר כך מהעשר | עומק | `bridge.ones-reversed`, `bridge.forgot-ones`, `bridge.stopped-at-ten`, `count.start-included`, `op.other` |
| `addsub.facts.recall` | חיבור וחיסור | א–ב [ב] | עובדות מהזיכרון | `addsub.facts.count-on`, `num.parts.split`; `[max>10] addsub.facts.doubles, addsub.facts.teen, addsub.facts.bridge-add, addsub.facts.bridge-sub` | תרגיל בלבד, כולל עובדות עם 0; "תראו לי את התמונה" נחשב עזרה | עומק | `count.start-included`, `op.other`, `op.swapped-subtraction`, `zero.counted-as-one`, `zero.minus-gives-zero`, `double.no-adjust`, `bridge.whole-second`, `bridge.leftover-only`, `bridge.ones-reversed`, `slip.near` |
| `addsub.multi.whole-tens` | חיבור וחיסור | א [נ] | עשרות שלמות | `pv.numeral.read`, `addsub.facts.recall` | צרורות; קפיצות של 10 | עומק | `pv.tens-as-ones`, `op.other`, `pv.miscount-ten` |
| `addsub.multi.plus-tens` | חיבור וחיסור | ב [נ] | מוסיפים ומורידים עשרות | `addsub.multi.whole-tens`, `pv.numeral.ten-more` | צרורות וקשיות; קפיצות של 10 | עומק | `pv.tens-as-ones`, `pv.miscount-ten`, `op.other` |
| `addsub.multi.one-digit` | חיבור וחיסור | ב [נ] | דו-ספרתי וחד-ספרתי | `pv.numeral.read`, `addsub.facts.recall`; `[bridge=ten] addsub.facts.bridge-add` | צרורות וקשיות; ישר ריק | עומק | `pv.ones-as-tens`, `bridge.stopped-at-ten`, `multi.smaller-from-larger`, `pv.miscount-ten`, `count.start-included` |
| `addsub.multi.two-digit` | חיבור וחיסור | ב [נ] | דו-ספרתי ודו-ספרתי | `addsub.multi.plus-tens`, `addsub.multi.one-digit` | צרורות, אחר כך ישר ריק: קפיצת עשרות ואחר כך אחדות | עומק | `multi.no-carry`, `multi.smaller-from-larger`, `multi.borrow-no-decrement`, `pv.ones-as-tens`, `pv.miscount-ten`, `op.other` |
| `addsub.multi.to-next-ten` | חיבור וחיסור | ב [נ] | השלמה לעשרת הבאה ול-100 | `num.parts.make-ten`, `pv.numeral.read` | ישר ריק עם קפיצה עד העשרת | עומק | `given.whole`, `given.part`, `op.other`, `multi.digits-to-ten`, `slip.near` |
| `addsub.multi.column` | חיבור וחיסור | ב [ת] | חיבור וחיסור במאונך, בכל טווח | `addsub.multi.two-digit`, `pv.group.bundle`; `[max>100] pv.numeral.read` | טורים, אחדות מימין, וצרורות לצד | עומק | `multi.no-carry`, `multi.column-concat`, `multi.smaller-from-larger`, `multi.borrow-no-decrement` |
| `addsub.multi.compensate` | חיבור וחיסור | ב–ג [נ] | מעגלים ומתקנים | `addsub.multi.two-digit` | ישר ריק | מפה | ייקבעו במחקר העומק |
| `addsub.multi.estimate` | חיבור וחיסור | ג–ד [ת] | אומדן | `num.round.nearest`, `addsub.multi.column` | ישר | מפה | — |
| `eq.sign.same-as` | שוויון ותכונות | א [נ] | שווה זה כמו | `num.compare.sets` | מאזניים עם קוביות זהות בשורות של חמש; שלוש ערימות ברמה 1, ארבע אחריה | עומק | `given.part`, `op.other`, `slip.near` |
| `eq.sign.missing` | שוויון ותכונות | א [ב] | המספר החסר | `eq.sign.same-as`, `num.parts.split` | מאזניים עם מכסה `?`, אחר כך תרגיל בלבד | עומק | `given.whole`, `given.part`, `op.other`, `equal.add-all`, `equal.copy`, `zero.counted-as-one`, `count.start-included` |
| `eq.sign.both-sides` | שוויון ותכונות | א–ב [נ] | פעולה בשני הצדדים | `eq.sign.missing` | מאזניים, אחר כך תרגיל | עומק | `equal.add-to-equal`, `equal.add-all`, `equal.copy`, `slip.near` |
| `eq.sign.true-false` | שוויון ותכונות | ב [נ] | איזה נכון | `eq.sign.missing`, `eq.sign.both-sides` | ארבעה כרטיסי תרגיל, והמאזניים כמשוב | עומק | `equal.reject-reversed`, `equal.accepts-chain`, `op.swapped-subtraction`, `slip.card` |
| `eq.sign.relational` | שוויון ותכונות | ב [נ] | שווה בלי לחשב | `eq.sign.both-sides` | מאזניים שקובייה עוברת בהם מצד לצד | עומק | `equal.compensate-wrong`, `equal.add-to-equal`, `equal.copy` |
| `eq.props.commutative` | שוויון ותכונות | א [ב] (`op: add`); ב [נ] (`op: mul`) | הפוך זה אותו דבר | `num.parts.split`; `[op=mul] muldiv.meaning.array` | שורה שמסתובבת; מאזניים. בכפל, מערך שמסתובב | עומק (`op: add`); `op: mul` מפה | `equal.add-to-equal`, `equal.copy`, `equal.add-all` |
| `eq.props.associative` | שוויון ותכונות | א–ב [ב] | שלושה מחוברים | `num.parts.make-ten` | מסגרות עשר | מפה | ייקבעו במחקר העומק |
| `eq.inverse.ops` | שוויון ותכונות | א [ת] (`op: add`); ב–ג [נ] (`op: mul`) | משפחת תרגילים, פעולות הפוכות | `addsub.meaning.part-whole`; `[op=mul] muldiv.meaning.equal-groups` | תמונת חלקים ושלם, אחר כך עץ של שלם ושני חלקים. בכפל, צלחות ותרגילים | עומק (`op: add`); `op: mul` מפה | `given.part`, `given.whole`, `op.other`, `slip.near` |
| `eq.pattern.rule` | שוויון ותכונות | ב [נ] | סדרות | `count.skip.sequence` | שורת מספרים | מפה | ייקבעו במחקר העומק |
| `eq.props.distributive` | שוויון ותכונות | ג [ת] | חוק הפילוג | `muldiv.meaning.array` | מלבן שמתפצל לשניים | מפה | — |
| `eq.order.operations` | שוויון ותכונות | ג–ד [נ] | סדר פעולות | `muldiv.facts.recall`, `addsub.multi.column` | תרגיל | מפה | — |
| `muldiv.share.equal` | כפל וחילוק | ב [נ] | מחלקים בשווה | `count.set.make` | עוגייה אחת בכל נגיעה, לצלחות | עומק | `groups.answered-groups`, `groups.subtracted`, `given.whole`, `slip.near` |
| `muldiv.meaning.equal-groups` | כפל וחילוק | ב [ת] | קבוצות שוות | `count.skip.sequence`, `count.set.make` | צלחות, ובכל צלחת שורות של חמש | עומק | `groups.added`, `groups.answered-groups`, `groups.answered-size`, `groups.one-group-off`, `groups.subtracted`, `groups.unequal`, `groups.swapped` |
| `muldiv.meaning.array` | כפל וחילוק | ב [ת] | שורות וטורים | `muldiv.meaning.equal-groups` | מערך נקודות עם רווח אחרי חמש | עומק | `array.added-sides`, `array.border`, `array.visible-only`, `groups.one-group-off` |
| `muldiv.facts.skip-count` | כפל וחילוק | ב [נ] | עובדות כפל בקפיצות שוות (בכיתה ב, `factor`: 10, 5, 2, 4, 1, 0) | `muldiv.meaning.equal-groups`, `count.skip.sequence` | קפיצות שוות; צלחות; תרגיל | עומק | `groups.added`, `groups.one-group-off`, `mul.zero-one-swap`, `slip.near` |
| `muldiv.facts.divide` | כפל וחילוק | ב–ג [נ] | חילוק בעזרת כפל | `muldiv.facts.skip-count` | תרגיל כפל עם נעלם לצד תרגיל החילוק | עומק | `groups.subtracted`, `groups.one-group-off`, `op.other`, `slip.near` |
| `muldiv.meaning.compare` | כפל וחילוק | ג–ד [ב] | פי | `muldiv.facts.skip-count` | פס ועותקים שלו | מפה | — |
| `muldiv.facts.derived` | כפל וחילוק | ג [נ] | עובדות מעובדה ידועה | `muldiv.facts.skip-count`, `muldiv.meaning.array` | מערך שמתפצל | מפה | — |
| `muldiv.facts.recall` | כפל וחילוק | ג [נ] | לוח הכפל מהזיכרון | `muldiv.facts.derived`, `muldiv.facts.divide` | תרגיל בלבד | מפה | — |
| `muldiv.div.remainder` | כפל וחילוק | ג [נ] | חילוק עם שארית | `muldiv.facts.divide`, `muldiv.share.equal` | צלחות, והשארית בחוץ | מפה | — |
| `muldiv.div.remainder-meaning` | כפל וחילוק | ג–ה [נ] | מה עושים עם השארית | `muldiv.div.remainder` | תמונת מצב ומשפט | מפה | — |
| `muldiv.multi.by-tens` | כפל וחילוק | ג [ת] | כפל בעשרות ובמאות | `muldiv.facts.recall`, `pv.numeral.read` | טבלת מקום שהספרות זזות בה | מפה | — |
| `muldiv.multi.by-one-digit` | כפל וחילוק | ג–ד [ת] | כפל בחד-ספרתי | `muldiv.multi.by-tens`, `eq.props.distributive` | מלבן שטח | מפה | — |
| `muldiv.multi.column` | כפל וחילוק | ד–ה [ת] | כפל במאונך | `muldiv.multi.by-one-digit` | מלבן שטח, ואחר כך טורים | מפה | — |
| `muldiv.div.long` | כפל וחילוק | ד [ת] | חילוק ארוך | `muldiv.div.remainder`, `muldiv.multi.by-one-digit` | חלוקת צרורות | מפה | — |
| `muldiv.div.by-two-digit` | כפל וחילוק | ה [ב] | חילוק במחלק דו-ספרתי | `muldiv.div.long` | טורים | מפה | — |
| `muldiv.multi.estimate` | כפל וחילוק | ד–ה [נ] | אומדן מכפלה ומנה | `muldiv.multi.by-tens`, `num.round.nearest` | ישר עד 1000 ויותר | מפה | — |
| `muldiv.meaning.combinations` | כפל וחילוק | ד–ו [נ] | צירופים | `muldiv.meaning.array` | טבלה של אפשרויות | מפה | — |
| `nt.multiples.factors` | התחלקות | ד [ת] | גורמים וכפולות | `muldiv.facts.recall` | מערכים | מפה | — |
| `nt.divisibility.rules` | התחלקות | ג–ד [ת] | סימני התחלקות | `muldiv.facts.recall` | לוח מספרים | מפה | — |
| `nt.primes.composite` | התחלקות | ד–ה [ת] | ראשוניים ופריקים | `nt.multiples.factors` | מערכים | מפה | — |
| `nt.primes.factorize` | התחלקות | ד–ה [ס] | פירוק לגורמים ראשוניים | `nt.primes.composite` | עץ גורמים | מפה | — |
| `nt.powers.exponents` | התחלקות | ד [ת] | חזקות | `muldiv.facts.recall` | תרגיל | מפה | — |
| `frac.parts.equal-shares` | שברים | ב [ת] | חלקים שווים | `geo.shape.polygons` | עוגות ופסים בחלוקה שווה ולא שווה; ילדים שמקבלים חלק | עומק | `frac.unequal-accepted`, `frac.count-cuts`, `frac.parts-count-off` |
| `frac.unit.of-set` | שברים | ב [ת] | חצי ורבע מקבוצה | `muldiv.share.equal` | קבוצה בשורות שמתחלקת לצלחות | עומק | `frac.answered-denominator`, `given.whole`, `frac.subtracted`, `slip.near` |
| `frac.unit.of-whole` | שברים | ג [ת] | שבר יסודי | `frac.parts.equal-shares` | פס, ישר מ-0 עד 1 | מפה | — |
| `frac.unit.compare` | שברים | ג [ת] | שליש או רבע | `frac.unit.of-whole` | אותה עוגה, אחר כך הישר | מפה | — |
| `frac.nonunit.build` | שברים | ג–ד [ב] | שלושה רבעים | `frac.unit.of-whole` | פס שהיחידה חוזרת בו | מפה | — |
| `frac.line.locate` | שברים | ג–ד [ב] | שבר על הישר | `frac.unit.of-whole`, `num.line.locate` | ישר מ-0 עד 1 ומעבר לו | מפה | — |
| `frac.equiv.names` | שברים | ד–ה [ת] | שברים שווים, צמצום והרחבה | `frac.line.locate`, `frac.nonunit.build` | פסים מיושרים; נקודה אחת עם שני שמות | מפה | — |
| `frac.compare.any` | שברים | ד [ת] | השוואת שברים | `frac.equiv.names`, `frac.unit.compare` | ישר | מפה | — |
| `frac.mixed.numbers` | שברים | ד–ה [ת] | מספר מעורב | `frac.nonunit.build`, `frac.line.locate` | ישר מעבר ל-1 עם פסים שלמים | מפה | — |
| `frac.nonunit.of-set` | שברים | ד [נ] | שבר מכמות | `frac.unit.of-set`, `frac.nonunit.build` | מערך או פס | מפה | — |
| `frac.addsub.like` | שברים | ד–ה [ת] | חיבור וחיסור, מכנה שווה | `frac.nonunit.build` | פסים; קפיצות על הישר | מפה | — |
| `frac.addsub.unlike` | שברים | ה [ת] | חיבור וחיסור, מכנים שונים | `frac.equiv.names`, `nt.multiples.factors` | פסים שמתחלקים ליחידה משותפת | מפה | — |
| `frac.mul.by-whole` | שברים | ו [ת] | שלם כפול שבר | `frac.addsub.like`, `muldiv.facts.recall` | קפיצות חוזרות | מפה | — |
| `frac.mul.fraction` | שברים | ו [ת] | שבר כפול שבר | `frac.mul.by-whole` | מלבן שטח | מפה | — |
| `frac.div.quotient` | שברים | ו [ת] | שבר כמנת חילוק | `muldiv.share.equal`, `frac.unit.of-whole` | חלוקת עוגות | מפה | — |
| `frac.div.fraction` | שברים | ו [ת] | חילוק שברים | `frac.mul.fraction`, `frac.div.quotient` | פס: כמה חלקים נכנסים | מפה | — |
| `dec.place.tenths` | שברים עשרוניים | ה [ת] | עשיריות | `frac.unit.of-whole`, `pv.numeral.read` | פס של 10; מטר בדצימטרים | מפה | — |
| `dec.place.hundredths` | שברים עשרוניים | ה [ת] | מאיות | `dec.place.tenths` | ריבוע 10 על 10; מטר בסנטימטרים | מפה | — |
| `dec.place.thousandths` | שברים עשרוניים | ה [ס] | אלפיות | `dec.place.hundredths` | זום נוסף על הישר | מפה | — |
| `dec.link.fraction` | שברים עשרוניים | ה [ת] | עשרוני ושבר | `dec.place.hundredths`, `frac.equiv.names` | ריבוע וישר עם שני שמות | מפה | — |
| `dec.compare.magnitude` | שברים עשרוניים | ה [ת] | השוואת עשרוניים | `dec.place.hundredths` | ישר עם זום וריבוע 10 על 10 | מפה | — |
| `dec.line.locate` | שברים עשרוניים | ה [ת] | עשרוני על הישר | `dec.place.hundredths`, `num.line.locate` | ישר עם זום | מפה | — |
| `dec.addsub.columns` | שברים עשרוניים | ה–ו [נ] | חיבור וחיסור עשרוניים | `dec.compare.magnitude`, `addsub.multi.column` | טורים מיושרים לפי הנקודה | מפה | — |
| `dec.shift.by-ten` | שברים עשרוניים | ה–ו [ת] | כפל וחילוק ב-10, 100, 1000 | `dec.place.hundredths` | ספרות שזזות סביב נקודה קבועה | מפה | — |
| `dec.round.nearest` | שברים עשרוניים | ה–ו [נ] | עיגול עשרוניים | `dec.line.locate`, `num.round.nearest` | ישר | מפה | — |
| `dec.muldiv.direction` | שברים עשרוניים | ו [ת] | גדל או קטן | `dec.compare.magnitude`, `frac.mul.fraction` | מלבן שטח; ישר | מפה | — |
| `dec.muldiv.compute` | שברים עשרוניים | ו [ת] | כפל וחילוק עשרוניים | `dec.muldiv.direction`, `muldiv.multi.column` | טורים | מפה | — |
| `ratio.percent.meaning` | יחס ואחוזים | ו [ת] | אחוז מתוך 100 | `dec.place.hundredths`, `frac.equiv.names` | ריבוע 10 על 10; פס עם סולם אחוזים | מפה | — |
| `ratio.percent.benchmark` | יחס ואחוזים | ו [ת] | 50%, 25%, 10% | `ratio.percent.meaning` | פס עם אחוז, שבר ועשרוני | מפה | — |
| `ratio.percent.of-quantity` | יחס ואחוזים | ו [ת] | אחוז מכמות | `ratio.percent.benchmark`, `frac.nonunit.of-set` | ישר כפול | מפה | — |
| `ratio.percent.change` | יחס ואחוזים | ו [נ] | הנחה והתייקרות | `ratio.percent.of-quantity` | פס. דורש קריאה: ממתין להחלטת הבעלים (§8.1 ט) | מפה | — |
| `ratio.meaning.compare` | יחס ואחוזים | ו [ת] | איזה מיץ חזק יותר | `muldiv.facts.recall` | כוסות מיץ ומים | מפה | — |
| `ratio.meaning.equivalent` | יחס ואחוזים | ו [ת] | יחסים שווים | `ratio.meaning.compare` | טבלת יחס מצוירת; ישר כפול | מפה | — |
| `ratio.meaning.part-whole` | יחס ואחוזים | ו [ת] | יחס ושבר מהכול | `ratio.meaning.equivalent`, `frac.equiv.names` | פס בשני צבעים | מפה | — |
| `ratio.scale.map` | יחס ואחוזים | ו [ת] | קנה מידה | `ratio.meaning.equivalent` | מפה על רשת | מפה | — |
| `ratio.rate.unit` | יחס ואחוזים | ו–ז [נ] | מחיר ליחידה ומהירות | `ratio.meaning.equivalent` | ישר כפול. דורש קריאה: ממתין להחלטת הבעלים (§8.1 ט) | מפה | — |
| `int.meaning.negative` | מספרים מכוונים | ז [ת] | מספרים שליליים (שמור) | `num.line.locate` | ישר משני צדי 0 | מפה | — |
| `geo.shape.polygons` | גאומטריה | א [ת] | מצולעים | — | צורות בכיוונים ובפרופורציות שונים | מפה (§8.1 י) | מועמדים: `shape.prototype`, `shape.open-accepted` |
| `geo.shape.attributes` | גאומטריה | ב [ת] | צלעות וקודקודים | `geo.shape.polygons` | צורות; נגיעה בכל צלע או קודקוד | מפה (§8.1 י) | מועמדים: `shape.prototype` |
| `geo.solid.parts` | גאומטריה | ב [נ] | פאות, מקצועות, קודקודים | `geo.shape.attributes` | גוף מכמה מבטים | מפה (§8.1 י) | מועמדים: `solid.visible-only` |
| `geo.triangle.classify` | גאומטריה | ב–ג [נ] | סוגי משולשים | `geo.shape.attributes` | משולשים בכיוונים שונים | מפה (§8.1 י) | ייקבעו במחקר העומק |
| `geo.lines.relations` | גאומטריה | ג–ד [ת] | ישרים מקבילים ומאונכים | `geo.shape.attributes` | זוגות קווים בזוויות שונות | מפה | — |
| `geo.quad.classify` | גאומטריה | ג–ה [ת] | מרובעים | `geo.lines.relations`, `meas.angle.classify` | "געו בכל המלבנים" | מפה | — |
| `geo.symmetry.line` | גאומטריה | ג–ד [נ] | ציר סימטריה | `geo.shape.attributes` | קיפול כמשוב | מפה | — |
| `geo.solid.nets` | גאומטריה | ה–ו [נ] | פריסות | `geo.solid.parts` | קיפול כמשוב | מפה | — |
| `geo.circle.parts` | גאומטריה | ו [ס] | רדיוס וקוטר | `geo.shape.polygons` | מעגל | מפה | — |
| `geo.coord.plane` | גאומטריה | ו–ז [נ] | מערכת צירים | `num.line.locate` | רשת | מפה | — |
| `meas.length.compare` | מדידות | א [ת] | משווים אורכים | — | שני חפצים, ישירות ובעזרת חפץ מתווך | מפה (§8.1 י) | ייקבעו במחקר העומק |
| `meas.length.units` | מדידות | א–ב [ת] | מודדים ביחידות | `meas.length.compare` | סרגל מצויר; מטר עם זום | מפה (§8.1 י) | מועמדים: `ruler.end-reading`, `ruler.count-marks` |
| `meas.time.clock` | מדידות | ב [ת] | שעון מחוגים: שעה וחצי שעה | `count.skip.sequence`, `frac.parts.equal-shares` | שעון מחוגים (תוכן, לא שעון עצר; R10) | מפה (§8.1 י) | מועמדים: `clock.hands-swapped`, `clock.next-hour` |
| `meas.time.elapsed` | מדידות | ג [נ] | משך זמן | `meas.time.clock` | ציר זמן | מפה | — |
| `meas.money.coins` | מדידות | א–ב [נ] | מטבעות | `pv.numeral.read` | מטבעות שקל (תוכן, לא פרס; R10) | מפה (§8.1 י) | מועמדים: `coin.count-not-value` |
| `meas.volume.compare` | מדידות | ב [ת] | משווים נפחים ומבני קוביות | `count.set.how-many` | כלים; מבני קוביות | מפה (§8.1 י) | מועמדים: `volume.visible-faces` |
| `meas.mass.units` | מדידות | ג [ת] | משקל | `pv.numeral.read` | מאזני מחוג | מפה | — |
| `meas.capacity.units` | מדידות | ג [ת] | נפח בליטרים | `pv.numeral.read` | כד עם סולם | מפה | — |
| `meas.area.units` | מדידות | ג [נ] | שטח ביחידות | `muldiv.meaning.array` | רשת; אריחים בנגיעה | מפה | — |
| `meas.perimeter.units` | מדידות | ג–ד [נ] | היקף | `meas.length.units`, `addsub.multi.two-digit` | גדר סביב אריחים | מפה | — |
| `meas.area.vs-perimeter` | מדידות | ד [נ] | שטח מול היקף | `meas.area.units`, `meas.perimeter.units` | אריחים וגדר | מפה | — |
| `meas.area.rectangle` | מדידות | ד [נ] | שטח מלבן | `meas.area.units`, `muldiv.facts.recall` | מערך שהופך למלבן | מפה | — |
| `meas.area.composite` | מדידות | ד–ה [נ] | שטח צורה מורכבת | `meas.area.rectangle` | צורת ר שמתפצלת | מפה | — |
| `meas.area.parallelogram` | מדידות | ה [ס] | שטח מקבילית | `meas.area.rectangle` | גזירה והזזה | מפה | — |
| `meas.area.triangle` | מדידות | ה [ס] | שטח משולש | `meas.area.parallelogram` | חצי מקבילית | מפה | — |
| `meas.angle.compare` | מדידות | ג [נ] | איזו זווית גדולה | `geo.shape.attributes` | זוויות עם שוקיים באורכים שונים | מפה | — |
| `meas.angle.classify` | מדידות | ג–ד [נ] | חדה, ישרה, קהה | `meas.angle.compare` | פינת דף לבדיקה | מפה | — |
| `meas.angle.measure` | מדידות | ד–ה [נ] | מד זווית | `meas.angle.classify` | מד זווית מצויר | מפה | — |
| `meas.angle.triangle-sum` | מדידות | ה [נ] | סכום הזוויות במשולש | `meas.angle.measure`, `geo.triangle.classify` | קריעת הפינות | מפה | — |
| `meas.volume.cubes` | מדידות | ה [נ] | נפח בקוביות | `meas.volume.compare`, `muldiv.meaning.array` | קופסה ושכבות | מפה | — |
| `meas.volume.box` | מדידות | ה–ו [ס] | נפח תיבה | `meas.volume.cubes`, `muldiv.facts.recall` | שכבות | מפה | — |
| `data.picto.read` | נתונים | א [ת] | קוראים גרף תמונות | `count.set.how-many` | גרף תמונות עם סמלים אחידים | מפה (§8.1 י) | מועמדים: `graph.counted-pictures` |
| `data.bar.read` | נתונים | ב–ד [ת] | קוראים דיאגרמת עמודות | `num.compare.numbers` | עמודות בלי ציורים בתוכן | מפה (§8.1 י) | ייקבעו במחקר העומק |
| `data.chance.compare` | נתונים | ד [ת] | סיכוי | `frac.unit.compare` | שקיות כדורים | מפה | — |
| `data.mean.average` | נתונים | ה–ו [נ] | ממוצע | `muldiv.div.long` | עמודות שמתיישרות | מפה | — |
