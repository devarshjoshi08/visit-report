/* node test.js — checks the report logic against a synthetic copy of the tracker's layout */
const V = require('./report.js');
let pass = 0, fail = 0;
function eq(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  ok  ' + label); }
  else { fail++; console.log('  FAIL ' + label + '\n       got  ' + g + '\n       want ' + w); }
}

/* ---- synthetic School Details (same headers as the real tab) ---- */
const schoolsCSV = [
  'SL No,schoolCode,name,medium,state,city,district,ward,connectivity,dualLogin,po.name,School code and Name',
  '1,111111,GPS Alpha,Hindi,Himachal Pradesh,,Shimla,,,,Prevail,(111111) GPS Alpha',
  '2,222222,GPS Beta,Hindi,Himachal Pradesh,,Shimla,,,,P&G,(222222) GPS Beta',
  '3,333333,GHS Gamma,Hindi,Rajasthan,,Jaipur,,,,P&G,(333333) GHS Gamma',
  '4,444444,ZPHS Delta,Telugu,Telangana,,Khammam,,,,Amazon Future Engineer,(444444) ZPHS Delta',
  '5,555555,GSSS Epsilon,Hindi,Himachal Pradesh,,Mandi,,,,Bharat EdTech Initiatives,(555555) GSSS Epsilon'
].join('\n');

/* ---- synthetic Report tab (columns C..R as in the real sheet) ---- */
const reportCSV = [
  ',Project name,All,All,P&G,Bharat EdTech Initiatives,Prevail,All,All,All,P&G,ITC Punjab,All,P&G,Amazon Future Engineer,All,All,',
  ',State,Andhra Pradesh,Bihar,Himachal Pradesh,Himachal Pradesh,Himachal Pradesh,Karnataka,Madhya Pradesh,Maharashtra,Punjab,Punjab,Rajasthan,Telangana,Telangana,Uttarakhand,Gujarat,Grand Total',
  ',Total SS,,7,52,33,42,1,2,9,9,2,21,68,85,0,15,346',
  ',#Holidays,,10,0,0,0,0,0,0,0,0,0,0,0,0,0,'
].join('\n');

/* ---- synthetic activity log: mixed date formats, duplicates, junk rows ---- */
const logCSV = [
  'Added Time,SchoolCode,Project name,Name,HRMS ID,Mail ID,Reporting Manager,Date,Work Done on the Day,In Time,Out Time,School Code and Name',
  'x,,,A,EI1,,,05-Sep-2026,School Visit,09:00 AM,3:00 PM,(111111) GPS Alpha',
  'x,,,B,EI2,,,05-Sep-2026,School Visit,09:00 AM,3:00 PM,(111111) GPS Alpha',   // same school, same day -> 1
  'x,,,C,EI3,,,05-Sep-2026,School Visit,09:00 AM,3:00 PM,(222222) GPS Beta',
  'x,,,D,EI4,,,6/9/2026,School Visit,09:00 AM,3:00 PM,(333333) GHS Gamma',       // day-first text date
  'x,,,E,EI5,,,46272,School Visit,09:00 AM,3:00 PM,(444444) ZPHS Delta',         // Excel serial = 07-Sep-2026
  'x,,,F,EI6,,,07-Sep-2026,School Visit,09:00 AM,3:00 PM,(555555) GSSS Epsilon',
  'x,,,G,EI7,,,07-Sep-2026,School Visit,09:00 AM,3:00 PM,(999999) Unknown School', // not in School Details
  'x,,,H,EI8,,,07-Sep-2026,Project Coordinations / Others,,,',                    // no school
  'x,,,I,EI9,,,12-Sep-2026,School Visit,09:00 AM,3:00 PM,(111111) GPS Alpha',     // outside range
  'x,,,J,EI10,,,04-Sep-2026,School Visit,09:00 AM,3:00 PM,(111111) GPS Alpha'     // outside range
].join('\n');

console.log('date parsing');
eq('serial 46272', V.toISO(46272), '2026-09-07');
eq('text 05-Sep-2026', V.toISO('05-Sep-2026'), '2026-09-05');
eq('text 6/9/2026 day-first', V.toISO('6/9/2026'), '2026-09-06');
eq('text 2026-09-08', V.toISO('2026-09-08'), '2026-09-08');
eq('text 21/9/2026 day-first', V.toISO('21/9/2026'), '2026-09-21');
eq('Date object', V.toISO(new Date(2026, 8, 9)), '2026-09-09');
eq('blank', V.toISO(''), null);

console.log('sheet recognition');
eq('log', V.classify(V.parseCSV(logCSV), 'Daily Activity tracker 01 Oct'), 'log');
eq('schools', V.classify(V.parseCSV(schoolsCSV), 'School Details'), 'schools');
eq('report', V.classify(V.parseCSV(reportCSV), 'Report'), 'report');

