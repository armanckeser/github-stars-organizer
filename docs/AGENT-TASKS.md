# Tasks an agent can pick up

Each task stands alone. Give an agent one task and this file. The plan behind them is `docs/GAME-DESIGN.md`, section "Open decision: turns or a run" (decided: the run).

Rules for every task:

- Branch from `main`, open a draft PR, do not merge. No attribution lines in commits or PRs.
- Run `npm test`, `npm run lint`, `npx tsc -b`, and in `worker/` `npx tsc --noEmit`.
- UI copy is short and plain. No "it" as the subject. No taglines.
- Never test against real users' repos or threads. Read-only calls to public GitHub data are fine.
- Do not touch `src/components/battle/three/` (the 3D arena) unless the task says so.

## The contract all tasks share

`server/run/types.ts` holds the shapes. Import from there; a change to them needs a note in the PR, since every task depends on them.

- The board is 4 cells wide and 4 deep. Each side places cards on its own half: 4 columns, 2 rows, row 0 in front.
- `Card`: a repo's numbers (`hp`, `attack`, `guard`, `speed`), its `range` (1 fights up close, 3 hits from behind), `sets`, `rarity`, `ability`, `shiny`.
- `Snapshot`: a team at one round. `units` is each card with its column and row.
- `fight(a, b, seed)` returns `FightEvent[]` in time order. Every card acts at once. Events carry a time `t` in ticks of 100 ms: `move`, `hit`, `ability`, `condition`, `faint`, `end`.
- Pure: the same two snapshots and seed give the same events.

## Task 1: fight engine and fair numbers

- `server/run/fight.ts`: the full `fight`. It takes the place of `server/run/plain-fight.ts` (walking and hits only), which the Play screen (`src/routes/run.tsx`) uses today: switch that import and delete the plain one. Keep what the plain one does: each card heads for the nearest enemy, hits once in reach, a faster card hits more often, 6.25% critical hits at 1.5x, and a fight is capped at 45 seconds, after which the side with more total HP left wins, else a draw.
- A fight between two full teams should last 15 to 30 seconds.
- Randomness comes only from the seed (reuse the seeded generator in `server/battle.ts`).
- `server/run/stats.ts`: a card's numbers from repo facts. Total by rarity is 400/415/430/445/460; each of the four stats gets 15 to 40% of the total, split by the repo's facts (see "stat budget" in the design doc). Shiny adds 5%.
- The branch `play-vs-computer` has an unfinished stat budget and balance test for the old turn-based game. Take what fits; it was never run.
- Test: over 2,000 fights between random teams, side 0 wins 47 to 53%, and the team with more total stars wins 45 to 60%.

## Task 2: abilities, sets and boosts

Needs Task 1's types (not its engine: write against the contract).

- `server/run/abilities.ts`: about 24 abilities, one per card, picked from repo facts (existing `EMBLEMS` and type tables in `server/` show how facts map to things). Each fires by a rule: start of fight, on hit, when hit, when a teammate faints, every third action. Names come from GitHub life (Hotfix, Force push, Rate limit, Revert, Rebase, Fork bomb, Dependabot, Cache hit). Effects are plain: damage, heal, shield, speed up, the four conditions in the design doc.
- `server/run/sets.ts`: two cards sharing a set give a small bonus, three a bigger one. One bonus per language and per common topic (`cli`, `ai`, `web`, `database`, `security`, `game`). No rule forbids any mix.
- `server/run/boosts.ts`: about 18 boosts offered one-of-three after rounds 2 and 4 ("first card starts with a shield", "critical hits deal 2x", "the last card standing gains 30% attack").
- Each ability, set and boost gets one test that shows the effect in a fight's events.

## Task 3: the run on the Worker

Needs Tasks 1 and 2 merged.

- `worker/src/run.ts`, routes under `/api/run/`. The Worker stays stateless: the whole run travels in a token signed with `BATTLE_KEY` (the way match state is signed in `worker/src/game.ts`).
- `GET /api/run/pool?login=` exists (`poolResponse` in `worker/src/battle.ts`): the ace and 20 cards drawn from the account's stars for the day. The Play screen runs the whole run in the browser from that today (`src/lib/run.ts`); this task moves the run behind signed tokens so a result can be trusted.
- `POST /api/run/new {login}`: reads the account's stars once and freezes every card's numbers into the token. Returns the ace and the first shop.
- `POST /api/run/act {token, buy | sell | reroll | place | fight, boost?}`: applies the choice, finds the opponent, runs `fight`, returns the events, the new token and the next shop. The run ends at 5 wins or 3 losses.
- Opponents for now: a team drafted by a simple bot (`opponentUnits` in `src/lib/run.ts`) from the stars of an account in a fixed list of well-known public accounts, to the same round. Same account + round + day gives the same team. Saved teams from real players come later.
- Shop: five cards from the frozen pool, seeded by token state, so a reload shows the same shop. Cards cost gold by rarity (1 to 5); a reroll costs 1. The numbers are in `src/lib/run.ts`.

## Task 4: small fixes (independent, do any time)

- Shiny means the repo's owner is `armanckeser`, for every player. Today the code marks a player's own repos (`shiny` in `worker/src/battle.ts` and `server/battle.ts`). A player's own repo gets a "home" mark with no stat change.
- After a battle or a run ends, one line under the result: a link "Star Stard on GitHub" and a share button that copies the battle link. No popup.
- The Battle screen requests `/api/card/versus.png?a=&b=` in the background once both usernames are known, so the share picture is cached before anyone shares the link.
- The SVG cards served for READMEs still show the owner's avatar; the app's cards show the creature. Note in the PR which is easier: an SVG creature per body plan, or leave as is.

## Task 5: freeze the facts in a match

- A match's signed opening post holds both teams. Add what the numbers were worked out from: each repo's stars, forks, language, topics, pushed date, and the character and ace as read from the README, with the time of reading.
- A test replays a stored opening post and gets the same teams with GitHub unreachable.

## Taken (being built by the maintainer)

- The Play screen (`src/routes/run.tsx`) and its 3D board (`src/components/battle/three/board.ts`): the shop, gold, placing cards and the all-at-once fight are built. Still to do there: the boost pick, showing abilities and sets, a bench, and a share link for a finished run.
- Card art from README images.
