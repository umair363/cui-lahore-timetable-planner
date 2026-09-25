# CUI Lahore Timetable Planner — working notes

Read this before changing anything. It records the decisions and traps that are
**not** obvious from the code, so a fresh session doesn't have to rediscover them
(or, worse, quietly undo them). For what the project *is* and how to deploy it,
see `README.md`.

## What this is

CUI Lahore publishes a timetable that only shows **one** section or **one**
teacher at a time, and the two views are lossy in opposite directions: the class
sheet historically never named the teacher, and the teacher sheet never names the
class. This project scrapes both, **joins them** to reconstruct the full record
(course + section + lab group + teacher + room + day + time), and publishes it as
a static site.

- `scraper/` — Python, **stdlib only** (no `pip install` step, deliberately).
- `docs/` — the site. Vanilla JS, **no build step**. GitHub Pages serves this folder.
- `.github/workflows/scrape.yml` — re-scrapes every 6h, commits only if data changed.

Live: https://umair363.github.io/cui-lahore-timetable-planner/

## Hard-won invariants — do not break these

**1. Entity ids are positional and therefore unstable.**
`scrape.py` assigns section/teacher/room ids with `enumerate()` over the
university's own dropdown order. Add or remove one section upstream and **every
later id shifts**. Consequences:

- Anything persisted or shared must **never** be keyed on those numeric ids.
- Offering ids are therefore `COURSE::SECTION_NAME::GROUP` (see `offeringsFor`
  in `app-data.js`). The section *name* is stable; its id is not.
- **Still outstanding:** deep links (`#/section/80`, `#/teacher/12`, `#/room/5`)
  *do* use positional ids, so a link shared last week may resolve to a different
  entity today. Fixing it means changing the scraper's id scheme and every route.
  Worth doing; not yet done.

**2. The sanity gate is load-bearing.** `scrape.py` refuses to publish if lessons/
teachers/sections drop >20% vs the previous run. This has already saved the site
once (2026-09-14, see below). Never bypass it to "just get data out" — `--no-gate`
exists for local debugging only.

**3. Plan ids are `~`-encoded in storage and must be decoded on read.**
`serialize()` writes `::` as `~`; `loadFromLocalStorage()` must `decodeId()` it
back. A missing decode silently restores an *empty* plan while the nav badge still
shows a count. This was a real shipped bug — don't reintroduce the asymmetry.

**4. CSP is strict: `script-src 'self'`, no exceptions.** There is zero inline
`<script>`, zero `onclick=`, no `eval`. Keep it that way or the page breaks with
no visible error. No CDNs, no external fonts.

**5. The service worker is network-first for everything** (`sw.js`), with the
cache as the offline fallback and a 4s timeout before falling back. The shell was
originally cache-first with a background refresh; that made a deploy take two
visits to appear, and if the worker was torn down before the background write
finished it could fail to appear at all. Don't "optimise" it back to cache-first
— for a timetable, stale is worse than 200ms slower.

*Testing note:* Chrome serves subresources from the tab's **memory cache** on a
same-tab reload, bypassing the service worker entirely. A same-tab reload will
therefore show stale code and prove nothing. Always test deploys in a **fresh
tab** (`context.new_page()`), and read persistent state (the Cache Storage entry)
rather than a page-side `fetch()` — that fetch is itself intercepted by the
worker, so it reports the cache, not the server.

**6. Design system: chrome is monochrome by design.** Courses are colour-coded and
*that colour is the data*. The UI accent is ink (near-black on warm paper,
inverted in dark). Don't introduce a coloured accent — it competes with the
course colours. Near-square corners (2–3px), hairline rules instead of cards,
tabular figures. Tokens live at the top of `styles.css`; define every colour on
bare `:root` and override in **both** the `prefers-color-scheme` block and the
`[data-theme="dark"]` block, or the toggle desyncs from the system setting.

## The swap board (Supabase)

Identity is an **anonymous session**, not a login: a device gets an id, no email,
no password. Email OTP was tried and rejected — it puts verification in front of
someone who just wants to swap a lab slot, and Supabase's built-in mailer is
rate-limited to a handful per hour, so the fifth student in a queue gets nothing.

Consequences to keep in mind:
- Clearing site data loses the identity, and with it that person's posts and
  chats. There is no recovery path by design.
- Identities are free to make, so accountability lives in the database: rate
  limits on messages/threads/requests, one open request per course, and the rule
  that a thread can only hang off a request someone actually posted (there are
  no open DMs). Don't remove these — they are the only spam control.
