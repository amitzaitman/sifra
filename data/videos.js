// The parents page (architecture 3.10), by hand from docs/parents-videos.md; tests/sync.test.js
// checks the URLs against the doc.
//
// UNVERIFIED: these links come from a Gemini summary and nobody has opened them yet. The owner
// opens every link, checks it is the right video for a parent watching with a child, and only
// then sets VERIFIED to true. Until then home shows no link to the parents page.

export const VERIFIED = false;

/** @type {{ title: string, videos: { label: string, who: string, url: string }[] }[]} */
export const TOPICS = [
  {
    title: 'כְּלָלִי',
    videos: [
      { label: 'מָה וְלָמָּה', who: 'לַהוֹרִים', url: 'https://www.youtube.com/watch?v=jfJafa_-n6A' },
      { label: 'לָמָּה הַמָּתֵמָטִיקָה מוֹעִילָה', who: 'לַהוֹרִים', url: 'https://www.youtube.com/watch?v=QYEY_C2oSmM' },
      { label: 'לָמָּה הַמָּתֵמָטִיקָה מוֹעִילָה', who: 'לַיְלָדִים', url: 'https://www.youtube.com/watch?v=pgS6SjVSyMc' },
      { label: 'לָמָּה הַמָּתֵמָטִיקָה קָשָׁה', who: 'לַהוֹרִים', url: 'https://www.youtube.com/watch?v=uTBK3tQN9Nk' },
    ],
  },
  {
    title: 'מִסְפָּרִים',
    videos: [
      { label: 'מִסְפָּרִים', who: 'לַהוֹרִים', url: 'https://www.youtube.com/watch?v=kAkHnxhGL5w' },
      { label: 'מִסְפָּרִים', who: 'לַיְלָדִים', url: 'https://www.youtube.com/watch?v=cahwzZocE1Q' },
    ],
  },
  {
    title: 'מַשְׁמָעוּת הַחִבּוּר וְהַחִסּוּר',
    videos: [
      { label: 'מַשְׁמָעוּת הַפְּעֻלּוֹת', who: 'לַהוֹרִים', url: 'https://www.youtube.com/watch?v=SILwSkuSU1Q' },
      { label: 'סִפּוּרִים חֶשְׁבּוֹנִיִּים', who: 'לַיְלָדִים', url: 'https://www.youtube.com/watch?v=ZCj6St4A9i8' },
    ],
  },
  {
    title: 'בְּעֵרֶךְ',
    videos: [
      { label: 'לָמָּה בְּעֵרֶךְ חָשׁוּב', who: 'לַהוֹרִים', url: 'https://www.youtube.com/watch?v=-LUQ2kE0xd8' },
      { label: 'בְּעֵרֶךְ', who: 'לַיְלָדִים', url: 'https://www.youtube.com/watch?v=wO_ZpkBYk9A' },
    ],
  },
  {
    title: 'חִלּוּק',
    videos: [
      { label: 'שְׁנֵי סוּגִים שֶׁל חִלּוּק', who: 'לַהוֹרִים', url: 'https://www.youtube.com/watch?v=xjVzpfaJZgY' },
      { label: 'מָה זֶה חִלּוּק', who: 'לַיְלָדִים', url: 'https://www.youtube.com/watch?v=S6W5JkpJUFs' },
    ],
  },
  {
    title: 'חִלּוּף בְּכֶפֶל',
    videos: [
      { label: 'לָמָּה 3 פְּעָמִים 2', who: 'לַיְלָדִים', url: 'https://www.youtube.com/watch?v=gLIYeshONmY' },
      { label: 'מָה קַל יוֹתֵר לְחַשֵּׁב', who: 'לַיְלָדִים', url: 'https://www.youtube.com/watch?v=5nzj48YcVRQ' },
    ],
  },
  {
    title: 'לוּחַ הַכֶּפֶל',
    videos: [{ label: 'לוּחַ הַכֶּפֶל', who: 'לַהוֹרִים', url: 'https://www.youtube.com/watch?v=WJEOvJqNf6o' }],
  },
  {
    title: 'שְׁבָרִים',
    videos: [
      { label: 'שְׁבָרִים', who: 'לַהוֹרִים', url: 'https://www.youtube.com/watch?v=rN-wswBet-4' },
      { label: 'חִלּוּק וּשְׁבָרִים', who: 'לַיְלָדִים', url: 'https://www.youtube.com/watch?v=Cn0wtrgh1mc' },
      { label: 'כַּמָּה זֶה שְׁלִישׁ מִשֵּׁשׁ', who: 'לַיְלָדִים', url: 'https://www.youtube.com/watch?v=80Bz3rfRsbk' },
    ],
  },
  {
    title: 'חִלּוּק בְּאֶפֶס',
    videos: [{ label: 'חִלּוּק בְּאֶפֶס', who: 'לַיְלָדִים', url: 'https://www.youtube.com/watch?v=rK66BFWDnoE' }],
  },
];
