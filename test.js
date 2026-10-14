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
eq('log rows with no school at all', log.blankSchool, 1);
eq('no entries are missing a code in this fixture', log.skippedNoSchool, 0);
eq('all codes read from brackets', log.byRule.brackets, 9);
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

console.log('reading the school code out of column L');
eq('brackets at the start', V.extractCode('(122878) G.Sr.Sec.S.Varda').code, '122878');
eq('brackets at the end — the sheet formula fails on these',
  V.extractCode('GPS Jhaldi Kanot (844247693)').code, '844247693');
eq('brackets with no space', V.extractCode('Gps Denwari(516114340)').code, '516114340');
eq('bare digits in the text', V.extractCode('Gps bhargaon  844247679').code, '844247679');
eq('bare digits rule is labelled', V.extractCode('331068623.0').how, 'bare digits');
eq('a name with no code at all', V.extractCode('Gps Sharai Shuhawal'), null);
eq('a bracketed name is not mistaken for a code', V.extractCode('GPS (New Block) Sundar (171904)').code, '171904');

/* entries typed without a code are collected, not silently dropped */
const messyCSV = logCSV + [
  '',
  'x,,,Nitin Sharma,EI20,,,09-Sep-2026,School Visit,09:00 AM,3:00 PM,GPS Alpha',
  'x,,,Nitin Sharma,EI20,,,10-Sep-2026,School Visit,09:00 AM,3:00 PM,GPS Alpha',
  'x,,,Jyoti,EI21,,,08-Sep-2026,School Visit,09:00 AM,3:00 PM,GPS Beta 222222'
].join('\n');
const messy = V.parseLog(V.parseCSV(messyCSV));
eq('bare-digit entry is counted as a visit', messy.byRule['bare digits'], 1);
eq('two distinct texts could not be read', messy.noCode.length, 1);
eq('repeat entries of the same text are grouped', messy.noCode[0].entries, 2);
eq('who typed it is kept', messy.noCode[0].who, 'Nitin Sharma');
eq('first and last seen', messy.noCode[0].first + '..' + messy.noCode[0].last, '2026-09-09..2026-09-10');

const suggested = V.suggestNames(messy.noCode.slice(), sd.schools, 0.82);
eq('the school typed without a code is suggested', suggested[0].suggestion.code, '111111');
eq('a suggestion carries its score', suggested[0].suggestion.score, 100);
eq('an unrelated text gets no suggestion',
  V.suggestNames([{ text: 'Some unrelated place', entries: 1, first: '2026-09-09', last: '2026-09-09' }], sd.schools, 0.82)[0].suggestion,
  undefined);

console.log('mapping gaps');
const g = V.gaps({ visits: log.visits, schools: sd.schools, template: tpl, from: '2026-09-05', to: '2026-09-11' });
eq('one unmapped school code found', g.missing.length, 1);
eq('unmapped code', g.missing[0].code, '999999');
eq('unmapped name taken from the log text', g.missing[0].label, 'Unknown School');
eq('unmapped entry count', g.missing[0].entries, 1);
eq('unmapped seen in range', g.missing[0].inRange, 1);
eq('gaps look at the whole file, not just the range',
  V.gaps({ visits: log.visits, schools: sd.schools, template: tpl, from: '2026-10-01', to: '2026-10-07' }).missing[0].inRange, 0);

/* a mapped school whose state/project has no column must be reported, not silently dropped */
const schoolsPlusCSV = schoolsCSV + '\n6,666666,GHS Example Zeta,Telugu,Telangana,,Warangal,,,,Cognizant,(666666) GHS Example Zeta';
const logPlusCSV = logCSV + '\nx,,,K,EI11,,,08-Sep-2026,School Visit,09:00 AM,3:00 PM,(666666) GHS Example Zeta';
const sd2 = V.parseSchools(V.parseCSV(schoolsPlusCSV));
const log2 = V.parseLog(V.parseCSV(logPlusCSV));
const g2 = V.gaps({ visits: log2.visits, schools: sd2.schools, template: tpl, from: '2026-09-05', to: '2026-09-11' });
eq('uncovered state/project pair reported', g2.uncovered.length, 1);
eq('uncovered pair named', g2.uncovered[0].state + '/' + g2.uncovered[0].project, 'Telangana/Cognizant');
eq('uncovered school count', g2.uncovered[0].schools, 1);
eq('uncovered entries in range', g2.uncovered[0].inRange, 1);
const rep3 = V.build({ visits: log2.visits, schools: sd2.schools, template: tpl, from: '2026-09-05', to: '2026-09-11' });
eq('uncovered visit is not counted in any column', rep3.colTotal.reduce((a, b) => a + b, 0), 5);

console.log('fallback template');
const rep2 = V.build({ visits: log.visits, schools: sd.schools, from: '2026-09-05', to: '2026-09-11' });
eq('built-in template still counts', rep2.colTotal.reduce((a, b) => a + b, 0), 5);

