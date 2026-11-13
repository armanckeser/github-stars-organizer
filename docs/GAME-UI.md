# Stard game UI

Rules for every Play screen: the shop, Drafts, Archive, the checks, the boost pick, the fight overlays and the result. They come from Teamfight Tactics' shop bar, which is the reference the owner picked, retold in Stard's own world. A rule that makes a screen look worse is wrong. Change the rule, not just the screen.

## 0. Read the creature at a glance

A player picks cards for a synergy or a need by looking at the creature, and opens the card face for the details. So every rule a player plans around (role, sets, type, cost) gets one visible part of the creature, the same part on every creature. The mapping is in `docs/GAME-DESIGN.md`, "Added 2026-11-12". Built so far: the body's silhouette is the role (each role has its own three bodies), and the sash across the body is the cost.

## 1. The game owns the screen

- Play is full screen. The app sidebar and header are hidden, and a small exit button sits in the top-left corner.
- The 3D board is the backdrop for everything. Panels sit on it, so they are never cards floating on a black page.

## 2. One material

- **Slate:** a near-black blue-green (`#0e1418` to `#131b20`), matte. Every panel, bar and button is slate.
- **Gold trim:** a single 1px line (`#c9a45c`, about 70% opacity) on the outer edge of a panel only. It never goes around inner elements: buttons, chips and rows get no borders.
- **The gold plaque:** one trapezoid on the top edge of the shop bar that holds the gold count. It is the only ornament.
- No gradients on panels. Shade comes from the 3D light and from one soft drop shadow under a panel.

## 3. Color has one meaning each

| Color | Means | Used on |
|---|---|---|
| Tier: grey `#8b949e`, green `#3fb950`, blue `#4a90d9`, purple `#a371f7`, gold `#e3b341` | The card's cost, which is its rarity (1 to 5 gold) | The card's 2px border, a tint on its name strip, the cost gem, and the lit squares of the creature's sash. Nowhere else. |
| Empty square `#ebedf0` | A cost the card doesn't reach | The sash's unlit squares, GitHub's empty contribution square |
| The language's own color | The repo's language | The creature's body |
| Type color | The card's type | The creature's trim |
| Coin gold `#f2c94c` | Gold you own or spend | The coin icon and gold numbers |
| Green / red | Your side / their side | Board halves, HP bars |
| Check green / amber ring | A set is live / pending | The checks list only |

Language and type colors appear only on the creature: language is its body, type its trim, tier its sash. No panel, text or chip uses them. Set colors are not used in the game UI: a set is shown by its icon and its name.

**The sash** is a white band across the creature with five squares in the GitHub contribution graph's style, as many lit as the card costs. A flat-fronted body (a block or a book) wears its five on its front and again on its back. A round body wears two rows on the flank its sash rises to, one 45° round from the front and one 45° from the back, smaller on a small body so the two don't meet: the board's camera sees the other team's front row and your own team's back row, and a card's three-quarter view sees the front row whole. Its band sits as high under the face as the face allows, so the ball over it hides as little as it can from the camera over the Drafts shelf. The wisp's face fills its head's middle, so it wears its band round its brow, lying back on the head. The flat sticker draws the squares that face its viewer, and leaves out one turned nearly edge-on.

## 4. The shop card (the TFT anatomy)

```
┌──────────────── 2px tier border ─┐
│                                  │
│      creature, filling the card  │  art area, about 72% of the height
│ ⬡ TypeScript                     │  sets: hex icon + name, stacked, bottom-left over the art
│ ⬡ Database  2                    │  number = the count a buy would reach, only when it advances a set
├──────────────────────────────────┤
│ gh-next                   ● 2    │  name strip: slate tinted 30% with the tier color; name left, coin + cost right
└──────────────────────────────────┘
```

