# Stard battles: what to build next

The plan for making battles fun, fair and worth coming back to. The 3D arena is built (`src/components/battle/three/`). Everything below is rules and screens, in the order to build.

## What is wrong today

- **No choices that matter.** The instant battle plays itself. A real match has four actions, and the dice are public, so the best move is arithmetic.
- **Stars decide the winner.** Level comes from stars and every stat scales with level. A 90k-star repo beats anything.
- **Cards feel the same.** Moves, weakness and resistance come from the language family alone, so five TypeScript repos are one card five times.
- **Nothing to collect.** A team is whatever is pinned. Starring a repo changes nothing.
- **Playing needs `npx`.** The demo can only watch.

## Open decision: turns or a run

Decided 2026-11-11: the run. A friend's point: picking a move each turn is an old format, and the instant battle in the demo is something people watch, not play. The alternative is an auto-battler run, the format of Super Auto Pets, Backpack Battles and The Bazaar.

**What those games do**

- The player builds between fights and the fight plays out with no input. All choices are in the build: what to take, what order to stand in, what to combine.
- Nobody waits for an opponent. Each fight is against a team another player saved at the same round of their own run. Super Auto Pets: "The multiplayer is asynchronous so you aren't rushed or put under a time commitment."
- A run is short and ends: Super Auto Pets runs to 10 wins or out of lives.
- Teamfight Tactics' own review of a set: the game is best with many workable teams, never add a rule that limits which cards go together, and give variety through a one-of-three pick (augments) with a reroll. https://teamfighttactics.leagueoflegends.com/en-us/news/dev/dev-teamfight-tactics-dragonlands-learnings/

**How a Stard run would work**

1. Start with the ace.
2. Each round, a shop shows three repos from the player's stars. Take one, or reroll once. This is the variable reward: someone with 2,000 stars never sees the same shop twice.
3. Put the team in order, front to back. Order decides who is hit first and who a card's trait helps.
4. The fight plays in the 3D arena with no input, 20 to 30 seconds, against a saved team from another player at the same round.
5. After rounds 2 and 4, pick one of three boosts.
6. The run ends at 5 wins or 3 losses. About five minutes.

- **Sets.** Cards that share a language or a topic give a bonus at 2 and at 3 (three TypeScript cards, two `cli` cards). Types become sets. No rule ever forbids a mix.
- **Saved teams.** A finished round is saved as a signed snapshot: the cards with their numbers frozen, the order, the boosts. A fight is worked out from two snapshots and a seed, so anyone can replay a fight and get the same result even after the repos change.
- **Challenge a person.** A challenge link fights that person's latest saved team. No waiting for a reply.
- **Demo.** Playable with no login: type a username, draft from that account's public stars, fight saved teams. Well-known accounts are seeded so the first visitor has opponents.

**What this replaces**

- Change 5 (sealed moves, both players posting each turn, paste-to-play) is not needed. The hardest part of the plan goes away.
- The 50-move pool shrinks to one ability per card that fires by a rule ("start of fight", "when hit", "when a teammate faints").
- Kept: stat budget by rarity, critical hits, conditions, shiny, the ace, the arena.

**Cost**

