# Deo Ratan Billing

Offline billing app for Deo Ratan Agro Foods (Aata bills, grain sales and purchases, party ledgers, Excel statements, printable bills).

- `app/` — the site (no build step), served by the Cloudflare Worker **billing** (`wrangler.jsonc`). Office setup and daily use: `app/SETUP-GUIDE.txt`.
- `worker/` — the Worker: serves `app/` and the "Report a problem" endpoint, which files issues in Linear.
- `tests/` — end-to-end tests (Playwright). See `CLAUDE.md` for rules, testing and the release process.

`main` is production (https://billing.deoratan.workers.dev). Every other branch gets a Cloudflare preview URL.
