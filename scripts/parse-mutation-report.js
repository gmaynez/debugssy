const fs = require('fs');

function extractAppReport(html) {
  const marker = 'app.report = ';
  const start = html.indexOf(marker);
  if (start < 0) throw new Error('marker not found');
  const objStart = start + marker.length;
  // Brace-match from the first '{'
  let depth = 0;
  let inStr = false;
  let escape = false;
  let end = -1;
  for (let i = objStart; i < html.length; i++) {
    const c = html[i];
    if (escape) { escape = false; continue; }
    if (inStr) {
      if (c === '\\') { escape = true; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end < 0) throw new Error('unterminated');
  return html.substring(objStart, end);
}

const html = fs.readFileSync('reports/mutation/mutation.html', 'utf8');
const raw = extractAppReport(html);
fs.writeFileSync('reports/mutation/report.json', raw);

let d;
try {
  d = JSON.parse(raw);
} catch (e) {
  console.error('JSON parse failed, falling back to eval:', e.message);
  // Stryker's report has broken string escapes in some replacements; use Function
  d = (new Function('return (' + raw + ');'))();
}

const files = d.files;
const sum = { Killed: 0, Survived: 0, Timeout: 0, NoCoverage: 0, Ignored: 0, RuntimeError: 0, CompileError: 0, Pending: 0, total: 0 };
for (const f of Object.keys(files)) {
  for (const m of files[f].mutants) {
    sum[m.status] = (sum[m.status] || 0) + 1;
    sum.total++;
  }
}
const detected = sum.Killed + sum.Timeout;
const score = sum.total ? (detected * 100 / sum.total).toFixed(2) : 0;
const coveredMutants = sum.total - (sum.NoCoverage || 0);
const scoreCovered = coveredMutants ? (detected * 100 / coveredMutants).toFixed(2) : 0;

console.log('--- TOTALS ---');
console.log(JSON.stringify(sum, null, 2));
console.log('Mutation score (total):   ' + score + '%  (' + detected + '/' + sum.total + ')');
console.log('Mutation score (covered): ' + scoreCovered + '%  (' + detected + '/' + coveredMutants + ')');

console.log('\n--- PER-FILE ---');
const rows = [];
for (const f of Object.keys(files)) {
  const ms = files[f].mutants;
  const c = {};
  for (const m of ms) {
    c[m.status] = (c[m.status] || 0) + 1;
  }
  const killed = (c.Killed || 0) + (c.Timeout || 0);
  const sc = ms.length ? (killed * 100 / ms.length).toFixed(1) : '0.0';
  const cov = ms.length - (c.NoCoverage || 0);
  const scov = cov ? (killed * 100 / cov).toFixed(1) : '0.0';
  rows.push({ f, total: ms.length, killed, surv: c.Survived || 0, nc: c.NoCoverage || 0, to: c.Timeout || 0, sc: parseFloat(sc), scov: parseFloat(scov) });
}
rows.sort((a, b) => a.f.localeCompare(b.f));
for (const r of rows) {
  console.log(
    r.f.padEnd(50) +
      ' mut=' + String(r.total).padStart(4) +
      ' kill=' + String(r.killed).padStart(3) +
      ' surv=' + String(r.surv).padStart(3) +
      ' nc=' + String(r.nc).padStart(3) +
      ' time=' + String(r.to).padStart(2) +
      ' total=' + (r.sc + '%').padStart(6) +
      ' covered=' + (r.scov + '%').padStart(7)
  );
}

console.log('\n--- SURVIVED MUTANTS (need stronger tests) ---');
let totalSurv = 0;
for (const f of Object.keys(files)) {
  const surv = files[f].mutants.filter(m => m.status === 'Survived');
  if (surv.length === 0) continue;
  totalSurv += surv.length;
  console.log('\n[' + f + '] survived=' + surv.length);
  surv.forEach(m => {
    const loc = m.location ? `${m.location.start.line}:${m.location.start.column}` : '?';
    const reason = m.statusReason ? ` -> ${String(m.statusReason).substring(0, 90).replace(/\n/g, ' ')}` : '';
    const rep = String(m.replacement || '').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
    console.log(`  L${loc}  ${String(m.mutatorName).padEnd(22)}  ${rep.substring(0, 50)}${reason}`);
  });
}
console.log('\nTotal survived: ' + totalSurv);

console.log('\n--- NO-COVERAGE MUTANTS (untested code) ---');
let totalNC = 0;
for (const f of Object.keys(files)) {
  const nc = files[f].mutants.filter(m => m.status === 'NoCoverage');
  if (nc.length === 0) continue;
  totalNC += nc.length;
  console.log('\n[' + f + '] noCoverage=' + nc.length);
  nc.forEach(m => {
    const loc = m.location ? `${m.location.start.line}:${m.location.start.column}` : '?';
    const rep = String(m.replacement || '').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
    console.log(`  L${loc}  ${String(m.mutatorName).padEnd(22)}  ${rep.substring(0, 50)}`);
  });
}
console.log('\nTotal no-coverage: ' + totalNC);
