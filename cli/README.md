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

Source, demo and a self-hosted version: https://github.com/armanckeser/github-stars-organizer
