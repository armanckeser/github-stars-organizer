# github-stars-organizer

Search, tag, rate and annotate your GitHub stars, sort them into GitHub Lists, and see a health
score for every repo. Runs on your machine with the GitHub login you already have.

```bash
gh auth login              # once, if you haven't
npx github-stars-organizer
```

It opens http://127.0.0.1:5185 and stops when you press Ctrl-C. Lists, List membership and unstars
are written to GitHub; tags, ratings and notes are saved in your browser. Set `GITHUB_TOKEN` to use
a different token, `--port` to use another port, `--no-open` to skip opening the browser.

Before the app opens, it backs up your stars and Lists to `~/.github-stars-organizer/backups/`. The
Backups page takes more, downloads them, and restores one after showing what it would add back. A
restore never unstars or deletes anything. GitHub dates a re-starred repo the day it was restored.

## Privacy

The CLI talks only to `api.github.com`, with your token; the page talks only to the CLI. No
telemetry. What it keeps stays on your computer, in that browser's storage and the backups folder.

## License

Copyright (C) 2026 Armanc Keser. Free software under the GNU Affero General Public License, version 3
or (at your option) any later version; see `LICENSE`. It comes with ABSOLUTELY NO WARRANTY.
`dist/THIRD-PARTY-LICENSES.txt` and `dist/app/THIRD-PARTY-LICENSES.txt` list the licenses of the
packages bundled into it.

Not affiliated with or endorsed by GitHub. GitHub is a trademark of GitHub, Inc.

Source, demo and a self-hosted version: https://github.com/armanckeser/github-stars-organizer
