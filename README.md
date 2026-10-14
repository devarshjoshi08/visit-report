# School Visit Report Builder

A single web page that rebuilds the **Report** table from the *Daily Activity tracker from 01 Oct 25* Zoho sheet for any date range you pick — schools visited per day, split by project and state.

Everything runs in the browser. No server, no Zoho login, no data leaves the device.

## Files

| File | What it is |
|---|---|
| `index.html` | The page: file loading, date range, table, copy/download buttons |
| `report.js` | The counting logic, kept separate so it can be tested |
| `test.js` | `node test.js` — checks the logic against a synthetic tracker layout |
| `tools/fetch_mapping.py` | builds `schools.csv` from ClickHouse (run it inside the network) |
| `tools/update_mapping.sh` | fetch + commit + push the mapping; put this on a cron |
| `tools/.env.example` | copy to `tools/.env` and fill in — `.env` is git-ignored |
| `schools.csv` *(optional)* | if present next to `index.html`, the page loads it as the mapping on open |

## Put it online (GitHub Pages)

1. Create a repository, e.g. `visit-report`. Public is simplest (GitHub Pages on a private repo needs a paid plan), but see *Before you publish a mapping* below before putting school data in a public one.
2. Upload `index.html` and `report.js` to the root of the `main` branch (`test.js` is optional).
3. **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, folder = `/ (root)`. Save.
4. After a minute the link appears at the top of that Pages screen: `https://<your-user>.github.io/visit-report/`. Share that link — anyone who opens it gets the tool, and their files stay on their own machine.

## Weekly use

The only two things the page needs are the **log rows** and the **mapping**. Nothing else in the
workbook is read, so the smallest possible weekly input is a two-column paste:

| Header (row 1, spelled exactly) | Required | Holds |
| --- | --- | --- |
| `Date` | yes | The visit date — a real date cell, or text like `05-Sep-2026`. `05/09/2026` is read day-first. |
| `School Code and Name` | yes | Column L as it stands, e.g. `(516114340) GPS Denwari`. The code is read out of it. |
| `Name` | no | Who logged it. Only used to say who typed an entry that has no code. |

Extra columns are ignored, so pasting more than this is fine. Column B is not needed — the code is
read from `School Code and Name` directly, and more reliably than the sheet's own formula.

1. In the Zoho sheet, open the **Daily Activity tracker 01 Oct** tab — the master sheet the form writes into — select the **Date** and **School Code and Name** columns, and paste them (values only) into a blank Excel sheet. Downloading the whole tab as CSV works identically, but Zoho is slow at it; pasting two columns is seconds.
2. Open the page and drop that file on it, together with the school master list the first time. The mapping is remembered on the device, so from the second week on it is only the tracker paste.
3. Pick the range — *Last full Saturday – Friday week* is the default — or set any From/To dates.
4. **Copy table** puts it on the clipboard ready to paste into Excel, Zoho Sheet or an email. **Download Excel** gives a workbook with the report, the school-by-school list, and the two mapping lists below when they are not empty.
5. Delete the pasted file afterwards if you prefer not to keep it.

The page remembers the last load on that device, so reopening it shows the same data without loading files again — use **Forget the saved export** to clear it.

A full `.xlsx` download of the workbook also works (about 5.5 MB), but the sheet's formula grid makes it slow both to download from Zoho and to open in a browser. The two-column paste avoids both.

Sheets are recognised by shape, not by file name, so you can drop every tab at once. The **SS Details** staff list is ignored on purpose: it also has a "Project Name" column, and an earlier version mistook it for the Report template and produced a table of zeros.

### Where the mapping comes from

There is no back end. The page is a single static HTML file and every number is counted in the
browser. The school &rarr; state/project mapping can only come from one of two places:

1. **A school list you drop on the page.** Normally the **School Details** tab of the tracker
   export. Any sheet of the right shape works, so a separate master list of all schools can be
   dropped instead — see the next section.
2. **A `schools.csv` published next to `index.html`.** Fetched when the page opens, so the weekly
   job is just the tracker export. Dropping a school list in afterwards replaces it for that
   session.

