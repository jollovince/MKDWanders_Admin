import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, deleteDoc, updateDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp, collectionGroup, arrayUnion, Timestamp
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const firebaseConfig = {
  apiKey: "AIzaSyCpspB5e6Og8Zy4LAb--HywyjvpVbH1H5M",
  authDomain: "mkdwanders.firebaseapp.com",
  projectId: "mkdwanders",
  storageBucket: "mkdwanders.firebasestorage.app",
  messagingSenderId: "615523829055",
  appId: "1:615523829055:web:1ffd2f876dcbbd0e96bf8a",
  measurementId: "G-CC2B8VM57J"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const SUPABASE_URL = "https://yehvfjycsmvnbbsoskgs.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_N_ScW0sYHPDY5WpFQXKPhw_6GBygMLH"; 
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PKG_COLLECTION = "tour_packages";

let packages = [], inquiries = [], usersList = [], chats = [];
let reviewStats = {}; // packageId -> { sum, count } (totoong reviews galing sa app users)
let chatFilter = "all";
let pkgFilter = "All", inqFilter = "all", revFilter = "all", activeChat = null, currentInq = null;
const files = { pkg: null };
let gal = []; // {url?, file?, src}  — gallery ng package; [0] = cover sa Home

/* ---------- Helper Functions ---------- */
const $ = id => document.getElementById(id);
const val = id => $(id)?.value.trim() || "";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const peso = n => "₱" + (Number(n) || 0).toLocaleString();
const emptyRow = (cols, text) => `<tr><td colspan="${cols}" class="empty-row">${text}</td></tr>`;
const toDate = t => t?.toDate ? t.toDate() : (t ? new Date(t) : null);
const fmtDate = t => { 
  const d = toDate(t); 
  return d && !isNaN(d) ? d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"; 
};
const amount = i => Number(i.total || i.price) || 0;
const pkgName = i => i.pkg || i.packageTitle || i.title || "Tour Package";

function toast(msg, type = "ok") {
  const t = document.createElement("div");
  t.className = "toast" + (type === "err" ? " err" : "");
  t.textContent = msg;
  $("toasts").appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

function maskEmail(email) {
  if (!email || typeof email !== "string" || !email.includes("@")) return "u***@gmail.com";
  const [user, domain] = email.split("@");
  if (user.length <= 2) return `${user[0]}***@${domain}`;
  return `${user.substring(0, 2)}***${user.slice(-1)}@${domain}`;
}

const hashUid = uid => (!uid || typeof uid !== "string") ? "usr_****" : `usr_${uid.substring(0, 4)}****${uid.slice(-4)}`;

async function uploadImage(file, folder) {
  const clean = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${folder}/${Date.now()}_${clean}`;
  const { error } = await supabase.storage.from("package-posters").upload(path, file, { cacheControl: "3600", upsert: true });
  if (error) throw new Error("Supabase Storage: " + error.message);
  return supabase.storage.from("package-posters").getPublicUrl(path).data.publicUrl;
}

/* ---------- Auth & Shell ---------- */
onAuthStateChanged(auth, user => {
  if (!user) { window.location.href = "login.html"; return; }
  const name = user.displayName || user.email?.split("@")[0] || "Admin";
  $("user-name").textContent = name;
  $("user-avatar").textContent = name.slice(0, 2).toUpperCase();
  $("greeting").textContent = `Welcome back, ${name}`;
  if (!window.__started) { window.__started = true; initFirestoreRealtime(); }
});

export function logout() { 
  signOut(auth).then(() => (window.location.href = "login.html")); 
}

export function toggleTheme() {
  const dark = document.documentElement.dataset.theme !== "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  try { localStorage.setItem("mkd-theme", dark ? "dark" : "light"); } catch {}
}
try { document.documentElement.dataset.theme = localStorage.getItem("mkd-theme") || "light"; } catch {}

export function go(sec, btn) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  $("sec-" + sec)?.classList.add("active");
  const labels = { 
    dashboard: "Dashboard", 
    packages: "Tour Packages", 
    inquiries: "Booking Inquiries", 
    revenue: "Payments & Revenue",
    users: "Users & Accounts", 
    chatbot: "Chatbot Logs", 
    analytics: "Analytics" 
  };
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", btn ? b === btn : b.dataset.label === labels[sec]));
  $("page-title").textContent = labels[sec] || "Dashboard";
}

export const toggleSidebar = () => $("sidebar").classList.toggle("collapsed");

/* ---------- Card highlights: auto-generate mula sa inclusions ----------
   Kapareho ng logic ng mobile app (home_screen.dart: _inclusionRank /
   _shortInclusion / _inclusionIcon) para pareho ang preview at ang card. */
let pinnedInc = [];
// Kapareho ng _incKind sa home_screen.dart. Tinatanggal muna ang (...) para
// ang "Airport Transfers (Airport-Hotel-Airport)" ay transfer, hindi hotel.
const incHas = (l, ...w) => w.some(x => l.includes(x));
const incKindName = label => {
  const l = label.toLowerCase().replace(/\([^)]*\)/g, " ");
  if (incHas(l, "ferry", "boat", "ship")) return "ferry";
  if (incHas(l, "fuel", "parking")) return "fuel";
  if (incHas(l, "tax", "surcharge")) return "tax";
  if (incHas(l, "breakfast", "meal", "food", "dining", "lunch", "dinner")) return "meal";
  if (incHas(l, "transfer", "transport", "shuttle", "pickup", "pick-up") || /\b(van|bus)\b/.test(l)) return "transfer";
  if (incHas(l, "flight", "airfare")) return "flight";
  if (incHas(l, "entrance", "ticket", "fee")) return "entrance";
  if (incHas(l, "tour", "activit", "guide", "island hopping")) return "tour";
  if (incHas(l, "hotel", "accom", "stay", "resort", "villa")) return "hotel";
  return "other";
};
const shortInc = label => {
  const l = label.toLowerCase();
  switch (incKindName(label)) {
    case "ferry": return "Ferry tickets";
    case "fuel": return "Fuel & parking";
    case "tax": return "Taxes & fees";
    case "meal": return l.includes("breakfast") ? "Daily breakfast" : "Meals included";
    case "transfer": return l.includes("airport") ? "Airport transfers" : "Transfers";
    case "flight": return "Flights";
    case "entrance": return l.includes("entrance") ? "Entrance fees" : "Tickets";
    case "tour": if (incHas(l, "city", "uphill")) return "City & uphill tour"; break;
    case "hotel": return "Hotel stay";
  }
  return label.length > 18 ? label.slice(0, 17) + "…" : label;
};
const INC_META = {
  ferry: { icon: "ti-ship", rank: 4 }, fuel: { icon: "ti-gas-station", rank: 7 }, tax: { icon: "ti-receipt", rank: 8 },
  meal: { icon: "ti-tools-kitchen-2", rank: 1 }, transfer: { icon: "ti-bus", rank: 2 }, flight: { icon: "ti-plane-departure", rank: 3 },
  entrance: { icon: "ti-ticket", rank: 6 }, tour: { icon: "ti-compass", rank: 5 }, hotel: { icon: "ti-bed", rank: 0 },
  other: { icon: "ti-circle-check", rank: 9 }
};
const incKind = label => {
  const m = INC_META[incKindName(label)];
  return label.toLowerCase().includes("breakfast") ? { ...m, icon: "ti-coffee" } : m;
};
const incItems = () => val("pkg-inc").split("\n").map(s => s.trim()).filter(Boolean);

export function renderIncPreview() {
  const items = incItems();
  pinnedInc = pinnedInc.filter(x => items.includes(x));
  const sorted = [...items].sort((a, b) => incKind(a).rank - incKind(b).rank);
  // Pinned muna, sunod ang auto-rank. Sa app, ang kasya lang sa lapad ng card ang lalabas.
  const ordered = [...pinnedInc, ...sorted.filter(x => !pinnedInc.includes(x))];
  const head = ordered.slice(0, 3);
  const chip = (l, i) => `<span class="cp-chip ${i === 2 ? "maybe" : ""}" ${i === 2 ? 'title="Lalabas lang kung kasya sa lapad ng phone"' : ""}><i class="ti ${incKind(l).icon}"></i>${esc(shortInc(l))}</span>`;
  $("cp-chips").innerHTML = items.length
    ? head.map(chip).join("") + (items.length > head.length ? `<span class="cp-chip more">+${items.length - head.length} more</span>` : "")
    : `<span class="feature-note">Maglagay ng inclusions sa taas para lumabas ang preview.</span>`;
  $("cp-pick").innerHTML = items.map((l, i) =>
    `<button type="button" class="cp-pick-btn ${pinnedInc.includes(l) ? "on" : ""}" onclick="toggleIncPin(${i})"><i class="ti ${incKind(l).icon}"></i>${esc(l)}</button>`
  ).join("");
  const mode = $("cp-mode");
  mode.textContent = pinnedInc.length ? "PINNED" : "AUTO";
  mode.classList.toggle("pin", pinnedInc.length > 0);
}

export function toggleIncPin(i) {
  const l = incItems()[i];
  if (!l) return;
  if (pinnedInc.includes(l)) pinnedInc = pinnedInc.filter(x => x !== l);
  else if (pinnedInc.length < 3) pinnedInc.push(l);
  else return toast("Max 3 lang ang pwedeng i-pin. Alisin muna ang isa.", "err");
  renderIncPreview();
}

/* ---------- Poster scan (OCR) -> Package name + Inclusions lang ----------
   Tesseract.js tumatakbo sa browser (walang server/API key).
   - Inclusions: kinukuha lang ang listahan; tinatanggal ang "ingay" na galing
     sa mga litrato sa tabi ng text (low-confidence / hindi-salitang tokens).
   - Title: hinahango mula sa mga pangalan ng destinasyon (hal. "Cebu with Bohol")
     kasi hindi nababasa nang maayos ng OCR ang stylized na letra. */
const PH_PLACES = [
  "Batanes", "Baguio", "Vigan", "Ilocos", "Pagudpud", "Sagada", "Banaue", "La Union", "Zambales", "Subic", "Bicol", "Albay", "Donsol", "Palawan", "El Nido", "Coron", "Puerto Princesa", "Mindoro", "Puerto Galera", "Batangas", "Tagaytay", "Pampanga", "Cagayan", "Manila",
  "Cebu", "Bohol", "Boracay", "Iloilo", "Bacolod", "Siquijor", "Dumaguete", "Negros", "Leyte", "Samar", "Panglao", "Moalboal", "Oslob", "Malapascua", "Bantayan", "Guimaras", "Antique", "Kalibo",
  "Siargao", "Davao", "Camiguin", "Cagayan de Oro", "Zamboanga", "General Santos", "Surigao", "Samal", "Dinagat", "Bukidnon", "Cotabato"
];
const INC_KW = /hotel|accommodation|breakfast|lunch|dinner|meal|transfer|transport|\bvan\b|tour|entrance|\bfees?\b|ferry|boat|ticket|tax|surcharge|flight|airfare|guide|insurance|fuel|parking|snorkel|island hopping|pick-?up/i;
const STOP = new Set(["and", "with", "of", "to", "the", "in", "on", "for", "per", "a", "an", "by", "at", "from", "&"]);
const DICT = new Set(("accommodation accommodations breakfast transfer transfers complimentary entrance parking tickets ticket airport hotel daily round trip roundtrip city uphill tour tours ferry fuel fees fee taxes tax surcharges island hopping lunch dinner meals meal guide insurance snorkeling pickup boat van inclusive free easy land arrangement private shared sightseeing cottage kayak kayaking canyoneering whale shark watching assistance service services environmental terminal port local visit night nights days day welcome drinks wifi access vehicle aircon air-conditioned airconditioned").split(" "));
const CONNECT = new Set(["with", "and", "&", "to"]);

const isDuration = tx => /^\d{1,2}d\d{1,2}[a-z]?n$/i.test(tx);
const fixDuration = tx => tx.replace(/^(\d{1,2})d(\d{1,2})[a-z]?n$/i, (m, a, b) => `${a}D${b}N`);

function goodToken(tx, conf, caps) {
  if (isDuration(tx)) return true;
  if (!/^[A-Za-z0-9&()\-,'\/.]+$/.test(tx)) return false;
  const w = tx.replace(/[^A-Za-z0-9&]/g, "").toLowerCase();
  if (!w) return false;
  if (STOP.has(w) || /^\d+$/.test(w)) return true;
  if (conf != null && conf < 60) return false;
  if (DICT.has(w)) return true;
  if (w.length <= 2 || !/[aeiou]/.test(w)) return false;
  if (!caps && /^[A-Z]{3,}$/.test(tx)) return false; // random ALL-CAPS sa title-case na linya = ingay
  return true;
}

// Putulin ang linya sa unang "ingay"; kumpletuhin ang salitang naputol ng litrato.
function cleanTokens(tokens) {
  const raw = tokens.map(t => t.t).join(" ");
  const caps = /[A-Z]/.test(raw) && !/[a-z]/.test(raw);
  const out = [];
  for (const k of tokens) {
    if (goodToken(k.t, k.c, caps)) out.push(k.t);
    else if (out.length) break;
  }
  if (out.length) {
    const last = out[out.length - 1];
    const w = last.replace(/[^A-Za-z]/g, "").toLowerCase();
    if (w.length >= 6 && !DICT.has(w)) {
      const full = [...DICT].find(d => d.length > w.length && d.startsWith(w));
      if (full) out[out.length - 1] = caps ? full.toUpperCase() : full[0].toUpperCase() + full.slice(1);
    }
  }
  return out.map(fixDuration).join(" ");
}

const titleCaseCaps = s =>
  s.length > 3 && s === s.toUpperCase()
    ? s.toLowerCase().replace(/(^|[\s(\-\/&])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b\d+d\d+n\b/gi, m => m.toUpperCase())
    : s;

function parseInclusions(lines) {
  const joined = l => l.map(t => t.t).join(" ");
  const idx = lines.findIndex(l => /^\W*inclusions?\W*$/i.test(joined(l)));
  let cand = idx >= 0 ? lines.slice(idx + 1, idx + 14) : lines.filter(l => INC_KW.test(joined(l)));
  const out = [];
  for (const toks of cand) {
    const text = joined(toks);
    if (/(per\s*(pax|person)|\bphp\b|₱)/i.test(text) && !INC_KW.test(text)) continue;
    // "FOR AS LOW AS ..." galing sa price tag sa tabi ng listahan
    const cut = toks.findIndex((t, i) => /^(for|as)$/i.test(t.t) && /^as$/i.test((toks[i + (/^for$/i.test(t.t) ? 1 : 0)] || {}).t || "") && /^low$/i.test((toks[i + (/^for$/i.test(t.t) ? 2 : 1)] || {}).t || ""));
    const use = cut >= 0 ? toks.slice(0, cut) : toks;
    let l = titleCaseCaps(cleanTokens(use)).trim();
    if (!/[A-Za-z]{3,}/.test(l) || l.length < 4 || l.length > 70) continue;
    if (/^\(/.test(l) && out.length) { out[out.length - 1] += " " + l; continue; }
    out.push(l);
  }
  return [...new Set(out)].slice(0, 12);
}

function parseTitle(rawLines) {
  const hdr = rawLines.findIndex(l => /^\W*inclusions?\W*$/i.test(l));
  const pool = hdr >= 0 ? rawLines.slice(0, hdr) : rawLines;
  const places = PH_PLACES.map(n => n.toLowerCase().split(" ")).sort((a, b) => b.length - a.length);
  const pieces = [];
  let started = false;
  for (const line of pool) {
    const toks = line.toLowerCase().replace(/[^a-z& ]/g, " ").split(/\s+/).filter(Boolean);
    const found = [];
    let seen = started;
    for (let i = 0; i < toks.length; i++) {
      const p = places.find(pl => pl.every((w, k) => toks[i + k] === w));
      if (p) { found.push(p.join(" ")); i += p.length - 1; seen = true; }
      else if (seen && CONNECT.has(toks[i])) found.push(toks[i]);
    }
    if (found.some(x => !CONNECT.has(x))) { pieces.push(...found); started = true; }
    else if (started && found.length) pieces.push(...found);   // "with" sa sariling linya
    else if (started) break;
  }
  while (pieces.length && CONNECT.has(pieces[pieces.length - 1])) pieces.pop();
  const cap = w => w.replace(/(^|\s)([a-z])/g, (m, a, b) => a + b.toUpperCase());
  return pieces.map(p => (CONNECT.has(p) ? p : cap(p))).join(" ");
}

async function preparePass(file, invert) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const x = c.getContext("2d");
  x.drawImage(bmp, 0, 0, c.width, c.height);
  const im = x.getImageData(0, 0, c.width, c.height), d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    let g = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2];
    if (invert) g = 255 - g;
    g = Math.max(0, Math.min(255, (g - 110) * 1.8 + 110));
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  x.putImageData(im, 0, 0);
  return c;
}

// Kunin ang lines na may words+confidence (v5: data.lines; v6: data.blocks).
function toLines(data) {
  let lines = data.lines;
  if (!lines && data.blocks) lines = data.blocks.flatMap(b => b.paragraphs.flatMap(p => p.lines));
  if (lines && lines.length) {
    return lines.map(l => (l.words || []).map(w => ({ t: String(w.text || "").trim(), c: w.confidence })).filter(k => k.t));
  }
  return (data.text || "").split("\n").map(s => s.trim().split(/\s+/).filter(Boolean).map(t => ({ t, c: null })));
}

let tessLoad;
const loadTess = () => (tessLoad ||= new Promise((res, rej) => {
  const s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  s.onload = () => res(window.Tesseract);
  s.onerror = () => { tessLoad = null; rej(new Error("Hindi ma-load ang OCR engine. Check ang internet.")); };
  document.head.appendChild(s);
}));

export async function scanPoster() {
  const file = files.pkg;
  if (!file) return toast("Mag-upload muna ng poster, tapos i-scan.", "err");
  const btn = $("btn-scan"), st = $("scan-status");
  btn.disabled = true;
  try {
    st.textContent = "Loading OCR engine...";
    const T = await loadTess();
    const passes = [];
    for (const [i, inv] of [[0, false], [1, true]]) {
      st.textContent = `Scanning poster (${i + 1}/2)...`;
      const worker = await T.createWorker("eng", 1, {
        logger: m => { if (m.status === "recognizing text") st.textContent = `Scanning poster (${i + 1}/2) ${Math.round(m.progress * 100)}%`; }
      });
      const { data } = await worker.recognize(await preparePass(file, inv));
      await worker.terminate();
      passes.push({ raw: (data.text || "").split("\n").map(s => s.trim()).filter(Boolean), lines: toLines(data) });
    }
    applyScan(passes);
  } catch (e) {
    st.textContent = "Scan failed: " + (e.message || e);
  } finally {
    btn.disabled = false;
  }
}

function applyScan(passes) {
  const over = $("scan-overwrite").checked;
  const filled = [];
  const put = (id, v, label) => {
    if (!v) return;
    const cur = ($(id).value || "").trim();
    if (cur && !over) return;
    $(id).value = v; $(id).classList.add("autofilled"); filled.push(label);
  };

  const score = a => a.filter(l => INC_KW.test(l)).length * 100 + a.length;
  const incs = passes.map(p => parseInclusions(p.lines)).sort((a, b) => score(b) - score(a))[0] || [];
  const titles = passes.map(p => parseTitle(p.raw)).sort((a, b) => b.length - a.length);

  put("pkg-name", titles[0], "Package name");
  if (incs.length) put("pkg-inc", incs.join("\n"), `Inclusions (${incs.length})`);

  renderIncPreview();
  $("scan-status").textContent = filled.length
    ? `Na-fill: ${filled.join(", ")}. Pakicheck ang mga orange na fields bago i-save.`
    : "Walang malinaw na nabasa. Subukan ang mas malinaw na image, o i-type manually.";
}

document.addEventListener("input", e => e.target?.classList?.remove("autofilled"));
document.addEventListener("change", e => e.target?.classList?.remove("autofilled"));

/* ---------- Package photos (gallery) ---------- */
function renderGal() {
  $("gal-grid").innerHTML = gal.map((g, i) => `
    <div class="gal-item ${i === 0 ? "first" : ""}">
      <img src="${esc(g.src)}" alt="Photo ${i + 1}">
      <span class="gal-tag">${i === 0 ? "Cover · Home" : i + 1}</span>
      <div class="gal-act">
        <button type="button" title="Move left" onclick="galMove(${i},-1)"><i class="ti ti-arrow-left"></i></button>
        <button type="button" title="Move right" onclick="galMove(${i},1)"><i class="ti ti-arrow-right"></i></button>
        <button type="button" title="Remove" onclick="galDel(${i})"><i class="ti ti-x"></i></button>
      </div>
    </div>`).join("");
}
export function addGalleryFiles(ev) {
  for (const f of ev.target.files || []) gal.push({ file: f, src: URL.createObjectURL(f) });
  ev.target.value = "";
  renderGal();
}
export function galMove(i, d) {
  const j = i + d;
  if (j < 0 || j >= gal.length) return;
  [gal[i], gal[j]] = [gal[j], gal[i]];
  renderGal();
}
export function galDel(i) { gal.splice(i, 1); renderGal(); }

/* ---------- Tour Packages Management ---------- */
export function openPkgForm(id) {
  const pkg = id ? packages.find(p => p.id === id) : null;
  $("pkg-form-title").textContent = pkg ? "Edit tour package" : "Add a new destination package";
  $("pkg-form").style.borderTopColor = pkg ? "var(--sky)" : "var(--orange)";
  const g = (k, d = "") => pkg?.[k] ?? d;
  
  document.querySelectorAll("#pkg-form .autofilled").forEach(el => el.classList.remove("autofilled"));
  $("scan-status").textContent = "";
  $("pkg-id").value = pkg?.id || "";
  $("pkg-old-poster").value = pkg ? (pkg.poster || "") : "";
  // Gallery: [imageUrl, ...gallery] na walang doble; ang una ang cover sa Home.
  const urls = [...new Set([...(Array.isArray(pkg?.gallery) ? pkg.gallery : []), ...(pkg?.imageUrl ? [pkg.imageUrl] : [])].filter(Boolean))];
  if (pkg?.imageUrl && urls[0] !== pkg.imageUrl && !(pkg.gallery || []).includes(pkg.imageUrl)) urls.unshift(pkg.imageUrl);
  gal = urls.map(u => ({ url: u, src: u }));
  renderGal();
  $("pkg-code").value = g("code");
  $("pkg-name").value = pkg ? (pkg.name || pkg.title || "") : "";
  $("pkg-dest").value = pkg ? (pkg.dest || pkg.destination || pkg.location || "") : "";
  $("pkg-region").value = g("region", "Luzon");
  $("pkg-dur").value = pkg ? (pkg.dur || pkg.durationLabel || "") : "";
  $("pkg-price").value = g("price", "");
  $("pkg-cat").value = g("category", "Beach & Island");
  $("pkg-route").value = g("route");
  $("pkg-featured").value = pkg?.featured === true ? "true" : "false";
  $("pkg-featured-order").value = g("featuredOrder", "");
  $("pkg-featured-until").value = g("featuredUntil", "");
  
  let incText = "";
  if (Array.isArray(pkg?.inclusions)) {
    incText = pkg.inclusions.join("\n");
  } else if (pkg?.inclusions && typeof pkg.inclusions === "object") {
    incText = Object.values(pkg.inclusions).flat().join("\n");
  }
  $("pkg-inc").value = incText;
  $("pkg-type").value = g("packageType");
  pinnedInc = Array.isArray(pkg?.cardHighlights) ? [...pkg.cardHighlights] : [];
  renderIncPreview();
  
  $("pkg-exc").value = Array.isArray(pkg?.exclusions) ? pkg.exclusions.join("\n") : "";
  
  let itinText = pkg?.itineraryText || "";
  if (!itinText && Array.isArray(pkg?.itinerary)) {
    itinText = pkg.itinerary.map(day => `${day.title || 'Day'}: ${(day.stops || []).join(', ')}`).join("\n");
  }
  $("pkg-itin").value = itinText;

  const prev = $("pkg-prev");
  prev.src = pkg ? (pkg.poster || "") : "";
  prev.style.display = prev.src ? "block" : "none";
  $("pkg-hint").textContent = pkg?.poster ? "Choose a new image to replace current poster" : "Click or drag the agency poster (PNG, JPG)";
  $("pkg-file").value = "";
  files.pkg = null;
  $("pkg-form").style.display = "block";
  $("pkg-form").scrollIntoView({ behavior: "smooth", block: "start" });
}

export function closePkgForm() { 
  $("pkg-form").style.display = "none"; 
  files.pkg = null;
}

export function previewImg(event, imgId, hintId, kind) {
  const file = event?.target?.files?.[0];
  if (!file) return;
  files[kind] = file;
  const reader = new FileReader();
  reader.onload = e => { 
    const im = $(imgId); 
    im.src = e.target.result; 
    im.style.display = "block"; 
  };
  reader.readAsDataURL(file);
  $(hintId).textContent = file.name;
  if (kind === "pkg") $("scan-status").textContent = "I-click ang \"Scan poster & auto-fill\" para ma-fill ang form mula sa image.";
}

export function filterPkg(type, btn) {
  pkgFilter = type;
  document.querySelectorAll("#pkg-filters .filt-btn").forEach(b => b.classList.remove("on"));
  btn?.classList.add("on");
  renderPkgs();
}

export async function savePackage() {
  const id = val("pkg-id");
  const name = val("pkg-name");
  const dest = val("pkg-dest");
  const dur = val("pkg-dur");
  const price = Number($("pkg-price").value) || 0;

  if (!name || !dest || !dur || price <= 0) {
    return toast("Fill in Name, Destination, Duration, and Price.", "err");
  }
  if (gal.length === 0) {
    return toast("Mag-upload ng kahit isang Package photo (ang una ang cover sa Home).", "err");
  }

  const btn = $("btn-save-pkg");
  btn.disabled = true;
  btn.innerHTML = `<i class="ti ti-loader"></i> Saving...`;

  try {
    // Package photos: i-upload ang bago, panatilihin ang pagkakasunod. [0] = cover sa Home.
    const galleryUrls = [];
    for (let i = 0; i < gal.length; i++) {
      if (gal[i].url) { galleryUrls.push(gal[i].url); continue; }
      btn.innerHTML = `<i class="ti ti-loader"></i> Uploading photo ${i + 1}/${gal.length}...`;
      galleryUrls.push(await uploadImage(gal[i].file, "gallery"));
    }
    // Poster = optional, para lang sa scan (hindi cover).
    let poster = val("pkg-old-poster");
    if (files.pkg) poster = await uploadImage(files.pkg, "posters");

    const incList = val("pkg-inc").split("\n").map(s => s.trim()).filter(Boolean);
    const excList = val("pkg-exc").split("\n").map(s => s.trim()).filter(Boolean);
    const routeText = val("pkg-route") || dest;
    const stopsList = routeText.split(",").map(s => s.trim()).filter(Boolean);

    const data = {
      code: val("pkg-code").toUpperCase() || `MKD-${Date.now().toString().slice(-4)}`,
      name: name,
      title: name,
      dest: dest,
      destination: dest,
      location: dest,
      region: val("pkg-region"),
      dur: dur,
      durationLabel: dur,
      durationKey: dur,
      price: price,
      category: val("pkg-cat"),
      route: routeText,
      poster: poster,
      imageUrl: galleryUrls[0],
      gallery: galleryUrls,
      isActive: true,
      status: "active",
      groupMin: 1,
      groupMax: 10,
      activity: "Easy",
      highlights: stopsList,
      bestFor: ["Couples", "Barkada", "Solo", "Families"],
      // Walang fake default: kung walang nilagay, walang ipapakita sa app.
      packageType: val("pkg-type"),
      inclusions: incList,
      cardHighlights: pinnedInc.filter(x => incList.includes(x)).slice(0, 3),
      exclusions: excList,
      itineraryText: val("pkg-itin"),
      // Home screen placement (Featured Packages sa mobile app)
      featured: $("pkg-featured").value === "true",
      featuredOrder: Number($("pkg-featured-order").value) || null,
      featuredUntil: $("pkg-featured-until").value || null
    };

    if (id) {
      await updateDoc(doc(db, PKG_COLLECTION, id), { 
        ...data, 
        updatedAt: serverTimestamp() 
      });
    } else {
      await addDoc(collection(db, PKG_COLLECTION), { 
        ...data, 
        views: 0, 
        rating: 0,
        reviews: 0,
        createdAt: serverTimestamp() 
      });
    }

    closePkgForm();
    toast(id ? "Package updated." : "Package saved successfully.");
  } catch (err) {
    console.error(err);
    toast("Could not save package: " + err.message, "err");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="ti ti-check"></i> Save package`;
  }
}

export async function removePkg(id) {
  if (!confirm("Are you sure you want to delete this package?")) return;
  try { 
    await deleteDoc(doc(db, PKG_COLLECTION, id)); 
    toast("Package deleted."); 
  } catch (err) { 
    toast("Delete failed: " + err.message, "err"); 
  }
}

/* Featured = featured:true at hindi pa lampas sa featuredUntil */
const todayStr = () => new Date().toISOString().slice(0, 10);
const isFeaturedNow = p => p.featured === true && (!p.featuredUntil || p.featuredUntil >= todayStr());

export async function toggleFeatured(id) {
  const p = packages.find(x => x.id === id);
  if (!p) return;
  const turnOn = p.featured !== true;
  const data = { featured: turnOn, updatedAt: serverTimestamp() };
  if (turnOn) {
    // expired na dati? i-clear para hindi agad mawala; ilagay sa dulo ng order
    if (p.featuredUntil && p.featuredUntil < todayStr()) data.featuredUntil = null;
    if (!p.featuredOrder) {
      data.featuredOrder = Math.max(0, ...packages.map(x => Number(x.featuredOrder) || 0)) + 1;
    }
  }
  try {
    await updateDoc(doc(db, PKG_COLLECTION, id), data);
    toast(turnOn ? "Added to Featured Packages on the app." : "Removed from Featured. Now under Recommended only.");
  } catch (err) {
    toast("Update failed: " + err.message, "err");
  }
}

export function renderPkgs() {
  const q = val("pkg-search").toLowerCase();
  const list = packages.filter(p =>
    (pkgFilter === "All" || (pkgFilter === "Featured" ? isFeaturedNow(p) : p.region === pkgFilter)) &&
    (!q || [p.name, p.title, p.code, p.dest, p.destination, p.location].some(v => String(v || "").toLowerCase().includes(q)))
  );
  
  const tbody = $("pkg-body");
  if (!list.length) { 
    tbody.innerHTML = emptyRow(10, "No packages found. Click “Add new package” to create one."); 
    return; 
  }

  tbody.innerHTML = list.map(p => `
    <tr>
      <td><img src="${esc(p.imageUrl || p.poster)}" class="poster-thumb" alt="${esc(p.name || p.title)}"></td>
      <td class="td-mono" style="font-weight:700;color:var(--head)">${esc(p.code || "TOUR")}</td>
      <td class="td-bold">${esc(p.name || p.title)}</td>
      <td class="td-muted">${esc(p.dest || p.destination || p.location)}</td>
      <td>${pillRegion(p.region)}</td>
      <td class="td-muted">${esc(p.dur || p.durationLabel)}</td>
      <td class="td-navy">${peso(p.price)}</td>
      <td>${(() => { const st = reviewStats[p.id]; return st && st.count ? `<span class="pill pill-view"><i class="ti ti-star-filled"></i> ${(st.sum / st.count).toFixed(1)} (${st.count})</span>` : `<span class="td-muted">No reviews yet</span>`; })()}</td>
      <td>
        <button class="star-btn ${isFeaturedNow(p) ? "on" : ""}" onclick="toggleFeatured('${p.id}')" title="${isFeaturedNow(p) ? "Remove from Featured" : "Feature on app Home"}" aria-label="Toggle featured"><i class="ti ti-star${isFeaturedNow(p) ? "-filled" : ""}"></i></button>
        ${p.featured === true ? (isFeaturedNow(p)
          ? `<span class="pill pill-feat">#${p.featuredOrder || "–"}${p.featuredUntil ? " · until " + esc(p.featuredUntil) : ""}</span>`
          : `<span class="pill pill-off">Expired</span>`) : ""}
      </td>
      <td>
        <button class="btn-edit" onclick="openPkgForm('${p.id}')">Edit</button>
        <button class="btn-danger" onclick="removePkg('${p.id}')">Delete</button>
      </td>
    </tr>`).join("");
}

/* ---------- Booking Inquiries Management ---------- */
const pillRegion = r => `<span class="pill pill-${r === "Luzon" ? "luzon" : r === "Visayas" ? "visayas" : "mindanao"}">${esc(r || "Mindanao")}</span>`;

function pillStatus(s) {
  const m = { 
    pending: ["pill-pend", "Pending"], 
    paid: ["pill-conf", "Paid"], 
    responded: ["pill-resp", "Responded"], 
    confirmed: ["pill-conf", "Confirmed"],
    cancelled: ["pill-off", "Cancelled"]
  };
  const [cls, lbl] = m[s] || m.pending;
  return `<span class="pill ${cls}">${lbl}</span>`;
}

export function filterInq(s, btn) {
  inqFilter = s;
  document.querySelectorAll("#inq-filters .filt-btn").forEach(b => b.classList.remove("on"));
  btn?.classList.add("on");
  renderInquiries();
}

function filteredInquiries() {
  const q = val("inq-search").toLowerCase();
  return inquiries.filter(i =>
    (inqFilter === "all" || (i.status || "pending") === inqFilter) &&
    (!q || [i.client, i.name, pkgName(i), i.id, i.code, i.reference, i.phone, i.email].some(v => String(v || "").toLowerCase().includes(q)))
  );
}

export function renderInquiries() {
  const list = filteredInquiries();
  const tbody = $("inq-body");
  if (!list.length) { 
    tbody.innerHTML = emptyRow(9, "No booking inquiries match this filter."); 
    return; 
  }

  tbody.innerHTML = list.map(i => {
    const dateRange = i.travelDate 
      ? `${esc(i.travelDate)}${i.travelEndDate ? ' – ' + esc(i.travelEndDate) : ''}`
      : "Flexible Schedule";

    return `
      <tr>
        <td class="td-mono">${esc((i.code || i.reference || i.id).substring(0, 10))}</td>
        <td class="td-bold">
          ${esc(i.client || i.name || "Traveler")}
          <div class="td-muted" style="font-size:11px;font-weight:400;">${esc(i.phone || maskEmail(i.email))}</div>
        </td>
        <td class="td-muted">${esc(pkgName(i))}</td>
        <td class="td-bold" style="font-size:12px;color:var(--nav);">${dateRange}</td>
        <td>${i.pax || 1} pax</td>
        <td class="td-navy">${peso(amount(i))}</td>
        <td class="td-mono">${esc(i.paymentMethod || "UnionBank QR Ph")}</td>
        <td>${pillStatus(i.status || "pending")}</td>
        <td><button class="btn-outline" onclick="openDetail('${i.id}')">View</button></td>
      </tr>`;
  }).join("");
}

export function exportInquiries() {
  const rows = filteredInquiries();
  if (!rows.length) return toast("Nothing to export.", "err");
  const head = ["Ref", "Client", "Phone", "Email", "Package", "Pax", "Total", "Payment", "Status", "Travel Date", "Special Requests", "Submitted"];
  const lines = rows.map(i => [
    i.code || i.reference || i.id, 
    i.client || i.name || "", 
    i.phone || "",
    i.email || "",
    pkgName(i), 
    i.pax || 1, 
    amount(i), 
    i.paymentMethod || "UnionBank QR Ph", 
    i.status || "pending", 
    i.travelDate ? `${i.travelDate} to ${i.travelEndDate || ''}` : "", 
    i.specialRequests || "",
    fmtDate(i.createdAt)
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));

  const blob = new Blob(["\ufeff" + [head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `mkdwander-inquiries-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast("CSV exported.");
}

