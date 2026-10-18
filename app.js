import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, deleteDoc, updateDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp
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

let packages = [], promos = [], inquiries = [], usersList = [], chats = [];
let pkgFilter = "All", inqFilter = "all", revFilter = "all", activeChat = null, currentInq = null;
const files = { pkg: null, promo: null };

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
    promos: "Promos & Banners", 
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

/* ---------- Tour Packages Management ---------- */
export function openPkgForm(id) {
  const pkg = id ? packages.find(p => p.id === id) : null;
  $("pkg-form-title").textContent = pkg ? "Edit tour package" : "Add a new destination package";
  $("pkg-form").style.borderTopColor = pkg ? "var(--sky)" : "var(--orange)";
  const g = (k, d = "") => pkg?.[k] ?? d;
  
  $("pkg-id").value = pkg?.id || "";
  $("pkg-old-poster").value = pkg ? (pkg.poster || pkg.imageUrl || "") : "";
  $("pkg-code").value = g("code");
  $("pkg-name").value = pkg ? (pkg.name || pkg.title || "") : "";
  $("pkg-dest").value = pkg ? (pkg.dest || pkg.destination || pkg.location || "") : "";
  $("pkg-region").value = g("region", "Luzon");
  $("pkg-dur").value = pkg ? (pkg.dur || pkg.durationLabel || "") : "";
  $("pkg-price").value = g("price", "");
  $("pkg-cat").value = g("category", "Beach & Island");
  $("pkg-route").value = g("route");
  
  let incText = "";
  if (Array.isArray(pkg?.inclusions)) {
    incText = pkg.inclusions.join("\n");
  } else if (pkg?.inclusions && typeof pkg.inclusions === "object") {
    incText = Object.values(pkg.inclusions).flat().join("\n");
  }
  $("pkg-inc").value = incText;
  
  $("pkg-exc").value = Array.isArray(pkg?.exclusions) ? pkg.exclusions.join("\n") : "";
  
  let itinText = pkg?.itineraryText || "";
  if (!itinText && Array.isArray(pkg?.itinerary)) {
    itinText = pkg.itinerary.map(day => `${day.title || 'Day'}: ${(day.stops || []).join(', ')}`).join("\n");
  }
  $("pkg-itin").value = itinText;

  const prev = $("pkg-prev");
  prev.src = pkg ? (pkg.poster || pkg.imageUrl || "") : "";
  prev.style.display = prev.src ? "block" : "none";
  $("pkg-hint").textContent = pkg ? "Choose a new image to replace current poster" : "Click or drag an image here (PNG, JPG)";
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

  const btn = $("btn-save-pkg");
  btn.disabled = true;
  btn.innerHTML = `<i class="ti ti-loader"></i> Saving...`;

  try {
    let poster = val("pkg-old-poster") || "https://images.unsplash.com/photo-1518509562904-e7ef99cdcc86?q=80&w=600&auto=format&fit=crop";
    if (files.pkg) {
      poster = await uploadImage(files.pkg, "posters");
    }

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
      imageUrl: poster,
      gallery: [poster],
      isActive: true,
      status: "active",
      rating: "4.8",
      reviews: 18,
      groupMin: 1,
      groupMax: 10,
      activity: "Easy",
      highlights: stopsList.length > 0 ? stopsList : [name, dur, "Land Arrangement"],
      bestFor: ["Couples", "Barkada", "Solo", "Families"],
      inclusions: incList.length > 0 ? incList : ["Hotel Accommodation", "Daily Breakfast", "Airport Transfers"],
      exclusions: excList.length > 0 ? excList : ["Airfare Tickets", "Personal Expenses"],
      itineraryText: val("pkg-itin")
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

export function renderPkgs() {
  const q = val("pkg-search").toLowerCase();
  const list = packages.filter(p =>
    (pkgFilter === "All" || p.region === pkgFilter) &&
    (!q || [p.name, p.title, p.code, p.dest, p.destination, p.location].some(v => String(v || "").toLowerCase().includes(q)))
  );
  
  const tbody = $("pkg-body");
  if (!list.length) { 
    tbody.innerHTML = emptyRow(9, "No packages found. Click “Add new package” to create one."); 
    return; 
  }

  tbody.innerHTML = list.map(p => `
    <tr>
      <td><img src="${esc(p.poster || p.imageUrl)}" class="poster-thumb" alt="${esc(p.name || p.title)}"></td>
      <td class="td-mono" style="font-weight:700;color:var(--head)">${esc(p.code || "TOUR")}</td>
      <td class="td-bold">${esc(p.name || p.title)}</td>
      <td class="td-muted">${esc(p.dest || p.destination || p.location)}</td>
      <td>${pillRegion(p.region)}</td>
      <td class="td-muted">${esc(p.dur || p.durationLabel)}</td>
      <td class="td-navy">${peso(p.price)}</td>
      <td><span class="pill pill-view"><i class="ti ti-star"></i> ${esc(p.rating || "4.8")} (${p.reviews || 0})</span></td>
      <td>
        <button class="btn-edit" onclick="openPkgForm('${p.id}')">Edit</button>
        <button class="btn-danger" onclick="removePkg('${p.id}')">Delete</button>
      </td>
    </tr>`).join("");
}

/* ---------- Promo Banners Management ---------- */
export function toggleAddPromoForm() {
  const f = $("add-promo-form");
  f.style.display = f.style.display === "block" ? "none" : "block";
}

export async function saveNewPromo() {
  const title = val("new-promo-title");
  if (!title) return toast("Enter a promo title.", "err");
  const btn = $("btn-save-promo");
  btn.disabled = true;

  try {
    let bannerUrl = "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=800&auto=format&fit=crop";
    if (files.promo) {
      bannerUrl = await uploadImage(files.promo, "promos");
    }

    await addDoc(collection(db, "promo_banners"), {
      title,
      code: val("new-promo-code").toUpperCase() || "PROMO",
      discount: val("new-promo-discount") || "SPECIAL OFFER",
      expiry: $("new-promo-expiry").value || "No expiry",
      description: val("new-promo-desc"),
      bannerUrl,
      isActive: true,
      createdAt: serverTimestamp()
    });

    ["new-promo-title", "new-promo-code", "new-promo-discount", "new-promo-expiry", "new-promo-desc"].forEach(i => ($(i).value = ""));
    $("promo-preview-img").style.display = "none";
    files.promo = null;
    toggleAddPromoForm();
    toast("Promo banner posted to the app.");
  } catch (err) { 
    toast("Promo error: " + err.message, "err"); 
  } finally { 
    btn.disabled = false; 
  }
}

export async function togglePromo(id) {
  const p = promos.find(x => x.id === id);
  if (!p) return;
  await updateDoc(doc(db, "promo_banners", id), { isActive: p.isActive === false });
  toast(p.isActive === false ? "Promo is now live." : "Promo hidden from the app.");
}

export async function removePromo(id) {
  if (!confirm("Delete promo banner?")) return;
  await deleteDoc(doc(db, "promo_banners", id));
  toast("Promo deleted.");
}

function renderPromos() {
  const tbody = $("promo-body");
  if (!promos.length) { 
    tbody.innerHTML = emptyRow(7, "No promo banners yet. Add one to show it in the app."); 
    return; 
  }

  const today = new Date().setHours(0, 0, 0, 0);
  tbody.innerHTML = promos.map(p => {
    const expired = p.expiry && p.expiry !== "No expiry" && new Date(p.expiry) < today;
    const live = p.isActive !== false && !expired;
    return `<tr>
      <td><img src="${esc(p.bannerUrl)}" class="promo-banner-thumb" alt="${esc(p.title)}"></td>
      <td class="td-bold">${esc(p.title)}<div class="td-muted" style="font-weight:400;font-size:12px">${esc(p.description)}</div></td>
      <td><span class="pill pill-hash" style="color:var(--orange);font-weight:800">${esc(p.code || "PROMO")}</span></td>
      <td><span class="pill pill-conf">${esc(p.discount || "SPECIAL")}</span></td>
      <td class="td-muted">${esc(p.expiry || "Flexible")}</td>
      <td><span class="pill ${live ? "pill-conf" : "pill-off"}">${expired ? "Expired" : live ? "Live on app" : "Hidden"}</span></td>
      <td>
        <button class="btn-edit" onclick="togglePromo('${p.id}')">${p.isActive === false ? "Show" : "Hide"}</button>
        <button class="btn-danger" onclick="removePromo('${p.id}')">Delete</button>
      </td>
    </tr>`;
  }).join("");
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
function renderChats() {
  const box = $("chat-session-list");
  if (!chats.length) { 
    box.innerHTML = `<div class="empty-row">No chatbot sessions yet.</div>`; 
    return; 
  }

  box.innerHTML = chats.map(c => {
    const msgs = c.messages || [];
    const last = msgs[msgs.length - 1];
    return `<div class="chat-item ${c.id === activeChat ? "on" : ""}" onclick="openChat('${c.id}')">
      <div class="chat-item-top">
        <span class="chat-item-name">${esc(c.userName || c.user || "Traveler")}</span>
        <span class="chat-time">${fmtDate(c.updatedAt || c.createdAt)}</span>
      </div>
      <div class="chat-preview">${esc(last?.text || last?.content || "No messages")}</div>
      <span class="pill ${c.handledBy === "agent" ? "pill-resp" : "pill-hash"}">${c.handledBy === "agent" ? "Agent" : "Bot"} · ${msgs.length} msgs</span>
    </div>`;
  }).join("");
}

export function openChat(id) {
  activeChat = id;
  const c = chats.find(x => x.id === id);
  if (!c) return;
  $("chat-active-name").textContent = c.userName || c.user || "Traveler";
  $("chat-active-sub").textContent = `${(c.messages || []).length} messages · ${fmtDate(c.updatedAt || c.createdAt)}`;
  $("chat-msgs-container").innerHTML = (c.messages || []).map(m =>
    `<div class="${(m.role || m.sender) === "user" ? "bubble-user" : "bubble-bot"}">${esc(m.text || m.content)}</div>`
  ).join("") || `<div class="empty-row">This session has no messages.</div>`;
  renderChats();
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
  snap(query(collection(db, "promo_banners"), orderBy("createdAt", "desc")), s => { 
    promos = s.docs.map(d => ({ id: d.id, ...d.data() })); 
    renderPromos(); 
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
  go, toggleSidebar, toggleTheme, logout, openPkgForm, closePkgForm, previewImg, filterPkg, savePackage, removePkg, renderPkgs,
  toggleAddPromoForm, saveNewPromo, togglePromo, removePromo, filterInq, renderInquiries, exportInquiries,
  filterRev, renderRevenue, exportRevenue,
  openDetail, closeDetail, sendInquiryReply, confirmInquiry, cancelInquiry, renderUsers, openChat
});