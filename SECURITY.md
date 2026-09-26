# Security Policy

GitHub Stars Organizer is a private, self-hosted personal tool, not a public service. It is not hardened for multi-user or production use.

## Reporting a Vulnerability

If you find a security issue, please report it privately through GitHub Security Advisories:

**[Report a vulnerability](https://github.com/armanckeser/github-stars-organizer/security/advisories/new)**

Please do not open a public issue for anything security-sensitive.

## Secrets

All secrets (your GitHub token, database credentials) live in `server/.env`, which is git-ignored. Never commit real values. Use `server/.env.example` as the template.