If a school code in the log is in neither, the visit is **not** counted in any column and the
school is listed under *Schools missing from School Details* in card 4. That list is the reason
schools go missing from the report — nothing is filtered out silently.

### Project names: the P&G rollup

The mapping list spells projects the way the warehouse does. There is **no value equal to `P&G`** —
instead `Home base P&G Shiksha`, `School base P&G Shiksha`, `Govt Led P&G`, `Ghyanshala P&G`,
`P&G Mindspark Maharashtra` and others. The report, meanwhile, has three columns headed `P&G`
(Himachal Pradesh, Punjab, Telangana).

So `report.js` carries an alias: **any project name containing `P&G` is matched to the `P&G`
column.** Without it those three columns read zero while the schools sit under *Mapped schools with
no column*. The rule lives in one place and is easy to change:

```js
var DEFAULT_ALIASES = [{ contains: 'p&g', as: 'P&G' }];
```

The raw name is kept for display, so the school-by-school list still shows `Home base P&G Shiksha`.
A chip above the table reports how many school-days were counted through a rollup. `Prevail`,
`Bharat EdTech Initiatives`, `Amazon Future Engineer` and `ITC Punjab` match the report exactly and
need no alias.

States in the mapping that have no report column at all — Uttar Pradesh, Tamil Nadu, Haryana,
Delhi, West Bengal, Orissa and a few more — are not dropped silently. A visit to one of those shows
up under *Mapped schools with no column*.

### Removed schools

The warehouse suffixes the code of a removed school: `262704Deleted`. These are read as the plain
code `262704` and marked `Deactivated`, so a visit logged to one still lands in the right column
instead of falling into the missing list. Excel's `121240.0` is handled the same way.

Where the same code appears twice (a live row and a `Deleted` row, or a test row and a real one),
the first row in the file wins. In the current list all 16 such pairs share the same state and
project, so counting is unaffected — only the displayed school name can differ.

### A master list of all schools

The School Details tab only carries the schools someone added to it, which is why active schools
can still be absent. A single master list of every school — active, deactivated and upcoming —
fixes that for good. Build it as one sheet with a header row and these columns:

| Column | Required | Notes |
| --- | --- | --- |
| `schoolCode` | yes | The number only, no brackets, no thousands separator, no decimal. This is what the log is matched on. |
| `name` | yes | School name. |
| `state` | yes | Must match the report's state names exactly: Andhra Pradesh, Bihar, Himachal Pradesh, Karnataka, Madhya Pradesh, Maharashtra, Punjab, Rajasthan, Telangana, Uttarakhand, Gujarat. |
| `po.name` | yes | The project. Header may also be `project` or `project name`. Must match the report's project names exactly: `P&G`, `Bharat EdTech Initiatives`, `Prevail`, `ITC Punjab`, `Amazon Future Engineer`. Any other project name falls into that state's **All** column; if the state has no All column it is reported under *Mapped schools with no column*. |
| `status` | no | `Active`, `Deactivated`, `Upcoming`, or a `TRUE`/`FALSE` flag. Shown for context and **never** used to drop a visit. Anything else is passed through as written. |
| `district` | no | Carried for reference. |
| `School code and Name` | no | `(516114340) GPS Denwari` form. Used as the fallback code source if `schoolCode` is blank, and as the label shown in the school-by-school list. |

Extra columns are ignored, so an export with more fields than this is fine. If a code appears
twice, the first row wins — so keep one row per school.

Counting is unaffected by status: a visit to a deactivated or upcoming school is counted in its
state/project column like any other, and the *School-days at schools not marked Active* chip says
how many of the period's school-days those were. The point of including them is that the visit
lands in the right column instead of falling into the missing list.

### Automatic mapping (optional)

If a file called `schools.csv` sits next to `index.html` in the repo, the page fetches it on open and uses it as the school → state/project mapping. The weekly job is then just the tracker export; School Details no longer has to be downloaded at all, and dropping one in still overrides the published mapping for that session.

