/* MKDWander Admin — Booking inquiry demand forecast.
 * Historical data is from booking_inquiries.createdAt, NOT confirmed bookings.
 * Uses completed Asia/Manila calendar months only.
 * Minimum history: 6 consecutive complete months.
 * Forecast: 3-month weighted moving average, weights 1,2,3.
 * Rolling 1-step backtest MAE; no claim of calibrated confidence or seasonality.
 */
(function (root) {
  'use strict';
  const MIN_MONTHS = 6;
  const WEIGHTS = [1, 2, 3];
  const MONTHS_AHEAD = 3;
  const monthKey = (year, month) => `${year}-${String(month).padStart(2, '0')}`;
  const parseMonth = key => { const [y, m] = key.split('-').map(Number); return { year: y, month: m }; };
  function advance(key, delta) {
    const { year, month } = parseMonth(key);
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    return monthKey(d.getUTCFullYear(), d.getUTCMonth() + 1);
  }
  function phMonth(date) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).formatToParts(date);
    return monthKey(Number(parts.find(p => p.type === 'year').value), Number(parts.find(p => p.type === 'month').value));
  }
  function timestamp(raw) {
    if (!raw) return null;
    let d;
    if (typeof raw.toDate === 'function') d = raw.toDate();
    else if (typeof raw.seconds === 'number') d = new Date(raw.seconds * 1000);
    else d = raw instanceof Date ? raw : new Date(raw);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  function weightedMean(values) {
    const tail = values.slice(-3);
    return tail.reduce((sum, value, i) => sum + value * WEIGHTS[i], 0) / 6;
  }
  function forecast(inquiries, now = new Date()) {
    const todayMonth = phMonth(now);
    const counts = new Map();
    for (const row of inquiries || []) {
      const date = timestamp(row.createdAt);
      if (!date || date > now) continue;
      const k = phMonth(date);
      if (k >= todayMonth) continue; // current month is incomplete
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    const earliest = [...counts.keys()].sort()[0];
    const completedMonths = [];
    if (earliest) {
      for (let key = earliest; key < todayMonth && completedMonths.length < 240; key = advance(key, 1)) {
        completedMonths.push({ month: key, actual: counts.get(key) || 0 });
      }
    }
    if (completedMonths.length < MIN_MONTHS) {
      return { ready: false, reason: 'At least 6 consecutive completed calendar months with recorded booking history are required. Current-month data is excluded.', monthsAvailable: completedMonths.length, completedMonths };
    }
    const values = completedMonths.map(x => x.actual);
    const errors = [];
    for (let i = 3; i < values.length; i++) {
      errors.push(Math.abs(weightedMean(values.slice(0, i)) - values[i]));
    }
    const projections = [];
    const rolling = [...values];
    for (let i = 1; i <= MONTHS_AHEAD; i++) {
      const estimate = weightedMean(rolling);
      projections.push({ month: advance(completedMonths.at(-1).month, i), projected: Math.max(0, Math.round(estimate)) });
      rolling.push(estimate);
    }
    return { ready: true, method: 'Weighted moving average (latest 3 completed months: 1:2:3)', completedMonths, projections,
      mae: errors.reduce((sum, value) => sum + value, 0) / errors.length,
      backtestCount: errors.length, monthsAvailable: completedMonths.length };
  }
  const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const labelMonth = key => new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-PH', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  // Demo mode exists only in memory. It does not modify Firestore or live statistics.
  let demoMode = false;
  let latestLiveInquiries = [];
  let wired = false;
  const DEMO_MONTH_COUNTS = [12, 15, 14, 19, 23, 21, 27, 25, 34, 39];
  function demoInquiries(now = new Date()) {
    const currentMonth = phMonth(now);
    const records = [];
    DEMO_MONTH_COUNTS.forEach((count, i) => {
      const month = advance(currentMonth, i - DEMO_MONTH_COUNTS.length);
      // 12:00 Philippine time on day 15 (04:00 UTC).
      for (let n = 0; n < count; n++) {
        records.push({ createdAt: new Date(`${month}-15T04:00:00.000Z`), demo: true });
      }
    });
    return records;
  }
  function render(inquiries) {
    latestLiveInquiries = inquiries || [];
    const node = document.getElementById('booking-demand-forecast');
    if (!node) return;
    if (!wired) {
      node.addEventListener('click', event => {
        const button = event.target.closest('[data-forecast-toggle]');
        if (!button) return;
        demoMode = !demoMode;
        render(latestLiveInquiries);
      });
      wired = true;
    }
    const controls = `<div class="forecast-controls"><span class="forecast-mode ${demoMode ? 'forecast-mode-demo' : ''}">${demoMode ? 'SIMULATION · SYNTHETIC DATA' : 'LIVE · FIRESTORE DATA'}</span><button type="button" class="forecast-toggle" data-forecast-toggle>${demoMode ? 'Return to live data' : 'Try demo forecast'}</button></div>`;
    const demoNote = demoMode ? '<p class="forecast-demo-note"><strong>Simulation only.</strong> These 10 months of data are generated for algorithm testing and are not actual MKDWander bookings. The existing dashboard KPIs remain live.</p>' : '';
    const data = demoMode ? demoInquiries() : latestLiveInquiries;
    const result = forecast(data);
    if (!result.ready) {
      node.innerHTML = controls + demoNote + `<div class="forecast-empty"><strong>Forecast unavailable</strong><p>${escapeHtml(result.reason)}</p><small>${result.monthsAvailable} completed month(s) available. ${demoMode ? 'Synthetic demo data insufficient.' : 'No synthetic bookings or forecasts are shown.'}</small></div>`;
      return;
    }
    const last = result.completedMonths.slice(-6);
    const max = Math.max(1, ...last.map(x => x.actual), ...result.projections.map(x => x.projected));
    const bars = [...last.map(x => ({ ...x, value: x.actual, type: 'actual' })), ...result.projections.map(x => ({ ...x, value: x.projected, type: 'projected' }))];
    node.innerHTML = controls + demoNote + `
      <p class="forecast-method">${demoMode ? 'Simulated' : 'Recorded'} booking <strong>inquiries</strong> by created date · Philippine time · last 6 historical months + next 3 projected</p>
      <div class="forecast-bars" role="img" aria-label="Monthly historical booking inquiries and next three monthly projections">
        ${bars.map(x => `<div class="forecast-column"><span class="forecast-number">${x.value}</span><div class="forecast-bar ${x.type}" style="height:${Math.max(x.value ? 4 : 0, x.value/max*100)}%" title="${escapeHtml(labelMonth(x.month))}: ${x.value} ${x.type}"></div><span class="forecast-month">${escapeHtml(labelMonth(x.month))}</span><span class="forecast-type">${x.type === 'actual' ? (demoMode ? 'Simulated' : 'Actual') : 'Forecast'}</span></div>`).join('')}
      </div>
      <div class="forecast-summary"><span><strong>Method:</strong> ${escapeHtml(result.method)}</span><span><strong>Backtest MAE:</strong> ${result.mae.toFixed(2)} inquiries (${result.backtestCount} one-month checks)</span></div>
      <p class="forecast-disclaimer">${demoMode ? 'Simulated test results only. ' : ''}These are short-term estimates, not guaranteed bookings. MAE measures historical error; it is not a confidence percentage. This model does not establish seasonal patterns.</p>`;
  }
  root.MKDForecasting = { forecast, render, demoInquiries };
})(typeof window === 'undefined' ? globalThis : window);
