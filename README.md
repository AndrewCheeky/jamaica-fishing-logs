# Jamaica Fishing Logs v1.0

Mobile-first anonymous fishing trip reporting for Jamaica Fishing Intelligence.

**Target site:** https://fishing-logs.andrewcheeky.com  
**Related maps:** https://fishing.andrewcheeky.com

## Included

- Anonymous-by-default reporting. No angler name or account is requested.
- Date, bank, target species, method, effort (hours and anglers), and zero-catch trips.
- Trolling, Vertical Jigging, Bottom Fishing, and Mixed (choose at least two methods).
- Multiple catch species in one report, including Sailfish.
- Browser-scoped duplicate checks (10 minutes and a broader same-date check), unique submission IDs, and edit tokens.
- Cloudflare Turnstile security checks, D1 persistence, edit audit trail.
- Mobile-friendly responsive UI and automated validation tests.

## Important before launch

**Bank list:** `src/validation.js` contains the 13 fishing locations supplied for this project. The same list is served to the form by `/api/config` and validated on the server.

**Turnstile:** Submission intentionally fails closed until both `TURNSTILE_SECRET` and `TURNSTILE_SITE_KEY` are configured. For production set the secret using `npx wrangler secret put TURNSTILE_SECRET` and set `TURNSTILE_SITE_KEY` as a Worker variable in the Cloudflare dashboard (or `wrangler.jsonc` `vars`).

**Privacy:** Browser ID is random and stored locally, then hashed server-side. It is not a person identifier. Duplicate controls cannot guarantee prevention across different browsers/devices. This is a data-quality aid, not identity verification. Do not publish individual trip records. The server stores free-text notes, so anglers are warned not to include personal details.

**Editing:** A secret edit token is returned once and kept only in the current browser session's application state; it is not transmitted to third parties. The API supports loading and editing by token, but the v1 UI's Edit button works immediately after submission. After reloading, restoring the saved edit token and original form is a planned enhancement. No admin dashboard is included in this initial release.

## Deployment

1. Create a **new GitHub repository** `jamaica-fishing-logs` and upload these files. Keep it private while testing.
2. Create a Cloudflare D1 database named `fishing-logs-db` in your Cloudflare account.
3. Copy the real D1 `database_id` into `wrangler.jsonc` replacing `REPLACE_WITH_YOUR_D1_DATABASE_ID`.
4. Install Node.js 22+ locally, then run `npm install` and `npm test`.
5. Authenticate: `npx wrangler login`.
6. Run `npm run db:remote` to apply the D1 schema.
7. Create a Cloudflare Turnstile widget for `fishing-logs.andrewcheeky.com`. Configure `TURNSTILE_SITE_KEY` in Worker environment variables and set `TURNSTILE_SECRET` with `npx wrangler secret put TURNSTILE_SECRET`.
8. Run `npm run deploy`. Verify `/api/config` and test a real submission, a zero-catch trip, duplicate protection, and immediate editing.
9. In Cloudflare Workers & Pages → your Worker → Settings → Domains & Routes, add custom domain `fishing-logs.andrewcheeky.com`. Cloudflare manages its DNS route and certificate.
10. Add a **Report Your Catch** link from `fishing.andrewcheeky.com`.

## Architecture

- Cloudflare Worker handles `/api/*`.
- Worker static assets serve `public/`.
- Cloudflare D1 holds trips, catches, and edit audit entries.
- No public listing or personal name collection.

## Known limitations / next phase

- The 13 supplied fishing locations are configured and tested.
- Edit-after-reload interface and private admin dashboard are not implemented.
- Browser-scoped duplicate checking is not a full identity-based anti-fraud system.
- Future voluntary profiles require explicit opt-in and separate identity data.
- Before accepting public reports, add rate limiting/WAF controls, monitoring, a retention policy, and a privacy notice suited to the jurisdiction.
- Seasonal analysis should be based on effort-adjusted observations and only feed the opportunity index after validation and scoring-model versioning.

© Andrew 'Cheeky'

## v1.0.2 form updates
- Mixed is a single fishing method, with no follow-up method-selection question.
- When Yes is selected for a catch, add as many species rows as needed with **+ Add another catch species**. Each row records a species and quantity.
- No database migration required. Redeploy Worker and assets after updating GitHub.

## Cloudflare D1 configuration

`wrangler.jsonc` contains the supplied `fishing-logs-db` D1 database ID. Run `npm install`, then `npm run db:remote` after authenticating with Cloudflare. Configure Turnstile keys as Worker variables/secrets before accepting reports.


## Private fisheries summary (v1.1.0)

Open `/fisheries-report.html` on your deployed Worker. This page retrieves aggregated data from the existing `trips` and `catches` D1 tables through `GET /api/admin/fisheries-report?from=YYYY-MM-DD&to=YYYY-MM-DD&bank=...`. No database migration is required.

**Required security configuration:** In Cloudflare Workers → Settings → Variables and Secrets, create a **Secret** named `REPORT_ADMIN_TOKEN` with a long, unpredictable value (at least 24 characters; 40+ recommended). Keep this out of GitHub. Enter the token into the dashboard to retrieve a report. The token is kept only in page memory; it is not saved in localStorage or sent to third parties. Use HTTPS. Restrict the report page with Cloudflare Access as an additional protection if available.

`keep_vars: true` is set in `wrangler.jsonc` to preserve dashboard variables and secrets on deploy; verify this with your deployment method. The existing Turnstile secrets are not included in the repository.

**Data definitions:** Angler-hours = sum(hours_fished × anglers_count). Fish-per-angler-hour = sum(catches.quantity)/angler-hours. Vessel-hours = sum(hours_fished). `anglers_count` is summed as angler participations, not unique people. No weighting, deduplication beyond existing ingestion rules, or statistical adjustment for selection bias. Self-reported data is not independently verified and should not be characterized as official fishery landings.

**Privacy:** Only aggregated bank/species/method summaries are returned, without free-text notes or individual trip records. For small sample sizes, consider withholding or combining bank-level rows before external distribution. The reporting token grants read access to all aggregate records; rotate it if compromised.