**Where this runs matters.** ClickHouse sits on `10.0.4.183`, a private address. GitHub Pages only serves static files — nothing on GitHub executes this script, and GitHub's runners are on the public internet and cannot reach that address either. So the script runs on a machine inside the network (your laptop on VPN, or an internal server) and only the generated `schools.csv` is pushed.

**Credentials never go in the repo.** They are read from `tools/.env`, which `.gitignore` keeps out of git:

```bash
cp tools/.env.example tools/.env          # then fill in a read-only user
python3 tools/fetch_mapping.py --out schools.csv
python3 tools/fetch_mapping.py --check schools.csv School_Details.csv   # compare with the sheet
bash tools/update_mapping.sh              # fetch + commit + push in one go
```

`tools/update_mapping.sh` is the one to put on a weekly cron on that machine; the header shows the crontab line.

The query it runs is yours, with a de-duplication wrapper because `schools` is a `ReplacingMergeTree` and the same school can appear more than once until its parts merge:

```sql
SELECT schoolCode, name, district, state, `po.name`
FROM (
    SELECT s.schoolCode AS schoolCode, s.name AS name, s.district AS district,
           s.state AS state, po.name AS `po.name`, s.lastModified AS lastModified
    FROM schools s
    JOIN parentOrganizations po ON po.parentOrgId = s.parentOrgId
    WHERE s.SBU = 'Ei Shiksha' AND s.isActive = true AND po.category = 'paid'
    ORDER BY lastModified DESC
)
WHERE schoolCode NOT IN ('', 'None', 'nan')
LIMIT 1 BY schoolCode
```

**Run `--check` once before trusting it.** The report puts a school in a column by matching its project name, so if the warehouse spells a project differently from the report columns (`Prevail Fund Mindspark` vs `Prevail`, say), those schools land in *"no column"* instead. `--check` compares the generated mapping with a School Details export and prints how many schools are missing on either side and how many have a different state or project. Fix any name differences with `--alias fixes.csv`, a two-column `from,to` file.

A GitHub Action cannot do this job — its runners sit on the public internet and cannot see `10.0.4.183`. A cron entry on an internal machine can.

### Before you publish a mapping

`schools.csv` holds every school's name, district, state and project. In a **public** repo that list is public too. If that is not acceptable, either keep dropping the School Details CSV by hand, make the repo private (GitHub Pages on a private repo needs a paid plan), host the page and the mapping on an internal server, or put `schools.csv` behind an internal URL and paste that link into *"Or pull from published links"*.

**Never commit database credentials.** Anything pushed to a public repo should be treated as leaked the moment it lands — bots scrape new public commits within minutes — and removing the line later does not help, because the value stays in the git history. If it happens: rotate the password first, then delete and recreate the repository (or rewrite history).

### No download at all (optional)

If the sheet owner publishes those two tabs in Zoho (**File → Publish**) and gives you the CSV links, paste them under *"Or pull from published links"* and the page fetches them itself. Zoho has to allow the page to read those links; if it refuses, the CSV route above still works.

## How the numbers are produced

Everything is counted from the **master sheet** (*Daily Activity tracker 01 Oct*). The school code is read from *School Code and Name* in two steps: **brackets anywhere in the text**, then **a bare run of five or more digits**. The sheet's own helper column (B) is not used.

That matters, because the sheet's formula — `NUMBERVALUE(MID(L,2,FIND(")")-2))` — only works when the text *starts* with the code in brackets. In the 18 Sep 2026 export, out of 10,290 entries that name a school:

| How the entry is typed | Rows | Sheet column B | This tool |
|---|---:|---|---|
| `(844247693) GPS Jhaldi Kanot` | 10,240 | reads it | reads it |
| `GPS Jhaldi Kanot (844247693)`, `Gps Denwari(516114340)` | 9 | `#VALUE!` — visit lost | reads it |
| `Gps bhargaon  844247679`, `331068623.0` | 6 | `#VALUE!` — visit lost | reads it |
| `Gps Sharai Shuhawal` (no code at all) | 35 | `#VALUE!` — visit lost | listed for fixing | **School Details** is read only to map each school to its state and project; the Report tab is not needed at all.

