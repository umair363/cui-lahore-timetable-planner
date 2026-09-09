# CUI Lahore Timetable Planner

The university's [public timetable](https://sfs.cuilahore.edu.pk/schedule/Public/Timetable)
only ever shows one class section or one faculty member at a time — and worse, the two
views are lossy in *opposite* directions: a class sheet never names the teacher, and a
teacher sheet never names the class. **No single page on the official site can answer
"who teaches CSC316, and when?"**

This project scrapes both views, rejoins them (a lesson is uniquely identified by
`day, period range, room, course code` — verified empirically: zero ambiguous matches
across the whole term), and publishes the result as a fast static site with:

- **Course view** — every offering of a course across every section: teacher, room, day, time.
- **Faculty view** — a teacher's full week and every section they teach.
- **Section view** — a section's week, with per-lab-group previews.
- **Planner** — tick offerings, see a live week grid, clashes flagged in red, shareable by link.
- **Auto-build** — pick your courses, get every clash-free combination, ranked.
- **Swap finder** — for one course in your plan, every alternative that still fits the rest.
- **Search** — one box across courses (by title *or* code), teachers, sections, rooms.

Data refreshes on a schedule (see below), so it stays correct without manual work.

Built from the published timetable by a student, not affiliated with COMSATS
University Islamabad. Always double-check against the official page before registering.

## How it's built

```
scraper/
  parser.py    HTML grid → structured lesson blocks (stdlib html.parser, no deps)
  join.py      teacher ↔ class join, with an honest integrity report
  scrape.py    crawl orchestration → site/data/timetable.json
  test_parser.py + fixtures/   fixture-based tests on real captured pages
site/
  index.html, styles.css, app*.js   the static site (no build step, no framework)
  data/timetable.json                the published dataset
.github/workflows/scrape.yml         scheduled re-scrape + auto-commit
```

Everything is stdlib Python + vanilla JS — no `npm install`, no `pip install`, nothing
that can break in six months because a dependency moved on.

## Run it yourself

```bash
cd scraper
python scrape.py            # full crawl (~5 min), writes ../site/data/timetable.json
python -m unittest test_parser -v

cd ../site
python -m http.server 8000  # then open http://localhost:8000
```

`scrape.py --limit 20` does a fast smoke crawl. `--no-gate` writes even if the sanity
gate would reject the result (see below) — useful for inspecting a bad run, never for
publishing one.

## Deploying (GitHub Pages + scheduled refresh)

1. Push this repo to GitHub.
2. **Settings → Pages** → Source: *Deploy from a branch* → Branch: your default branch,
   folder **`/site`**. Save. Your site is live at `https://<you>.github.io/<repo>/`.
3. **Settings → Actions → General** → under *Workflow permissions*, select
   **Read and write permissions** (the scrape workflow commits data updates).
4. The workflow in `.github/workflows/scrape.yml` runs every 6 hours and on manual
   dispatch (**Actions → Refresh timetable data → Run workflow**). It only commits when
   the scraped content actually changed, so most runs are no-ops.
5. Run it once manually after your first push to confirm the runner can reach the
   university's server and the data is fresh.

If GitHub-hosted runners ever can't reach `sfs.cuilahore.edu.pk`, run
`python scraper/scrape.py && git add site/data/timetable.json && git commit && git push`
from your own machine (or any scheduled task with network access) as a fallback.

## Data integrity, honestly

Not every lesson joins cleanly — a handful of large intro courses split across many
instructors, or administrative placeholders with no assigned teacher, don't resolve.
The scraper never guesses: unmatched and ambiguous cases are counted in
`meta.integrity` inside `timetable.json` and were, on the last full crawl, under 7% of
lessons. The site's footer always shows the data's version stamp and last-checked time
so you know exactly how fresh what you're looking at is.

A sanity gate also refuses to publish a crawl if lesson/teacher/section counts drop by
more than 20% versus the last good data — protecting against a partial outage at the
university silently breaking the site.
