const assert = require('node:assert/strict');
const core = require('../core.js');

const rows = core.parseCsv('station_id,observed_at,aqi,source_url\n"Station, A",2026-11-12T12:00:00Z,90,https://example.org/data\n');
assert.equal(rows.length, 2);
assert.equal(rows[1][0], 'Station, A');
assert.throws(() => core.analyzeCsv('station_id,observed_at,aqi,source_url\n'), /no observation rows/);

// Artificial values below are software-test fixtures only; they are not project findings.
const baseline = Array.from({length: 40}, (_, i) => [100 + (i % 5), (i % 3) - 1]);
const withUnusualPoint = baseline.concat([[450, 300]]);
const scores = core.isolationScores(withUnusualPoint, 12345);
assert.equal(scores.length, 41);
assert.ok(scores.every(Number.isFinite));
assert.ok(scores[40] > scores.slice(0, 40).reduce((a, b) => a + b, 0) / 40, 'test point should score above baseline average');

const header = 'station_id,observed_at,aqi,source_url';
const origin = Date.parse('2026-11-13T12:00:00Z');
const observations = Array.from({length: 40}, (_, i) => {
  const time = new Date(origin - (39 - i) * 60 * 60 * 1000).toISOString();
  const aqi = i === 39 ? 450 : 100 + (i % 5);
  return `Station-1,${time},${aqi},https://example.org/station-1`;
});
const report = core.analyzeCsv([header, ...observations].join('\n'), { now: origin, freshnessHours: 24, reviewPercent: 5 });
assert.equal(report.totalRows, 40);
assert.equal(report.validRows, 40);
assert.equal(report.heldRows, 0);
assert.equal(report.modelStations, 1);
assert.equal(report.scoredRows, 40);
assert.ok(report.queue.some(row => row.aqi === 450), 'extreme test fixture should be present in the review queue');

const missingZone = core.analyzeCsv([header, 'Station-1,2026-11-13T12:00:00,90,https://example.org/data'].join('\n'), { now: origin });
assert.equal(missingZone.heldRows, 1, 'timezone-free timestamps should be held');
console.log('Core tests passed. Test fixtures are artificial and are not analysis data.');

const futureRows = [header, ...observations, `Station-1,${new Date(origin + 3600000).toISOString()},99,https://example.org/data`, `Station-1,${new Date(origin + 7200000).toISOString()},98,https://example.org/data`].join('\n');
const futureReport = core.analyzeCsv(futureRows, {now: origin});
assert.equal(futureReport.heldRows, 2);
assert.equal(futureReport.scoredRows, 40);
assert.ok(futureReport.valid.every(r => r.time <= origin));

const staleReport = core.analyzeCsv([header, ...observations].join('\n'), {now: origin + 48*3600000, freshnessHours:24});
assert.equal(staleReport.heldRows, 1);
assert.equal(staleReport.scoredRows, 39);
assert.equal(staleReport.valid.find(r => r.time === origin).score, null);
assert.ok(staleReport.queue.some(r => r.hold));

const repeated = Array.from({length: 35}, (_, i) => `S,${new Date(origin-(34-i)*3600000).toISOString()},100,https://example.org/data`);
const repeatedReport = core.analyzeCsv([header,...repeated].join('\n'), {now:origin});
assert.equal(repeatedReport.scoredRows, 0);
assert.equal(repeatedReport.queue.length, 35);
assert.ok(repeatedReport.queue.every(r=>r.score===null));
assert.throws(()=>core.analyzeCsv([header,...observations].join('\n'),{freshnessHours:0}),/freshness window/);
const duplicates = core.analyzeCsv([header,observations[0],observations[0]].join('\n'),{now:origin,freshnessHours:48});
assert.equal(duplicates.heldRows,1);
console.log('Safety regression tests passed: future rows, stale latest row, repeated-value exclusion, parameter bounds and duplicates.');
