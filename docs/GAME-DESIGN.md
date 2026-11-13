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

- **Sets.** Cards of one family (Systems, Scripts, Web, Apps, Data, Docs, from the language) or that share a topic give a bonus at 2 and a bigger one at 4. No rule ever forbids a mix. See "The sets" below.
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
- **Card art.** In the app a card shows the repo's creature (done). The SVG cards the Worker serves for READMEs still show the owner's avatar: they need a flat drawing of the same creature, made from the same name, words and colours.

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
- Each repo is a creature: in a run, its role picks one of four body families (three bodies each) and words in its name pick one body of that family; outside a run (the one-on-one battle) its words pick from all twelve. Its language picks the colour, its type the trim, its cost the lit squares of its sash. Bigger repos are bigger. Shiny ones sparkle.
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

## The sets

A card has one family, from its language (its type), and up to two of its repo's topics. Each family does one thing no other set does. Every topic does the same plain thing, so a topic never hides a rule. A set gives its bonus to the cards that share it, at 2 cards and, bigger, at 4. Code: `server/run/sets.ts`. Held to its band by `server/run/set-strength.test.ts`.

| Set | Languages | Name | At 2 cards, each of them | At 4 cards, each of them | Wins gained at 2 / 4 |
|---|---|---|---|---|---|
| Systems | Rust, C, C++, Go, Zig, Haskell, Elixir ... | Extra hit | Every third hit adds another hit of 25%. | ... of 30%. | +10.5 / +19.9 |
| Scripts | Shell, Ruby, PHP, Lua, Perl, Nix ... | Opening hit | As the fight starts, hits every enemy for 25% of a hit. | ... for 28%. | +12.5 / +22.9 |
| Web | TypeScript, JavaScript, HTML, CSS, Vue ... | Shield | Starts each fight with a shield of 5% of its HP. | ... of 8%. | +12.1 / +20.6 |
| Apps | Swift, Kotlin, Java, C#, Dart ... | Guard | Each hit it takes adds 4% guard. | ... 7%. | +10.0 / +23.4 |
| Data | Python, Jupyter Notebook, R, Julia ... | Critical | Lands a critical hit on 16% of its hits, not 6%. | ... on 21%. | +10.7 / +24.5 |
| Docs | no language, or one the game doesn't know | Heal | Every third hit heals it 2.5% of its HP. | ... 5%. | +12.0 / +22.9 |
| Any topic two cards share | | Faster | Acts 7% more often. | ... 9%. | +11.0 / +22.1 |

"Wins gained" is win-rate points, the same fights with and without the bonus, on the test fixture's 200 repos: 4 cards a side for the 2-card bonus, 5 for the 4-card one. The band is +8 to +14 at 2 and +18 to +26 at 4. Fights are close, so about 2 HP is one point: the amounts look small and still count. On the 12 opponents' and the owner's real pools (297 cards) every cell is in the band but Docs at 4 (+12.5): real Docs repos are weak cards, and no heal tried lifted four of them past +17. Re-measure: `node scripts/balance/strength.ts`.

**Why these rules (measured 2026-11-13 on the real pools)**

- **Six families, no language sets.** The 20 language sets and 6 type sets gave bonuses from 0 points (JavaScript's speed, CLI's speed, the Scripts type) to +38 (PHP) at 2 cards, and many said the same thing (three were "more guard", three "more speed").
- **One topic bonus.** Topics are long-tail: the 276 different repos in those pools carry 292 topics, 233 of them different, and the 6 common ones are 7% of them. 128 repos have no topic. On the owner's 5-card boards a shared topic is live 0.21 times, a common one 0.04 times, so named topic bonuses would almost never be seen. A topic on one card is not a check and is not listed.
- **Tiers 2 and 4.** On the owner's 5-card boards, 47% have 3 cards of one family and 9% have 4 (21% at 6 cards). On the opponents' boards it is 81% and 48%. At 2 and 3 nearly every board reaches the top tier, so it is no goal; at 4 it is one to build toward.

**Checks list:** every family on the board (each is live or one card from live) and every topic two cards share; live ones first. Owner boards show 1.8 rows at 2 cards, 3.2 at 5 and 3.6 at 6 (10.6 at 5 before).

## Everything else that came up

Ideas and open items from the design conversations that the sections above don't cover. None of these is scheduled.

**Creatures and cards**

- Take the creature's colours, or a picture it carries, from the image at the top of the repo's README. Needs the Worker to fetch the README and the image.
- A flat SVG drawing of each creature, so the cards served for READMEs (top four, list, battle result) show creatures too.
- More things to carry than nine. Twelve bodies now (branch `creature-look-bodies`); each new word list makes more repos look like themselves.
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

