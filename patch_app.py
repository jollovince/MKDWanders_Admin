# Usage: python3 patch_app.py app.js (creates a backup: app.js.bak)
import sys, shutil
f = sys.argv[1] if len(sys.argv) > 1 else "app.js"
s = open(f, encoding="utf-8", newline="").read()
shutil.copy(f, f + ".bak")
def rep(a, b):
    global s
    n = s.count(a)
    assert n == 1, f"Anchor found {n}x (expected 1): {a[:60]}"
    s = s.replace(a, b)

# 1. Validate (flight packages require travel dates)
rep('  const btn = $("btn-save-pkg");',
    '  const v2err = window.pkgV2?.validate?.();\n  if (v2err) return toast(v2err, "err");\n\n  const btn = $("btn-save-pkg");')
# 2. Include the new fields in the Firestore document
rep('featuredUntil: $("pkg-featured-until").value || null',
    'featuredUntil: $("pkg-featured-until").value || null,\n      // v2: flightIncluded, airline, flightRoute, baggage, travelDates, sharing, priceNote,\n      // itineraryDays, highlightGroups, highlightNote, inclusions, exclusions\n      ...(window.pkgV2 ? window.pkgV2.getData() : {})')
# 3. Edit/Add form: load the v2 editors
rep('  const prev = $("pkg-prev");',
    '  window.pkgV2?.setData({ ...(pkg || {}), inclusions: incItems(), exclusions: val("pkg-exc").split("\\n").map(s => s.trim()).filter(Boolean) });\n  renderIncPreview();\n\n  const prev = $("pkg-prev");')
# 4. Flight badge in the packages table
rep('<td class="td-bold">${esc(p.name || p.title)}</td>',
    '<td class="td-bold">${esc(p.name || p.title)}<div style="margin-top:4px">${p.flightIncluded ? \'<span class="pill pill-view">✈ Flight incl.</span>\' : \'<span class="pill pill-off">Land only</span>\'}</div></td>')
open(f, "w", encoding="utf-8", newline="").write(s)
print("OK — 4 patches applied. Backup:", f + ".bak")