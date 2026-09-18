#!/usr/bin/env python3
"""Build schools.csv (the school -> state / project mapping) from ClickHouse.

Drop the resulting schools.csv next to index.html in the GitHub Pages repo and the
page picks it up on its own — the weekly job then only needs the tracker export.

    export CH_HOST=10.0.4.183 CH_USER=readonly CH_PASSWORD=...
    python3 tools/fetch_mapping.py --describe          # see the columns first
    python3 tools/fetch_mapping.py --sql my_query.sql  # write schools.csv
    python3 tools/fetch_mapping.py --check schools.csv School_Details.csv   # compare with the sheet

Read-only: it only runs SELECT/DESCRIBE.
"""

import argparse, csv, os, sys, urllib.parse, urllib.request

HOST = os.environ.get("CH_HOST", "10.0.4.183")
PORT = os.environ.get("CH_PORT", "8123")
USER = os.environ.get("CH_USER", "devarsh_clickhouse")
PASSWORD = os.environ.get("CH_PASSWORD", "D3v@r5h_c1!ckh0us3")
DATABASE = os.environ.get("CH_DB", "default")

# Devarsh's mapping query: Ei Shiksha schools that are active, under a paid parent
# organisation. `po.name` in School Details is the parent organisation's name.
# The outer LIMIT 1 BY keeps one row per school code — schools is a
# ReplacingMergeTree, so the same school can sit in the table more than once until
# its parts merge, and the newest lastModified is the row you want.
DEFAULT_SQL = """
SELECT schoolCode, name, district, state, `po.name`
FROM (
    SELECT
        s.schoolCode   AS schoolCode,
        s.name         AS name,
        s.district     AS district,
        s.state        AS state,
        po.name        AS `po.name`,
        s.lastModified AS lastModified
    FROM schools s
    JOIN parentOrganizations po ON po.parentOrgId = s.parentOrgId
    WHERE s.SBU = 'Ei Shiksha' AND s.isActive = true AND po.category = 'paid'
    ORDER BY lastModified DESC
)
WHERE schoolCode NOT IN ('', 'None', 'nan')
LIMIT 1 BY schoolCode
SETTINGS max_execution_time = 120
"""


def run(sql, fmt="TabSeparatedWithNames"):
    query = sql.strip().rstrip(";") + "\nFORMAT " + fmt
    url = "http://%s:%s/?%s" % (HOST, PORT, urllib.parse.urlencode({"database": DATABASE}))
    req = urllib.request.Request(url, data=query.encode("utf-8"))
    req.add_header("X-ClickHouse-User", USER)
    if PASSWORD:
        req.add_header("X-ClickHouse-Key", PASSWORD)
    try:
        with urllib.request.urlopen(req, timeout=180) as res:
            return res.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        sys.exit("ClickHouse said no:\n" + e.read().decode("utf-8", "replace")[:2000])
    except Exception as e:
        sys.exit("Could not reach ClickHouse at %s:%s — %s\n"
                 "Are you on the office network or VPN?" % (HOST, PORT, e))


def describe():
    for table in ("schools", "parentOrganizations"):
        print("=== %s ===" % table)
        print(run("DESCRIBE TABLE %s" % table))
        print("--- sample row ---")
        print(run("SELECT * FROM %s LIMIT 1 FORMAT Vertical".replace(" FORMAT Vertical", "") % table, "Vertical"))


def load_aliases(path):
    """Optional two-column CSV (from,to) for when the warehouse spells a project
    differently from the report columns, e.g. 'Prevail Fund' -> 'Prevail'."""
    if not path:
        return {}
    out = {}
    with open(path, newline="", encoding="utf-8-sig") as f:
        for row in csv.reader(f):
            if len(row) >= 2 and row[0].strip() and row[0].strip().lower() != "from":
                out[row[0].strip().lower()] = row[1].strip()
    print("loaded %d project aliases" % len(out))
    return out


def write_csv(rows, path, aliases=None):
    """Same column names the page already reads from a School Details export."""
    aliases = aliases or {}
    header = ["schoolCode", "name", "district", "state", "po.name", "School code and Name"]
    seen = set()
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        written = 0
        for r in rows:
            code = (r.get("schoolCode") or "").strip()
            if code.endswith(".0"):
                code = code[:-2]
            if not code.isdigit() or code in seen:
                continue
            seen.add(code)
            name = (r.get("name") or "").strip()
            project = (r.get("po.name") or "").strip()
            project = aliases.get(project.lower(), project)
            w.writerow([code, name, (r.get("district") or "").strip(), (r.get("state") or "").strip(),
                        project, "(%s) %s" % (code, name)])
            written += 1
    print("wrote %s — %d schools (%d rows from ClickHouse)" % (path, written, len(rows)))


def parse_tsv(text):
    lines = text.rstrip("\n").split("\n")
    if not lines or not lines[0]:
        return []
    cols = lines[0].split("\t")
    return [dict(zip(cols, line.split("\t"))) for line in lines[1:]]


def check(mapping_path, details_path):
    """Compare a generated mapping against a School Details export, so a wrong
    column choice shows up as a difference rather than as quietly wrong numbers."""
    def load(path, code_col, state_col, proj_col):
        out = {}
        with open(path, newline="", encoding="utf-8-sig") as f:
            for row in csv.DictReader(f):
                code = (row.get(code_col) or "").strip()
                if code.endswith(".0"):
                    code = code[:-2]
                if code.isdigit():
                    out[code] = ((row.get(state_col) or "").strip().lower(),
                                 (row.get(proj_col) or "").strip().lower())
        return out
    a = load(mapping_path, "schoolCode", "state", "po.name")
    b = load(details_path, "schoolCode", "state", "po.name")
    only_a, only_b = set(a) - set(b), set(b) - set(a)
    differ = [c for c in set(a) & set(b) if a[c] != b[c]]
    print("ClickHouse mapping: %d schools | School Details: %d schools" % (len(a), len(b)))
    print("only in ClickHouse: %d | only in School Details: %d | state or project differs: %d"
          % (len(only_a), len(only_b), len(differ)))
    for c in list(differ)[:10]:
        print("   %s  ClickHouse %s  vs  sheet %s" % (c, a[c], b[c]))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--describe", action="store_true", help="print the columns of schools and parentOrganizations")
    ap.add_argument("--sql", help="file with your own SELECT (must return schoolCode, name, state, po.name)")
    ap.add_argument("--out", default="schools.csv", help="where to write the mapping (default schools.csv)")
    ap.add_argument("--alias", help="CSV of from,to project-name fixes applied to po.name")
    ap.add_argument("--check", nargs=2, metavar=("MAPPING_CSV", "SCHOOL_DETAILS_CSV"),
                    help="compare a generated mapping with a School Details export")
    args = ap.parse_args()

    if args.check:
        check(*args.check)
    elif args.describe:
        describe()
    else:
        sql = open(args.sql, encoding="utf-8").read() if args.sql else DEFAULT_SQL
        write_csv(parse_tsv(run(sql)), args.out, load_aliases(args.alias))
