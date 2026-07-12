import React, { useState, useEffect, useRef, useMemo, useContext } from 'react';
import {
  Home, Milk, HeartPulse, Stethoscope, Plus, ArrowLeft, X,
  Calendar, Search, Check, ChevronRight, Trash2, Pencil, Droplet, Syringe, Printer, Download, Wheat, Baby, PackageMinus, PackagePlus, Upload, LogOut, Mail, Lock, Users, UserPlus, Eye, Shield
} from 'lucide-react';
import ReactDOM from 'react-dom';
import { supabase, configMissing } from './supabaseClient.js';

// ---------- Design tokens ----------
// ---------- Access role (owner / master / viewer) ----------
const RoleContext = React.createContext({ role: 'owner', isReadOnly: false });

const C = {
  bg: '#EEF0E6',
  card: '#FFFFFF',
  ink: '#20281F',
  sub: '#6E6C60',
  line: '#E2DFCF',
  green: '#2F4A3A',
  greenDark: '#1C2E22',
  greenSoft: '#DCE6DA',
  brown: '#93602F',
  brownSoft: '#EFE0CC',
  rust: '#B8462F',
  rustSoft: '#F5DCD3',
  milk: '#3E7C93',
  milkSoft: '#DCEAEF',
  amber: '#C08A2E',
  amberSoft: '#F3E5C8',
  grey: '#8B8778',
  greySoft: '#E8E6DA',
};

const FONTS = (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
    html, body, #root { height: 100%; margin: 0; overflow: hidden; overscroll-behavior: none; }
    .app-shell { height: 100vh; height: 100dvh; }
    .ff-display { font-family: 'Space Grotesk', sans-serif; }
    .ff-body { font-family: 'Inter', sans-serif; }
    * { -webkit-tap-highlight-color: transparent; }
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
const todayStr = () => new Date().toISOString().slice(0, 10);
const addDays = (dateStr, n) => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const addMonths = (dateStr, n) => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
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

// ---------- Insurance helpers ----------
function policyStatus(policy) {
  if (!policy.expiryDate) return { status: 'none' };
  const daysUntil = diffDays(policy.expiryDate);
  let status = 'active';
  if (daysUntil < 0) status = 'expired';
  else if (daysUntil <= 30) status = 'expiring';
  return { status, daysUntil };
}
function policyTotalPaid(policyId, payments) {
  return payments.filter((p) => p.policyId === policyId).reduce((s, p) => s + Number(p.amount || 0), 0);
}
function policyPaidThisYear(policyId, payments) {
  const year = todayStr().slice(0, 4);
  return payments.filter((p) => p.policyId === policyId && p.date.slice(0, 4) === year).reduce((s, p) => s + Number(p.amount || 0), 0);
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
  const tones = {
    green: { bg: C.greenSoft, fg: C.green },
    brown: { bg: C.brownSoft, fg: C.brown },
    grey: { bg: C.greySoft, fg: C.grey },
    amber: { bg: C.amberSoft, fg: C.amber },
  };
  const t = tones[tone] || tones.green;
  const dims = size === 'lg' ? { w: 72, h: 56, fs: 20 } : size === 'sm' ? { w: 40, h: 32, fs: 11 } : { w: 52, h: 40, fs: 14 };
  const numStr = number == null ? '' : String(number);
  const displayNum = numStr.length > 3 ? numStr.slice(-3) : numStr;
  return (
    <div
      style={{
        position: 'relative',
        width: dims.w,
        height: dims.h,
        background: t.bg,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        border: `1.5px solid ${t.fg}22`,
      }}
      title={numStr.length > 3 ? `Tag #${numStr}` : undefined}
    >
      <div
        style={{
          position: 'absolute',
          top: -4,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: C.bg,
          border: `1.5px solid ${t.fg}33`,
        }}
      />
      <span className="ff-display" style={{ color: t.fg, fontWeight: 700, fontSize: dims.fs, letterSpacing: 0.5 }}>
        {displayNum}
      </span>
    </div>
  );
}

const earTagTone = (status) => (status === 'active' ? 'green' : status === 'dry' ? 'brown' : status === 'calf' ? 'amber' : 'grey');

function StatusPill({ status }) {
  const map = {
    active: { bg: C.greenSoft, fg: C.green, label: 'Active' },
    dry: { bg: C.brownSoft, fg: C.brown, label: 'Dry' },
    sold: { bg: C.greySoft, fg: C.grey, label: 'Sold' },
    calf: { bg: C.amberSoft, fg: C.amber, label: 'Calf' },
  };
  const s = map[status] || map.active;
  return (
    <span
      className="ff-body"
      style={{ background: s.bg, color: s.fg, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999 }}
    >
      {s.label}
    </span>
  );
}

function Chip({ children, bg, fg }) {
  return (
    <span className="ff-body" style={{ background: bg, color: fg, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999 }}>
      {children}
    </span>
  );
}

function PrintTable({ headers, rows }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 10 }}>
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
        <div style={{ fontSize: 15, fontWeight: 700 }}>{cow.name} — Tag #{cow.tagNumber}</div>
        <div style={{ fontSize: 12, color: '#444', marginTop: 4, lineHeight: 1.6 }}>
          Breed: {cow.breed} &nbsp;·&nbsp; DOB: {fmtDate(cow.dob)} &nbsp;·&nbsp; Status: {cow.status}<br />
          {cow.calvingDate && <>Last calving: {fmtDate(cow.calvingDate)} &nbsp;·&nbsp; </>}
          {cow.firstHeatDate && <>First heat: {fmtDate(cow.firstHeatDate)} &nbsp;·&nbsp; </>}
          {cow.inseminatedOn && <>Inseminated on: {fmtDate(cow.inseminatedOn)}</>}
          {cow.mastitisAntibiotic && <><br />Mastitis antibiotic: {cow.mastitisAntibiotic}</>}
          {cow.pregnancyConfirmed && cow.inseminatedOn && <><br />Pregnant — expected calving {fmtDate(addMonths(cow.inseminatedOn, 9))}</>}
        </div>
      </div>
      {milkRows.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, margin: '14px 0 6px' }}>Milk Records</div>
          <PrintTable headers={['Date', 'Session', 'Liters']} rows={milkRows} />
        </>
      )}
      {heatRows.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, margin: '14px 0 6px' }}>Heat Cycle Records</div>
          <PrintTable headers={['Date', 'Bred', 'Notes']} rows={heatRows} />
        </>
      )}
      {medRows.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, margin: '14px 0 6px' }}>Health Records</div>
          <PrintTable headers={['Date', 'Type', 'Medicine', 'Details', 'Vet', 'Next Due']} rows={medRows} />
        </>
      )}
      {milkRows.length === 0 && heatRows.length === 0 && medRows.length === 0 && (
        <div style={{ fontSize: 12, color: '#777', marginTop: 10 }}>No records logged for this cow yet.</div>
      )}
    </div>
  );
}

function PrintDocument({ job }) {
  if (!job) return null;
  return (
    <div style={{ padding: 28, fontFamily: 'Inter, sans-serif', color: '#111' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '2px solid #222', paddingBottom: 8, marginBottom: 18 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{job.title}</div>
        <div style={{ fontSize: 11, color: '#555' }}>Generated {fmtDate(todayStr())}</div>
      </div>
      {job.type === 'cow' ? (
        <CowPrintBody job={job} />
      ) : job.type === 'feed' ? (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, margin: '0 0 6px' }}>Summary</div>
          <PrintTable headers={job.summaryHeaders} rows={job.summaryRows} />
          <div style={{ fontWeight: 700, fontSize: 13, margin: '14px 0 6px' }}>Transactions</div>
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
  ]);
}
const COWS_HEADERS = ['Tag #', 'Name', 'Breed', 'Gender', 'Date of Birth', 'Status', 'Mother', 'Birth Weight (kg)', 'Last Calving', 'First Heat After Calving', 'Inseminated On', 'Mastitis Antibiotic'];

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
});
const cowToRow = (c, userId) => ({
  user_id: userId, name: c.name, tag_number: c.tagNumber, breed: c.breed, dob: c.dob || null, status: c.status,
  cycle_length: c.cycleLength, calving_date: c.calvingDate || null, first_heat_date: c.firstHeatDate || null,
  inseminated_on: c.inseminatedOn || null, pregnancy_confirmed: !!c.pregnancyConfirmed, mastitis_antibiotic: c.mastitisAntibiotic || null,
  mother_cow_id: c.motherCowId || null, birth_weight: c.birthWeight === '' || c.birthWeight == null ? null : c.birthWeight, gender: c.gender || null,
});
const mapMilkFromRow = (r) => ({ id: r.id, cowId: r.cow_id, date: r.date, session: r.session, liters: r.liters });
const milkToRow = (m, userId) => ({ user_id: userId, cow_id: m.cowId, date: m.date, session: m.session, liters: m.liters });
const mapHeatFromRow = (r) => ({ id: r.id, cowId: r.cow_id, date: r.date, bred: r.bred, notes: r.notes || '' });
const heatToRow = (h, userId) => ({ user_id: userId, cow_id: h.cowId, date: h.date, bred: !!h.bred, notes: h.notes || null });
const mapMedFromRow = (r) => ({ id: r.id, cowId: r.cow_id, date: r.date, type: r.type, medicine: r.medicine || '', description: r.description || '', vet: r.vet || '', nextDueDate: r.next_due_date || '' });
const medToRow = (m, userId) => ({ user_id: userId, cow_id: m.cowId, date: m.date, type: m.type, medicine: m.medicine || null, description: m.description || null, vet: m.vet || null, next_due_date: m.nextDueDate || null });
const mapFeedTypeFromRow = (r) => ({ id: r.id, name: r.name, costPerBag: r.cost_per_bag });

const mapPolicyFromRow = (r) => ({
  id: r.id, provider: r.provider, policyNumber: r.policy_number || '', coverageAmount: r.coverage_amount ?? '',
  premiumAmount: r.premium_amount ?? '', startDate: r.start_date || '', expiryDate: r.expiry_date || '', notes: r.notes || '',
});
const policyToRow = (p, userId) => ({
  user_id: userId, provider: p.provider, policy_number: p.policyNumber || null,
  coverage_amount: p.coverageAmount === '' ? null : p.coverageAmount, premium_amount: p.premiumAmount === '' ? null : p.premiumAmount,
  start_date: p.startDate || null, expiry_date: p.expiryDate || null, notes: p.notes || null,
});
const mapPaymentFromRow = (r) => ({ id: r.id, policyId: r.policy_id, date: r.date, amount: r.amount, kind: r.kind, notes: r.notes || '' });
const paymentToRow = (p, userId) => ({ user_id: userId, policy_id: p.policyId, date: p.date, amount: p.amount, kind: p.kind, notes: p.notes || null });
const mapPolicyCowFromRow = (r) => ({ id: r.id, policyId: r.policy_id, cowId: r.cow_id });
const feedTypeToRow = (f, userId) => ({ user_id: userId, name: f.name, cost_per_bag: f.costPerBag });
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
    <button onClick={onClick} title={title} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 10, padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 34, minHeight: 34, flexShrink: 0 }}>
      {icon}
    </button>
  );
}

function ScreenHeader({ title, subtitle, onBack, right }) {
  return (
    <div style={{ background: C.green, color: '#fff', padding: '18px 18px 16px', paddingTop: 'max(18px, calc(env(safe-area-inset-top) + 12px))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {onBack && (
          <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 10, padding: 8, display: 'flex', minWidth: 34, minHeight: 34, alignItems: 'center', justifyContent: 'center' }}>
            <ArrowLeft size={18} color="#fff" />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ff-display" style={{ fontSize: 19, fontWeight: 700 }}>{title}</div>
          {subtitle && <div className="ff-body" style={{ fontSize: 12.5, opacity: 0.75, marginTop: 1 }}>{subtitle}</div>}
        </div>
        {right}
      </div>
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
        position: 'absolute', right: 18, bottom: 88, background: C.green, color: '#fff',
        border: 'none', borderRadius: 999, padding: '13px 18px', display: 'flex', alignItems: 'center', gap: 6,
        fontWeight: 600, fontSize: 13.5, boxShadow: '0 8px 20px rgba(47,74,58,0.35)', zIndex: 20,
      }}
    >
      <Plus size={16} /> {label}
    </button>
  );
}

