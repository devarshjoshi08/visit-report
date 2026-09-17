/* School Visit Report — core logic (no DOM, no dependencies).
   Works on arrays-of-arrays, so the same code serves CSV text and SheetJS output. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VisitReport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- small helpers ---------- */
  var norm = function (v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); };
  var key = function (v) { return norm(v).toLowerCase(); };
  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };

  function iso(y, m, d) {
    if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
    if (y < 100) y += 2000;
    return y + '-' + pad(m) + '-' + pad(d);
  }

  /* Excel/Zoho dates arrive as Date objects, serial numbers or text.
     Text is read day-first (05/09/2026 = 5 September), which is how the tracker writes them. */
  function toISO(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date && !isNaN(value)) return iso(value.getFullYear(), value.getMonth() + 1, value.getDate());
    if (typeof value === 'number' && isFinite(value)) {
      if (value < 1 || value > 80000) return null;
      var ms = Math.round((value - 25569) * 86400000);
      var d = new Date(ms);
      return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    var s = norm(value);
    if (!s) return null;
    if (/^\d{5}(\.\d+)?$/.test(s)) return toISO(Number(s)); // serial that arrived as text
    var m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return iso(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,})[-/ ](\d{2,4})/))) {
      var mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
      return mo ? iso(+m[3], mo, +m[1]) : null;
    }
    if ((m = s.match(/^([A-Za-z]{3,})[-/ ](\d{1,2})[,]?[-/ ](\d{2,4})/))) {
      var mo2 = MONTHS[m[1].slice(0, 3).toLowerCase()];
      return mo2 ? iso(+m[3], mo2, +m[2]) : null;
    }
    if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) {
      var a = +m[1], b = +m[2];
      if (a > 12 && b <= 12) return iso(+m[3], b, a);
      if (b > 12 && a <= 12) return iso(+m[3], a, b);
      return iso(+m[3], b, a); // day-first
    }
    return null;
  }

  function isoToLabel(isoDate) {
    var p = String(isoDate).split('-');
    var names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return p[2] + ' ' + names[+p[1] - 1] + ' ' + p[0];
  }

  function datesBetween(from, to) {
    var out = [], d = new Date(from + 'T00:00:00Z'), end = new Date(to + 'T00:00:00Z');
    while (d <= end) {
      out.push(iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()));
      d.setUTCDate(d.getUTCDate() + 1);
      if (out.length > 1000) break;
    }
    return out;
  }

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    var rows = [], row = [], cell = '', q = false, i, ch;
    text = String(text).replace(/^﻿/, '');
    for (i = 0; i < text.length; i++) {
      ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"' && cell === '') q = true;
      else if (ch === ',' || ch === '\t') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (ch !== '\r') cell += ch;
    }
    row.push(cell);
    rows.push(row);
    while (rows.length && rows[rows.length - 1].every(function (c) { return norm(c) === ''; })) rows.pop();
    return rows;
  }

  /* ---------- sheet recognition ---------- */
  function headerIndex(rows, wanted) {
    var head = (rows[0] || []).map(key);
    for (var i = 0; i < head.length; i++) if (wanted.indexOf(head[i]) !== -1) return i;
    return -1;
  }

  function classify(rows, sheetName) {
    var head = (rows[0] || []).map(key);
    var has = function () {
      var args = Array.prototype.slice.call(arguments);
      return args.every(function (h) { return head.indexOf(h) !== -1; });
    };
    var row2 = (rows[1] || []).map(key);
    var row3 = (rows[2] || []).map(key);
    var name = key(sheetName || '').replace(/\.(csv|tsv|xlsx|xls)$/, '');

    /* The shape tests have to be strict. The SS Details tab (the staff list) also carries a
       "Project Name" header, and a loose test picked it up as the Report template, which
       produced a table full of zeros. */
    if (has('emp no') || name.indexOf('ss details') === 0) return null;

    if (has('school code and name') && (has('date') || has('added time'))) return 'log';
    if (has('schoolcode') && has('po.name')) return 'schools';
    if ((row2.indexOf('state') !== -1 && row2.indexOf('grand total') !== -1) || row3.indexOf('total ss') !== -1) return 'report';

    if (name.indexOf('daily activity') === 0) return 'log';
    if (name.indexOf('school details') === 0) return 'schools';
    if (name === 'report') return 'report';
    return null;
  }

  /* ---------- parsing ---------- */
  function extractCode(value) {
    var m = String(value == null ? '' : value).match(/\((\d+)\)/);
    return m ? m[1] : null;
  }

  function parseLog(rows) {
    var dateCol = headerIndex(rows, ['date']);
    var schoolCol = headerIndex(rows, ['school code and name']);
    if (dateCol < 0) dateCol = 7;      // column H in the tracker
    if (schoolCol < 0) schoolCol = 11; // column L
    var visits = [], skippedNoDate = 0, skippedNoSchool = 0;
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var d = toISO(row[dateCol]);
      var code = extractCode(row[schoolCol]);
      if (!d) { if (norm(row[schoolCol])) skippedNoDate++; continue; }
      if (!code) { skippedNoSchool++; continue; }
      visits.push({ date: d, code: code });
    }
    return { visits: visits, skippedNoDate: skippedNoDate, skippedNoSchool: skippedNoSchool };
  }

  function parseSchools(rows) {
    var codeCol = headerIndex(rows, ['schoolcode', 'school code']);
    var stateCol = headerIndex(rows, ['state']);
    var projCol = headerIndex(rows, ['po.name', 'project', 'project name']);
    var labelCol = headerIndex(rows, ['school code and name']);
    var nameCol = headerIndex(rows, ['name', 'school name']);
    var map = {}, count = 0;
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var code = null;
      if (codeCol >= 0 && norm(row[codeCol]) && /^\d+$/.test(norm(row[codeCol]))) code = norm(row[codeCol]);
      if (!code && labelCol >= 0) code = extractCode(row[labelCol]);
      if (!code) continue;
      if (map[code]) continue;
      map[code] = {
        state: key(stateCol >= 0 ? row[stateCol] : ''),
        project: key(projCol >= 0 ? row[projCol] : ''),
        label: norm(labelCol >= 0 ? row[labelCol] : (nameCol >= 0 ? row[nameCol] : code)) || code,
        stateLabel: norm(stateCol >= 0 ? row[stateCol] : ''),
        projectLabel: norm(projCol >= 0 ? row[projCol] : '')
      };
      count++;
    }
    return { schools: map, count: count };
  }

  /* Report tab: row 1 = project, row 2 = state, row 3 = Total SS. */
  function parseTemplate(rows) {
    var r1 = rows[0] || [], r2 = rows[1] || [], r3 = rows[2] || [];
    var cols = [], grandTotalAt = -1;
    for (var c = 0; c < Math.max(r1.length, r2.length); c++) {
      var st = norm(r2[c]);
      if (!st) continue;
      if (key(st) === 'state') continue;
      if (key(st) === 'grand total') { grandTotalAt = c; continue; }
      var ss = Number(String(r3[c]).replace(/[^0-9.-]/g, ''));
      cols.push({
        project: norm(r1[c]) || 'All',
        state: st,
        totalSS: isFinite(ss) ? ss : 0,
        sheetCol: c
      });
    }
    if (!cols.length) return null;
    // The sheet's Grand Total formula is SUM(E:Q) — it leaves out the first two data columns.
    var skip = 0;
    if (grandTotalAt > -1) {
      var firstCol = cols[0].sheetCol;
      skip = Math.max(0, Math.min(2, cols.length - 1));
      if (firstCol >= 4) skip = 0;
    }
    return { columns: cols, sheetGrandTotalSkips: skip };
  }

  var DEFAULT_TEMPLATE = {
    columns: [
      { project: 'All', state: 'Andhra Pradesh', totalSS: 0 },
      { project: 'All', state: 'Bihar', totalSS: 7 },
      { project: 'P&G', state: 'Himachal Pradesh', totalSS: 52 },
      { project: 'Bharat EdTech Initiatives', state: 'Himachal Pradesh', totalSS: 33 },
      { project: 'Prevail', state: 'Himachal Pradesh', totalSS: 42 },
      { project: 'All', state: 'Karnataka', totalSS: 1 },
      { project: 'All', state: 'Madhya Pradesh', totalSS: 2 },
      { project: 'All', state: 'Maharashtra', totalSS: 9 },
      { project: 'P&G', state: 'Punjab', totalSS: 9 },
      { project: 'ITC Punjab', state: 'Punjab', totalSS: 2 },
      { project: 'All', state: 'Rajasthan', totalSS: 21 },
      { project: 'P&G', state: 'Telangana', totalSS: 68 },
      { project: 'Amazon Future Engineer', state: 'Telangana', totalSS: 85 },
      { project: 'All', state: 'Uttarakhand', totalSS: 0 },
      { project: 'All', state: 'Gujarat', totalSS: 15 }
    ],
    sheetGrandTotalSkips: 2,
    isDefault: true
  };

  /* ---------- the report ---------- */
  function build(opts) {
    var visits = opts.visits || [];
    var schools = opts.schools || {};
    var template = opts.template || DEFAULT_TEMPLATE;
    var cols = template.columns;
    var dates = datesBetween(opts.from, opts.to);
    var skips = opts.grandTotalAllColumns ? 0 : (template.sheetGrandTotalSkips || 0);
    var totalSS = opts.totalSS || cols.map(function (c) { return c.totalSS || 0; });

    var index = {};
    dates.forEach(function (d, i) { index[d] = i; });

    var grid = dates.map(function () { return cols.map(function () { return 0; }); });
    var seen = {}, unknown = {}, visitRows = 0, schoolDays = 0, detail = [];

    visits.forEach(function (v) {
      var di = index[v.date];
      if (di === undefined) return;
      var school = schools[v.code];
      if (!school) { unknown[v.code] = (unknown[v.code] || 0) + 1; return; }
      visitRows++;
      var k = v.code + '|' + v.date;
      if (seen[k]) return;
      seen[k] = true;
      schoolDays++;
      detail.push({ date: v.date, code: v.code, label: school.label, state: school.stateLabel, project: school.projectLabel });
      cols.forEach(function (col, ci) {
        if (key(col.state) !== school.state) return;
        if (key(col.project) !== 'all' && key(col.project) !== school.project) return;
        grid[di][ci]++;
      });
    });

    var rowTotal = grid.map(function (row) {
      return row.reduce(function (sum, n, i) { return i < skips ? sum : sum + n; }, 0);
    });
    var colTotal = cols.map(function (_, ci) {
      return grid.reduce(function (sum, row) { return sum + row[ci]; }, 0);
    });
    var grandTotal = colTotal.reduce(function (sum, n, i) { return i < skips ? sum : sum + n; }, 0);

    // Average %Visits — the Report tab's own formula: sum of the period / (Total SS x days x 6/7)
    var days = dates.length;
    var avg = cols.map(function (_, ci) {
      var ss = Number(totalSS[ci]) || 0;
      if (!ss || !days) return null;
      return colTotal[ci] / (ss * days * 6 / 7);
    });
    var ssTotal = totalSS.reduce(function (s, n, i) { return i < skips ? s : s + (Number(n) || 0); }, 0);
    var avgGrand = ssTotal && days ? grandTotal / (ssTotal * days * 6 / 7) : null;

    detail.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.label.localeCompare(b.label); });

    return {
      dates: dates,
      dateLabels: dates.map(isoToLabel),
      columns: cols,
      totalSS: totalSS,
      grid: grid,
      rowTotal: rowTotal,
      colTotal: colTotal,
      grandTotal: grandTotal,
      avg: avg,
      avgGrand: avgGrand,
      detail: detail,
      stats: {
        days: days,
        visitRows: visitRows,
        schoolDays: schoolDays,
        distinctSchools: Object.keys(detail.reduce(function (m, d) { m[d.code] = 1; return m; }, {})).length,
        unknownCodes: Object.keys(unknown).length,
        unknownVisits: Object.keys(unknown).reduce(function (s, k2) { return s + unknown[k2]; }, 0),
        grandTotalSkips: skips
      }
    };
  }

  /* ---------- output shapes ---------- */
  function toMatrix(report, opts) {
    opts = opts || {};
    var rows = [];
    var head1 = ['', 'Project name'].concat(report.columns.map(function (c) { return c.project; })).concat(['']);
    var head2 = ['', 'State'].concat(report.columns.map(function (c) { return c.state; })).concat(['Grand Total']);
    var head3 = ['', 'Total SS'].concat(report.totalSS).concat([report.totalSS.reduce(function (s, n) { return s + (Number(n) || 0); }, 0)]);
    var head4 = ['', 'Average %Visits (' + report.dateLabels[0] + ' - ' + report.dateLabels[report.dateLabels.length - 1] + ')']
      .concat(report.avg.map(function (v) { return v == null ? '' : (opts.rawPercent ? v : (v * 100).toFixed(2) + '%'); }))
      .concat([report.avgGrand == null ? '' : (opts.rawPercent ? report.avgGrand : (report.avgGrand * 100).toFixed(2) + '%')]);
    rows.push(head1, head2, head3, head4);
    report.dates.forEach(function (d, i) {
      rows.push(['', report.dateLabels[i]].concat(report.grid[i]).concat([report.rowTotal[i]]));
    });
    rows.push(['', 'Total for period'].concat(report.colTotal).concat([report.grandTotal]));
    return rows;
  }

  function toTSV(report) {
    return toMatrix(report).map(function (r) { return r.join('\t'); }).join('\n');
  }

  return {
    parseCSV: parseCSV,
    classify: classify,
    parseLog: parseLog,
    parseSchools: parseSchools,
    parseTemplate: parseTemplate,
    build: build,
    toMatrix: toMatrix,
    toTSV: toTSV,
    toISO: toISO,
    isoToLabel: isoToLabel,
    datesBetween: datesBetween,
    DEFAULT_TEMPLATE: DEFAULT_TEMPLATE
  };
});
