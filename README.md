# School Visit Report Builder

A single web page that rebuilds the **Report** table from the *Daily Activity tracker from 01 Oct 25* Zoho sheet for any date range you pick — schools visited per day, split by project and state.

Everything runs in the browser. No server, no Zoho login, no data leaves the device.

## Files

| File | What it is |
|---|---|
| `index.html` | The page: file loading, date range, table, copy/download buttons |
| `report.js` | The counting logic, kept separate so it can be tested |
| `test.js` | `node test.js` — checks the logic against a synthetic tracker layout |
| `tools/fetch_mapping.py` | builds `schools.csv` from ClickHouse, so the mapping refreshes itself |
| `schools.csv` *(optional)* | if present next to `index.html`, the page loads it as the mapping on open |

## Put it online (GitHub Pages)

1. Create a new **public** repository, e.g. `visit-report`.
2. Upload `index.html` and `report.js` to the root of the `main` branch (`test.js` is optional).
3. **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, folder = `/ (root)`. Save.
4. After a minute the link appears at the top of that Pages screen: `https://<your-user>.github.io/visit-report/`. Share that link — anyone who opens it gets the tool, and their files stay on their own machine.

## Weekly use

1. In the Zoho sheet, **File → Download as → CSV** on the **Daily Activity tracker 01 Oct** tab — the master sheet the form writes into — then the same on **School Details**. Those two are all it needs.
2. Open the page, drop the CSV files on it.
3. Pick the range — *Last full Saturday – Friday week* is the default — or set any From/To dates.
4. **Copy table** puts it on the clipboard ready to paste into Excel, Zoho Sheet or an email. **Download Excel** gives a workbook with the report, the school-by-school list, and the two mapping lists below when they are not empty.
5. Delete the CSV downloads afterwards if you prefer not to keep them.

The page remembers the last load on that device, so reopening it shows the same data without loading files again — use **Forget the saved export** to clear it.

A full `.xlsx` download of the workbook also works (the whole workbook is about 5.5 MB), but the sheet's formula grid makes it slow to open in a browser. The two CSVs are a second's work.

Sheets are recognised by shape, not by file name, so you can drop every tab at once. The **SS Details** staff list is ignored on purpose: it also has a "Project Name" column, and an earlier version mistook it for the Report template and produced a table of zeros.

### Automatic mapping (optional)

If a file called `schools.csv` sits next to `index.html` in the repo, the page fetches it on open and uses it as the school → state/project mapping. The weekly job is then just the tracker export; School Details no longer has to be downloaded at all, and dropping one in still overrides the published mapping for that session.

`tools/fetch_mapping.py` generates that file from ClickHouse:

```bash
export CH_HOST=10.0.4.183 CH_USER=<read-only user> CH_PASSWORD=...
python3 tools/fetch_mapping.py --describe              # confirm the column names first
python3 tools/fetch_mapping.py --out schools.csv       # write the mapping
python3 tools/fetch_mapping.py --check schools.csv School_Details.csv   # compare with the sheet
```

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

Commit the generated `schools.csv` on a schedule (cron, or a GitHub Action on a weekly trigger) and the page is always current.

ClickHouse lives on an internal address, so the browser cannot query it directly from GitHub Pages — generating the CSV on a machine that can reach it, and publishing that, is what makes this work without putting database credentials in a public page.

### No download at all (optional)

If the sheet owner publishes those two tabs in Zoho (**File → Publish**) and gives you the CSV links, paste them under *"Or pull from published links"* and the page fetches them itself. Zoho has to allow the page to read those links; if it refuses, the CSV route above still works.

## How the numbers are produced

Everything is counted from the **master sheet** (*Daily Activity tracker 01 Oct*). The school code is read out of the brackets in *School Code and Name*, so the sheet's own helper column (B) is not used and its `#VALUE!` rows do not matter. **School Details** is read only to map each school to its state and project; the Report tab is not needed at all.

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
- **Mapped schools with no column in the report** — schools that *are* mapped, but whose state/project pair has no column, so their visits land nowhere. The current export has two: Telangana / Cognizant (14 schools, 46 entries) and Punjab / Govt Led P&G (1 school, 7 entries). The Zoho Report tab has the same blind spot, since it uses the same columns.

Both lists are also added as extra sheets to the Excel download.

## Maintenance

- **Columns are built in** (15 project/state columns, matching the Report tab as of 11 Sep 2026). To change them, edit `DEFAULT_TEMPLATE` in `report.js`. Dropping a Report tab CSV also overrides them for that session, but it is not needed.
- **Logic changes:** edit `report.js` and run `node test.js` before pushing.
- The page loads SheetJS 0.18.5 from cdnjs for `.xlsx` reading and writing. CSV reading and the report itself work even if that script is blocked.