function EmptyState({ icon, title, subtitle, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: C.sub }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, color: C.grey }}>{icon}</div>
      <div className="ff-display" style={{ color: C.ink, fontWeight: 700, fontSize: 15.5, marginBottom: 4 }}>{title}</div>
      <div className="ff-body" style={{ fontSize: 13, lineHeight: 1.5 }}>{subtitle}</div>
      {action}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="ff-body" style={{ fontSize: 12, fontWeight: 600, color: C.sub, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%', border: `1.5px solid ${C.line}`, borderRadius: 10, padding: '10px 12px',
  fontSize: 14, fontFamily: 'Inter, sans-serif', color: C.ink, background: '#fff', outline: 'none', boxSizing: 'border-box',
};

function Modal({ title, onClose, children }) {
  return ReactDOM.createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,46,34,0.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: C.bg, width: '100%', maxWidth: 420, maxHeight: '86%', overflowY: 'auto', borderRadius: '20px 20px 0 0', padding: 18, paddingBottom: 'max(18px, calc(env(safe-area-inset-bottom) + 14px))' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <div className="ff-display" style={{ fontWeight: 700, fontSize: 16.5, color: C.ink, flex: 1 }}>{title}</div>
          <button onClick={onClose} style={{ background: C.greySoft, border: 'none', borderRadius: 8, padding: 6 }}>
            <X size={16} color={C.ink} />
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
        width: '100%', background: danger ? C.rust : C.green, color: '#fff', border: 'none', borderRadius: 12,
        padding: '12px 0', fontWeight: 700, fontSize: 14.5, opacity: disabled ? 0.5 : 1, marginTop: 4,
      }}
    >
      {children}
    </button>
  );
}

// ---------- Segmented select ----------
function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className="ff-body"
          style={{
            border: `1.5px solid ${value === opt ? C.green : C.line}`,
            background: value === opt ? C.greenSoft : '#fff',
            color: value === opt ? C.green : C.sub,
            borderRadius: 999, padding: '7px 13px', fontSize: 12.5, fontWeight: 600,
          }}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

// ================= MAIN APP =================
// function ManageAccessModal({ ownerId, onClose }) {
//   const [members, setMembers] = useState([]);
//   const [invites, setInvites] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [email, setEmail] = useState('');
//   const [role, setRole] = useState('viewer');
//   const [busy, setBusy] = useState(false);
//   const [error, setError] = useState('');

//   const load = async () => {
//     setLoading(true);
//     const [{ data: acc }, { data: inv }] = await Promise.all([
//       supabase.from('farm_access').select('*').eq('owner_id', ownerId),
//       supabase.from('farm_invites').select('*').eq('owner_id', ownerId),
//     ]);
//     setMembers(acc || []);
//     setInvites(inv || []);
//     setLoading(false);
//   };

//   useEffect(() => { load(); }, []);

//   const sendInvite = async () => {
//     setError('');
//     if (!email.trim() || !email.includes('@')) { setError('Enter a valid email address.'); return; }
//     setBusy(true);
//     const { error: err } = await supabase.from('farm_invites').insert({ owner_id: ownerId, email: email.trim().toLowerCase(), role });
//     setBusy(false);
//     if (err) { setError('Could not send invite. Please try again.'); return; }
//     setEmail('');
//     load();
//   };

//   const cancelInvite = async (id) => {
//     await supabase.from('farm_invites').delete().eq('id', id);
//     load();
//   };

//   const revokeAccess = async (id) => {
//     await supabase.from('farm_access').delete().eq('id', id);
//     load();
//   };

//   return (
//     <Modal title="Manage Access" onClose={onClose}>
//       <div className="ff-body" style={{ fontSize: 12, color: C.sub, marginBottom: 16, lineHeight: 1.5 }}>
//         Invite people by email to see this farm. <strong>Master</strong> can add, edit, and delete just like you. <strong>Viewer</strong> can only look, not change anything.
//       </div>

//       <Field label="Invite by email">
//         <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="someone@example.com" style={inputStyle} />
//       </Field>
//       <Field label="Role">
//         <Segmented options={['viewer', 'master']} value={role} onChange={setRole} />
//       </Field>
//       {error && <div style={{ background: C.rustSoft, color: C.rust, borderRadius: 10, padding: 10, fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
//       <PrimaryButton disabled={busy} onClick={sendInvite}>{busy ? 'Sending…' : 'Send invite'}</PrimaryButton>

//       {loading ? (
//         <div style={{ fontSize: 12.5, color: C.sub, marginTop: 20 }}>Loading…</div>
//       ) : (
//         <>
//           {invites.length > 0 && (
//             <>
//               <SectionTitle title="Pending invites" />
//               <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
//                 {invites.map((inv) => (
//                   <div key={inv.id} style={rowCardStyle}>
//                     <Mail size={16} color={C.grey} />
//                     <div style={{ flex: 1, marginLeft: 10 }}>
//                       <div className="ff-display" style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>{inv.email}</div>
//                       <div style={{ fontSize: 11, color: C.sub }}>Waiting to accept · {inv.role === 'master' ? 'Master' : 'Viewer'}</div>
//                     </div>
//                     <button onClick={() => cancelInvite(inv.id)} style={{ background: C.greySoft, border: 'none', borderRadius: 8, padding: 6 }}><X size={14} color={C.ink} /></button>
//                   </div>
//                 ))}
//               </div>
//             </>
//           )}

//           <SectionTitle title="People with access" />
//           {members.length === 0 ? (
//             <MutedNote text="No one else has access to this farm yet." />
//           ) : (
//             <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
//               {members.map((m) => (
//                 <div key={m.id} style={rowCardStyle}>
//                   {m.role === 'master' ? <UserPlus size={16} color={C.green} /> : <Eye size={16} color={C.grey} />}
//                   <div style={{ flex: 1, marginLeft: 10 }}>
//                     <div className="ff-display" style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>{m.email || 'Member'}</div>
//                     <div style={{ fontSize: 11, color: C.sub }}>{m.role === 'master' ? 'Master — can edit' : 'Viewer — read only'}</div>
//                   </div>
//                   <button onClick={() => revokeAccess(m.id)} style={{ background: C.rustSoft, border: 'none', borderRadius: 8, padding: 6 }}><Trash2 size={14} color={C.rust} /></button>
//                 </div>
//               ))}
//             </div>
//           )}
//         </>
//       )}
//     </Modal>
//   );
// }

// function ManageAccessModal({ ownerId, onClose }) {
//   const [invites, setInvites] = useState([]);
//   const [members, setMembers] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [email, setEmail] = useState('');
//   const [role, setRole] = useState('viewer');
//   const [busy, setBusy] = useState(false);
//   const [error, setError] = useState('');

//   const load = async () => {
//     setLoading(true);
//     const [{ data: inv }, { data: mem }] = await Promise.all([
//       supabase.from('farm_invites').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }),
//       supabase.from('farm_access').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }),
//     ]);
//     setInvites(inv || []);
//     setMembers(mem || []);
//     setLoading(false);
//   };

//   useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

//   const sendInvite = async () => {
//     setError('');
//     if (!email.trim() || !email.includes('@')) { setError('Enter a valid email address.'); return; }
//     setBusy(true);
//     const { error: err } = await supabase.from('farm_invites').insert({ owner_id: ownerId, email: email.trim().toLowerCase(), role });
//     setBusy(false);
//     if (err) { setError('Could not send invite. Please try again.'); return; }
//     setEmail('');
//     load();
//   };

//   const cancelInvite = async (id) => {
//     await supabase.from('farm_invites').delete().eq('id', id);
//     load();
//   };

//   const revokeMember = async (id) => {
//     await supabase.from('farm_access').delete().eq('id', id);
//     load();
//   };

//   return (
//     <Modal title="Manage Access" onClose={onClose}>
//       <div className="ff-body" style={{ fontSize: 12.5, color: C.sub, marginBottom: 16, lineHeight: 1.5 }}>
//         Invite people by email to see this same farm. <strong>Master</strong> can add, edit, and delete just like you. <strong>Viewer</strong> can only look — nothing they do can change your data.
//       </div>

//       <Field label="Invite by email">
//         <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="someone@example.com" style={inputStyle} />
//       </Field>
//       <Field label="Role">
//         <Segmented options={['viewer', 'master']} value={role} onChange={setRole} />
//       </Field>
//       {error && <div style={{ background: C.rustSoft, color: C.rust, borderRadius: 10, padding: 10, fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
//       <PrimaryButton disabled={busy} onClick={sendInvite}>{busy ? 'Sending…' : 'Send invite'}</PrimaryButton>

//       <div style={{ marginTop: 22 }}>
//         <SectionTitle title="Pending invites" />
//         {loading ? (
//           <MutedNote text="Loading…" />
//         ) : invites.length === 0 ? (
//           <MutedNote text="No pending invites. Sent invites are accepted automatically the moment that person logs in with the same email." />
//         ) : (
//           <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
//             {invites.map((inv) => (
//               <div key={inv.id} style={rowCardStyle}>
//                 <Mail size={16} color={C.grey} />
//                 <div style={{ flex: 1, marginLeft: 10 }}>
//                   <div className="ff-display" style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>{inv.email}</div>
//                   <div style={{ fontSize: 11, color: C.sub }}>Waiting to accept · {inv.role}</div>
//                 </div>
//                 <button onClick={() => cancelInvite(inv.id)} style={{ background: C.greySoft, border: 'none', borderRadius: 8, padding: 6 }}><X size={14} color={C.ink} /></button>
//               </div>
//             ))}
//           </div>
//         )}