- Email survives as an optional **badge** (`profiles.verified`), set by a trigger
  from the JWT so a client can't self-declare it. Never make it a gate.

**The anon key is in `app-supabase.js` on purpose.** It identifies the project and
authorises nothing; RLS decides everything. Never commit a `service_role` key or
the DB password — those bypass RLS entirely.

`supabase/schema.sql` is the source of truth and is idempotent — edit it and
re-run it in the SQL Editor rather than making changes in the dashboard, or the
next person has no idea what the policies actually are. It ends by raising if any
public table lacks RLS.

No SDK: `app-supabase.js` is plain fetch against PostgREST, so `script-src` stays
`'self'` with no CDN. Chat **polls** (4s, backing off when the tab is hidden)
instead of using realtime websockets — at this scale the latency is invisible and
it avoids a second protocol and a reconnect loop to get wrong.

Matching lives in `app-swap.js` and is pure: requests in, matches out. It finds
direct swaps and multi-person chains, and drops any cycle that would clash with
*any* participant's remaining week.

## The scraper breaks when the university redesigns

This is expected and will happen again. Known instance:

> **2026-09-13** the university replaced the `Who` `<select>` with a JS-driven
> combobox; the names moved into a `const all = [...]` array. `extract_options`
> found no `<option>` tags → 0 sections, 0 teachers → sanity gate correctly
> refused to publish, and two scheduled runs failed. Fix: read the JS array,
> keeping the `<select>` path as fallback.

**Debugging a failed run** (no `gh` CLI on this machine; use the API):
```bash
curl -sS ".../actions/workflows/scrape.yml/runs?per_page=5"     # find the run id
curl -sS ".../actions/runs/<id>/jobs"                           # find the failing step
# job logs need auth — get the token from the OS keychain, never hardcode it:
TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill | sed -n 's/^password=//p')
curl -sSL -H "Authorization: Bearer $TOKEN" ".../actions/jobs/<job_id>/logs"
```
Then diff the live HTML against what the parser expects. The parser is more
tolerant than it looks (`\bblk\b` regex matches `class="blk tall"`), so breakage
is usually in the *index* page, not the grid.

## Verifying changes

```bash
cd scraper && python -m unittest test_parser          # 17 tests, fixture-based
python scrape.py --cache-dir /tmp/c --out /tmp/x.json # full run ~5 min, 784 requests
cd docs && python -m http.server 8800                 # then browse localhost:8800
```

Always scrape to a **scratch** output first and compare `meta.counts` and
`meta.integrity` against `docs/data/timetable.json` before letting anything near
the real file. Expect roughly: 262 sections, 522 teachers, ~2700 lessons, and
~190 unmatched class keys (that number is normal, not a regression).

For UI work there's a Playwright smoke script in the session scratchpad; at
minimum check both themes, a 390px viewport (no horizontal overflow), and the
browser console for errors.

## Judgement calls the user has already made

- **No AI attribution in commits or the README.** (Explicitly asked for.)
- **Design must not look AI-generated.** Rounded-everything, big margins, stat-tile
  rows and a violet accent were all rejected by name. Density and real typographic
  hierarchy over decoration. If a page has a big empty void, the fix is *content*,
  not spacing tweaks.
- **Be honest in the UI.** Show the data version and last-checked time; say
  "already up to date" rather than faking work; when a refresh drops a planned
  offering, name it instead of silently showing a shorter week.
- The manual **Check for updates** button fetches the latest *published* data. It
  cannot re-scrape the university (no CORS, and a workflow token can't live in a
  public static site). Don't "improve" it into something that pretends otherwise.

## Layout quick reference

| File | Role |
|---|---|
| `scraper/parser.py` | HTML grid → blocks. Table occupancy resolver (rowspan/colspan). |
| `scraper/join.py` | class↔teacher join on `(day, start, end, room, code)` + fallbacks. |
| `scraper/scrape.py` | crawl, orchestrate, sanity gate, write JSON. |
| `docs/app-data.js` | load/reload, indices, offerings, clash + free-room queries. |
| `docs/app-plan.js` | the saved plan (localStorage + shareable URL param). |
| `docs/app-grid.js` | week grid: days as rows, time as columns, 30-min resolution. |
| `docs/app-views.js` | course/teacher/section/room views, home, free-room finder. |
| `docs/app-planner-views.js` | planner, auto-build (clash budgeting), swap finder. |
| `docs/app.js` | hash router, search overlay, theme, refresh button, boot. |
