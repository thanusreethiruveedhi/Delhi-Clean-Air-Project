(function (root) {
  'use strict';

  function parseCsv(text) {
    const rows = [];
    let row = [], cell = '', quoted = false;
    const input = String(text || '').replace(/^\uFEFF/, '');
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (quoted) {
        if (ch === '"' && input[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell.length || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
    return rows.filter(r => r.some(v => String(v).trim() !== ''));
  }

  function canonical(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function findColumn(headers, choices) {
    const normalized = headers.map(canonical);
    for (const choice of choices) {
      const idx = normalized.indexOf(canonical(choice));
      if (idx >= 0) return idx;
    }
    return -1;
  }
  function hasZone(s) { return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(String(s).trim()); }

  function seededRandom(seed) {
    let state = (seed >>> 0) || 1;
    return function () {
      state += 0x6D2B79F5;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function expectedPathLength(n) {
    if (n <= 1) return 0;
    if (n === 2) return 1;
    const m = n - 1;
    const harmonic = Math.log(m) + 0.5772156649015329 + 1 / (2 * m) - 1 / (12 * m * m);
    return 2 * harmonic - (2 * (n - 1) / n);
  }

  function buildTree(indices, features, depth, limit, random) {
    if (indices.length <= 1 || depth >= limit) return { leaf: true, size: indices.length };
    let varying = [];
    for (let feature = 0; feature < features[0].length; feature++) {
      let min = Infinity, max = -Infinity;
      for (const idx of indices) { const v = features[idx][feature]; if (v < min) min = v; if (v > max) max = v; }
      if (max > min) varying.push({ feature, min, max });
    }
    if (!varying.length) return { leaf: true, size: indices.length };
    const chosen = varying[Math.floor(random() * varying.length)];
    const split = chosen.min + random() * (chosen.max - chosen.min);
    const left = [], right = [];
    for (const idx of indices) (features[idx][chosen.feature] < split ? left : right).push(idx);
    if (!left.length || !right.length) return { leaf: true, size: indices.length };
    return {
      leaf: false,
      feature: chosen.feature,
      split,
      left: buildTree(left, features, depth + 1, limit, random),
      right: buildTree(right, features, depth + 1, limit, random)
    };
  }

  function pathLength(node, vector, depth) {
    if (node.leaf) return depth + expectedPathLength(node.size);
    return pathLength(vector[node.feature] < node.split ? node.left : node.right, vector, depth + 1);
  }

  // Educational, deterministic Isolation Forest scoring. This is not a health or policy model.
  function isolationScores(vectors, seed) {
    const n = vectors.length;
    if (n < 2) return vectors.map(() => null);
    const random = seededRandom(seed || 1);
    const sampleSize = Math.min(128, n);
    const maxDepth = Math.ceil(Math.log2(sampleSize));
    const treeCount = 100;
    const forest = [];
    for (let t = 0; t < treeCount; t++) {
      const pool = Array.from({ length: n }, (_, i) => i);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      forest.push(buildTree(pool.slice(0, sampleSize), vectors, 0, maxDepth, random));
    }
    const normalizer = expectedPathLength(sampleSize);
    if (!normalizer) return vectors.map(() => 0.5);
    return vectors.map(vector => {
      let total = 0;
      for (const tree of forest) total += pathLength(tree, vector, 0);
      return Math.pow(2, -(total / treeCount) / normalizer);
    });
  }

  function hashSeed(value) {
    let h = 2166136261;
    for (const ch of String(value)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function analyzeCsv(text, options) {
    const opts = Object.assign({ reviewPercent: 5, freshnessHours: 24, now: Date.now() }, options || {});
    if (!Number.isFinite(Number(opts.freshnessHours)) || Number(opts.freshnessHours) < 1 || Number(opts.freshnessHours) > 720) throw new Error('Choose a freshness window from 1 to 720 hours.');
    if (!Number.isFinite(Number(opts.reviewPercent)) || Number(opts.reviewPercent) < 1 || Number(opts.reviewPercent) > 15) throw new Error('Choose a review share from 1% to 15%.');
    const parsed = parseCsv(text);
    if (parsed.length > 5001) throw new Error('This small offline prototype accepts up to 5,000 observation rows per file.');
    if (parsed.length < 2) throw new Error('The selected file has a header row but no observation rows.');
    const headers = parsed[0];
    const columns = {
      station: findColumn(headers, ['station_id', 'station', 'station_name', 'station_code']),
      time: findColumn(headers, ['observed_at', 'timestamp', 'datetime', 'date_time', 'dateandtime']),
      aqi: findColumn(headers, ['aqi', 'india_aqi']),
      source: findColumn(headers, ['source_url', 'source'])
    };
    const missing = Object.entries(columns).filter(([, idx]) => idx < 0).map(([name]) => name);
    if (missing.length) throw new Error('Required column(s) not found: ' + missing.join(', ') + '. Use the blank template’s headers: station_id, observed_at, aqi, source_url.');

    const valid = [], held = [], duplicateKeys = new Set();
    for (let i = 1; i < parsed.length; i++) {
      const row = parsed[i];
      const station = String(row[columns.station] || '').trim();
      const timeRaw = String(row[columns.time] || '').trim();
      const aqiRaw = String(row[columns.aqi] || '').trim();
      const sourceRaw = String(row[columns.source] || '').trim();
      const aqi = Number(aqiRaw);
      const reasons = [];
      const time = Date.parse(timeRaw);
      if (!station) reasons.push('missing station ID');
      if (!timeRaw || !Number.isFinite(time) || !hasZone(timeRaw)) reasons.push('timestamp must be valid ISO 8601 with Z or an explicit timezone offset');
      if (!aqiRaw || !Number.isFinite(aqi) || aqi < 0) reasons.push('AQI must be a non-negative number');
      if (Number.isFinite(time) && time > opts.now) reasons.push('future timestamp; excluded from the model');
      let sourceOk = false;
      try { const u = new URL(sourceRaw); sourceOk = u.protocol === 'https:'; } catch (_) { sourceOk = false; }
      if (!sourceOk) reasons.push('source_url must be a valid HTTPS URL');
      if (reasons.length) { held.push({ line: i + 1, reasons }); continue; }
      const key = station + '|' + time;
      if (duplicateKeys.has(key)) { held.push({ line: i + 1, reasons: ['duplicate station/timestamp; held out'] }); continue; }
      duplicateKeys.add(key);
      valid.push({ line: i + 1, station, time, timeRaw, aqi, source: sourceRaw, delta: 0, score: null, reasons: [] });
    }

    const byStation = new Map();
    for (const record of valid) {
      if (!byStation.has(record.station)) byStation.set(record.station, []);
      byStation.get(record.station).push(record);
    }
    const latest = [];
    let modelStations = 0, scoredRows = 0, flaggedCount = 0;
    for (const [station, records] of byStation.entries()) {
      records.sort((a, b) => a.time - b.time);
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        r.previousAqi = i ? records[i - 1].aqi : null;
        r.delta = i ? r.aqi - records[i - 1].aqi : 0;
        let run = 1;
        for (let j = i - 1; j >= 0 && records[j].aqi === r.aqi; j--) run++;
        for (let j = i + 1; j < records.length && records[j].aqi === r.aqi; j++) run++;
        if (run >= 3) r.reasons.push('same AQI repeated across 3+ consecutive records');
      }
      const newest = records[records.length - 1];
      const ageHours = (opts.now - newest.time) / 3600000;
      let freshness = 'within reviewer-set window';
      if (ageHours > Number(opts.freshnessHours)) {
        freshness = 'older than reviewer-set window — held from model';
        newest.hold = true;
        newest.reasons.push('latest station record is older than the selected freshness window; excluded from model');
        held.push({line: newest.line, reasons: ['latest station record is stale under the reviewer-selected window; excluded from model']});
      }
      latest.push({ station, timeRaw: newest.timeRaw, ageHours, freshness, source: newest.source });

      const modelRecords = records.filter(r => !r.hold && !r.reasons.length);
      if (modelRecords.length >= 30) {
        modelStations++;
        const vectors = modelRecords.map(r => [r.aqi, r.delta]);
        const scores = isolationScores(vectors, hashSeed(station + '|airloop-v1'));
        modelRecords.forEach((r, idx) => { r.score = scores[idx]; });
        scoredRows += modelRecords.length;
        const queueCount = Math.max(1, Math.ceil(modelRecords.length * Number(opts.reviewPercent) / 100));
        const ranked = [...modelRecords].sort((a, b) => b.score - a.score || a.time - b.time);
        for (const candidate of ranked.slice(0, queueCount)) {
          candidate.reasons.push('among the highest Isolation Forest review scores for this station');
          flaggedCount++;
        }
      }
    }

    const queue = valid.filter(r => r.reasons.length).sort((a, b) => {
      const as = a.score == null ? -1 : a.score, bs = b.score == null ? -1 : b.score;
      return bs - as || a.time - b.time;
    });
    return {
      totalRows: parsed.length - 1,
      validRows: valid.filter(r => !r.hold).length,
      heldRows: held.length,
      held,
      stationCount: byStation.size,
      modelStations,
      scoredRows,
      flaggedCount,
      latest,
      queue,
      valid
    };
  }

  const api = { parseCsv, isolationScores, analyzeCsv, expectedPathLength };
  root.AirLoopCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
