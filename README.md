# Deo Ratan Billing

Offline billing app for Deo Ratan Agro Foods (Aata bills, grain sales and purchases, party ledgers, Excel statements, printable bills).

- `app/` — the site Cloudflare Pages serves (no build step). Office setup and daily use: `app/SETUP-GUIDE.txt`.
- `functions/api/report.js` — the "Report a problem" endpoint; files issues in Linear.
- `tests/` — end-to-end tests (Playwright). See `CLAUDE.md` for rules, testing and the release process.

`main` is production. Every other branch gets a Cloudflare preview URL.