- The player no longer chooses during a fight. One option in between: one call per fight (when to fire the ace's big move).
- A match against a friend is two saved teams meeting, not a live back-and-forth.

## The five changes

### 1. Play against the computer in the demo (build first)

Type two usernames, then play your team against theirs, choosing every move. The other side is a simple bot. No GitHub, no sign-in, nothing stored. This is where people find out whether the game is fun, so the rules below get tuned here before they reach a GitHub thread.

- Bot: picks the move with the best expected damage 70% of the time, a random legal move otherwise. Switches out of a bad matchup when its card is above half HP.
- The instant auto-battle stays as "Watch", for the README result card.

### 2. Fair cards: one stat budget, shaped by the repo

Stars set a card's rarity and almost nothing else.

| Rarity | Stars | Stat budget |
|---|---|---|
| Common | under 100 | 400 |
| Uncommon | 100 to 999 | 415 |
| Rare | 1k to 9,999 | 430 |
| Epic | 10k to 99,999 | 445 |
| Legendary | 100k and up | 460 |

The budget is split across HP, attack, defense and speed by the repo's shape, each as a share of the four signals:

- HP: contributors (log scale).
- Attack: commits in the last year.
- Defense: issue close rate and age.
- Speed: days since the last push and release count.

Every stat gets at least 15% of the budget and at most 40%. A legendary is 15% stronger than a common; a type advantage is 50%. A well-kept small repo beats a neglected big one, which is the result people will screenshot.

**Test that must pass:** over 2,000 bot-vs-bot matches between random teams from a fixture of 200 real repos, the team with more total stars wins 45% to 60% of the time, and the side that moves first wins 47% to 53%.

### 3. Cards that differ

- **Two types.** The main language sets the first, the second-largest language (over 20% of the code) sets the second.
- **Four moves per card**, drawn by the repo's name from the pool below, so the same repo always has the same four and two repos in one language rarely share more than one:
  - one strike from its first type's four;
  - one strike from its second type's four, or a second from the first type when it has one type;
  - one move from a repo fact the repo qualifies for;
  - one support move.

#### The move pool (about 50 moves)

Today there are 6 everyday moves (one per type) and 7 specials, which is why every TypeScript card says Hot Reload.

Strikes, four per type. In each row the first is plain, the second is weaker and moves first, the third is stronger and misses one time in five, the fourth is weak and leaves a condition.

| Type | Plain | Quick | Heavy | Condition |
|---|---|---|---|---|
| Systems | Bare Metal | Syscall | Segfault | Memory Leak (Deprecated) |
| Scripts | Pipe Chain | One-Liner | `rm -rf` | Cron Storm (Rate limited) |
| Web | Hot Reload | Prefetch | Bundle Bloat | Hydration Error (Flaky) |
| Apps | Push Alert | Deep Link | Forced Update | Permission Prompt (Rate limited) |
| Data | Batch Job | Cache Hit | Full Table Scan | Bad Join (Merge conflict) |
| Docs | Read the Docs | Quick Start | Wall of Text | Outdated Example (Flaky) |

Moves from repo facts. A card can only draw one it qualifies for.

| Move | Needs | Does |
|---|---|---|
| Ship It | 10 or more releases | Strong hit, then the card rests a turn |
| Review Swarm | over 50 contributors | Hits two to four times |
| Legacy Code | older than 8 years | Weak hit, lowers the target's speed |
| Star Storm | rare or higher | Hits harder the more stars the user has given out |
| Fork Bomb | over 500 forks | Hits every card on the other team for a little |
| Commit Barrage | over 500 commits last year | Three hits, each stronger than the last |
| Issue Sweep | closes over 80% of issues | Hit, and clears the card's own condition |
| Hotfix | pushed in the last 7 days | Moves first, stronger when the card is under half HP |
| Bus Factor | one maintainer | Big hit, costs the card 20% of its HP |
| Breaking Change | major version 2 or higher | Big hit, lowers the card's own defense |
| Force Push | default branch not protected | Removes the target's raised stats |
| Monorepo Slam | over 3 languages | Hits harder the more HP the card has |
| Dependabot | has dependency updates on | Small hit every turn for 3 turns |
| Archive | archived repo | Target can't use its last move again for 2 turns |

Support moves. No damage.

| Move | Does |
|---|---|
| Refactor | Raises attack |
| Add Tests | Raises defense |
| Green Build | Heals a quarter of HP |
| Code Freeze | Halves the next hit taken |
| Rebase | Clears the card's own condition and lowered stats |
| Cache Warm | Raises speed |
| Open Issue | Lowers the target's defense |
| Request Changes | The target can't use a support move for 3 turns |
| Squash | Switches out, and the card coming in takes half damage that turn |
| Good First Issue | The next card to come in has raised attack |
- **Conditions**, one per card at a time:
  - *Merge conflict*: one move in three hits the card itself. Lasts 3 turns.
  - *Rate limited*: the card moves last. Lasts 3 turns.
  - *Deprecated*: loses an eighth of its HP each turn until switched out.
  - *Flaky*: moves miss one time in four. Lasts 3 turns.
- **One trait per card** from its standout fact: *Zero Dependencies* (immune to Deprecated), *Well Documented* (immune to Flaky), *Monorepo* (more HP, less speed), *Fork* (copies the first move used against it).
- **Shiny.** Repos owned by `armanckeser` are shiny for everyone: a foil card and 5% more of every stat. A player's own repo gets a "home" mark and no stat bonus.
- **Card art.** A card's art is the first picture in the repo's README that shows the project: a screenshot or a logo, never a badge, an avatar, a tiny icon or a GIF over 1 MB (`worker/src/art.ts`). The Worker fetches and redraws the picture, so a visitor's browser never asks the README's image hosts. In the app the art fills the card's frame with the creature in its corner; the README cards show the art in the avatar's place. With no picture that fits, the app card shows the creature and the README card the owner's avatar, which still needs a flat drawing of the creature. On the board the creature stays.

### 4. A team you collect: one ace and three draws

- A team is four cards. **One ace** the player picks (profile top four or pinned repos). **Three drawn from their stars** each day.
- Built: the ace and three daily draws, and both teams cut to the size of the smaller one, so nobody plays five cards against two. Not built: drawing five and keeping three.
- **Nobody gives up their README to play.** Every part of a profile (character, top four, reviews, each List) can be copied by itself into a README the person already has. The game reads the character and the ace from a repo called `stard` first and the profile repo second, so someone who wants their profile README untouched keeps the cards in `stard`.
- Each day five are drawn and the player keeps three. Starring a repo adds it to tomorrow's draw, so starring is collecting.
- A team is fixed when a match starts and stays fixed for that match.
- The daily draw is the reason to come back: "Today's pull" on the Battle screen, with rarity shown.

### 5. Both players move at once, and a critical is a surprise

Taking turns with public dice leaves nothing to guess. In each turn both players choose in secret, then both moves are shown together and the faster card goes first.

- **Sealed moves.** The page asks the Worker to seal a choice. The Worker encrypts it with its key and returns a short comment to post. The Worker opens a turn's two seals only when both are on the GitHub thread. Nothing is stored.
- **Each seal records the comments that existed when it was made.** A sealed move that later goes missing was deleted by its author, and that author forfeits. This closes the hole where a losing host deletes a move to void the match.
- **Dice come from both seals plus the thread id**, so neither player can know them before both have moved, and anyone can check them after. Critical: 1 in 12, 1.5× damage. Damage varies 85% to 100%.
- **Play without `npx`.** The page gives the sealed comment and a link to the GitHub thread; the player pastes one comment per turn. GitHub says who wrote it. The `npx` version posts the same comment for them.
- **Where matches live.** A `Battles` category in this repo's Discussions, opened from a pre-filled link. One place to list matches, rank players and watch; neither player owns the thread, so neither can delete the other's comments. If the notifications bother people watching the repo, matches move to a separate repo.

## Coming back

- **Cue:** GitHub's notification that it is your turn, and the daily pull.
- **Record:** wins, losses and streak on the trainer card in the README, counted from the Battles threads.
- **Ladder:** the Battle screen's top 50 by wins this season (a calendar month).
- **Share:** the result card already exists. Add the upset line when a lower-rarity team wins: "4 commons beat react".

## The look

Built:

- A floor of contribution-graph tiles that ripples when a hit lands.
- Each repo is a creature: its name picks one of six bodies and the details, its language picks the colour, its type picks the trim. Bigger repos are bigger. Shiny ones sparkle.
- Each player's character stands behind their creature, built from the same choices as the README trainer card. The character throws a card and the creature comes out of it.
- Attacks lunge, specials charge and fire, a critical holds the frame and shakes the camera, a knocked-out creature falls and bursts.

Next, in order of what a viewer notices:

1. A move's animation by its type (six) instead of two for everything.
2. A marker over a creature for each condition.
3. Sound: hit, critical, knock-out, card throw. Off until the first tap.
4. The camera cuts to the attacker for a special.
5. The winner's character and creature in a closing shot, used for the result card image.

## Order of work

1. Play against the computer, with today's rules.
2. Stat budget and the balance test.
3. Four moves, two types, conditions, traits.
4. One ace and three draws; shiny rule; card art.
5. Sealed simultaneous moves and paste-to-play, in the chosen arena repo.
6. Record, ladder, upset line.

## Everything else that came up

Ideas and open items from the design conversations that the sections above don't cover. None of these is scheduled.

**Creatures and cards**

- Take the creature's colours, or a picture it carries, from the image at the top of the repo's README. Needs the Worker to fetch the README and the image.
- A flat SVG drawing of each creature, so the cards served for READMEs (top four, list, battle result) show creatures too.
- More bodies than six, and more things to carry than nine. Each new word list makes more repos look like themselves.
- Creatures that change with level: a small, a middle and a large form at star milestones.
- A card back and a pack-opening moment for the daily pull.

**Characters**

- Character level from followers and own stars exists; let it unlock looks (hats, jackets) and not strength.
- Class perks are small stat bumps today. Give each class one thing it can do in a match instead (a Scout sees one of the other team's draws, an Archivist can field archived repos at full strength).
- The 3D character in the builder, turning as the choices change.

**Matches**

- Chat from the GitHub thread already shows beside a match. Show it as bubbles over the characters in the arena.
- Spectators: a "watching" count and reactions from thread reactions.
- A turn notice inside the app. Today GitHub's own notification is the only one.
- Best of three, and a rematch button that opens the next thread.
- Organizations can't play: only users have a profile repo and pinned repos.
- Tournaments: a bracket in one Discussion, each round a thread.

**The arena**

- Seen on a Pixel: Chrome dropped the WebGL context. The scene now restarts lighter; not yet confirmed fixed on the phone.
- Arenas by type: a server room for systems, a terminal for scripts, and so on, picked by the home team's ace.
- A replay that can be recorded as a short video for sharing.

**Growth**

- The loop: a README card links to the profile or battle, which invites the visitor to make theirs.
- Starring is collecting, and `armanckeser` repos are the shiny pulls: the game itself asks for stars.
- "Battle me" badge for READMEs that opens a challenge against the owner.
- Daily draft DMs to creators (20 a day, sent by hand) are running; a creator-vs-creator battle link is the hook to try in them.
- Rename the repo to `stard`. The npm package and image names need a release with it, since provenance checks the repo address.

**Known gaps**

- A deep link to `/compose` answers with a 404 status before the app loads.
- Two real accounts have not played a whole match.
- A real README trainer card has not been read by the game end to end.

### Added 2026-11-11

- **Freeze the facts at the start.** A battle's opening state should hold everything the result depends on: each card's numbers, and the character and ace read from the README at that moment. Today the signed opening post holds both teams; the README text and the repo facts behind the numbers are not stored. With that stored, a result can always be recomputed, whatever changes on GitHub later.
- **`armanckeser` repos are shiny for everyone.** Built: shiny is the owner `armanckeser`, and a player's own repo shows a "home" mark.
- **After a game, one quiet line:** star the Stard repo, and a share button with the versus picture. No popup, nothing blocking the rematch button.
- **Finding players.** People with many stars get the most from the game (bigger shop, more cards). Find them through GitHub, then send a link to a ready-made battle with their own username in it. Each message is drafted and Armanc sends.
- **How to say what Stard is.** "Finally give your stars a use." "Starring repos always felt like collecting. Now the collection plays."
- **No Pokemon name.** The name is a trademark of Nintendo, Creatures and Game Freak. Not in the product, the README or any post. "Creature battle" and "card battle" say enough.

### Added 2026-11-11, after the board was built

- Built: the Play screen (`/run`), one 3D board, a docked shop with gold, placing by drag, all-at-once fights. Tasks 1 to 11 in `docs/AGENT-TASKS.md` are what is left.
- **Ideas not yet tasks.** Two of the same card combine into a stronger one (needs duplicates, which stars don't give; could be "two cards by the same owner"). Item drops between rounds. A daily board everyone plays with the same shop, with a leaderboard. Spectating a friend's run from a link. Sound.
- **Card look.** The card face (HP top right, two moves, weakness and resistance along the bottom) follows the layout of trading card games in general. Before a big push, change the face so the layout reads as Stard's own: the contribution-graph backdrop is ours, the move rows and the weakness line are the borrowed parts.
- **Real accounts as opponents.** Names and avatars come from public profiles. Keep a visible list and a way out (Task 11).
