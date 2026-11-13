(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const historical = Array.isArray(window.HISTORICAL_AQI) ? window.HISTORICAL_AQI : [];
  const monthStats = months.map((name, i) => {
    const values = historical.filter(item => Number(item[0].slice(5, 7)) === i + 1).map(item => Number(item[1]));
    return { name, mean: values.length ? values.reduce((a,b) => a+b, 0) / values.length : 0, count: values.length };
  });

  function drawChart() {
    const host = $('monthChart');
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 900 300');
    svg.setAttribute('role', 'presentation');
    const left = 47, right = 15, top = 18, bottom = 44, chartH = 205;
    const max = Math.ceil(Math.max(...monthStats.map(m => m.mean)) / 50) * 50;
    for (let tick = 0; tick <= max; tick += 100) {
      const y = top + chartH - (tick / max) * chartH;
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', left); line.setAttribute('x2', 900 - right); line.setAttribute('y1', y); line.setAttribute('y2', y); line.setAttribute('class', 'gridline'); svg.appendChild(line);
      const label = document.createElementNS(ns, 'text'); label.setAttribute('x', 5); label.setAttribute('y', y + 4); label.setAttribute('font-size', '11'); label.textContent = String(tick); svg.appendChild(label);
    }
    const band = (900 - left - right) / monthStats.length;
    monthStats.forEach((m, i) => {
      const h = (m.mean / max) * chartH;
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', left + i * band + band * .19); rect.setAttribute('y', top + chartH - h);
      rect.setAttribute('width', band * .62); rect.setAttribute('height', h); rect.setAttribute('rx', '5'); rect.setAttribute('class', i === 10 ? 'bar peak' : 'bar');
      rect.setAttribute('aria-label', `${m.name}: mean AQI ${m.mean.toFixed(2)} from ${m.count} observations`); svg.appendChild(rect);
      const value = document.createElementNS(ns, 'text'); value.setAttribute('x', left + i * band + band / 2); value.setAttribute('y', top + chartH - h - 7); value.setAttribute('text-anchor', 'middle'); value.setAttribute('font-size', '10'); value.setAttribute('font-weight', '700'); value.textContent = m.mean.toFixed(0); svg.appendChild(value);
      const month = document.createElementNS(ns, 'text'); month.setAttribute('x', left + i * band + band / 2); month.setAttribute('y', top + chartH + 21); month.setAttribute('text-anchor', 'middle'); month.setAttribute('font-size', '11'); month.textContent = m.name; svg.appendChild(month);
    });
    host.replaceChildren(svg);
  }
  drawChart();

  const fileInput = $('csvFile'), runButton = $('runReview'), fileName = $('fileName');
  const status = $('uploadStatus'), queueSlider = $('queuePercent'), queueOutput = $('queuePercentOut');
  let selectedFile = null, analysis = null, selected = null;
  queueSlider.addEventListener('input', () => { queueOutput.value = queueSlider.value + '%'; queueOutput.textContent = queueSlider.value + '%'; });
  fileInput.addEventListener('change', () => {
    selectedFile = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
    fileName.textContent = selectedFile ? `${selectedFile.name} · ${Math.ceil(selectedFile.size / 1024)} KB` : 'No file selected';
    runButton.disabled = !selectedFile || !$('verifyData').checked;
    $('results').hidden = true;
    status.classList.remove('error');
    status.textContent = selectedFile ? 'Ready to review locally. The file will not be sent anywhere.' : 'Select a CSV to begin. The supplied historical workbook is not eligible for this model.';
  });
  $('verifyData').addEventListener('change', () => { runButton.disabled = !selectedFile || !$('verifyData').checked; });
  runButton.addEventListener('click', async () => {
    if (!selectedFile || !$('verifyData').checked) return;
    runButton.disabled = true; status.classList.remove('error'); status.textContent = 'Reading and checking the selected file locally…';
    try {
      const text = await selectedFile.text();
      analysis = window.AirLoopCore.analyzeCsv(text, { reviewPercent: Number(queueSlider.value), freshnessHours: Number($('freshnessHours').value), now: Date.now() });
      renderResults(analysis);
      status.textContent = 'Review completed in this browser. No data was transmitted.';
    } catch (error) {
      status.classList.add('error'); status.textContent = error && error.message ? error.message : 'Could not review this file.';
      $('results').hidden = true;
    } finally { runButton.disabled = false; }
  });

  function renderResults(result) {
    $('results').hidden = false;
    const metrics = [
      ['Rows in file', result.totalRows], ['Accepted unique rows', result.validRows],
      ['Held rows', result.heldRows], ['Stations scored', `${result.modelStations} / ${result.stationCount}`]
    ];
    $('resultMetrics').replaceChildren(...metrics.map(([label, value]) => {
      const box = document.createElement('div'); box.className = 'result-metric';
      const name = document.createElement('span'); name.textContent = label;
      const val = document.createElement('strong'); val.textContent = value;
      box.append(name, val); return box;
    }));
    const latestHost = $('latestRecords'); latestHost.replaceChildren();
    result.latest.forEach(item => {
      const chip = document.createElement('div'); chip.className = 'latest-chip' + (item.freshness.includes('hold') ? ' hold' : '');
      const b = document.createElement('b'); b.textContent = item.station;
      const span = document.createElement('span'); span.textContent = ` · latest ${item.timeRaw} · ${item.freshness}`;
      chip.append(b, span); latestHost.appendChild(chip);
    });
    const body = $('queueRows'); body.replaceChildren(); selected = null;
    $('selectedCandidate').textContent = 'No candidate selected.';
    $('reviewOutcome').value = ''; $('reviewNote').value = ''; $('saveReview').disabled = true;
    const displayRows = result.queue.slice(0, 100);
    $('noQueue').hidden = displayRows.length !== 0;
    displayRows.forEach((record, index) => {
      const tr = document.createElement('tr'); tr.tabIndex = 0;
      const cue = document.createElement('td');
      record.reasons.forEach(reason => { const pill = document.createElement('span'); pill.className = 'cue-pill'; pill.textContent = reason; pill.title = reason; cue.appendChild(pill); cue.appendChild(document.createTextNode(' ')); });
      const station = document.createElement('td'); station.textContent = record.station;
      const time = document.createElement('td'); time.textContent = record.timeRaw;
      const aqi = document.createElement('td'); aqi.textContent = String(record.aqi) + (record.previousAqi == null ? ' · no prior record' : ` · prior ${record.previousAqi}; change ${record.delta >= 0 ? '+' : ''}${record.delta}`) + ` · age ${Math.max(0, (Date.now()-record.time)/3600000).toFixed(1)}h (not a forecast)`;
      const score = document.createElement('td'); score.className = 'score'; score.textContent = record.score == null ? 'Not scored (rule cue / insufficient data)' : record.score.toFixed(4);
      const source = document.createElement('td'); const link = document.createElement('a'); link.href = record.source; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Open source ↗'; source.appendChild(link);
      tr.append(cue, station, time, aqi, score, source);
      const choose = () => {
        body.querySelectorAll('tr').forEach(row => row.classList.remove('selected'));
        tr.classList.add('selected'); selected = record;
        $('selectedCandidate').textContent = `Selected: ${record.station} · ${record.timeRaw} · AQI ${record.aqi}`;
        $('saveReview').disabled = !$('reviewOutcome').value;
      };
      tr.addEventListener('click', choose); tr.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } });
      body.appendChild(tr);
    });
    const heldSummary = $('heldSummary'); heldSummary.replaceChildren();
    if (result.queue.length > 100) heldSummary.textContent = `Showing first 100 of ${result.queue.length} review candidates. `;
    if (result.held.length) {
      heldSummary.className = 'status-line';
      heldSummary.textContent += `Held out ${result.held.length} row(s). First examples: ` + result.held.slice(0, 5).map(x => `line ${x.line}: ${x.reasons.join(', ')}`).join(' · ');
    } else heldSummary.className = 'status-line';
    $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $('reviewOutcome').addEventListener('change', () => { $('saveReview').disabled = !selected || !$('reviewOutcome').value; });
  $('saveReview').addEventListener('click', () => {
    if (!selected || !$('reviewOutcome').value) return;
    const entry = document.createElement('div'); entry.className = 'log-entry';
    const now = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
    entry.textContent = `${now} · ${selected.station} · ${selected.timeRaw} · ${$('reviewOutcome').value}${$('reviewNote').value.trim() ? ' · Note: ' + $('reviewNote').value.trim() : ''}`;
    $('reviewLog').prepend(entry); $('reviewNote').value = ''; $('reviewOutcome').value = ''; $('saveReview').disabled = true;
  });
  $('clearResults').addEventListener('click', () => {
    analysis = null; selected = null; $('results').hidden = true; $('reviewLog').replaceChildren();
    status.classList.remove('error'); status.textContent = 'Results and temporary notes cleared from this tab.';
  });
})();
