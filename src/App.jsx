import React, { useState, useEffect, useRef, useMemo, useContext } from 'react';
import {
  Home, Milk, HeartPulse, Stethoscope, Plus, ArrowLeft, X,
  Calendar, Search, Check, ChevronRight, ChevronLeft, Trash2, Pencil, Droplet, Syringe, Printer, Download, Wheat, Baby, PackageMinus, PackagePlus, Upload, LogOut, Mail, Lock, Users, UserPlus, Eye, KeyRound, UserCircle, Wallet, TrendingUp, TrendingDown,
  Sparkles, Send, Mic, Minus
} from 'lucide-react';
import ReactDOM from 'react-dom';
import { supabase, configMissing } from './supabaseClient.js';

// ---------- Design tokens ----------
// ---------- Access role (owner / master / viewer) ----------
const RoleContext = React.createContext({ role: 'owner', isReadOnly: false });

const C = {
  bg: '#F2F7FC',
  card: '#FFFFFF',
  ink: '#1C1C1C',
  sub: '#6B6B6B',
  line: '#E6E6EA',
  brand: '#4B8FEA',
  brandDark: '#3573D6',
  brandSoft: '#EAF2FF',
  brandRgb: '75,143,234',
  heroGradient: 'linear-gradient(135deg, #5AA2F2 0%, #74BDF4 52%, #9BE3E8 100%)',
  skyTop: '#CFE8FF',
  skyBottom: '#F6FBFF',
  green: '#1E9E50',
  greenDark: '#157A3B',
  greenSoft: '#E3F5EA',
  brown: '#A5652B',
  brownSoft: '#F7EBDC',
  rust: '#D93636',
  rustSoft: '#FDE8E8',
  milk: '#12A5A8',
  milkSoft: '#DFF5F5',
  amber: '#B76E00',
  amberSoft: '#FFF1D6',
  grey: '#8A8A93',
  greySoft: '#F0F0F3',
  shadow: '0 1px 2px rgba(0,0,0,0.04), 0 6px 18px rgba(0,0,0,0.06)',
};

const FONTS = (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600;700&family=Noto+Sans+Kannada:wght@400;600;700&display=swap');
    html, body, #root { height: 100%; margin: 0; overflow: hidden; overscroll-behavior: none; }
    .app-shell { height: 100vh; height: 100dvh; }
    .ff-display { font-family: 'Plus Jakarta Sans', 'Inter', 'Noto Sans Kannada', sans-serif; font-weight: 800 !important; letter-spacing: -0.01em; }
    .ff-body { font-family: 'Inter', 'Noto Sans Kannada', sans-serif; }
    .rec-dot { width: 12px; height: 12px; border-radius: 50%; background: #E5484D; flex-shrink: 0; animation: recPulse 1.1s ease-in-out infinite; }
    .gs-pulse { animation: gsPulse 1.8s ease-in-out infinite; }
    @keyframes gsPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
    @keyframes recPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(1.3); } }
    * { -webkit-tap-highlight-color: transparent; }
    button { font-family: 'Inter', 'Noto Sans Kannada', sans-serif; cursor: pointer; }
    button:active { transform: scale(0.98); }
    ::-webkit-scrollbar { display: none; }
    .print-area { display: none; }
    @media print {
      .app-shell { display: none !important; }
      .print-area { display: block !important; }
      html, body { overflow: visible !important; }
    }
  `}</style>
);

// ---------- Helpers ----------
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
// Dates are handled in the phone's LOCAL calendar. (toISOString() converts to UTC, which in India
// made "today" show yesterday before 5:30 AM and pushed other dates one day early.)
const toLocalISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayStr = () => toLocalISO(new Date());
const addDays = (dateStr, n) => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toLocalISO(d);
};
const addMonths = (dateStr, n) => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return toLocalISO(d);
};
const diffDays = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  const t = new Date(todayStr() + 'T00:00:00');
  return Math.round((d - t) / 86400000);
};
const fmtDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const fmtDateShort = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const BREEDS = ['Holstein', 'Jersey', 'Gir', 'Sahiwal', 'Red Sindhi', 'Crossbred', 'Other'];
const MED_TYPES = ['Vaccination', 'Deworming', 'Illness / Treatment', 'Checkup', 'Injury', 'Other'];

const currentMonthStr = () => todayStr().slice(0, 7);
const monthLabel = (m) => {
  const d = new Date(m + '-01T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};
const shiftMonth = (m, delta) => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
// Builds a COMPACT plain-text snapshot of the farm for the Ask AI feature.
// Groq's free plan allows only ~8K tokens per minute, so this keeps each question small:
// all animals, daily milk for the last 7 days + monthly totals, recent heat/health, stock, and finance by month.
const ASK_AI_MAX_CHARS = 14000;

function buildFarmContext({ cows, milk, heat, medical, financeEntries, feedTransactions, feedTypes, medicineTypes, medicineTransactions, farmName }) {
  const today = todayStr();
  const r1 = (n) => Math.round(Number(n || 0) * 10) / 10;
  const r0 = (n) => Math.round(Number(n || 0));
  const clip = (t, n) => { const x = String(t || '').replace(/\s+/g, ' ').trim(); return x.length > n ? x.slice(0, n - 1) + '…' : x; };

  // Name labels: use the plain name, add the tag only if two animals share a name
  const nameCount = {};
  cows.forEach((c) => { nameCount[c.name] = (nameCount[c.name] || 0) + 1; });
  const byId = Object.fromEntries(cows.map((c) => [c.id, c]));
  const label = (id) => { const c = byId[id]; if (!c) return 'Unknown'; return nameCount[c.name] > 1 ? `${c.name}#${c.tagNumber}` : c.name; };
  const STATUS = { active: 'milking', dry: 'dry', calf: 'calf', heifer: 'heifer', sold: 'sold' };

  const counts = {};
  cows.forEach((c) => { const k = STATUS[c.status] || c.status; counts[k] = (counts[k] || 0) + 1; });
  const countStr = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ');

  const sections = [];
  sections.push(`FARM: ${farmName || 'the farm'}. TODAY: ${today}. ANIMALS: ${cows.length} (${countStr || 'none'}).`);
  sections.push('DATA WINDOWS: all animals; milk per day for last 7 days + monthly totals; heat last 3 per animal; health last 180 days + open follow-ups; finance monthly totals for last 6 months + last 12 entries.');

  // ---- Animals ----
  sections.push('ANIMALS (name #tag | breed | status | details):\n' + cows.slice(0, 80).map((c) => {
    const bits = [`${c.name} #${c.tagNumber}`, c.breed, STATUS[c.status] || c.status];
    if (c.gender) bits.push(c.gender);
    if (c.dob) bits.push(`born ${c.dob}`);
    if (c.motherCowId && byId[c.motherCowId]) bits.push(`mother ${label(c.motherCowId)}`);
    if (c.calvingDate) bits.push(`last calved ${c.calvingDate}`);
    if (c.cycleLength) bits.push(`heat cycle ${c.cycleLength}d`);
    if (c.inseminatedOn) bits.push(`inseminated ${c.inseminatedOn}` + (c.pregnancyConfirmed ? ` PREGNANT, due ${addMonths(c.inseminatedOn, 9)}` : ''));
    if (c.insured) bits.push('insured' + (c.insuranceExpiryDate ? ` until ${c.insuranceExpiryDate}` : ''));
    if (c.mastitisAntibiotic) bits.push(`mastitis antibiotic: ${clip(c.mastitisAntibiotic, 30)}`);
    return bits.join(' | ');
  }).join('\n'));

  // ---- Milk: last 7 days per cow, monthly totals ----
  const since7 = addDays(today, -6);
  const days = {};
  milk.filter((m) => m.date >= since7 && m.date <= today).forEach((m) => {
    const d = (days[m.date] = days[m.date] || { am: 0, pm: 0, cows: {} });
    const l = Number(m.liters || 0);
    if (m.session === 'AM') d.am += l; else d.pm += l;
    d.cows[label(m.cowId)] = (d.cows[label(m.cowId)] || 0) + l;
  });
  const dayLines = Object.keys(days).sort().reverse().map((date) => {
    const d = days[date];
    return `${date}: AM ${r1(d.am)} PM ${r1(d.pm)} total ${r1(d.am + d.pm)} L | ` + Object.entries(d.cows).map(([n, l]) => `${n} ${r1(l)}`).join(', ');
  });
  sections.push('MILK LAST 7 DAYS (litres; per-cow = AM+PM):\n' + (dayLines.length ? dayLines.join('\n') : 'no milk records in the last 7 days'));

  const months = {};
  milk.forEach((m) => {
    const mo = m.date.slice(0, 7);
    const x = (months[mo] = months[mo] || { total: 0, cows: {} });
    const l = Number(m.liters || 0);
    x.total += l;
    x.cows[label(m.cowId)] = (x.cows[label(m.cowId)] || 0) + l;
  });
  const moKeys = Object.keys(months).sort().reverse().slice(0, 6);
  sections.push('MILK MONTHLY TOTALS (litres):\n' + (moKeys.length ? moKeys.map((mo, i) => (
    `${mo}: total ${r1(months[mo].total)}` + (i < 3 ? ' | ' + Object.entries(months[mo].cows).map(([n, l]) => `${n} ${r1(l)}`).join(', ') : '')
  )).join('\n') : 'none'));

  // ---- Heat: last 3 per cow ----
  const heatByCow = {};
  [...heat].sort((a, b) => b.date.localeCompare(a.date)).forEach((h) => {
    (heatByCow[h.cowId] = heatByCow[h.cowId] || []).push(h);
  });
  const heatLines = Object.entries(heatByCow).slice(0, 60).map(([id, list]) => (
    `${label(id)}: ` + list.slice(0, 3).map((h) => `${h.date}${h.bred ? ' (bred)' : ''}${h.notes ? ' ' + clip(h.notes, 30) : ''}`).join('; ')
  ));
  sections.push('HEAT RECORDS (newest first):\n' + (heatLines.length ? heatLines.join('\n') : 'none'));

  // ---- Health: last 180 days + any open follow-up ----
  const since180 = addDays(today, -180);
  const healthRows = medical
    .filter((m) => m.date >= since180 || (m.nextDueDate && !m.completed))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 70);
  sections.push('HEALTH RECORDS:\n' + (healthRows.length ? healthRows.map((m) => (
    `${m.date} ${label(m.cowId)}: ${m.type}` + (m.medicine ? ` (${clip(m.medicine, 25)})` : '') + (m.description ? ` - ${clip(m.description, 50)}` : '') +
    (m.vet ? `; vet ${clip(m.vet, 20)}` : '') + (m.nextDueDate ? `; follow-up ${m.nextDueDate} ${m.completed ? '[done]' : '[open]'}` : '')
  )).join('\n') : 'none'));

  // ---- Stock ----
  const feedName = (id) => (feedTypes.find((f) => f.id === id) || {}).name || 'feed';
  sections.push('FEED STOCK (bags, cost per bag): ' + (feedTypes.length ? feedTypes.map((f) => `${f.name} ${r1(feedStock(f.id, feedTransactions))} bags @₹${r0(f.costPerBag)}`).join('; ') : 'none'));
  const sinceTxn = addDays(today, -45);
  const feedTx = feedTransactions.filter((t) => t.date >= sinceTxn).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  if (feedTx.length) sections.push('RECENT FEED MOVEMENTS (45d):\n' + feedTx.map((t) => `${t.date} ${t.kind} ${feedName(t.feedTypeId)} ${t.bags} bags`).join('\n'));
  sections.push('MEDICINE STOCK: ' + (medicineTypes.length ? medicineTypes.map((m) => `${m.name} ${r1(medicineStock(m.id, medicineTransactions))} ${m.unit}`).join('; ') : 'none'));

  // ---- Finance (mirrors the Finance screen: feed cost = bags USED x cost per bag) ----
  const fin = {};
  const add = (date, type, cat, amt) => {
    const mo = String(date || '').slice(0, 7);
    if (!mo) return;
    const x = (fin[mo] = fin[mo] || { income: 0, expense: 0, cats: {} });
    const a = Number(amt || 0);
    if (type === 'income') x.income += a; else x.expense += a;
    const key = `${type === 'income' ? 'income' : 'expense'}:${cat || 'Other'}`;
    x.cats[key] = (x.cats[key] || 0) + a;
  };
  financeEntries.forEach((e) => add(e.date, e.type, e.category, e.amount));
  feedTransactions.filter((t) => t.kind === 'usage').forEach((t) => {
    const ft = feedTypes.find((f) => f.id === t.feedTypeId);
    add(t.date, 'expense', 'Feed', ft ? Number(t.bags) * Number(ft.costPerBag || 0) : 0);
  });
  const finKeys = Object.keys(fin).sort().reverse().slice(0, 6);
  sections.push('FINANCE BY MONTH (₹; expenses include feed used):\n' + (finKeys.length ? finKeys.map((mo) => {
    const x = fin[mo];
    const cats = Object.entries(x.cats).map(([k, v]) => `${k.replace(':', ' ')} ${r0(v)}`).join(', ');
    return `${mo}: income ${r0(x.income)}, expense ${r0(x.expense)}, net ${r0(x.income - x.expense)} | ${cats}`;
  }).join('\n') : 'none'));
  const recentFin = [...financeEntries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  if (recentFin.length) sections.push('LAST FINANCE ENTRIES:\n' + recentFin.map((e) => `${e.date} ${e.type} ${e.category || ''} ₹${r0(e.amount)}${e.notes ? ' - ' + clip(e.notes, 40) : ''}`).join('\n'));

  let text = sections.join('\n\n');
  if (text.length > ASK_AI_MAX_CHARS) text = text.slice(0, ASK_AI_MAX_CHARS) + '\n[data truncated to fit the free plan — older details omitted]';
  return text;
}

function MonthSwitcher({ month, onChange }) {
  const isCurrent = month === currentMonthStr();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <button onClick={() => onChange(shiftMonth(month, -1))} aria-label="Previous month" className="ff-body" style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: `1.5px solid ${C.line}`, borderRadius: 10, color: C.ink, flexShrink: 0 }}>
        <ChevronLeft size={16} />
      </button>
      <label style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#fff', border: `1.5px solid ${C.line}`, borderRadius: 10, padding: '8px 10px', cursor: 'pointer' }}>
        <Calendar size={14} color={C.sub} />
        <span className="ff-display" style={{ fontWeight: 700, fontSize: 14.5, color: C.ink }}>{monthLabel(month)}</span>
        <input
          type="month"
          value={month}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
        />
      </label>
      <button onClick={() => onChange(shiftMonth(month, 1))} aria-label="Next month" className="ff-body" style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: `1.5px solid ${C.line}`, borderRadius: 10, color: C.ink, flexShrink: 0 }}>
        <ChevronRight size={16} />
      </button>
      {!isCurrent && (
        <button onClick={() => onChange(currentMonthStr())} className="ff-body" style={{ flexShrink: 0, background: C.brandSoft, color: C.brand, border: 'none', borderRadius: 10, padding: '8px 10px', fontSize: 13, fontWeight: 700 }}>
          Today
        </button>
      )}
    </div>
  );
}
function feedStock(feedTypeId, txns) {
  return txns.filter((t) => t.feedTypeId === feedTypeId).reduce((s, t) => s + (t.kind === 'purchase' ? Number(t.bags) : -Number(t.bags)), 0);
}
function feedMonthPurchased(feedTypeId, txns, month) {
  return txns.filter((t) => t.feedTypeId === feedTypeId && t.kind === 'purchase' && t.date.slice(0, 7) === month).reduce((s, t) => s + Number(t.bags), 0);
}
function feedMonthSpend(feedTypeId, txns, month) {
  return txns.filter((t) => t.feedTypeId === feedTypeId && t.kind === 'purchase' && t.date.slice(0, 7) === month).reduce((s, t) => s + Number(t.cost || 0), 0);
}
function feedTotalPurchased(feedTypeId, txns) {
  return txns.filter((t) => t.feedTypeId === feedTypeId && t.kind === 'purchase').reduce((s, t) => s + Number(t.bags), 0);
}
function feedTotalUsed(feedTypeId, txns) {
  return txns.filter((t) => t.feedTypeId === feedTypeId && t.kind === 'usage').reduce((s, t) => s + Number(t.bags), 0);
}
function feedTotalDebited(feedTypeId, txns) {
  return txns.filter((t) => t.feedTypeId === feedTypeId && t.kind === 'purchase').reduce((s, t) => s + Number(t.cost || 0), 0);
}
function feedStockValue(feedType, txns) {
  return feedStock(feedType.id, txns) * Number(feedType.costPerBag || 0);
}

function medicineStock(medicineTypeId, txns) {
  return txns.filter((t) => t.medicineTypeId === medicineTypeId).reduce((s, t) => s + (t.kind === 'purchase' ? Number(t.quantity) : -Number(t.quantity)), 0);
}
function medicineTotalPurchased(medicineTypeId, txns) {
  return txns.filter((t) => t.medicineTypeId === medicineTypeId && t.kind === 'purchase').reduce((s, t) => s + Number(t.quantity), 0);
}
function medicineTotalUsed(medicineTypeId, txns) {
  return txns.filter((t) => t.medicineTypeId === medicineTypeId && t.kind === 'usage').reduce((s, t) => s + Number(t.quantity), 0);
}
function medicineMonthPurchased(medicineTypeId, txns, month) {
  return txns.filter((t) => t.medicineTypeId === medicineTypeId && t.kind === 'purchase' && t.date.slice(0, 7) === month).reduce((s, t) => s + Number(t.quantity), 0);
}

// ---------- Insurance helper (cow-level: insured?, start/expiry, 1-month alert) ----------
function insuranceStatusFor(cow) {
  if (!cow.insured || !cow.insuranceExpiryDate) return { status: 'none' };
  const daysUntil = diffDays(cow.insuranceExpiryDate);
  let status = 'active';
  if (daysUntil < 0) status = 'expired';
  else if (daysUntil <= 30) status = 'expiring';
  return { status, daysUntil };
}

// ---------- Export helpers (print + CSV download) ----------
function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function toCSV(headers, rows) {
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach((r) => lines.push(r.map(csvEscape).join(',')));
  return lines.join('\n');
}
function downloadFile(filename, content, mime = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Ear tag badge (signature element) ----------
function CowIcon({ size = 20, color = 'currentColor', strokeWidth = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5.5 8.5c-1.4 0-2.5-1-2.5-2.3 0-1 .8-1.7 1.8-1.5.9.2 1.5 1 1.7 1.8" />
      <path d="M18.5 8.5c1.4 0 2.5-1 2.5-2.3 0-1-.8-1.7-1.8-1.5-.9.2-1.5 1-1.7 1.8" />
      <path d="M6.5 9.2C6.5 6.8 8.9 5 12 5s5.5 1.8 5.5 4.2c0 1.1-.5 2-1.3 2.7.8.9 1.3 2 1.3 3.3 0 3.2-3.4 5.3-7.5 5.3s-7.5-2.1-7.5-5.3c0-1.3.5-2.4 1.3-3.3-.8-.7-1.3-1.6-1.3-2.7Z" />
      <path d="M9 13.2c.5.5.5 1.3 0 1.8" />
      <path d="M15 13.2c-.5.5-.5 1.3 0 1.8" />
      <circle cx="9.3" cy="10.3" r=".6" fill={color} stroke="none" />
      <circle cx="14.7" cy="10.3" r=".6" fill={color} stroke="none" />
    </svg>
  );
}

function EarTag({ number, tone = 'green', size = 'md' }) {
  const status = { green: 'active', brown: 'dry', amber: 'calf', blue: 'heifer', grey: 'sold' }[tone] || 'active';
  const dim = size === 'lg' ? 76 : size === 'sm' ? 54 : 62;
  const numStr = number == null ? '' : String(number);
  const displayNum = numStr.length > 3 ? numStr.slice(-3) : numStr;
  return (
    <div style={{ position: 'relative', width: dim, height: dim, flexShrink: 0 }} title={numStr.length > 3 ? `Tag #${numStr}` : undefined}>
      <CowAvatar size={dim} status={status} radius={Math.round(dim * 0.28)} />
      <div className="ff-display" style={{ position: 'absolute', right: -6, bottom: -6, background: C.ink, color: '#fff', fontSize: size === 'sm' ? 10 : 11.5, lineHeight: 1, padding: '2px 5px', borderRadius: 6, border: '2px solid #fff' }}>
        {displayNum}
      </div>
    </div>
  );
}

const earTagTone = (status) => (status === 'active' ? 'green' : status === 'dry' ? 'brown' : status === 'calf' ? 'amber' : status === 'heifer' ? 'blue' : 'grey');

function StatusPill({ status }) {
  const map = {
    active: { bg: C.greenSoft, fg: C.green, label: 'Milking' },
    dry: { bg: C.brownSoft, fg: C.brown, label: 'Dry' },
    sold: { bg: C.greySoft, fg: C.grey, label: 'Sold' },
    calf: { bg: C.amberSoft, fg: C.amber, label: 'Calf' },
    heifer: { bg: C.milkSoft, fg: C.milk, label: 'Heifer' },
  };
  const s = map[status] || map.active;
  return (
    <span
      className="ff-body"
      style={{ background: s.bg, color: s.fg, fontSize: 12.5, fontWeight: 700, padding: '4px 10px', borderRadius: 8 }}
    >
      {s.label}
    </span>
  );
}

function Chip({ children, bg, fg }) {
  return (
    <span className="ff-body" style={{ background: bg, color: fg, fontSize: 12.5, fontWeight: 700, padding: '4px 10px', borderRadius: 8, display: 'inline-block', lineHeight: 1.35, maxWidth: '100%' }}>
      {children}
    </span>
  );
}

function PrintTable({ headers, rows }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 10 }}>
      <thead>
        <tr>{headers.map((h, i) => <th key={i} style={{ textAlign: 'left', borderBottom: '1.5px solid #333', padding: '6px 8px' }}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={headers.length} style={{ padding: '10px 8px', color: '#777' }}>No records.</td></tr>
        ) : (
          rows.map((r, ri) => (
            <tr key={ri}>{r.map((c, ci) => <td key={ci} style={{ borderBottom: '1px solid #ddd', padding: '6px 8px' }}>{c}</td>)}</tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function CowPrintBody({ job }) {
  const { cow, milkRows, heatRows, medRows } = job;
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{cow.name} — Tag #{cow.tagNumber}</div>
        <div style={{ fontSize: 13, color: '#444', marginTop: 4, lineHeight: 1.6 }}>
          Breed: {cow.breed} &nbsp;·&nbsp; DOB: {fmtDate(cow.dob)} &nbsp;·&nbsp; Status: {cow.status}<br />
          {cow.calvingDate && <>Last calving: {fmtDate(cow.calvingDate)} &nbsp;·&nbsp; </>}
          {cow.firstHeatDate && <>First heat: {fmtDate(cow.firstHeatDate)} &nbsp;·&nbsp; </>}
          {cow.inseminatedOn && <>Inseminated on: {fmtDate(cow.inseminatedOn)}</>}
          {cow.mastitisAntibiotic && <><br />Mastitis antibiotic: {cow.mastitisAntibiotic}</>}
          {cow.pregnancyConfirmed && cow.inseminatedOn && <><br />Pregnant — expected calving {fmtDate(addMonths(cow.inseminatedOn, 9))}</>}
          {cow.insured && <><br />Insured{cow.insuranceExpiryDate ? ` — expires ${fmtDate(cow.insuranceExpiryDate)}` : ''}</>}
        </div>
      </div>
      {milkRows.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 14, margin: '14px 0 6px' }}>Milk Records</div>
          <PrintTable headers={['Date', 'Session', 'Liters']} rows={milkRows} />
        </>
      )}
      {heatRows.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 14, margin: '14px 0 6px' }}>Heat Cycle Records</div>
          <PrintTable headers={['Date', 'Bred', 'Notes']} rows={heatRows} />
        </>
      )}
      {medRows.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 14, margin: '14px 0 6px' }}>Health Records</div>
          <PrintTable headers={['Date', 'Type', 'Medicine', 'Details', 'Vet', 'Next Due']} rows={medRows} />
        </>
      )}
      {milkRows.length === 0 && heatRows.length === 0 && medRows.length === 0 && (
        <div style={{ fontSize: 13, color: '#777', marginTop: 10 }}>No records logged for this cow yet.</div>
      )}
    </div>
  );
}