/* the staff list also carries a "Project Name" header — it must never look like the report */
const ssDetailsCSV = [
  'Emp No,Name,Reporting Manager,Official Email,Mobile No,Personal Email Address,Organization Left,District,Location,State,Model of Implementation,Number of Schools,Number of Students,Project Manager,Project Name,SBU Name',
  'EI-OPS-001,Saurav Kumar,Anil Mishra,a@example.com,9142347718,,No,Patna,Bangalore,Bihar,At School,,,Naman Kumar,Great Ship CSR Foundation,Ei Shiksha',
  'EI-OPS-002,Rishav Kumar,Anil Mishra,b@example.com,6201370080,,No,Patna,Bangalore,Bihar,At School,,,Naman Kumar,Great Ship CSR Foundation,Ei Shiksha'
].join('\n');
eq('SS Details is ignored', V.classify(V.parseCSV(ssDetailsCSV), 'SS Details'), null);
eq('SS Details ignored even when the file is named after the workbook',
  V.classify(V.parseCSV(ssDetailsCSV), 'Daily Activity tracker from 01 Oct 25.csv'), null);
eq('a sheet with State but no Grand Total is not a template',
  V.classify(V.parseCSV('a,b,c\nx,State,y\n1,2,3'), 'Something else'), null);

const log = V.parseLog(V.parseCSV(logCSV));
const sd = V.parseSchools(V.parseCSV(schoolsCSV));
const tpl = V.parseTemplate(V.parseCSV(reportCSV));

console.log('parsing');
eq('visits parsed', log.visits.length, 9);
eq('rows without a school skipped', log.skippedNoSchool, 1);
eq('schools parsed', sd.count, 5);
eq('template columns', tpl.columns.length, 15);
eq('template Total SS for Prevail HP', tpl.columns[4].totalSS, 42);
eq('grand total skips first two columns', tpl.sheetGrandTotalSkips, 2);

const rep = V.build({ visits: log.visits, schools: sd.schools, template: tpl, from: '2026-09-05', to: '2026-09-11' });
const colOf = (project, state) => tpl.columns.findIndex(c => c.project === project && c.state === state);

console.log('counting');
eq('7 days', rep.dates.length, 7);
eq('duplicate school-day counted once', rep.grid[0][colOf('Prevail', 'Himachal Pradesh')], 1);
eq('P&G HP on 05 Sep', rep.grid[0][colOf('P&G', 'Himachal Pradesh')], 1);
eq('Rajasthan All on 06 Sep', rep.grid[1][colOf('All', 'Rajasthan')], 1);
eq('Amazon Telangana on 07 Sep (serial date)', rep.grid[2][colOf('Amazon Future Engineer', 'Telangana')], 1);
eq('Bharat HP on 07 Sep', rep.grid[2][colOf('Bharat EdTech Initiatives', 'Himachal Pradesh')], 1);
eq('P&G Telangana stays 0 (project must match)', rep.colTotal[colOf('P&G', 'Telangana')], 0);
eq('dates outside the range ignored', rep.colTotal.reduce((a, b) => a + b, 0), 5);
eq('unknown school code reported', rep.stats.unknownCodes, 1);
eq('school-days in range', rep.stats.schoolDays, 5);

console.log('totals');
eq('row total 05 Sep', rep.rowTotal[0], 2);
eq('row total 07 Sep', rep.rowTotal[2], 2);
eq('grand total (sheet rule)', rep.grandTotal, 5);
const repAll = V.build({ visits: log.visits, schools: sd.schools, template: tpl, from: '2026-09-05', to: '2026-09-11', grandTotalAllColumns: true });
eq('grand total (all columns) same here', repAll.grandTotal, 5);

console.log('average %visits');
const prevail = colOf('Prevail', 'Himachal Pradesh');
eq('Prevail HP average', Number((rep.avg[prevail] * 100).toFixed(4)), Number((1 / (42 * 7 * 6 / 7) * 100).toFixed(4)));
eq('column with Total SS 0 gives no average', rep.avg[colOf('All', 'Uttarakhand')], null);

console.log('output');
const m = V.toMatrix(rep);
eq('matrix rows = 4 header + 7 days + total', m.length, 12);
eq('header states row', m[1][2], 'Andhra Pradesh');
eq('first day row label', m[4][1], '05 Sep 2026');
eq('last row is the period total', m[11][1], 'Total for period');
eq('TSV has tabs', V.toTSV(rep).split('\n')[4].indexOf('\t') > -1, true);

console.log('fallback template');
const rep2 = V.build({ visits: log.visits, schools: sd.schools, from: '2026-09-05', to: '2026-09-11' });
eq('built-in template still counts', rep2.colTotal.reduce((a, b) => a + b, 0), 5);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
