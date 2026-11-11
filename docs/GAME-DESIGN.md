# Stard battles: what to build next

The plan for making battles fun, fair and worth coming back to. The 3D arena is built (`src/components/battle/three/`). Everything below is rules and screens, in the order to build.

## What is wrong today

- **No choices that matter.** The instant battle plays itself. A real match has four actions, and the dice are public, so the best move is arithmetic.
- **Stars decide the winner.** Level comes from stars and every stat scales with level. A 90k-star repo beats anything.
- **Cards feel the same.** Moves, weakness and resistance come from the language family alone, so five TypeScript repos are one card five times.
- **Nothing to collect.** A team is whatever is pinned. Starring a repo changes nothing.
- **Playing needs `npx`.** The demo can only watch.

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
- **Card art.** In the app a card shows the repo's creature (done). The SVG cards the Worker serves for READMEs still show the owner's avatar: they need a flat drawing of the same creature, made from the same name, words and colours.

### 4. A team you collect: one ace and three draws

- A team is four cards. **One ace** the player picks (profile top four or pinned repos). **Three drawn from their stars** each day.
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
