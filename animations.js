/* MKDWander Admin - count-up numbers + button ripple (plain script, no changes to app.js needed) */
(() => {
  const reduce = false;

  /* ---------- Count-up for KPI numbers ---------- */
  const ids = [
    "kpi-total-bookings", "kpi-total-revenue", "kpi-pending-inquiries", "kpi-active-pkg", "kpi-total-users",
    "rev-total-collected", "rev-ub-volume", "rev-bpi-volume", "rev-avg-value",
    "analytics-avg-group", "analytics-total-inq", "analytics-conf-rate"
  ];
  const re = /^(\D*?)(\d[\d,]*\.?\d*)(.*)$/;
  const ease = t => 1 - Math.pow(1 - t, 4); // easeOutQuart

  function tween(el) {
    const text = el.textContent;
    if (text === el.__last) return;            // our own write, ignore
    const m = text.match(re);
    if (!m) { el.__last = text; return; }

    const [, pre, numStr, suf] = m;
    const to = parseFloat(numStr.replace(/,/g, ""));
    const dec = (numStr.split(".")[1] || "").length;
    const from = el.__val ?? 0;

    cancelAnimationFrame(el.__raf);
    if (reduce || from === to) { el.__val = to; el.__last = text; return; }

    const fmt = v => pre + v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf;
    const dur = 900, t0 = performance.now();

    const step = now => {
      const p = Math.min(1, (now - t0) / dur);
      const v = from + (to - from) * ease(p);
      el.__val = v;
      const out = p === 1 ? text : fmt(v);
      el.__last = out;
      el.textContent = out;
      if (p < 1) el.__raf = requestAnimationFrame(step);
    };
    el.__raf = requestAnimationFrame(step);
  }

  function initCounters() {
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      new MutationObserver(() => tween(el)).observe(el, { childList: true, characterData: true, subtree: true });
      tween(el);
    });
  }

  /* ---------- Button ripple ---------- */
  const rippleSel = ".btn-orange,.btn-outline,.btn-send,.btn-confirm,.btn-ghost,.btn-full,.filt-btn";
  document.addEventListener("pointerdown", e => {
    if (reduce) return;
    const btn = e.target.closest(rippleSel);
    if (!btn || btn.disabled) return;
    const r = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2;
    const span = document.createElement("span");
    span.className = "ripple";
    span.style.width = span.style.height = size + "px";
    span.style.left = e.clientX - r.left - size / 2 + "px";
    span.style.top = e.clientY - r.top - size / 2 + "px";
    btn.appendChild(span);
    span.addEventListener("animationend", () => span.remove());
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initCounters);
  else initCounters();
})();