# Deo Ratan Billing — notes for Claude

Offline billing app for **Deo Ratan Agro Foods Pvt. Ltd., Sukhisewania, Bhopal**. Owner: Toshi (designer, CS background). Users: the office team, not tech-savvy, one Windows laptop, Chrome, often **without internet**.

## How it is built
- `app/` is the whole site (plain HTML/CSS/JS, no build step). Hosted as the Cloudflare **Worker "billing"** with static assets, at `https://billing.deoratan.workers.dev`. `wrangler.jsonc` is its config; Cloudflare Workers Builds deploys from GitHub (`main` → production, any other branch → a preview URL via `wrangler versions upload`).
- `app/app.js` is the app. `app/sw.js` is the service worker (offline copy). `app/vendor/` has html2canvas, jsPDF, xlsx-js-style.
- `worker/index.js` serves `app/` and routes `/api/report` to `worker/report.js`: the in-app **Report a problem** button posts there and it files a **Linear** issue in team **billing-tool (BIL)**. `LINEAR_TEAM_ID` is in `wrangler.jsonc`; `LINEAR_API_KEY` is a Secret on the Worker (dashboard), never in the repo. Only `/api/*` runs Worker code; everything else is a free static request.
- Bills are **not** on Cloudflare. They live in `bills-data.json` in a folder on the office laptop (Google Drive folder) via the File System Access API, with daily backups. Deploying never touches bills.
- The app writes, after every save: `Aata sale statement.xlsx`, `Grain sale statement.xlsx` (tab per grain), `Grain purchase statement.xlsx` (tab per grain incl. Dhan), `Master statement.xlsx` (all tabs), and PDFs in `Invoices/`.

## Release rules (always)
1. Every change ships with a bump of `VERSION` in `app/sw.js` (format `YYYY-MM-DD.N`). Without it the laptop never gets the update.
2. Run the full suite and the offline PDF tests (below). All must pass, no JS errors.
3. Work on a branch, open a PR. Cloudflare builds the branch and posts a preview URL on the PR; send it to Toshi. (The preview runs the same code, but its browser data and folder choice are separate from the office laptop.)
4. **Never merge to `main` (= production) without Toshi's explicit "deploy".**
5. Flag clearly in the PR any change to money maths (rates, GST, deductions, labour, rounding), even when tests pass.
6. Never change the shape of saved bills without code that reads old bills too (old bills must open, print and total the same).

## Business rules (do not change unless Toshi asks)
- Three entry kinds: `aata` (Aata bills, numbered 01, 02…), `gsale` (GS-01…), `gpurchase` (GP-01…). Drafts get a number only when created. Deleting the latest bill frees its number.
- **Aata bill lines**: Item = Aata (आटा, HSN 1001) or Chapad (चापड़, HSN 2302). Bag size LD (pack of 6×5 kg = 30 kg, printed "LD" only), 25.1 kg, 30 kg, or Other (type kg). Rate per quintal. Up to 8 lines.
- **Grain sale**: Wheat, Tewda, Chana, Soybean. Wheat lines: type + optional brand + bags (30 kg or Other) — except type **Others**, which is sold loose like the other grains (quantity in quintal + rate, name optional). Other grains: quantity in quintal + rate. Dhan cannot be sold.
- **Grain purchase**: Wheat, Tewda, Chana, Soybean, **Dhan**. Deduction per quintal of gross: 300 g (Dhan: 1 kg); net rounded to 0.01 qtl. Amount = net × rate − discount − dharam kata (Truck ₹100, any other vehicle ₹60) − labour. Labour per quintal of net weight rounded to whole quintals (.5 goes up): Hydraulic trolley ₹7.5; Truck, Tractor, Pickup, Others ₹10.5; **Dhan ₹15 whatever the vehicle**. Old "Trolley" = Hydraulic trolley.
- Discount comes off before GST. GST optional: auto from party GST No. (starts 23 = SGST+CGST 2.5% each, else IGST 5%), editable.
- Wheat types — purchase: Malwa, Sharbati, Lokwan, 1544, Shri Ram, Lota, Mill Quality, Others. Sale: 1544 (1/2/3 no., MTR), Lokwan (1/2/3 no., MTR), Sharbati (1/2 no.), Jhiri, Malwa, Shri Ram, Lota, Others. Brands (A–Z + Others). Spell **Sharbati** and **Lokwan**.
- **The bill is the business's existing printed template** (Estimate/Invoice, black and white, 560×1416 px, 3 copies per landscape A4 with a 15 mm punch strip). Keep labels and layout as they are; the user asked not to redesign it. Party line prints name + address + location; mobile prints beside GST No.
- Parties ledger: one per party (mobile, else name). Sales and payments received vs purchases and payments made; "we owe" when negative. Book no. is per bill, entered any time.
- PDFs must work with **no internet**: they use the CSS and fonts the page already holds (`prepareInlineCss`). Keep it that way.

## Testing
```
npm install            # playwright (uses the preinstalled Chromium in Claude's workspace)
npm run serve          # app + /api/report with Linear faked, on :8770
npx wrangler dev       # the real Worker runtime locally (report endpoint says not_configured without the key)
npm test               # full suite: ~200 checks, every amount against an independent calculation
node tests/report.mjs http://localhost:8770/ test-output test-output/issues.json
node tests/report-status.mjs http://localhost:8770/ test-output   # why a report waits: no internet vs a setup problem
python3 tests/cfserve.py app 8766 &   # Cloudflare-style caching
node tests/offline-pdf.mjs http://localhost:8766/ test-output
node tests/sw-api.mjs http://localhost:8766/   # /api/* must never be answered by the offline copy
node tests/offline-pdf-uncontrolled.mjs http://localhost:8766/ test-output
```
Look at the rendered PDFs (pdftoppm) after any change to the bill.

## Handling a report from Linear
1. Read the issue; ask Toshi (comment on the issue) if it is unclear or touches money rules.
2. Branch `fix/<issue-id>`, make the change, add a check for it to `tests/suite.mjs`, bump `VERSION`, update `app/SETUP-GUIDE.txt` if users see a change.
3. Run all tests, open a PR linking the issue, post the preview URL and a short plain-language summary to Toshi. Wait for "deploy".