function PrintDocument({ job }) {
  if (!job) return null;
  return (
    <div style={{ padding: 28, fontFamily: 'Inter, sans-serif', color: '#111' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '2px solid #222', paddingBottom: 8, marginBottom: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{job.title}</div>
        <div style={{ fontSize: 12.5, color: '#555' }}>Generated {fmtDate(todayStr())}</div>
      </div>
      {job.type === 'cow' ? (
        <CowPrintBody job={job} />
      ) : job.type === 'feed' ? (
        <>
          <div style={{ fontWeight: 700, fontSize: 14, margin: '0 0 6px' }}>Summary</div>
          <PrintTable headers={job.summaryHeaders} rows={job.summaryRows} />
          <div style={{ fontWeight: 700, fontSize: 14, margin: '14px 0 6px' }}>Transactions</div>
          <PrintTable headers={job.txnHeaders} rows={job.txnRows} />
        </>
      ) : (
        <PrintTable headers={job.headers} rows={job.rows} />
      )}
    </div>
  );
}

// ---------- Export row builders ----------
function cowsExportRows(cows) {
  const nameById = Object.fromEntries(cows.map((c) => [c.id, c.name]));
  return cows.map((c) => [
    c.tagNumber, c.name, c.breed, c.gender || '', fmtDate(c.dob), c.status,
    c.motherCowId ? (nameById[c.motherCowId] || '') : '', c.birthWeight || '',
    c.calvingDate ? fmtDate(c.calvingDate) : '', c.firstHeatDate ? fmtDate(c.firstHeatDate) : '',
    c.inseminatedOn ? fmtDate(c.inseminatedOn) : '', c.mastitisAntibiotic || '',
    c.insured ? 'Yes' : 'No', c.insuranceStartDate ? fmtDate(c.insuranceStartDate) : '', c.insuranceExpiryDate ? fmtDate(c.insuranceExpiryDate) : '',
  ]);
}
const COWS_HEADERS = ['Tag #', 'Name', 'Breed', 'Gender', 'Date of Birth', 'Status', 'Mother', 'Birth Weight (kg)', 'Last Calving', 'First Heat After Calving', 'Inseminated On', 'Mastitis Antibiotic', 'Insured', 'Insurance Start', 'Insurance Expiry'];

function milkExportRows(milk, cowById) {
  return milk.slice().sort((a, b) => a.date.localeCompare(b.date)).map((m) => {
    const cow = cowById(m.cowId);
    return [fmtDate(m.date), cow ? cow.tagNumber : '', cow ? cow.name : 'Unknown', m.session, m.liters];
  });
}
const MILK_HEADERS = ['Date', 'Tag #', 'Cow', 'Session', 'Liters'];

function medExportRows(medical, cowById) {
  return medical.slice().sort((a, b) => a.date.localeCompare(b.date)).map((m) => {
    const cow = cowById(m.cowId);
    return [fmtDate(m.date), cow ? cow.tagNumber : '', cow ? cow.name : 'Unknown', m.type, m.medicine || '', m.description || '', m.vet || '', m.nextDueDate ? fmtDate(m.nextDueDate) : ''];
  });
}
const MED_HEADERS = ['Date', 'Tag #', 'Cow', 'Type', 'Medicine', 'Details', 'Vet', 'Next Follow-up'];

// ---------- Supabase row <-> app object mapping ----------
const mapCowFromRow = (r) => ({
  id: r.id, name: r.name, tagNumber: r.tag_number, breed: r.breed, dob: r.dob, status: r.status,
  cycleLength: r.cycle_length, calvingDate: r.calving_date || '', firstHeatDate: r.first_heat_date || '',
  inseminatedOn: r.inseminated_on || '', pregnancyConfirmed: !!r.pregnancy_confirmed, mastitisAntibiotic: r.mastitis_antibiotic || '',
  motherCowId: r.mother_cow_id || '', birthWeight: r.birth_weight ?? '', gender: r.gender || '',
  insured: !!r.insured, insuranceStartDate: r.insurance_start_date || '', insuranceExpiryDate: r.insurance_expiry_date || '',
});
const cowToRow = (c, userId) => ({
  user_id: userId, name: c.name, tag_number: c.tagNumber, breed: c.breed, dob: c.dob || null, status: c.status,
  cycle_length: c.cycleLength, calving_date: c.calvingDate || null, first_heat_date: c.firstHeatDate || null,
  inseminated_on: c.inseminatedOn || null, pregnancy_confirmed: !!c.pregnancyConfirmed, mastitis_antibiotic: c.mastitisAntibiotic || null,
  mother_cow_id: c.motherCowId || null, birth_weight: c.birthWeight === '' || c.birthWeight == null ? null : c.birthWeight, gender: c.gender || null,
  insured: !!c.insured, insurance_start_date: c.insuranceStartDate || null, insurance_expiry_date: c.insuranceExpiryDate || null,
});
const mapMilkFromRow = (r) => ({ id: r.id, cowId: r.cow_id, date: r.date, session: r.session, liters: r.liters });
const milkToRow = (m, userId) => ({ user_id: userId, cow_id: m.cowId, date: m.date, session: m.session, liters: m.liters });
const mapHeatFromRow = (r) => ({ id: r.id, cowId: r.cow_id, date: r.date, bred: r.bred, notes: r.notes || '' });
const heatToRow = (h, userId) => ({ user_id: userId, cow_id: h.cowId, date: h.date, bred: !!h.bred, notes: h.notes || null });
const mapMedFromRow = (r) => ({ id: r.id, cowId: r.cow_id, date: r.date, type: r.type, medicine: r.medicine || '', description: r.description || '', vet: r.vet || '', nextDueDate: r.next_due_date || '', completed: !!r.completed });
const medToRow = (m, userId) => ({ user_id: userId, cow_id: m.cowId, date: m.date, type: m.type, medicine: m.medicine || null, description: m.description || null, vet: m.vet || null, next_due_date: m.nextDueDate || null, completed: !!m.completed });
const mapFeedTypeFromRow = (r) => ({ id: r.id, name: r.name, costPerBag: r.cost_per_bag });
const feedTypeToRow = (f, userId) => ({ user_id: userId, name: f.name, cost_per_bag: f.costPerBag });
const mapFinanceFromRow = (r) => ({ id: r.id, date: r.date, type: r.type, category: r.category, amount: r.amount, notes: r.notes || '' });
const financeToRow = (f, userId) => ({ user_id: userId, date: f.date, type: f.type, category: f.category, amount: f.amount, notes: f.notes || null });
const mapMedicineTypeFromRow = (r) => ({ id: r.id, name: r.name, unit: r.unit || 'units', costPerUnit: r.cost_per_unit ?? '', lowStockThreshold: r.low_stock_threshold ?? 5 });
const medicineTypeToRow = (m, userId) => ({ user_id: userId, name: m.name, unit: m.unit || 'units', cost_per_unit: m.costPerUnit === '' ? null : m.costPerUnit, low_stock_threshold: m.lowStockThreshold === '' ? null : m.lowStockThreshold });
const mapMedicineTxnFromRow = (r) => ({ id: r.id, medicineTypeId: r.medicine_type_id, date: r.date, kind: r.kind, quantity: r.quantity, cost: r.cost, notes: r.notes || '' });
const medicineTxnToRow = (t, userId) => ({ user_id: userId, medicine_type_id: t.medicineTypeId, date: t.date, kind: t.kind, quantity: t.quantity, cost: t.cost ?? null, notes: t.notes || null });
const mapFeedTxnFromRow = (r) => ({ id: r.id, feedTypeId: r.feed_type_id, date: r.date, kind: r.kind, bags: r.bags, cost: r.cost, notes: r.notes || '' });
const feedTxnToRow = (t, userId) => ({ user_id: userId, feed_type_id: t.feedTypeId, date: t.date, kind: t.kind, bags: t.bags, cost: t.cost ?? null, notes: t.notes || null });

async function fetchTable(table, mapper, orderCol) {
  let query = supabase.from(table).select('*');
  if (orderCol) query = query.order(orderCol, { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  return data.map(mapper);
}

// ---------- Generic UI atoms ----------
function HeaderIconButton({ icon, onClick, title }) {
  return (
    <button onClick={onClick} title={title} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 12, padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 38, minHeight: 38, flexShrink: 0 }}>
      {icon}
    </button>
  );
}

function ScreenHeader({ title, subtitle, onBack, right, children, leading, titleSize = 24 }) {
  return (
    <div style={{ background: `linear-gradient(135deg, ${C.brand} 0%, ${C.brandDark} 100%)`, color: '#fff', padding: '18px 18px 20px', paddingTop: 'max(18px, calc(env(safe-area-inset-top) + 12px))', borderRadius: '0 0 28px 28px', boxShadow: `0 10px 24px rgba(${C.brandRgb},0.22)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {onBack && (
          <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 12, padding: 8, display: 'flex', minWidth: 38, minHeight: 38, alignItems: 'center', justifyContent: 'center' }}>
            <ArrowLeft size={20} color="#fff" />
          </button>
        )}
        {leading}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ff-display" style={{ fontSize: titleSize, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          {subtitle && <div className="ff-body" style={{ fontSize: 14, opacity: 0.9, marginTop: 3, fontWeight: 500 }}>{subtitle}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function FAB({ onClick, label }) {
  const { isReadOnly } = useContext(RoleContext);
  if (isReadOnly) return null;
  return (
    <button
      onClick={onClick}
      className="ff-body"
      style={{
        position: 'absolute', right: 16, bottom: 90, background: C.brand, color: '#fff',
        border: 'none', borderRadius: 16, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 8,
        fontWeight: 700, fontSize: 16, boxShadow: `0 10px 22px rgba(${C.brandRgb},0.4)`, zIndex: 20,
      }}
    >
      <Plus size={19} strokeWidth={2.6} /> {label}
    </button>
  );
}

function EmptyState({ icon, title, subtitle, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 24px', color: C.sub }}>
      <div style={{ width: 84, height: 84, borderRadius: 42, background: C.brandSoft, color: C.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>{icon}</div>
      <div className="ff-display" style={{ color: C.ink, fontSize: 19, marginBottom: 6 }}>{title}</div>
      <div className="ff-body" style={{ fontSize: 15, lineHeight: 1.5 }}>{subtitle}</div>
      {action}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="ff-body" style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 7 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%', border: `1.5px solid ${C.line}`, borderRadius: 12, padding: '12px 14px',
  fontSize: 16, fontFamily: "Inter, 'Noto Sans Kannada', sans-serif", color: C.ink, background: '#fff', outline: 'none', boxSizing: 'border-box',
};

function Modal({ title, onClose, children }) {
  return ReactDOM.createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', width: '100%', maxWidth: 420, maxHeight: '90%', overflowY: 'auto', borderRadius: '26px 26px 0 0', padding: '10px 20px 20px', paddingBottom: 'max(20px, calc(env(safe-area-inset-bottom) + 14px))' }}
      >
        <div style={{ width: 44, height: 5, borderRadius: 3, background: '#D9D9DE', margin: '0 auto 14px' }} />
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <div className="ff-display" style={{ fontSize: 21, color: C.ink, flex: 1 }}>{title}</div>
          <button onClick={onClose} style={{ background: C.greySoft, border: 'none', borderRadius: 18, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={18} color={C.ink} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

function PrimaryButton({ children, onClick, disabled, danger }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="ff-body"
      style={{
        width: '100%', background: danger ? '#B42318' : C.brand, color: '#fff', border: 'none', borderRadius: 14,
        padding: '15px 0', fontWeight: 700, fontSize: 17, opacity: disabled ? 0.45 : 1, marginTop: 6,
        boxShadow: disabled ? 'none' : (danger ? '0 8px 16px rgba(180,35,24,0.28)' : `0 8px 16px rgba(${C.brandRgb},0.3)`),
      }}
    >
      {children}
    </button>
  );
}

// ---------- Segmented select ----------
function Segmented({ options, value, onChange, labels }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className="ff-body"
          style={{
            border: `1.5px solid ${value === opt ? C.brand : C.line}`,
            background: value === opt ? C.brandSoft : '#fff',
            color: value === opt ? C.brand : C.ink,
            borderRadius: 12, padding: '8px 15px', fontSize: 14.5, fontWeight: 600,
          }}
        >
          {labels?.[opt] ?? opt}
        </button>
      ))}
    </div>
  );
}

// ---------- Gou Siri brand ----------
// The name means "wealth of the cow herd". Logo: a serene cow with a golden drop (milk drop / festival tilak / prosperity).
const GS_GOU = 'M528.0 -480.0Q509.0 -515.0 473.5 -533.5Q438.0 -552.0 390.0 -552.0Q307.0 -552.0 257.0 -497.5Q207.0 -443.0 207.0 -352.0Q207.0 -255.0 259.5 -200.5Q312.0 -146.0 404.0 -146.0Q467.0 -146.0 510.5 -178.0Q554.0 -210.0 574.0 -270.0H357.0V-396.0H729.0V-237.0Q710.0 -173.0 664.5 -118.0Q619.0 -63.0 549.0 -29.0Q479.0 5.0 391.0 5.0Q287.0 5.0 205.5 -40.5Q124.0 -86.0 78.5 -167.0Q33.0 -248.0 33.0 -352.0Q33.0 -456.0 78.5 -537.5Q124.0 -619.0 205.0 -664.5Q286.0 -710.0 390.0 -710.0Q516.0 -710.0 602.5 -649.0Q689.0 -588.0 717.0 -480.0Z M790.0 -279.0Q790.0 -365.0 828.0 -430.5Q866.0 -496.0 932.0 -531.0Q998.0 -566.0 1080.0 -566.0Q1162.0 -566.0 1228.0 -531.0Q1294.0 -496.0 1332.0 -430.5Q1370.0 -365.0 1370.0 -279.0Q1370.0 -193.0 1331.5 -127.5Q1293.0 -62.0 1226.5 -27.0Q1160.0 8.0 1078.0 8.0Q996.0 8.0 930.5 -27.0Q865.0 -62.0 827.5 -127.0Q790.0 -192.0 790.0 -279.0ZM1196.0 -279.0Q1196.0 -346.0 1162.5 -382.0Q1129.0 -418.0 1080.0 -418.0Q1030.0 -418.0 997.0 -382.5Q964.0 -347.0 964.0 -279.0Q964.0 -212.0 996.5 -176.0Q1029.0 -140.0 1078.0 -140.0Q1127.0 -140.0 1161.5 -176.0Q1196.0 -212.0 1196.0 -279.0Z M2012.0 -558.0V0.0H1841.0V-76.0Q1815.0 -39.0 1770.5 -16.5Q1726.0 6.0 1672.0 6.0Q1608.0 6.0 1559.0 -22.5Q1510.0 -51.0 1483.0 -105.0Q1456.0 -159.0 1456.0 -232.0V-558.0H1626.0V-255.0Q1626.0 -199.0 1655.0 -168.0Q1684.0 -137.0 1733.0 -137.0Q1783.0 -137.0 1812.0 -168.0Q1841.0 -199.0 1841.0 -255.0V-558.0Z';
const GS_SIRI = 'M42.0 -210.0H224.0Q228.0 -171.0 251.0 -150.5Q274.0 -130.0 311.0 -130.0Q349.0 -130.0 371.0 -147.5Q393.0 -165.0 393.0 -196.0Q393.0 -222.0 375.5 -239.0Q358.0 -256.0 332.5 -267.0Q307.0 -278.0 260.0 -292.0Q192.0 -313.0 149.0 -334.0Q106.0 -355.0 75.0 -396.0Q44.0 -437.0 44.0 -503.0Q44.0 -601.0 115.0 -656.5Q186.0 -712.0 300.0 -712.0Q416.0 -712.0 487.0 -656.5Q558.0 -601.0 563.0 -502.0H378.0Q376.0 -536.0 353.0 -555.5Q330.0 -575.0 294.0 -575.0Q263.0 -575.0 244.0 -558.5Q225.0 -542.0 225.0 -511.0Q225.0 -477.0 257.0 -458.0Q289.0 -439.0 357.0 -417.0Q425.0 -394.0 467.5 -373.0Q510.0 -352.0 541.0 -312.0Q572.0 -272.0 572.0 -209.0Q572.0 -149.0 541.5 -100.0Q511.0 -51.0 453.0 -22.0Q395.0 7.0 316.0 7.0Q239.0 7.0 178.0 -18.0Q117.0 -43.0 80.5 -92.0Q44.0 -141.0 42.0 -210.0Z M861.0 -558.0V0.0H690.0V-558.0Z M1344.0 -564.0V-383.0H1297.0Q1233.0 -383.0 1201.0 -355.5Q1169.0 -328.0 1169.0 -259.0V0.0H998.0V-558.0H1169.0V-465.0Q1199.0 -511.0 1244.0 -537.5Q1289.0 -564.0 1344.0 -564.0Z M1610.0 -558.0V0.0H1439.0V-558.0Z';
const GS_SIRI_X = 2285.0;
const GS_DROPS = ["M775.5 -810 C775.5 -810 703.5 -728 703.5 -698 C703.5 -658 735.5 -628 775.5 -628 C815.5 -628 847.5 -658 847.5 -698 C847.5 -728 775.5 -810 775.5 -810Z", "M1524.5 -810 C1524.5 -810 1452.5 -728 1452.5 -698 C1452.5 -658 1484.5 -628 1524.5 -628 C1564.5 -628 1596.5 -658 1596.5 -698 C1596.5 -728 1524.5 -810 1524.5 -810Z"];
const GS_WM_VIEWBOX = '-40 -940 4050 1000';
const GS_WM_RATIO = 4.0500;

function GouSiriMark({ size = 64, radius, simple = false, flat = false }) {
  const uid = (React.useId ? React.useId() : 'gs').replace(/:/g, '');
  const rx = flat ? 0 : ((radius != null ? radius : size * 0.22) / size) * 512;
  const star = (cx, cy, r) => {
    const k = r * 0.28;
    return <path key={`${cx}-${cy}`} d={`M${cx} ${cy - r} C${cx + k} ${cy - k} ${cx + k} ${cy - k} ${cx + r} ${cy} C${cx + k} ${cy + k} ${cx + k} ${cy + k} ${cx} ${cy + r} C${cx - k} ${cy + k} ${cx - k} ${cy + k} ${cx - r} ${cy} C${cx - k} ${cy - k} ${cx - k} ${cy - k} ${cx} ${cy - r}Z`} fill={`url(#${uid}gd)`} />;
  };
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <defs>
        <linearGradient id={`${uid}bg`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#74B6FB" /><stop offset="1" stopColor="#2F6FD6" /></linearGradient>
        <linearGradient id={`${uid}gd`} x1="0.15" y1="0" x2="0.85" y2="1"><stop offset="0" stopColor="#FFE892" /><stop offset="1" stopColor="#F0A21B" /></linearGradient>
      </defs>
      <rect width="512" height="512" rx={rx} fill={`url(#${uid}bg)`} />
      <circle cx="256" cy="262" r="205" fill="#fff" opacity="0.1" />
      {!simple && [star(104, 118, 24), star(414, 142, 17), star(398, 398, 12)]}
      <ellipse cx="110" cy="190" rx="54" ry="27" transform="rotate(-22 110 190)" fill="#fff" />
      <ellipse cx="115" cy="192" rx="31" ry="15" transform="rotate(-22 115 192)" fill="#F7B8B1" />
      <ellipse cx="402" cy="190" rx="54" ry="27" transform="rotate(22 402 190)" fill="#fff" />
      <ellipse cx="397" cy="192" rx="31" ry="15" transform="rotate(22 397 192)" fill="#F7B8B1" />
      <path d="M190 134 C172 98 138 88 112 100 C136 108 154 128 164 160Z" fill="#FFD98A" />
      <path d="M322 134 C340 98 374 88 400 100 C376 108 358 128 348 160Z" fill="#FFD98A" />
      <path d="M256 108 C348 108 398 150 398 232 C398 312 352 396 256 396 C160 396 114 312 114 232 C114 150 164 108 256 108Z" fill="#fff" />
      <ellipse cx="256" cy="330" rx="84" ry="58" fill="#FBD3CE" />
      <ellipse cx="231" cy="332" rx="9" ry="13" fill="#E58F8A" /><ellipse cx="281" cy="332" rx="9" ry="13" fill="#E58F8A" />
      <path d="M184 252 Q206 228 228 252" stroke="#17213D" strokeWidth="13" strokeLinecap="round" fill="none" />
      <path d="M284 252 Q306 228 328 252" stroke="#17213D" strokeWidth="13" strokeLinecap="round" fill="none" />
      <path d="M256 124 C256 124 228 160 228 182 C228 199 240 211 256 211 C272 211 284 199 284 182 C284 160 256 124 256 124Z" fill={`url(#${uid}gd)`} />
      <ellipse cx="248" cy="180" rx="6" ry="12" transform="rotate(18 248 180)" fill="#fff" opacity="0.65" />
      {!simple && <><circle cx="166" cy="296" r="22" fill="#F7B8B1" opacity="0.55" /><circle cx="346" cy="296" r="22" fill="#F7B8B1" opacity="0.55" /></>}
    </svg>
  );
}

// "Gou Siri" lettering (outlined, so it looks identical on every phone). The dots of both i's are golden drops.
function GouSiriWordmark({ height = 32, color = '#1F4FB0' }) {
  const uid = (React.useId ? React.useId() : 'gs').replace(/:/g, '');
  return (
    <svg height={height} width={Math.round(height * GS_WM_RATIO)} viewBox={GS_WM_VIEWBOX} role="img" aria-label="Gou Siri" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`${uid}gd`} x1="0.15" y1="0" x2="0.85" y2="1"><stop offset="0" stopColor="#FFE892" /><stop offset="1" stopColor="#F0A21B" /></linearGradient>
      </defs>
      <path d={GS_GOU} fill={color} />
      <path d={GS_SIRI} transform={`translate(${GS_SIRI_X} 0)`} fill={color} />
      {GS_DROPS.map((d, i) => <path key={i} d={d} transform={`translate(${GS_SIRI_X} 0)`} fill={`url(#${uid}gd)`} />)}
    </svg>
  );
}

function SplashScreen({ text }) {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, background: C.bg }}>
      {FONTS}
      <div className="gs-pulse" style={{ borderRadius: 30, boxShadow: `0 16px 34px rgba(${C.brandRgb},0.35)` }}>
        <GouSiriMark size={104} radius={30} />
      </div>
      <GouSiriWordmark height={30} />
      <div className="ff-body" style={{ color: C.sub, fontSize: 14.5, marginTop: 4 }}>{text}</div>
    </div>
  );
}

// ---------- Illustrations ----------
function CowFace({ size = 64, calf = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ display: 'block' }}>
      <ellipse cx="15" cy="43" rx="13" ry="7.5" transform="rotate(-22 15 43)" fill="#fff" />
      <ellipse cx="15" cy="43" rx="7.5" ry="4" transform="rotate(-22 15 43)" fill="#F4B6B0" />
      <ellipse cx="85" cy="43" rx="13" ry="7.5" transform="rotate(22 85 43)" fill="#fff" />
      <ellipse cx="85" cy="43" rx="7.5" ry="4" transform="rotate(22 85 43)" fill="#F4B6B0" />
      {!calf && (
        <>
          <path d="M34 26 C29 15 24 12 19 14 C25 17 28 23 30 30 Z" fill="#EBD9A8" />
          <path d="M66 26 C71 15 76 12 81 14 C75 17 72 23 70 30 Z" fill="#EBD9A8" />
        </>
      )}
      <path d="M50 18 C71 18 79 33 77 52 C76 67 66 80 50 80 C34 80 24 67 23 52 C21 33 29 18 50 18 Z" fill="#fff" />
      <path d="M50 18 C61 18 71 24 75 35 C67 32 59 35 57 44 C52 37 47 28 50 18 Z" fill="#3A3A3C" />
      <ellipse cx="50" cy="69" rx="20" ry="13.5" fill="#F7BDB5" />
      <ellipse cx="42.5" cy="69" rx="3.2" ry="4.2" fill="#D9827B" />
      <ellipse cx="57.5" cy="69" rx="3.2" ry="4.2" fill="#D9827B" />
      <circle cx="38" cy="50" r="4" fill="#1C1C1C" />
      <circle cx="62" cy="50" r="4" fill="#1C1C1C" />
      <circle cx="39.3" cy="48.6" r="1.3" fill="#fff" />
      <circle cx="63.3" cy="48.6" r="1.3" fill="#fff" />
    </svg>
  );
}

const AVATAR_BG = { active: '#FFE8DC', dry: '#F6E9D8', calf: '#FFF0C7', heifer: '#E0ECFF', sold: '#ECECEF' };

function CowAvatar({ size = 64, status = 'active', radius = 16 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: radius, background: AVATAR_BG[status] || AVATAR_BG.active, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
      <CowFace size={Math.round(size * 0.88)} calf={status === 'calf'} />
    </div>
  );
}

// Cow picture with the ear-tag number as a small badge underneath (like a rating badge on a restaurant card)
function CowThumb({ cow, size = 78 }) {
  const tag = String(cow.tagNumber ?? '');
  const shown = tag.length > 6 ? '…' + tag.slice(-4) : tag;
  return (
    <div style={{ position: 'relative', flexShrink: 0, marginBottom: 9 }}>
      <CowAvatar size={size} status={cow.status} radius={Math.round(size * 0.22)} />
      <div className="ff-display" style={{ position: 'absolute', left: '50%', bottom: -10, transform: 'translateX(-50%)', background: C.ink, color: '#fff', fontSize: 12.5, padding: '2px 9px', borderRadius: 8, border: '2px solid #fff', whiteSpace: 'nowrap' }}>
        #{shown}
      </div>
    </div>
  );
}

function MilkBottle({ size = 46 }) {
  return (
    <svg width={size} height={Math.round(size * 1.5)} viewBox="0 0 60 90" aria-hidden="true" style={{ display: 'block' }}>
      <rect x="21" y="3" width="18" height="10" rx="3" fill={C.brandDark} />
      <path d="M22 13 H38 V22 C38 26 48 30 48 40 V80 C48 85 45 88 40 88 H20 C15 88 12 85 12 80 V40 C12 30 22 26 22 22 Z" fill="#fff" />
      <rect x="12" y="46" width="36" height="24" fill={C.brandSoft} />
      <text x="30" y="63" textAnchor="middle" fontSize="12" fontWeight="800" fill={C.brand} fontFamily="Plus Jakarta Sans, Inter, sans-serif">MILK</text>
    </svg>
  );
}

function PastureScene({ height = 150 }) {
  return (
    <svg viewBox="0 0 360 170" preserveAspectRatio="xMidYMid slice" width="100%" height={height} aria-hidden="true" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="pgSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.skyTop} />
          <stop offset="1" stopColor={C.skyBottom} />
        </linearGradient>
      </defs>
      <rect width="360" height="170" fill="url(#pgSky)" />
      <circle cx="292" cy="46" r="34" fill="#FFFFFF" opacity="0.55" />
      <circle cx="292" cy="46" r="21" fill="#FFC857" />
      <ellipse cx="72" cy="34" rx="26" ry="8" fill="#fff" opacity="0.9" />
      <ellipse cx="94" cy="28" rx="18" ry="7" fill="#fff" opacity="0.9" />
      <ellipse cx="206" cy="22" rx="22" ry="6.5" fill="#fff" opacity="0.8" />
      <path d="M0 108 C50 84 100 88 150 104 C200 120 250 88 360 100 L360 170 L0 170 Z" fill="#B7DDA9" />
      <g transform="translate(34 70)">
        <rect x="0" y="20" width="64" height="48" fill="#D94452" />
        <path d="M-7 22 L32 0 L71 22 Z" fill="#B5303E" />
        <rect x="22" y="38" width="20" height="30" fill="#fff" />
        <path d="M22 38 L42 68 M42 38 L22 68" stroke="#D94452" strokeWidth="3" />
      </g>
      <path d="M0 134 C60 114 120 122 180 136 C240 150 300 120 360 128 L360 170 L0 170 Z" fill="#7CC47F" />
      <g transform="translate(196 92)">
        <path d="M2 18 C-6 22 -5 34 -2 40" stroke="#3A3A3C" strokeWidth="3" fill="none" strokeLinecap="round" />
        <rect x="2" y="12" width="52" height="26" rx="12" fill="#fff" />
        <path d="M10 14 C18 9 25 16 22 26 C15 29 7 25 10 14 Z" fill="#3A3A3C" />
        <path d="M32 20 C39 15 48 20 45 31 C39 33 32 29 32 20 Z" fill="#3A3A3C" />
        <rect x="8" y="34" width="7" height="18" rx="3" fill="#fff" />
        <rect x="19" y="34" width="7" height="18" rx="3" fill="#F2F2F2" />
        <rect x="35" y="34" width="7" height="18" rx="3" fill="#fff" />
        <rect x="46" y="34" width="7" height="18" rx="3" fill="#F2F2F2" />
        <ellipse cx="62" cy="17" rx="12" ry="10" fill="#fff" />
        <ellipse cx="69" cy="22" rx="7" ry="5.5" fill="#F7BDB5" />
        <circle cx="62" cy="13" r="2.2" fill="#1C1C1C" />
        <ellipse cx="54" cy="8" rx="5" ry="3" fill="#F4B6B0" transform="rotate(-25 54 8)" />
        <path d="M58 7 C57 2 55 0 52 0 C54 3 55 5 56 9 Z" fill="#EBD9A8" />
      </g>
      <path d="M0 156 C70 146 140 160 220 152 C280 146 330 156 360 150 L360 170 L0 170 Z" fill="#5DB268" />
      <g stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity="0.9">
        <path d="M262 150 V132 M280 150 V130 M298 150 V131 M316 150 V132 M254 138 H324 M254 146 H324" />
      </g>
    </svg>
  );
}