### Added 2026-11-12, the owner's feedback on the Play run

Everything the owner said while the Play run was built, in one place. Status: **built** (on main), **branch** (built, not merged yet), **open** (decided, not built), **idea** (not decided).

**The principle: read the creature at a glance (role and cost: branch `creature-look-bodies`; sets: open)**

> "If I am going for a synergy I should be able to just look at the monster and kind of understand if that's one I might want to add ... I can read further in by pressing the card."

> Asked again on 2026-11-12, about combining copies: "I am still unclear on what lets me tell if a card is ranged vs not, what colors mean etc." Today range shows only as the role chip on the card face (data, docs and scripts repos are Ranged), and the creature shows the language colour and the type trim, which nothing explains.

- Stard makes its own rules, so the look must follow them. Every rule a player plans around gets one visible part of the creature. The details stay in the card face.
- Today the creature mostly shows words from the repo's name, which mean nothing in a fight. Role, sets and cost don't show at all, and type shows only through colour.
- **Decided 2026-11-12 (build after #71, #77 and creator cards):**
  - Body shape = role: Tank golem, Bruiser critter, Assassin bird, Ranged wisp, orb or tome.
  - Body colour = the language's own colour, with no random shift.
  - The emblem over the head = the topic set's icon, the same one as in the card's hex.
  - Trim = type. Gold foil = creator card.
  - Cost = a thin ring at the creature's feet in the tier colour (grey to gold), the card border's colour. Changed 2026-11-12 from "size = cost": every creature keeps one size, so size stays free for star levels if copies ever combine (TFT grows a unit when it stars up).
- Owner, 2026-11-12: the cost mark should feel "more GitHub" than a ring, sash or tattoo. And the creatures are "cute but maybe a bit repetitive". Measured on the 12 opponents' live pools: 236 cards, 6 bodies, 18 body-and-top looks, golem 26%. Body = role would cut that to 4 silhouettes. Open: show the role another way (a held prop), and add bodies.
- **Decided 2026-11-12 (supersedes body = role and the cost ring):**
  - Body family per role: each role gets its own 2 to 3 bodies (8 to 12 in all), so the silhouette says the role and the creatures stop repeating. **Branch `creature-look-bodies`:** 12 bodies, 3 per role. Tank (wide and low): golem, turtle, warden. Bruiser (upright, with fists): critter, brawler, rhino. Assassin (small and sharp): bird, fox, imp. Ranged (floating): wisp, orb, tome. Words in the name pick one within the role, else a seeded draw.
  - Cost = a contribution sash: a sash with 5 commit-graph squares, as many lit as the card costs, in the tier colour. Reads by count and by colour. **Branch `creature-look-bodies`:** on the 3D model and the flat sticker, both drawn from one list of parts (`server/creature-parts.ts`). White band, GitHub's empty square `#ebedf0` for the unlit ones (GAME-UI §3).
- A balance study across real repos is optional. The owner thinks it is likely not needed.
- **2026-11-12: build it before Sunday's launch**, right after the never-empty shop.

**Cards and rules**

| Feedback | Status |
|---|---|
| Sell every card. Only Fight needs at least one card on the board. | branch `sell-every-card` |
| Names people know: Melee and Ranged, plus a role from stats (Tank, Bruiser, Assassin, Ranged). | branch `sell-every-card` |
| Set lines say the effect plainly ("At 2: ...", "No bonus: mixed types"), not "Footnotes with 2". | branch `sell-every-card` |
| Every `armanckeser` repo is a creator card: legendary, 5 gold, the 460 budget (× 1.05 shiny). "github-stars-organizer" is a 1-gold common today; creator cards are the reason to star them. | branch `sell-every-card` |
| Hovering a check (yours or theirs) names the board's cards in that set, beside the bonus. | branch `sell-every-card` |
| Keep the bench, even though Stard cards never combine. | built |
| The shop is never empty, even after rerolls. Today the shop is the player's pool of up to 21 cards minus the ones held, so an account with few stars and repos gets fewer than 5 cards, and an account with one card gets none. Fill a short pool from popular repos on GitHub, only if they are balanced: the owner worries popular repos are too strong. | built (#92): a few from each star band (2 to 5 gold) |
| A friend's idea: buying the same repo three times combines it into a stronger one, as in TFT. Today each repo is in the pool once, so copies never meet. | idea |
| Every run on one day dealt the same shops, rerolls and opponents (the seed was username + date). Free play: a new seed every run, and a pool of about 40 stars. | open, decided 2026-11-12 |
| A daily mode next to free play: everyone gets the same deck (the day's popular repos), the same shops and opponents, and a result line to share. "Daily only means something if everyone gets the same draw." | idea, after the launch numbers |
| Sets from language and topics, shown on shop tiles. "The current system sounds good." | built |
| A round's fight runs 18 to 29 s. Keep it. | built |
| "Do they even matter then?" about the checks. Measured: speed did nothing at all. Each wait between hits was rounded to whole ticks, so every real card (speed 100 to 138) waited 10 ticks, and the speed stat and the three speed bonuses changed no fight. Waits now keep their fractions. | branch `sets-speed-fix` (#100) |
| "The checks are very meh, they all have the same bonuses almost? ... there are soooo many types." 20 language sets and 6 type sets, several saying the same thing, from 0 to +38 win points. Now six families from the language, each with one thing it does, and one plain bonus for any topic two cards share, at 2 and 4 cards, each worth +8 to +14 points at 2 and +18 to +26 at 4. See "The sets". | branch `sets-redesign` (#104) |
| "Claude-code: No bonus: mixed types. I have no idea what types are, what mixing them means, what the bonuses would be." The line is gone: a shared topic always gives its bonus, and each set line names the family or topic, what it does and the count ("Web: Shield 2/4"). The checks list shows what each row does, and only families and the topics two cards share (3.2 rows on a 5-card board, 10.6 before). | branch `sets-redesign` (#104) |
| Owner on 2026-11-13, shown the sets before and after: merge both and deploy. Docs at 4 cards measures +12.5 on real pools against about +20 for the other families; the owner chose to ship it as it is and look again after playing. | approved, `sets-redesign` (#104) |
| A resent run token can retry a round. Accepted for now. | built |
| "Beating the first guy is pretty hard right now." A player's ace and one bought card met the opponent's ace and a free pick, which often cost more than the 4 starting gold buys: a greedy player won round 1 about 40% of the time (15% against torvalds). First built as the ace alone: two cards against one won 100%, and the owner asked for "winnable, still a fight", about 70%, no opponent under about 50% or over about 90%. Now round 1's opponent fields its ace and free pick with 385 stat points each (`OPENING_STAT_POINTS`; a common has 400), HP above the floor shrunk with the rest and guard nudged after rounding, so every card keeps its role and body. With the six-family sets (#104), over 2,000 round 1s of armanckeser's live pool (`scripts/balance/boards.ts`'s two buyers): buying the priciest card 43% on main, 67% now (48% kentcdodds to 85% sindresorhus); buying for live checks 55% on main, 75% now (57% kentcdodds to 90% rauchg). The 7 other pools tried as the player: 44% (sindresorhus) to 94% (torvalds). No rule tried met both bounds: what is left of the spread is the aces' roles and abilities. A run against a saved team link keeps round 1 at full strength, so the board matches what that team fought. | branch `round1-ace-only` (#98) |

**Look**

| Feedback | Status |
|---|---|
| TFT is the reference. Copy the simplicity of the lightning demos (TFT, Super Auto Pets, Balatro, Backpack Battles). Look at how the popular games solve a screen before designing it. | rule (`docs/GAME-UI.md`) |
| The first shop, bench and boost pick "look AI designed". Pills are tasteless. GitHub as a place (checks, Drafts, Archive) is the world, done with restraint. | built |
| Rules must lead to a nice-looking game: change the rule, not just the screen. | rule (`docs/GAME-UI.md`) |
| Shop cards: no borders inside, no gradient background, attributes shown as TFT shows them. | built |
| Trainers stand next to their own Drafts shelf. | built |
| "Play a run" sounds meh: say "Play Stard" everywhere (share pictures, README badge, team page button, team preview). | built (#77) |
| Share pictures show creatures (flat stickers), fill the set hexes, title only. README GIF ends on the new end screen. | built (#71, #77) |
| Front page: a normal-size Play button beside the title, no sample-account button. | built |
| Characters for the 12 opponents: ship all 12 (and `armanckeser`), kind and plain (hair, glasses, top, colours; no beards or anything that could read as a caricature), drawn from their public avatars. Removal path in `OPPONENTS.md` and `characters/README.md`: their own `stard/character.md` wins, or ask and the file is deleted. An opted-out account (`stard/no-play` or the block list) never shows the file. One line on the privacy page, pending the owner's wording. | branch `characters` (#72) |
| "My character is supposed to have a bun." And the owner's near-black jacket (`#1f2328`) sat close to the Rookie panel (`#3a4049`) on the trainer card and vanished into the board's floor. `characters/armanckeser.md`: hair `bun`, jacket denim `#2f5a94`, which stands apart from all 7 class panels and the board. Oxblood `#7a2e3b` and olive `#556b2f` were the other two shown; the owner chose denim on 2026-11-13. The bun reads as a small bump from the board's camera; the owner left its size as is. | branch `owner-bun` (#101) |
| A white star patch on each upper arm of the trainer (board, trainer card, Play panel) for an account that starred Stard; "Starred Stard" in plain grey words in the Play panel. Opted-out and block-listed accounts get nothing. Chosen 2026-11-13 over a gold arm band, whose gold (`#d4a017`) sat close to the legendary tier gold (`#e3b341`) that GAME-UI §3 keeps for cards. GitHub lists a repo's stargazers only to its admins and collaborators, so the patch shows only if the Worker's `GITHUB_TOKEN` is the owner's. | built (#75) |

**Demo and speed**

| Feedback | Status |
|---|---|
| Opponents take too long to load: a longer edge cache. | built (#80) |
| The deployed app broke after a merge. Every change is checked on the live site, not only locally. | built (process) |
| "Reading the next team takes some time": each round's opponent was read only when Continue was pressed. The next opponent follows from the name, the seed and the round alone, so it is now read while the round is played. | branch `run-prefetch-opponent` (#99) |
| "I pressed New run after finishing, but that had the old characters on the screen for a while and then they switched." New run kept the last round's opponent, their creatures, the "Round N" HUD and the old shop (still buyable) until the new run's first opponent was read. The run is now one state machine (`src/lib/run-state.ts`): New run clears the board to the player's trainer at once, a read for an older run is dropped, and a failed read shows Try again instead of a Fight against the last opponent. | branch `run-phases` (#103) |

**The journey after the first run**

> "Let's say people play against these creators, what do we tell them, just share? What about the next, how do they versus other people, how is our funnel shaped such that after that first they get to create their character and start playing people they know."

| Feedback | Status |
|---|---|
| Think through the whole journey, not one screen: arrive, first run against the 12 well-known accounts, then what? A copy-link button alone is not the answer. | open |
| **Decided 2026-11-12, build before the launch, in order:** (1) counters per day: runs started, reached round 2, team links made, links opened, challenges played; (2) the end screen leads with who you beat ("You beat @antfu and @simonw"), its main button is Challenge a friend (type their username; their public stars become the opponent; the `no-play` opt-out still applies), share text is prefilled; (3) the friend's end screen offers Send your result back, a reply link carrying both results; (4) after the first run, Make your trainer links to `/compose` and a README card with Beat my team. | open |
| After the numbers: a board for a group of friends, "fight @x's latest team" (needs storage), and a link from the run to the manager. | idea |
| After the first run a player makes their own character and starts playing people they know. | open (item 4 above) |
| Launch, rename, positioning: the README leads with "A card battle built from your GitHub stars" (#87). `stard.armanckeser.com` becomes the main address before the launch; `stars-demo.armanckeser.com` keeps serving forever (trainer cards in READMEs and battle threads point at it). The repo and npm renames wait for the 7-day launch numbers. GitHub About matches the headline (topics keep `portfolio` and `bookmark-manager`). Launch posts and strategy stay out of this repo. | built (#87, About), decided |

**Abilities in a fight**

> "I hate that the abilities are just text popups instead of animations and stylized."

| Feedback | Status |
|---|---|
| An ability firing shows as a slate text card over the creature (GAME-UI §9). It should be an animation on the board, stylized, readable without reading words. One look per effect kind (damage, shield, heal, stat, condition), so 23 abilities, the set bonuses and the boosts all share it. | built: a gold name under 1 s, a gold cast ring, and one look per kind in `src/components/battle/three/effects/` (GAME-UI §9). Shields also show on the HP bar. Owner approved from the before/after videos. |
| "When I see something like rate limited, I want to press the character and see what rate limited means." In a fight, a tap on any creature (or on its condition badge) opens a panel beside the board, as TFT's unit panel does, and the fight plays on: live HP and shield, the condition as a sentence with the seconds left ("Rate limited: acts 1.5× slower, 2 s left"), the ability, and live set bonuses (GAME-UI §9). | branch `fight-inspect` (#102) |

The owner played a whole run on 2026-11-12: "it was actually fun".
