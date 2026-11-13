# Balance scripts

Numbers for a balance change, from the same code the game plays. Run with Node 23 or later (it runs TypeScript as is).

| Script | Measures |
|---|---|
| `node scripts/balance/strength.ts [pools]` | Win-rate points each set bonus adds, 4 cards against 4, at each tier |
| `node scripts/balance/boards.ts <pools>` | Check rows per board, how often a board has a live check, and greedy-run win rates at rounds 1, 3 and 5 |

`[pools]` is the player's pool file, then the opponents'. A pool file is the Worker's answer for one account, saved:

```sh
for login in armanckeser sindresorhus t3dotgg antfu gaearon yyx990803 kentcdodds tj mitchellh simonw rauchg addyosmani torvalds; do
  curl -s "https://stars-demo.armanckeser.com/api/run/pool?login=$login" > "p-$login.json"
done
node scripts/balance/boards.ts p-armanckeser.json p-*.json
```

A pool changes as its account stars repos, so give the files' read date with any numbers. `FIGHTS` and `RUNS` set the sample sizes.