- **One school counts once per day**, however many people logged a visit to it. Same rule as the Report tab's `COUNTIFS(... > 0)`.
- A school lands in a column when its **state** matches and the column's **project** is either `All` or the school's own `po.name` (from School Details).
- **Grand Total** copies the sheet's own formula, which adds columns E–Q and so leaves out the first two (Andhra Pradesh and Bihar). Switch the dropdown to *Add up every column* for the honest total.
- **Average %Visits** = visits in the period ÷ (Total SS × days × 6/7) — the Report tab's formula. *Total SS* starts from the values in the Report tab as of 11 Sep 2026; edit any of them in the table and the change is remembered on that device.
- Log rows with no school in brackets (project coordination, leave, and so on) are skipped. School codes that aren't in School Details are skipped too, and both counts are shown above the table.
- Dates are read day-first: `05/09/2026` is 5 September. Entries dated after today are counted and flagged above the table — the log had one row typed as 18 Sep 2026.
- The default range is the last full Saturday–Friday week up to today, so a future-dated typo can't drag it forward.

Until an export is loaded the page shows clearly-marked example numbers, and copying and downloading are switched off so sample figures cannot reach a real report by accident. A chip above the table always states the date range the loaded data actually covers.

Checked against the live workbook: for 5–11 Sep 2026 the page produces 19 / 0 / 28 / 31 / 25 / 26 / 20 school-days, matching an independent count of the same file.

## Mapping to fix

The page also lists the visits it cannot place, across the whole export — this is the part that used to be done by eye:

- **Schools missing from School Details** — school codes that appear in the master sheet but have no mapping row, with the name as typed in the log, how many entries, and when they were first and last seen. Copy the list or download it as CSV, add those rows to School Details, and the visits start counting. In the current export there are 12 such codes (19 entries).
- **Entries with no school code** — a school was typed into *School Code and Name* without any code, so nobody can count it. The list groups them by what was typed, with who logged it, how many entries, the dates, and the closest school name in School Details as a suggestion to check (never counted automatically). The current export has 19 such texts over 35 rows; `Gps Sharai Shuhawal` alone accounts for 12.
- **Mapped schools with no column in the report** — schools that *are* mapped, but whose state/project pair has no column, so their visits land nowhere. The current export has two: Telangana / Cognizant (14 schools, 46 entries) and Punjab / Govt Led P&G (1 school, 7 entries). The Zoho Report tab has the same blind spot, since it uses the same columns.

Both lists are also added as extra sheets to the Excel download.

### Timezones (fixed in v11 — do not undo)

`.xlsx` files are read with `cellDates: false`, so date cells arrive as raw Excel serial
numbers and `toISO()` converts them with UTC arithmetic. **Do not switch `cellDates` back on.**
With `cellDates: true` SheetJS builds a local-time `Date`, and in several zones — India among
them — that lands a few seconds *before* midnight (`Fri Oct 02 2026 23:59:50 GMT+0530` for a
cell reading 03-Oct). Truncating that to a date gives the previous day, so every visit was
counted one day early and the newest day in the file always read zero. It is invisible in UTC,
which is why it survived several rounds of testing.

`toISO()` also rounds a `Date` to the nearest midnight rather than truncating, as a second line
of defence for dates that arrive from anywhere else.

Run the suite under a non-UTC zone before shipping a date change:

```bash
node test.js
TZ=Asia/Kolkata node test.js
TZ=America/Los_Angeles node test.js
```

## Maintenance

- **Columns are built in** (15 project/state columns, matching the Report tab as of 11 Sep 2026). To change them, edit `DEFAULT_TEMPLATE` in `report.js`. Dropping a Report tab CSV also overrides them for that session, but it is not needed.
- **Logic changes:** edit `report.js` and run `node test.js` before pushing.
- The page loads SheetJS 0.18.5 from cdnjs for `.xlsx` reading and writing. CSV reading and the report itself work even if that script is blocked.
