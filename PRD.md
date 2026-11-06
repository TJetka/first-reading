# PRD · Czytam po kawałku

A Polish reading-practice app for a six-year-old who is starting to blend syllables into words.

| Decision | Specification |
| --- | --- |
| Deliverable | A static web app in [TJetka/first-reading](https://github.com/TJetka/first-reading), published to GitHub Pages. |
| Expected project URL | `https://tjetka.github.io/first-reading/` |
| Learner | A child who recognises some letters, understands the words when spoken, and needs time to sound them out. |
| Core interaction | See one word, try reading aloud, tap any syllable for help, then listen to the whole word and decide whether to repeat or move on. |
| Language | All child-facing text, instructions, accessible labels, encouragement and audio are in Polish. |
| Launch content | 500 proposed words in eight everyday topics. Each has one to three syllables and belongs to one of two difficulty levels. |

**Project files.** This PRD owns the learner experience and release criteria. Edit words and syllable boundaries in [word-catalogue.json](./word-catalogue.json). Use [BUILD.md](./BUILD.md) for the implementation sequence, audio preparation, local testing and GitHub Pages deployment.

## 1. What a successful round feels like

A child taps **Start** and sees **kot**. They can try reading it immediately. Later, when **malina** appears, they see three large, closely spaced tiles: **ma · li · na**. They tap the middle tile and hear only *li*. They can tap it again, try the whole word aloud, and then tap **Sprawdź**. The tiles join visually into **malina** and one voice says the complete word at a natural pace. **Powtórz** lets them try the same word again. **Super** takes them to the next word. Only the child decides when to move on.

**Success criterion.** After an adult demonstrates one word, the child can find syllable help, check a word, retry it, and advance independently. A round counts words the child chose to finish. The app makes no claim about reading accuracy. Keep scoring, timers, speech recognition, streaks and accounts outside v1.

## 2. What the child sees and hears

| Screen or state | What appears | What happens |
| --- | --- | --- |
| **Home** | Title **Czytam po kawałku**, two level choices **Proste słowa** and **Trudniejsze słowa**, one large **Start** button. | First visit selects **Proste słowa**. A parent or child can change it before starting. **Start** draws a round and opens word 1 silently. |
| **Read** | Progress such as **6 z 12**, one word split into tappable syllables, a speaker cue and **Sprawdź**. First card includes the short hint **Dotknij sylaby, żeby jej posłuchać.** | Tap any tile in any order to hear that syllable. Highlight only the playing tile. The child can check immediately or after any number of taps. |
| **Check** | The same word, now joined and centred in the same position. | Tapping **Sprawdź** stops any syllable audio and immediately starts the whole-word clip. On successful playback completion, reveal **Powtórz** (circular arrow) and **Super** (forward arrow). |
| **Retry or advance** | Two clearly distinct choices. | **Powtórz** restores the split word silently, at the same index. **Super** opens the next word silently, or finishes the round after word 12. |
| **Finished** | A small celebration, **Brawo! 12 słów za Tobą!**, **Jeszcze raz** and **Na start**. | **Jeszcze raz** draws a fresh round at the same level. **Na start** returns to level selection. |

Provide a quiet home icon during a round. An intentional exit asks **Zakończyć rundę?**, with **Czytaj dalej** and **Zakończ**. Returning to the round restores the same card. Ending the round clears its word list. Reloading returns to Home in v1. Level changes apply at the start of a new round.

## 3. Word bank and difficulty

Use [word-catalogue.json](./word-catalogue.json) as the starting inventory. The ship criterion is **200–500 unique, reviewed Polish words**, with enough approved words in every level and length bucket to support the draw. The proposed bank has the following distribution.

| Level | One syllable | Two syllables | Three syllables | Total |
| --- | ---: | ---: | ---: | ---: |
| Proste słowa | 80 | 110 | 60 | 250 |
| Trudniejsze słowa | 80 | 110 | 60 | 250 |
| **Total** | **160** | **220** | **120** | **500** |

**Proste słowa.** Use familiar words with basic letter patterns, such as *kot*, *mama* and *malina*. For this level, exclude the spellings reserved for the second level below. Ordinary consonant groups such as *kr* in *kret* are allowed. Syllable count determines the order of practice within each level.

**Trudniejsze słowa.** Use familiar words that each contain at least one of these features:

| Feature | Scope for v1 | Examples from the bank |
| --- | --- | --- |
| Polish digraphs | `ch`, `cz`, `dz`, `dź`, `dż`, `rz`, `sz` | *chleb, czapka, dzwonek, dźwig, dżem, rzeka, szafa* |
| Marked letters and h | `ą`, `ć`, `ę`, `ł`, `ń`, `ó`, `ś`, `ź`, `ż`, and `h` | *wąż, nić, ręka, płot, koń, sól, miś, łódź, żaba, huśtawka* |
| Soft spellings and the role of i | `ci`, `si`, `zi`, `ni`, `dzi`, or `i` before another vowel in the selected word | *ciocia, misiek, buzia, świnia, dzik, pies* |

The two levels have separate pools. A three-syllable word such as *malina* fits the first level, and a one-syllable word such as *dżem* fits the second. Categories describe meaning and are editorial metadata in v1. The child chooses only the level.

**Editorial rules.** Choose things, people and actions a Polish-speaking six-year-old can recognise in conversation. Inflected forms are acceptable when natural on their own. Use lowercase Polish spelling with all diacritics. Exclude proper names, abbreviations and phrases. Have a native Polish-speaking early-years educator or equivalent reviewer approve each word for familiarity and its displayed syllable boundaries. Replace doubtful entries with familiar words from the same level and length bucket.

Store syllables explicitly. Joining their spellings must reconstruct the word exactly. Keep a digraph that represents one sound together. A written *i* does not always form a syllable: *pies* has one, *cia-sto* has two, and *je-zio-ro* has three. Counting vowel letters or applying a line-break algorithm will give incorrect teaching prompts. Where several divisions are acceptable, use one educator-approved division consistently across text and audio. [Polish teaching reference on the role of i (ZPE)](https://zpe.gov.pl/a/wsrod-liter-glosek-i-sylab/D1411aqT6)

## 4. How Start selects the 12 words

1. Filter to published entries at the selected level. Partition them by the length of their approved syllable array.
2. Independently shuffle each bucket with an unbiased shuffle. Take 5 distinct one-syllable words, 5 distinct two-syllable words and 2 distinct three-syllable words.
3. Present the blocks in ascending order of length. Randomise within a block. A word can reappear in a future round.
4. Freeze the 12 IDs and their order until the round ends. **Powtórz** never changes the list or increments the counter. Only **Super** increments it, once per card.
5. Reject a release if either level has insufficient eligible words for any bucket. If deployed data cannot form a round, stay on Home and offer **Nie udało się wczytać słów. Spróbuj ponownie.** Never fill the gap by borrowing from another level.

| Positions | Count | Example draw at **Proste słowa** |
| --- | ---: | --- |
| 1–5 | 5 | kot, dom, las, sok, rak |
| 6–10 | 5 | ma-ma, ry-ba, wo-da, ro-wer, ba-lon |
| 11–12 | 2 | ma-li-na, pa-pu-ga |

## 5. Polish audio is a release requirement

**Ship reviewed audio files with the app.** Use one clear, friendly Polish voice at a comfortable pace. Record the clips or render them ahead of time and have a native Polish speaker approve the exact files that will ship. A child must be able to use the app on a device with no Polish system voice installed. Serve these assets from the same Pages site.

| Action | Audio contract |
| --- | --- |
| Tap **fa** in **sza · fa** | Play only *fa*, pronounced as the syllable in that word. Keep the initial sound and ending intact. No letter names, surrounding syllables, full word or spoken instruction in the clip. |
| Tap the only tile in **kot** | Play *kot*. The syllable and the full word coincide, so both controls may reference the same approved recording. |
| Tap **Sprawdź** on **szafa** | Play *szafa* once, naturally stressed and spoken as a single word. Use a whole-word recording, never a sequence of tile clips. |
| Tap several tiles quickly | The latest deliberate tap wins. Stop prior playback and clear its highlight. Ignore stale completion events when the child retries, changes cards or exits. |
| A clip fails to load or play | Keep the card and counter. Show a speaker icon with **Spróbuj ponownie**, retry the failed clip on tap and keep the Home control available. Do not silently count a failed check as completed. |

Reference syllable clips by **word and position**. Reuse an asset across words only after checking that its pronunciation is appropriate in both contexts. Match loudness across clips. Listen for added vowels, clipped consonants, spelling out letter groups, or pauses inside the continuous word. Store the source and permission to redistribute each audio set. Load the app shell and first card promptly on mobile; fetch clips for the current and next word rather than downloading the entire bank at startup.

## 6. Visual and interaction design

- Give the word most of the screen. Use large lowercase type with clear Polish glyphs, a plain background and ample white space. Use two or three cheerful accent colours for syllable boundaries and buttons. Also separate tiles with spacing and an outline so the boundary is visible without colour.
- Keep the tiles close enough to read left-to-right as one word. Never wrap a word between lines. Fit the longest entry on a 320 CSS-pixel viewport at default zoom without clipping or horizontal scrolling. Adapt the layout for landscape phones, tablets and desktop.
- Aim for 64 px letter height on a tablet where space allows. Give every tile and action a minimum 48 × 48 CSS-pixel target. Pair **Start** with a play triangle and **Sprawdź** with a speaker icon. On the first card, a small hand cue may point to a tile. Keep **Sprawdź** and **Super** in a predictable primary-action position. Use an icon and text together for the key actions.
- Keep art away from the reading line. If using a mascot, let it greet the child on Home and celebrate at the end. A picture of the target object before **Sprawdź** would give away the word.
- Use native buttons, visible keyboard focus, logical tab order and Enter/Space activation. Set the page language to Polish. Give a tile an accessible label such as **Posłuchaj sylaby „sza”**. Announce the new position once per word; keep help available without automatic speech. Respect reduced motion. Avoid background music.

## 7. Delivery requirements

Publish a static app at the repository’s GitHub Pages project URL. Keep the round on the device, in memory. Ship only reviewed words and playable, approved Polish audio. The app must work without an account, microphone, analytics or an external speech service. A release passes the automated and on-device checks below. The build guide defines how to run them.

## 8. Acceptance and rollout

| Gate | Evidence required for v1 |
| --- | --- |
| **Content** | Validate every record and list counts per level, syllable count and topic. A Polish-speaking reviewer signs off the actual word divisions and playback of every syllable in context and every whole word. |
| **Draw** | For each level, exercise at least 1,000 seeded draws. Every draw has 12 distinct IDs, the exact 5/5/2 composition, ascending length blocks and correct difficulty. Different seeds produce variation. |
| **Child flow** | Start → tap a syllable twice → **Sprawdź** → **Powtórz** returns to the identical card. **Sprawdź** → **Super** advances exactly once, including under rapid double taps. Card 12 ends the round. A new round starts at 1. |
| **Audio** | Verify actual playback on iPhone Safari, Android Chrome and one desktop browser. Test a device without Polish system speech, a missing clip, switching tiles mid-sound, and leaving while audio is playing. |
| **Usability** | After a one-word demonstration, observe the learner use help on a multi-syllable word, check it, retry and advance without the adult pointing. If two controls are confused, adjust their placement or labels and try again. |
| **Deployment** | Open the public Pages URL in a fresh browser. Refresh it, start both levels, and check all static asset requests resolve under the repository path. Complete one full round on mobile. |