// ================= MAIN APP =================
function ManageAccessModal({ ownerId, onClose }) {
  const [invites, setInvites] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    const [{ data: inv }, { data: mem }] = await Promise.all([
      supabase.from('farm_invites').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }),
      supabase.from('farm_access').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }),
    ]);
    setInvites(inv || []);
    setMembers(mem || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sendInvite = async () => {
    setError('');
    if (!email.trim() || !email.includes('@')) { setError('Enter a valid email address.'); return; }
    setBusy(true);
    const { error: err } = await supabase.from('farm_invites').insert({ owner_id: ownerId, email: email.trim().toLowerCase(), role });
    setBusy(false);
    if (err) { setError('Could not send invite. Please try again.'); return; }
    setEmail('');
    load();
  };

  const cancelInvite = async (id) => {
    await supabase.from('farm_invites').delete().eq('id', id);
    load();
  };

  const revokeMember = async (id) => {
    await supabase.from('farm_access').delete().eq('id', id);
    load();
  };

  return (
    <Modal title="Manage Access" onClose={onClose}>
      <div className="ff-body" style={{ fontSize: 13.5, color: C.sub, marginBottom: 16, lineHeight: 1.5 }}>
        Invite people by email to see this same farm. <strong>Master</strong> can add, edit, and delete just like you. <strong>Viewer</strong> can only look — nothing they do can change your data.
      </div>

      <Field label="Invite by email">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="someone@example.com" style={inputStyle} />
      </Field>
      <Field label="Role">
        <Segmented options={['viewer', 'master']} value={role} onChange={setRole} />
      </Field>
      {error && <div style={{ background: C.rustSoft, color: C.rust, borderRadius: 10, padding: 10, fontSize: 13.5, marginBottom: 12 }}>{error}</div>}
      <PrimaryButton disabled={busy} onClick={sendInvite}>{busy ? 'Sending…' : 'Send invite'}</PrimaryButton>

      <div style={{ marginTop: 22 }}>
        <SectionTitle title="Pending invites" />
        {loading ? (
          <MutedNote text="Loading…" />
        ) : invites.length === 0 ? (
          <MutedNote text="No pending invites. Sent invites are accepted automatically the moment that person logs in with the same email." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
            {invites.map((inv) => (
              <div key={inv.id} style={rowCardStyle}>
                <Mail size={16} color={C.grey} />
                <div style={{ flex: 1, marginLeft: 10 }}>
                  <div className="ff-display" style={{ fontWeight: 700, fontSize: 14, color: C.ink }}>{inv.email}</div>
                  <div style={{ fontSize: 12.5, color: C.sub }}>Waiting to accept · {inv.role}</div>
                </div>
                <button onClick={() => cancelInvite(inv.id)} style={{ background: C.greySoft, border: 'none', borderRadius: 8, padding: 6 }}><X size={14} color={C.ink} /></button>
              </div>
            ))}
          </div>
        )}

        <SectionTitle title="People with access" />
        {loading ? (
          <MutedNote text="Loading…" />
        ) : members.length === 0 ? (
          <MutedNote text="Nobody else has access to this farm yet." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {members.map((m) => (
              <div key={m.id} style={rowCardStyle}>
                {m.role === 'master' ? <UserPlus size={16} color={C.green} /> : <Eye size={16} color={C.grey} />}
                <div style={{ flex: 1, marginLeft: 10 }}>
                  <div className="ff-display" style={{ fontWeight: 700, fontSize: 14, color: C.ink }}>{m.email || 'Member'}</div>
                  <div style={{ fontSize: 12.5, color: C.sub }}>{m.role === 'master' ? 'Master access' : 'View only'}</div>
                </div>
                <button onClick={() => revokeMember(m.id)} style={{ background: C.rustSoft, border: 'none', borderRadius: 8, padding: 6 }}><Trash2 size={14} color={C.rust} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function ProfileModal({ ownerName, farmName, totalAnimals, email, role, onSaveProfile, onChangePassword, onManageAccess, onSignOut, onClose }) {
  const [name, setName] = useState(ownerName || '');
  const [farm, setFarm] = useState(farmName || '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setBusy(true);
    await onSaveProfile({ ownerName: name.trim(), farmName: farm.trim() });
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Modal title="Profile" onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 52, height: 52, borderRadius: 999, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <UserCircle size={30} color={C.green} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="ff-display" style={{ fontWeight: 700, fontSize: 17, color: C.ink }}>{ownerName || 'Add your name'}</div>
          <div style={{ fontSize: 13, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
          {role !== 'owner' && (
            <div style={{ marginTop: 4 }}>
              <Chip bg={role === 'master' ? C.greenSoft : C.greySoft} fg={role === 'master' ? C.green : C.grey}>
                {role === 'master' ? 'Master access' : 'View only'}
              </Chip>
            </div>
          )}
        </div>
      </div>

      <Field label="Your name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Eshwar" style={inputStyle} />
      </Field>
      <Field label="Farm name">
        <input value={farm} onChange={(e) => setFarm(e.target.value)} placeholder="e.g. Esh Farm" style={inputStyle} />
      </Field>
      <PrimaryButton disabled={busy} onClick={save}>{busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save changes'}</PrimaryButton>

      <div style={{ marginTop: 20, background: C.greenSoft, borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13.5, color: C.green, fontWeight: 600 }}>Total animals</div>
        <div className="ff-display" style={{ fontWeight: 700, fontSize: 20, color: C.green }}>{totalAnimals}</div>
      </div>

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={onChangePassword} className="ff-body" style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: '11px 14px', fontSize: 14, fontWeight: 600, color: C.ink }}>
          <KeyRound size={16} color={C.grey} /> Change password
        </button>
        {role === 'owner' && (
          <button onClick={onManageAccess} className="ff-body" style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: '11px 14px', fontSize: 14, fontWeight: 600, color: C.ink }}>
            <Users size={16} color={C.grey} /> Manage access
          </button>
        )}
        <button onClick={onSignOut} className="ff-body" style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.rustSoft, border: 'none', borderRadius: 10, padding: '11px 14px', fontSize: 14, fontWeight: 700, color: C.rust }}>
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </Modal>
  );
}

function ChangePasswordModal({ email, onClose }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError('');
    if (!currentPassword) { setError('Enter your current password.'); return; }
    if (password.length < 6) { setError('New password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('New passwords do not match.'); return; }
    setBusy(true);

    // Step 1: re-authenticate with the current password. This both verifies
    // it's correct AND guarantees a fresh session, which Supabase requires
    // for a password change to actually take effect.
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (signInErr) {
      setBusy(false);
      setError('Current password is incorrect.');
      return;
    }

    // Step 2: update to the new password (also passing current_password,
    // which some Supabase versions require even on a fresh session).
    const { error: err } = await supabase.auth.updateUser({ password, current_password: currentPassword });
    if (err) {
      setBusy(false);
      setError(`Could not update password: ${err.message || 'unknown error'}`);
      return;
    }

    // Step 3: mark as done (we'll sign out once they dismiss this dialog,
    // so they actually get to see the confirmation first).
    setBusy(false);
    setDone(true);
  };

  const finish = async () => {
    await supabase.auth.signOut();
    onClose();
  };

  if (done) {
    return (
      <Modal title="Password Changed" onClose={finish}>
        <div style={{ background: C.greenSoft, color: C.green, borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 14 }}>
          Your password has been updated. Tap below to sign out — then log back in using your <strong>new</strong> password.
        </div>
        <PrimaryButton onClick={finish}>Sign out now</PrimaryButton>
      </Modal>
    );
  }

  return (
    <Modal title="Change Password" onClose={onClose}>
      <Field label="Current password">
        <div style={{ position: 'relative' }}>
          <Lock size={18} color={C.grey} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Your current password" style={{ ...inputStyle, paddingLeft: 42 }} />
        </div>
      </Field>
      <Field label="New password">
        <div style={{ position: 'relative' }}>
          <Lock size={18} color={C.grey} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" style={{ ...inputStyle, paddingLeft: 42 }} />
        </div>
      </Field>
      <Field label="Confirm new password">
        <div style={{ position: 'relative' }}>
          <Lock size={18} color={C.grey} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter new password" style={{ ...inputStyle, paddingLeft: 42 }} />
        </div>
      </Field>
      {error && <div style={{ background: C.rustSoft, color: C.rust, borderRadius: 10, padding: 10, fontSize: 13.5, marginBottom: 12 }}>{error}</div>}
      <PrimaryButton disabled={busy} onClick={submit}>{busy ? 'Updating…' : 'Update password'}</PrimaryButton>
    </Modal>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const submit = async () => {
    setError(''); setInfo('');
    if (!email.trim() || password.length < 6) { setError('Enter your email and a password of at least 6 characters.'); return; }
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.auth.signUp({ email: email.trim(), password });
        if (err) throw err;
        setInfo('Account created. Check your email to confirm, then log in.');
        setMode('login');
      }
    } catch (e) {
      setError(e.message || 'Something went wrong.');
    }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', background: '#fff' }}>
      {FONTS}
      <div className="ff-body" style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column' }}>
        <div style={{ borderRadius: '0 0 34px 34px', overflow: 'hidden', marginBottom: 0 }}><PastureScene height={200} /></div>
        <div style={{ padding: '0 24px 28px' }}>
        <div style={{ marginTop: -52, marginBottom: 22 }}>
          <div style={{ width: 84, height: 84, borderRadius: 26, boxShadow: '0 0 0 5px #fff, 0 14px 28px rgba(47,111,214,0.32)', marginBottom: 14 }}>
            <GouSiriMark size={84} radius={26} />
          </div>
          <GouSiriWordmark height={34} />
          <div style={{ fontSize: 15.5, color: C.sub, marginTop: 8 }}>Dairy farm manager · {mode === 'login' ? 'Log in to your farm' : 'Create your account'}</div>
        </div>

        <Field label="Email">
          <div style={{ position: 'relative' }}>
            <Mail size={18} color={C.grey} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={{ ...inputStyle, paddingLeft: 42 }} />
          </div>
        </Field>
        <Field label="Password">
          <div style={{ position: 'relative' }}>
            <Lock size={18} color={C.grey} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" style={{ ...inputStyle, paddingLeft: 42 }} />
          </div>
        </Field>

        {error && <div style={{ background: C.rustSoft, color: C.rust, borderRadius: 10, padding: 10, fontSize: 13.5, marginBottom: 12 }}>{error}</div>}
        {info && <div style={{ background: C.greenSoft, color: C.green, borderRadius: 10, padding: 10, fontSize: 13.5, marginBottom: 12 }}>{info}</div>}

        <PrimaryButton disabled={busy} onClick={submit}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
        </PrimaryButton>

        <button
          onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setInfo(''); }}
          className="ff-body"
          style={{ marginTop: 14, background: 'none', border: 'none', color: C.brand, fontSize: 15, fontWeight: 700, textAlign: 'center', width: '100%' }}
        >
          {mode === 'login' ? "New here? Create an account" : 'Already have an account? Log in'}
        </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  useEffect(() => { document.title = 'Gou Siri – Dairy Farm Manager'; }, []);
  const [loaded, setLoaded] = useState(false);
  const [cows, setCows] = useState([]);
  const [milk, setMilk] = useState([]);
  const [heat, setHeat] = useState([]);
  const [medical, setMedical] = useState([]);
  const [feedTypes, setFeedTypes] = useState([]);
  const [feedTransactions, setFeedTransactions] = useState([]);
  const [financeEntries, setFinanceEntries] = useState([]);
  const [medicineTypes, setMedicineTypes] = useState([]);
  const [medicineTransactions, setMedicineTransactions] = useState([]);
  const [tab, setTab] = useState('home');
  const [openCowId, setOpenCowId] = useState(null);
  const [openCowTab, setOpenCowTab] = useState(null);
  const openCowAt = (id, tabName) => { setOpenCowId(id); setOpenCowTab(tabName); };
  const [modal, setModal] = useState(null); // {type, cowId?, editId?}
  const [askAI, setAskAI] = useState(null); // { focusCow } | null
  const [printJob, setPrintJob] = useState(null);
  const [restorePending, setRestorePending] = useState(null);
  const [restoreMsg, setRestoreMsg] = useState('');
  const saveTimer = useRef(null);
  const fileInputRef = useRef(null);

  const handleBackupClick = () => {
    const payload = { cows, milk, heat, medical, feedTypes, feedTransactions, exportedAt: new Date().toISOString() };
    downloadFile(`farm_backup_${todayStr()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  };

  const handleRestoreClick = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileSelected = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || typeof data !== 'object') throw new Error('bad file');
        setRestorePending(data);
      } catch (err) {
        setRestoreMsg('That file could not be read. Make sure it is a backup .json file downloaded from this app.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const applyRestore = async () => {
    if (!restorePending || !userId) return;
    try {
      await supabase.from('milk_records').delete().eq('user_id', userId);
      await supabase.from('heat_records').delete().eq('user_id', userId);
      await supabase.from('medical_records').delete().eq('user_id', userId);
      await supabase.from('feed_transactions').delete().eq('user_id', userId);
      await supabase.from('feed_types').delete().eq('user_id', userId);
      await supabase.from('cows').delete().eq('user_id', userId);

      const cowIdMap = {};
      for (const c of restorePending.cows || []) {
        const { data, error } = await supabase.from('cows').insert(cowToRow({ ...c, motherCowId: '' }, userId)).select().single();
        if (!error) cowIdMap[c.id] = data.id;
      }
      // second pass: now that every cow has a new id, wire up mother references
      for (const c of restorePending.cows || []) {
        if (c.motherCowId && cowIdMap[c.motherCowId] && cowIdMap[c.id]) {
          await supabase.from('cows').update({ mother_cow_id: cowIdMap[c.motherCowId] }).eq('id', cowIdMap[c.id]);
        }
      }
      const feedTypeIdMap = {};
      for (const f of restorePending.feedTypes || []) {
        const { data, error } = await supabase.from('feed_types').insert(feedTypeToRow(f, userId)).select().single();
        if (!error) feedTypeIdMap[f.id] = data.id;
      }
      for (const m of restorePending.milk || []) {
        const cid = cowIdMap[m.cowId]; if (!cid) continue;
        await supabase.from('milk_records').insert(milkToRow({ ...m, cowId: cid }, userId));
      }
      for (const h of restorePending.heat || []) {
        const cid = cowIdMap[h.cowId]; if (!cid) continue;
        await supabase.from('heat_records').insert(heatToRow({ ...h, cowId: cid }, userId));
      }
      for (const med of restorePending.medical || []) {
        const cid = cowIdMap[med.cowId]; if (!cid) continue;
        await supabase.from('medical_records').insert(medToRow({ ...med, cowId: cid }, userId));
      }
      for (const t of restorePending.feedTransactions || []) {
        const fid = feedTypeIdMap[t.feedTypeId]; if (!fid) continue;
        await supabase.from('feed_transactions').insert(feedTxnToRow({ ...t, feedTypeId: fid }, userId));
      }
      setRestorePending(null);
      await loadAllData();
    } catch (e) {
      setRestoreMsg('Something went wrong while restoring. Please try again.');
    }
  };

  useEffect(() => {
    if (!printJob) return;
    const t = setTimeout(() => window.print(), 100);
    return () => clearTimeout(t);
  }, [printJob]);

  const [session, setSession] = useState(undefined); // undefined = checking, null = signed out, object = signed in
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [role, setRole] = useState('owner'); // 'owner' | 'master' | 'viewer'
  const [ownerId, setOwnerId] = useState(null); // whose data we're actually looking at

  useEffect(() => {
    if (configMissing) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const resolveAccess = async (mySession) => {
    const myId = mySession.user.id;
    const myEmail = mySession.user.email;
    try {
      // 1) Accept any pending invite addressed to my email (and ONLY those —
      // farm_invites also shows invites I've sent as an owner, which must
      // never be treated as invites for me to accept)
      const { data: invites } = await supabase.from('farm_invites').select('*').eq('email', (myEmail || '').toLowerCase());
      if (invites && invites.length) {
        for (const inv of invites) {
          if (inv.owner_id === myId) { // safety net: never let someone "accept" their own invite
            await supabase.from('farm_invites').delete().eq('id', inv.id);
            continue;
          }
          await supabase.from('farm_access').insert({ owner_id: inv.owner_id, viewer_id: myId, email: myEmail, role: inv.role });
          await supabase.from('farm_invites').delete().eq('id', inv.id);
        }
      }
      // 2) Am I someone else's shared user?
      const { data: access } = await supabase.from('farm_access').select('*').eq('viewer_id', myId).neq('owner_id', myId).limit(1);
      if (access && access.length) {
        setOwnerId(access[0].owner_id);
        setRole(access[0].role === 'master' ? 'master' : 'viewer');
        return;
      }
    } catch (e) {
      console.error('Access resolution failed', e);
    }
    // 3) Otherwise I'm the owner of my own farm
    setOwnerId(myId);
    setRole('owner');
  };

  const loadAllData = async () => {
    try {
      const [c, m, h, med, ft, tx, fin, mt, mtx] = await Promise.all([
        fetchTable('cows', mapCowFromRow),
        fetchTable('milk_records', mapMilkFromRow, 'date'),
        fetchTable('heat_records', mapHeatFromRow, 'date'),
        fetchTable('medical_records', mapMedFromRow, 'date'),
        fetchTable('feed_types', mapFeedTypeFromRow),
        fetchTable('feed_transactions', mapFeedTxnFromRow, 'date'),
        fetchTable('finance_entries', mapFinanceFromRow, 'date'),
        fetchTable('medicine_types', mapMedicineTypeFromRow),
        fetchTable('medicine_transactions', mapMedicineTxnFromRow, 'date'),
      ]);
      setCows(c); setMilk(m); setHeat(h); setMedical(med); setFeedTypes(ft); setFeedTransactions(tx); setFinanceEntries(fin);
      setMedicineTypes(mt); setMedicineTransactions(mtx);
    } catch (e) {
      console.error('Failed to load data', e);
    }
    setLoaded(true);
  };

  useEffect(() => {
    if (session) {
      setLoaded(false);
      resolveAccess(session).then(loadAllData);
    } else if (session === null) {
      setCows([]); setMilk([]); setHeat([]); setMedical([]); setFeedTypes([]); setFeedTransactions([]); setFinanceEntries([]); setMedicineTypes([]); setMedicineTransactions([]); setLoaded(true);
    }
  }, [session]);

  const userId = ownerId;
  const isReadOnly = role === 'viewer';

  const handleSignOut = async () => { await supabase.auth.signOut(); };


  const onEditHeat = (record) => setModal({ type: 'heat', cowId: record.cowId, editId: record.id });
  const onDeleteHeat = async (record) => {
    await supabase.from('heat_records').delete().eq('id', record.id);
    setHeat(heat.filter((h) => h.id !== record.id));
  };

  const deleteFeedType = async (id) => {
    await supabase.from('feed_types').delete().eq('id', id);
    setFeedTypes((prev) => prev.filter((f) => f.id !== id));
    setFeedTransactions((prev) => prev.filter((t) => t.feedTypeId !== id));
  };
  const onEditMedical = (record) => setModal({ type: 'medical', cowId: record.cowId, editId: record.id });
  const onDeleteMedical = async (record) => {
    await supabase.from('medical_records').delete().eq('id', record.id);
    setMedical(medical.filter((m) => m.id !== record.id));
  };

  const heatStatusFor = (cow) => {
    if (cow.pregnancyConfirmed) return { status: 'pregnant' };
    const recs = heat.filter((h) => h.cowId === cow.id).sort((a, b) => b.date.localeCompare(a.date));
    if (!recs.length) return { status: 'none' };
    const last = recs[0];
    const cycle = cow.cycleLength || 21;
    const nextDate = addDays(last.date, cycle);
    const daysUntil = diffDays(nextDate);
    let status = 'upcoming';
    if (daysUntil < 0) status = 'overdue';
    else if (daysUntil <= 3) status = 'due';
    return { status, nextDate, daysUntil, lastDate: last.date };
  };

  const inseminationStatusFor = (cow) => {
    if (!cow.inseminatedOn) return { status: 'none' };
    const checkDate = addDays(cow.inseminatedOn, 20);
    const daysUntil = diffDays(checkDate);
    let status = 'upcoming';
    if (daysUntil <= 0 && daysUntil >= -14) status = 'due';
    else if (daysUntil < -14) status = 'stale';
    return { status, checkDate, daysUntil };
  };

  const milkToday = useMemo(() => milk.filter((m) => m.date === todayStr()).reduce((s, m) => s + Number(m.liters || 0), 0), [milk]);
  const activeCows = useMemo(() => cows.filter((c) => c.status === 'active'), [cows]);
  const breedableCows = useMemo(() => cows.filter((c) => c.status !== 'calf' && c.status !== 'sold'), [cows]);
  const heatAlerts = useMemo(() => activeCows.map((c) => ({ cow: c, ...heatStatusFor(c) })).filter((x) => x.status === 'due' || x.status === 'overdue'), [activeCows, heat]);
  const insemAlerts = useMemo(() => activeCows.map((c) => ({ cow: c, ...inseminationStatusFor(c) })).filter((x) => x.status === 'due'), [activeCows]);
  const medDue = useMemo(() => {
    return medical.filter((m) => m.nextDueDate && !m.completed && diffDays(m.nextDueDate) <= 7).sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
  }, [medical]);
  const insuranceAlerts = useMemo(() => {
    return cows
      .filter((c) => c.insured && c.insuranceExpiryDate)
      .map((c) => ({ cow: c, ...insuranceStatusFor(c) }))
      .filter((x) => x.status === 'expiring' || x.status === 'expired');
  }, [cows]);

  const cowById = (id) => cows.find((c) => c.id === id);

  if (configMissing) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, padding: 24 }}>
        {FONTS}
        <div className="ff-body" style={{ maxWidth: 380, textAlign: 'center', color: C.ink }}>
          <div className="ff-display" style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}>Setup needed</div>
          <div style={{ fontSize: 14, color: C.sub, lineHeight: 1.6 }}>
            This app needs its Supabase connection details set as environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY) when it's deployed. Check the SETUP.md instructions that came with this project.
          </div>
        </div>
      </div>
    );
  }

  if (session === undefined) {
    return (
      <SplashScreen text="Loading…" />
    );
  }

  if (session === null) {
    return <AuthScreen />;
  }

  if (!loaded) {
    return (
      <SplashScreen text="Loading your farm…" />
    );
  }

  return (
    <RoleContext.Provider value={{ role, isReadOnly }}>
    <>
      {FONTS}
      <div className="app-shell" style={{ display: 'flex', justifyContent: 'center', background: C.bg }}>
        <div className="ff-body" style={{ width: '100%', maxWidth: 420, height: '100%', background: C.bg, position: 'relative', overflow: 'hidden', boxShadow: '0 0 0 1px #00000008', display: 'flex', flexDirection: 'column' }}>

          <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {openCowId ? (
            <CowDetail
              cow={cowById(openCowId)}
              milk={milk} heat={heat} medical={medical} allCows={cows}
              heatStatus={heatStatusFor(cowById(openCowId))}
              insemStatus={inseminationStatusFor(cowById(openCowId))}
              initialTab={openCowTab}
              onBack={() => { setOpenCowId(null); setOpenCowTab(null); }}
              onEdit={() => setModal({ type: 'cow', editId: openCowId })}
              onDelete={async () => {
                await supabase.from('cows').delete().eq('id', openCowId);
                setCows(cows.filter((c) => c.id !== openCowId));
                setMilk(milk.filter((m) => m.cowId !== openCowId));
                setHeat(heat.filter((h) => h.cowId !== openCowId));
                setMedical(medical.filter((m) => m.cowId !== openCowId));
                setOpenCowId(null);
              }}
              onAddMilk={() => setModal({ type: 'milk', cowId: openCowId })}
              onAddHeat={() => setModal({ type: 'heat', cowId: openCowId })}
              onEditHeat={onEditHeat}
              onDeleteHeat={onDeleteHeat}
              onAddMedical={() => setModal({ type: 'medical', cowId: openCowId })}
              onEditMedical={onEditMedical}
              onDeleteMedical={onDeleteMedical}
              onToggleMedComplete={async (record, completed) => {
                const { data: row, error } = await supabase.from('medical_records').update({ completed }).eq('id', record.id).select().single();
                if (error) throw new Error(error.message);
                if (row) setMedical(medical.map((m) => (m.id === record.id ? mapMedFromRow(row) : m)));
              }}
              onAddCalf={() => setModal({ type: 'cow', defaultStatus: 'calf', defaultMotherId: openCowId })}
              onOpenCow={setOpenCowId}
              onAskAI={() => setAskAI({ focusCow: cowById(openCowId) })}
              onExport={(kind) => {
                const cow = cowById(openCowId);
                if (!cow) return;
                const milkRows = milk.filter((m) => m.cowId === cow.id).sort((a, b) => a.date.localeCompare(b.date)).map((m) => [fmtDate(m.date), m.session, m.liters]);
                const heatRows = heat.filter((h) => h.cowId === cow.id).sort((a, b) => a.date.localeCompare(b.date)).map((h) => [fmtDate(h.date), h.bred ? 'Yes' : 'No', h.notes || '']);
                const medRows = medical.filter((m) => m.cowId === cow.id).sort((a, b) => a.date.localeCompare(b.date)).map((m) => [fmtDate(m.date), m.type, m.medicine || '', m.description || '', m.vet || '', m.nextDueDate ? fmtDate(m.nextDueDate) : '']);
                if (kind === 'print') {
                  setPrintJob({ type: 'cow', title: `${cow.name} — Full Record`, cow, milkRows, heatRows, medRows });
                } else {
                  const sections = [];
                  sections.push(`${cow.name} — Tag #${cow.tagNumber}`);
                  sections.push(`Breed: ${cow.breed}, DOB: ${fmtDate(cow.dob)}, Status: ${cow.status}`);
                  if (cow.pregnancyConfirmed && cow.inseminatedOn) sections.push(`Pregnant - expected calving ${fmtDate(addMonths(cow.inseminatedOn, 9))}`);
                  if (cow.insured) sections.push(`Insured${cow.insuranceExpiryDate ? ` - expires ${fmtDate(cow.insuranceExpiryDate)}` : ''}`);
                  if (milkRows.length) sections.push('', 'MILK RECORDS', toCSV(['Date', 'Session', 'Liters'], milkRows));
                  if (heatRows.length) sections.push('', 'HEAT RECORDS', toCSV(['Date', 'Bred', 'Notes'], heatRows));
                  if (medRows.length) sections.push('', 'HEALTH RECORDS', toCSV(['Date', 'Type', 'Medicine', 'Details', 'Vet', 'Next Due'], medRows));
                  downloadFile(`${cow.name.replace(/\s+/g, '_')}_record.csv`, sections.join('\n'));
                }
              }}
            />
          ) : (
            <div style={{ paddingBottom: 78 }}>
              {tab === 'home' && (
                <HomeScreen
                  cows={cows} milkToday={milkToday} heatAlerts={heatAlerts} medDue={medDue} insemAlerts={insemAlerts} insuranceAlerts={insuranceAlerts}
                  onOpenCow={setOpenCowId} onOpenCowTab={openCowAt} onGoTab={setTab}
                  onBackup={handleBackupClick} onRestore={handleRestoreClick}
                  onOpenProfile={() => setModal({ type: 'profile' })}
                  farmName={session?.user?.user_metadata?.farm_name}
                />
              )}
              {tab === 'cows' && (
                <CowsScreen
                  cows={cows} heatStatusFor={heatStatusFor} onOpenCow={setOpenCowId}
                  onAddCow={() => setModal({ type: 'cow', defaultStatus: 'active' })}
                  onAddCalf={() => setModal({ type: 'cow', defaultStatus: 'calf' })}
                  onExport={(kind) => {
                    const rows = cowsExportRows(cows);
                    if (kind === 'print') setPrintJob({ type: 'list', title: 'Herd — Animal Details', headers: COWS_HEADERS, rows });
                    else downloadFile('animal_details.csv', toCSV(COWS_HEADERS, rows));
                  }}
                />
              )}
              {tab === 'milk' && (
                <MilkScreen
                  cows={cows} milk={milk} cowById={cowById} onAdd={() => setModal({ type: 'milkBatch' })}
                  onExport={(kind) => {
                    const rows = milkExportRows(milk, cowById);
                    if (kind === 'print') setPrintJob({ type: 'list', title: 'Milk Records', headers: MILK_HEADERS, rows });
                    else downloadFile('milk_records.csv', toCSV(MILK_HEADERS, rows));
                  }}
                  onUpdateMilk={async (id, liters) => {
                    const { data: row, error } = await supabase.from('milk_records').update({ liters }).eq('id', id).select().single();
                    if (!error && row) setMilk(milk.map((m) => (m.id === id ? mapMilkFromRow(row) : m)));
                  }}
                  onDeleteMilk={async (id) => {
                    await supabase.from('milk_records').delete().eq('id', id);
                    setMilk(milk.filter((m) => m.id !== id));
                  }}
                />
              )}
              {tab === 'heat' && (
                <HeatScreen cows={breedableCows} heat={heat} heatStatusFor={heatStatusFor} cowById={cowById} onAdd={() => setModal({ type: 'heat' })} onOpenCow={setOpenCowId} onEditHeat={onEditHeat} onDeleteHeat={onDeleteHeat} />
              )}
              {tab === 'health' && (
                <HealthScreen
                  medical={medical} cowById={cowById} onAdd={() => setModal({ type: 'medical' })}
                  onExport={(kind) => {
                    const rows = medExportRows(medical, cowById);
                    if (kind === 'print') setPrintJob({ type: 'list', title: 'Health Records', headers: MED_HEADERS, rows });
                    else downloadFile('health_records.csv', toCSV(MED_HEADERS, rows));
                  }}
                  onToggleComplete={async (record, completed) => {
                    const { data: row, error } = await supabase.from('medical_records').update({ completed }).eq('id', record.id).select().single();
                    if (error) throw new Error(error.message);
                    if (row) setMedical(medical.map((m) => (m.id === record.id ? mapMedFromRow(row) : m)));
                  }}
                  onEditMedical={onEditMedical}
                  onDeleteMedical={onDeleteMedical}
                  medicineTypes={medicineTypes}
                  medicineTransactions={medicineTransactions}
                  onAddMedicineType={() => setModal({ type: 'medicineType' })}
                  onEditMedicineType={(id) => setModal({ type: 'medicineType', editId: id })}
                  onDeleteMedicineType={async (id) => {
                    await supabase.from('medicine_types').delete().eq('id', id);
                    setMedicineTypes(medicineTypes.filter((m) => m.id !== id));
                    setMedicineTransactions(medicineTransactions.filter((t) => t.medicineTypeId !== id));
                  }}
                  onLogMedicineTxn={(medicineTypeId, kind) => setModal({ type: 'medicineTxn', medicineTypeId, kind })}
                  onUpdateMedicineTxn={async (id, data) => {
                    const patch = {};
                    if (data.quantity != null) patch.quantity = data.quantity;
                    if ('cost' in data) patch.cost = data.cost;
                    const { data: row, error } = await supabase.from('medicine_transactions').update(patch).eq('id', id).select().single();
                    if (!error && row) setMedicineTransactions(medicineTransactions.map((t) => (t.id === id ? mapMedicineTxnFromRow(row) : t)));
                  }}
                  onDeleteMedicineTxn={async (id) => {
                    await supabase.from('medicine_transactions').delete().eq('id', id);
                    setMedicineTransactions(medicineTransactions.filter((t) => t.id !== id));
                  }}
                  onExportMedicine={(kind) => {
                    const headers = ['Medicine', 'Unit', 'Cost/Unit (₹)', 'Stock Left', 'Purchased (Total)', 'Used (Total)'];
                    const rows = medicineTypes.map((mt) => [
                      mt.name, mt.unit, mt.costPerUnit || '',
                      medicineStock(mt.id, medicineTransactions),
                      medicineTotalPurchased(mt.id, medicineTransactions),
                      medicineTotalUsed(mt.id, medicineTransactions),
                    ]);
                    const txnHeaders = ['Date', 'Medicine', 'Transaction', 'Quantity', 'Cost (₹)', 'Notes'];
                    const txnRows = medicineTransactions.slice().sort((a, b) => a.date.localeCompare(b.date)).map((t) => {
                      const mt = medicineTypes.find((m) => m.id === t.medicineTypeId);
                      return [fmtDate(t.date), mt ? mt.name : 'Unknown', t.kind === 'purchase' ? 'Purchased' : 'Used', t.quantity, t.kind === 'purchase' ? (t.cost || '') : '', t.notes || ''];
                    });
                    if (kind === 'print') setPrintJob({ type: 'feed', title: 'Medicine Stock Report', summaryHeaders: headers, summaryRows: rows, txnHeaders, txnRows });
                    else downloadFile('medicine_stock.csv', ['SUMMARY', toCSV(headers, rows), '', 'TRANSACTIONS', toCSV(txnHeaders, txnRows)].join('\n'));
                  }}
                />
              )}
              {tab === 'feed' && (
                <FeedScreen
                  feedTypes={feedTypes} feedTransactions={feedTransactions}
                  onAddType={() => setModal({ type: 'feedType' })}
                  onEditType={(id) => setModal({ type: 'feedType', editId: id })}
                  onLogTxn={(feedTypeId, kind) => setModal({ type: 'feedTxn', feedTypeId, kind })}
                  onQuickTxn={async (feedTypeId, kind, data) => {
                    const { data: row, error } = await supabase.from('feed_transactions').insert(feedTxnToRow({ ...data, feedTypeId, kind }, userId)).select().single();
                    if (error || !row) throw new Error(error ? error.message : 'Could not save');
                    setFeedTransactions((prev) => [...prev, mapFeedTxnFromRow(row)]);
                  }}
                  onUpdateTxn={async (id, data) => {
                    const patch = {};
                    if (data.bags != null) patch.bags = data.bags;
                    if (data.date) patch.date = data.date;
                    if ('cost' in data) patch.cost = data.cost;
                    const { data: row, error } = await supabase.from('feed_transactions').update(patch).eq('id', id).select().single();
                    if (error || !row) throw new Error(error ? error.message : 'Could not save');
                    setFeedTransactions((prev) => prev.map((t) => (t.id === id ? mapFeedTxnFromRow(row) : t)));
                  }}
                  onDeleteTxn={async (id) => {
                    await supabase.from('feed_transactions').delete().eq('id', id);
                    setFeedTransactions((prev) => prev.filter((t) => t.id !== id));
                  }}
                  onExport={(kind) => {
                    const summaryHeaders = ['Feed Type', 'Cost/Bag (₹)', 'Bags Left', 'Purchased (Total)', 'Used (Total)', 'Money Spent on Buying (₹)', 'Value of Stock in Hand (₹)'];
                    const summaryRows = feedTypes.map((f) => [
                      f.name, f.costPerBag, feedStock(f.id, feedTransactions), feedTotalPurchased(f.id, feedTransactions),
                      feedTotalUsed(f.id, feedTransactions), feedTotalDebited(f.id, feedTransactions).toFixed(0), feedStockValue(f, feedTransactions).toFixed(0),
                    ]);
                    const txnHeaders = ['Date', 'Feed Type', 'Transaction', 'Bags', 'Cost (₹)', 'Notes'];
                    const txnRows = feedTransactions.slice().sort((a, b) => a.date.localeCompare(b.date)).map((t) => {
                      const ft = feedTypes.find((f) => f.id === t.feedTypeId);
                      const monthly = isMonthlyEntry(t);
                      return [fmtDate(t.date), ft ? ft.name : 'Unknown', t.kind === 'purchase' ? 'Purchased' : monthly ? 'Used (monthly total)' : 'Used', t.bags, t.kind === 'purchase' ? (t.cost || '') : '', monthly ? `Total for ${monthLabel(monthOfEntry(t))}` : (t.notes || '')];
                    });
                    if (kind === 'print') {
                      setPrintJob({ type: 'feed', title: 'Feed Management Report', summaryHeaders, summaryRows, txnHeaders, txnRows });
                    } else {
                      const csv = ['FEED SUMMARY', toCSV(summaryHeaders, summaryRows), '', 'TRANSACTIONS', toCSV(txnHeaders, txnRows)].join('\n');
                      downloadFile('feed_records.csv', csv);
                    }
                  }}
                />
              )}
              {tab === 'finance' && (
                <FinanceScreen
                  financeEntries={financeEntries}
                  feedTransactions={feedTransactions}
                  feedTypes={feedTypes}
                  onAdd={(type) => setModal({ type: 'finance', entryType: type })}
                  onEdit={(id) => setModal({ type: 'finance', editId: id })}
                  onDelete={async (id) => {
                    await supabase.from('finance_entries').delete().eq('id', id);
                    setFinanceEntries(financeEntries.filter((e) => e.id !== id));
                  }}
                  onExport={(kind) => {
                    const feedRows = feedTransactions.filter((t) => t.kind === 'usage').map((t) => {
                      const ft = feedTypes.find((f) => f.id === t.feedTypeId);
                      const amount = ft ? Number(t.bags) * Number(ft.costPerBag) : 0;
                      return [fmtDate(t.date), 'Expense', 'Feed', amount, ft ? `${t.bags} bags of ${ft.name} used` : `${t.bags} bags used`];
                    });
                    const manualRows = financeEntries.map((e) => [fmtDate(e.date), e.type === 'income' ? 'Income' : 'Expense', e.category, e.amount, e.notes || '']);
                    const rows = [...feedRows, ...manualRows].sort((a, b) => a[0].localeCompare(b[0]));
                    const headers = ['Date', 'Type', 'Category', 'Amount (₹)', 'Notes'];
                    if (kind === 'print') setPrintJob({ type: 'list', title: 'Finance Report', headers, rows });
                    else downloadFile('finance_records.csv', toCSV(headers, rows));
                  }}
                />
              )}
            </div>
          )}
          </div>

          {!openCowId && <AskAIFab onClick={() => setAskAI({ focusCow: null })} />}
          {!openCowId && <BottomNav tab={tab} setTab={setTab} />}

          {askAI && (
            <AskAIPanel
              farmData={{ cows, milk, heat, medical, financeEntries, feedTransactions, feedTypes, medicineTypes, medicineTransactions }}
              farmName={session?.user?.user_metadata?.farm_name}
              focusCow={askAI.focusCow}
              onClose={() => setAskAI(null)}
            />
          )}

          {modal && modal.type === 'cow' && (
            <CowForm
              initial={modal.editId ? cowById(modal.editId) : null}
              defaultStatus={modal.defaultStatus}
              defaultMotherId={modal.defaultMotherId}
              cows={cows}
              onClose={() => setModal(null)}
              onSave={async (data) => {
                if (modal.editId) {
                  await supabase.from('cows').update(cowToRow(data, userId)).eq('id', modal.editId);
                  setCows(cows.map((c) => (c.id === modal.editId ? { ...c, ...data } : c)));
                } else {
                  const { data: row, error } = await supabase.from('cows').insert(cowToRow({ status: 'active', cycleLength: 21, ...data }, userId)).select().single();
                  if (!error) setCows([...cows, mapCowFromRow(row)]);
                }
                setModal(null);
              }}
            />
          )}

          {modal && modal.type === 'milk' && (
            <MilkForm
              cows={cows} milk={milk} defaultCowId={modal.cowId}
              onClose={() => setModal(null)}
              onSave={async ({ existingId, ...data }) => {
                if (existingId) {
                  const { data: row, error } = await supabase.from('milk_records').update({ liters: data.liters }).eq('id', existingId).select().single();
                  if (!error && row) setMilk(milk.map((m) => (m.id === existingId ? mapMilkFromRow(row) : m)));
                } else {
                  const { data: row, error } = await supabase.from('milk_records').insert(milkToRow(data, userId)).select().single();
                  if (!error) setMilk([...milk, mapMilkFromRow(row)]);
                }
                setModal(null);
              }}
            />
          )}

          {modal && modal.type === 'milkBatch' && (
            <MilkBatchForm
              cows={activeCows} milk={milk}
              onClose={() => setModal(null)}
              onSave={async ({ date, session, entries }) => {
                const toInsert = entries.filter((e) => !e.existingId).map((e) => milkToRow({ cowId: e.cowId, date, session, liters: e.liters }, userId));
                const toUpdate = entries.filter((e) => e.existingId);
                const results = [];
                if (toInsert.length) {
                  const { data: rows, error } = await supabase.from('milk_records').insert(toInsert).select();
                  if (!error && rows) results.push(...rows.map(mapMilkFromRow));
                }
                for (const e of toUpdate) {
                  const { data: row, error } = await supabase.from('milk_records').update({ liters: e.liters }).eq('id', e.existingId).select().single();
                  if (!error && row) results.push(mapMilkFromRow(row));
                }
                const updatedIds = new Set(toUpdate.map((e) => e.existingId));
                setMilk([...milk.filter((m) => !updatedIds.has(m.id)), ...results]);
                setModal(null);
              }}
            />
          )}

          {modal && modal.type === 'heat' && (
            <HeatForm
              cows={breedableCows} defaultCowId={modal.cowId}
              initial={modal.editId ? heat.find((h) => h.id === modal.editId) : null}
              onClose={() => setModal(null)}
              onSave={async (data) => {
                if (modal.editId) {
                  await supabase.from('heat_records').update(heatToRow(data, userId)).eq('id', modal.editId);
                  setHeat(heat.map((h) => (h.id === modal.editId ? { ...h, ...data } : h)));
                } else {
                  const { data: row, error } = await supabase.from('heat_records').insert(heatToRow(data, userId)).select().single();
                  if (!error) setHeat([...heat, mapHeatFromRow(row)]);
                }
                setModal(null);
              }}
            />
          )}

          {modal && modal.type === 'medical' && (
            <MedicalForm
              cows={cows} defaultCowId={modal.cowId}
              initial={modal.editId ? medical.find((m) => m.id === modal.editId) : null}
              onClose={() => setModal(null)}
              onSave={async ({ cowIds, ...rest }) => {
                if (modal.editId) {
                  const orig = medical.find((m) => m.id === modal.editId);
                  const { data: row, error } = await supabase
                    .from('medical_records')
                    .update(medToRow({ ...rest, cowId: cowIds[0], completed: orig?.completed }, userId))
                    .eq('id', modal.editId)
                    .select()
                    .single();
                  if (!error && row) setMedical(medical.map((m) => (m.id === modal.editId ? mapMedFromRow(row) : m)));
                } else {
                  const rowsToInsert = cowIds.map((cid) => medToRow({ ...rest, cowId: cid }, userId));
                  const { data: rows, error } = await supabase.from('medical_records').insert(rowsToInsert).select();
                  if (!error && rows) setMedical([...medical, ...rows.map(mapMedFromRow)]);
                }
                setModal(null);
              }}
            />
          )}

          {modal && modal.type === 'feedType' && (
            <FeedTypeForm
              initial={modal.editId ? feedTypes.find((f) => f.id === modal.editId) : null}
              txnCount={modal.editId ? feedTransactions.filter((t) => t.feedTypeId === modal.editId).length : 0}
              onClose={() => setModal(null)}
              onDelete={modal.editId ? async () => { await deleteFeedType(modal.editId); setModal(null); } : null}
              onSave={async ({ openingBags, ...typeData }) => {
                if (modal.editId) {
                  await supabase.from('feed_types').update(feedTypeToRow(typeData, userId)).eq('id', modal.editId);
                  setFeedTypes((prev) => prev.map((f) => (f.id === modal.editId ? { ...f, ...typeData } : f)));
                } else {
                  const { data: row, error } = await supabase.from('feed_types').insert(feedTypeToRow(typeData, userId)).select().single();
                  if (!error && row) {
                    setFeedTypes((prev) => [...prev, mapFeedTypeFromRow(row)]);
                    if (openingBags > 0) {
                      // the stock you already have becomes the first entry, so the count starts right
                      const { data: trow } = await supabase.from('feed_transactions')
                        .insert(feedTxnToRow({ feedTypeId: row.id, date: todayStr(), kind: 'purchase', bags: openingBags, cost: 0, notes: OPENING_STOCK_NOTE }, userId)).select().single();
                      if (trow) setFeedTransactions((prev) => [...prev, mapFeedTxnFromRow(trow)]);
                    }
                  }
                }
                setModal(null);
              }}
            />
          )}

          {modal && modal.type === 'feedTxn' && (
            <FeedTxnForm
              feedType={feedTypes.find((f) => f.id === modal.feedTypeId)}
              kind={modal.kind}
              onClose={() => setModal(null)}
              onSave={async (data) => {
                const { data: row, error } = await supabase.from('feed_transactions').insert(feedTxnToRow({ ...data, feedTypeId: modal.feedTypeId, kind: modal.kind }, userId)).select().single();
                if (!error && row) setFeedTransactions((prev) => [...prev, mapFeedTxnFromRow(row)]);
                setModal(null);
              }}
            />
          )}

          {modal && modal.type === 'finance' && (
            <FinanceEntryForm
              initial={modal.editId ? financeEntries.find((e) => e.id === modal.editId) : null}
              defaultType={modal.entryType}
              onClose={() => setModal(null)}
              onSave={async (data) => {
                if (modal.editId) {
                  await supabase.from('finance_entries').update(financeToRow(data, userId)).eq('id', modal.editId);
                  setFinanceEntries(financeEntries.map((e) => (e.id === modal.editId ? { ...e, ...data } : e)));
                } else {
                  const { data: row, error } = await supabase.from('finance_entries').insert(financeToRow(data, userId)).select().single();
                  if (!error && row) setFinanceEntries([...financeEntries, mapFinanceFromRow(row)]);
                }
                setModal(null);
              }}
            />
          )}

          {modal && modal.type === 'medicineType' && (
            <MedicineTypeForm
              initial={modal.editId ? medicineTypes.find((m) => m.id === modal.editId) : null}
              onClose={() => setModal(null)}
              onSave={async (data) => {
                if (modal.editId) {
                  await supabase.from('medicine_types').update(medicineTypeToRow(data, userId)).eq('id', modal.editId);
                  setMedicineTypes(medicineTypes.map((m) => (m.id === modal.editId ? { ...m, ...data } : m)));
                } else {
                  const { data: row, error } = await supabase.from('medicine_types').insert(medicineTypeToRow(data, userId)).select().single();
                  if (!error && row) setMedicineTypes([...medicineTypes, mapMedicineTypeFromRow(row)]);
                }
                setModal(null);
              }}
            />
          )}

          {modal && modal.type === 'medicineTxn' && (
            <MedicineTxnForm
              medicineType={medicineTypes.find((m) => m.id === modal.medicineTypeId)}
              kind={modal.kind}
              onClose={() => setModal(null)}
              onSave={async (data) => {
                const { data: row, error } = await supabase.from('medicine_transactions').insert(medicineTxnToRow({ ...data, medicineTypeId: modal.medicineTypeId, kind: modal.kind }, userId)).select().single();
                if (!error && row) setMedicineTransactions([...medicineTransactions, mapMedicineTxnFromRow(row)]);
                setModal(null);
              }}
            />
          )}

          {modal && modal.type === 'manageAccess' && (
            <ManageAccessModal ownerId={session.user.id} onClose={() => setModal(null)} />
          )}

          {modal && modal.type === 'changePassword' && (
            <ChangePasswordModal email={session?.user?.email} onClose={() => setModal(null)} />
          )}

          {modal && modal.type === 'profile' && (
            <ProfileModal
              ownerName={session?.user?.user_metadata?.full_name || ''}
              farmName={session?.user?.user_metadata?.farm_name || ''}
              totalAnimals={cows.length}
              email={session?.user?.email}
              role={role}
              onSaveProfile={async ({ ownerName, farmName }) => {
                await supabase.auth.updateUser({ data: { full_name: ownerName, farm_name: farmName } });
              }}
              onChangePassword={() => setModal({ type: 'changePassword' })}
              onManageAccess={() => setModal({ type: 'manageAccess' })}
              onSignOut={() => { setModal(null); handleSignOut(); }}
              onClose={() => setModal(null)}
            />
          )}

          <input ref={fileInputRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={handleFileSelected} />

          {restorePending && (
            <Modal title="Restore this backup?" onClose={() => setRestorePending(null)}>
              <div style={{ fontSize: 14, color: C.sub, marginBottom: 14, lineHeight: 1.5 }}>
                This will replace everything currently in the app — {(restorePending.cows || []).length} cow(s), {(restorePending.milk || []).length} milk record(s), {(restorePending.medical || []).length} health record(s) — with the data from this backup file
                {restorePending.exportedAt ? ` (saved ${fmtDate(restorePending.exportedAt.slice(0, 10))})` : ''}. This can't be undone.
              </div>
              <PrimaryButton onClick={applyRestore}>Replace with backup data</PrimaryButton>
            </Modal>
          )}

          {restoreMsg && (
            <Modal title="Couldn't restore" onClose={() => setRestoreMsg('')}>
              <div style={{ fontSize: 14, color: C.sub, marginBottom: 14 }}>{restoreMsg}</div>
              <PrimaryButton onClick={() => setRestoreMsg('')}>Okay</PrimaryButton>
            </Modal>
          )}
        </div>
      </div>
      <div className="print-area">
        <PrintDocument job={printJob} />
      </div>
    </>
    </RoleContext.Provider>
  );
}