export function openDetail(id) {
  const i = inquiries.find(x => x.id === id);
  if (!i) return;
  currentInq = i;
  
  $("det-name").textContent = i.client || i.name || "Traveler User";
  $("det-ref").textContent = "Ref: " + (i.code || i.reference || i.id);
  $("det-pkg").textContent = pkgName(i);
  $("det-phone").textContent = i.phone || "Not provided";
  $("det-email").textContent = i.email || "Not provided";
  $("det-pax").textContent = `${i.pax || 1} traveler${(i.pax || 1) > 1 ? 's' : ''}`;
  $("det-price").textContent = peso(amount(i));
  $("det-pay").textContent = i.paymentMethod || "UnionBank QR Ph";
  
  const dateStr = i.travelDate 
    ? `${i.travelDate}${i.travelEndDate ? ' – ' + i.travelEndDate : ''}` 
    : "Flexible / To be confirmed";
  $("det-travel-date").textContent = dateStr;
  $("det-date").textContent = i.date || fmtDate(i.createdAt);
  
  const reqBox = $("box-special-requests");
  if (i.specialRequests && i.specialRequests.trim()) {
    $("det-special-requests").textContent = i.specialRequests;
    reqBox.style.display = "block";
  } else {
    reqBox.style.display = "none";
  }

  $("reply-text").value = i.adminNote || "";
  
  $("inq-detail").style.display = "block";
  $("inq-detail").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

export function closeDetail() { 
  $("inq-detail").style.display = "none"; 
  currentInq = null; 
}

async function setStatus(status, stamp, msg) {
  if (!currentInq) return;
  try {
    const data = { status, [stamp]: serverTimestamp() };
    const note = val("reply-text");
    if (note) data.adminNote = note;
    await updateDoc(doc(db, "booking_inquiries", currentInq.id), data);
    toast(msg);
    closeDetail();
  } catch (err) { 
    toast("Update failed: " + err.message, "err"); 
  }
}

export const sendInquiryReply = () => setStatus("responded", "respondedAt", "Inquiry marked as responded with notes.");
export const confirmInquiry = () => setStatus("confirmed", "confirmedAt", "Booking inquiry confirmed as paid.");
export const cancelInquiry = () => {
  if (!confirm("Reject or cancel this inquiry?")) return;
  setStatus("cancelled", "cancelledAt", "Booking marked as cancelled.");
};

/* ---------- Payments & Revenue Ledger ---------- */
export function filterRev(mode, btn) {
  revFilter = mode;
  document.querySelectorAll("#revenue-filters .filt-btn").forEach(b => b.classList.remove("on"));
  btn?.classList.add("on");
  renderRevenue();
}

function getPaidInquiries() {
  const q = val("revenue-search").toLowerCase();
  return inquiries.filter(i => {
    const isPaid = ["confirmed", "paid"].includes(i.status);
    if (!isPaid) return false;
    const method = String(i.paymentMethod || "").toLowerCase();
    const matchChannel = (revFilter === "all") ||
      (revFilter === "ub" && method.includes("unionbank")) ||
      (revFilter === "bpi" && method.includes("bpi"));
    const matchQuery = !q || [i.client, i.name, pkgName(i), i.id, i.code, i.reference, i.paymentMethod].some(v => String(v || "").toLowerCase().includes(q));
    return matchChannel && matchQuery;
  });
}

export function renderRevenue() {
  const paidList = getPaidInquiries();
  const allPaid = inquiries.filter(i => ["confirmed", "paid"].includes(i.status));

  const totalCollected = allPaid.reduce((sum, item) => sum + amount(item), 0);
  const ubItems = allPaid.filter(i => String(i.paymentMethod || "").toLowerCase().includes("unionbank"));
  const bpiItems = allPaid.filter(i => String(i.paymentMethod || "").toLowerCase().includes("bpi"));

  const ubVol = ubItems.reduce((sum, item) => sum + amount(item), 0);
  const bpiVol = bpiItems.reduce((sum, item) => sum + amount(item), 0);
  const totalPax = allPaid.reduce((sum, item) => sum + (Number(item.pax) || 1), 0);
  const avgVal = totalPax > 0 ? (totalCollected / totalPax) : 0;

  if ($("rev-total-collected")) $("rev-total-collected").textContent = peso(totalCollected);
  if ($("rev-paid-count")) $("rev-paid-count").textContent = `${allPaid.length} confirmed bookings`;
  if ($("rev-ub-volume")) $("rev-ub-volume").textContent = peso(ubVol);
  if ($("rev-ub-count")) $("rev-ub-count").textContent = `${ubItems.length} transactions`;
  if ($("rev-bpi-volume")) $("rev-bpi-volume").textContent = peso(bpiVol);
  if ($("rev-bpi-count")) $("rev-bpi-count").textContent = `${bpiItems.length} transactions`;
  if ($("rev-avg-value")) $("rev-avg-value").textContent = peso(avgVal);

  const tbody = $("revenue-body");
  if (!tbody) return;

  if (!paidList.length) {
    tbody.innerHTML = emptyRow(9, "No paid transactions were found for this filter.");
    return;
  }

  tbody.innerHTML = paidList.map(i => {
    const dateRange = i.travelDate 
      ? `${esc(i.travelDate)}${i.travelEndDate ? ' – ' + esc(i.travelEndDate) : ''}`
      : "Flexible";

    return `
      <tr>
        <td class="td-mono">${esc((i.code || i.reference || i.id).substring(0, 10))}</td>
        <td class="td-bold">
          ${esc(i.client || i.name || "Traveler")}
          <div class="td-muted" style="font-size:11px;font-weight:400;">${esc(i.phone || maskEmail(i.email))}</div>
        </td>
        <td class="td-muted">${esc(pkgName(i))}</td>
        <td class="td-bold" style="font-size:12px;color:var(--nav);">${dateRange}</td>
        <td>${i.pax || 1} pax</td>
        <td class="td-navy" style="color:var(--green);font-size:14px;">${peso(amount(i))}</td>
        <td class="td-mono"><span class="pill pill-view"><i class="ti ti-credit-card"></i> ${esc(i.paymentMethod || "UnionBank QR Ph")}</span></td>
        <td class="td-muted">${fmtDate(i.confirmedAt || i.createdAt)}</td>
        <td><span class="pill pill-conf">Paid &amp; Confirmed</span></td>
      </tr>`;
  }).join("");
}

export function exportRevenue() {
  const rows = getPaidInquiries();
  if (!rows.length) return toast("No paid records to export.", "err");
  const head = ["Receipt/Ref", "Client", "Phone", "Email", "Package", "Pax", "Amount Paid", "Channel", "Confirmed Date", "Travel Schedule"];
  const lines = rows.map(i => [
    i.code || i.reference || i.id,
    i.client || i.name || "",
    i.phone || "",
    i.email || "",
    pkgName(i),
    i.pax || 1,
    amount(i),
    i.paymentMethod || "UnionBank QR Ph",
    fmtDate(i.confirmedAt || i.createdAt),
    i.travelDate ? `${i.travelDate} to ${i.travelEndDate || ''}` : "Flexible"
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));

  const blob = new Blob(["\ufeff" + [head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `mkdwander-revenue-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast("Revenue CSV exported.");
}

/* ---------- Registered Users ---------- */
export function renderUsers() {
  const q = val("user-search").toLowerCase();
  const list = usersList.filter(u => !q || String(u.fullName || u.displayName || u.firstName || "").toLowerCase().includes(q));
  const tbody = $("users-body");
  if (!list.length) { 
    tbody.innerHTML = emptyRow(4, "No registered travelers found."); 
    return; 
  }
  
  tbody.innerHTML = list.map(u => `
    <tr>
      <td class="td-bold"><i class="ti ti-user" style="margin-right:6px;color:var(--orange)"></i>${esc(u.fullName || u.displayName || u.firstName || "App Traveler")}</td>
      <td class="td-muted">${esc(maskEmail(u.email))}</td>
      <td><span class="pill pill-hash">${esc(hashUid(u.id))}</span></td>
      <td><span class="pill pill-conf">Active</span></td>
    </tr>`).join("");
}

/* ---------- Chatbot Logs ---------- */
const chatState = c => c.status === "escalated" ? "escalated" : c.status === "resolved" ? "resolved" : "bot";
const chatTime = c => (toDate(c.updatedAt || c.createdAt) || 0);

export function filterChats(mode, btn) {
  chatFilter = mode;
  document.querySelectorAll("#chat-filters .filt-btn").forEach(b => b.classList.remove("on"));
  btn?.classList.add("on");
  renderChats();
}

function renderChats() {
  const box = $("chat-session-list");
  const need = chats.filter(c => chatState(c) === "escalated").length;
  const badge = $("nav-chat-badge");
  if (badge) badge.textContent = need || "";
  const nf = $("chat-need-count");
  if (nf) nf.textContent = need ? ` (${need})` : "";

  const list = chats
    .filter(c => chatFilter === "all" || (chatFilter === "need" ? chatState(c) === "escalated" : chatState(c) === chatFilter))
    // Kailangan ng reply = nasa itaas, tapos pinakabago
    .sort((a, b) => (chatState(b) === "escalated") - (chatState(a) === "escalated") || chatTime(b) - chatTime(a));

  if (!list.length) {
    box.innerHTML = `<div class="empty-row">${chats.length ? "No conversations in this filter." : "No chatbot sessions yet."}</div>`;
    return;
  }

  box.innerHTML = list.map(c => {
    const msgs = c.messages || [];
    const last = msgs[msgs.length - 1];
    const st = chatState(c);
    const pill = st === "escalated" ? `<span class="pill pill-pend">Needs reply</span>`
      : st === "resolved" ? `<span class="pill pill-conf">Resolved</span>`
      : `<span class="pill pill-hash">${c.handledBy === "agent" ? "Agent" : "Bot"}</span>`;
    return `<div class="chat-item ${c.id === activeChat ? "on" : ""}" onclick="openChat('${c.id}')">
      <div class="chat-item-top">
        <span class="chat-item-name">${esc(c.userName || c.user || "Traveler")}</span>
        <span class="chat-time">${fmtDate(c.updatedAt || c.createdAt)}</span>
      </div>
      <div class="chat-preview">${esc(last?.text || last?.content || "No messages")}</div>
      <div class="chat-meta">${pill}<span class="td-muted">${msgs.length} msgs</span></div>
    </div>`;
  }).join("");
}

const bubbleClass = m => { const s = m.role || m.sender; return s === "user" ? "bubble-user" : s === "agent" ? "bubble-agent" : "bubble-bot"; };

export function openChat(id) {
  activeChat = id;
  const c = chats.find(x => x.id === id);
  if (!c) return;
  const st = chatState(c);
  $("chat-active-name").textContent = c.userName || c.user || "Traveler";
  $("chat-active-sub").textContent = `${(c.messages || []).length} messages · ${fmtDate(c.updatedAt || c.createdAt)}` + (st === "escalated" ? " · Needs reply" : st === "resolved" ? " · Resolved" : "");
  const box = $("chat-msgs-container");
  box.innerHTML = (c.messages || []).map(m =>
    `<div class="${bubbleClass(m)}">${(m.role || m.sender) === "agent" ? `<span class="bubble-tag">You (MKDWander team)</span>` : ""}${esc(m.text || m.content)}</div>`
  ).join("") || `<div class="empty-row">This session has no messages.</div>`;
  box.scrollTop = box.scrollHeight;
  $("chat-reply-bar").style.display = "flex";
  $("btn-chat-resolve").style.display = st === "resolved" ? "none" : "inline-flex";
  renderChats();
}

export async function sendChatReply() {
  const c = chats.find(x => x.id === activeChat);
  const text = val("chat-reply-text");
  if (!c || !text) return;
  const btn = $("btn-chat-send");
  btn.disabled = true;
  try {
    await updateDoc(doc(db, "chatbot_logs", c.id), {
      messages: arrayUnion({ sender: "agent", text, at: Timestamp.now() }),
      handledBy: "agent",
      status: "escalated",          // bukas pa hanggang i-resolve
      updatedAt: serverTimestamp()
    });
    $("chat-reply-text").value = "";
    toast("Reply sent. Makikita ito ng traveler sa app agad.");
  } catch (err) {
    toast("Could not send: " + err.message, "err");
  } finally {
    btn.disabled = false;
  }
}

export async function resolveChat() {
  const c = chats.find(x => x.id === activeChat);
  if (!c) return;
  try {
    await updateDoc(doc(db, "chatbot_logs", c.id), { status: "resolved", resolvedAt: serverTimestamp() });
    toast("Conversation marked as resolved.");
  } catch (err) {
    toast("Update failed: " + err.message, "err");
  }
}

/* ---------- Dashboard & Analytics ---------- */
function renderDashboardData() {
  const total = inquiries.length;
  const pending = inquiries.filter(i => (i.status || "pending") === "pending");
  const confirmed = inquiries.filter(i => ["confirmed", "paid"].includes(i.status));
  const pipeline = inquiries.reduce((s, i) => s + amount(i), 0);
  const revenue = confirmed.reduce((s, i) => s + amount(i), 0);

  $("kpi-total-bookings").textContent = total;
  $("kpi-total-revenue").textContent = peso(revenue);
  $("kpi-pipeline").textContent = "Pipeline: " + peso(pipeline);
  $("kpi-pending-inquiries").textContent = pending.length;
  $("topbar-inq-count").textContent = `${pending.length} pending inquiries`;
  $("nav-inq-badge").textContent = pending.length || "";
  $("kpi-active-pkg").textContent = packages.length;
  $("kpi-total-users").textContent = usersList.length;

  const now = new Date();
  const months = Array.from({ length: 6 }, (_, k) => { 
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + k, 1); 
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString("en", { month: "short" }), n: 0 }; 
  });

  inquiries.forEach(i => { 
    const d = toDate(i.createdAt); 
    if (!d) return; 
    const m = months.find(x => x.key === `${d.getFullYear()}-${d.getMonth()}`); 
    if (m) m.n++; 
  });

  const max = Math.max(1, ...months.map(m => m.n));
  $("monthly-chart").innerHTML = months.map(m => `
    <div class="bar-wrap">
      <span class="bar-val">${m.n}</span>
      <div class="bar" style="height:${(m.n / max) * 100}%"></div>
      <span class="bar-lbl">${m.label}</span>
    </div>`).join("");

  const byPkg = {};
  inquiries.forEach(i => { 
    const k = pkgName(i); 
    byPkg[k] = (byPkg[k] || 0) + 1; 
  });

  const top = Object.entries(byPkg).sort((a, b) => b[1] - a[1]);
  $("dest-rows").innerHTML = top.slice(0, 5).map(([n, c]) => {
    const pct = Math.round((c / total) * 100);
    return `<div class="dest-row">
      <div class="dest-hd"><span>${esc(n)}</span><span class="dest-pct">${c} · ${pct}%</span></div>
      <div class="prog-bg"><div class="prog-fill" style="width:${pct}%"></div></div>
    </div>`;
  }).join("") || `<div class="empty-row">No inquiries yet.</div>`;

  $("recent-inq").innerHTML = inquiries.slice(0, 5).map(i => `
    <div class="inq-row" onclick="go('inquiries',null);openDetail('${i.id}')">
      <div>
        <div class="inq-name">${esc(i.client || i.name || "Traveler")}</div>
        <div class="inq-sub">${esc(pkgName(i))} · ${i.pax || 1} pax</div>
      </div>
      ${pillStatus(i.status || "pending")}
    </div>`
  ).join("") || `<div class="empty-row">No inquiries yet.</div>`;

  const pax = inquiries.reduce((s, i) => s + (Number(i.pax) || 1), 0);
  $("analytics-avg-group").textContent = (total ? (pax / total).toFixed(1) : 0) + " pax";
  $("analytics-total-inq").textContent = total;
  $("analytics-conf-rate").textContent = (total ? Math.round((confirmed.length / total) * 100) : 0) + "%";

  const maxViews = Math.max(1, ...packages.map(p => p.views || 0));
  $("perf-rows").innerHTML = [...packages].sort((a, b) => (byPkg[pkgName({ pkg: b.name })] || 0) - (byPkg[pkgName({ pkg: a.name })] || 0)).slice(0, 6).map(p => {
    const n = byPkg[p.name || p.title] || 0;
    return `<div class="perf-row">
      <div class="dest-hd"><span>${esc(p.name || p.title)}</span><span class="dest-pct">${n} inq · ${p.views || 0} views</span></div>
      <div class="prog-bg"><div class="prog-fill" style="width:${((p.views || 0) / maxViews) * 100}%"></div></div>
    </div>`;
  }).join("") || `<div class="empty-row">No packages yet.</div>`;

  const tips = [];
  if (top[0]) tips.push(`<b>${esc(top[0][0])}</b> is your most requested package (${top[0][1]} inquiries).`);
  if (pending.length) tips.push(`${pending.length} inquiry${pending.length > 1 ? "ies are" : " is"} still waiting for a reply.`);
  const best = [...months].sort((a, b) => b.n - a.n)[0];
  if (best?.n) tips.push(`Busiest recent month: <b>${best.label}</b> with ${best.n} inquiries.`);
  const noViews = packages.filter(p => !(p.views > 0)).length;
  if (noViews) tips.push(`${noViews} package${noViews > 1 ? "s have" : " has"} no views yet.`);
  $("realtime-insights-box").innerHTML = tips.map(t => `<p><i class="ti ti-bulb"></i><span>${t}</span></p>`).join("") || "No data yet. Insights will appear once inquiries come in.";
}

/* ---------- Realtime Firestore Listeners ---------- */
const snap = (q, fn) => onSnapshot(q, fn, err => { console.error(err); toast("Firestore: " + err.message, "err"); });

function initFirestoreRealtime() {
  snap(query(collection(db, PKG_COLLECTION), orderBy("createdAt", "desc")), s => { 
    packages = s.docs.map(d => ({ id: d.id, ...d.data() })); 
    renderPkgs(); 
    renderDashboardData(); 
  });
  snap(collectionGroup(db, "reviews"), s => {
    reviewStats = {};
    s.docs.forEach(d => {
      const r = d.data();
      if (!r.packageId || !(Number(r.rating) > 0)) return;
      const cur = reviewStats[r.packageId] || { sum: 0, count: 0 };
      reviewStats[r.packageId] = { sum: cur.sum + Number(r.rating), count: cur.count + 1 };
    });
    renderPkgs();
  });
  snap(query(collection(db, "booking_inquiries"), orderBy("createdAt", "desc")), s => { 
    inquiries = s.docs.map(d => ({ id: d.id, ...d.data() })); 
    renderInquiries(); 
    renderRevenue();
    renderDashboardData(); 
  });
  snap(collection(db, "users"), s => { 
    usersList = s.docs.map(d => ({ id: d.id, ...d.data() })); 
    renderUsers(); 
    renderDashboardData(); 
  });
  snap(collection(db, "chatbot_logs"), s => {
    chats = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (toDate(b.updatedAt || b.createdAt) || 0) - (toDate(a.updatedAt || a.createdAt) || 0));
    renderChats();
    if (activeChat) openChat(activeChat);
  });
}

Object.assign(window, {
  go, toggleSidebar, toggleTheme, logout, openPkgForm, closePkgForm, previewImg, filterPkg, savePackage, addGalleryFiles, galMove, galDel, scanPoster, renderIncPreview, toggleIncPin, removePkg, renderPkgs, toggleFeatured,
  filterInq, renderInquiries, exportInquiries,
  filterRev, renderRevenue, exportRevenue,
  openDetail, closeDetail, sendInquiryReply, confirmInquiry, cancelInquiry, renderUsers, openChat, filterChats, sendChatReply, resolveChat
});