/* master school list: all schools, whatever their status, with the status carried not applied */
console.log('master school list with a status column');
const masterCSV = [
  'schoolCode,name,district,state,project,status,School code and Name',
  '111111,GPS Alpha,Shimla,Himachal Pradesh,Prevail,Active,(111111) GPS Alpha',
  '222222,GPS Beta,Shimla,Himachal Pradesh,P&G,Deactivated,(222222) GPS Beta',
  '333333,GHS Gamma,Jaipur,Rajasthan,P&G,Upcoming,(333333) GHS Gamma',
  '444444,ZPHS Delta,Khammam,Telangana,Amazon Future Engineer,FALSE,(444444) ZPHS Delta',
  '555555,GSSS Epsilon,Mandi,Himachal Pradesh,Bharat EdTech Initiatives,TRUE,(555555) GSSS Epsilon'
].join('\n');
const masterRows = V.parseCSV(masterCSV);
eq('master list recognised as the mapping', V.classify(masterRows, 'All Schools.csv'), 'schools');
const sdM = V.parseSchools(masterRows);
eq('every school in the master list is mapped', sdM.count, 5);
eq('Active kept as Active', sdM.schools['111111'].status, 'Active');
eq('Deactivated kept as Deactivated', sdM.schools['222222'].status, 'Deactivated');
eq('Upcoming kept as Upcoming', sdM.schools['333333'].status, 'Upcoming');
eq('FALSE reads as Deactivated', sdM.schools['444444'].status, 'Deactivated');
eq('TRUE reads as Active', sdM.schools['555555'].status, 'Active');
eq('project column named "project" still maps', sdM.schools['222222'].projectLabel, 'P&G');
const repM = V.build({ visits: log.visits, schools: sdM.schools, template: tpl, from: '2026-09-05', to: '2026-09-11' });
eq('status never excludes a visit', repM.colTotal.reduce((a, b) => a + b, 0), 5);
eq('grand total unchanged by status', repM.grandTotal, rep.grandTotal);
eq('school-days at schools not marked Active are counted and flagged', repM.stats.notActiveSchoolDays, 3);
eq('status travels into the school list', repM.detail.every(d => d.status), true);
eq('no status column leaves status empty', V.build({ visits: log.visits, schools: sd.schools, template: tpl, from: '2026-09-05', to: '2026-09-11' }).stats.notActiveSchoolDays, 0);
eq('blank status is not reported as a gap', V.statusLabel(''), '');
eq('unrecognised status passes through as written', V.statusLabel('Paused for exams'), 'Paused for exams');

/* the five columns Devarsh will supply, with his own header spellings */
console.log('five-column mapping, no status column');
const fiveCSV = [
  'SchoolCode,schoolname,district,state,project name',
  '111111,GPS Alpha,Shimla,Himachal Pradesh,Prevail',
  '222222,GPS Beta,Shimla,Himachal Pradesh,P&G',
  '333333,GHS Gamma,Jaipur,Rajasthan,P&G',
  '444444,ZPHS Delta,Khammam,Telangana,Amazon Future Engineer',
  '555555,GSSS Epsilon,Mandi,Himachal Pradesh,Bharat EdTech Initiatives'
].join('\n');
const fiveRows = V.parseCSV(fiveCSV);
eq('five-column sheet recognised as the mapping', V.classify(fiveRows, 'mapping.csv'), 'schools');
const sd5 = V.parseSchools(fiveRows);
eq('all five schools mapped', sd5.count, 5);
eq('schoolname header read as the school name', sd5.schools['111111'].name, 'GPS Alpha');
eq('label falls back to the school name', sd5.schools['111111'].label, 'GPS Alpha');
eq('project name header read as the project', sd5.schools['222222'].projectLabel, 'P&G');
eq('state read', sd5.schools['444444'].stateLabel, 'Telangana');
eq('no status column leaves status blank', sd5.schools['111111'].status, '');
const rep5 = V.build({ visits: log.visits, schools: sd5.schools, template: tpl, from: '2026-09-05', to: '2026-09-11' });
eq('five-column mapping counts the same as School Details', rep5.grandTotal, rep.grandTotal);
eq('five-column mapping column totals match', rep5.colTotal.join(','), rep.colTotal.join(','));
eq('nothing reported missing', V.gaps({ visits: log.visits, schools: sd5.schools, template: tpl, from: '2026-09-05', to: '2026-09-11' }).missing.length, 1);
eq('no status means nothing flagged as inactive', rep5.stats.notActiveSchoolDays, 0);