// ---------- Bottom Nav ----------
function BottomNav({ tab, setTab }) {
  const items = [
    { key: 'home', label: 'Home', icon: Home },
    { key: 'cows', label: 'Animals', icon: CowIcon },
    { key: 'milk', label: 'Milk', icon: Milk },
    { key: 'heat', label: 'Heat', icon: HeartPulse },
    { key: 'health', label: 'Health', icon: Stethoscope },
    { key: 'feed', label: 'Feed', icon: Wheat },
    { key: 'finance', label: 'Finance', icon: Wallet },
  ];
  return (
    <div style={{ flexShrink: 0, background: '#fff', boxShadow: '0 -6px 20px rgba(0,0,0,0.07)', display: 'flex', padding: '4px 2px', paddingBottom: 'max(10px, calc(env(safe-area-inset-bottom) + 6px))', zIndex: 30, borderRadius: '20px 20px 0 0' }}>
      {items.map(({ key, label, icon: Icon }) => {
        const active = tab === key;
        return (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="ff-body"
            style={{ flex: 1, position: 'relative', background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, color: active ? C.brand : C.grey, padding: '9px 0 4px', minHeight: 52 }}
          >
            {active && <div style={{ position: 'absolute', top: 0, width: 26, height: 3.5, borderRadius: 2, background: C.brand }} />}
            <Icon size={22} strokeWidth={active ? 2.5 : 2} />
            <span style={{ fontSize: 11, fontWeight: active ? 800 : 600 }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function AskAIFab({ onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Ask AI about your farm"
      className="ff-body"
      style={{
        position: 'absolute', left: 16, bottom: 90, zIndex: 25,
        background: C.ink, color: '#fff', border: 'none', borderRadius: 16, padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700,
        boxShadow: '0 10px 22px rgba(0,0,0,0.3)',
      }}
    >
      <Sparkles size={18} color="#FFD166" /> Ask AI
    </button>
  );
}

const MAX_VOICE_SECONDS = 60;
const fmtTimer = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onloadend = () => resolve(String(fr.result).split(',')[1] || '');
  fr.onerror = reject;
  fr.readAsDataURL(blob);
});
const pickRecorderMime = () => {
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const o of options) {
    if (window.MediaRecorder && window.MediaRecorder.isTypeSupported && window.MediaRecorder.isTypeSupported(o)) return o;
  }
  return '';
};

function AskAIPanel({ farmData, farmName, focusCow, onClose }) {
  const [messages, setMessages] = useState([]); // { role: 'user'|'assistant'|'error', text, voice? }
  const [input, setInput] = useState(focusCow ? `About ${focusCow.name} (#${focusCow.tagNumber}): ` : '');
  const [busy, setBusy] = useState(false);
  const [rec, setRec] = useState('idle'); // 'idle' | 'recording' | 'transcribing'
  const [secs, setSecs] = useState(0);
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('askAiLang') === 'kn' ? 'kn' : 'en'; } catch (e) { return 'en'; }
  });
  const changeLang = (l) => {
    setLang(l);
    try { localStorage.setItem('askAiLang', l); } catch (e) { /* ignore */ }
  };
  const scrollRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);
  // Always read the latest props/state from async callbacks (recorder events fire later)
  const latest = useRef({});
  latest.current = { farmData, farmName, focusCow, messages, busy, lang };

  const voiceSupported = typeof window !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && typeof window.MediaRecorder !== 'undefined';

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy, rec]);

  const releaseMic = () => {
    clearInterval(timerRef.current);
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  };

  // Turn the microphone off if the panel is closed while recording
  useEffect(() => () => {
    cancelledRef.current = true;
    try { if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop(); } catch (e) { /* ignore */ }
    releaseMic();
  }, []);

  const addError = (text) => setMessages((m) => [...m, { role: 'error', text }]);

  const send = async (override) => {
    const fromVoice = typeof override === 'string';
    const question = (fromVoice ? override : input).trim();
    const { farmData: fd, farmName: fn, focusCow: fc, messages: current, busy: isBusy } = latest.current;
    if (!question || isBusy) return;
    const nextMessages = [...current, { role: 'user', text: question, voice: fromVoice }];
    setMessages(nextMessages);
    if (!fromVoice) setInput('');
    setBusy(true);
    try {
      const context = buildFarmContext({ ...fd, farmName: fn });
      const history = nextMessages.slice(0, -1).slice(-10).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text }));
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context, history, focusCow: fc ? `${fc.name} (#${fc.tagNumber})` : null, language: latest.current.lang }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessages((m) => [...m, { role: 'error', text: data.error || "Couldn't reach the AI service. Please try again." }]);
      } else {
        setMessages((m) => [...m, { role: 'assistant', text: data.answer || "I couldn't find an answer for that." }]);
      }
    } catch (e) {
      setMessages((m) => [...m, { role: 'error', text: "Couldn't reach the AI service — check your connection and try again." }]);
    } finally {
      setBusy(false);
    }
  };

  const handleRecordingStopped = async (mime) => {
    const durationMs = Date.now() - startedAtRef.current;
    releaseMic();
    if (cancelledRef.current) { setRec('idle'); return; }
    if (durationMs < 800 || chunksRef.current.length === 0) {
      setRec('idle');
      addError("I didn't catch that — tap the mic, speak for a moment, then tap send.");
      return;
    }
    setRec('transcribing');
    try {
      const blob = new Blob(chunksRef.current, { type: mime });
      const audio = await blobToBase64(blob);
      const names = ((latest.current.farmData && latest.current.farmData.cows) || []).slice(0, 30).map((c) => c.name).filter(Boolean);
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio, mime, names, language: latest.current.lang }),
      });
      const data = await res.json().catch(() => ({}));
      setRec('idle');
      if (!res.ok || !data.text) {
        addError(data.error || "Couldn't understand the recording. Please try again.");
        return;
      }
      await send(data.text);
    } catch (e) {
      setRec('idle');
      addError("Couldn't send the recording — check your connection and try again.");
    }
  };

  const stopRecording = (cancel) => {
    cancelledRef.current = !!cancel;
    clearInterval(timerRef.current);
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') r.stop();
    else { releaseMic(); setRec('idle'); }
  };

  const startRecording = async () => {
    if (rec !== 'idle' || latest.current.busy) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const mimeType = pickRecorderMime();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      cancelledRef.current = false;
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => handleRecordingStopped(recorder.mimeType || mimeType || 'audio/webm');
      recorderRef.current = recorder;
      recorder.start();
      startedAtRef.current = Date.now();
      setSecs(0);
      setRec('recording');
      timerRef.current = setInterval(() => {
        const s = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setSecs(s);
        if (s >= MAX_VOICE_SECONDS) stopRecording(false);
      }, 250);
    } catch (err) {
      releaseMic();
      const name = err && err.name;
      addError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Microphone access is blocked. Allow the microphone for this site in your browser settings, then try again.'
          : name === 'NotFoundError'
            ? 'No microphone was found on this device.'
            : "Couldn't start the microphone. Please try again."
      );
    }
  };

  const roundBtn = (bg, extra = {}) => ({ flexShrink: 0, width: 44, height: 44, borderRadius: 22, border: 'none', background: bg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', ...extra });
  const hasText = !!input.trim();

  return ReactDOM.createPortal(
    <div style={{ position: 'fixed', inset: 0, background: C.bg, zIndex: 1100, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ background: `linear-gradient(135deg, ${C.brand} 0%, ${C.brandDark} 100%)`, padding: '14px 16px', paddingTop: 'max(14px, env(safe-area-inset-top))', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 16, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={16} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ff-display" style={{ fontWeight: 700, fontSize: 16, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Ask about your farm</div>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{focusCow ? `Focused on ${focusCow.name}` : 'Animals, health, milk & finance'}</div>
          </div>
          <div role="group" aria-label="Language" style={{ display: 'flex', background: 'rgba(255,255,255,0.2)', borderRadius: 12, padding: 3, flexShrink: 0 }}>
            {[['en', 'EN'], ['kn', 'ಕನ್ನಡ']].map(([code, text]) => (
              <button
                key={code}
                onClick={() => changeLang(code)}
                disabled={rec !== 'idle'}
                aria-pressed={lang === code}
                className="ff-body"
                style={{ border: 'none', borderRadius: 9, padding: '6px 10px', fontSize: 13.5, fontWeight: 700, background: lang === code ? '#fff' : 'transparent', color: lang === code ? C.brandDark : '#fff' }}
              >
                {text}
              </button>
            ))}
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 10, padding: 8, display: 'flex' }}>
            <X size={16} color="#fff" />
          </button>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16, WebkitOverflowScrolling: 'touch' }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: C.sub, fontSize: 13.5, marginTop: 30, padding: '0 14px', lineHeight: 1.5 }}>
              Ask anything about your herd — e.g. "which cows are due for heat this week",
              "how much milk did we get yesterday", "total expenses last month", or "is {focusCow ? focusCow.name : 'Ganga'} pregnant".
              {voiceSupported && <div style={{ marginTop: 10, color: C.brand, fontWeight: 600 }}>Tap the microphone to ask by speaking.</div>}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
              <div
                className="ff-body"
                style={{
                  maxWidth: '82%', borderRadius: 14, padding: '10px 13px', fontSize: 14.5, lineHeight: 1.45, whiteSpace: 'pre-wrap',
                  background: m.role === 'user' ? C.brand : m.role === 'error' ? C.rustSoft : '#fff',
                  color: m.role === 'user' ? '#fff' : m.role === 'error' ? C.rust : C.ink,
                  border: m.role === 'assistant' ? `1px solid ${C.line}` : 'none',
                }}
              >
                {m.voice && <Mic size={13} style={{ marginRight: 6, verticalAlign: '-2px', opacity: 0.85 }} />}
                {m.text}
              </div>
            </div>
          ))}
          {busy && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>
              <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '10px 13px', fontSize: 14, color: C.sub }}>Thinking…</div>
            </div>
          )}
        </div>

        <div style={{ flexShrink: 0, borderTop: `1px solid ${C.line}`, background: '#fff', padding: 10, paddingBottom: 'max(10px, calc(env(safe-area-inset-bottom) + 6px))', display: 'flex', gap: 8, alignItems: 'center' }}>
          {rec === 'idle' && (
            <>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={lang === 'kn' ? 'ಇಲ್ಲಿ ಟೈಪ್ ಮಾಡಿ ಅಥವಾ ಮೈಕ್ ಒತ್ತಿ ಮಾತನಾಡಿ…' : voiceSupported ? 'Type, or tap the mic to speak…' : 'Ask about your animals, health, milk, or finances…'}
                rows={1}
                className="ff-body"
                style={{ flex: 1, resize: 'none', maxHeight: 90, border: `1.5px solid ${C.line}`, borderRadius: 14, padding: '11px 13px', fontSize: 16, outline: 'none', fontFamily: 'inherit' }}
              />
              {hasText || !voiceSupported ? (
                <button onClick={() => send()} disabled={busy || !hasText} aria-label="Send" style={roundBtn(C.brand, { opacity: busy || !hasText ? 0.5 : 1 })}>
                  <Send size={18} />
                </button>
              ) : (
                <button onClick={startRecording} disabled={busy} aria-label="Ask by voice" style={roundBtn(C.brand, { opacity: busy ? 0.5 : 1, boxShadow: `0 6px 14px rgba(${C.brandRgb},0.35)` })}>
                  <Mic size={20} />
                </button>
              )}
            </>
          )}
          {rec === 'recording' && (
            <>
              <button onClick={() => stopRecording(true)} aria-label="Cancel recording" style={roundBtn(C.greySoft)}>
                <X size={20} color={C.ink} />
              </button>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, background: C.brandSoft, borderRadius: 22, padding: '11px 16px', minWidth: 0 }}>
                <span className="rec-dot" />
                <span className="ff-display" style={{ fontSize: 16, color: C.ink }}>{fmtTimer(secs)}</span>
                <span className="ff-body" style={{ fontSize: 13.5, color: C.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Listening…</span>
              </div>
              <button onClick={() => stopRecording(false)} aria-label="Send voice question" style={roundBtn(C.brand, { boxShadow: `0 6px 14px rgba(${C.brandRgb},0.35)` })}>
                <Send size={19} />
              </button>
            </>
          )}
          {rec === 'transcribing' && (
            <div className="ff-body" style={{ flex: 1, textAlign: 'center', fontSize: 14.5, color: C.sub, padding: '13px 0' }}>Transcribing your voice…</div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ---------- Home ----------
function HomeScreen({ cows, milkToday, heatAlerts, medDue, insemAlerts, insuranceAlerts, onOpenCow, onOpenCowTab, onGoTab, onBackup, onRestore, onOpenProfile, farmName, userEmail }) {
  const { isReadOnly } = useContext(RoleContext);
  const milkingCount = cows.filter((c) => c.status === 'active').length;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const quick = [
    { key: 'cows', label: 'Animals', emoji: '🐄', bg: '#FFE8DC' },
    { key: 'milk', label: 'Milk', emoji: '🥛', bg: '#E3F0FF' },
    { key: 'heat', label: 'Heat', emoji: '🔥', bg: '#FFE3E6' },
    { key: 'health', label: 'Health', emoji: '💉', bg: '#E5F6EC' },
    { key: 'feed', label: 'Feed', emoji: '🌾', bg: '#FFF1CC' },
    { key: 'finance', label: 'Finance', emoji: '💰', bg: '#EDE7FB' },
  ];
  return (
    <div style={{ paddingBottom: 24 }}>
      <ScreenHeader
        leading={<div style={{ borderRadius: 12, boxShadow: '0 0 0 2px rgba(255,255,255,0.85)', flexShrink: 0 }}><GouSiriMark size={38} radius={11} simple /></div>}
        title={farmName || 'My Farm'} titleSize={21} subtitle={`${greeting} 👋`}
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <HeaderIconButton title="Backup all data" icon={<Download size={17} color="#fff" />} onClick={onBackup} />
            {!isReadOnly && <HeaderIconButton title="Restore from backup" icon={<Upload size={17} color="#fff" />} onClick={onRestore} />}
            <HeaderIconButton title="Profile" icon={<UserCircle size={17} color="#fff" />} onClick={onOpenProfile} />
          </div>
        }
      >
        <button
          onClick={() => onGoTab('cows')}
          className="ff-body"
          style={{ marginTop: 16, width: '100%', background: '#fff', border: 'none', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, color: C.grey, fontSize: 16, fontWeight: 500, textAlign: 'left', boxShadow: '0 8px 18px rgba(0,0,0,0.14)' }}
        >
          <Search size={20} color={C.brand} /> Search animals by name or tag
        </button>
      </ScreenHeader>
      <div style={{ padding: 16 }}>
        {isReadOnly && (
          <div style={{ background: C.greySoft, borderRadius: 14, padding: '12px 14px', marginBottom: 14, fontSize: 13.5, color: C.sub, lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Eye size={16} /> You have view-only access to this farm — adding, editing, and deleting is turned off for your account.
          </div>
        )}

        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 24, background: C.heroGradient, color: '#fff', padding: '20px 18px', minHeight: 158, boxShadow: `0 14px 28px rgba(${C.brandRgb},0.28)`, marginBottom: 22 }}>
          <div style={{ position: 'absolute', right: -30, top: -40, width: 150, height: 150, borderRadius: 75, background: 'rgba(255,255,255,0.2)' }} />
          <div style={{ position: 'absolute', right: 60, bottom: -60, width: 120, height: 120, borderRadius: 60, background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ position: 'relative', zIndex: 1, maxWidth: '58%' }}>
            <div className="ff-body" style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.8, opacity: 0.92 }}>TODAY'S MILK</div>
            <div className="ff-display" style={{ fontSize: 42, lineHeight: 1.05, marginTop: 4 }}>
              {milkToday.toFixed(1)}<span style={{ fontSize: 20, marginLeft: 4 }}>L</span>
            </div>
            <div className="ff-body" style={{ fontSize: 14.5, opacity: 0.95, marginTop: 6, fontWeight: 500 }}>
              from {milkingCount} milking cow{milkingCount === 1 ? '' : 's'}
            </div>
            <button onClick={() => onGoTab('milk')} className="ff-body" style={{ marginTop: 14, background: '#fff', color: C.brand, border: 'none', borderRadius: 12, padding: '9px 16px', fontSize: 15, fontWeight: 800 }}>
              {isReadOnly ? 'View milk' : 'Log milk'} →
            </button>
          </div>
          <div style={{ position: 'absolute', right: 8, bottom: 0, display: 'flex', alignItems: 'flex-end', zIndex: 1 }}>
            <div style={{ marginRight: -14, marginBottom: 6, transform: 'rotate(-8deg)' }}><MilkBottle size={42} /></div>
            <CowFace size={118} />
          </div>
        </div>

        <SectionTitle title="Manage your farm" />
        <div style={{ display: 'flex', gap: 14, overflowX: 'auto', margin: '0 -16px 8px', padding: '4px 16px 14px' }}>
          {quick.map((q) => (
            <button key={q.key} onClick={() => onGoTab(q.key)} style={{ background: 'none', border: 'none', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 74, padding: 0 }}>
              <div style={{ width: 70, height: 70, borderRadius: 35, background: q.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 33, boxShadow: '0 6px 14px rgba(0,0,0,0.08)' }}>{q.emoji}</div>
              <span className="ff-body" style={{ fontSize: 14.5, fontWeight: 700, color: C.ink }}>{q.label}</span>
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 22 }}>
          <StatCard label="Milk today" value={`${milkToday.toFixed(1)} L`} bg={C.milkSoft} fg={C.milk} icon={<Droplet size={19} />} onClick={() => onGoTab('milk')} />
          <StatCard label="Milking cows" value={milkingCount} bg={C.greenSoft} fg={C.green} icon={<CowIcon size={19} />} onClick={() => onGoTab('cows')} />
          <StatCard label="Heat alerts" value={heatAlerts.length} bg={C.rustSoft} fg={C.rust} icon={<HeartPulse size={19} />} onClick={() => onGoTab('heat')} />
          <StatCard label="Health due" value={medDue.length} bg={C.amberSoft} fg={C.amber} icon={<Stethoscope size={19} />} onClick={() => onGoTab('health')} />
        </div>

        <SectionTitle title="Insemination checks" />
        {insemAlerts.length === 0 ? (
          <MutedNote text="No pregnancy / repeat-heat checks due right now." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
            {insemAlerts.map(({ cow, daysUntil }) => (
              <div key={cow.id} onClick={() => onOpenCowTab(cow.id, 'heat')} style={rowCardStyle}>
                <EarTag number={cow.tagNumber} size="sm" />
                <div style={{ flex: 1, marginLeft: 10 }}>
                  <div className="ff-display" style={{ fontWeight: 700, fontSize: 14.5, color: C.ink }}>{cow.name}</div>
                  <div style={{ fontSize: 13, color: C.sub }}>
                    {daysUntil === 0 ? '20 days since insemination — check today' : `20-day mark passed ${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? '' : 's'} ago`}
                  </div>
                </div>
                <Chip bg={C.rustSoft} fg={C.rust}>Check now</Chip>
              </div>
            ))}
          </div>
        )}

        <SectionTitle title="Heat cycle alerts" />
        {heatAlerts.length === 0 ? (
          <MutedNote text="No cows due for heat check right now." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
            {heatAlerts.map(({ cow, status, daysUntil }) => (
              <div key={cow.id} onClick={() => onOpenCowTab(cow.id, 'heat')} style={rowCardStyle}>
                <EarTag number={cow.tagNumber} size="sm" />
                <div style={{ flex: 1, marginLeft: 10 }}>
                  <div className="ff-display" style={{ fontWeight: 700, fontSize: 14.5, color: C.ink }}>{cow.name}</div>
                  <div style={{ fontSize: 13, color: C.sub }}>{status === 'overdue' ? `${Math.abs(daysUntil)} days overdue` : `Due in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`}</div>
                </div>
                <Chip bg={status === 'overdue' ? C.rustSoft : C.amberSoft} fg={status === 'overdue' ? C.rust : C.amber}>{status === 'overdue' ? 'Overdue' : 'Due soon'}</Chip>
              </div>
            ))}
          </div>
        )}

        <SectionTitle title="Health follow-ups" />
        {medDue.length === 0 ? (
          <MutedNote text="Nothing due for the next 7 days." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {medDue.slice(0, 5).map((m) => {
              const cow = cows.find((c) => c.id === m.cowId);
              const overdue = diffDays(m.nextDueDate) < 0;
              return (
                <div key={m.id} onClick={() => cow && onOpenCowTab(cow.id, 'health')} style={rowCardStyle}>
                  {cow && <EarTag number={cow.tagNumber} size="sm" />}
                  <div style={{ flex: 1, marginLeft: 10 }}>
                    <div className="ff-display" style={{ fontWeight: 700, fontSize: 14.5, color: C.ink }}>{cow ? cow.name : 'Unknown'} · {m.type}</div>
                    <div style={{ fontSize: 13, color: C.sub }}>Follow-up {fmtDateShort(m.nextDueDate)}</div>
                  </div>
                  <Chip bg={overdue ? C.rustSoft : C.amberSoft} fg={overdue ? C.rust : C.amber}>{overdue ? 'Overdue' : 'Soon'}</Chip>
                </div>
              );
            })}
          </div>
        )}

        {insuranceAlerts && insuranceAlerts.length > 0 && (
          <>
            <SectionTitle title="Insurance" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {insuranceAlerts.slice(0, 5).map(({ cow, status, daysUntil }) => (
                <div key={cow.id} onClick={() => onOpenCow(cow.id)} style={rowCardStyle}>
                  <EarTag number={cow.tagNumber} size="sm" />
                  <div style={{ flex: 1, marginLeft: 10 }}>
                    <div className="ff-display" style={{ fontWeight: 700, fontSize: 14.5, color: C.ink }}>{cow.name}</div>
                    <div style={{ fontSize: 13, color: C.sub }}>
                      {status === 'expired' ? `Insurance expired ${fmtDateShort(cow.insuranceExpiryDate)}` : `Insurance expires ${fmtDateShort(cow.insuranceExpiryDate)}`}
                    </div>
                  </div>
                  <Chip bg={status === 'expired' ? C.rustSoft : C.amberSoft} fg={status === 'expired' ? C.rust : C.amber}>{status === 'expired' ? 'Expired' : 'Expiring'}</Chip>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="ff-body" style={{ marginTop: 22, background: C.milkSoft, borderRadius: 14, padding: '12px 14px', fontSize: 13.5, color: C.milk, lineHeight: 1.5 }}>
          Tip: your data syncs automatically to any device you log into with this account. Use the download/upload icons at the top for an extra offline backup.
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, bg, fg, icon, onClick }) {
  return (
    <button onClick={onClick} style={{ background: '#fff', borderRadius: 18, padding: 14, textAlign: 'left', border: 'none', boxShadow: C.shadow, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ width: 38, height: 38, borderRadius: 12, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
      <div>
        <div className="ff-display" style={{ fontSize: 26, color: C.ink, lineHeight: 1.1 }}>{value}</div>
        <div className="ff-body" style={{ fontSize: 14, color: C.sub, fontWeight: 600, marginTop: 3 }}>{label}</div>
      </div>
    </button>
  );
}

function SectionTitle({ title }) {
  return <div className="ff-display" style={{ fontSize: 19, color: C.ink, marginBottom: 12, marginTop: 6 }}>{title}</div>;
}

function MutedNote({ text }) {
  return <div className="ff-body" style={{ fontSize: 14.5, color: C.sub, background: '#fff', borderRadius: 16, padding: 16, marginBottom: 20, boxShadow: C.shadow, lineHeight: 1.45 }}>{text}</div>;
}

const rowCardStyle = { background: '#fff', borderRadius: 16, padding: 12, display: 'flex', alignItems: 'center', border: 'none', boxShadow: C.shadow, cursor: 'pointer' };

// ---------- Cows list ----------
function CowsScreen({ cows, heatStatusFor, onOpenCow, onAddCow, onAddCalf, onExport }) {
  const { isReadOnly } = useContext(RoleContext);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const nameById = Object.fromEntries(cows.map((c) => [c.id, c.name]));
  const filtered = cows
    .filter((c) => (c.name + c.tagNumber + c.breed).toLowerCase().includes(q.toLowerCase()))
    .filter((c) => {
      if (statusFilter === 'All') return true;
      if (statusFilter === 'Pregnant') return !!c.pregnancyConfirmed;
      if (statusFilter === 'Milking') return c.status === 'active';
      return c.status === statusFilter.toLowerCase();
    });
  return (
    <div>
      <ScreenHeader
        title="Animals" subtitle={`${cows.length} on the farm`}
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <HeaderIconButton title="Print herd list" icon={<Printer size={15} color="#fff" />} onClick={() => onExport('print')} />
            <HeaderIconButton title="Download CSV" icon={<Download size={15} color="#fff" />} onClick={() => onExport('csv')} />
          </div>
        }
      />
      <div style={{ padding: 16 }}>
        {!isReadOnly && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button
            onClick={onAddCow}
            className="ff-body"
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: C.brand, color: '#fff', border: 'none', borderRadius: 14, padding: '13px 0', fontWeight: 700, fontSize: 15.5, boxShadow: `0 8px 16px rgba(${C.brandRgb},0.28)` }}
          >
            <Plus size={15} /> Add cow
          </button>
          <button
            onClick={onAddCalf}
            className="ff-body"
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: C.amberSoft, color: C.amber, border: 'none', borderRadius: 14, padding: '13px 0', fontWeight: 700, fontSize: 15.5 }}
          >
            <Baby size={15} /> Add calf
          </button>
        </div>
        )}
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search size={18} color={C.grey} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, tag, breed" style={{ ...inputStyle, paddingLeft: 42 }} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <Segmented
            options={['All', 'Milking', 'Dry', 'Heifer', 'Calf', 'Pregnant']}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </div>
        {filtered.length === 0 ? (
          cows.length === 0 ? (
            <EmptyState icon={<CowIcon size={30} />} title="No animals yet" subtitle="Add your first cow — or log a calf — to start tracking milk, heat cycles, and health records." />
          ) : (
            <MutedNote text={`No ${statusFilter.toLowerCase()} animals found.`} />
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((cow) => {
              const hs = heatStatusFor(cow);
              return (
                <div key={cow.id} onClick={() => onOpenCow(cow.id)} style={{ ...rowCardStyle, padding: 14 }}>
                  <CowThumb cow={cow} size={78} />
                  <div style={{ flex: 1, marginLeft: 14 }}>
                    <div className="ff-display" style={{ fontWeight: 700, fontSize: 18, color: C.ink }}>{cow.name}</div>
                    <div style={{ fontSize: 13, color: C.sub, marginTop: 1 }}>
                      {cow.breed}{cow.dob ? ` · ${fmtDateShort(cow.dob)}` : ''}
                      {(cow.status === 'calf' || cow.status === 'heifer') && cow.motherCowId && nameById[cow.motherCowId] ? ` · Mother: ${nameById[cow.motherCowId]}` : ''}
                    </div>
                    <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <StatusPill status={cow.status} />
                      {(hs.status === 'due' || hs.status === 'overdue') && (
                        <Chip bg={hs.status === 'overdue' ? C.rustSoft : C.amberSoft} fg={hs.status === 'overdue' ? C.rust : C.amber}>Heat {hs.status === 'overdue' ? 'overdue' : 'due'}</Chip>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={17} color={C.grey} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Cow detail ----------
function CowDetail({ cow, milk, heat, medical, allCows, heatStatus, insemStatus, initialTab, onBack, onEdit, onDelete, onAddMilk, onAddHeat, onAddMedical, onEditMedical, onDeleteMedical, onAddCalf, onOpenCow, onEditHeat, onDeleteHeat, onToggleMedComplete, onExport, onAskAI }) {
  const { isReadOnly } = useContext(RoleContext);
  const [sub, setSub] = useState(initialTab || (['calf', 'heifer'].includes(cow?.status) ? 'health' : 'milk'));
  useEffect(() => {
    if (initialTab) { setSub(initialTab); return; }
    if (['calf', 'heifer'].includes(cow?.status) && (sub === 'milk' || sub === 'calves')) setSub('health');
  }, [cow?.id, cow?.status, initialTab]); // eslint-disable-line react-hooks/exhaustive-deps
  const [confirmDel, setConfirmDel] = useState(false);
  const [viewingMed, setViewingMed] = useState(null);
  const [viewingHeat, setViewingHeat] = useState(null);
  if (!cow) return null;
  const cowMilk = milk.filter((m) => m.cowId === cow.id).sort((a, b) => b.date.localeCompare(a.date));
  const cowHeat = heat.filter((h) => h.cowId === cow.id).sort((a, b) => b.date.localeCompare(a.date));
  const cowMed = medical.filter((m) => m.cowId === cow.id).sort((a, b) => b.date.localeCompare(a.date));
  const offspring = allCows.filter((c) => c.motherCowId === cow.id).sort((a, b) => (b.dob || '').localeCompare(a.dob || ''));
  const mother = cow.motherCowId ? allCows.find((c) => c.id === cow.motherCowId) : null;

  return (
    <div style={{ paddingBottom: 24 }}>
      <ScreenHeader
        title={cow.name}
        subtitle={`Tag #${cow.tagNumber} · ${cow.breed}`}
        onBack={onBack}
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onAskAI} title="Ask AI about this animal" style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 10, padding: 8, minWidth: 34, minHeight: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Sparkles size={15} color="#fff" /></button>
            {!isReadOnly && (
              <>
                <button onClick={onEdit} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 10, padding: 8, minWidth: 34, minHeight: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Pencil size={15} color="#fff" /></button>
                <button onClick={() => setConfirmDel(true)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 10, padding: 8, minWidth: 34, minHeight: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={15} color="#fff" /></button>
              </>
            )}
          </div>
        }
      />
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: '#fff', borderRadius: 20, padding: 16, marginBottom: 16, boxShadow: C.shadow }}>
          <CowThumb cow={cow} size={96} />
          <div style={{ flex: 1, minWidth: 0, lineHeight: 1.55 }}>
            <StatusPill status={cow.status} />
            <div style={{ fontSize: 13, color: C.sub, marginTop: 6 }}>Born {fmtDate(cow.dob)}</div>
            {cow.status === 'calf' || cow.status === 'heifer' ? (
              <>
                {cow.gender && <div style={{ fontSize: 13, color: C.sub }}>Gender: {cow.gender}</div>}
                {mother && <div style={{ fontSize: 13, color: C.sub }}>Mother: {mother.name} (#{mother.tagNumber})</div>}
                {cow.birthWeight !== '' && cow.birthWeight != null && <div style={{ fontSize: 13, color: C.sub }}>Birth weight: {cow.birthWeight} kg</div>}
              </>
            ) : null}
            {cow.status !== 'calf' && (
              <>
                <div style={{ fontSize: 13, color: C.sub }}>Heat cycle: every {cow.cycleLength || 21} days</div>
                {cow.calvingDate && <div style={{ fontSize: 13, color: C.sub }}>Last calving: {fmtDate(cow.calvingDate)}</div>}
                {cow.firstHeatDate && <div style={{ fontSize: 13, color: C.sub }}>First heat after calving: {fmtDate(cow.firstHeatDate)}</div>}
                {cow.inseminatedOn && <div style={{ fontSize: 13, color: C.sub }}>Inseminated on: {fmtDate(cow.inseminatedOn)}</div>}
                {cow.pregnancyConfirmed && cow.inseminatedOn && (
                  <div style={{ marginTop: 6 }}>
                    <Chip bg={C.greenSoft} fg={C.green}>Pregnant · Expected calving {fmtDate(addMonths(cow.inseminatedOn, 9))}</Chip>
                  </div>
                )}
              </>
            )}
            {cow.mastitisAntibiotic && <div style={{ marginTop: 6 }}><Chip bg={C.amberSoft} fg={C.amber}>Mastitis: {cow.mastitisAntibiotic}</Chip></div>}
            {cow.insured && (
              <div style={{ marginTop: 6 }}>
                {(() => {
                  const ist = insuranceStatusFor(cow);
                  if (ist.status === 'expired') return <Chip bg={C.rustSoft} fg={C.rust}>Insurance expired {fmtDate(cow.insuranceExpiryDate)}</Chip>;
                  if (ist.status === 'expiring') return <Chip bg={C.amberSoft} fg={C.amber}>Insurance expires {fmtDate(cow.insuranceExpiryDate)}</Chip>;
                  if (cow.insuranceExpiryDate) return <Chip bg={C.greenSoft} fg={C.green}>Insured until {fmtDate(cow.insuranceExpiryDate)}</Chip>;
                  return <Chip bg={C.greenSoft} fg={C.green}>Insured</Chip>;
                })()}
              </div>
            )}
            {offspring.length > 0 && <div style={{ fontSize: 13, color: C.sub, marginTop: 4 }}>Offspring on record: {offspring.length}</div>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button onClick={() => onExport('print')} className="ff-body" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#fff', border: `1.5px solid ${C.line}`, borderRadius: 10, padding: '9px 0', fontSize: 13.5, fontWeight: 600, color: C.ink }}>
            <Printer size={14} /> Print record
          </button>
          <button onClick={() => onExport('csv')} className="ff-body" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#fff', border: `1.5px solid ${C.line}`, borderRadius: 10, padding: '9px 0', fontSize: 13.5, fontWeight: 600, color: C.ink }}>
            <Download size={14} /> Download CSV
          </button>
        </div>

        {insemStatus && insemStatus.status !== 'none' && (
          <div style={{
            marginBottom: 16, borderRadius: 12, padding: 12,
            background: insemStatus.status === 'due' ? C.rustSoft : insemStatus.status === 'stale' ? C.greySoft : C.milkSoft,
          }}>
            <div className="ff-display" style={{ fontWeight: 700, fontSize: 14, color: insemStatus.status === 'due' ? C.rust : insemStatus.status === 'stale' ? C.grey : C.milk }}>
              {insemStatus.status === 'due'
                ? (insemStatus.daysUntil === 0 ? '20 days since insemination — check today' : `20-day check passed ${Math.abs(insemStatus.daysUntil)} day(s) ago`)
                : insemStatus.status === 'stale'
                ? '20-day insemination check window has passed'
                : `Insemination check in ${insemStatus.daysUntil} day(s)`}
            </div>
            <div style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>Inseminated {fmtDate(cow.inseminatedOn)} · check for repeat heat / pregnancy around {fmtDate(insemStatus.checkDate)}</div>
          </div>
        )}

        {heatStatus.status !== 'none' && heatStatus.status !== 'pregnant' && (
          <div style={{
            marginBottom: 16, borderRadius: 12, padding: 12,
            background: heatStatus.status === 'overdue' ? C.rustSoft : heatStatus.status === 'due' ? C.amberSoft : C.greenSoft,
          }}>
            <div className="ff-display" style={{ fontWeight: 700, fontSize: 14, color: heatStatus.status === 'overdue' ? C.rust : heatStatus.status === 'due' ? C.amber : C.green }}>
              {heatStatus.status === 'overdue' ? `Heat overdue by ${Math.abs(heatStatus.daysUntil)} days` : heatStatus.status === 'due' ? `Heat due in ${heatStatus.daysUntil} day(s)` : `Next heat expected ${fmtDateShort(heatStatus.nextDate)}`}
            </div>
            <div style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>Last recorded heat: {fmtDate(heatStatus.lastDate)}</div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {['calf', 'heifer'].includes(cow.status) ? (
            <Segmented options={['Heat', 'Health']} value={sub === 'heat' ? 'Heat' : 'Health'} onChange={(v) => setSub(v.toLowerCase())} />
          ) : (
            <Segmented options={['Milk', 'Heat', 'Health', 'Calves']} value={sub === 'milk' ? 'Milk' : sub === 'heat' ? 'Heat' : sub === 'health' ? 'Health' : 'Calves'} onChange={(v) => setSub(v.toLowerCase())} />
          )}
        </div>

        {sub === 'milk' && (
          <ListBlock
            items={cowMilk}
            empty="No milk records for this cow yet."
            addLabel="Log milk"
            onAdd={onAddMilk}
            render={(m) => (
              <div key={m.id} style={rowCardStyle}>
                <div style={{ color: C.milk }}><Droplet size={16} /></div>
                <div style={{ flex: 1, marginLeft: 10 }}>
                  <div className="ff-display" style={{ fontWeight: 700, fontSize: 14.5, color: C.ink }}>{m.liters} L · {m.session}</div>
                  <div style={{ fontSize: 13, color: C.sub }}>{fmtDate(m.date)}</div>
                </div>
              </div>
            )}
          />
        )}

        {sub === 'heat' && (
          <ListBlock
            items={cowHeat}
            empty="No heat cycle records yet."
            addLabel="Log heat cycle"
            onAdd={onAddHeat}
            render={(h) => (
              <div key={h.id} onClick={() => setViewingHeat(h)} style={rowCardStyle}>
                <div style={{ color: C.rust }}><HeartPulse size={16} /></div>
                <div style={{ flex: 1, marginLeft: 10 }}>
                  <div className="ff-display" style={{ fontWeight: 700, fontSize: 14.5, color: C.ink }}>{fmtDate(h.date)}</div>
                  {h.notes && <div style={{ fontSize: 13, color: C.sub }}>{h.notes}</div>}
                </div>
                {h.bred && <Chip bg={C.greenSoft} fg={C.green}>Bred</Chip>}
                <ChevronRight size={16} color={C.grey} />
              </div>
            )}
          />
        )}

        {sub === 'health' && (
          <ListBlock
            items={cowMed}
            empty="No medical records yet."
            addLabel="Add health record"
            onAdd={onAddMedical}
            render={(m) => (
              <div key={m.id} onClick={() => setViewingMed(m)} style={{ ...rowCardStyle, alignItems: 'flex-start' }}>
                <div style={{ color: C.amber, marginTop: 2 }}><Syringe size={16} /></div>
                <div style={{ flex: 1, marginLeft: 10 }}>
                  <div className="ff-display" style={{ fontWeight: 700, fontSize: 14.5, color: C.ink }}>{m.type}</div>
                  <div style={{ fontSize: 13, color: C.sub, marginTop: 1 }}>{fmtDate(m.date)}{m.vet ? ` · ${m.vet}` : ''}</div>
                  {m.medicine && <div style={{ fontSize: 13, color: C.ink, marginTop: 4 }}>Medicine: {m.medicine}</div>}
                  {m.nextDueDate && (
                    m.completed ? (
                      <div style={{ marginTop: 5 }}><Chip bg={C.greenSoft} fg={C.green}>Completed</Chip></div>
                    ) : (
                      <div style={{ fontSize: 12.5, color: C.amber, marginTop: 4, fontWeight: 600 }}>Next due {fmtDateShort(m.nextDueDate)}</div>
                    )
                  )}
                </div>
                <ChevronRight size={16} color={C.grey} />
              </div>
            )}
          />
        )}

        {sub === 'calves' && (
          <ListBlock
            items={offspring}
            empty="No offspring on record yet."
            addLabel="Add calf"
            onAdd={onAddCalf}
            render={(c) => (
              <div key={c.id} onClick={() => onOpenCow(c.id)} style={rowCardStyle}>
                <EarTag number={c.tagNumber} size="sm" tone={earTagTone(c.status)} />
                <div style={{ flex: 1, marginLeft: 10 }}>
                  <div className="ff-display" style={{ fontWeight: 700, fontSize: 14.5, color: C.ink }}>{c.name}</div>
                  <div style={{ fontSize: 13, color: C.sub }}>
                    {fmtDate(c.dob)}{c.birthWeight !== '' && c.birthWeight != null ? ` · ${c.birthWeight} kg at birth` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {c.gender && <Chip bg={c.gender === 'Female' ? C.greenSoft : C.milkSoft} fg={c.gender === 'Female' ? C.green : C.milk}>{c.gender}</Chip>}
                  <StatusPill status={c.status} />
                  <ChevronRight size={15} color={C.grey} />
                </div>
              </div>
            )}
          />
        )}
      </div>

      {confirmDel && (
        <Modal title="Remove this cow?" onClose={() => setConfirmDel(false)}>
          <div style={{ fontSize: 14, color: C.sub, marginBottom: 14 }}>This deletes {cow.name}'s profile along with all of its milk, heat, and health records. This can't be undone.</div>
          <PrimaryButton danger onClick={onDelete}>Delete permanently</PrimaryButton>
        </Modal>
      )}
      {viewingMed && (
        <HealthDetailModal
          record={viewingMed}
          cow={cow}
          onClose={() => setViewingMed(null)}
          onSaveComplete={async (r, completed) => { await onToggleMedComplete(r, completed); setViewingMed({ ...r, completed }); }}
          onEdit={(r) => { setViewingMed(null); onEditMedical(r); }}
          onDelete={(r) => { setViewingMed(null); onDeleteMedical(r); }}
        />
      )}
      {viewingHeat && (
        <HeatDetailModal
          record={viewingHeat}
          cow={cow}
          onClose={() => setViewingHeat(null)}
          onEdit={(r) => { setViewingHeat(null); onEditHeat(r); }}
          onDelete={(r) => { setViewingHeat(null); onDeleteHeat(r); }}
        />
      )}
    </div>
  );
}

function ListBlock({ items, empty, addLabel, onAdd, render }) {
  const { isReadOnly } = useContext(RoleContext);
  return (
    <div>
      {!isReadOnly && (
        <button onClick={onAdd} className="ff-body" style={{ width: '100%', border: `1.5px dashed ${C.brand}66`, background: C.brandSoft, color: C.brand, borderRadius: 12, padding: '10px 0', fontWeight: 700, fontSize: 14, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Plus size={15} /> {addLabel}
        </button>
      )}
      {items.length === 0 ? (
        <MutedNote text={empty} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{items.map(render)}</div>
      )}
    </div>
  );
}

// ---------- Milk screen ----------
function MilkScreen({ cows, milk, cowById, onAdd, onExport, onUpdateMilk, onDeleteMilk }) {
  const [date, setDate] = useState(todayStr());
  const [sessionFilter, setSessionFilter] = useState('Both');
  const [viewing, setViewing] = useState(null); // cowId whose day detail is open
  const dayEntries = milk.filter((m) => m.date === date).sort((a, b) => (a.session > b.session ? 1 : -1));
  const amEntries = dayEntries.filter((m) => m.session === 'AM');
  const pmEntries = dayEntries.filter((m) => m.session === 'PM');
  const entries = sessionFilter === 'Both' ? dayEntries : sessionFilter === 'AM' ? amEntries : pmEntries;
  const amTotal = amEntries.reduce((s, m) => s + Number(m.liters || 0), 0);
  const pmTotal = pmEntries.reduce((s, m) => s + Number(m.liters || 0), 0);
  const total = entries.reduce((s, m) => s + Number(m.liters || 0), 0);

  // For the combined "Both" view: one row per cow, with AM + PM + total together
  const combinedByCow = useMemo(() => {
    const map = {};
    dayEntries.forEach((m) => {
      if (!map[m.cowId]) map[m.cowId] = { cowId: m.cowId, am: null, pm: null };
      if (m.session === 'AM') map[m.cowId].am = Number(m.liters);
      else map[m.cowId].pm = Number(m.liters);
    });
    return Object.values(map)
      .map((r) => ({ ...r, total: (r.am || 0) + (r.pm || 0) }))
      .sort((a, b) => {
        const cowA = cowById(a.cowId), cowB = cowById(b.cowId);
        return (cowA?.name || '').localeCompare(cowB?.name || '');
      });
  }, [dayEntries]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderEntry = (m) => {
    const cow = cowById(m.cowId);
    return (
      <div key={m.id} onClick={() => setViewing(m.cowId)} style={rowCardStyle}>
        {cow && <EarTag number={cow.tagNumber} size="sm" />}
        <div style={{ flex: 1, marginLeft: 10 }}>
          <div className="ff-display" style={{ fontWeight: 700, fontSize: 14.5, color: C.ink }}>{cow ? cow.name : 'Unknown'}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: m.session === 'AM' ? C.milk : C.amber }}>{m.session} session</div>
        </div>
        <div className="ff-display" style={{ fontWeight: 700, fontSize: 16, color: C.milk }}>{m.liters} L</div>
        <ChevronRight size={16} color={C.grey} style={{ marginLeft: 6 }} />
      </div>
    );
  };

  const renderCombined = (r) => {
    const cow = cowById(r.cowId);
    return (
      <div key={r.cowId} onClick={() => setViewing(r.cowId)} style={{ ...rowCardStyle, alignItems: 'center' }}>
        {cow && <EarTag number={cow.tagNumber} size="sm" />}
        <div style={{ flex: 1, marginLeft: 10 }}>
          <div className="ff-display" style={{ fontWeight: 700, fontSize: 14.5, color: C.ink }}>{cow ? cow.name : 'Unknown'}</div>
          <div className="ff-body" style={{ fontSize: 13, marginTop: 2, fontWeight: 700 }}>
            <span style={{ color: C.milk }}>AM {r.am != null ? `${r.am} L` : '—'}</span>
            <span style={{ color: C.sub, fontWeight: 500 }}> &nbsp;·&nbsp; </span>
            <span style={{ color: C.amber }}>PM {r.pm != null ? `${r.pm} L` : '—'}</span>
          </div>
        </div>
        <div style={{ textAlign: 'center', background: C.milkSoft, borderRadius: 10, padding: '6px 10px', marginRight: 4 }}>
          <div className="ff-display" style={{ fontWeight: 700, fontSize: 19, color: C.milk }}>{r.total.toFixed(1)} L</div>
          <div style={{ fontSize: 11, color: C.milk, fontWeight: 600, opacity: 0.8 }}>total</div>
        </div>
        <ChevronRight size={16} color={C.grey} />
      </div>
    );
  };

  return (
    <div>
      <ScreenHeader
        title="Milk Records" subtitle="Daily yield by cow"
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <HeaderIconButton title="Print all milk records" icon={<Printer size={15} color="#fff" />} onClick={() => onExport('print')} />
            <HeaderIconButton title="Download CSV" icon={<Download size={15} color="#fff" />} onClick={() => onExport('csv')} />
          </div>
        }
      />
      <div style={{ padding: 16 }}>
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} max={todayStr()} />
        </Field>
        <Field label="Session">
          <Segmented options={['Both', 'AM', 'PM']} value={sessionFilter} onChange={setSessionFilter} />
        </Field>

        {sessionFilter === 'Both' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
            <div style={{ background: C.milkSoft, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: C.milk, fontWeight: 600 }}>AM total</div>
              <div className="ff-display" style={{ fontSize: 19, fontWeight: 700, color: C.milk }}>{amTotal.toFixed(1)} L</div>
            </div>
            <div style={{ background: C.milkSoft, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: C.milk, fontWeight: 600 }}>PM total</div>
              <div className="ff-display" style={{ fontSize: 19, fontWeight: 700, color: C.milk }}>{pmTotal.toFixed(1)} L</div>
            </div>
            <div style={{ background: C.milk, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#fff', fontWeight: 600, opacity: 0.85 }}>Day total</div>
              <div className="ff-display" style={{ fontSize: 19, fontWeight: 700, color: '#fff' }}>{total.toFixed(1)} L</div>
            </div>
          </div>
        ) : (
          <div style={{ background: C.milkSoft, borderRadius: 14, padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div className="ff-body" style={{ fontSize: 13, color: C.milk, fontWeight: 600 }}>
                Total for {fmtDate(date)} · {sessionFilter}
              </div>
              <div className="ff-display" style={{ fontSize: 26, fontWeight: 700, color: C.milk }}>{total.toFixed(1)} L</div>
            </div>
            <Droplet size={26} color={C.milk} />
          </div>
        )}

        {cows.length === 0 ? (
          <EmptyState icon={<Milk size={30} />} title="Add a cow first" subtitle="You'll need at least one cow profile before logging milk." />
        ) : sessionFilter === 'Both' ? (
          <>
            <SectionTitle title="Entries" />
            {combinedByCow.length === 0 ? (
              <MutedNote text="No milk logged for this date yet." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{combinedByCow.map(renderCombined)}</div>
            )}
          </>
        ) : (
          <>
            <SectionTitle title="Entries" />
            {entries.length === 0 ? (
              <MutedNote text={`No ${sessionFilter} milk logged for this date yet.`} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{entries.map(renderEntry)}</div>
            )}
          </>
        )}
      </div>
      {cows.length > 0 && <FAB onClick={onAdd} label="Log milk" />}
      {viewing && (
        <MilkDetailModal
          cow={cowById(viewing)}
          date={date}
          amRecord={amEntries.find((m) => m.cowId === viewing) || null}
          pmRecord={pmEntries.find((m) => m.cowId === viewing) || null}
          onUpdate={onUpdateMilk}
          onDelete={onDeleteMilk}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

// ---------- Heat screen ----------
function HeatScreen({ cows, heat, heatStatusFor, cowById, onAdd, onOpenCow, onEditHeat, onDeleteHeat }) {
  const rows = cows.map((c) => ({ cow: c, ...heatStatusFor(c) })).sort((a, b) => {
    const order = { overdue: 0, due: 1, upcoming: 2, pregnant: 3, none: 4 };
    return order[a.status] - order[b.status];
  });
  const recent = heat.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const [viewing, setViewing] = useState(null);

  return (
    <div>
      <ScreenHeader title="Heat Cycles" subtitle="Track cycles & breeding windows" />
      <div style={{ padding: 16 }}>
        <SectionTitle title="Cycle status" />
        {rows.length === 0 ? (
          <EmptyState icon={<HeartPulse size={30} />} title="No animals yet" subtitle="Add a cow or calf to start tracking heat cycles." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
            {rows.map(({ cow, status, nextDate, daysUntil }) => (
              <div key={cow.id} onClick={() => onOpenCow(cow.id)} style={rowCardStyle}>
                <EarTag number={cow.tagNumber} size="sm" />
                <div style={{ flex: 1, marginLeft: 10 }}>
                  <div className="ff-display" style={{ fontWeight: 700, fontSize: 14.5, color: C.ink }}>{cow.name}</div>
                  <div style={{ fontSize: 13, color: C.sub }}>
                    {status === 'pregnant' ? 'Pregnancy confirmed' : status === 'none' ? 'No heat recorded yet' : status === 'overdue' ? `Overdue by ${Math.abs(daysUntil)}d · expected ${fmtDateShort(nextDate)}` : `Next expected ${fmtDateShort(nextDate)}`}
                  </div>
                </div>
                {status !== 'none' && (
                  <Chip
                    bg={status === 'overdue' ? C.rustSoft : status === 'due' ? C.amberSoft : status === 'pregnant' ? C.greenSoft : C.greenSoft}
                    fg={status === 'overdue' ? C.rust : status === 'due' ? C.amber : C.green}
                  >
                    {status === 'overdue' ? 'Overdue' : status === 'due' ? 'Due soon' : status === 'pregnant' ? 'Pregnant' : `${daysUntil}d`}
                  </Chip>
                )}
              </div>
            ))}
          </div>
        )}

        <SectionTitle title="Recent entries" />
        {recent.length === 0 ? (
          <MutedNote text="No heat cycle entries logged yet." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recent.map((h) => {
              const cow = cowById(h.cowId);
              return (
                <div key={h.id} onClick={() => setViewing(h)} style={rowCardStyle}>
                  <div style={{ color: C.rust }}><HeartPulse size={16} /></div>
                  <div style={{ flex: 1, marginLeft: 10 }}>
                    <div className="ff-display" style={{ fontWeight: 700, fontSize: 14, color: C.ink }}>{cow ? cow.name : 'Unknown'}</div>
                    <div style={{ fontSize: 13, color: C.sub }}>{fmtDate(h.date)}{h.notes ? ` · ${h.notes}` : ''}</div>
                  </div>
                  {h.bred && <Chip bg={C.greenSoft} fg={C.green}>Bred</Chip>}
                  <ChevronRight size={16} color={C.grey} />
                </div>
              );
            })}
          </div>
        )}
      </div>
      {cows.length > 0 && <FAB onClick={onAdd} label="Log heat" />}
      {viewing && (
        <HeatDetailModal
          record={viewing}
          cow={cowById(viewing.cowId)}
          onClose={() => setViewing(null)}
          onEdit={(r) => { setViewing(null); onEditHeat(r); }}
          onDelete={(r) => { setViewing(null); onDeleteHeat(r); }}
        />
      )}
    </div>
  );
}

// ---------- Health screen ----------
function MilkDetailModal({ cow, date, amRecord, pmRecord, onUpdate, onDelete, onClose }) {
  const [editingSession, setEditingSession] = useState(null); // 'AM' | 'PM' | null
  const [value, setValue] = useState('');
  const [confirmDel, setConfirmDel] = useState(null); // record pending delete

  const startEdit = (session, record) => {
    setEditingSession(session);
    setValue(String(record.liters));
  };

  const saveEdit = (record) => {
    const n = Number(value);
    if (!isNaN(n) && n >= 0) onUpdate(record.id, n);
    setEditingSession(null);
  };

  if (confirmDel) {
    return (
      <Modal title="Delete this entry?" onClose={() => setConfirmDel(null)}>
        <div style={{ fontSize: 14, color: C.sub, marginBottom: 14 }}>
          This removes the {confirmDel.session} milk entry ({confirmDel.liters} L) for {fmtDate(date)}. This can't be undone.
        </div>
        <PrimaryButton danger onClick={() => { onDelete(confirmDel.id); setConfirmDel(null); onClose(); }}>Delete permanently</PrimaryButton>
      </Modal>
    );
  }

  const sessionRow = (label, record) => {
    const tone = label === 'AM' ? C.milk : C.amber;
    const toneSoft = label === 'AM' ? C.milkSoft : C.amberSoft;
    if (!record) {
      return (
        <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: tone }}>{label}</div>
          <div style={{ flex: 1, marginLeft: 10, fontSize: 13, color: C.sub }}>Not logged</div>
        </div>
      );
    }
    const isEditing = editingSession === label;
    return (
      <div style={{ background: toneSoft, borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: tone, width: 28 }}>{label}</div>
        <div style={{ flex: 1 }}>
          {isEditing ? (
            <input type="number" min={0} step="0.1" value={value} onChange={(e) => setValue(e.target.value)} style={{ ...inputStyle, padding: '7px 10px' }} autoFocus />
          ) : (
            <div className="ff-display" style={{ fontWeight: 700, fontSize: 19, color: tone }}>{record.liters} L</div>
          )}
        </div>
        {isEditing ? (
          <button onClick={() => saveEdit(record)} className="ff-body" style={{ background: C.brand, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 700 }}>
            Save
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => startEdit(label, record)} style={{ background: '#fff', border: 'none', borderRadius: 8, padding: 6 }}><Pencil size={13} color={C.ink} /></button>
            <button onClick={() => setConfirmDel({ ...record, session: label })} style={{ background: '#fff', border: 'none', borderRadius: 8, padding: 6 }}><Trash2 size={13} color={C.rust} /></button>
          </div>
        )}
      </div>
    );
  };

  return (
    <Modal title="Milk Entry" onClose={onClose}>
      {cow && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <EarTag number={cow.tagNumber} size="sm" />
          <div>
            <div className="ff-display" style={{ fontWeight: 700, fontSize: 15, color: C.ink }}>{cow.name}</div>
            <div style={{ fontSize: 13, color: C.sub }}>{fmtDate(date)}</div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sessionRow('AM', amRecord)}
        {sessionRow('PM', pmRecord)}
      </div>
    </Modal>
  );
}

function HeatDetailModal({ record, cow, onClose, onEdit, onDelete }) {
  const { isReadOnly } = useContext(RoleContext);
  const [confirmDel, setConfirmDel] = useState(false);
  if (!record) return null;
  if (confirmDel) {
    return (
      <Modal title="Delete this heat record?" onClose={() => setConfirmDel(false)}>
        <div style={{ fontSize: 14, color: C.sub, marginBottom: 14 }}>This removes the heat cycle entry from {fmtDate(record.date)}. This can't be undone.</div>
        <PrimaryButton danger onClick={() => onDelete(record)}>Delete permanently</PrimaryButton>
      </Modal>
    );
  }
  return (
    <Modal title="Heat Cycle Record" onClose={onClose}>
      {cow && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <EarTag number={cow.tagNumber} size="sm" />
          <div>
            <div className="ff-display" style={{ fontWeight: 700, fontSize: 15, color: C.ink }}>{cow.name}</div>
            <div style={{ fontSize: 13, color: C.sub }}>{cow.breed}</div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
        <DetailRow label="Date observed" value={fmtDate(record.date)} />
        <DetailRow label="Bred / inseminated" value={record.bred ? 'Yes' : 'No'} />
        {record.notes && <DetailRow label="Notes" value={record.notes} />}
      </div>
      {!isReadOnly && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onEdit(record)} className="ff-body" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: C.brandSoft, color: C.brand, border: 'none', borderRadius: 10, padding: '10px 0', fontSize: 14, fontWeight: 700 }}>
            <Pencil size={14} /> Edit
          </button>
          <button onClick={() => setConfirmDel(true)} className="ff-body" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: C.rustSoft, color: C.rust, border: 'none', borderRadius: 10, padding: '10px 0', fontSize: 14, fontWeight: 700 }}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}
    </Modal>
  );
}

function HealthDetailModal({ record, cow, onClose, onSaveComplete, onEdit, onDelete }) {
  const { isReadOnly } = useContext(RoleContext);
  const [completed, setCompleted] = useState(!!record?.completed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  if (!record) return null;

  if (confirmDel) {
    return (
      <Modal title="Delete this health record?" onClose={() => setConfirmDel(false)}>
        <div style={{ fontSize: 14, color: C.sub, marginBottom: 14 }}>This removes the {record.type.toLowerCase()} record from {fmtDate(record.date)}. This can't be undone.</div>
        <PrimaryButton danger onClick={() => onDelete(record)}>Delete permanently</PrimaryButton>
      </Modal>
    );
  }

  const dirty = completed !== !!record.completed;

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await onSaveComplete(record, completed);
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch (e) {
      setError(e?.message || 'Could not save. Please check your connection and try again.');
    }
    setBusy(false);
  };

  return (
    <Modal title="Health Record" onClose={onClose}>
      {cow && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <EarTag number={cow.tagNumber} size="sm" />
          <div>
            <div className="ff-display" style={{ fontWeight: 700, fontSize: 15, color: C.ink }}>{cow.name}</div>
            <div style={{ fontSize: 13, color: C.sub }}>{cow.breed}</div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: record.nextDueDate ? 18 : 0 }}>
        <DetailRow label="Date" value={fmtDate(record.date)} />
        <DetailRow label="Type" value={record.type} />
        {record.medicine && <DetailRow label="Medicine used" value={record.medicine} />}
        {record.description && <DetailRow label="Details" value={record.description} />}
        {record.vet && <DetailRow label="Vet / attended by" value={record.vet} />}
        {record.nextDueDate && (
          <div>
            <div className="ff-body" style={{ fontSize: 12.5, fontWeight: 600, color: C.sub, marginBottom: 2 }}>Next follow-up</div>
            <div className="ff-body" style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.5 }}>{fmtDate(record.nextDueDate)}</div>
          </div>
        )}
      </div>
      {!isReadOnly && (
        <div style={{ display: 'flex', gap: 8, marginBottom: record.nextDueDate ? 12 : 0 }}>
          <button onClick={() => onEdit(record)} className="ff-body" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: C.brandSoft, color: C.brand, border: 'none', borderRadius: 10, padding: '10px 0', fontSize: 14, fontWeight: 700 }}>
            <Pencil size={14} /> Edit
          </button>
          <button onClick={() => setConfirmDel(true)} className="ff-body" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: C.rustSoft, color: C.rust, border: 'none', borderRadius: 10, padding: '10px 0', fontSize: 14, fontWeight: 700 }}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}
      {record.nextDueDate && (
        <>
          <button
            type="button"
            onClick={() => setCompleted(!completed)}
            className="ff-body"
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              border: `1.5px solid ${completed ? C.green : C.line}`, background: completed ? C.greenSoft : '#fff',
              borderRadius: 10, padding: '11px 12px', marginBottom: 12,
            }}
          >
            <div style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${completed ? C.green : C.grey}`, background: completed ? C.green : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {completed && <Check size={13} color="#fff" />}
            </div>
            <span style={{ fontSize: 14.5, fontWeight: 600, color: completed ? C.green : C.ink }}>This follow-up is completed</span>
          </button>

          {error && <div style={{ background: C.rustSoft, color: C.rust, borderRadius: 10, padding: 10, fontSize: 13.5, marginBottom: 12 }}>{error}</div>}

          <PrimaryButton disabled={busy || !dirty} onClick={save}>
            {busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
          </PrimaryButton>
        </>
      )}
    </Modal>
  );
}

function DetailRow({ label, value }) {
  return (
    <div>
      <div className="ff-body" style={{ fontSize: 12.5, fontWeight: 600, color: C.sub, marginBottom: 2 }}>{label}</div>
      <div className="ff-body" style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}

function HealthScreen({
  medical, cowById, onAdd, onExport, onToggleComplete, onEditMedical, onDeleteMedical,
  medicineTypes, medicineTransactions, onAddMedicineType, onEditMedicineType, onDeleteMedicineType,
  onLogMedicineTxn, onUpdateMedicineTxn, onDeleteMedicineTxn, onExportMedicine,
}) {
  const [view, setView] = useState('records'); // 'records' | 'stock'
  const rows = medical.slice().sort((a, b) => b.date.localeCompare(a.date));
  const [viewing, setViewing] = useState(null);

  if (view === 'stock') {
    return (
      <MedicineStockView
        medicineTypes={medicineTypes} medicineTransactions={medicineTransactions}
        onBackToRecords={() => setView('records')}
        onAddType={onAddMedicineType} onEditType={onEditMedicineType} onDeleteType={onDeleteMedicineType}
        onLogTxn={onLogMedicineTxn} onUpdateTxn={onUpdateMedicineTxn} onDeleteTxn={onDeleteMedicineTxn}
        onExport={onExportMedicine}
      />
    );
  }

  return (
    <div>
      <ScreenHeader
        title="Health Records" subtitle="Vaccinations, treatments & checkups"
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <HeaderIconButton title="Print all health records" icon={<Printer size={15} color="#fff" />} onClick={() => onExport('print')} />
            <HeaderIconButton title="Download CSV" icon={<Download size={15} color="#fff" />} onClick={() => onExport('csv')} />
          </div>
        }
      />
      <div style={{ padding: 16 }}>
        <div style={{ marginBottom: 14 }}>
          <Segmented options={['Records', 'Medicine Stock']} value="Records" onChange={(v) => setView(v === 'Records' ? 'records' : 'stock')} />
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={<Stethoscope size={30} />} title="No health records" subtitle="Log vaccinations, treatments, and checkups to keep every cow's history in one place." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map((m) => {
              const cow = cowById(m.cowId);
              const overdue = m.nextDueDate && !m.completed && diffDays(m.nextDueDate) < 0;
              const soon = m.nextDueDate && !m.completed && diffDays(m.nextDueDate) >= 0 && diffDays(m.nextDueDate) <= 7;
              return (
                <div key={m.id} onClick={() => setViewing(m)} style={{ ...rowCardStyle, alignItems: 'flex-start' }}>
                  {cow && <EarTag number={cow.tagNumber} size="sm" />}
                  <div style={{ flex: 1, marginLeft: 10 }}>
                    <div className="ff-display" style={{ fontWeight: 700, fontSize: 14.5, color: C.ink }}>{cow ? cow.name : 'Unknown'} · {m.type}</div>
                    <div style={{ fontSize: 13, color: C.sub, marginTop: 1 }}>{fmtDate(m.date)}{m.vet ? ` · ${m.vet}` : ''}</div>
                    {m.medicine && <div style={{ fontSize: 13, color: C.ink, marginTop: 4 }}>Medicine: {m.medicine}</div>}
                    {m.nextDueDate && (
                      <div style={{ marginTop: 5 }}>
                        {m.completed ? (
                          <Chip bg={C.greenSoft} fg={C.green}>Completed</Chip>
                        ) : (
                          <Chip bg={overdue ? C.rustSoft : soon ? C.amberSoft : C.greySoft} fg={overdue ? C.rust : soon ? C.amber : C.grey}>
                            {overdue ? 'Follow-up overdue' : `Follow-up ${fmtDateShort(m.nextDueDate)}`}
                          </Chip>
                        )}
                      </div>
                    )}
                  </div>
                  <ChevronRight size={16} color={C.grey} />
                </div>
              );
            })}
          </div>
        )}
      </div>
      {viewing && (
        <HealthDetailModal
          record={viewing}
          cow={cowById(viewing.cowId)}
          onClose={() => setViewing(null)}
          onSaveComplete={async (r, completed) => { await onToggleComplete(r, completed); setViewing({ ...r, completed }); }}
          onEdit={(r) => { setViewing(null); onEditMedical(r); }}
          onDelete={(r) => { setViewing(null); onDeleteMedical(r); }}
        />
      )}
      <FAB onClick={onAdd} label="Add record" />
    </div>
  );
}

function MedicineStockView({ medicineTypes, medicineTransactions, onBackToRecords, onAddType, onEditType, onDeleteType, onLogTxn, onUpdateTxn, onDeleteTxn, onExport }) {
  const { isReadOnly } = useContext(RoleContext);
  const [viewingTxn, setViewingTxn] = useState(null);
  const month = currentMonthStr();
  const recent = medicineTransactions.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  return (
    <div>
      <ScreenHeader
        title="Medicine Stock" subtitle={monthLabel(month)}
        onBack={onBackToRecords}
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <HeaderIconButton title="Print medicine report" icon={<Printer size={15} color="#fff" />} onClick={() => onExport('print')} />
            <HeaderIconButton title="Download CSV" icon={<Download size={15} color="#fff" />} onClick={() => onExport('csv')} />
          </div>
        }
      />
      <div style={{ padding: 16 }}>
        <div style={{ marginBottom: 14 }}>
          <Segmented options={['Records', 'Medicine Stock']} value="Medicine Stock" onChange={(v) => v === 'Records' && onBackToRecords()} />
        </div>

        <SectionTitle title="Medicines" />
        {medicineTypes.length === 0 ? (
          <EmptyState icon={<Syringe size={30} />} title="No medicines added yet" subtitle="Add each medicine you keep on hand to start tracking stock levels and running-low alerts." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
            {medicineTypes.map((mt) => {
              const stock = medicineStock(mt.id, medicineTransactions);
              const purchasedAll = medicineTotalPurchased(mt.id, medicineTransactions);
              const usedAll = medicineTotalUsed(mt.id, medicineTransactions);
              const boughtThisMonth = medicineMonthPurchased(mt.id, medicineTransactions, month);
              const outOfStock = stock <= 0;
              const low = !outOfStock && stock <= Number(mt.lowStockThreshold || 5);
              return (
                <div key={mt.id} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div>
                      <div className="ff-display" style={{ fontWeight: 700, fontSize: 15.5, color: C.ink }}>{mt.name}</div>
                      <div style={{ fontSize: 13, color: C.sub, marginTop: 1 }}>{mt.costPerUnit ? `₹${mt.costPerUnit} / ${mt.unit}` : mt.unit}</div>
                    </div>
                    {!isReadOnly && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => onEditType(mt.id)} style={{ background: C.greySoft, border: 'none', borderRadius: 8, padding: 5 }}><Pencil size={13} color={C.ink} /></button>
                        <button onClick={() => onDeleteType(mt.id)} style={{ background: C.greySoft, border: 'none', borderRadius: 8, padding: 5 }}><Trash2 size={13} color={C.ink} /></button>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, margin: '12px 0' }}>
                    <div>
                      <div className="ff-display" style={{ fontWeight: 700, fontSize: 19, color: outOfStock ? C.rust : low ? C.amber : C.ink }}>{stock}</div>
                      <div style={{ fontSize: 12, color: C.sub }}>{mt.unit} left</div>
                    </div>
                    <div>
                      <div className="ff-display" style={{ fontWeight: 700, fontSize: 16, color: C.ink }}>{purchasedAll}</div>
                      <div style={{ fontSize: 12, color: C.sub }}>Purchased</div>
                    </div>
                    <div>
                      <div className="ff-display" style={{ fontWeight: 700, fontSize: 16, color: C.ink }}>{usedAll}</div>
                      <div style={{ fontSize: 12, color: C.sub }}>Used</div>
                    </div>
                  </div>

                  {outOfStock ? (
                    <div style={{ marginBottom: 10 }}><Chip bg={C.rustSoft} fg={C.rust}>Out of stock</Chip></div>
                  ) : low ? (
                    <div style={{ marginBottom: 10 }}><Chip bg={C.amberSoft} fg={C.amber}>Running low</Chip></div>
                  ) : boughtThisMonth > 0 ? (
                    <div style={{ marginBottom: 10 }}><Chip bg={C.greenSoft} fg={C.green}>{boughtThisMonth} {mt.unit} bought this month</Chip></div>
                  ) : null}

                  {!isReadOnly && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => onLogTxn(mt.id, 'purchase')} className="ff-body" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: C.greenSoft, color: C.green, border: 'none', borderRadius: 9, padding: '8px 0', fontSize: 13, fontWeight: 700 }}>
                        <PackagePlus size={13} /> Log purchase
                      </button>
                      <button onClick={() => onLogTxn(mt.id, 'usage')} className="ff-body" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: C.greySoft, color: C.ink, border: 'none', borderRadius: 9, padding: '8px 0', fontSize: 13, fontWeight: 700 }}>
                        <PackageMinus size={13} /> Log usage
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <SectionTitle title="Recent transactions" />
        {recent.length === 0 ? (
          <MutedNote text="No medicine purchases or usage logged yet." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recent.map((t) => {
              const mt = medicineTypes.find((x) => x.id === t.medicineTypeId);
              return (
                <div key={t.id} onClick={() => setViewingTxn(t)} style={rowCardStyle}>
                  <div style={{ color: t.kind === 'purchase' ? C.green : C.grey }}>
                    {t.kind === 'purchase' ? <PackagePlus size={16} /> : <PackageMinus size={16} />}
                  </div>
                  <div style={{ flex: 1, marginLeft: 10 }}>
                    <div className="ff-display" style={{ fontWeight: 700, fontSize: 14, color: C.ink }}>{mt ? mt.name : 'Unknown'} · {t.quantity} {mt ? mt.unit : ''}</div>
                    <div style={{ fontSize: 13, color: C.sub }}>{fmtDate(t.date)} · {t.kind === 'purchase' ? `Purchased${t.cost ? ` · ₹${t.cost}` : ''}` : 'Used'}</div>
                  </div>
                  <ChevronRight size={16} color={C.grey} />
                </div>
              );
            })}
          </div>
        )}
      </div>
      {!isReadOnly && <FAB onClick={onAddType} label="Add medicine" />}
      {viewingTxn && (
        <MedicineTxnDetailModal
          record={viewingTxn}
          medicineType={medicineTypes.find((m) => m.id === viewingTxn.medicineTypeId)}
          onClose={() => setViewingTxn(null)}
          onUpdate={(id, data) => { onUpdateTxn(id, data); setViewingTxn(null); }}
          onDelete={(id) => { onDeleteTxn(id); setViewingTxn(null); }}
        />
      )}
    </div>
  );
}

// ================= FORMS =================
function ClearableDate({ value, onChange, max }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, flex: 1 }} max={max} />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="ff-body"
          style={{ background: C.greySoft, border: 'none', borderRadius: 9, padding: '10px 12px', fontSize: 13, fontWeight: 700, color: C.ink, flexShrink: 0 }}
        >
          Clear
        </button>
      )}
    </div>
  );
}

function CowForm({ initial, defaultStatus, defaultMotherId, cows, onClose, onSave }) {
  const [name, setName] = useState(initial?.name || '');
  const [tagNumber, setTagNumber] = useState(initial?.tagNumber || '');
  const [breed, setBreed] = useState(initial?.breed || BREEDS[0]);
  const [gender, setGender] = useState(initial?.gender || 'Female');
  const [dob, setDob] = useState(initial?.dob || '');
  const [status, setStatus] = useState(initial?.status || defaultStatus || 'active');
  const [cycleLength, setCycleLength] = useState(initial?.cycleLength || 21);
  const [motherCowId, setMotherCowId] = useState(initial?.motherCowId || defaultMotherId || '');
  const [birthWeight, setBirthWeight] = useState(initial?.birthWeight ?? '');
  const [calvingDate, setCalvingDate] = useState(initial?.calvingDate || '');
  const [firstHeatDate, setFirstHeatDate] = useState(initial?.firstHeatDate || '');
  const [inseminatedOn, setInseminatedOn] = useState(initial?.inseminatedOn || '');
  const [pregnancyConfirmed, setPregnancyConfirmed] = useState(initial?.pregnancyConfirmed || false);
  const [mastitisAntibiotic, setMastitisAntibiotic] = useState(initial?.mastitisAntibiotic || '');
  const [insured, setInsured] = useState(initial?.insured || false);
  const [insuranceStartDate, setInsuranceStartDate] = useState(initial?.insuranceStartDate || '');
  const [insuranceExpiryDate, setInsuranceExpiryDate] = useState(initial?.insuranceExpiryDate || '');
  const valid = name.trim() && tagNumber.trim();
  const expectedCalving = pregnancyConfirmed && inseminatedOn ? addMonths(inseminatedOn, 9) : '';
  const isCalf = status === 'calf';
  const isHeifer = status === 'heifer';
  const isYoungStock = isCalf || isHeifer;
  const motherOptions = (cows || []).filter((c) => !initial || c.id !== initial.id);

  return (
    <Modal title={initial ? 'Edit Animal' : isCalf ? 'Add Calf' : isHeifer ? 'Add Heifer' : 'Add Cow'} onClose={onClose}>
      <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ganga" style={inputStyle} /></Field>
      <Field label="Ear tag number"><input value={tagNumber} onChange={(e) => setTagNumber(e.target.value)} placeholder="e.g. 014" style={inputStyle} /></Field>
      <Field label="Breed"><Segmented options={BREEDS} value={breed} onChange={setBreed} /></Field>
      <Field label="Status">
        <Segmented
          options={['active', 'dry', 'heifer', 'calf', 'sold']}
          value={status} onChange={setStatus}
          labels={{ active: 'Milking', dry: 'Dry', heifer: 'Heifer', calf: 'Calf', sold: 'Sold' }}
        />
        {isHeifer && (
          <div className="ff-body" style={{ fontSize: 12.5, color: C.sub, marginTop: 6 }}>
            A heifer is a grown calf that's old enough to breed — she'll now show up in the Heat Cycles section.
          </div>
        )}
      </Field>

      {isYoungStock && (
        <>
          <Field label="Gender"><Segmented options={['Female', 'Male']} value={gender} onChange={setGender} /></Field>
          <Field label="Mother (optional)">
            <select value={motherCowId} onChange={(e) => setMotherCowId(e.target.value)} style={inputStyle}>
              <option value="">Not recorded</option>
              {motherOptions.map((c) => <option key={c.id} value={c.id}>{c.name} (#{c.tagNumber})</option>)}
            </select>
          </Field>
          <Field label="Birth weight in kg (optional)">
            <input type="number" min={0} step="0.1" value={birthWeight} onChange={(e) => setBirthWeight(e.target.value)} placeholder="e.g. 28" style={inputStyle} />
          </Field>
        </>
      )}

      <Field label="Date of birth"><ClearableDate value={dob} onChange={setDob} max={todayStr()} /></Field>

      {!isCalf && (
        <>
          <Field label="Average heat cycle length (days)">
            <input type="number" min={15} max={30} value={cycleLength} onChange={(e) => setCycleLength(Number(e.target.value))} style={inputStyle} />
          </Field>
          <Field label="Date of last calving (optional)">
            <ClearableDate value={calvingDate} onChange={setCalvingDate} max={todayStr()} />
          </Field>
          <Field label="Date of first heat after calving (optional)">
            <ClearableDate value={firstHeatDate} onChange={setFirstHeatDate} max={todayStr()} />
          </Field>
          <Field label="Inseminated on (optional)">
            <ClearableDate value={inseminatedOn} onChange={setInseminatedOn} max={todayStr()} />
            <div className="ff-body" style={{ fontSize: 12.5, color: C.sub, marginTop: 5 }}>You'll get a reminder 20 days after this date to check for repeat heat / pregnancy.</div>
          </Field>
          <Field label="Pregnancy confirmed?">
            <button
              type="button"
              onClick={() => setPregnancyConfirmed(!pregnancyConfirmed)}
              disabled={!inseminatedOn}
              style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1.5px solid ${pregnancyConfirmed ? C.green : C.line}`, background: pregnancyConfirmed ? C.greenSoft : '#fff', borderRadius: 10, padding: '9px 12px', opacity: inseminatedOn ? 1 : 0.5, width: '100%' }}
            >
              <div style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${pregnancyConfirmed ? C.green : C.grey}`, background: pregnancyConfirmed ? C.green : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {pregnancyConfirmed && <Check size={12} color="#fff" />}
              </div>
              <span className="ff-body" style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>
                {inseminatedOn ? 'Yes, pregnancy confirmed' : 'Add an insemination date first'}
              </span>
            </button>
            {expectedCalving && (
              <div className="ff-body" style={{ fontSize: 13, color: C.green, marginTop: 8, background: C.greenSoft, borderRadius: 9, padding: '8px 10px' }}>
                Expected calving: <strong>{fmtDate(expectedCalving)}</strong> (9 months from insemination)
              </div>
            )}
          </Field>
        </>
      )}

      {!isCalf && (
        <Field label="Antibiotic used for mastitis (optional)">
          <input value={mastitisAntibiotic} onChange={(e) => setMastitisAntibiotic(e.target.value)} placeholder="e.g. Amoxicillin" style={inputStyle} />
        </Field>
      )}

      <Field label="Insured?">
        <button
          type="button"
          onClick={() => setInsured(!insured)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1.5px solid ${insured ? C.green : C.line}`, background: insured ? C.greenSoft : '#fff', borderRadius: 10, padding: '9px 12px', width: '100%' }}
        >
          <div style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${insured ? C.green : C.grey}`, background: insured ? C.green : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {insured && <Check size={12} color="#fff" />}
          </div>
          <span className="ff-body" style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>Yes, this animal is insured</span>
        </button>
      </Field>
      {insured && (
        <>
          <Field label="Insurance start date (optional)">
            <ClearableDate value={insuranceStartDate} onChange={setInsuranceStartDate} max={todayStr()} />
          </Field>
          <Field label="Insurance expiry date (optional)">
            <ClearableDate value={insuranceExpiryDate} onChange={setInsuranceExpiryDate} />
            <div className="ff-body" style={{ fontSize: 12.5, color: C.sub, marginTop: 5 }}>You'll see a reminder starting 1 month before this date.</div>
          </Field>
        </>
      )}

      <PrimaryButton
        disabled={!valid}
        onClick={() => onSave({
          name: name.trim(), tagNumber: tagNumber.trim(), breed, gender: isYoungStock ? gender : '', dob, status, cycleLength,
          motherCowId: isYoungStock ? motherCowId : '', birthWeight: isYoungStock && birthWeight !== '' ? Number(birthWeight) : '',
          calvingDate, firstHeatDate, inseminatedOn, pregnancyConfirmed: !!(pregnancyConfirmed && inseminatedOn),
          mastitisAntibiotic: mastitisAntibiotic.trim(),
          insured, insuranceStartDate: insured ? insuranceStartDate : '', insuranceExpiryDate: insured ? insuranceExpiryDate : '',
        })}
      >
        {initial ? 'Save changes' : isCalf ? 'Add calf' : isHeifer ? 'Add heifer' : 'Add cow'}
      </PrimaryButton>
    </Modal>
  );
}

function CowPicker({ cows, value, onChange }) {
  return (
    <Field label="Cow">
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        <option value="" disabled>Select a cow</option>
        {cows.map((c) => <option key={c.id} value={c.id}>{c.name} (#{c.tagNumber})</option>)}
      </select>
    </Field>
  );
}

function MilkForm({ cows, milk, defaultCowId, onClose, onSave }) {
  const [cowId, setCowId] = useState(defaultCowId || '');
  const [date, setDate] = useState(todayStr());
  const [session, setSession] = useState('AM');
  const [liters, setLiters] = useState('');
  const valid = cowId && liters !== '' && Number(liters) >= 0;

  const existing = (milk || []).find((m) => m.cowId === cowId && m.date === date && m.session === session);

  useEffect(() => {
    setLiters(existing ? String(existing.liters) : '');
  }, [cowId, date, session]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal title="Log Milk" onClose={onClose}>
      {!defaultCowId && <CowPicker cows={cows} value={cowId} onChange={setCowId} />}
      <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} max={todayStr()} /></Field>
      <Field label="Session"><Segmented options={['AM', 'PM']} value={session} onChange={setSession} /></Field>
      <Field label="Liters"><input type="number" min={0} step="0.1" value={liters} onChange={(e) => setLiters(e.target.value)} placeholder="e.g. 8.5" style={inputStyle} /></Field>
      {existing && (
        <div className="ff-body" style={{ fontSize: 13, color: C.sub, marginTop: -8, marginBottom: 14 }}>
          Already logged for this session — saving will update this entry instead of creating a new one.
        </div>
      )}
      <PrimaryButton disabled={!valid} onClick={() => onSave({ cowId, date, session, liters: Number(liters), existingId: existing ? existing.id : null })}>
        {existing ? 'Update entry' : 'Save entry'}
      </PrimaryButton>
    </Modal>
  );
}

// ---------- Voice recorder (used by voice milk entry) ----------
function useVoiceRecorder({ maxSeconds = 60, onAudio, onProblem }) {
  const [state, setState] = useState('idle'); // 'idle' | 'recording'
  const [secs, setSecs] = useState(0);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startedRef = useRef(0);
  const cancelRef = useRef(false);
  const cb = useRef({});
  cb.current = { onAudio, onProblem };
  const supported = typeof window !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && typeof window.MediaRecorder !== 'undefined';

  const release = () => {
    clearInterval(timerRef.current);
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  };
  // Turn the microphone off if the screen is closed while recording
  useEffect(() => () => {
    cancelRef.current = true;
    try { if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop(); } catch (e) { /* ignore */ }
    release();
  }, []);

  const stop = (cancel) => {
    cancelRef.current = !!cancel;
    clearInterval(timerRef.current);
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') r.stop();
    else { release(); setState('idle'); }
  };

  const start = async () => {
    if (state !== 'idle') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const mimeType = pickRecorderMime();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      cancelRef.current = false;
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const ms = Date.now() - startedRef.current;
        const mime = recorder.mimeType || mimeType || 'audio/webm';
        release();
        setState('idle');
        if (cancelRef.current) return;
        if (ms < 800 || chunksRef.current.length === 0) {
          if (cb.current.onProblem) cb.current.onProblem("I didn't catch that — tap the mic, speak for a moment, then tap Done.");
          return;
        }
        if (cb.current.onAudio) cb.current.onAudio({ blob: new Blob(chunksRef.current, { type: mime }), mime, seconds: ms / 1000 });
      };
      recorderRef.current = recorder;
      recorder.start();
      startedRef.current = Date.now();
      setSecs(0);
      setState('recording');
      timerRef.current = setInterval(() => {
        const s = Math.floor((Date.now() - startedRef.current) / 1000);
        setSecs(s);
        if (s >= maxSeconds) stop(false);
      }, 250);
    } catch (err) {
      release();
      const n = err && err.name;
      if (cb.current.onProblem) {
        cb.current.onProblem(
          n === 'NotAllowedError' || n === 'SecurityError'
            ? 'Microphone access is blocked. Allow the microphone for this site in your browser settings, then try again.'
            : n === 'NotFoundError'
              ? 'No microphone was found on this device.'
              : "Couldn't start the microphone. Please try again."
        );
      }
    }
  };

  return { state, secs, start, stop, supported };
}

// ---------- Voice milk entry: matching spoken names to real cows ----------
// Speech recognition spells Indian names in many ways (Laxmi/Lakshmi, Radhe/Radha), so names are
// compared by sound-alike keys rather than exact spelling.
const nameKey = (s) => {
  let t = String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  t = t.replace(/[^a-z\u0C80-\u0CFF]/g, '');
  return t
    .replace(/x/g, 'ks').replace(/ph/g, 'f').replace(/(kh|gh|dh|th|bh|jh)/g, (m) => m[0])
    .replace(/sh/g, 's').replace(/ow|ou/g, 'au').replace(/w/g, 'v').replace(/z/g, 'j').replace(/c/g, 'k').replace(/q/g, 'k')
    .replace(/ee/g, 'i').replace(/oo/g, 'u').replace(/y$/, 'i').replace(/(.)\1+/g, '$1');
};
const editDistance = (a, b) => {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
};
const nameScore = (spoken, real) => {
  const a = nameKey(spoken), b = nameKey(real);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const sim = (x, y) => 1 - editDistance(x, y) / Math.max(x.length, y.length);
  const skel = (k) => k[0] + k.slice(1).replace(/[aeiou]/g, ''); // consonant skeleton: ignores vowel slips
  const sa = skel(a), sb = skel(b);
  const skelSim = sa.length >= 2 && sb.length >= 2 ? sim(sa, sb) * 0.9 : 0;
  return Math.max(sim(a, b), skelSim);
};
const sameTag = (a, b) => {
  const x = String(a || '').replace(/\D/g, '').replace(/^0+/, '');
  const y = String(b || '').replace(/\D/g, '').replace(/^0+/, '');
  return !!x && x === y;
};
// -> { cowId, conf: 'high' | 'uncertain' | 'none' }
function matchSpokenCow(entry, cows) {
  if (entry.tag) {
    const hit = cows.find((c) => sameTag(c.tagNumber, entry.tag));
    if (hit) return { cowId: hit.id, conf: 'high' };
  }
  const scored = cows
    .map((c) => ({ c, s: Math.max(nameScore(entry.name_latin, c.name), nameScore(entry.heard, c.name)) }))
    .sort((x, y) => y.s - x.s);
  const best = scored[0], second = scored[1];
  if (!best || best.s < 0.55) return { cowId: '', conf: 'none' };
  const clear = best.s >= 0.85 && (!second || best.s - second.s >= 0.08);
  return { cowId: best.c.id, conf: clear ? 'high' : 'uncertain' };
}


function buildVoiceRows(entries, cows) {
  const stamp = Date.now();
  return entries.map((e, i) => {
    const m = matchSpokenCow(e, cows);
    return { key: `${stamp}-${i}`, heard: String(e.heard || e.name_latin || e.tag || '').slice(0, 40), cowId: m.cowId, conf: m.conf, liters: String(e.liters) };
  });
}

// Review screen shown after speaking: fix anything wrong, then save.
function MilkVoiceReview({ cows, milk, date, session, setDate, setSession, heard, rows, setRows, onSpeakAgain, onBackToList, onSave, onClose }) {
  const r1 = (n) => Math.round(Number(n || 0) * 10) / 10;
  const cowById = Object.fromEntries(cows.map((c) => [c.id, c]));
  const update = (i, patch) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const remove = (i) => setRows((rs) => rs.filter((_, k) => k !== i));
  const counts = {};
  rows.forEach((r) => { if (r.cowId) counts[r.cowId] = (counts[r.cowId] || 0) + 1; });

  const usualFor = (cowId) => {
    const past = milk.filter((m) => m.cowId === cowId && m.session === session && m.date !== date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
    return past.length ? past.reduce((s, m) => s + Number(m.liters || 0), 0) / past.length : 0;
  };
  const notesFor = (r) => {
    const out = [];
    const cow = cowById[r.cowId];
    const lit = Number(r.liters);
    if (r.conf === 'uncertain') out.push({ tone: 'warn', text: `Heard “${r.heard}” — please confirm the cow` });
    if (!r.cowId) out.push({ tone: 'bad', text: `Couldn't match “${r.heard}” — choose the cow or remove this line` });
    if (cow && counts[r.cowId] > 1) out.push({ tone: 'warn', text: 'Mentioned more than once — the last value is used' });
    if (cow && r.liters !== '' && Number.isFinite(lit)) {
      const avg = usualFor(r.cowId);
      if (lit > 30) out.push({ tone: 'warn', text: 'That is a lot for one cow — check the number' });
      else if (avg >= 2 && lit > Math.max(avg * 1.8, avg + 6)) out.push({ tone: 'warn', text: `Higher than usual (usually about ${r1(avg)} L)` });
      else if (avg >= 2 && lit < avg * 0.35) out.push({ tone: 'warn', text: `Lower than usual (usually about ${r1(avg)} L)` });
      const existing = milk.find((m) => m.cowId === r.cowId && m.date === date && m.session === session);
      if (existing) out.push({ tone: 'info', text: `Replaces ${existing.liters} L already saved` });
    }
    return out;
  };

  const rowValid = (r) => !!r.cowId && r.liters !== '' && Number.isFinite(Number(r.liters)) && Number(r.liters) >= 0;
  const invalid = rows.length === 0 || rows.some((r) => !rowValid(r));
  const byCow = new Map();
  rows.forEach((r) => { if (rowValid(r)) byCow.set(r.cowId, Number(r.liters)); }); // last one wins
  const total = [...byCow.values()].reduce((s, v) => s + v, 0);
  const notMentioned = cows.filter((c) => !byCow.has(c.id));
  const buildEntries = () => [...byCow.entries()].map(([cowId, liters]) => {
    const existing = milk.find((m) => m.cowId === cowId && m.date === date && m.session === session);
    return { cowId, liters: Math.round(liters * 100) / 100, existingId: existing ? existing.id : null };
  });
  const toneStyle = { warn: { color: C.amber }, bad: { color: C.rust }, info: { color: C.sub } };

  return (
    <Modal title="Check before saving" onClose={onClose}>
      <div className="ff-body" style={{ background: C.greySoft, borderRadius: 12, padding: '9px 12px', fontSize: 13.5, color: C.sub, marginBottom: 12, lineHeight: 1.45 }}>
        <b style={{ color: C.ink }}>I heard:</b> “{heard}”
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} max={todayStr()} style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
        <Segmented options={['AM', 'PM']} value={session} onChange={setSession} />
      </div>

      {rows.map((r, i) => {
        const cow = cowById[r.cowId];
        const notes = notesFor(r);
        const attention = r.conf !== 'high' || !r.cowId;
        return (
          <div key={r.key} style={{ background: attention ? '#FFF7E6' : '#fff', border: `1px solid ${attention ? '#F2B544' : C.line}`, borderRadius: 14, padding: '8px 10px', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {cow ? <CowAvatar size={40} status={cow.status} radius={12} /> : <div style={{ width: 40, height: 40, borderRadius: 12, background: C.greySoft, flexShrink: 0 }} />}
              <select
                value={r.cowId}
                onChange={(e) => update(i, { cowId: e.target.value, conf: e.target.value ? 'high' : 'none' })}
                aria-label="Cow"
                style={{ ...inputStyle, flex: 1, minWidth: 0, padding: '8px 8px', fontSize: 15, fontWeight: 700 }}
              >
                <option value="">Choose cow…</option>
                {cows.map((c) => <option key={c.id} value={c.id}>{c.name} (#{c.tagNumber})</option>)}
              </select>
              <input
                type="number" min={0} step="0.1" value={r.liters} aria-label="Litres"
                onChange={(e) => update(i, { liters: e.target.value })}
                style={{ ...inputStyle, width: 68, textAlign: 'right', padding: '8px 8px' }}
              />
              <span className="ff-body" style={{ fontSize: 13, color: C.sub }}>L</span>
              <button onClick={() => remove(i)} aria-label="Remove this line" style={{ background: 'none', border: 'none', padding: 4, display: 'flex' }}>
                <X size={18} color={C.grey} />
              </button>
            </div>
            {notes.map((n, k) => (
              <div key={k} className="ff-body" style={{ fontSize: 12.5, fontWeight: 600, marginTop: 5, marginLeft: 48, ...toneStyle[n.tone] }}>{n.text}</div>
            ))}
          </div>
        );
      })}
      {rows.length === 0 && <MutedNote text="All lines were removed. Tap “Speak again” or go back to the list." />}

      {notMentioned.length > 0 && (
        <div className="ff-body" style={{ fontSize: 13.5, color: C.sub, margin: '4px 2px 10px', lineHeight: 1.45 }}>
          Not mentioned: <b style={{ color: C.ink }}>{notMentioned.slice(0, 6).map((c) => c.name).join(', ')}{notMentioned.length > 6 ? ` +${notMentioned.length - 6} more` : ''}</b> — will be skipped
        </div>
      )}
      <div style={{ background: C.brandSoft, borderRadius: 12, padding: '9px 12px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
        <span style={{ color: C.brandDark, fontWeight: 700 }}>{byCow.size} of {cows.length} cows</span>
        <span style={{ color: C.brandDark, fontWeight: 800 }}>{r1(total)} L total</span>
      </div>

      <PrimaryButton disabled={invalid} onClick={() => onSave({ date, session, entries: buildEntries() })}>
        Save {byCow.size} {byCow.size === 1 ? 'entry' : 'entries'}
      </PrimaryButton>
      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <button onClick={onSpeakAgain} className="ff-body" style={{ flex: 1, background: C.greySoft, color: C.ink, border: 'none', borderRadius: 12, padding: '12px 0', fontSize: 15, fontWeight: 700 }}>Speak again</button>
        <button onClick={() => onBackToList(rows.filter(rowValid))} className="ff-body" style={{ flex: 1, background: C.brandSoft, color: C.brand, border: 'none', borderRadius: 12, padding: '12px 0', fontSize: 15, fontWeight: 700 }}>Edit in list</button>
      </div>
    </Modal>
  );
}

function MilkBatchForm({ cows, milk, onClose, onSave }) {
  const [date, setDate] = useState(todayStr());
  const [session, setSession] = useState('AM');
  const [mode, setMode] = useState('Per cow');
  const [values, setValues] = useState({}); // cowId -> string liters
  const [totalLiters, setTotalLiters] = useState('');
  const [copied, setCopied] = useState({}); // cowId -> true while a value is a copy of "last time"
  const [copyMsg, setCopyMsg] = useState('');
  const [voice, setVoice] = useState('idle'); // 'idle' | 'processing' | 'review'  (recording state comes from the recorder)
  const [voiceError, setVoiceError] = useState('');
  const [heard, setHeard] = useState('');
  const [rows, setRows] = useState([]);
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('askAiLang') === 'kn' ? 'kn' : 'en'; } catch (e) { return 'en'; }
  });
  const changeLang = (l) => {
    setLang(l);
    try { localStorage.setItem('askAiLang', l); } catch (e) { /* ignore */ }
  };

  // Whenever date/session changes, prefill from any existing entries for that date+session
  useEffect(() => {
    const prefill = {};
    cows.forEach((c) => {
      const existing = milk.find((m) => m.cowId === c.id && m.date === date && m.session === session);
      if (existing) prefill[c.id] = String(existing.liters);
    });
    setValues(prefill);
    setCopied({});
    setCopyMsg('');
  }, [date, session]); // eslint-disable-line react-hooks/exhaustive-deps

  const setVal = (cowId, v) => {
    setValues((prev) => ({ ...prev, [cowId]: v }));
    setCopied((prev) => { if (!prev[cowId]) return prev; const n = { ...prev }; delete n[cowId]; return n; });
  };

  const example = cows.length > 1 ? `${cows[0].name} 8, ${cows[1].name} 6.5` : cows.length === 1 ? `${cows[0].name} 8` : 'Ganga 8, Lakshmi 6.5';

  // ----- voice: record -> transcribe -> read the numbers -> review -----
  const handleAudio = async ({ blob, mime }) => {
    setVoiceError('');
    setVoice('processing');
    const fail = (msg) => { setVoice('idle'); setVoiceError(msg); };
    try {
      const audio = await blobToBase64(blob);
      const t = await fetch('/api/transcribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio, mime, names: cows.map((c) => c.name), language: lang, mode: 'milk' }),
      });
      const td = await t.json().catch(() => ({}));
      if (!t.ok || !td.text) { fail(td.error || "Couldn't understand the recording. Please try again."); return; }
      const p = await fetch('/api/parse-milk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: td.text, language: lang, cows: cows.map((c) => ({ name: c.name, tag: c.tagNumber })) }),
      });
      const pd = await p.json().catch(() => ({}));
      if (!p.ok) { fail(pd.error || "Couldn't read the milk numbers. Please try again."); return; }
      if (!pd.entries || pd.entries.length === 0) {
        fail(`I heard “${td.text.slice(0, 80)}” but couldn't find a cow with litres. Try saying: “${example}”.`);
        return;
      }
      setHeard(td.text);
      setRows(buildVoiceRows(pd.entries, cows));
      if (pd.session === 'AM' || pd.session === 'PM') setSession(pd.session);
      if (pd.day === 'yesterday') setDate(addDays(todayStr(), -1));
      else if (pd.day === 'today') setDate(todayStr());
      setVoice('review');
    } catch (e) {
      fail("Couldn't process the recording — check your connection and try again.");
    }
  };
  const recorder = useVoiceRecorder({ maxSeconds: 90, onAudio: handleAudio, onProblem: (m) => setVoiceError(m) });
  const startVoice = () => { setVoiceError(''); recorder.start(); };

  // ----- start from the last entry of each cow -----
  const copyLast = () => {
    const next = {};
    cows.forEach((c) => {
      if (values[c.id] !== undefined && values[c.id] !== '') return; // never overwrite what's already typed
      const last = milk.filter((m) => m.cowId === c.id && m.session === session && m.date < date).sort((a, b) => b.date.localeCompare(a.date))[0];
      if (last) next[c.id] = String(last.liters);
    });
    const n = Object.keys(next).length;
    if (n === 0) { setCopyMsg(`No earlier ${session} entries to copy.`); return; }
    setValues((prev) => ({ ...prev, ...next }));
    setCopied((prev) => ({ ...prev, ...Object.fromEntries(Object.keys(next).map((id) => [id, true])) }));
    setCopyMsg(`Filled ${n} cow${n === 1 ? '' : 's'} from their last ${session} entry (blue boxes) — change only what's different.`);
  };

  const filledCount = Object.values(values).filter((v) => v !== '' && v !== undefined).length;
  const total = Object.values(values).reduce((s, v) => s + (v ? Number(v) : 0), 0);

  const existingCountForSession = cows.filter((c) => milk.find((m) => m.cowId === c.id && m.date === date && m.session === session)).length;

  // Split the total evenly across all cows, nudging the last cow so the sum matches exactly.
  const splitEntries = () => {
    const n = cows.length;
    const t = Number(totalLiters);
    if (!n || isNaN(t) || t < 0) return [];
    const base = Math.floor((t / n) * 100) / 100;
    return cows.map((c, i) => {
      const existing = milk.find((m) => m.cowId === c.id && m.date === date && m.session === session);
      const liters = i === n - 1 ? Math.round((t - base * (n - 1)) * 100) / 100 : base;
      return { cowId: c.id, liters, existingId: existing ? existing.id : null };
    });
  };

  const handleSave = () => {
    if (mode === 'Total (herd)') {
      const entries = splitEntries();
      if (entries.length === 0) return;
      onSave({ date, session, entries });
      return;
    }
    const entries = cows
      .filter((c) => values[c.id] !== '' && values[c.id] !== undefined && !isNaN(Number(values[c.id])))
      .map((c) => {
        const existing = milk.find((m) => m.cowId === c.id && m.date === date && m.session === session);
        return { cowId: c.id, liters: Number(values[c.id]), existingId: existing ? existing.id : null };
      });
    if (entries.length === 0) return;
    onSave({ date, session, entries });
  };

  if (voice === 'review') {
    return (
      <MilkVoiceReview
        cows={cows} milk={milk} date={date} session={session} setDate={setDate} setSession={setSession}
        heard={heard} rows={rows} setRows={setRows} onClose={onClose}
        onSave={onSave}
        onSpeakAgain={() => { setVoice('idle'); setRows([]); startVoice(); }}
        onBackToList={(valid) => {
          const mapped = {};
          valid.forEach((r) => { mapped[r.cowId] = String(r.liters); });
          setValues((prev) => ({ ...prev, ...mapped }));
          setVoice('idle');
        }}
      />
    );
  }

  const langPill = (
    <div role="group" aria-label="Voice language" style={{ display: 'flex', background: 'rgba(255,255,255,0.22)', borderRadius: 10, padding: 2, flexShrink: 0 }}>
      {[['en', 'EN'], ['kn', 'ಕನ್ನಡ']].map(([code, text]) => (
        <button
          key={code} onClick={() => changeLang(code)} aria-pressed={lang === code} className="ff-body"
          style={{ border: 'none', borderRadius: 8, padding: '5px 8px', fontSize: 12.5, fontWeight: 700, background: lang === code ? '#fff' : 'transparent', color: lang === code ? C.brandDark : '#fff' }}
        >
          {text}
        </button>
      ))}
    </div>
  );

  const voicePanel = recorder.supported && mode === 'Per cow' ? (
    recorder.state === 'recording' ? (
      <div style={{ background: C.brandSoft, borderRadius: 18, padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span className="rec-dot" />
          <span className="ff-display" style={{ fontSize: 22, color: C.ink }}>{fmtTimer(recorder.secs)}</span>
          <span className="ff-body" style={{ fontSize: 14, color: C.sub }}>Listening…</span>
        </div>
        <div className="ff-body" style={{ fontSize: 14, color: C.sub, lineHeight: 1.45, marginBottom: 12 }}>
          Say each cow's name, then the litres — for example “{example}”. You can name all the cows in one go.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => recorder.stop(true)} className="ff-body" style={{ flex: 1, background: '#fff', color: C.ink, border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 0', fontSize: 15, fontWeight: 700 }}>Cancel</button>
          <button onClick={() => recorder.stop(false)} className="ff-body" style={{ flex: 2, background: C.brand, color: '#fff', border: 'none', borderRadius: 12, padding: '12px 0', fontSize: 16, fontWeight: 700 }}>Done</button>
        </div>
      </div>
    ) : voice === 'processing' ? (
      <div className="ff-body" style={{ background: C.brandSoft, borderRadius: 18, padding: '18px 14px', marginBottom: 12, textAlign: 'center', fontSize: 15, color: C.brandDark, fontWeight: 600 }}>
        Understanding what you said…
      </div>
    ) : (
      <div style={{ marginBottom: 12 }}>
        {voiceError && (
          <div className="ff-body" style={{ background: C.rustSoft, color: C.rust, borderRadius: 12, padding: '10px 12px', fontSize: 13.5, marginBottom: 8, lineHeight: 1.4 }}>{voiceError}</div>
        )}
        <div style={{ background: `linear-gradient(135deg, ${C.brand}, ${C.brandDark})`, borderRadius: 18, padding: 12, display: 'flex', alignItems: 'center', gap: 12, color: '#fff', boxShadow: `0 10px 20px rgba(${C.brandRgb},0.3)` }}>
          <button onClick={startVoice} aria-label="Speak the milk" style={{ width: 50, height: 50, borderRadius: 25, border: 'none', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Mic size={24} color={C.brand} />
          </button>
          <div onClick={startVoice} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
            <div className="ff-display" style={{ fontSize: 17 }}>Speak the milk</div>
            <div className="ff-body" style={{ fontSize: 13, opacity: 0.92, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Say “{example}…”</div>
          </div>
          {langPill}
        </div>
      </div>
    )
  ) : null;

  return (
    <Modal title="Log Milk" onClose={onClose}>
      <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} max={todayStr()} /></Field>
      <Field label="Session"><Segmented options={['AM', 'PM']} value={session} onChange={setSession} /></Field>

      {cows.length === 0 ? (
        <MutedNote text="Add a cow first before logging milk." />
      ) : (
        <>
          <Field label="Entry mode"><Segmented options={['Per cow', 'Total (herd)']} value={mode} onChange={setMode} /></Field>

          {voicePanel}

          {mode === 'Total (herd)' ? (
            <>
              <div className="ff-body" style={{ fontSize: 12.5, fontWeight: 600, color: C.sub, marginBottom: 6 }}>
                No time to record each cow? Enter the total milk collected and it'll be split evenly across all {cows.length} active cows.
              </div>
              <Field label={`Total liters — all cows, ${session} session`}>
                <input
                  type="number" min={0} step="0.1" value={totalLiters}
                  onChange={(e) => setTotalLiters(e.target.value)}
                  placeholder="e.g. 62"
                  style={inputStyle}
                />
              </Field>
              {existingCountForSession > 0 && (
                <div className="ff-body" style={{ fontSize: 13, color: C.rust, marginTop: -8, marginBottom: 14 }}>
                  {existingCountForSession} cow{existingCountForSession > 1 ? 's already have' : ' already has'} an entry for this date and session — saving will overwrite {existingCountForSession > 1 ? 'them' : 'it'} with the split amount.
                </div>
              )}
              {totalLiters !== '' && !isNaN(Number(totalLiters)) && Number(totalLiters) >= 0 && (
                <div style={{ background: C.milkSoft, borderRadius: 10, padding: '8px 12px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                  <span style={{ color: C.milk, fontWeight: 600 }}>≈ {(Number(totalLiters) / cows.length).toFixed(2)} L / cow</span>
                  <span style={{ color: C.milk, fontWeight: 700 }}>{Number(totalLiters).toFixed(1)} L total</span>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div className="ff-body" style={{ fontSize: 12.5, fontWeight: 600, color: C.sub, flex: 1, lineHeight: 1.4 }}>
                  Enter liters for each cow — leave blank to skip a cow for this session.
                </div>
                <button onClick={copyLast} className="ff-body" style={{ flexShrink: 0, background: C.brandSoft, color: C.brand, border: 'none', borderRadius: 10, padding: '7px 11px', fontSize: 13, fontWeight: 700 }}>
                  Copy last {session}
                </button>
              </div>
              {copyMsg && <div className="ff-body" style={{ fontSize: 12.5, color: C.brandDark, background: C.brandSoft, borderRadius: 10, padding: '7px 10px', marginBottom: 8, lineHeight: 1.4 }}>{copyMsg}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {cows.map((c) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: '8px 10px' }}>
                    <EarTag number={c.tagNumber} size="sm" />
                    <div style={{ flex: 1 }}>
                      <div className="ff-display" style={{ fontWeight: 700, fontSize: 14, color: C.ink }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: C.sub }}>{c.status !== 'active' ? c.status : '\u00A0'}</div>
                    </div>
                    <input
                      type="number" min={0} step="0.1" placeholder="—" value={values[c.id] ?? ''}
                      onChange={(e) => setVal(c.id, e.target.value)}
                      style={{ ...inputStyle, width: 76, textAlign: 'right', padding: '8px 10px', ...(copied[c.id] ? { background: C.brandSoft, borderColor: C.brand, color: C.brandDark } : {}) }}
                    />
                    <span className="ff-body" style={{ fontSize: 13, color: C.sub }}>L</span>
                  </div>
                ))}
              </div>
              <div style={{ background: C.milkSoft, borderRadius: 10, padding: '8px 12px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                <span style={{ color: C.milk, fontWeight: 600 }}>{filledCount} of {cows.length} cows entered</span>
                <span style={{ color: C.milk, fontWeight: 700 }}>{total.toFixed(1)} L total</span>
              </div>
            </>
          )}
        </>
      )}

      <PrimaryButton
        disabled={mode === 'Total (herd)' ? !(totalLiters !== '' && !isNaN(Number(totalLiters)) && Number(totalLiters) > 0 && cows.length > 0) : filledCount === 0}
        onClick={handleSave}
      >
        {mode === 'Total (herd)'
          ? `Split ${totalLiters || 0} L across ${cows.length} cow${cows.length === 1 ? '' : 's'}`
          : `Save ${filledCount > 0 ? `${filledCount} ${filledCount === 1 ? 'entry' : 'entries'}` : 'entries'}`}
      </PrimaryButton>
    </Modal>
  );
}

function HeatForm({ cows, defaultCowId, initial, onClose, onSave }) {
  const [cowId, setCowId] = useState(initial?.cowId || defaultCowId || '');
  const [date, setDate] = useState(initial?.date || todayStr());
  const [bred, setBred] = useState(initial?.bred || false);
  const [notes, setNotes] = useState(initial?.notes || '');
  const valid = cowId && date;
  return (
    <Modal title={initial ? 'Edit Heat Cycle' : 'Log Heat Cycle'} onClose={onClose}>
      {!defaultCowId && !initial && <CowPicker cows={cows} value={cowId} onChange={setCowId} />}
      <Field label="Date observed"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} max={todayStr()} /></Field>
      <Field label="Bred this cycle?">
        <button onClick={() => setBred(!bred)} style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1.5px solid ${bred ? C.green : C.line}`, background: bred ? C.greenSoft : '#fff', borderRadius: 10, padding: '9px 12px' }}>
          <div style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${bred ? C.green : C.grey}`, background: bred ? C.green : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {bred && <Check size={12} color="#fff" />}
          </div>
          <span className="ff-body" style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>Yes, bred / inseminated</span>
        </button>
      </Field>
      <Field label="Notes (optional)"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. mild signs, standing heat" style={inputStyle} /></Field>
      <PrimaryButton disabled={!valid} onClick={() => onSave({ cowId, date, bred, notes: notes.trim() })}>{initial ? 'Save changes' : 'Save entry'}</PrimaryButton>
    </Modal>
  );
}

function MedicalForm({ cows, defaultCowId, initial, onClose, onSave }) {
  const fixedCowId = initial?.cowId || defaultCowId;
  const ALL_COWS = '__all__';
  const [cowSelection, setCowSelection] = useState(fixedCowId || '');
  // Sold animals shouldn't be picked up by "All cows" (e.g. when vaccinating the herd)
  const selectable = cows.filter((c) => c.status !== 'sold');
  const cowIds = cowSelection === ALL_COWS ? selectable.map((c) => c.id) : cowSelection ? [cowSelection] : [];
  const [date, setDate] = useState(initial?.date || todayStr());
  const [type, setType] = useState(initial?.type || MED_TYPES[0]);
  const [medicine, setMedicine] = useState(initial?.medicine || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [vet, setVet] = useState(initial?.vet || '');
  const [nextDueDate, setNextDueDate] = useState(initial?.nextDueDate || '');
  const valid = cowIds.length > 0 && date && type;
  const cow = fixedCowId ? cows.find((c) => c.id === fixedCowId) : null;
  return (
    <Modal title={initial ? 'Edit Health Record' : 'Add Health Record'} onClose={onClose}>
      {!fixedCowId && (
        <Field label="Cow">
          <select value={cowSelection} onChange={(e) => setCowSelection(e.target.value)} style={inputStyle}>
            <option value="" disabled>Select a cow</option>
            {selectable.length > 1 && <option value={ALL_COWS}>All cows ({selectable.length})</option>}
            {selectable.map((c) => <option key={c.id} value={c.id}>{c.name} (#{c.tagNumber})</option>)}
          </select>
          {cowSelection === ALL_COWS && (
            <div className="ff-body" style={{ fontSize: 13, color: C.sub, marginTop: 6 }}>
              A separate record will be saved for each of the {selectable.length} cows.
            </div>
          )}
        </Field>
      )}
      {cow && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <EarTag number={cow.tagNumber} size="sm" />
          <div>
            <div className="ff-display" style={{ fontWeight: 700, fontSize: 15, color: C.ink }}>{cow.name}</div>
            <div style={{ fontSize: 13, color: C.sub }}>{cow.breed}</div>
          </div>
        </div>
      )}
      <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} max={todayStr()} /></Field>
      <Field label="Type"><Segmented options={MED_TYPES} value={type} onChange={setType} /></Field>
      <Field label="Medicine used (optional)"><input value={medicine} onChange={(e) => setMedicine(e.target.value)} placeholder="e.g. Albendazole" style={inputStyle} /></Field>
      <Field label="Details">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was done / observed" style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} />
      </Field>
      <Field label="Vet / attended by (optional)"><input value={vet} onChange={(e) => setVet(e.target.value)} placeholder="e.g. Dr. Rao" style={inputStyle} /></Field>
      <Field label="Next follow-up date (optional)"><input type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} style={inputStyle} /></Field>
      <PrimaryButton disabled={!valid} onClick={() => onSave({ cowIds, date, type, medicine: medicine.trim(), description: description.trim(), vet: vet.trim(), nextDueDate })}>
        {initial ? 'Save changes' : `Save record${cowIds.length > 1 ? ` for ${cowIds.length} cows` : ''}`}
      </PrimaryButton>
    </Modal>
  );
}

// ================= FEED MANAGEMENT =================
// ================= FEED =================
// Plain-language feed tracking: how many bags are left, how many days they will last, and a quick daily log.
const STOCK_FIX_NOTE = 'Stock correction';
const OPENING_STOCK_NOTE = 'Opening stock';
const fmtBags = (n) => {
  const r = Math.round(Number(n || 0) * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);

// Feed used is logged ONCE A MONTH per feed. Such an entry is a normal 'usage' entry marked with notes 'Monthly:YYYY-MM'
// (dated the last day of that month, or today if it is the current month).
const MONTHLY_PREFIX = 'Monthly:';
const isMonthlyEntry = (t) => t.kind === 'usage' && typeof t.notes === 'string' && t.notes.startsWith(MONTHLY_PREFIX);
const monthOfEntry = (t) => t.notes.slice(MONTHLY_PREFIX.length);
const monthEndDate = (m) => { const [y, mo] = m.split('-').map(Number); return `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, '0')}`; };
const entryDateForMonth = (m) => (m >= currentMonthStr() ? todayStr() : monthEndDate(m));
const monthName = (m) => monthLabel(m).split(' ')[0];
// how many days a monthly entry covers (a month that is still running counts only the days so far)
function monthlyPeriodDays(m, entryDate) {
  const end = monthEndDate(m);
  return entryDate >= end ? Number(end.slice(8, 10)) : Math.max(1, Number(entryDate.slice(8, 10)));
}
function feedMonthlyEntry(feedTypeId, txns, month) {
  return txns.find((t) => t.feedTypeId === feedTypeId && isMonthlyEntry(t) && monthOfEntry(t) === month) || null;
}
// Average bags used per day. Uses the latest 3 monthly totals; if none were logged, falls back to older daily entries (last 14 days).
function feedUsageRate(feedTypeId, txns) {
  const monthly = txns.filter((t) => t.feedTypeId === feedTypeId && isMonthlyEntry(t)).sort((x, y) => monthOfEntry(y).localeCompare(monthOfEntry(x))).slice(0, 3);
  if (monthly.length) {
    const bags = monthly.reduce((sum, t) => sum + Number(t.bags), 0);
    const days = monthly.reduce((sum, t) => sum + monthlyPeriodDays(monthOfEntry(t), t.date), 0);
    return days > 0 ? bags / days : 0;
  }
  const today = todayStr();
  const since = addDays(today, -13);
  const recent = txns.filter((t) => t.feedTypeId === feedTypeId && t.kind === 'usage' && t.notes !== STOCK_FIX_NOTE && t.date >= since && t.date <= today);
  if (!recent.length) return 0;
  const first = recent.reduce((m, t) => (t.date < m ? t.date : m), recent[0].date);
  const last = recent.reduce((m, t) => (t.date > m ? t.date : m), recent[0].date);
  return recent.reduce((sum, t) => sum + Number(t.bags), 0) / Math.max(1, daysBetween(first, last) + 1);
}
// does this feed have ANY use recorded in the given month (monthly total or older daily entries)?
function feedHasUseInMonth(feedTypeId, txns, month) {
  return txns.some((t) => t.feedTypeId === feedTypeId && t.kind === 'usage' && t.notes !== STOCK_FIX_NOTE && (isMonthlyEntry(t) ? monthOfEntry(t) === month : t.date.slice(0, 7) === month));
}
function feedStatus(stock, perDay) {
  if (stock <= 0) return { level: 'out', days: 0, tone: 'rust', label: 'Out of stock' };
  if (!(perDay > 0)) return { level: 'unknown', days: null, tone: 'grey', label: 'Not enough data yet' };
  const days = stock / perDay;
  const text = days < 1 ? 'less than a day' : days < 2 ? 'about 1 day' : `about ${Math.floor(days)} days`;
  if (days < 3) return { level: 'urgent', days, tone: 'rust', label: `${text} left — buy now` };
  if (days < 7) return { level: 'soon', days, tone: 'amber', label: `${text} left — buy soon` };
  return { level: 'ok', days, tone: 'green', label: `${text} left` };
}
const dayHeading = (date) => (date === todayStr() ? 'Today' : date === addDays(todayStr(), -1) ? 'Yesterday' : fmtDate(date));
const FEED_TONES = {
  green: { bg: C.greenSoft, fg: C.green, bar: C.green },
  amber: { bg: C.amberSoft, fg: C.amber, bar: '#F2B544' },
  rust: { bg: C.rustSoft, fg: C.rust, bar: C.rust },
  grey: { bg: C.greySoft, fg: C.sub, bar: '#C9CBD3' },
};

function BagStepper({ value, onChange, disabled, step: stepBy = 5 }) {
  const n = Number(value || 0);
  const step = (d) => onChange(String(Math.max(0, Math.round((n + d) * 10) / 10)));
  const btn = { width: 32, height: 40, border: 'none', background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.brand };
  return (
    <div style={{ display: 'flex', alignItems: 'center', border: `1.5px solid ${C.line}`, borderRadius: 12, background: '#fff', flexShrink: 0 }}>
      <button onClick={() => step(-stepBy)} disabled={disabled} aria-label="Less" style={btn}><Minus size={17} strokeWidth={2.6} /></button>
      <input
        value={value} inputMode="decimal" placeholder="0" aria-label="Bags"
        onChange={(e) => { const v = e.target.value.replace(',', '.'); if (/^\d*\.?\d{0,1}$/.test(v)) onChange(v); }}
        style={{ width: 46, textAlign: 'center', border: 'none', outline: 'none', fontSize: 17, fontWeight: 700, color: C.ink, background: 'transparent', fontFamily: 'inherit' }}
      />
      <button onClick={() => step(stepBy)} disabled={disabled} aria-label="More" style={btn}><Plus size={17} strokeWidth={2.6} /></button>
    </div>
  );
}

function FeedScreen({ feedTypes, feedTransactions, onAddType, onEditType, onLogTxn, onQuickTxn, onUpdateTxn, onDeleteTxn, onExport }) {
  const { isReadOnly } = useContext(RoleContext);
  const [viewingTxn, setViewingTxn] = useState(null);
  const [fixing, setFixing] = useState(null);
  const [openDetails, setOpenDetails] = useState({});
  const [monthChoice, setMonthChoice] = useState('this'); // 'this' | 'last' | 'other'
  const [otherMonth, setOtherMonth] = useState('');
  const [qty, setQty] = useState({});
  const [saving, setSaving] = useState({});
  const [error, setError] = useState('');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historyCount, setHistoryCount] = useState(12);

  const today = todayStr();
  const month = currentMonthStr();
  const lastMonth = shiftMonth(month, -1);
  const logMonth = monthChoice === 'this' ? month : monthChoice === 'last' ? lastMonth : (otherMonth || '');
  const logDate = logMonth ? entryDateForMonth(logMonth) : today;

  const infos = feedTypes.map((f) => {
    const stock = feedStock(f.id, feedTransactions);
    const rate = feedUsageRate(f.id, feedTransactions);
    return { f, stock, rate, st: feedStatus(stock, rate) };
  });
  const needs = infos.filter((i) => ['out', 'urgent', 'soon'].includes(i.st.level)).sort((a, b) => (a.st.days ?? 0) - (b.st.days ?? 0));
  const anyData = infos.some((i) => i.st.level !== 'unknown');
  const urgent = needs.some((i) => i.st.level === 'out' || i.st.level === 'urgent');

  const usedMonthBags = feedTransactions.filter((t) => t.kind === 'usage' && t.date.slice(0, 7) === month).reduce((s, t) => s + Number(t.bags), 0);
  const usedMonthCost = feedTransactions.filter((t) => t.kind === 'usage' && t.date.slice(0, 7) === month).reduce((s, t) => {
    const ft = feedTypes.find((x) => x.id === t.feedTypeId);
    return s + (ft ? Number(t.bags) * Number(ft.costPerBag || 0) : 0);
  }, 0);
  const boughtMonthCost = feedTypes.reduce((s, f) => s + feedMonthSpend(f.id, feedTransactions, month), 0);

  const history = feedTransactions
    .filter((t) => historyFilter === 'all' || t.feedTypeId === historyFilter)
    .slice().sort((a, b) => b.date.localeCompare(a.date));
  const shownHistory = history.slice(0, historyCount);
  const groups = [];
  shownHistory.forEach((t) => {
    const last = groups[groups.length - 1];
    if (last && last.date === t.date) last.items.push(t); else groups.push({ date: t.date, items: [t] });
  });

  // one total per feed per month; logging the same month again updates that total instead of adding a second one
  const logMonthly = async (f, amount) => {
    const n = Number(amount);
    if (!(n > 0) || !logMonth || saving[f.id]) return;
    setSaving((x) => ({ ...x, [f.id]: true }));
    setError('');
    try {
      const existing = feedMonthlyEntry(f.id, feedTransactions, logMonth);
      if (existing) await onUpdateTxn(existing.id, { bags: n, date: logDate });
      else await onQuickTxn(f.id, 'usage', { date: logDate, bags: n, notes: MONTHLY_PREFIX + logMonth });
      setQty((q) => { const c = { ...q }; delete c[f.id]; return c; });
    } catch (e) {
      setError("Couldn't save — please check your connection and try again.");
    } finally {
      setSaving((x) => ({ ...x, [f.id]: false }));
    }
  };

  const describe = (t) => {
    const f = feedTypes.find((x) => x.id === t.feedTypeId);
    const name = f ? f.name : 'Feed';
    if (t.notes === STOCK_FIX_NOTE) return `Stock corrected: ${fmtBags(t.bags)} ${t.kind === 'usage' ? 'fewer' : 'more'} bags · ${name}`;
    if (t.notes === OPENING_STOCK_NOTE) return `Starting stock ${fmtBags(t.bags)} bags · ${name}`;
    if (isMonthlyEntry(t)) return `Used ${fmtBags(t.bags)} bags in ${monthName(monthOfEntry(t))} · ${name}`;
    return `${t.kind === 'purchase' ? 'Bought' : 'Used'} ${fmtBags(t.bags)} bags · ${name}`;
  };

  const banner = needs.length > 0
    ? {
      tone: urgent ? 'rust' : 'amber', icon: urgent ? '⚠️' : '🛒', title: urgent ? 'Buy feed now' : 'Buy feed soon',
      detail: needs.slice(0, 3).map((i) => `${i.f.name} — ${i.st.level === 'out' ? 'out of stock' : i.st.label.replace(' — buy now', '').replace(' — buy soon', '')}`).join(' · '),
    }
    : anyData
      ? { tone: 'green', icon: '✅', title: 'Feed stock looks fine', detail: 'Everything you have lasts a week or more.' }
      : { tone: 'grey', icon: '📝', title: 'Log your monthly feed', detail: "Once you log how much feed you used in a month, I'll tell you how long each feed will last." };

  return (
    <div style={{ paddingBottom: 110 }}>
      <ScreenHeader
        title="Feed" subtitle="Stock, daily use and spending"
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <HeaderIconButton title="Print feed records" icon={<Printer size={15} color="#fff" />} onClick={() => onExport('print')} />
            <HeaderIconButton title="Download CSV" icon={<Download size={15} color="#fff" />} onClick={() => onExport('csv')} />
          </div>
        }
      />
      <div style={{ padding: 16 }}>
        {feedTypes.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 20, padding: 20, boxShadow: C.shadow }}>
            <div style={{ textAlign: 'center', marginBottom: 14 }}>
              <div style={{ width: 72, height: 72, borderRadius: 36, background: C.brandSoft, color: C.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}><Wheat size={32} /></div>
              <div className="ff-display" style={{ fontSize: 19, color: C.ink }}>Set up your feed in 3 steps</div>
            </div>
            {[['1', 'Add each feed you use', 'e.g. Concentrate, Dry fodder — with the price of one bag.'], ['2', 'Enter the stock you have now', 'So the app starts with the right number.'], ['3', 'Once a month, log how much you used', "One number per feed. I'll tell you when to buy more."]].map(([n, t, d]) => (
              <div key={n} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div className="ff-display" style={{ width: 28, height: 28, borderRadius: 14, background: C.brand, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{n}</div>
                <div><div className="ff-body" style={{ fontWeight: 700, fontSize: 15, color: C.ink }}>{t}</div><div className="ff-body" style={{ fontSize: 13.5, color: C.sub }}>{d}</div></div>
              </div>
            ))}
            {!isReadOnly && <PrimaryButton onClick={onAddType}>Add your first feed</PrimaryButton>}
          </div>
        ) : (
          <>
            {/* 1. Do I have enough? */}
            <div style={{ background: FEED_TONES[banner.tone].bg, borderRadius: 18, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 26, lineHeight: 1 }}>{banner.icon}</div>
              <div style={{ minWidth: 0 }}>
                <div className="ff-display" style={{ fontSize: 17, color: FEED_TONES[banner.tone].fg }}>{banner.title}</div>
                <div className="ff-body" style={{ fontSize: 13.5, color: FEED_TONES[banner.tone].fg, opacity: 0.9, marginTop: 2, lineHeight: 1.4 }}>{banner.detail}</div>
              </div>
            </div>

            {/* 2. Log last month / this month's feed */}
            {!isReadOnly && (
              <div style={{ background: '#fff', borderRadius: 20, padding: '14px 16px', boxShadow: C.shadow, marginBottom: 18 }}>
                <div className="ff-display" style={{ fontSize: 17, color: C.ink }}>Log feed used</div>
                <div className="ff-body" style={{ fontSize: 13.5, color: C.sub, margin: '2px 0 10px', lineHeight: 1.4 }}>
                  One number per feed for the whole month — bags used in total.
                </div>
                <Segmented
                  options={['this', 'last', 'other']} value={monthChoice} onChange={setMonthChoice}
                  labels={{ this: monthName(month), last: monthName(lastMonth), other: 'Other month' }}
                />
                {monthChoice === 'other' && (
                  <input
                    type="month" value={otherMonth} max={lastMonth} aria-label="Month"
                    onChange={(e) => setOtherMonth(e.target.value)}
                    style={{ ...inputStyle, marginTop: 10 }}
                  />
                )}
                {!logMonth ? (
                  <div className="ff-body" style={{ fontSize: 13.5, color: C.sub, padding: '14px 0 2px' }}>Pick the month you want to log.</div>
                ) : (
                  infos.map(({ f, rate }, i) => {
                    const existing = feedMonthlyEntry(f.id, feedTransactions, logMonth);
                    const usual = rate > 0 ? Math.max(1, Math.round(rate * 30)) : null;
                    const value = qty[f.id] ?? (existing ? String(existing.bags) : usual != null ? String(usual) : '');
                    const prevMonth = shiftMonth(logMonth, -1);
                    const missingPrev = !existing && monthChoice === 'this' && feedTransactions.some((t) => t.feedTypeId === f.id && t.kind === 'usage') && !feedHasUseInMonth(f.id, feedTransactions, prevMonth);
                    return (
                      <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: i ? `1px solid ${C.line}` : 'none', marginTop: i ? 0 : 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="ff-display" style={{ fontSize: 15.5, color: C.ink, lineHeight: 1.2, wordBreak: 'break-word' }}>{f.name}</div>
                          <div className="ff-body" style={{ fontSize: 12.5, fontWeight: existing || missingPrev ? 700 : 500, color: existing ? C.green : missingPrev ? C.amber : C.sub }}>
                            {existing
                              ? `✓ ${fmtBags(existing.bags)} bags logged`
                              : missingPrev
                                ? `${monthName(prevMonth)} not logged`
                                : usual != null ? `Usual: ${fmtBags(usual)} bags` : 'Nothing logged yet'}
                          </div>
                        </div>
                        <BagStepper value={value} onChange={(v) => setQty((q) => ({ ...q, [f.id]: v }))} disabled={saving[f.id]} />
                        <button
                          onClick={() => logMonthly(f, value)} disabled={saving[f.id] || !(Number(value) > 0)}
                          className="ff-body"
                          style={{ background: C.brand, color: '#fff', border: 'none', borderRadius: 12, padding: '0 14px', height: 42, fontSize: 15, fontWeight: 700, opacity: saving[f.id] || !(Number(value) > 0) ? 0.45 : 1, flexShrink: 0 }}
                        >
                          {saving[f.id] ? '…' : existing ? 'Update' : 'Log'}
                        </button>
                      </div>
                    );
                  })
                )}
                {error && <div className="ff-body" style={{ background: C.rustSoft, color: C.rust, borderRadius: 10, padding: '8px 10px', fontSize: 13, marginTop: 8 }}>{error}</div>}
              </div>
            )}

            {/* 3. Stock of each feed */}
            <SectionTitle title="Your stock" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              {infos.map(({ f, stock, rate, st }) => {
                const tone = FEED_TONES[st.tone];
                const pct = st.days == null ? 0 : Math.min(100, Math.max(5, (st.days / 14) * 100));
                const boughtBags = feedMonthPurchased(f.id, feedTransactions, month);
                const boughtCost = feedMonthSpend(f.id, feedTransactions, month);
                const usedBags = feedTransactions.filter((t) => t.feedTypeId === f.id && t.kind === 'usage' && t.date.slice(0, 7) === month).reduce((s, t) => s + Number(t.bags), 0);
                return (
                  <div key={f.id} style={{ background: '#fff', borderRadius: 20, padding: 16, boxShadow: C.shadow }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="ff-display" style={{ fontSize: 17, color: C.ink }}>{f.name}</div>
                        <div className="ff-body" style={{ fontSize: 13, color: C.sub }}>₹{f.costPerBag} per bag</div>
                      </div>
                      {!isReadOnly && (
                        <button onClick={() => onEditType(f.id)} aria-label={`Edit ${f.name}`} style={{ background: C.greySoft, border: 'none', borderRadius: 10, padding: 8, display: 'flex' }}><Pencil size={15} color={C.ink} /></button>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '10px 0 8px', flexWrap: 'wrap' }}>
                      <span className="ff-display" style={{ fontSize: 32, lineHeight: 1, color: stock <= 0 ? C.rust : C.ink }}>{fmtBags(stock)}</span>
                      <span className="ff-body" style={{ fontSize: 15, color: C.sub, fontWeight: 600 }}>bags left</span>
                      <span className="ff-body" style={{ marginLeft: 'auto', background: tone.bg, color: tone.fg, borderRadius: 8, padding: '4px 10px', fontSize: 13, fontWeight: 700 }}>{st.label}</span>
                    </div>
                    {st.days != null && (
                      <div style={{ height: 8, borderRadius: 4, background: C.greySoft, overflow: 'hidden', marginBottom: 8 }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: tone.bar, borderRadius: 4 }} />
                      </div>
                    )}
                    <div className="ff-body" style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.4 }}>
                      {stock < 0
                        ? 'The app thinks more was used than bought — tap “Fix stock” to match what you really have.'
                        : rate > 0 ? `You use about ${fmtBags(Math.round(rate * 30))} bags a month.` : 'Log how much you used in a month, and I’ll work out how long this lasts.'}
                    </div>
                    {!isReadOnly && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button onClick={() => onLogTxn(f.id, 'purchase')} className="ff-body" style={{ flex: 1.4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: C.brandSoft, color: C.brand, border: 'none', borderRadius: 12, padding: '12px 0', fontSize: 15, fontWeight: 700 }}>
                          <PackagePlus size={16} /> Add stock
                        </button>
                        <button onClick={() => setFixing(f)} className="ff-body" style={{ flex: 1, background: stock < 0 ? C.amberSoft : C.greySoft, color: stock < 0 ? C.amber : C.ink, border: 'none', borderRadius: 12, padding: '12px 0', fontSize: 15, fontWeight: 700 }}>
                          Fix stock
                        </button>
                      </div>
                    )}
                    <button onClick={() => setOpenDetails((o) => ({ ...o, [f.id]: !o[f.id] }))} className="ff-body" style={{ background: 'none', border: 'none', color: C.sub, fontSize: 13.5, fontWeight: 600, padding: '10px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {openDetails[f.id] ? 'Hide details' : 'More details'}
                    </button>
                    {openDetails[f.id] && (
                      <div className="ff-body" style={{ marginTop: 6, borderTop: `1px solid ${C.line}`, paddingTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' }}>
                        {[
                          ['Bought this month', `${fmtBags(boughtBags)} bags${boughtCost ? ` · ₹${boughtCost.toFixed(0)}` : ''}`],
                          ['Used this month', `${fmtBags(usedBags)} bags · ₹${(usedBags * Number(f.costPerBag || 0)).toFixed(0)}`],
                          ['Bought, all time', `${fmtBags(feedTotalPurchased(f.id, feedTransactions))} bags`],
                          ['Used, all time', `${fmtBags(feedTotalUsed(f.id, feedTransactions))} bags`],
                          ['Value of stock in hand', `₹${feedStockValue(f, feedTransactions).toFixed(0)}`],
                        ].map(([k, v]) => (
                          <div key={k}><div style={{ fontSize: 12, color: C.sub }}>{k}</div><div style={{ fontSize: 14.5, fontWeight: 700, color: C.ink }}>{v}</div></div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 4. What am I spending? */}
            <SectionTitle title={`This month · ${monthLabel(month)}`} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
              <div style={{ background: '#fff', borderRadius: 18, padding: 14, boxShadow: C.shadow }}>
                <div className="ff-body" style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}>Feed used</div>
                <div className="ff-display" style={{ fontSize: 24, color: C.ink, marginTop: 4 }}>₹{usedMonthCost.toFixed(0)}</div>
                <div className="ff-body" style={{ fontSize: 12.5, color: C.sub, marginTop: 2 }}>{fmtBags(usedMonthBags)} bags</div>
              </div>
              <div style={{ background: '#fff', borderRadius: 18, padding: 14, boxShadow: C.shadow }}>
                <div className="ff-body" style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}>Spent on buying</div>
                <div className="ff-display" style={{ fontSize: 24, color: C.ink, marginTop: 4 }}>₹{boughtMonthCost.toFixed(0)}</div>
                <div className="ff-body" style={{ fontSize: 12.5, color: C.sub, marginTop: 2 }}>stock purchased</div>
              </div>
            </div>
            <div className="ff-body" style={{ fontSize: 12.5, color: C.sub, marginBottom: 20, lineHeight: 1.4 }}>
              “Feed used” (bags used × price per bag) is what the Finance tab counts as your feed expense.
            </div>

            {/* 5. History */}
            <SectionTitle title="History" />
            {feedTypes.length > 1 && (
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -16px 12px', padding: '0 16px' }}>
                {[{ id: 'all', name: 'All' }, ...feedTypes].map((f) => (
                  <button
                    key={f.id} onClick={() => { setHistoryFilter(f.id); setHistoryCount(12); }} className="ff-body"
                    style={{ flexShrink: 0, border: `1.5px solid ${historyFilter === f.id ? C.brand : C.line}`, background: historyFilter === f.id ? C.brandSoft : '#fff', color: historyFilter === f.id ? C.brand : C.ink, borderRadius: 12, padding: '7px 14px', fontSize: 14, fontWeight: 600 }}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            )}
            {history.length === 0 ? (
              <MutedNote text="Nothing logged yet. Your feed purchases and daily use will show up here." />
            ) : (
              <>
                {groups.map((g) => (
                  <div key={g.date} style={{ marginBottom: 12 }}>
                    <div className="ff-body" style={{ fontSize: 13, fontWeight: 700, color: C.sub, margin: '0 2px 6px' }}>{dayHeading(g.date)}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {g.items.map((t) => (
                        <div key={t.id} onClick={() => setViewingTxn(t)} style={{ ...rowCardStyle, padding: '12px 14px' }}>
                          <div style={{ width: 34, height: 34, borderRadius: 17, background: t.kind === 'purchase' ? C.greenSoft : C.greySoft, color: t.kind === 'purchase' ? C.green : C.sub, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {t.kind === 'purchase' ? <PackagePlus size={17} /> : <PackageMinus size={17} />}
                          </div>
                          <div className="ff-body" style={{ flex: 1, marginLeft: 12, fontSize: 14.5, fontWeight: 600, color: C.ink, lineHeight: 1.35, minWidth: 0 }}>{describe(t)}</div>
                          {t.kind === 'purchase' && Number(t.cost) > 0 && <div className="ff-display" style={{ fontSize: 14.5, color: C.ink, marginRight: 6 }}>₹{t.cost}</div>}
                          <ChevronRight size={16} color={C.grey} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {history.length > historyCount && (
                  <button onClick={() => setHistoryCount((n) => n + 20)} className="ff-body" style={{ width: '100%', background: C.greySoft, color: C.ink, border: 'none', borderRadius: 12, padding: '12px 0', fontSize: 15, fontWeight: 700 }}>
                    Show more ({history.length - historyCount} older)
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
      {viewingTxn && (
        <FeedTxnDetailModal
          record={viewingTxn}
          feedType={feedTypes.find((f) => f.id === viewingTxn.feedTypeId)}
          onClose={() => setViewingTxn(null)}
          onUpdate={async (id, data) => {
            setViewingTxn(null);
            try { await onUpdateTxn(id, data); } catch (e) { setError("Couldn't save that change — please try again."); }
          }}
          onDelete={(id) => { onDeleteTxn(id); setViewingTxn(null); }}
        />
      )}
      {fixing && (
        <FixStockModal
          feedType={fixing} appStock={feedStock(fixing.id, feedTransactions)}
          onClose={() => setFixing(null)}
          onSave={async (kind, bags) => {
            await onQuickTxn(fixing.id, kind, { date: todayStr(), bags, cost: kind === 'purchase' ? 0 : undefined, notes: STOCK_FIX_NOTE });
            setFixing(null);
          }}
        />
      )}
      {feedTypes.length > 0 && <FAB onClick={onAddType} label="Add feed" />}
    </div>
  );
}

// "I counted my bags and the app's number is wrong" — records the difference so stock matches reality
function FixStockModal({ feedType, appStock, onClose, onSave }) {
  const [actual, setActual] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const has = actual !== '' && !isNaN(Number(actual)) && Number(actual) >= 0;
  const diff = has ? Math.round((Number(actual) - appStock) * 10) / 10 : 0;
  const save = async () => {
    if (!has || diff === 0) return;
    setBusy(true); setErr('');
    try { await onSave(diff < 0 ? 'usage' : 'purchase', Math.abs(diff)); }
    catch (e) { setErr("Couldn't save — please try again."); setBusy(false); }
  };
  return (
    <Modal title={`Fix stock — ${feedType.name}`} onClose={onClose}>
      <div className="ff-body" style={{ background: C.greySoft, borderRadius: 12, padding: '10px 12px', fontSize: 14.5, color: C.sub, marginBottom: 14 }}>
        The app thinks you have <b style={{ color: C.ink }}>{fmtBags(appStock)} bags</b>.
      </div>
      <Field label="How many bags do you really have now?">
        <input type="number" min={0} step="0.5" value={actual} onChange={(e) => setActual(e.target.value)} placeholder="Count the bags" style={inputStyle} autoFocus />
      </Field>
      {has && diff === 0 && <div className="ff-body" style={{ color: C.green, fontWeight: 700, fontSize: 14.5, marginBottom: 12 }}>✓ That already matches — nothing to fix.</div>}
      {has && diff !== 0 && (
        <div className="ff-body" style={{ background: diff < 0 ? C.amberSoft : C.greenSoft, color: diff < 0 ? C.amber : C.green, borderRadius: 12, padding: '10px 12px', fontSize: 14, marginBottom: 12, lineHeight: 1.45 }}>
          {diff < 0
            ? `${fmtBags(-diff)} bags will be counted as used (their cost goes into Finance).`
            : `${fmtBags(diff)} extra bags will be added to your stock (no cost).`}
        </div>
      )}
      {err && <div className="ff-body" style={{ color: C.rust, fontSize: 13.5, marginBottom: 10 }}>{err}</div>}
      <PrimaryButton disabled={!has || diff === 0 || busy} onClick={save}>{busy ? 'Saving…' : 'Update stock'}</PrimaryButton>
    </Modal>
  );
}

function FeedTypeForm({ initial, txnCount = 0, onClose, onSave, onDelete }) {
  const [name, setName] = useState(initial?.name || '');
  const [costPerBag, setCostPerBag] = useState(initial?.costPerBag || '');
  const [openingBags, setOpeningBags] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const valid = name.trim() && costPerBag !== '' && Number(costPerBag) >= 0;

  if (confirmDel) {
    return (
      <Modal title={`Delete ${initial.name}?`} onClose={() => setConfirmDel(false)}>
        <div className="ff-body" style={{ fontSize: 14.5, color: C.sub, marginBottom: 14, lineHeight: 1.5 }}>
          This also deletes its {txnCount} purchase and usage {txnCount === 1 ? 'entry' : 'entries'}. This can't be undone.
        </div>
        <PrimaryButton danger onClick={onDelete}>Delete permanently</PrimaryButton>
      </Modal>
    );
  }
  return (
    <Modal title={initial ? 'Edit feed' : 'Add a feed'} onClose={onClose}>
      <Field label="Feed name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Concentrate mix" style={inputStyle} /></Field>
      <Field label="Price of one bag (₹)"><input type="number" min={0} value={costPerBag} onChange={(e) => setCostPerBag(e.target.value)} placeholder="e.g. 1200" style={inputStyle} /></Field>
      {!initial && (
        <Field label="Bags you have right now (optional)">
          <input type="number" min={0} step="0.5" value={openingBags} onChange={(e) => setOpeningBags(e.target.value)} placeholder="e.g. 20" style={inputStyle} />
          <div className="ff-body" style={{ fontSize: 12.5, color: C.sub, marginTop: 6 }}>The app starts counting from this number.</div>
        </Field>
      )}
      <PrimaryButton
        disabled={!valid}
        onClick={() => onSave({ name: name.trim(), costPerBag: Number(costPerBag), openingBags: !initial && Number(openingBags) > 0 ? Number(openingBags) : 0 })}
      >
        {initial ? 'Save changes' : 'Add feed'}
      </PrimaryButton>
      {initial && onDelete && (
        <button onClick={() => setConfirmDel(true)} className="ff-body" style={{ width: '100%', background: 'none', border: 'none', color: C.rust, fontSize: 15, fontWeight: 700, padding: '16px 0 4px' }}>
          Delete this feed
        </button>
      )}
    </Modal>
  );
}

function FeedTxnForm({ feedType, kind, onClose, onSave }) {
  const [date, setDate] = useState(todayStr());
  const [bags, setBags] = useState('');
  const [cost, setCost] = useState('');
  const valid = date && bags !== '' && Number(bags) > 0;
  const suggestedCost = feedType && bags !== '' ? (Number(bags) * Number(feedType.costPerBag)).toFixed(0) : '';
  return (
    <Modal title={`${kind === 'purchase' ? 'Add stock' : 'Log feed used'} — ${feedType ? feedType.name : ''}`} onClose={onClose}>
      <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} max={todayStr()} /></Field>
      <Field label={kind === 'purchase' ? 'Bags bought' : 'Bags used'}><input type="number" min={0} step="0.5" value={bags} onChange={(e) => setBags(e.target.value)} placeholder="e.g. 5" style={inputStyle} /></Field>
      {kind === 'purchase' && (
        <Field label="Total price paid (₹, optional)">
          <input type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} placeholder={suggestedCost ? `Leave blank for ₹${suggestedCost}` : 'e.g. 6000'} style={inputStyle} />
        </Field>
      )}
      <PrimaryButton
        disabled={!valid}
        onClick={() => onSave({ date, bags: Number(bags), cost: kind === 'purchase' ? Number(cost || suggestedCost || 0) : undefined })}
      >
        {kind === 'purchase' ? 'Add to stock' : 'Save'}
      </PrimaryButton>
    </Modal>
  );
}

function FeedTxnDetailModal({ record, feedType, onClose, onUpdate, onDelete }) {
  const { isReadOnly } = useContext(RoleContext);
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(record.date);
  const [bags, setBags] = useState(String(record.bags));
  const [cost, setCost] = useState(record.cost != null ? String(record.cost) : '');
  const [confirmDel, setConfirmDel] = useState(false);
  const isFix = record.notes === STOCK_FIX_NOTE;
  const isOpening = record.notes === OPENING_STOCK_NOTE;
  const isMonthly = isMonthlyEntry(record);
  const whenText = isMonthly ? monthLabel(monthOfEntry(record)) : fmtDate(record.date);
  const title = isFix ? 'Stock correction' : isOpening ? 'Starting stock' : isMonthly ? 'Feed used in a month' : record.kind === 'purchase' ? 'Stock added' : 'Feed used';

  if (confirmDel) {
    return (
      <Modal title="Delete this entry?" onClose={() => setConfirmDel(false)}>
        <div className="ff-body" style={{ fontSize: 14.5, color: C.sub, marginBottom: 14, lineHeight: 1.5 }}>
          This removes “{title}” ({fmtBags(record.bags)} bags) from {whenText}. Your stock count will change. This can't be undone.
        </div>
        <PrimaryButton danger onClick={() => onDelete(record.id)}>Delete permanently</PrimaryButton>
      </Modal>
    );
  }

  const save = () => {
    const n = Number(bags);
    if (isNaN(n) || n <= 0 || !date) return;
    // a monthly total always keeps its month; a month still running is "as of today"
    const data = { bags: n, date: isMonthly ? entryDateForMonth(monthOfEntry(record)) : date };
    if (record.kind === 'purchase') data.cost = cost === '' ? null : Number(cost);
    onUpdate(record.id, data);
  };

  return (
    <Modal title={title} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: 20, background: record.kind === 'purchase' ? C.greenSoft : C.greySoft, color: record.kind === 'purchase' ? C.green : C.sub, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {record.kind === 'purchase' ? <PackagePlus size={19} /> : <PackageMinus size={19} />}
        </div>
        <div>
          <div className="ff-display" style={{ fontSize: 16, color: C.ink }}>{feedType ? feedType.name : 'Unknown feed'}</div>
          <div className="ff-body" style={{ fontSize: 13.5, color: C.sub }}>{whenText}</div>
        </div>
      </div>

      {editing ? (
        <>
          {!isMonthly && <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayStr()} style={inputStyle} /></Field>}
          <Field label={isMonthly ? `Bags used in ${monthName(monthOfEntry(record))}` : 'Bags'}><input type="number" min={0} step="0.5" value={bags} onChange={(e) => setBags(e.target.value)} style={inputStyle} /></Field>
          {record.kind === 'purchase' && !isFix && !isOpening && (
            <Field label="Total price paid (₹)"><input type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} style={inputStyle} /></Field>
          )}
          <PrimaryButton onClick={save}>Save changes</PrimaryButton>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
            <DetailRow label="Bags" value={`${fmtBags(record.bags)} bags${isFix ? (record.kind === 'usage' ? ' fewer' : ' more') : ''}`} />
            {record.kind === 'purchase' && !isFix && !isOpening && <DetailRow label="Price paid" value={record.cost ? `₹${record.cost}` : '—'} />}
            {record.notes && !isFix && !isOpening && <DetailRow label="Notes" value={record.notes} />}
          </div>
          {!isReadOnly && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setEditing(true)} className="ff-body" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: C.brandSoft, color: C.brand, border: 'none', borderRadius: 12, padding: '12px 0', fontSize: 15, fontWeight: 700 }}>
                <Pencil size={15} /> Edit
              </button>
              <button onClick={() => setConfirmDel(true)} className="ff-body" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: C.rustSoft, color: C.rust, border: 'none', borderRadius: 12, padding: '12px 0', fontSize: 15, fontWeight: 700 }}>
                <Trash2 size={15} /> Delete
              </button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

// ================= MEDICINE STOCK =================
function MedicineTypeForm({ initial, onClose, onSave }) {
  const [name, setName] = useState(initial?.name || '');
  const [unit, setUnit] = useState(initial?.unit || 'tablets');
  const [costPerUnit, setCostPerUnit] = useState(initial?.costPerUnit ?? '');
  const [lowStockThreshold, setLowStockThreshold] = useState(initial?.lowStockThreshold ?? 5);
  const valid = name.trim() && unit.trim();

  return (
    <Modal title={initial ? 'Edit Medicine' : 'Add Medicine'} onClose={onClose}>
      <Field label="Medicine name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Oxytetracycline" style={inputStyle} /></Field>
      <Field label="Unit"><Segmented options={['tablets', 'ml', 'bottles', 'doses', 'sachets']} value={unit} onChange={setUnit} /></Field>
      <Field label="Cost per unit (₹, optional)"><input type="number" min={0} value={costPerUnit} onChange={(e) => setCostPerUnit(e.target.value)} placeholder="e.g. 15" style={inputStyle} /></Field>
      <Field label="Low stock alert when at or below">
        <input type="number" min={0} value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} style={inputStyle} />
      </Field>
      <PrimaryButton
        disabled={!valid}
        onClick={() => onSave({ name: name.trim(), unit: unit.trim(), costPerUnit: costPerUnit === '' ? '' : Number(costPerUnit), lowStockThreshold: lowStockThreshold === '' ? 5 : Number(lowStockThreshold) })}
      >
        {initial ? 'Save changes' : 'Add medicine'}
      </PrimaryButton>
    </Modal>
  );
}

function MedicineTxnForm({ medicineType, kind, onClose, onSave }) {
  const [date, setDate] = useState(todayStr());
  const [quantity, setQuantity] = useState('');
  const [cost, setCost] = useState('');
  const valid = date && quantity !== '' && Number(quantity) > 0;
  const suggestedCost = medicineType && quantity !== '' ? (Number(quantity) * Number(medicineType.costPerUnit || 0)).toFixed(0) : '';

  return (
    <Modal title={`${kind === 'purchase' ? 'Log Purchase' : 'Log Usage'} — ${medicineType ? medicineType.name : ''}`} onClose={onClose}>
      <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} max={todayStr()} /></Field>
      <Field label={`Quantity (${medicineType ? medicineType.unit : 'units'})`}>
        <input type="number" min={0} step="0.5" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 10" style={inputStyle} />
      </Field>
      {kind === 'purchase' && (
        <Field label="Total cost (₹, optional)">
          <input type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} placeholder={suggestedCost ? `Suggested: ${suggestedCost}` : 'e.g. 300'} style={inputStyle} />
        </Field>
      )}
      <PrimaryButton
        disabled={!valid}
        onClick={() => onSave({ date, quantity: Number(quantity), cost: kind === 'purchase' ? Number(cost || suggestedCost || 0) : undefined })}
      >
        Save {kind === 'purchase' ? 'purchase' : 'usage'}
      </PrimaryButton>
    </Modal>
  );
}

function MedicineTxnDetailModal({ record, medicineType, onClose, onUpdate, onDelete }) {
  const { isReadOnly } = useContext(RoleContext);
  const [editing, setEditing] = useState(false);
  const [quantity, setQuantity] = useState(String(record.quantity));
  const [cost, setCost] = useState(record.cost != null ? String(record.cost) : '');
  const [confirmDel, setConfirmDel] = useState(false);

  if (confirmDel) {
    return (
      <Modal title="Delete this entry?" onClose={() => setConfirmDel(false)}>
        <div style={{ fontSize: 14, color: C.sub, marginBottom: 14 }}>
          This removes this {record.kind} entry ({record.quantity} {medicineType ? medicineType.unit : 'units'}) for {fmtDate(record.date)}. This can't be undone.
        </div>
        <PrimaryButton danger onClick={() => onDelete(record.id)}>Delete permanently</PrimaryButton>
      </Modal>
    );
  }

  const save = () => {
    const n = Number(quantity);
    if (isNaN(n) || n <= 0) return;
    const data = { quantity: n };
    if (record.kind === 'purchase') data.cost = cost === '' ? null : Number(cost);
    onUpdate(record.id, data);
  };

  return (
    <Modal title={`${record.kind === 'purchase' ? 'Purchase' : 'Usage'} Entry`} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ color: record.kind === 'purchase' ? C.green : C.grey }}>
          {record.kind === 'purchase' ? <PackagePlus size={18} /> : <PackageMinus size={18} />}
        </div>
        <div>
          <div className="ff-display" style={{ fontWeight: 700, fontSize: 15, color: C.ink }}>{medicineType ? medicineType.name : 'Unknown medicine'}</div>
          <div style={{ fontSize: 13, color: C.sub }}>{fmtDate(record.date)}</div>
        </div>
      </div>

      {editing ? (
        <>
          <Field label={`Quantity (${medicineType ? medicineType.unit : 'units'})`}>
            <input type="number" min={0} step="0.5" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={inputStyle} />
          </Field>
          {record.kind === 'purchase' && (
            <Field label="Total cost (₹)"><input type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} style={inputStyle} /></Field>
          )}
          <PrimaryButton onClick={save}>Save changes</PrimaryButton>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
            <DetailRow label="Quantity" value={`${record.quantity} ${medicineType ? medicineType.unit : ''}`} />
            {record.kind === 'purchase' && <DetailRow label="Total cost" value={record.cost ? `₹${record.cost}` : '—'} />}
            {record.notes && <DetailRow label="Notes" value={record.notes} />}
          </div>
          {!isReadOnly && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setEditing(true)} className="ff-body" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: C.brandSoft, color: C.brand, border: 'none', borderRadius: 10, padding: '10px 0', fontSize: 14, fontWeight: 700 }}>
                <Pencil size={14} /> Edit
              </button>
              <button onClick={() => setConfirmDel(true)} className="ff-body" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: C.rustSoft, color: C.rust, border: 'none', borderRadius: 10, padding: '10px 0', fontSize: 14, fontWeight: 700 }}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

// ================= FINANCE =================
const INCOME_CATEGORIES = ['Milk Sale', 'Animal Sale', 'Other'];
const EXPENSE_CATEGORIES = ['Medical', 'Other'];

function FinanceScreen({ financeEntries, feedTransactions, feedTypes, onAdd, onEdit, onDelete, onExport }) {
  const { isReadOnly } = useContext(RoleContext);
  const [viewing, setViewing] = useState(null);
  const [confirmDelId, setConfirmDelId] = useState(null);
  const [month, setMonth] = useState(currentMonthStr());

  const feedExpenseRows = useMemo(() => (
    feedTransactions
      .filter((t) => t.kind === 'usage')
      .map((t) => {
        const ft = feedTypes.find((f) => f.id === t.feedTypeId);
        const amount = ft ? Number(t.bags) * Number(ft.costPerBag) : 0;
        return {
          id: `feed-${t.id}`, date: t.date, type: 'expense', category: 'Feed',
          amount, notes: ft ? `${t.bags} bags of ${ft.name} used` : `${t.bags} bags used`, isFeed: true,
        };
      })
  ), [feedTransactions, feedTypes]);

  const allExpenses = useMemo(() => (
    [...feedExpenseRows, ...financeEntries.filter((e) => e.type === 'expense')]
  ), [feedExpenseRows, financeEntries]);

  const allIncome = useMemo(() => financeEntries.filter((e) => e.type === 'income'), [financeEntries]);

  const inMonth = (d) => d.date && d.date.slice(0, 7) === month;
  const incomeThisMonth = allIncome.filter(inMonth).reduce((s, e) => s + Number(e.amount), 0);
  const expenseThisMonth = allExpenses.filter(inMonth).reduce((s, e) => s + Number(e.amount), 0);
  const netThisMonth = incomeThisMonth - expenseThisMonth;

  const feedThisMonth = feedExpenseRows.filter(inMonth).reduce((s, e) => s + e.amount, 0);
  const medicalThisMonth = financeEntries.filter((e) => e.type === 'expense' && e.category === 'Medical' && inMonth(e)).reduce((s, e) => s + Number(e.amount), 0);
  const otherExpThisMonth = financeEntries.filter((e) => e.type === 'expense' && e.category === 'Other' && inMonth(e)).reduce((s, e) => s + Number(e.amount), 0);

  const recentAll = useMemo(() => (
    [...allIncome, ...allExpenses].filter(inMonth).sort((a, b) => b.date.localeCompare(a.date))
  ), [allIncome, allExpenses, month]);

  return (
    <div>
      <ScreenHeader
        title="Finance" subtitle={monthLabel(month)}
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <HeaderIconButton title="Print finance report" icon={<Printer size={15} color="#fff" />} onClick={() => onExport('print')} />
            <HeaderIconButton title="Download CSV" icon={<Download size={15} color="#fff" />} onClick={() => onExport('csv')} />
          </div>
        }
      />
      <div style={{ padding: 16 }}>
        <MonthSwitcher month={month} onChange={setMonth} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <StatCard label="Income this mo." value={`₹${incomeThisMonth.toFixed(0)}`} bg={C.greenSoft} fg={C.green} icon={<TrendingUp size={16} />} />
          <StatCard label="Expenses this mo." value={`₹${expenseThisMonth.toFixed(0)}`} bg={C.rustSoft} fg={C.rust} icon={<TrendingDown size={16} />} />
        </div>
        <div style={{ background: netThisMonth >= 0 ? C.greenSoft : C.rustSoft, borderRadius: 14, padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="ff-body" style={{ fontSize: 13, color: netThisMonth >= 0 ? C.green : C.rust, fontWeight: 600 }}>Net {netThisMonth >= 0 ? 'profit' : 'loss'} this month</div>
            <div className="ff-display" style={{ fontSize: 26, fontWeight: 700, color: netThisMonth >= 0 ? C.green : C.rust }}>₹{Math.abs(netThisMonth).toFixed(0)}</div>
          </div>
          <Wallet size={26} color={netThisMonth >= 0 ? C.green : C.rust} />
        </div>

        <SectionTitle title="Expense breakdown" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 18 }}>
          <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 11.5, color: C.sub, fontWeight: 600 }}>Feed</div>
            <div className="ff-display" style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>₹{feedThisMonth.toFixed(0)}</div>
          </div>
          <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 11.5, color: C.sub, fontWeight: 600 }}>Medical</div>
            <div className="ff-display" style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>₹{medicalThisMonth.toFixed(0)}</div>
          </div>
          <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 11.5, color: C.sub, fontWeight: 600 }}>Other</div>
            <div className="ff-display" style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>₹{otherExpThisMonth.toFixed(0)}</div>
          </div>
        </div>

        {!isReadOnly && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <button onClick={() => onAdd('income')} className="ff-body" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: C.greenSoft, color: C.green, border: 'none', borderRadius: 12, padding: '11px 0', fontWeight: 700, fontSize: 14 }}>
              <Plus size={15} /> Add income
            </button>
            <button onClick={() => onAdd('expense')} className="ff-body" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: C.rustSoft, color: C.rust, border: 'none', borderRadius: 12, padding: '11px 0', fontWeight: 700, fontSize: 14 }}>
              <Plus size={15} /> Add expense
            </button>
          </div>
        )}

        <SectionTitle title={`Entries — ${monthLabel(month)}`} />
        {recentAll.length === 0 ? (
          <EmptyState icon={<Wallet size={30} />} title="No entries this month" subtitle="Log your milk sales and other income, plus medical and other expenses. Feed costs are pulled in automatically from the Feed tab." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentAll.map((e) => (
              <div key={e.id} onClick={() => !e.isFeed && setViewing(e)} style={rowCardStyle}>
                <div style={{ color: e.type === 'income' ? C.green : C.rust }}>
                  {e.type === 'income' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                </div>
                <div style={{ flex: 1, marginLeft: 10 }}>
                  <div className="ff-display" style={{ fontWeight: 700, fontSize: 14, color: C.ink }}>{e.category}{e.isFeed ? ' (from Feed tab)' : ''}</div>
                  <div style={{ fontSize: 13, color: C.sub }}>{fmtDate(e.date)}{e.notes ? ` · ${e.notes}` : ''}</div>
                </div>
                <div className="ff-display" style={{ fontWeight: 700, fontSize: 16, color: e.type === 'income' ? C.green : C.rust }}>
                  {e.type === 'income' ? '+' : '−'}₹{Number(e.amount).toFixed(0)}
                </div>
                {!e.isFeed && <ChevronRight size={16} color={C.grey} style={{ marginLeft: 4 }} />}
              </div>
            ))}
          </div>
        )}
      </div>

      {viewing && (
        <Modal title={viewing.type === 'income' ? 'Income Entry' : 'Expense Entry'} onClose={() => setViewing(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
            <DetailRow label="Date" value={fmtDate(viewing.date)} />
            <DetailRow label="Category" value={viewing.category} />
            <DetailRow label="Amount" value={`₹${Number(viewing.amount).toFixed(0)}`} />
            {viewing.notes && <DetailRow label="Notes" value={viewing.notes} />}
          </div>
          {!isReadOnly && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { onEdit(viewing.id); setViewing(null); }} className="ff-body" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: C.brandSoft, color: C.brand, border: 'none', borderRadius: 10, padding: '10px 0', fontSize: 14, fontWeight: 700 }}>
                <Pencil size={14} /> Edit
              </button>
              <button onClick={() => { setConfirmDelId(viewing.id); setViewing(null); }} className="ff-body" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: C.rustSoft, color: C.rust, border: 'none', borderRadius: 10, padding: '10px 0', fontSize: 14, fontWeight: 700 }}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
          )}
        </Modal>
      )}

      {confirmDelId && (
        <Modal title="Delete this entry?" onClose={() => setConfirmDelId(null)}>
          <div style={{ fontSize: 14, color: C.sub, marginBottom: 14 }}>This can't be undone.</div>
          <PrimaryButton danger onClick={() => { onDelete(confirmDelId); setConfirmDelId(null); }}>Delete permanently</PrimaryButton>
        </Modal>
      )}
    </div>
  );
}

function FinanceEntryForm({ initial, defaultType, onClose, onSave }) {
  const type = initial?.type || defaultType || 'income';
  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const [date, setDate] = useState(initial?.date || todayStr());
  const [category, setCategory] = useState(initial?.category || categories[0]);
  const [amount, setAmount] = useState(initial?.amount ?? '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const valid = date && amount !== '' && Number(amount) > 0;

  return (
    <Modal title={initial ? 'Edit Entry' : type === 'income' ? 'Add Income' : 'Add Expense'} onClose={onClose}>
      <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} max={todayStr()} /></Field>
      <Field label="Category"><Segmented options={categories} value={category} onChange={setCategory} /></Field>
      <Field label="Amount (₹)"><input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 5000" style={inputStyle} /></Field>
      <Field label="Notes (optional)"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. sold to co-op" style={inputStyle} /></Field>
      <PrimaryButton disabled={!valid} onClick={() => onSave({ date, type, category, amount: Number(amount), notes: notes.trim() })}>
        {initial ? 'Save changes' : type === 'income' ? 'Add income' : 'Add expense'}
      </PrimaryButton>
    </Modal>
  );
}