- **Art:** a lit portrait. The creature turns a three-quarter view, its head just under the top edge and its body running on under the name strip, filling about 90% of the art's height, its center about 66% across. The creature gets the board's own light at the board's strength, with no tone mapping, so its colors on the card are its colors on the board (within about 5% lightness): a warm key from the top left, a white fill from the front, and a cool rim from behind right that parts the silhouette from the wall. The rim is drawn on the ink outline, on the card only: the outline turns the rim's blue (`#9fc4ff`) where it faces the rim and stays ink elsewhere. The brightness comes from the wall: slate (`#2a343b`), lit by a lamp hidden behind the creature that throws a pool behind the head (about 45% lightness) and falls off to the dark slate (about 20%) at the corners. The art averages about 90% of TFT's lightness. The wall is lit in 3D, not painted with a CSS gradient. No shadows on the wall: a cast shadow reads as a second, dark creature. No frame inside the border. A fade from 70% slate at the left edge to clear at 45% keeps the set text readable. No tier or creature color in the backdrop. The creature's true colors come before matching TFT's average brightness: the wall carries the brightness, never the creature.
- **Sets:** white text, 10.5px at weight 500, with a 1px dark shadow, beside a 15px dark hex holding a white glyph. At most 2, each set once. Full names, printed over the creature's body as TFT prints traits over its champion's; a name ends in an ellipsis only 8px from the card's right edge. The left fade and the text shadow keep them readable. The crop keeps the face clear of the set lines. The "would reach" number is the only colored text on a card, in check green.
- **Narrow cards:** a card under 120px wide (a phone) shows the hexes and the "would reach" number, without set names.
- **Can't afford:** keep the colors, dim to 55% and dim the cost to red. Never grey out to black.
- **On hover or tap:** the card face opens (ability, numbers, set bonuses). That text lives there and only there.

## 5. The shop bar

Left to right:
1. **Reroll** and **+ Slot**: two tall slate buttons, each with an icon tile on the right and its cost under the label.
2. **The 5 cards.**
3. **Fight**: the only filled button on the screen (Stard green), 60% of the cards' height and level with their bottom edge. At full card height it outweighed the cards. On an upright phone, where it sits beside Reroll and Slot under the cards, it takes their height instead.

The bar folds down under the gold plaque. It opens at the start of each round and folds while a boost is being picked. The camera fits the board to whatever space the bar leaves.

## 6. The world objects

- **Drafts:** a shelf of tiles along your edge of the board. Bought creatures stand on it.
- **Archive:** a lidded box at the right end of your shelf. Drop a card on it to sell. The refund shows beside the held card. On an upright phone it is drawn at 72% size so it fits beside the shelf.
- **Trainers** (the profile characters) stand at their own Drafts shelf's left end. The opponent's trainer stands at theirs. On an upright phone each trainer steps out past the shelf's corner, toward the middle, so the screen edge never cuts them.
- **The floor around the board** is calm: desaturated, no brighter than 35% of the board's green, and darker toward the far edges. The board and the shelves are the brightest things in the scene. Fog is set from the camera's distance, so a phone's farther camera never dims the board.
- No world object has a label longer than one word. Its use is shown by its shape and by a glow while a card is held.

## 7. Checks (the set tracker)

- The checks sit at the left edge of the board, with no panel.
- One row per set: a status icon, the name, and have/next (`2/3`).
- Live sets come first. Sets at 1 show too, dimmed.
- The bonus text shows on hover only.
- The opponent's checks sit on the right under the opponent's GitHub login, never a word like "Theirs".
- A folded list shows its live sets and the one closest to going live: at least 2 rows, at most 3, then "+n more", which opens the rest. The opponent's list is always folded, so it never covers their trainer and never reads as empty. On a phone (under 640px wide, or under 540px tall) the player's own list folds too: 7 cards can make 14 sets, which would cover the board.

## 8. Boost pick

- Three medallions over the dimmed board. Each is enamel in a brass ring, with one glyph.
- Each boost has its own enamel color, taken from a fixed list of 12, and no two boosts on offer share one.
- Medallion size comes from the short side of the screen: `min(200px, 34vh, 24vw)`. The pick fits a 390px-tall screen with 16px margins.
- Under each medallion: the name and the full text, never cut off. Up to 3 lines, the text as wide as the medallion plus 24px.
- Under 560px wide the three stack as rows: an 88px medallion on the left, the name and full text on the right, 12px apart.
- "See the board" peeks at the board without closing the pick. Its button sits clear of every HP bar.

## 9. Fight overlays

What fired is drawn on the board, not written. One look per effect kind, so every ability, set bonus and boost that shares a kind shares its look, and a player learns five looks, not forty. Each kind is one file in `src/components/battle/three/effects/`; `/fx.html?play=<id>` in `npm run dev` plays any one alone.