//         <SectionTitle title="People with access" />
//         {loading ? (
//           <MutedNote text="Loading…" />
//         ) : members.length === 0 ? (
//           <MutedNote text="Nobody else has access to this farm yet." />
//         ) : (
//           <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
//             {members.map((m) => (
//               <div key={m.id} style={rowCardStyle}>
//                 {m.role === 'master' ? <UserPlus size={16} color={C.green} /> : <Eye size={16} color={C.grey} />}
//                 <div style={{ flex: 1, marginLeft: 10 }}>
//                   <div className="ff-display" style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>{m.email || 'Member'}</div>
//                   <div style={{ fontSize: 11, color: C.sub }}>{m.role === 'master' ? 'Master access' : 'View only'}</div>
//                 </div>
//                 <button onClick={() => revokeMember(m.id)} style={{ background: C.rustSoft, border: 'none', borderRadius: 8, padding: 6 }}><Trash2 size={14} color={C.rust} /></button>
//               </div>
//             ))}
//           </div>
//         )}
//       </div>
//     </Modal>
//   );
// }

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
    <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', background: C.bg }}>
      {FONTS}
      <div className="ff-body" style={{ width: '100%', maxWidth: 420, padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <CowIcon size={28} color={C.green} />
          </div>
          <div className="ff-display" style={{ fontWeight: 700, fontSize: 20, color: C.ink }}>Dairy Farm Manager</div>
          <div style={{ fontSize: 12.5, color: C.sub, marginTop: 4 }}>{mode === 'login' ? 'Log in to your farm' : 'Create your account'}</div>
        </div>

        <Field label="Email">
          <div style={{ position: 'relative' }}>
            <Mail size={15} color={C.grey} style={{ position: 'absolute', left: 12, top: 12 }} />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={{ ...inputStyle, paddingLeft: 34 }} />
          </div>
        </Field>
        <Field label="Password">
          <div style={{ position: 'relative' }}>
            <Lock size={15} color={C.grey} style={{ position: 'absolute', left: 12, top: 12 }} />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" style={{ ...inputStyle, paddingLeft: 34 }} />
          </div>
        </Field>

        {error && <div style={{ background: C.rustSoft, color: C.rust, borderRadius: 10, padding: 10, fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
        {info && <div style={{ background: C.greenSoft, color: C.green, borderRadius: 10, padding: 10, fontSize: 12.5, marginBottom: 12 }}>{info}</div>}

        <PrimaryButton disabled={busy} onClick={submit}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
        </PrimaryButton>

        <button
          onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setInfo(''); }}
          className="ff-body"
          style={{ marginTop: 14, background: 'none', border: 'none', color: C.green, fontSize: 12.5, fontWeight: 600, textAlign: 'center' }}
        >
          {mode === 'login' ? "New here? Create an account" : 'Already have an account? Log in'}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [cows, setCows] = useState([]);
  const [milk, setMilk] = useState([]);
  const [heat, setHeat] = useState([]);
  const [medical, setMedical] = useState([]);
  const [feedTypes, setFeedTypes] = useState([]);
  const [feedTransactions, setFeedTransactions] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [policyCows, setPolicyCows] = useState([]);
  const [payments, setPayments] = useState([]);
  const [tab, setTab] = useState('home');
  const [openCowId, setOpenCowId] = useState(null);
  const [modal, setModal] = useState(null); // {type, cowId?, editId?}
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
      // 1) Accept any pending invite addressed to my email
      const { data: invites } = await supabase.from('farm_invites').select('*');
      if (invites && invites.length) {
        for (const inv of invites) {
          await supabase.from('farm_access').insert({ owner_id: inv.owner_id, viewer_id: myId, email: myEmail, role: inv.role });
          await supabase.from('farm_invites').delete().eq('id', inv.id);
        }
      }
      // 2) Am I someone else's shared user?
      const { data: access } = await supabase.from('farm_access').select('*').eq('viewer_id', myId).limit(1);
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
      const [c, m, h, med, ft, tx, pol, pc, pay] = await Promise.all([
        fetchTable('cows', mapCowFromRow),
        fetchTable('milk_records', mapMilkFromRow, 'date'),
        fetchTable('heat_records', mapHeatFromRow, 'date'),
        fetchTable('medical_records', mapMedFromRow, 'date'),
        fetchTable('feed_types', mapFeedTypeFromRow),
        fetchTable('feed_transactions', mapFeedTxnFromRow, 'date'),
        fetchTable('insurance_policies', mapPolicyFromRow),
        fetchTable('insurance_policy_cows', mapPolicyCowFromRow),
        fetchTable('insurance_payments', mapPaymentFromRow, 'date'),
      ]);
      setCows(c); setMilk(m); setHeat(h); setMedical(med); setFeedTypes(ft); setFeedTransactions(tx);
      setPolicies(pol); setPolicyCows(pc); setPayments(pay);
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
      setCows([]); setMilk([]); setHeat([]); setMedical([]); setFeedTypes([]); setFeedTransactions([]); setPolicies([]); setPolicyCows([]); setPayments([]); setLoaded(true);
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
  const heatAlerts = useMemo(() => activeCows.map((c) => ({ cow: c, ...heatStatusFor(c) })).filter((x) => x.status === 'due' || x.status === 'overdue'), [activeCows, heat]);
  const insemAlerts = useMemo(() => activeCows.map((c) => ({ cow: c, ...inseminationStatusFor(c) })).filter((x) => x.status === 'due'), [activeCows]);
  const medDue = useMemo(() => {
    return medical.filter((m) => m.nextDueDate && diffDays(m.nextDueDate) <= 7).sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
  }, [medical]);
  const insuranceAlerts = useMemo(() => {
    return policies.filter((p) => { const s = policyStatus(p).status; return s === 'expiring' || s === 'expired'; });
  }, [policies]);

  const cowById = (id) => cows.find((c) => c.id === id);

  if (configMissing) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, padding: 24 }}>
        {FONTS}
        <div className="ff-body" style={{ maxWidth: 380, textAlign: 'center', color: C.ink }}>
          <div className="ff-display" style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Setup needed</div>
          <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.6 }}>
            This app needs its Supabase connection details set as environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY) when it's deployed. Check the SETUP.md instructions that came with this project.
          </div>
        </div>
      </div>
    );
  }

  if (session === undefined) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        {FONTS}
        <div className="ff-body" style={{ color: C.sub, fontSize: 13 }}>Loading…</div>
      </div>
    );
  }

  if (session === null) {
    return <AuthScreen />;
  }

  if (!loaded) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        {FONTS}
        <div className="ff-body" style={{ color: C.sub, fontSize: 13 }}>Loading your farm…</div>
      </div>
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
              onBack={() => setOpenCowId(null)}
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
              onAddCalf={() => setModal({ type: 'cow', defaultStatus: 'calf', defaultMotherId: openCowId })}
              onOpenCow={setOpenCowId}
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
                  onOpenCow={setOpenCowId} onGoTab={setTab}
                  onBackup={handleBackupClick} onRestore={handleRestoreClick} onSignOut={handleSignOut}
                  onManageAccess={() => setModal({ type: 'manageAccess' })}
                  userEmail={session?.user?.email}
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
                />
              )}
              {tab === 'heat' && (
                <HeatScreen cows={activeCows} heat={heat} heatStatusFor={heatStatusFor} cowById={cowById} onAdd={() => setModal({ type: 'heat' })} onOpenCow={setOpenCowId} onEditHeat={onEditHeat} onDeleteHeat={onDeleteHeat} />
              )}
              {tab === 'health' && (
                <HealthScreen
                  medical={medical} cowById={cowById} onAdd={() => setModal({ type: 'medical' })}
                  onExport={(kind) => {
                    const rows = medExportRows(medical, cowById);
                    if (kind === 'print') setPrintJob({ type: 'list', title: 'Health Records', headers: MED_HEADERS, rows });
                    else downloadFile('health_records.csv', toCSV(MED_HEADERS, rows));
                  }}
                />
              )}
              {tab === 'feed' && (
                <FeedScreen
                  feedTypes={feedTypes} feedTransactions={feedTransactions}
                  onAddType={() => setModal({ type: 'feedType' })}
                  onEditType={(id) => setModal({ type: 'feedType', editId: id })}
                  onDeleteType={async (id) => {
                    await supabase.from('feed_types').delete().eq('id', id);
                    setFeedTypes(feedTypes.filter((f) => f.id !== id));
                    setFeedTransactions(feedTransactions.filter((t) => t.feedTypeId !== id));
                  }}
                  onLogTxn={(feedTypeId, kind) => setModal({ type: 'feedTxn', feedTypeId, kind })}
                  onExport={(kind) => {
                    const summaryHeaders = ['Feed Type', 'Cost/Bag (₹)', 'Bags Left', 'Purchased (Total)', 'Used (Total)', 'Amount Debited (₹)', 'Stock Value / Saved (₹)'];
                    const summaryRows = feedTypes.map((f) => [
                      f.name, f.costPerBag, feedStock(f.id, feedTransactions), feedTotalPurchased(f.id, feedTransactions),
                      feedTotalUsed(f.id, feedTransactions), feedTotalDebited(f.id, feedTransactions).toFixed(0), feedStockValue(f, feedTransactions).toFixed(0),
                    ]);
                    const txnHeaders = ['Date', 'Feed Type', 'Transaction', 'Bags', 'Cost (₹)', 'Notes'];
                    const txnRows = feedTransactions.slice().sort((a, b) => a.date.localeCompare(b.date)).map((t) => {
                      const ft = feedTypes.find((f) => f.id === t.feedTypeId);
                      return [fmtDate(t.date), ft ? ft.name : 'Unknown', t.kind === 'purchase' ? 'Purchased' : 'Used', t.bags, t.kind === 'purchase' ? (t.cost || '') : '', t.notes || ''];
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
              {tab === 'insurance' && (
                <InsuranceScreen
                  policies={policies} policyCows={policyCows} payments={payments} cows={cows} cowById={cowById}
                  onAddPolicy={() => setModal({ type: 'policy' })}
                  onEditPolicy={(id) => setModal({ type: 'policy', editId: id })}
                  onDeletePolicy={async (id) => {
                    await supabase.from('insurance_policies').delete().eq('id', id);
                    setPolicies(policies.filter((p) => p.id !== id));
                    setPolicyCows(policyCows.filter((pc) => pc.policyId !== id));
                    setPayments(payments.filter((p) => p.policyId !== id));
                  }}
                  onLogPayment={(policyId) => setModal({ type: 'policyPayment', policyId })}
                  onExport={(kind) => {
                    const summaryHeaders = ['Provider', 'Policy #', 'Covered Animals', 'Coverage (₹)', 'Premium (₹)', 'Start Date', 'Expiry Date', 'Paid (Total ₹)', 'Status'];
                    const summaryRows = policies.map((p) => {
                      const covered = policyCows.filter((pc) => pc.policyId === p.id).map((pc) => cowById(pc.cowId)?.name).filter(Boolean).join(', ');
                      const st = policyStatus(p);
                      return [p.provider, p.policyNumber || '', covered, p.coverageAmount || '', p.premiumAmount || '', p.startDate ? fmtDate(p.startDate) : '', p.expiryDate ? fmtDate(p.expiryDate) : '', policyTotalPaid(p.id, payments).toFixed(0), st.status];
                    });
                    const paymentHeaders = ['Date', 'Provider', 'Policy #', 'Kind', 'Amount (₹)', 'Notes'];
                    const paymentRows = payments.slice().sort((a, b) => a.date.localeCompare(b.date)).map((pay) => {
                      const p = policies.find((x) => x.id === pay.policyId);
                      return [fmtDate(pay.date), p ? p.provider : 'Unknown', p ? p.policyNumber || '' : '', pay.kind, pay.amount, pay.notes || ''];
                    });
                    if (kind === 'print') {
                      setPrintJob({ type: 'feed', title: 'Insurance Report', summaryHeaders, summaryRows, txnHeaders: paymentHeaders, txnRows: paymentRows });
                    } else {
                      const csv = ['POLICIES', toCSV(summaryHeaders, summaryRows), '', 'PAYMENTS', toCSV(paymentHeaders, paymentRows)].join('\n');
                      downloadFile('insurance_records.csv', csv);
                    }
                  }}
                />
              )}
            </div>
          )}
          </div>

          {!openCowId && <BottomNav tab={tab} setTab={setTab} />}

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
              cows={cows} defaultCowId={modal.cowId}
              onClose={() => setModal(null)}
              onSave={async (data) => {
                const { data: row, error } = await supabase.from('milk_records').insert(milkToRow(data, userId)).select().single();
                if (!error) setMilk([...milk, mapMilkFromRow(row)]);
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
              cows={activeCows} defaultCowId={modal.cowId}
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
              onClose={() => setModal(null)}
              onSave={async ({ cowIds, ...rest }) => {
                const rowsToInsert = cowIds.map((cid) => medToRow({ ...rest, cowId: cid }, userId));
                const { data: rows, error } = await supabase.from('medical_records').insert(rowsToInsert).select();
                if (!error && rows) setMedical([...medical, ...rows.map(mapMedFromRow)]);
                setModal(null);
              }}
            />
          )}

          {modal && modal.type === 'feedType' && (
            <FeedTypeForm
              initial={modal.editId ? feedTypes.find((f) => f.id === modal.editId) : null}
              onClose={() => setModal(null)}
              onSave={async (data) => {
                if (modal.editId) {
                  await supabase.from('feed_types').update(feedTypeToRow(data, userId)).eq('id', modal.editId);
                  setFeedTypes(feedTypes.map((f) => (f.id === modal.editId ? { ...f, ...data } : f)));
                } else {
                  const { data: row, error } = await supabase.from('feed_types').insert(feedTypeToRow(data, userId)).select().single();
                  if (!error) setFeedTypes([...feedTypes, mapFeedTypeFromRow(row)]);
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
                if (!error) setFeedTransactions([...feedTransactions, mapFeedTxnFromRow(row)]);
                setModal(null);
              }}
            />
          )}

          {modal && modal.type === 'policy' && (
            <PolicyForm
              cows={cows}
              initial={modal.editId ? policies.find((p) => p.id === modal.editId) : null}
              initialCowIds={modal.editId ? policyCows.filter((pc) => pc.policyId === modal.editId).map((pc) => pc.cowId) : []}
              onClose={() => setModal(null)}
              onSave={async ({ cowIds, ...data }) => {
                let policyId = modal.editId;
                if (modal.editId) {
                  await supabase.from('insurance_policies').update(policyToRow(data, userId)).eq('id', modal.editId);
                  setPolicies(policies.map((p) => (p.id === modal.editId ? { ...p, ...data } : p)));
                  await supabase.from('insurance_policy_cows').delete().eq('policy_id', modal.editId);
                  setPolicyCows(policyCows.filter((pc) => pc.policyId !== modal.editId));
                } else {
                  const { data: row, error } = await supabase.from('insurance_policies').insert(policyToRow(data, userId)).select().single();
                  if (error || !row) { setModal(null); return; }
                  policyId = row.id;
                  setPolicies([...policies, mapPolicyFromRow(row)]);
                }
                if (cowIds.length) {
                  const linkRows = cowIds.map((cid) => ({ policy_id: policyId, cow_id: cid }));
                  const { data: links, error: linkErr } = await supabase.from('insurance_policy_cows').insert(linkRows).select();
                  if (!linkErr && links) setPolicyCows((prev) => [...prev, ...links.map(mapPolicyCowFromRow)]);
                }
                setModal(null);
              }}
            />
          )}

          {modal && modal.type === 'policyPayment' && (
            <PolicyPaymentForm
              policy={policies.find((p) => p.id === modal.policyId)}
              onClose={() => setModal(null)}
              onSave={async (data) => {
                const { data: row, error } = await supabase.from('insurance_payments').insert(paymentToRow({ ...data, policyId: modal.policyId }, userId)).select().single();
                if (!error) setPayments([...payments, mapPaymentFromRow(row)]);
                setModal(null);
              }}
            />
          )}

          {/* {modal && modal.type === 'manageAccess' && (
            <ManageAccessModal ownerId={session.user.id} onClose={() => setModal(null)} />
          )} */}

          <input ref={fileInputRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={handleFileSelected} />

          {restorePending && (
            <Modal title="Restore this backup?" onClose={() => setRestorePending(null)}>
              <div style={{ fontSize: 13, color: C.sub, marginBottom: 14, lineHeight: 1.5 }}>
                This will replace everything currently in the app — {(restorePending.cows || []).length} cow(s), {(restorePending.milk || []).length} milk record(s), {(restorePending.medical || []).length} health record(s) — with the data from this backup file
                {restorePending.exportedAt ? ` (saved ${fmtDate(restorePending.exportedAt.slice(0, 10))})` : ''}. This can't be undone.
              </div>
              <PrimaryButton onClick={applyRestore}>Replace with backup data</PrimaryButton>
            </Modal>
          )}

          {restoreMsg && (
            <Modal title="Couldn't restore" onClose={() => setRestoreMsg('')}>
              <div style={{ fontSize: 13, color: C.sub, marginBottom: 14 }}>{restoreMsg}</div>
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
    { key: 'insurance', label: 'Insure', icon: Shield },
  ];
  return (
    <div style={{ flexShrink: 0, background: '#fff', borderTop: `1px solid ${C.line}`, display: 'flex', padding: '7px 2px', paddingBottom: 'max(9px, calc(env(safe-area-inset-bottom) + 5px))', zIndex: 30 }}>
      {items.map(({ key, label, icon: Icon }) => {
        const active = tab === key;
        return (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="ff-body"
            style={{ flex: 1, background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, color: active ? C.green : C.grey, padding: '3px 0', minHeight: 40 }}
          >
            <Icon size={18} strokeWidth={active ? 2.4 : 2} />
            <span style={{ fontSize: 9.5, fontWeight: active ? 700 : 500 }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------- Home ----------
function HomeScreen({ cows, milkToday, heatAlerts, medDue, insemAlerts, insuranceAlerts, onOpenCow, onGoTab, onBackup, onRestore, onSignOut, onManageAccess, userEmail }) {
  const { role, isReadOnly } = useContext(RoleContext);
  return (
    <div>
      <ScreenHeader
        title="Esh Farm" subtitle={`${cows.length} cow${cows.length === 1 ? '' : 's'} on record`}
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <HeaderIconButton title="Backup all data" icon={<Download size={15} color="#fff" />} onClick={onBackup} />
            {!isReadOnly && <HeaderIconButton title="Restore from backup" icon={<Upload size={15} color="#fff" />} onClick={onRestore} />}
            {role === 'owner' && <HeaderIconButton title="Manage access" icon={<Users size={15} color="#fff" />} onClick={onManageAccess} />}
            <HeaderIconButton title="Sign out" icon={<LogOut size={15} color="#fff" />} onClick={onSignOut} />
          </div>
        }
      />
      <div style={{ padding: 16 }}>
        {userEmail && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: C.sub }}>Signed in as {userEmail}</div>
            {role !== 'owner' && (
              <Chip bg={role === 'master' ? C.greenSoft : C.greySoft} fg={role === 'master' ? C.green : C.grey}>
                {role === 'master' ? 'Master access' : 'View only'}
              </Chip>
            )}
          </div>
        )}
        {isReadOnly && (
          <div style={{ background: C.greySoft, borderRadius: 12, padding: '10px 12px', marginBottom: 12, fontSize: 11.5, color: C.grey, lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Eye size={14} /> You have view-only access to this farm — adding, editing, and deleting is turned off for your account.
          </div>
        )}
        <div style={{ background: C.milkSoft, borderRadius: 12, padding: '10px 12px', marginBottom: 16, fontSize: 11.5, color: C.milk, lineHeight: 1.5 }}>
          Tip: your data syncs automatically to any device you log into with this account. Use the download/upload icons above for an extra offline backup.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
          <StatCard label="Milk today" value={`${milkToday.toFixed(1)} L`} bg={C.milkSoft} fg={C.milk} icon={<Droplet size={16} />} onClick={() => onGoTab('milk')} />
          <StatCard label="Active cows" value={cows.filter((c) => c.status === 'active').length} bg={C.greenSoft} fg={C.green} icon={<CowIcon size={16} />} onClick={() => onGoTab('cows')} />
          <StatCard label="Heat alerts" value={heatAlerts.length} bg={C.rustSoft} fg={C.rust} icon={<HeartPulse size={16} />} onClick={() => onGoTab('heat')} />
          <StatCard label="Health due" value={medDue.length} bg={C.amberSoft} fg={C.amber} icon={<Stethoscope size={16} />} onClick={() => onGoTab('health')} />
        </div>

        <SectionTitle title="Insemination checks" />
        {insemAlerts.length === 0 ? (
          <MutedNote text="No pregnancy / repeat-heat checks due right now." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
            {insemAlerts.map(({ cow, daysUntil }) => (
              <div key={cow.id} onClick={() => onOpenCow(cow.id)} style={rowCardStyle}>
                <EarTag number={cow.tagNumber} size="sm" />
                <div style={{ flex: 1, marginLeft: 10 }}>
                  <div className="ff-display" style={{ fontWeight: 700, fontSize: 13.5, color: C.ink }}>{cow.name}</div>
                  <div style={{ fontSize: 11.5, color: C.sub }}>
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
              <div key={cow.id} onClick={() => onOpenCow(cow.id)} style={rowCardStyle}>
                <EarTag number={cow.tagNumber} size="sm" />
                <div style={{ flex: 1, marginLeft: 10 }}>
                  <div className="ff-display" style={{ fontWeight: 700, fontSize: 13.5, color: C.ink }}>{cow.name}</div>
                  <div style={{ fontSize: 11.5, color: C.sub }}>{status === 'overdue' ? `${Math.abs(daysUntil)} days overdue` : `Due in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`}</div>
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
                <div key={m.id} onClick={() => cow && onOpenCow(cow.id)} style={rowCardStyle}>
                  {cow && <EarTag number={cow.tagNumber} size="sm" />}
                  <div style={{ flex: 1, marginLeft: 10 }}>
                    <div className="ff-display" style={{ fontWeight: 700, fontSize: 13.5, color: C.ink }}>{cow ? cow.name : 'Unknown'} · {m.type}</div>
                    <div style={{ fontSize: 11.5, color: C.sub }}>Follow-up {fmtDateShort(m.nextDueDate)}</div>
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
              {insuranceAlerts.slice(0, 5).map((p) => {
                const st = policyStatus(p);
                return (
                  <div key={p.id} onClick={() => onGoTab('insurance')} style={rowCardStyle}>
                    <Shield size={16} color={st.status === 'expired' ? C.rust : C.amber} />
                    <div style={{ flex: 1, marginLeft: 10 }}>
                      <div className="ff-display" style={{ fontWeight: 700, fontSize: 13.5, color: C.ink }}>{p.provider}{p.policyNumber ? ` · #${p.policyNumber}` : ''}</div>
                      <div style={{ fontSize: 11.5, color: C.sub }}>{st.status === 'expired' ? `Expired ${fmtDateShort(p.expiryDate)}` : `Expires ${fmtDateShort(p.expiryDate)}`}</div>
                    </div>
                    <Chip bg={st.status === 'expired' ? C.rustSoft : C.amberSoft} fg={st.status === 'expired' ? C.rust : C.amber}>{st.status === 'expired' ? 'Expired' : 'Expiring'}</Chip>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, bg, fg, icon, onClick }) {
  return (
    <button onClick={onClick} style={{ background: bg, borderRadius: 14, padding: '12px 14px', textAlign: 'left', border: 'none' }}>
      <div style={{ color: fg, marginBottom: 8 }}>{icon}</div>
      <div className="ff-display" style={{ fontWeight: 700, fontSize: 20, color: fg }}>{value}</div>
      <div className="ff-body" style={{ fontSize: 11.5, color: fg, opacity: 0.8, fontWeight: 600 }}>{label}</div>
    </button>
  );
}

function SectionTitle({ title }) {
  return <div className="ff-display" style={{ fontWeight: 700, fontSize: 13.5, color: C.ink, marginBottom: 8, marginTop: 4 }}>{title}</div>;
}

function MutedNote({ text }) {
  return <div className="ff-body" style={{ fontSize: 12.5, color: C.sub, background: '#fff', borderRadius: 12, padding: 14, marginBottom: 18, border: `1px solid ${C.line}` }}>{text}</div>;
}

const rowCardStyle = { background: '#fff', borderRadius: 12, padding: 10, display: 'flex', alignItems: 'center', border: `1px solid ${C.line}`, cursor: 'pointer' };

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
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: C.green, color: '#fff', border: 'none', borderRadius: 12, padding: '11px 0', fontWeight: 700, fontSize: 13 }}
          >
            <Plus size={15} /> Add cow
          </button>
          <button
            onClick={onAddCalf}
            className="ff-body"
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: C.amberSoft, color: C.amber, border: 'none', borderRadius: 12, padding: '11px 0', fontWeight: 700, fontSize: 13 }}
          >
            <Baby size={15} /> Add calf
          </button>
        </div>
        )}
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search size={15} color={C.grey} style={{ position: 'absolute', left: 12, top: 11 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, tag, breed" style={{ ...inputStyle, paddingLeft: 34 }} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <Segmented
            options={['All', 'Active', 'Dry', 'Calf', 'Pregnant']}
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
                <div key={cow.id} onClick={() => onOpenCow(cow.id)} style={{ ...rowCardStyle, padding: 12 }}>
                  <EarTag number={cow.tagNumber} tone={earTagTone(cow.status)} />
                  <div style={{ flex: 1, marginLeft: 12 }}>
                    <div className="ff-display" style={{ fontWeight: 700, fontSize: 14.5, color: C.ink }}>{cow.name}</div>
                    <div style={{ fontSize: 11.5, color: C.sub, marginTop: 1 }}>
                      {cow.breed}{cow.dob ? ` · ${fmtDateShort(cow.dob)}` : ''}
                      {cow.status === 'calf' && cow.motherCowId && nameById[cow.motherCowId] ? ` · Mother: ${nameById[cow.motherCowId]}` : ''}
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
function CowDetail({ cow, milk, heat, medical, allCows, heatStatus, insemStatus, onBack, onEdit, onDelete, onAddMilk, onAddHeat, onAddMedical, onAddCalf, onOpenCow, onEditHeat, onDeleteHeat, onExport }) {
  const { isReadOnly } = useContext(RoleContext);
  const [sub, setSub] = useState('milk');
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
          !isReadOnly && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={onEdit} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 10, padding: 8, minWidth: 34, minHeight: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Pencil size={15} color="#fff" /></button>
              <button onClick={() => setConfirmDel(true)} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 10, padding: 8, minWidth: 34, minHeight: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={15} color="#fff" /></button>
            </div>
          )
        }
      />
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, marginBottom: 16 }}>
          <EarTag number={cow.tagNumber} size="lg" tone={earTagTone(cow.status)} />
          <div style={{ flex: 1 }}>
            <StatusPill status={cow.status} />
            <div style={{ fontSize: 11.5, color: C.sub, marginTop: 6 }}>Born {fmtDate(cow.dob)}</div>
            {cow.status === 'calf' ? (
              <>
                {cow.gender && <div style={{ fontSize: 11.5, color: C.sub }}>Gender: {cow.gender}</div>}
                {mother && <div style={{ fontSize: 11.5, color: C.sub }}>Mother: {mother.name} (#{mother.tagNumber})</div>}
                {cow.birthWeight !== '' && cow.birthWeight != null && <div style={{ fontSize: 11.5, color: C.sub }}>Birth weight: {cow.birthWeight} kg</div>}
              </>
            ) : (
              <>
                <div style={{ fontSize: 11.5, color: C.sub }}>Heat cycle: every {cow.cycleLength || 21} days</div>
                {cow.calvingDate && <div style={{ fontSize: 11.5, color: C.sub }}>Last calving: {fmtDate(cow.calvingDate)}</div>}
                {cow.firstHeatDate && <div style={{ fontSize: 11.5, color: C.sub }}>First heat after calving: {fmtDate(cow.firstHeatDate)}</div>}
                {cow.inseminatedOn && <div style={{ fontSize: 11.5, color: C.sub }}>Inseminated on: {fmtDate(cow.inseminatedOn)}</div>}
                {cow.pregnancyConfirmed && cow.inseminatedOn && (
                  <div style={{ marginTop: 6 }}>
                    <Chip bg={C.greenSoft} fg={C.green}>Pregnant · Expected calving {fmtDate(addMonths(cow.inseminatedOn, 9))}</Chip>
                  </div>
                )}
              </>
            )}
            {cow.mastitisAntibiotic && <div style={{ marginTop: 6 }}><Chip bg={C.amberSoft} fg={C.amber}>Mastitis: {cow.mastitisAntibiotic}</Chip></div>}
            {offspring.length > 0 && <div style={{ fontSize: 11.5, color: C.sub, marginTop: 4 }}>Offspring on record: {offspring.length}</div>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button onClick={() => onExport('print')} className="ff-body" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#fff', border: `1.5px solid ${C.line}`, borderRadius: 10, padding: '9px 0', fontSize: 12.5, fontWeight: 600, color: C.ink }}>
            <Printer size={14} /> Print record
          </button>
          <button onClick={() => onExport('csv')} className="ff-body" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#fff', border: `1.5px solid ${C.line}`, borderRadius: 10, padding: '9px 0', fontSize: 12.5, fontWeight: 600, color: C.ink }}>
            <Download size={14} /> Download CSV
          </button>
        </div>

        {insemStatus && insemStatus.status !== 'none' && (
          <div style={{
            marginBottom: 16, borderRadius: 12, padding: 12,
            background: insemStatus.status === 'due' ? C.rustSoft : insemStatus.status === 'stale' ? C.greySoft : C.milkSoft,
          }}>
            <div className="ff-display" style={{ fontWeight: 700, fontSize: 13, color: insemStatus.status === 'due' ? C.rust : insemStatus.status === 'stale' ? C.grey : C.milk }}>
              {insemStatus.status === 'due'
                ? (insemStatus.daysUntil === 0 ? '20 days since insemination — check today' : `20-day check passed ${Math.abs(insemStatus.daysUntil)} day(s) ago`)
                : insemStatus.status === 'stale'
                ? '20-day insemination check window has passed'
                : `Insemination check in ${insemStatus.daysUntil} day(s)`}
            </div>
            <div style={{ fontSize: 11.5, color: C.sub, marginTop: 2 }}>Inseminated {fmtDate(cow.inseminatedOn)} · check for repeat heat / pregnancy around {fmtDate(insemStatus.checkDate)}</div>
          </div>
        )}

        {heatStatus.status !== 'none' && heatStatus.status !== 'pregnant' && (
          <div style={{
            marginBottom: 16, borderRadius: 12, padding: 12,
            background: heatStatus.status === 'overdue' ? C.rustSoft : heatStatus.status === 'due' ? C.amberSoft : C.greenSoft,
          }}>
            <div className="ff-display" style={{ fontWeight: 700, fontSize: 13, color: heatStatus.status === 'overdue' ? C.rust : heatStatus.status === 'due' ? C.amber : C.green }}>
              {heatStatus.status === 'overdue' ? `Heat overdue by ${Math.abs(heatStatus.daysUntil)} days` : heatStatus.status === 'due' ? `Heat due in ${heatStatus.daysUntil} day(s)` : `Next heat expected ${fmtDateShort(heatStatus.nextDate)}`}
            </div>
            <div style={{ fontSize: 11.5, color: C.sub, marginTop: 2 }}>Last recorded heat: {fmtDate(heatStatus.lastDate)}</div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          <Segmented options={['Milk', 'Heat', 'Health', 'Calves']} value={sub === 'milk' ? 'Milk' : sub === 'heat' ? 'Heat' : sub === 'health' ? 'Health' : 'Calves'} onChange={(v) => setSub(v.toLowerCase())} />
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
                  <div className="ff-display" style={{ fontWeight: 700, fontSize: 13.5, color: C.ink }}>{m.liters} L · {m.session}</div>
                  <div style={{ fontSize: 11.5, color: C.sub }}>{fmtDate(m.date)}</div>
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
                  <div className="ff-display" style={{ fontWeight: 700, fontSize: 13.5, color: C.ink }}>{fmtDate(h.date)}</div>
                  {h.notes && <div style={{ fontSize: 11.5, color: C.sub }}>{h.notes}</div>}
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
                  <div className="ff-display" style={{ fontWeight: 700, fontSize: 13.5, color: C.ink }}>{m.type}</div>
                  <div style={{ fontSize: 11.5, color: C.sub, marginTop: 1 }}>{fmtDate(m.date)}{m.vet ? ` · ${m.vet}` : ''}</div>
                  {m.medicine && <div style={{ fontSize: 12, color: C.ink, marginTop: 4 }}>Medicine: {m.medicine}</div>}
                  {m.nextDueDate && <div style={{ fontSize: 11, color: C.amber, marginTop: 4, fontWeight: 600 }}>Next due {fmtDateShort(m.nextDueDate)}</div>}
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
                  <div className="ff-display" style={{ fontWeight: 700, fontSize: 13.5, color: C.ink }}>{c.name}</div>
                  <div style={{ fontSize: 11.5, color: C.sub }}>
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
          <div style={{ fontSize: 13, color: C.sub, marginBottom: 14 }}>This deletes {cow.name}'s profile along with all of its milk, heat, and health records. This can't be undone.</div>
          <PrimaryButton danger onClick={onDelete}>Delete permanently</PrimaryButton>
        </Modal>
      )}
      {viewingMed && <HealthDetailModal record={viewingMed} cow={cow} onClose={() => setViewingMed(null)} />}
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
        <button onClick={onAdd} className="ff-body" style={{ width: '100%', border: `1.5px dashed ${C.green}55`, background: C.greenSoft, color: C.green, borderRadius: 12, padding: '10px 0', fontWeight: 700, fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
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
function MilkScreen({ cows, milk, cowById, onAdd, onExport }) {
  const [date, setDate] = useState(todayStr());
  const [sessionFilter, setSessionFilter] = useState('Both');
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
      <div key={m.id} style={rowCardStyle}>
        {cow && <EarTag number={cow.tagNumber} size="sm" />}
        <div style={{ flex: 1, marginLeft: 10 }}>
          <div className="ff-display" style={{ fontWeight: 700, fontSize: 13.5, color: C.ink }}>{cow ? cow.name : 'Unknown'}</div>
          <div style={{ fontSize: 11.5, color: C.sub }}>{m.session} session</div>
        </div>
        <div className="ff-display" style={{ fontWeight: 700, fontSize: 15, color: C.milk }}>{m.liters} L</div>
      </div>
    );
  };

  const renderCombined = (r) => {
    const cow = cowById(r.cowId);
    return (
      <div key={r.cowId} style={{ ...rowCardStyle, alignItems: 'flex-start' }}>
        {cow && <EarTag number={cow.tagNumber} size="sm" />}
        <div style={{ flex: 1, marginLeft: 10 }}>
          <div className="ff-display" style={{ fontWeight: 700, fontSize: 13.5, color: C.ink }}>{cow ? cow.name : 'Unknown'}</div>
          <div style={{ fontSize: 11.5, color: C.sub, marginTop: 1 }}>
            AM {r.am != null ? `${r.am} L` : '—'} &nbsp;·&nbsp; PM {r.pm != null ? `${r.pm} L` : '—'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="ff-display" style={{ fontWeight: 700, fontSize: 16, color: C.milk }}>{r.total.toFixed(1)} L</div>
          <div style={{ fontSize: 10, color: C.sub }}>total</div>
        </div>
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
              <div style={{ fontSize: 10.5, color: C.milk, fontWeight: 600 }}>AM total</div>
              <div className="ff-display" style={{ fontSize: 17, fontWeight: 700, color: C.milk }}>{amTotal.toFixed(1)} L</div>
            </div>
            <div style={{ background: C.milkSoft, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 10.5, color: C.milk, fontWeight: 600 }}>PM total</div>
              <div className="ff-display" style={{ fontSize: 17, fontWeight: 700, color: C.milk }}>{pmTotal.toFixed(1)} L</div>
            </div>
            <div style={{ background: C.milk, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 10.5, color: '#fff', fontWeight: 600, opacity: 0.85 }}>Day total</div>
              <div className="ff-display" style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>{total.toFixed(1)} L</div>
            </div>
          </div>
        ) : (
          <div style={{ background: C.milkSoft, borderRadius: 14, padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div className="ff-body" style={{ fontSize: 11.5, color: C.milk, fontWeight: 600 }}>
                Total for {fmtDate(date)} · {sessionFilter}
              </div>
              <div className="ff-display" style={{ fontSize: 24, fontWeight: 700, color: C.milk }}>{total.toFixed(1)} L</div>
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
          <EmptyState icon={<HeartPulse size={30} />} title="No active cows" subtitle="Add an active cow to start tracking heat cycles." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
            {rows.map(({ cow, status, nextDate, daysUntil }) => (
              <div key={cow.id} onClick={() => onOpenCow(cow.id)} style={rowCardStyle}>
                <EarTag number={cow.tagNumber} size="sm" />
                <div style={{ flex: 1, marginLeft: 10 }}>
                  <div className="ff-display" style={{ fontWeight: 700, fontSize: 13.5, color: C.ink }}>{cow.name}</div>
                  <div style={{ fontSize: 11.5, color: C.sub }}>
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
                    <div className="ff-display" style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>{cow ? cow.name : 'Unknown'}</div>
                    <div style={{ fontSize: 11.5, color: C.sub }}>{fmtDate(h.date)}{h.notes ? ` · ${h.notes}` : ''}</div>
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
function HeatDetailModal({ record, cow, onClose, onEdit, onDelete }) {
  const { isReadOnly } = useContext(RoleContext);
  const [confirmDel, setConfirmDel] = useState(false);
  if (!record) return null;
  if (confirmDel) {
    return (
      <Modal title="Delete this heat record?" onClose={() => setConfirmDel(false)}>
        <div style={{ fontSize: 13, color: C.sub, marginBottom: 14 }}>This removes the heat cycle entry from {fmtDate(record.date)}. This can't be undone.</div>
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
            <div className="ff-display" style={{ fontWeight: 700, fontSize: 14, color: C.ink }}>{cow.name}</div>
            <div style={{ fontSize: 11.5, color: C.sub }}>{cow.breed}</div>
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
          <button onClick={() => onEdit(record)} className="ff-body" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: C.greenSoft, color: C.green, border: 'none', borderRadius: 10, padding: '10px 0', fontSize: 13, fontWeight: 700 }}>
            <Pencil size={14} /> Edit
          </button>
          <button onClick={() => setConfirmDel(true)} className="ff-body" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: C.rustSoft, color: C.rust, border: 'none', borderRadius: 10, padding: '10px 0', fontSize: 13, fontWeight: 700 }}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}
    </Modal>
  );
}

function HealthDetailModal({ record, cow, onClose }) {
  if (!record) return null;
  return (
    <Modal title="Health Record" onClose={onClose}>
      {cow && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <EarTag number={cow.tagNumber} size="sm" />
          <div>
            <div className="ff-display" style={{ fontWeight: 700, fontSize: 14, color: C.ink }}>{cow.name}</div>
            <div style={{ fontSize: 11.5, color: C.sub }}>{cow.breed}</div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <DetailRow label="Date" value={fmtDate(record.date)} />
        <DetailRow label="Type" value={record.type} />
        {record.medicine && <DetailRow label="Medicine used" value={record.medicine} />}
        {record.description && <DetailRow label="Details" value={record.description} />}
        {record.vet && <DetailRow label="Vet / attended by" value={record.vet} />}
        {record.nextDueDate && <DetailRow label="Next follow-up" value={fmtDate(record.nextDueDate)} />}
      </div>
    </Modal>
  );
}

function DetailRow({ label, value }) {
  return (
    <div>
      <div className="ff-body" style={{ fontSize: 11, fontWeight: 600, color: C.sub, marginBottom: 2 }}>{label}</div>
      <div className="ff-body" style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}

function HealthScreen({ medical, cowById, onAdd, onExport }) {
  const rows = medical.slice().sort((a, b) => b.date.localeCompare(a.date));
  const [viewing, setViewing] = useState(null);
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
        {rows.length === 0 ? (
          <EmptyState icon={<Stethoscope size={30} />} title="No health records" subtitle="Log vaccinations, treatments, and checkups to keep every cow's history in one place." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map((m) => {
              const cow = cowById(m.cowId);
              const overdue = m.nextDueDate && diffDays(m.nextDueDate) < 0;
              const soon = m.nextDueDate && diffDays(m.nextDueDate) >= 0 && diffDays(m.nextDueDate) <= 7;
              return (
                <div key={m.id} onClick={() => setViewing(m)} style={{ ...rowCardStyle, alignItems: 'flex-start' }}>
                  {cow && <EarTag number={cow.tagNumber} size="sm" />}
                  <div style={{ flex: 1, marginLeft: 10 }}>
                    <div className="ff-display" style={{ fontWeight: 700, fontSize: 13.5, color: C.ink }}>{cow ? cow.name : 'Unknown'} · {m.type}</div>
                    <div style={{ fontSize: 11.5, color: C.sub, marginTop: 1 }}>{fmtDate(m.date)}{m.vet ? ` · ${m.vet}` : ''}</div>
                    {m.medicine && <div style={{ fontSize: 12, color: C.ink, marginTop: 4 }}>Medicine: {m.medicine}</div>}
                    {m.nextDueDate && (
                      <div style={{ marginTop: 5 }}>
                        <Chip bg={overdue ? C.rustSoft : soon ? C.amberSoft : C.greySoft} fg={overdue ? C.rust : soon ? C.amber : C.grey}>
                          {overdue ? 'Follow-up overdue' : `Follow-up ${fmtDateShort(m.nextDueDate)}`}
                        </Chip>
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
      {viewing && <HealthDetailModal record={viewing} cow={cowById(viewing.cowId)} onClose={() => setViewing(null)} />}
      <FAB onClick={onAdd} label="Add record" />
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
          style={{ background: C.greySoft, border: 'none', borderRadius: 9, padding: '10px 12px', fontSize: 12, fontWeight: 700, color: C.ink, flexShrink: 0 }}
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
  const valid = name.trim() && tagNumber.trim();
  const expectedCalving = pregnancyConfirmed && inseminatedOn ? addMonths(inseminatedOn, 9) : '';
  const isCalf = status === 'calf';
  const motherOptions = (cows || []).filter((c) => !initial || c.id !== initial.id);

  return (
    <Modal title={initial ? 'Edit Animal' : isCalf ? 'Add Calf' : 'Add Cow'} onClose={onClose}>
      <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ganga" style={inputStyle} /></Field>
      <Field label="Ear tag number"><input value={tagNumber} onChange={(e) => setTagNumber(e.target.value)} placeholder="e.g. 014" style={inputStyle} /></Field>
      <Field label="Breed"><Segmented options={BREEDS} value={breed} onChange={setBreed} /></Field>
      <Field label="Status"><Segmented options={['active', 'dry', 'calf', 'sold']} value={status} onChange={setStatus} /></Field>

      {isCalf && (
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
            <div className="ff-body" style={{ fontSize: 11, color: C.sub, marginTop: 5 }}>You'll get a reminder 20 days after this date to check for repeat heat / pregnancy.</div>
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
              <span className="ff-body" style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>
                {inseminatedOn ? 'Yes, pregnancy confirmed' : 'Add an insemination date first'}
              </span>
            </button>
            {expectedCalving && (
              <div className="ff-body" style={{ fontSize: 12, color: C.green, marginTop: 8, background: C.greenSoft, borderRadius: 9, padding: '8px 10px' }}>
                Expected calving: <strong>{fmtDate(expectedCalving)}</strong> (9 months from insemination)
              </div>
            )}
          </Field>
        </>
      )}

      <Field label="Antibiotic used for mastitis (optional)">
        <input value={mastitisAntibiotic} onChange={(e) => setMastitisAntibiotic(e.target.value)} placeholder="e.g. Amoxicillin" style={inputStyle} />
      </Field>
      <PrimaryButton
        disabled={!valid}
        onClick={() => onSave({
          name: name.trim(), tagNumber: tagNumber.trim(), breed, gender: isCalf ? gender : '', dob, status, cycleLength,
          motherCowId: isCalf ? motherCowId : '', birthWeight: isCalf && birthWeight !== '' ? Number(birthWeight) : '',
          calvingDate, firstHeatDate, inseminatedOn, pregnancyConfirmed: !!(pregnancyConfirmed && inseminatedOn),
          mastitisAntibiotic: mastitisAntibiotic.trim(),
        })}
      >
        {initial ? 'Save changes' : isCalf ? 'Add calf' : 'Add cow'}
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

function MilkForm({ cows, defaultCowId, onClose, onSave }) {
  const [cowId, setCowId] = useState(defaultCowId || '');
  const [date, setDate] = useState(todayStr());
  const [session, setSession] = useState('AM');
  const [liters, setLiters] = useState('');
  const valid = cowId && liters !== '' && Number(liters) >= 0;
  return (
    <Modal title="Log Milk" onClose={onClose}>
      {!defaultCowId && <CowPicker cows={cows} value={cowId} onChange={setCowId} />}
      <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} max={todayStr()} /></Field>
      <Field label="Session"><Segmented options={['AM', 'PM']} value={session} onChange={setSession} /></Field>
      <Field label="Liters"><input type="number" min={0} step="0.1" value={liters} onChange={(e) => setLiters(e.target.value)} placeholder="e.g. 8.5" style={inputStyle} /></Field>
      <PrimaryButton disabled={!valid} onClick={() => onSave({ cowId, date, session, liters: Number(liters) })}>Save entry</PrimaryButton>
    </Modal>
  );
}

function MilkBatchForm({ cows, milk, onClose, onSave }) {
  const [date, setDate] = useState(todayStr());
  const [session, setSession] = useState('AM');
  const [values, setValues] = useState({}); // cowId -> string liters

  // Whenever date/session changes, prefill from any existing entries for that date+session
  useEffect(() => {
    const prefill = {};
    cows.forEach((c) => {
      const existing = milk.find((m) => m.cowId === c.id && m.date === date && m.session === session);
      if (existing) prefill[c.id] = String(existing.liters);
    });
    setValues(prefill);
  }, [date, session]); // eslint-disable-line react-hooks/exhaustive-deps

  const setVal = (cowId, v) => setValues((prev) => ({ ...prev, [cowId]: v }));

  const filledCount = Object.values(values).filter((v) => v !== '' && v !== undefined).length;
  const total = Object.values(values).reduce((s, v) => s + (v ? Number(v) : 0), 0);

  const handleSave = () => {
    const entries = cows
      .filter((c) => values[c.id] !== '' && values[c.id] !== undefined && !isNaN(Number(values[c.id])))
      .map((c) => {
        const existing = milk.find((m) => m.cowId === c.id && m.date === date && m.session === session);
        return { cowId: c.id, liters: Number(values[c.id]), existingId: existing ? existing.id : null };
      });
    if (entries.length === 0) return;
    onSave({ date, session, entries });
  };

  return (
    <Modal title="Log Milk" onClose={onClose}>
      <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} max={todayStr()} /></Field>
      <Field label="Session"><Segmented options={['AM', 'PM']} value={session} onChange={setSession} /></Field>

      {cows.length === 0 ? (
        <MutedNote text="Add a cow first before logging milk." />
      ) : (
        <>
          <div className="ff-body" style={{ fontSize: 11, fontWeight: 600, color: C.sub, marginBottom: 6 }}>
            Enter liters for each cow — leave blank to skip a cow for this session.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {cows.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: '8px 10px' }}>
                <EarTag number={c.tagNumber} size="sm" />
                <div style={{ flex: 1 }}>
                  <div className="ff-display" style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>{c.name}</div>
                  <div style={{ fontSize: 10.5, color: C.sub }}>{c.status !== 'active' ? c.status : '\u00A0'}</div>
                </div>
                <input
                  type="number" min={0} step="0.1" placeholder="—" value={values[c.id] ?? ''}
                  onChange={(e) => setVal(c.id, e.target.value)}
                  style={{ ...inputStyle, width: 76, textAlign: 'right', padding: '8px 10px' }}
                />
                <span className="ff-body" style={{ fontSize: 12, color: C.sub }}>L</span>
              </div>
            ))}
          </div>
          <div style={{ background: C.milkSoft, borderRadius: 10, padding: '8px 12px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
            <span style={{ color: C.milk, fontWeight: 600 }}>{filledCount} of {cows.length} cows entered</span>
            <span style={{ color: C.milk, fontWeight: 700 }}>{total.toFixed(1)} L total</span>
          </div>
        </>
      )}

      <PrimaryButton disabled={filledCount === 0} onClick={handleSave}>
        Save {filledCount > 0 ? `${filledCount} ${filledCount === 1 ? 'entry' : 'entries'}` : 'entries'}
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
          <span className="ff-body" style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>Yes, bred / inseminated</span>
        </button>
      </Field>
      <Field label="Notes (optional)"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. mild signs, standing heat" style={inputStyle} /></Field>
      <PrimaryButton disabled={!valid} onClick={() => onSave({ cowId, date, bred, notes: notes.trim() })}>{initial ? 'Save changes' : 'Save entry'}</PrimaryButton>
    </Modal>
  );
}

function CowMultiPicker({ cows, selected, onChange }) {
  const allSelected = cows.length > 0 && selected.length === cows.length;
  const toggleAll = () => onChange(allSelected ? [] : cows.map((c) => c.id));
  const toggleOne = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <Field label={`Cows ${selected.length ? `(${selected.length} selected)` : ''}`}>
      <button
        type="button"
        onClick={toggleAll}
        className="ff-body"
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, border: `1.5px solid ${allSelected ? C.green : C.line}`, background: allSelected ? C.greenSoft : '#fff', borderRadius: 10, padding: '9px 12px', marginBottom: 8, fontWeight: 700, fontSize: 12.5, color: allSelected ? C.green : C.ink }}
      >
        <div style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${allSelected ? C.green : C.grey}`, background: allSelected ? C.green : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {allSelected && <Check size={12} color="#fff" />}
        </div>
        Select all {cows.length} cow{cows.length === 1 ? '' : 's'}
      </button>
      <div style={{ maxHeight: 220, overflowY: 'auto', border: `1.5px solid ${C.line}`, borderRadius: 10, background: '#fff' }}>
        {cows.map((c) => {
          const checked = selected.includes(c.id);
          return (
            <button
              type="button"
              key={c.id}
              onClick={() => toggleOne(c.id)}
              className="ff-body"
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, border: 'none', borderBottom: `1px solid ${C.line}`, background: checked ? C.greenSoft : '#fff', padding: '10px 12px', textAlign: 'left' }}
            >
              <div style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${checked ? C.green : C.grey}`, background: checked ? C.green : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {checked && <Check size={12} color="#fff" />}
              </div>
              <span style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>{c.name}</span>
              <span style={{ fontSize: 11.5, color: C.sub }}>#{c.tagNumber}</span>
            </button>
          );
        })}
      </div>
    </Field>
  );
}

function MedicalForm({ cows, defaultCowId, onClose, onSave }) {
  const [cowIds, setCowIds] = useState(defaultCowId ? [defaultCowId] : []);
  const [date, setDate] = useState(todayStr());
  const [type, setType] = useState(MED_TYPES[0]);
  const [medicine, setMedicine] = useState('');
  const [description, setDescription] = useState('');
  const [vet, setVet] = useState('');
  const [nextDueDate, setNextDueDate] = useState('');
  const valid = cowIds.length > 0 && date && type;
  return (
    <Modal title="Add Health Record" onClose={onClose}>
      {!defaultCowId && <CowMultiPicker cows={cows} selected={cowIds} onChange={setCowIds} />}
      <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} max={todayStr()} /></Field>
      <Field label="Type"><Segmented options={MED_TYPES} value={type} onChange={setType} /></Field>
      <Field label="Medicine used (optional)"><input value={medicine} onChange={(e) => setMedicine(e.target.value)} placeholder="e.g. Albendazole" style={inputStyle} /></Field>
      <Field label="Details">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was done / observed" style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} />
      </Field>
      <Field label="Vet / attended by (optional)"><input value={vet} onChange={(e) => setVet(e.target.value)} placeholder="e.g. Dr. Rao" style={inputStyle} /></Field>
      <Field label="Next follow-up date (optional)"><input type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} style={inputStyle} /></Field>
      <PrimaryButton disabled={!valid} onClick={() => onSave({ cowIds, date, type, medicine: medicine.trim(), description: description.trim(), vet: vet.trim(), nextDueDate })}>
        Save record{cowIds.length > 1 ? ` for ${cowIds.length} cows` : ''}
      </PrimaryButton>
    </Modal>
  );
}

// ================= FEED MANAGEMENT =================
function FeedScreen({ feedTypes, feedTransactions, onAddType, onEditType, onDeleteType, onLogTxn, onExport }) {
  const { isReadOnly } = useContext(RoleContext);
  const month = currentMonthStr();
  const totalSpendThisMonth = feedTypes.reduce((s, f) => s + feedMonthSpend(f.id, feedTransactions, month), 0);
  const totalPurchased = feedTypes.reduce((s, f) => s + feedTotalPurchased(f.id, feedTransactions), 0);
  const totalUsed = feedTypes.reduce((s, f) => s + feedTotalUsed(f.id, feedTransactions), 0);
  const totalDebited = feedTypes.reduce((s, f) => s + feedTotalDebited(f.id, feedTransactions), 0);
  const totalSaved = feedTypes.reduce((s, f) => s + feedStockValue(f, feedTransactions), 0);
  const recent = feedTransactions.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  return (
    <div>
      <ScreenHeader
        title="Feed Management" subtitle={monthLabel(month)}
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <HeaderIconButton title="Print feed records" icon={<Printer size={15} color="#fff" />} onClick={() => onExport('print')} />
            <HeaderIconButton title="Download CSV" icon={<Download size={15} color="#fff" />} onClick={() => onExport('csv')} />
          </div>
        }
      />
      <div style={{ padding: 16 }}>
        {feedTypes.length > 0 && (
          <>
            <SectionTitle title="Overall (all time)" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
              <StatCard label="Bags purchased" value={totalPurchased} bg={C.greenSoft} fg={C.green} icon={<PackagePlus size={16} />} />
              <StatCard label="Bags used" value={totalUsed} bg={C.greySoft} fg={C.grey} icon={<PackageMinus size={16} />} />
              <StatCard label="Amount debited" value={`₹${totalDebited.toFixed(0)}`} bg={C.rustSoft} fg={C.rust} icon={<Download size={16} />} />
              <StatCard label="Stock value (saved)" value={`₹${totalSaved.toFixed(0)}`} bg={C.milkSoft} fg={C.milk} icon={<Wheat size={16} />} />
            </div>
            <div style={{ background: C.brownSoft, borderRadius: 14, padding: 14, marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="ff-body" style={{ fontSize: 11.5, color: C.brown, fontWeight: 600 }}>Feed spend this month</div>
                <div className="ff-display" style={{ fontSize: 24, fontWeight: 700, color: C.brown }}>₹{totalSpendThisMonth.toFixed(0)}</div>
              </div>
              <Wheat size={26} color={C.brown} />
            </div>
          </>
        )}

        <SectionTitle title="Feed types" />
        {feedTypes.length === 0 ? (
          <EmptyState icon={<Wheat size={30} />} title="No feed types yet" subtitle="Add each type of feed you use — for example, dry fodder, concentrate, and mineral mix — to start tracking stock and spend." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
            {feedTypes.map((f) => {
              const stock = feedStock(f.id, feedTransactions);
              const boughtThisMonth = feedMonthPurchased(f.id, feedTransactions, month);
              const spendThisMonth = feedMonthSpend(f.id, feedTransactions, month);
              const purchasedAll = feedTotalPurchased(f.id, feedTransactions);
              const usedAll = feedTotalUsed(f.id, feedTransactions);
              const debitedAll = feedTotalDebited(f.id, feedTransactions);
              const savedAll = feedStockValue(f, feedTransactions);
              const low = stock <= 3;
              return (
                <div key={f.id} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div>
                      <div className="ff-display" style={{ fontWeight: 700, fontSize: 14.5, color: C.ink }}>{f.name}</div>
                      <div style={{ fontSize: 11.5, color: C.sub, marginTop: 1 }}>₹{f.costPerBag} / bag</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {!isReadOnly && (
                        <>
                          <button onClick={() => onEditType(f.id)} style={{ background: C.greySoft, border: 'none', borderRadius: 8, padding: 5 }}><Pencil size={13} color={C.ink} /></button>
                          <button onClick={() => onDeleteType(f.id)} style={{ background: C.greySoft, border: 'none', borderRadius: 8, padding: 5 }}><Trash2 size={13} color={C.ink} /></button>
                        </>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
                    <div>
                      <div className="ff-display" style={{ fontWeight: 700, fontSize: 17, color: low ? C.rust : C.ink }}>{stock}</div>
                      <div style={{ fontSize: 10.5, color: C.sub }}>Bags left</div>
                    </div>
                    <div>
                      <div className="ff-display" style={{ fontWeight: 700, fontSize: 17, color: C.ink }}>{purchasedAll}</div>
                      <div style={{ fontSize: 10.5, color: C.sub }}>Purchased (total)</div>
                    </div>
                    <div>
                      <div className="ff-display" style={{ fontWeight: 700, fontSize: 17, color: C.ink }}>{usedAll}</div>
                      <div style={{ fontSize: 10.5, color: C.sub }}>Used (total)</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, margin: '10px 0 12px' }}>
                    <div>
                      <div className="ff-display" style={{ fontWeight: 700, fontSize: 15, color: C.ink }}>{boughtThisMonth}</div>
                      <div style={{ fontSize: 10.5, color: C.sub }}>Bought this mo.</div>
                    </div>
                    <div>
                      <div className="ff-display" style={{ fontWeight: 700, fontSize: 15, color: C.rust }}>₹{debitedAll.toFixed(0)}</div>
                      <div style={{ fontSize: 10.5, color: C.sub }}>Debited (total)</div>
                    </div>
                    <div>
                      <div className="ff-display" style={{ fontWeight: 700, fontSize: 15, color: C.milk }}>₹{savedAll.toFixed(0)}</div>
                      <div style={{ fontSize: 10.5, color: C.sub }}>Stock value</div>
                    </div>
                  </div>

                  {low && <div style={{ marginBottom: 10 }}><Chip bg={C.rustSoft} fg={C.rust}>Running low — consider restocking</Chip></div>}
                  {!isReadOnly && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => onLogTxn(f.id, 'purchase')} className="ff-body" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: C.greenSoft, color: C.green, border: 'none', borderRadius: 9, padding: '8px 0', fontSize: 12, fontWeight: 700 }}>
                        <PackagePlus size={13} /> Log purchase
                      </button>
                      <button onClick={() => onLogTxn(f.id, 'usage')} className="ff-body" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: C.greySoft, color: C.ink, border: 'none', borderRadius: 9, padding: '8px 0', fontSize: 12, fontWeight: 700 }}>
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
          <MutedNote text="No feed purchases or usage logged yet." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recent.map((t) => {
              const f = feedTypes.find((x) => x.id === t.feedTypeId);
              return (
                <div key={t.id} style={rowCardStyle}>
                  <div style={{ color: t.kind === 'purchase' ? C.green : C.grey }}>
                    {t.kind === 'purchase' ? <PackagePlus size={16} /> : <PackageMinus size={16} />}
                  </div>
                  <div style={{ flex: 1, marginLeft: 10 }}>
                    <div className="ff-display" style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>{f ? f.name : 'Unknown'} · {t.bags} bags</div>
                    <div style={{ fontSize: 11.5, color: C.sub }}>{fmtDate(t.date)} · {t.kind === 'purchase' ? `Purchased${t.cost ? ` · ₹${t.cost}` : ''}` : 'Used'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <FAB onClick={onAddType} label="Add feed type" />
    </div>
  );
}

function FeedTypeForm({ initial, onClose, onSave }) {
  const [name, setName] = useState(initial?.name || '');
  const [costPerBag, setCostPerBag] = useState(initial?.costPerBag || '');
  const valid = name.trim() && costPerBag !== '';
  return (
    <Modal title={initial ? 'Edit Feed Type' : 'Add Feed Type'} onClose={onClose}>
      <Field label="Feed name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Concentrate mix" style={inputStyle} /></Field>
      <Field label="Cost per bag (₹)"><input type="number" min={0} value={costPerBag} onChange={(e) => setCostPerBag(e.target.value)} placeholder="e.g. 1200" style={inputStyle} /></Field>
      <PrimaryButton disabled={!valid} onClick={() => onSave({ name: name.trim(), costPerBag: Number(costPerBag) })}>{initial ? 'Save changes' : 'Add feed type'}</PrimaryButton>
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
    <Modal title={`${kind === 'purchase' ? 'Log Purchase' : 'Log Usage'} — ${feedType ? feedType.name : ''}`} onClose={onClose}>
      <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} max={todayStr()} /></Field>
      <Field label="Bags"><input type="number" min={0} step="0.5" value={bags} onChange={(e) => setBags(e.target.value)} placeholder="e.g. 5" style={inputStyle} /></Field>
      {kind === 'purchase' && (
        <Field label="Total cost (₹, optional)">
          <input type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} placeholder={suggestedCost ? `Suggested: ${suggestedCost}` : 'e.g. 6000'} style={inputStyle} />
        </Field>
      )}
      <PrimaryButton
        disabled={!valid}
        onClick={() => onSave({ date, bags: Number(bags), cost: kind === 'purchase' ? Number(cost || suggestedCost || 0) : undefined })}
      >
        Save {kind === 'purchase' ? 'purchase' : 'usage'}
      </PrimaryButton>
    </Modal>
  );
}

// ================= INSURANCE =================
function InsuranceScreen({ policies, policyCows, payments, cows, cowById, onAddPolicy, onEditPolicy, onDeletePolicy, onLogPayment, onExport }) {
  const { isReadOnly } = useContext(RoleContext);
  const [confirmDelId, setConfirmDelId] = useState(null);
  const year = todayStr().slice(0, 4);
  const totalPaidThisYear = policies.reduce((s, p) => s + policyPaidThisYear(p.id, payments), 0);
  const activeCount = policies.filter((p) => policyStatus(p).status !== 'expired').length;
  const expiringSoon = policies.filter((p) => policyStatus(p).status === 'expiring');
  const expired = policies.filter((p) => policyStatus(p).status === 'expired');

  const coveredNames = (policyId) => policyCows.filter((pc) => pc.policyId === policyId).map((pc) => cowById(pc.cowId)).filter(Boolean);

  return (
    <div>
      <ScreenHeader
        title="Insurance" subtitle="Policies, renewals & payments"
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <HeaderIconButton title="Print insurance report" icon={<Printer size={15} color="#fff" />} onClick={() => onExport('print')} />
            <HeaderIconButton title="Download CSV" icon={<Download size={15} color="#fff" />} onClick={() => onExport('csv')} />
          </div>
        }
      />
      <div style={{ padding: 16 }}>
        {policies.length > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
              <StatCard label="Active policies" value={activeCount} bg={C.greenSoft} fg={C.green} icon={<Shield size={16} />} />
              <StatCard label="Paid this year" value={`₹${totalPaidThisYear.toFixed(0)}`} bg={C.milkSoft} fg={C.milk} icon={<Download size={16} />} />
            </div>

            {(expiringSoon.length > 0 || expired.length > 0) && (
              <>
                <SectionTitle title="Needs attention" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                  {expired.map((p) => (
                    <div key={p.id} style={rowCardStyle}>
                      <Shield size={16} color={C.rust} />
                      <div style={{ flex: 1, marginLeft: 10 }}>
                        <div className="ff-display" style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>{p.provider}{p.policyNumber ? ` · #${p.policyNumber}` : ''}</div>
                        <div style={{ fontSize: 11.5, color: C.sub }}>Expired {fmtDate(p.expiryDate)}</div>
                      </div>
                      <Chip bg={C.rustSoft} fg={C.rust}>Expired</Chip>
                    </div>
                  ))}
                  {expiringSoon.map((p) => (
                    <div key={p.id} style={rowCardStyle}>
                      <Shield size={16} color={C.amber} />
                      <div style={{ flex: 1, marginLeft: 10 }}>
                        <div className="ff-display" style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>{p.provider}{p.policyNumber ? ` · #${p.policyNumber}` : ''}</div>
                        <div style={{ fontSize: 11.5, color: C.sub }}>Expires {fmtDate(p.expiryDate)}</div>
                      </div>
                      <Chip bg={C.amberSoft} fg={C.amber}>Expiring soon</Chip>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {!isReadOnly && (
          <button
            onClick={onAddPolicy}
            className="ff-body"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: C.green, color: '#fff', border: 'none', borderRadius: 12, padding: '11px 0', fontWeight: 700, fontSize: 13, marginBottom: 16 }}
          >
            <Plus size={15} /> Add policy
          </button>
        )}

        <SectionTitle title="Policies" />
        {policies.length === 0 ? (
          <EmptyState icon={<Shield size={30} />} title="No insurance policies yet" subtitle="Add a policy and link it to one or more animals to start tracking coverage, renewals, and payments." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {policies.map((p) => {
              const st = policyStatus(p);
              const covered = coveredNames(p.id);
              const totalPaid = policyTotalPaid(p.id, payments);
              return (
                <div key={p.id} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1 }}>
                      <div className="ff-display" style={{ fontWeight: 700, fontSize: 14.5, color: C.ink }}>{p.provider}</div>
                      {p.policyNumber && <div style={{ fontSize: 11.5, color: C.sub, marginTop: 1 }}>Policy #{p.policyNumber}</div>}
                    </div>
                    {!isReadOnly && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => onEditPolicy(p.id)} style={{ background: C.greySoft, border: 'none', borderRadius: 8, padding: 5 }}><Pencil size={13} color={C.ink} /></button>
                        <button onClick={() => setConfirmDelId(p.id)} style={{ background: C.greySoft, border: 'none', borderRadius: 8, padding: 5 }}><Trash2 size={13} color={C.ink} /></button>
                      </div>
                    )}
                  </div>

                  {covered.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                      {covered.map((c) => (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 5, background: C.greenSoft, borderRadius: 999, padding: '3px 9px 3px 4px' }}>
                          <EarTag number={c.tagNumber} size="sm" tone="green" />
                          <span className="ff-body" style={{ fontSize: 11.5, color: C.green, fontWeight: 600 }}>{c.name}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '12px 0' }}>
                    <div>
                      <div className="ff-display" style={{ fontWeight: 700, fontSize: 15, color: C.ink }}>{p.coverageAmount ? `₹${p.coverageAmount}` : '—'}</div>
                      <div style={{ fontSize: 10.5, color: C.sub }}>Coverage</div>
                    </div>
                    <div>
                      <div className="ff-display" style={{ fontWeight: 700, fontSize: 15, color: C.milk }}>₹{totalPaid.toFixed(0)}</div>
                      <div style={{ fontSize: 10.5, color: C.sub }}>Paid (total)</div>
                    </div>
                  </div>

                  {p.expiryDate && (
                    <div style={{ marginBottom: 10 }}>
                      <Chip
                        bg={st.status === 'expired' ? C.rustSoft : st.status === 'expiring' ? C.amberSoft : C.greenSoft}
                        fg={st.status === 'expired' ? C.rust : st.status === 'expiring' ? C.amber : C.green}
                      >
                        {st.status === 'expired' ? `Expired ${fmtDate(p.expiryDate)}` : st.status === 'expiring' ? `Expires ${fmtDate(p.expiryDate)}` : `Valid until ${fmtDate(p.expiryDate)}`}
                      </Chip>
                    </div>
                  )}

                  {!isReadOnly && (
                    <button onClick={() => onLogPayment(p.id)} className="ff-body" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: C.greenSoft, color: C.green, border: 'none', borderRadius: 9, padding: '8px 0', fontSize: 12, fontWeight: 700 }}>
                      <Plus size={13} /> Log payment / renewal
                    </button>
                  )}

                  {payments.filter((pay) => pay.policyId === p.id).length > 0 && (
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {payments.filter((pay) => pay.policyId === p.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3).map((pay) => (
                        <div key={pay.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: C.sub }}>
                          <span>{fmtDate(pay.date)} · {pay.kind}</span>
                          <span style={{ fontWeight: 700, color: C.ink }}>₹{pay.amount}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {confirmDelId && (
        <Modal title="Delete this policy?" onClose={() => setConfirmDelId(null)}>
          <div style={{ fontSize: 13, color: C.sub, marginBottom: 14 }}>This removes the policy along with its full payment history. This can't be undone.</div>
          <PrimaryButton danger onClick={() => { onDeletePolicy(confirmDelId); setConfirmDelId(null); }}>Delete permanently</PrimaryButton>
        </Modal>
      )}
    </div>
  );
}

function PolicyForm({ cows, initial, initialCowIds, onClose, onSave }) {
  const [provider, setProvider] = useState(initial?.provider || '');
  const [policyNumber, setPolicyNumber] = useState(initial?.policyNumber || '');
  const [coverageAmount, setCoverageAmount] = useState(initial?.coverageAmount ?? '');
  const [premiumAmount, setPremiumAmount] = useState(initial?.premiumAmount ?? '');
  const [startDate, setStartDate] = useState(initial?.startDate || '');
  const [expiryDate, setExpiryDate] = useState(initial?.expiryDate || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [cowIds, setCowIds] = useState(initialCowIds || []);
  const valid = provider.trim();

  return (
    <Modal title={initial ? 'Edit Policy' : 'Add Insurance Policy'} onClose={onClose}>
      <Field label="Insurance provider"><input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="e.g. United India Insurance" style={inputStyle} /></Field>
      <Field label="Policy number (optional)"><input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} placeholder="e.g. CAT-2026-0417" style={inputStyle} /></Field>
      <Field label="Coverage amount (₹, optional)"><input type="number" min={0} value={coverageAmount} onChange={(e) => setCoverageAmount(e.target.value)} placeholder="e.g. 60000" style={inputStyle} /></Field>
      <Field label="Premium amount (₹, optional)"><input type="number" min={0} value={premiumAmount} onChange={(e) => setPremiumAmount(e.target.value)} placeholder="e.g. 2500" style={inputStyle} /></Field>
      <Field label="Start date (optional)"><ClearableDate value={startDate} onChange={setStartDate} /></Field>
      <Field label="Expiry date (optional)">
        <ClearableDate value={expiryDate} onChange={setExpiryDate} />
        <div className="ff-body" style={{ fontSize: 11, color: C.sub, marginTop: 5 }}>You'll see a reminder here once this gets within 30 days of expiring.</div>
      </Field>
      <CowMultiPicker cows={cows} selected={cowIds} onChange={setCowIds} />
      <Field label="Notes (optional)"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. covers accidental death only" style={inputStyle} /></Field>
      <PrimaryButton
        disabled={!valid}
        onClick={() => onSave({
          provider: provider.trim(), policyNumber: policyNumber.trim(),
          coverageAmount: coverageAmount === '' ? '' : Number(coverageAmount),
          premiumAmount: premiumAmount === '' ? '' : Number(premiumAmount),
          startDate, expiryDate, notes: notes.trim(), cowIds,
        })}
      >
        {initial ? 'Save changes' : 'Add policy'}
      </PrimaryButton>
    </Modal>
  );
}

function PolicyPaymentForm({ policy, onClose, onSave }) {
  const [date, setDate] = useState(todayStr());
  const [amount, setAmount] = useState(policy?.premiumAmount || '');
  const [kind, setKind] = useState('premium');
  const [notes, setNotes] = useState('');
  const valid = date && amount !== '' && Number(amount) > 0;

  return (
    <Modal title={`Log Payment — ${policy ? policy.provider : ''}`} onClose={onClose}>
      <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} max={todayStr()} /></Field>
      <Field label="Type"><Segmented options={['premium', 'renewal']} value={kind} onChange={setKind} /></Field>
      <Field label="Amount (₹)"><input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 2500" style={inputStyle} /></Field>
      <Field label="Notes (optional)"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. paid via UPI" style={inputStyle} /></Field>
      <PrimaryButton disabled={!valid} onClick={() => onSave({ date, amount: Number(amount), kind, notes: notes.trim() })}>Save payment</PrimaryButton>
    </Modal>
  );
}