/* the real warehouse list: no value equals 'P&G', and removed schools carry a suffix */
console.log('warehouse mapping: project aliases and Deleted-suffix codes');
const whCSV = [
  'schoolCode,name,district,state,po.name',
  '111111,GPS Alpha,Shimla,Himachal Pradesh,Prevail',
  '222222,GPS Beta,Shimla,Himachal Pradesh,Home base P&G Shiksha',
  '333333,GHS Gamma,Jaipur,Rajasthan,School base P&G Shiksha',
  '444444,ZPHS Delta,Khammam,Telangana,Amazon Future Engineer',
  '555555,GSSS Epsilon,Mandi,Himachal Pradesh,Bharat EdTech Initiatives',
  '666666Deleted,GSSS Zeta,Solan,Himachal Pradesh,School base P&G Shiksha',
  '777777.0,GSSS Eta,Mandi,Himachal Pradesh,Govt Led P&G'
].join('\n');
const whRows = V.parseCSV(whCSV);
const sdW = V.parseSchools(whRows);
eq('every warehouse row mapped', sdW.count, 7);
eq('Home base P&G Shiksha rolls into the P&G column', sdW.schools['222222'].project, 'p&g');
eq('School base P&G Shiksha rolls into the P&G column', sdW.schools['333333'].project, 'p&g');
eq('Govt Led P&G rolls into the P&G column', sdW.schools['777777'].project, 'p&g');
eq('the raw project name is kept for display', sdW.schools['222222'].projectLabel, 'Home base P&G Shiksha');
eq('a non-P&G project is untouched', sdW.schools['111111'].project, 'prevail');
eq('Deleted suffix stripped off the code', !!sdW.schools['666666'], true);
eq('Deleted suffix read as a deactivated school', sdW.schools['666666'].status, 'Deactivated');
eq('Excel .0 stripped off the code', !!sdW.schools['777777'], true);
eq('a clean code has no status', sdW.schools['111111'].status, '');
eq('cleanCode rejects a non-code', V.cleanCode('GPS Somewhere'), null);
eq('cleanCode keeps a plain number', V.cleanCode(121240).code, '121240');

/* the P&G column must now actually count, and the rollup must be reported */
const whLog = V.parseCSV([
  'Date,School Code and Name',
  '05-Sep-2026,(222222) GPS Beta',
  '06-Sep-2026,(666666) GSSS Zeta',
  '07-Sep-2026,(111111) GPS Alpha'
].join('\n'));
const lgW = V.parseLog(whLog);
const repW = V.build({ visits: lgW.visits, schools: sdW.schools, template: tpl, from: '2026-09-05', to: '2026-09-11' });
const hpPG = tpl.columns.findIndex(c => c.state === 'Himachal Pradesh' && c.project === 'P&G');
const hpPrevail = tpl.columns.findIndex(c => c.state === 'Himachal Pradesh' && c.project === 'Prevail');
eq('P&G/Himachal Pradesh now counts both P&G Shiksha visits', repW.colTotal[hpPG], 2);
eq('Prevail/Himachal Pradesh unaffected', repW.colTotal[hpPrevail], 1);
eq('rolled-up school-days reported', repW.stats.rolledUpSchoolDays, 2);
eq('no school left unmapped', repW.stats.unknownCodes, 0);
eq('rolled-up school still shows its real project name', repW.detail.find(d => d.code === '222222').project, 'Home base P&G Shiksha');

/* without the alias the same list would leave the P&G column empty - the bug this fixes */
const sdNoAlias = V.parseSchools(whRows, { aliases: [] });
const repNoAlias = V.build({ visits: lgW.visits, schools: sdNoAlias.schools, template: tpl, from: '2026-09-05', to: '2026-09-11' });
eq('without the alias P&G/Himachal Pradesh reads zero', repNoAlias.colTotal[hpPG], 0);

/* the Saturday-Friday week containing a date - what the "show the latest week" jump uses */
console.log('week containing a date');
eq('Tuesday 13 Oct 2026 sits in 10-16 Oct', JSON.stringify(V.satFriWeekOf('2026-10-13')), '{"from":"2026-10-10","to":"2026-10-16"}');
eq('a Saturday starts its own week', JSON.stringify(V.satFriWeekOf('2026-10-10')), '{"from":"2026-10-10","to":"2026-10-16"}');
eq('a Friday ends its own week', JSON.stringify(V.satFriWeekOf('2026-10-09')), '{"from":"2026-10-03","to":"2026-10-09"}');
eq('a Sunday sits in the week that began the day before', JSON.stringify(V.satFriWeekOf('2026-10-11')), '{"from":"2026-10-10","to":"2026-10-16"}');
eq('the week is always 7 days', V.datesBetween(V.satFriWeekOf('2026-10-13').from, V.satFriWeekOf('2026-10-13').to).length, 7);
eq('13 Oct is inside its own week', V.datesBetween(V.satFriWeekOf('2026-10-13').from, V.satFriWeekOf('2026-10-13').to).indexOf('2026-10-13') > -1, true);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