- **Something fired:** a gold ring opens on the floor around the caster and it gives a small squash. Its name shows over the HP bar as one small gold word in capitals for under a second. No card, no "Trigger → effect" line: the card face and hover text explain it.
- **Damage:** white. Something travels from the caster to each target (shards, a slam, a burst), then the target squashes and the number stamps, white, gold on a critical hit.
- **A hit:** a melee card draws back before it lunges; a ranged card rocks back as it throws. The target is shoved a little away, squashes and springs back through a small stretch, and its number pops on, then rises. The HP it lost stays white on the bar for a quarter second, then drains. A hit that faints its target holds the fight still for 60 ms, and the creature tips back before it shrinks.
- **Shield:** pale blue-white. A see-through bubble wraps the creature and stays while the shield lasts; the HP bar gains a pale segment after the HP, which shrinks as hits take it.
- **Heal:** green, the green of the "+n" numbers. Light rises from the floor under the creature with a few rising plus signs.
- **Stat:** gold chevrons rise for a stat going up, red chevrons fall for one going down, with a ring at the feet.
- **Condition:** an orb in the condition's own colour travels to the target, which then wears the badge as before.
- Effects are short (under 0.6 s, a shield's bubble aside), additive light, and never cover an HP bar. With reduced motion nothing travels, spins or shakes: the result, numbers included, shows in place and fades.
- Nothing overlaps an HP bar.

## 10. Type and words

- Clash Display (the app's display face, loaded at 500 to 700) for names, numbers, titles and short labels. Space Grotesk for sentences. Nothing else. Play must not change the app's fonts: they are set in `src/index.css` for every screen.
- On screen at rest: names, counts and costs only. Sentences live in the card face, hover text and the boost pick.
- Motion is short and physical: a lift on pickup, a settle on drop, the lid opening. Respect `prefers-reduced-motion`.

## Changed from the first draft

Each change below is a rule that made the screen look worse as first written.

| Rule | First draft | Now | Why |
|---|---|---|---|
| Name strip tint | 15% tier color | 30% | At 15% a green or blue strip read as plain slate, so the cost had no color beyond the gem. |
| Sets per card | 3 | 2 | Three set rows covered most of the creature. |
| Set text | unspecified, 18px hex | 10.5px / 500, 15px hex | At 18px the hex outweighed its name, and the set text competed with the creature. |
| Card art floor | a board tile | a lit slate wall, no floor | The board's green checker behind every creature made five cards read as one green stripe. A full-body creature on near-black then read as small and dark beside TFT's lit portraits. |
| Card exposure | brighter than the board | the board's light | Raising the creature's exposure to reach TFT's brightness washed peach to pale pink and cyan to white. The wall carries the brightness instead. |
| Set line width | capped at 52% of the card | full, to 8px from the edge | At 52% most names were cut to six letters. Over the body, not the face, they read fine, as TFT's traits do. |
| Narrow cards | same as wide | hexes only under 120px | A phone card has no room for set names beside the creature; the hex and the number still say what a buy advances. |
| Boost text | one line | full text, up to 3 lines; rows under 560px | One line cut most boost texts off mid-word. A phone has no room for three medallions side by side. |
| Medallion size | unspecified | from the short side | A landscape phone is 390px tall: medallions sized from the width pushed the text off the screen. |
| Opponent's checks | live sets only, under "Theirs" | folded to at least 2 rows, under their login | With no live set the list was a bare "Theirs 0/6" and read as broken on a phone; "Theirs" named nobody. |
| Ability pop | "When hit" | "Hit", name plus a grey line | "When" adds width and no meaning on a card shown for 1 s. The ability's name tells you which unit fired. |
| Archive, trainers on phone | the same spots as wide | 72% Archive, trainers stepped in | An upright phone's narrow view cut off the trainers and pushed the Archive over the shelf. |
| Card rim light | a light from behind right | the same light, plus a blue outline on the rim side | Toon bands rounded the back light down to nothing, and a box's edges have no surface turned toward it. The outline shows the rim without lighting the body. |
| Card wall pool | faint, narrow | brighter and wider, to about 45% behind the head | The cards averaged 83 against TFT's 90. A brighter wall closes the gap without changing the creature's colors. |
| Tier color | the card's border, name strip and cost gem | also the creature's sash | On the board a card is only its creature, so its cost didn't show anywhere a player looks while placing. |
| Language and type colors | not used in the game UI | the creature's body and trim | They were already the creature's colors; the rule now says so and keeps them off the panels. |
| Sash squares on a round body | front and back, low on the waist | two rows on the raised flank, 45° off the front and the back | The bulge of a round body hid a low row from the board's camera. One row on the flank showed only to the other team's side: from behind your own creatures it was a sliver or nothing. |
| The wisp's sash | round its neck, under its head | round its brow | Its head hid a band under it from every camera above, and its face, on the head's middle, leaves no room for one across it. |
