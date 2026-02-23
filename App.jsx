// App v26 — v22 base + week fix + auth + captain/admin routes (no external deps)
import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ─── Supabase ───
const SUPA_URL = "https://ynwohnffmlfyejhfttxq.supabase.co";
const SUPA = `${SUPA_URL}/rest/v1`;
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlud29obmZmbWxmeWVqaGZ0dHhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NTUxMzIsImV4cCI6MjA4NjQzMTEzMn0.ICBlMtcXmWGxd8gKAa6miEVWpr0uJROUV3osfnhm-9g";
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
let USE_MOCK = false;

// ─── Auth helpers (plain fetch, no external packages) ────────────────────────
const AUTH_URL = `${SUPA_URL}/auth/v1`;
const STORAGE_KEY = `sb-ynwohnffmlfyejhfttxq-auth-token`;

function getSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.expires_at && parsed.expires_at * 1000 < Date.now()) return null;
    return parsed;
  } catch { return null; }
}

function getAccessToken() { return getSession()?.access_token || null; }

function authH() {
  const token = getAccessToken() || KEY;
  return { apikey: KEY, Authorization: `Bearer ${token}` };
}

function signInWithGoogle(redirectPath = "/captain") {
  const redirectTo = encodeURIComponent(`${window.location.origin}${redirectPath}`);
  window.location.href = `${AUTH_URL}/authorize?provider=google&redirect_to=${redirectTo}`;
}

async function signOut() {
  const token = getAccessToken();
  if (token) {
    await fetch(`${AUTH_URL}/logout`, {
      method: "POST",
      headers: { apikey: KEY, Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  localStorage.removeItem(STORAGE_KEY);
  window.location.href = "/";
}

function handleAuthCallback() {
  const hash = window.location.hash;
  if (!hash.includes("access_token")) return false;
  const params = new URLSearchParams(hash.replace("#", ""));
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  const expires_at = params.get("expires_at");
  if (access_token) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      access_token, refresh_token, expires_at: parseInt(expires_at),
    }));
    window.history.replaceState({}, "", window.location.pathname);
    return true;
  }
  return false;
}

async function getUser() {
  const token = getAccessToken();
  if (!token) return null;
  const r = await fetch(`${AUTH_URL}/user`, {
    headers: { apikey: KEY, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  return r.json();
}

async function qAuth(table, params = "", method = "GET", body = null) {
  const headers = {
    ...authH(),
    ...(body ? { "Content-Type": "application/json", Prefer: "return=representation" } : {}),
  };
  const r = await fetch(`${SUPA}/${table}?${params}`, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(await r.text());
  if (method === "DELETE") return null;
  return r.json().catch(() => null);
}

async function rpc(fnName, params = {}) {
  const r = await fetch(`${SUPA}/rpc/${fnName}`, {
    method: "POST",
    headers: { ...authH(), "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json().catch(() => null);
}

async function q(table, params = "") {
  if (USE_MOCK) return getMock(table, params);
  try {
    const r = await fetch(`${SUPA}/${table}?${params}`, { headers: H });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    console.warn(`Supabase query failed for ${table}:`, e.message);
    return [];
  }
}

// ─── Design Tokens ───
const C = {
  bg: "#0a0a14", surface: "#12121f", surfAlt: "#161626", hover: "#1a1a2e",
  border: "#1e1e35", borderL: "#2a2a45",
  amber: "#F59E0B", amberGlow: "#F59E0B18",
  text: "#e2e8f0", muted: "#8892a8", dim: "#555a6e",
  green: "#22c55e", red: "#ef4444", blue: "#3b82f6",
};
const F = {
  d: "'Playfair Display',Georgia,serif",
  b: "'DM Sans',system-ui,sans-serif",
  m: "'JetBrains Mono','Fira Code',monospace",
};

// ─── Helpers ───
const fmtDate = (d) => {
  if (!d) return "";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const fmtTime = (t) => {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hr = +h;
  return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
};

const calcGB = (lw, ll, w, l) => {
  const gb = ((lw - w) + (l - ll)) / 2;
  return gb <= 0 ? "—" : gb % 1 === 0 ? gb.toString() : gb.toFixed(1);
};

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : "";

const levelEmoji = (l) => {
  if (l === "pilot") return "✈️";
  if (l === "cherry") return "🍒";
  if (l === "hammer") return "🔨";
  return "";
};

const levelOrder = { pilot: 0, cherry: 1, hammer: 2 };
const dayOrder = { monday: 0, tuesday: 1, wednesday: 2 };

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < (s || "").length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function computeRanks(standings) {
  if (!standings.length) return [];
  const sorted = [...standings].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;
    // Tiebreaker: playoff team ranks higher
    if (a.playoffRound && !b.playoffRound) return -1;
    if (!a.playoffRound && b.playoffRound) return 1;
    return 0;
  });
  let rank = 1;
  return sorted.map((t, i) => {
    if (i > 0 && (t.wins !== sorted[i - 1].wins || t.losses !== sorted[i - 1].losses)) {
      rank = i + 1;
    }
    const tied = sorted.filter(x => x.wins === t.wins && x.losses === t.losses).length > 1;
    return { ...t, displayRank: rank, isTied: tied };
  });
}

function getSeasonProgress(season) {
  if (!season) return { label: "", status: "active", week: null };
  const now = new Date();
  const start = new Date(season.start_date + "T00:00:00");
  const end = new Date(season.end_date + "T23:59:59");
  if (now < start) return { label: "Starting Soon", status: "upcoming", week: null };
  if (now > end || !season.is_active) return { label: "Completed", status: "completed", week: null };
  const week = Math.min(Math.max(Math.floor((now - start) / (7 * 24 * 60 * 60 * 1000)) + 1, 1), 8);
  return { label: `Week ${week} of 8`, status: "active", week };
}

function getWeekNum(matchDate, seasonStart) {
  if (!matchDate || !seasonStart) return 1;
  const d = new Date(matchDate + "T12:00:00");
  const s = new Date(seasonStart + "T12:00:00");
  return Math.min(Math.max(Math.floor((d - s) / (7 * 24 * 60 * 60 * 1000)) + 1, 1), 8);
}

function NHSALogo({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ borderRadius: 4, flexShrink: 0 }}>
      <line x1="20" y1="6" x2="8" y2="32" stroke="#d4cfc0" strokeWidth="2" strokeLinecap="round" />
      <line x1="20" y1="6" x2="32" y2="32" stroke="#d4cfc0" strokeWidth="2" strokeLinecap="round" />
      <line x1="10" y1="32" x2="30" y2="32" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="12" y1="10" x2="30" y2="28" stroke="#d4cfc0" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

// ══════════════════════════════════════
// ─── MOCK DATA ───
// ══════════════════════════════════════

const MOCK_SEASONS = [
  { id: "s38", name: "Winter 2026", start_date: "2026-01-12", end_date: "2026-03-16", is_active: true },
  { id: "s37", name: "Fall 2025", start_date: "2025-09-08", end_date: "2025-11-17", is_active: false },
  { id: "s36", name: "Summer 2025", start_date: "2025-06-02", end_date: "2025-08-11", is_active: false },
  { id: "s35", name: "Spring 2025", start_date: "2025-03-03", end_date: "2025-05-12", is_active: false },
  { id: "s34", name: "Winter 2025", start_date: "2025-01-13", end_date: "2025-03-17", is_active: false },
  { id: "s33", name: "Fall 2024", start_date: "2024-09-09", end_date: "2024-11-18", is_active: false },
];

const mkDiv = (id, sid, day, level) => ({
  id, season_id: sid, name: `${cap(day)} ${cap(level)}`, slug: `${day}-${level}`, day_of_week: day, level,
});

const MOCK_DIVISIONS = {
  s38: [mkDiv("d38-mp","s38","monday","pilot"), mkDiv("d38-mc","s38","monday","cherry"), mkDiv("d38-mh","s38","monday","hammer"), mkDiv("d38-tp","s38","tuesday","pilot"), mkDiv("d38-tc","s38","tuesday","cherry"), mkDiv("d38-th","s38","tuesday","hammer")],
  s37: [mkDiv("d37-mp","s37","monday","pilot"), mkDiv("d37-mc","s37","monday","cherry"), mkDiv("d37-mh","s37","monday","hammer"), mkDiv("d37-tp","s37","tuesday","pilot"), mkDiv("d37-tc","s37","tuesday","cherry"), mkDiv("d37-th","s37","tuesday","hammer")],
  s36: [mkDiv("d36-mp","s36","monday","pilot"), mkDiv("d36-mc","s36","monday","cherry"), mkDiv("d36-tp","s36","tuesday","pilot"), mkDiv("d36-tc","s36","tuesday","cherry")],
};

const TEAM_POOL = [
  "Disc Jockeys", "Puck Dynasty", "Tang Bangers", "Royal Flush", "Slide Rules",
  "Wax On Wax Off", "Off The Rails", "The Shufflers", "Biscuit Riskers", "Gutter Punks",
  "Sand Sharks", "Weight Watchers", "Lag Legends", "Hammer Time", "Kitchen Crew",
  "Dead Weight", "Bocce Rejects", "Shuffleboard Syndicate", "Tangled Up", "The Laggards",
  "Court Jesters", "Puck Norris", "Disc-iples", "Lucky Ducks", "Spare Change",
  "Board Certified", "Alley Cats", "The Underdogs", "Smooth Operators", "Biscuit Bandits",
  "Full Send", "No Wax Zone",
];

const MOCK_TEAMS = TEAM_POOL.map((name, i) => {
  const h = hashStr(name);
  return {
    id: `t${i + 1}`, name, slug: name.toLowerCase().replace(/\s+/g, "-"),
    elo_rating: 1350 - i * 12 + (h % 40),
    all_time_wins: 80 - i * 2 + (h % 30),
    all_time_losses: 40 + i * 2 + (h % 20),
    championships: i < 3 ? 3 - i : i < 8 ? 1 : 0,
    playoff_appearances: i < 3 ? 6 : i < 8 ? 4 : i < 15 ? 2 : 1,
    seasons_played: Math.max(1, 8 - Math.floor(i / 4)),
  };
});

const STK = ["W4", "W2", "L1", "W1", "W3", "L2", "L3", "L1", "W1", "L4", "L1", "W1", "L2", "W2", "L5", "L8"];

const mkS = (r, ti, did, dn, sn, w, l, ow, ol, si) => ({
  id: `st-${did}-${r}`, division_id: did, division_name: dn, season_name: sn,
  team_id: MOCK_TEAMS[ti].id, team_name: MOCK_TEAMS[ti].name,
  wins: w, losses: l, ot_wins: ow, ot_losses: ol, calculated_rank: r,
  _streak: STK[si % STK.length],
});

const MOCK_STANDINGS = {
  "d38-mp": [
    mkS(1,0,"d38-mp","Monday Pilot","Winter 2026",6,1,1,0,0),
    mkS(2,1,"d38-mp","Monday Pilot","Winter 2026",5,2,0,1,1),
    mkS(3,4,"d38-mp","Monday Pilot","Winter 2026",5,2,1,0,2),
    mkS(4,2,"d38-mp","Monday Pilot","Winter 2026",4,3,1,1,3),
    mkS(5,3,"d38-mp","Monday Pilot","Winter 2026",4,3,0,0,4),
    mkS(6,5,"d38-mp","Monday Pilot","Winter 2026",3,4,0,1,5),
    mkS(7,6,"d38-mp","Monday Pilot","Winter 2026",3,4,1,0,6),
    mkS(8,7,"d38-mp","Monday Pilot","Winter 2026",2,5,0,0,7),
    mkS(9,8,"d38-mp","Monday Pilot","Winter 2026",2,5,0,1,8),
    mkS(10,9,"d38-mp","Monday Pilot","Winter 2026",2,5,0,0,9),
    mkS(11,10,"d38-mp","Monday Pilot","Winter 2026",1,6,0,0,10),
    mkS(12,11,"d38-mp","Monday Pilot","Winter 2026",1,6,0,1,11),
    mkS(13,12,"d38-mp","Monday Pilot","Winter 2026",1,6,1,0,12),
    mkS(14,13,"d38-mp","Monday Pilot","Winter 2026",0,7,0,0,13),
    mkS(15,14,"d38-mp","Monday Pilot","Winter 2026",0,7,0,0,14),
    mkS(16,15,"d38-mp","Monday Pilot","Winter 2026",0,7,0,0,15),
  ],
  "d38-mc": [
    mkS(1,8,"d38-mc","Monday Cherry","Winter 2026",7,0,0,0,0),
    mkS(2,10,"d38-mc","Monday Cherry","Winter 2026",5,2,1,0,1),
    mkS(3,12,"d38-mc","Monday Cherry","Winter 2026",5,2,0,0,4),
    mkS(4,14,"d38-mc","Monday Cherry","Winter 2026",4,3,0,1,3),
    mkS(5,16,"d38-mc","Monday Cherry","Winter 2026",4,3,1,0,7),
    mkS(6,18,"d38-mc","Monday Cherry","Winter 2026",3,4,0,0,5),
    mkS(7,20,"d38-mc","Monday Cherry","Winter 2026",2,5,0,0,6),
    mkS(8,22,"d38-mc","Monday Cherry","Winter 2026",1,6,0,1,9),
  ],
  "d38-mh": [
    mkS(1,9,"d38-mh","Monday Hammer","Winter 2026",6,1,2,0,0),
    mkS(2,11,"d38-mh","Monday Hammer","Winter 2026",6,1,0,0,1),
    mkS(3,13,"d38-mh","Monday Hammer","Winter 2026",5,2,0,1,2),
    mkS(4,15,"d38-mh","Monday Hammer","Winter 2026",4,3,1,1,3),
    mkS(5,17,"d38-mh","Monday Hammer","Winter 2026",3,4,0,0,5),
    mkS(6,19,"d38-mh","Monday Hammer","Winter 2026",2,5,1,0,6),
    mkS(7,21,"d38-mh","Monday Hammer","Winter 2026",2,5,0,0,9),
    mkS(8,23,"d38-mh","Monday Hammer","Winter 2026",1,6,0,0,11),
  ],
  "d38-tp": [
    mkS(1,3,"d38-tp","Tuesday Pilot","Winter 2026",6,1,0,0,0),
    mkS(2,5,"d38-tp","Tuesday Pilot","Winter 2026",5,2,1,0,1),
    mkS(3,7,"d38-tp","Tuesday Pilot","Winter 2026",5,2,0,1,4),
    mkS(4,1,"d38-tp","Tuesday Pilot","Winter 2026",4,3,0,0,3),
    mkS(5,16,"d38-tp","Tuesday Pilot","Winter 2026",3,4,1,1,7),
    mkS(6,19,"d38-tp","Tuesday Pilot","Winter 2026",3,4,0,0,5),
    mkS(7,21,"d38-tp","Tuesday Pilot","Winter 2026",2,5,0,0,9),
    mkS(8,25,"d38-tp","Tuesday Pilot","Winter 2026",1,6,0,0,14),
  ],
  "d38-tc": [
    mkS(1,6,"d38-tc","Tuesday Cherry","Winter 2026",6,1,1,0,0),
    mkS(2,17,"d38-tc","Tuesday Cherry","Winter 2026",5,2,0,0,1),
    mkS(3,20,"d38-tc","Tuesday Cherry","Winter 2026",4,3,0,1,3),
    mkS(4,22,"d38-tc","Tuesday Cherry","Winter 2026",4,3,1,0,7),
    mkS(5,24,"d38-tc","Tuesday Cherry","Winter 2026",3,4,0,0,5),
    mkS(6,26,"d38-tc","Tuesday Cherry","Winter 2026",2,5,0,0,6),
    mkS(7,28,"d38-tc","Tuesday Cherry","Winter 2026",1,6,0,1,9),
    mkS(8,30,"d38-tc","Tuesday Cherry","Winter 2026",1,6,0,0,11),
  ],
  "d38-th": [
    mkS(1,2,"d38-th","Tuesday Hammer","Winter 2026",7,0,0,0,0),
    mkS(2,4,"d38-th","Tuesday Hammer","Winter 2026",5,2,1,0,4),
    mkS(3,15,"d38-th","Tuesday Hammer","Winter 2026",5,2,0,0,1),
    mkS(4,23,"d38-th","Tuesday Hammer","Winter 2026",3,4,0,1,5),
    mkS(5,27,"d38-th","Tuesday Hammer","Winter 2026",3,4,0,0,7),
    mkS(6,29,"d38-th","Tuesday Hammer","Winter 2026",2,5,0,0,6),
    mkS(7,31,"d38-th","Tuesday Hammer","Winter 2026",1,6,0,0,9),
    mkS(8,8,"d38-th","Tuesday Hammer","Winter 2026",0,7,0,0,14),
  ],
};

// Matches with week numbers
const mkM = (id, did, dn, ai, bi, aw, bw, ot, dt, tm, ct, wk) => ({
  id, division_id: did, division_name: dn,
  team_a_id: MOCK_TEAMS[ai].id, team_a_name: MOCK_TEAMS[ai].name,
  team_b_id: MOCK_TEAMS[bi].id, team_b_name: MOCK_TEAMS[bi].name,
  team_a_match_wins: aw, team_b_match_wins: bw,
  winner_id: aw > bw ? MOCK_TEAMS[ai].id : MOCK_TEAMS[bi].id,
  winner_name: aw > bw ? MOCK_TEAMS[ai].name : MOCK_TEAMS[bi].name,
  went_to_ot: ot, status: "completed",
  scheduled_date: dt, scheduled_time: tm, court: ct, _week: wk,
});

const mkU = (id, did, dn, ai, bi, dt, tm, ct, wk) => ({
  id, division_id: did, division_name: dn,
  team_a_id: MOCK_TEAMS[ai].id, team_a_name: MOCK_TEAMS[ai].name,
  team_b_id: MOCK_TEAMS[bi].id, team_b_name: MOCK_TEAMS[bi].name,
  team_a_match_wins: null, team_b_match_wins: null,
  winner_id: null, winner_name: null,
  went_to_ot: false, status: "scheduled",
  scheduled_date: dt, scheduled_time: tm, court: ct, _week: wk,
});

const MOCK_MATCHES = {
  "d38-mp": [
    mkM("mp1","d38-mp","Mon Pilot",0,15,2,0,false,"2026-01-12","19:00",1,1),
    mkM("mp2","d38-mp","Mon Pilot",1,14,2,1,true,"2026-01-12","19:00",2,1),
    mkM("mp3","d38-mp","Mon Pilot",2,13,2,0,false,"2026-01-12","20:15",1,1),
    mkM("mp4","d38-mp","Mon Pilot",3,12,1,2,false,"2026-01-12","20:15",2,1),
    mkM("mp5","d38-mp","Mon Pilot",0,9,2,0,false,"2026-01-19","19:00",1,2),
    mkM("mp6","d38-mp","Mon Pilot",4,11,2,0,false,"2026-01-19","19:00",2,2),
    mkM("mp7","d38-mp","Mon Pilot",1,8,2,1,true,"2026-01-19","20:15",1,2),
    mkM("mp8","d38-mp","Mon Pilot",5,6,0,2,false,"2026-01-19","20:15",2,2),
    mkM("mp9","d38-mp","Mon Pilot",0,3,2,1,true,"2026-01-26","19:00",1,3),
    mkM("mp10","d38-mp","Mon Pilot",1,5,2,0,false,"2026-01-26","19:00",2,3),
    mkM("mp11","d38-mp","Mon Pilot",4,7,2,0,false,"2026-01-26","20:15",1,3),
    mkM("mp12","d38-mp","Mon Pilot",2,10,2,0,false,"2026-01-26","20:15",2,3),
    mkM("mp13","d38-mp","Mon Pilot",0,7,2,0,false,"2026-02-02","19:00",1,4),
    mkM("mp14","d38-mp","Mon Pilot",1,2,2,0,false,"2026-02-02","19:00",2,4),
    mkM("mp15","d38-mp","Mon Pilot",4,5,2,1,true,"2026-02-02","20:15",1,4),
    mkM("mp16","d38-mp","Mon Pilot",3,9,1,2,false,"2026-02-02","20:15",2,4),
    mkU("mp17","d38-mp","Mon Pilot",0,2,"2026-02-16","19:00",1,6),
    mkU("mp18","d38-mp","Mon Pilot",1,4,"2026-02-16","19:00",2,6),
    mkU("mp19","d38-mp","Mon Pilot",3,5,"2026-02-16","20:15",1,6),
    mkU("mp20","d38-mp","Mon Pilot",6,8,"2026-02-16","20:15",2,6),
    mkU("mp21","d38-mp","Mon Pilot",0,4,"2026-02-23","19:00",1,7),
    mkU("mp22","d38-mp","Mon Pilot",1,3,"2026-02-23","19:00",2,7),
    mkU("mp23","d38-mp","Mon Pilot",2,5,"2026-02-23","20:15",1,7),
    mkU("mp24","d38-mp","Mon Pilot",7,9,"2026-02-23","20:15",2,7),
    mkU("mp25","d38-mp","Mon Pilot",0,1,"2026-03-02","19:00",1,8),
    mkU("mp26","d38-mp","Mon Pilot",2,4,"2026-03-02","19:00",2,8),
    mkU("mp27","d38-mp","Mon Pilot",3,6,"2026-03-02","20:15",1,8),
    mkU("mp28","d38-mp","Mon Pilot",5,10,"2026-03-02","20:15",2,8),
  ],
};

// Fill other divisions
["d38-mc","d38-mh","d38-tp","d38-tc","d38-th"].forEach(did => {
  const st = MOCK_STANDINGS[did];
  if (!st || st.length < 4) return;
  const dn = st[0].division_name;
  const isTue = did.includes("-t");
  const base = isTue ? "2026-01-13" : "2026-01-12";
  const idx = (n) => TEAM_POOL.indexOf(n);
  MOCK_MATCHES[did] = [];
  for (let wk = 1; wk <= 4; wk++) {
    const d = new Date(base + "T12:00:00");
    d.setDate(d.getDate() + (wk - 1) * 7);
    const ds = d.toISOString().split("T")[0];
    const a = Math.min(wk - 1, st.length - 1);
    const b = Math.min(st.length - wk, st.length - 1);
    MOCK_MATCHES[did].push(mkM(`${did}-w${wk}-1`, did, dn, idx(st[Math.min(a, st.length-1)].team_name), idx(st[Math.min(b, st.length-1)].team_name), 2, 1, wk % 3 === 0, ds, "19:00", 1, wk));
    if (st.length > 2) {
      MOCK_MATCHES[did].push(mkM(`${did}-w${wk}-2`, did, dn, idx(st[Math.min(a+1, st.length-1)].team_name), idx(st[Math.max(b-1, 0)].team_name), 2, 0, false, ds, "19:00", 2, wk));
    }
  }
  for (let wk = 6; wk <= 8; wk++) {
    const d = new Date(base + "T12:00:00");
    d.setDate(d.getDate() + (wk - 1) * 7);
    const ds = d.toISOString().split("T")[0];
    MOCK_MATCHES[did].push(mkU(`${did}-w${wk}-1`, did, dn, idx(st[0].team_name), idx(st[1].team_name), ds, "19:00", 1, wk));
    if (st.length > 2) {
      MOCK_MATCHES[did].push(mkU(`${did}-w${wk}-2`, did, dn, idx(st[2].team_name), idx(st[3].team_name), ds, "19:00", 2, wk));
    }
  }
});

const MOCK_CHAMPS = [
  { id: "c1", team_id: "t1", type: "league", teams: { name: "Disc Jockeys" }, seasons: { name: "Fall 2025" }, divisions: { name: "Monday Pilot", day_of_week: "monday", level: "pilot" } },
  { id: "c2", team_id: "t3", type: "division", teams: { name: "Tang Bangers" }, seasons: { name: "Fall 2025" }, divisions: { name: "Tuesday Pilot", day_of_week: "tuesday", level: "pilot" } },
  { id: "c3", team_id: "t1", type: "league", teams: { name: "Disc Jockeys" }, seasons: { name: "Summer 2025" }, divisions: { name: "Monday Pilot", day_of_week: "monday", level: "pilot" } },
  { id: "c4", team_id: "t2", type: "division", teams: { name: "Puck Dynasty" }, seasons: { name: "Summer 2025" }, divisions: { name: "Monday Cherry", day_of_week: "monday", level: "cherry" } },
  { id: "c5", team_id: "t3", type: "division", teams: { name: "Tang Bangers" }, seasons: { name: "Spring 2025" }, divisions: { name: "Monday Pilot", day_of_week: "monday", level: "pilot" } },
  { id: "c6", team_id: "t4", type: "league", teams: { name: "Royal Flush" }, seasons: { name: "Spring 2025" }, divisions: { name: "Tuesday Pilot", day_of_week: "tuesday", level: "pilot" } },
  { id: "c7", team_id: "t1", type: "banquet", teams: { name: "Disc Jockeys" }, seasons: { name: "Fall 2025" }, divisions: null },
  { id: "c8", team_id: "t4", type: "banquet", teams: { name: "Royal Flush" }, seasons: { name: "Fall 2025" }, divisions: null },
  { id: "c9", team_id: "t2", type: "banquet", teams: { name: "Puck Dynasty" }, seasons: { name: "Fall 2025" }, divisions: null },
  { id: "c10", team_id: "t3", type: "banquet", teams: { name: "Tang Bangers" }, seasons: { name: "Fall 2025" }, divisions: null },
  { id: "c11", team_id: "t6", type: "division", teams: { name: "Wax On Wax Off" }, seasons: { name: "Fall 2025" }, divisions: { name: "Monday Cherry", day_of_week: "monday", level: "cherry" } },
  { id: "c12", team_id: "t5", type: "division", teams: { name: "Slide Rules" }, seasons: { name: "Fall 2025" }, divisions: { name: "Monday Hammer", day_of_week: "monday", level: "hammer" } },
  { id: "c13", team_id: "t7", type: "division", teams: { name: "Off The Rails" }, seasons: { name: "Fall 2025" }, divisions: { name: "Tuesday Cherry", day_of_week: "tuesday", level: "cherry" } },
  { id: "c14", team_id: "t8", type: "division", teams: { name: "The Shufflers" }, seasons: { name: "Fall 2025" }, divisions: { name: "Tuesday Hammer", day_of_week: "tuesday", level: "hammer" } },
  { id: "c15", team_id: "t9", type: "division", teams: { name: "Biscuit Riskers" }, seasons: { name: "Fall 2025" }, divisions: { name: "Monday Pilot", day_of_week: "monday", level: "pilot" } },
];

// Mock resolver
function getMock(table, params) {
  const get = (k) => {
    const m = params.match(new RegExp(`${k}=(?:eq\\.|in\\.\\()?([^&)]+)`));
    return m ? m[1] : null;
  };

  if (table === "seasons") return MOCK_SEASONS;
  if (table === "divisions") return MOCK_DIVISIONS[get("season_id")] || MOCK_DIVISIONS.s38;

  if (table === "division_standings") {
    const did = get("division_id");
    const sn = get("season_name");
    if (did) return MOCK_STANDINGS[did] || [];
    if (sn) {
      const a = [];
      Object.values(MOCK_STANDINGS).forEach(x => x.forEach(s => {
        if (s.season_name === decodeURIComponent(sn)) a.push(s);
      }));
      return a;
    }
    return [];
  }

  if (table === "recent_matches") {
    const did = get("division_id");
    let a = [];
    if (did) {
      did.split(",").forEach(id => { if (MOCK_MATCHES[id]) a.push(...MOCK_MATCHES[id]); });
    } else {
      Object.values(MOCK_MATCHES).forEach(x => a.push(...x));
    }
    const tA = params.includes("team_a_id") ? get("team_a_id") : null;
    const tB = params.includes("team_b_id") ? get("team_b_id") : null;
    if (tA || tB) { const t = tA || tB; a = a.filter(m => m.team_a_id === t || m.team_b_id === t); }
    if (get("status") === "completed") a = a.filter(m => m.status === "completed");
    if (params.includes("status=neq.completed")) a = a.filter(m => m.status !== "completed");
    if (params.includes("desc")) a.sort((x, y) => (y.scheduled_date || "").localeCompare(x.scheduled_date || ""));
    else a.sort((x, y) => (x.scheduled_date || "").localeCompare(y.scheduled_date || ""));
    const lm = params.match(/limit=(\d+)/);
    if (lm) a = a.slice(0, +lm[1]);
    return a;
  }

  if (table === "teams") {
    let t = [...MOCK_TEAMS];
    if (params.includes("order=elo_rating.desc")) t.sort((a, b) => b.elo_rating - a.elo_rating);
    if (params.includes("order=championships.desc")) t.sort((a, b) => (b.championships - a.championships) || (b.elo_rating - a.elo_rating));
    const id = get("id");
    if (id) return t.filter(x => x.id === id);
    const lm = params.match(/limit=(\d+)/);
    if (lm) t = t.slice(0, +lm[1]);
    return t;
  }

  if (table === "championships") return MOCK_CHAMPS;
  return [];
}

// ══════════════════════════════════════
// ─── UI COMPONENTS ───
// ══════════════════════════════════════

function Logo({ size = 38 }) {
  const cx = size / 2, cy = size / 2, r = size * 0.42;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
      <circle cx={cx} cy={cy} r={r} stroke={C.amber} strokeWidth={size * 0.04} fill="none" />
      <circle cx={cx} cy={cy} r={r * 0.85} fill="transparent" stroke={`${C.amber}22`} strokeWidth={1} />
      <circle cx={cx} cy={cy} r={r * 0.6} fill={`${C.amber}11`} stroke={`${C.amber}33`} strokeWidth={1} />
      <circle cx={cx} cy={cy} r={r * 0.35} fill={`${C.amber}22`} stroke={`${C.amber}44`} strokeWidth={1} />
      <circle cx={cx} cy={cy} r={r * 0.15} fill={C.amber} />
      {[...Array(12)].map((_, i) => {
        const a = (i * 30 - 90) * (Math.PI / 180);
        return (
          <line key={i}
            x1={cx + Math.cos(a) * r * 0.88} y1={cy + Math.sin(a) * r * 0.88}
            x2={cx + Math.cos(a) * r * (i % 3 === 0 ? 0.72 : 0.78)}
            y2={cy + Math.sin(a) * r * (i % 3 === 0 ? 0.72 : 0.78)}
            stroke={C.amber} strokeWidth={i % 3 === 0 ? 2.5 : 1.2} strokeLinecap="round" />
        );
      })}
      <line x1={cx} y1={cy} x2={cx + r * 0.55} y2={cy - r * 0.55} stroke={C.text} strokeWidth={size * 0.035} strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={cx - r * 0.15} y2={cy - r * 0.38} stroke={C.text} strokeWidth={size * 0.045} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={r * 0.06} fill={C.text} />
    </svg>
  );
}

function TeamAvatar({ name, size = 34 }) {
  const h = hashStr(name);
  const hue = h % 360;
  const sh = (h >> 8) % 4;
  const c1 = `hsl(${hue},55%,50%)`;
  const c2 = `hsl(${(hue + 120) % 360},45%,40%)`;
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" style={{ borderRadius: 9, flexShrink: 0 }}>
      <rect width="34" height="34" rx="9" fill={`hsl(${hue},30%,15%)`} />
      {sh === 0 && <><circle cx="17" cy="17" r="10" fill={c1} opacity="0.3" /><circle cx="17" cy="17" r="5" fill={c1} opacity="0.6" /></>}
      {sh === 1 && <><rect x="7" y="7" width="20" height="20" rx="4" fill={c1} opacity="0.3" transform="rotate(45 17 17)" /><circle cx="17" cy="17" r="4" fill={c2} opacity="0.5" /></>}
      {sh === 2 && <><polygon points="17,5 28,26 6,26" fill={c1} opacity="0.35" /><circle cx="17" cy="19" r="4" fill={c2} opacity="0.5" /></>}
      {sh === 3 && <><rect x="5" y="12" width="24" height="10" rx="5" fill={c1} opacity="0.3" /><rect x="12" y="5" width="10" height="24" rx="5" fill={c2} opacity="0.25" /><circle cx="17" cy="17" r="3" fill={c1} opacity="0.6" /></>}
    </svg>
  );
}

function Card({ children, style, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14,
      padding: "16px 20px", cursor: onClick ? "pointer" : "default",
      transition: "all 0.2s", ...style,
    }}>
      {children}
    </div>
  );
}

function Badge({ children, color = C.amber, style }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "3px 9px",
      borderRadius: 20, fontSize: 11, fontWeight: 600, fontFamily: F.m,
      background: color + "18", color, letterSpacing: 0.3, whiteSpace: "nowrap", ...style,
    }}>
      {children}
    </span>
  );
}

function Loader() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
      <div style={{ width: 28, height: 28, border: `3px solid ${C.border}`, borderTopColor: C.amber, borderRadius: "50%", animation: "ttspin 0.8s linear infinite" }} />
      <style>{`@keyframes ttspin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function Empty({ msg }) {
  return <p style={{ textAlign: "center", color: C.dim, fontFamily: F.b, fontSize: 14, padding: 32 }}>{msg}</p>;
}

function SectionTitle({ children, right }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "0 0 12px" }}>
      <h3 style={{ fontFamily: F.d, fontSize: 18, color: C.text, margin: 0 }}>{children}</h3>
      {right && <span style={{ fontSize: 11, fontFamily: F.m, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>{right}</span>}
    </div>
  );
}

function MockBanner() {
  if (!USE_MOCK) return null;
  return (
    <div style={{ background: `${C.blue}15`, border: `1px solid ${C.blue}30`, borderRadius: 10, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 14 }}>🔌</span>
      <span style={{ fontFamily: F.m, fontSize: 11, color: C.blue }}>Preview mode — sample data. Live data when deployed.</span>
    </div>
  );
}

function Footer() {
  return (
    <div style={{ textAlign: "center", marginTop: 40, paddingBottom: 8, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <p style={{ fontFamily: F.m, fontSize: 11, color: C.dim, margin: 0 }}>
        By using this app, you agree to the{" "}
        <a href="/terms" style={{ color: C.amber, textDecoration: "none" }}>Terms of Service</a>.
      </p>
      <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
        <NHSALogo size={20} />
        <span style={{ fontFamily: F.m, fontSize: 11, color: C.muted }}>Built by Next Hammer SA</span>
      </div>
    </div>
  );
}

function TeamLink({ name, teamId, goPage, style }) {
  return (
    <span
      onClick={(e) => { e.stopPropagation(); goPage("teams", { teamId }); }}
      style={{ cursor: "pointer", ...style }}
    >
      {name}
    </span>
  );
}

// ─── Division Pills ───
function DivisionPills({ divisions, selected, onSelect }) {
  const grouped = {};
  const sorted = [...(divisions || [])].filter(d => d.level !== "party" || d.has_data).sort((a, b) =>
    (dayOrder[a.day_of_week] ?? 9) - (dayOrder[b.day_of_week] ?? 9) ||
    (levelOrder[a.level] ?? 9) - (levelOrder[b.level] ?? 9)
  );
  sorted.forEach(d => {
    const day = cap(d.day_of_week);
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(d);
  });

  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", margin: "0 -16px", padding: "0 16px" }}>
      <div style={{ display: "flex", gap: 6, paddingBottom: 4, minWidth: "max-content" }}>
        {Object.entries(grouped).map(([day, divs], gi) => (
          <div key={day} style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {gi > 0 && <div style={{ width: 1, height: 20, background: C.border, margin: "0 4px", flexShrink: 0 }} />}
            <span style={{ fontSize: 9, fontFamily: F.m, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5, marginRight: 2, flexShrink: 0 }}>
              {day.slice(0, 3)}
            </span>
            {divs.map(d => {
              const active = selected === d.id;
              return (
                <button key={d.id} onClick={() => onSelect(d.id)} style={{
                  background: active ? C.amber : C.surface, color: active ? C.bg : C.muted,
                  border: `1px solid ${active ? C.amber : C.border}`,
                  borderRadius: 8, padding: "7px 12px", cursor: "pointer",
                  fontFamily: F.m, fontSize: 11, fontWeight: active ? 700 : 500,
                  whiteSpace: "nowrap", transition: "all 0.15s",
                }}>
                  {(() => {
                    const days = ['monday','tuesday','wednesday'];
                    const stripped = d.name.replace(/^(monday|tuesday|wednesday)\s*/i, '').trim();
                    const label = (stripped && !days.includes(stripped.toLowerCase()) && stripped.toLowerCase() !== d.level) ? stripped : cap(d.level);
                    return <>{levelEmoji(d.level)} {label}</>;
                  })()}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Week Selector ───
function WeekPills({ totalWeeks = 8, selected, onSelect, currentWeek }) {
  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", margin: "0 -16px", padding: "0 16px" }}>
      <div style={{ display: "flex", gap: 4, paddingBottom: 4, minWidth: "max-content" }}>
        <button onClick={() => onSelect(null)} style={{
          background: selected === null ? C.amber : C.surface,
          color: selected === null ? C.bg : C.muted,
          border: `1px solid ${selected === null ? C.amber : C.border}`,
          borderRadius: 8, padding: "7px 12px", cursor: "pointer",
          fontFamily: F.m, fontSize: 11, fontWeight: selected === null ? 700 : 500, whiteSpace: "nowrap",
        }}>All</button>
        {[...Array(totalWeeks)].map((_, i) => {
          const wk = i + 1;
          const active = selected === wk;
          const isCurrent = wk === currentWeek;
          return (
            <button key={wk} onClick={() => onSelect(wk)} style={{
              background: active ? C.amber : C.surface,
              color: active ? C.bg : C.muted,
              border: `1px solid ${active ? C.amber : isCurrent ? C.green + "60" : C.border}`,
              borderRadius: 8, padding: "7px 10px", cursor: "pointer",
              fontFamily: F.m, fontSize: 11, fontWeight: active ? 700 : 500,
              whiteSpace: "nowrap", position: "relative",
            }}>
              Wk {wk}
              {isCurrent && !active && (
                <span style={{ position: "absolute", top: 2, right: 2, width: 4, height: 4, borderRadius: "50%", background: C.green }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Match Row ───
function MatchRow({ m, goPage, teamRecords, h2h }) {
  const aWon = m.winner_id === m.team_a_id;
  const bWon = m.winner_id === m.team_b_id;
  const done = m.status === "completed" && m.winner_id;
  const isOT = m.went_to_ot;
  const recA = teamRecords?.[m.team_a_id];
  const recB = teamRecords?.[m.team_b_id];
  const h2hKey = [m.team_a_id, m.team_b_id].sort().join("-");
  const h2hData = h2h?.[h2hKey];
  return (
    <Card style={{ padding: 0, overflow: "hidden", marginBottom: 8 }}>
      <div style={{ padding: "12px 14px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 0 }}>
          <div style={{ minWidth: 0 }}>
            <TeamLink name={m.team_a_name} teamId={m.team_a_id} goPage={goPage}
              style={{
                fontFamily: F.b, fontSize: 13,
                fontWeight: done && aWon ? 700 : 400,
                color: done ? (aWon ? C.text : C.muted) : C.text,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block",
              }} />
            {recA && <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>({recA.w}-{recA.l})</span>}
          </div>
          <div style={{ padding: "0 8px", textAlign: "center", display: "flex", alignItems: "center", gap: 3, justifyContent: "center", minWidth: 56 }}>
            {done ? (<>
              {aWon ? <Badge color={C.green} style={{ fontSize: 8, padding: "2px 5px" }}>W</Badge> :
               <Badge color={C.red} style={{ fontSize: 8, padding: "2px 5px" }}>L</Badge>}
              <span style={{ color: C.dim, fontSize: 10 }}>vs</span>
              {bWon ? <Badge color={C.green} style={{ fontSize: 8, padding: "2px 5px" }}>W</Badge> :
               <Badge color={C.red} style={{ fontSize: 8, padding: "2px 5px" }}>L</Badge>}
              {isOT && <Badge color={C.amber} style={{ fontSize: 8, padding: "2px 4px" }}>OT</Badge>}
            </>) : (
              <span style={{ fontFamily: F.m, fontSize: 11, color: C.amber, fontWeight: 700 }}>VS</span>
            )}
          </div>
          <div style={{ minWidth: 0, textAlign: "right" }}>
            <TeamLink name={m.team_b_name} teamId={m.team_b_id} goPage={goPage}
              style={{
                fontFamily: F.b, fontSize: 13,
                fontWeight: done && bWon ? 700 : 400,
                color: done ? (bWon ? C.text : C.muted) : C.text,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block",
                textAlign: "right",
              }} />
            {recB && <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>({recB.w}-{recB.l})</span>}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 14, padding: "7px 14px", background: C.surfAlt, borderTop: `1px solid ${C.border}` }}>
        <span style={{ fontFamily: F.m, fontSize: 11, color: C.dim }}>{fmtDate(m.scheduled_date)}</span>
        {m.scheduled_time && <span style={{ fontFamily: F.m, fontSize: 11, color: C.dim }}>{fmtTime(m.scheduled_time)}</span>}
        {m.court && <span style={{ fontFamily: F.m, fontSize: 11, color: C.dim }}>Court {String(m.court).replace(/^Court\s*/i, "").replace(/^0+/, "") || m.court}</span>}
        {!done && h2hData && h2hData.total > 0 && <span style={{ fontFamily: F.m, fontSize: 11, color: C.amber }}>H2H: {h2hData.aWins}-{h2hData.bWins}</span>}
      </div>
    </Card>
  );
}

// ─── Season Selector ───
function SeasonSelector({ seasons, selected, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} style={{
        background: C.surface, color: C.text, border: `1px solid ${open ? C.amber : C.border}`,
        borderRadius: 10, padding: "8px 14px", cursor: "pointer",
        fontFamily: F.m, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6,
      }}>
        {selected?.name || "Season"}
        {selected?.is_active && <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, flexShrink: 0 }} />}
        <span style={{ fontSize: 9, color: C.dim, marginLeft: 2 }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0,
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: 6, width: 200, maxHeight: 320, overflowY: "auto", zIndex: 200,
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        }}>
          {seasons.map(s => (
            <button key={s.id} onClick={() => { onSelect(s); setOpen(false); }} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              width: "100%", padding: "10px 12px", border: "none", borderRadius: 8,
              background: s.id === selected?.id ? C.amberGlow : "transparent",
              color: s.id === selected?.id ? C.amber : C.text,
              cursor: "pointer", fontFamily: F.m, fontSize: 12,
              fontWeight: s.id === selected?.id ? 700 : 500, textAlign: "left",
            }}>
              {s.name}
              {s.is_active && <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════
// ─── PAGES ───
// ══════════════════════════════════════

// ─── HOME ───
function HomePage({ seasons, activeSeason, divisions, goPage, champs }) {
  const [leaders, setLeaders] = useState([]);
  const [recent, setRecent] = useState([]);
  const [allStandings, setAllStandings] = useState([]);
  const [topTeams, setTopTeams] = useState([]);
  const [loading, setLoading] = useState(true);

  const progress = getSeasonProgress(activeSeason);
  const isPast = progress.status === "completed";

  // Compute actual current week from data
  const dataWeek = useMemo(() => {
    if (isPast) return null;
    const maxGames = allStandings.length
      ? Math.max(...allStandings.map(s => (s.wins || 0) + (s.losses || 0)))
      : 0;
    const dataW = maxGames > 0 ? Math.min(maxGames, 8) : 0;
    return Math.max(dataW, progress.week || 0) || null;
  }, [allStandings, progress.week, isPast]);
  const progressLabel = isPast ? "Completed" : (dataWeek ? `Week ${dataWeek} of 8` : progress.label);

  useEffect(() => {
    if (!activeSeason || !divisions?.length) return;
    setLoading(true);
    const ids = divisions.map(d => d.id);
    Promise.all([
      q("division_standings", `season_name=eq.${encodeURIComponent(activeSeason.name)}&order=division_name,calculated_rank&limit=200`),
      q("recent_matches", `division_id=in.(${ids.join(",")})&status=eq.completed&order=scheduled_date.desc&limit=20`),
      q("teams", "order=championship_count.desc,recrec_elo.desc&limit=10"),
    ]).then(([st, rc, tm]) => {
      setAllStandings(st || []);
      if (st) {
        const byDiv = {};
        st.forEach(s => {
          if (!byDiv[s.division_name] || s.calculated_rank < byDiv[s.division_name].calculated_rank) {
            byDiv[s.division_name] = s;
          }
        });
        setLeaders(Object.values(byDiv));
      }
      setRecent(rc || []);
      setTopTeams(tm || []);
      setLoading(false);
    });
  }, [activeSeason, divisions]);

  const teamCount = useMemo(() => {
    const ids = new Set();
    allStandings.forEach(s => ids.add(s.team_id));
    return ids.size || "—";
  }, [allStandings]);

  const completedCount = useMemo(() => {
    if (!allStandings.length) return "—";
    let total = 0;
    allStandings.forEach(s => total += (s.wins || 0));
    return total; // Each completed match produces exactly 1 win
  }, [allStandings]);

  // Get season champion and division winners for past seasons
  const seasonChamp = useMemo(() => {
    if (!isPast || !champs?.length) return null;
    return champs.find(c => c.seasons?.name === activeSeason?.name && (!c.type || c.type === "league"));
  }, [isPast, champs, activeSeason]);

  const divisionWinners = useMemo(() => {
    if (!isPast) return [];
    const dayOrd = { monday: 0, tuesday: 1, wednesday: 2 };
    const lvlOrd = { pilot: 0, cherry: 1, hammer: 2, party: 3 };
    const seasonDivs = divisions.filter(d => d.level !== 'party' || d.team_seasons?.length > 0);
    return seasonDivs
      .map(d => {
        const champ = champs?.find(c => c.type === 'division' && c.divisions?.name === d.name && c.seasons?.name === activeSeason?.name);
        return champ
          ? { ...champ, division_name: d.name, _incomplete: false }
          : { division_name: d.name, day_of_week: d.day_of_week, level: d.level, _incomplete: true };
      })
      .sort((a, b) => {
        const dn = n => { const p = (n||'').toLowerCase().split(' '); return [dayOrd[p[0]]??9, lvlOrd[p[1]]??9]; };
        const [ad, al] = dn(a.division_name);
        const [bd, bl] = dn(b.division_name);
        return ad !== bd ? ad - bd : al - bl;
      });
  }, [isPast, divisions, champs, activeSeason]);

  if (loading) return <Loader />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <MockBanner />

      {/* Hero */}
      <div style={{
        background: `linear-gradient(135deg, ${C.surface} 0%, #1a1520 50%, ${C.surface} 100%)`,
        border: `1px solid ${C.border}`, borderRadius: 18, padding: "28px 24px",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 160, height: 160, borderRadius: "50%", background: `radial-gradient(circle, ${C.amber}08, transparent 70%)` }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h2 style={{ fontFamily: F.d, fontSize: 24, fontWeight: 700, color: C.text, margin: 0 }}>
            {activeSeason?.name || "Current Season"}
          </h2>
          <Badge
            color={progress.status === "completed" ? C.muted : progress.status === "upcoming" ? C.blue : C.green}
            style={{ flexShrink: 0 }}
          >
            {progress.status === "completed" ? "✓" : progress.status === "upcoming" ? "◷" : "●"} {progressLabel}
          </Badge>
        </div>
        <p style={{ fontFamily: F.b, fontSize: 13, color: C.muted, margin: "0 0 18px" }}>Royal Palms Brooklyn</p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", alignItems: "baseline" }}>
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontFamily: F.d, fontSize: 26, fontWeight: 700, color: C.text }}>{teamCount || "96"}</div>
            <div style={{ fontFamily: F.m, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1.2 }}>Teams</div>
          </div>
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontFamily: F.d, fontSize: 26, fontWeight: 700, color: C.text }}>{divisions?.length || 0}</div>
            <div style={{ fontFamily: F.m, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1.2 }}>Divisions</div>
          </div>
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontFamily: F.d, fontSize: 26, fontWeight: 700, color: C.amber }}>{completedCount}</div>
            <div style={{ fontFamily: F.m, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1.2 }}>Matches</div>
          </div>
        </div>
      </div>

      {/* PAST SEASON: Champion + Division Winners */}
      {isPast && seasonChamp && (
        <div>
          <Card style={{
            background: `linear-gradient(135deg, #1a1520, ${C.surface})`,
            border: `1px solid ${C.amber}30`, textAlign: "center", padding: "28px 24px",
          }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🏆</div>
            <div style={{ fontFamily: F.m, fontSize: 10, color: C.amber, textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>
              Season Champion
            </div>
            <h3
              onClick={() => goPage("teams", { teamId: seasonChamp.team_id })}
              style={{ fontFamily: F.d, fontSize: 22, color: C.text, margin: "0 0 4px", cursor: "pointer" }}
            >
              {seasonChamp.teams?.name}
            </h3>
            <p style={{ fontFamily: F.b, fontSize: 13, color: C.muted, margin: 0 }}>
              Won playoff tournament · {activeSeason?.name}
            </p>
          </Card>
        </div>
      )}

      {isPast && divisionWinners.length > 0 && (
        <div>
          <SectionTitle right={activeSeason?.name}>Division Champions</SectionTitle>
          {divisionWinners.map((dw, i) => (
            <Card key={i} onClick={dw._incomplete ? undefined : () => goPage("teams", { teamId: dw.team_id })}
              style={{ padding: "14px 18px", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: dw._incomplete ? "default" : "pointer", opacity: dw._incomplete ? 0.6 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {!dw._incomplete && <TeamAvatar name={dw.teams?.name || dw.team_name || "?"} size={36} />}
                {dw._incomplete && <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.surface, border: `1px solid ${C.border}`, flexShrink: 0 }} />}
                <div>
                  <div style={{ fontFamily: F.b, fontSize: 14, fontWeight: 600, color: dw._incomplete ? C.muted : C.text }}>
                    {dw._incomplete ? "Data incomplete" : (dw.teams?.name || dw.team_name)}
                  </div>
                  <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>
                    {dw.divisions ? `${cap(dw.divisions.day_of_week)} ${cap(dw.divisions.level)}` : (dw.division_name || "")}
                  </div>
                </div>
              </div>
              {!dw._incomplete && <Badge color={C.amber}>🥇</Badge>}
            </Card>
          ))}
        </div>
      )}

      {/* CURRENT SEASON: Division Leaders */}
      {!isPast && leaders.length > 0 && (
        <div>
          <SectionTitle right={activeSeason?.name}>Division Leaders</SectionTitle>
          {leaders.sort((a, b) => {
            const dn = (n) => { const p = (n || "").split(" "); return [dayOrder[p[0]?.toLowerCase()] ?? 9, levelOrder[p[1]?.toLowerCase()] ?? 9]; };
            const [ad, al] = dn(a.division_name); const [bd, bl] = dn(b.division_name);
            return ad !== bd ? ad - bd : al - bl;
          }).map((l, i) => (
            <Card key={i} onClick={() => goPage("teams", { teamId: l.team_id })}
              style={{ padding: "14px 18px", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <TeamAvatar name={l.team_name} size={36} />
                <div>
                  <div style={{ fontFamily: F.b, fontSize: 14, fontWeight: 600, color: C.text }}>{l.team_name}</div>
                  <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>{l.division_name}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: F.m, fontSize: 14, fontWeight: 700, color: C.text }}>{l.wins}-{l.losses}</span>
                <Badge color={C.green}>1st</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Recent Results */}
      {recent.length > 0 && (
        <div>
          <SectionTitle right="Latest">Recent Results</SectionTitle>
          {recent.slice(0, 6).map((m, i) => {
            const aWon = m.winner_id === m.team_a_id;
            const bWon = m.winner_id === m.team_b_id;
            const isOT = m.went_to_ot;
            return (
              <Card key={m.id || i} style={{ padding: "12px 18px", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <TeamLink name={m.team_a_name} teamId={m.team_a_id} goPage={goPage}
                      style={{
                        fontFamily: F.b, fontSize: 14,
                        fontWeight: aWon ? 700 : 400,
                        color: aWon ? C.text : C.muted,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block",
                      }} />
                  </div>
                  <div style={{ padding: "0 10px", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    {aWon ? <Badge color={C.green} style={{ fontSize: 9, padding: "2px 6px" }}>W</Badge> :
                     bWon ? <Badge color={C.red} style={{ fontSize: 9, padding: "2px 6px" }}>L</Badge> : null}
                    <span style={{ color: C.dim, fontSize: 11 }}>vs</span>
                    {bWon ? <Badge color={C.green} style={{ fontSize: 9, padding: "2px 6px" }}>W</Badge> :
                     aWon ? <Badge color={C.red} style={{ fontSize: 9, padding: "2px 6px" }}>L</Badge> : null}
                    {isOT && <Badge color={C.amber} style={{ fontSize: 9, padding: "2px 5px" }}>OT</Badge>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, textAlign: "right" }}>
                    <TeamLink name={m.team_b_name} teamId={m.team_b_id} goPage={goPage}
                      style={{
                        fontFamily: F.b, fontSize: 14,
                        fontWeight: bWon ? 700 : 400,
                        color: bWon ? C.text : C.muted,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block",
                      }} />
                  </div>
                </div>
                <div style={{ textAlign: "center", marginTop: 6 }}>
                  <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>{fmtDate(m.scheduled_date)}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Top Teams - only on current season */}
      {!isPast && topTeams.some(t => (t.championship_count || t.championships) > 0) && (
        <div>
          <SectionTitle right="All-time">Top Teams</SectionTitle>
          {topTeams.filter(t => (t.championship_count || t.championships) > 0).slice(0, 8).map((t, i) => (
            <Card key={t.id} onClick={() => goPage("teams", { teamId: t.id })}
              style={{ padding: "12px 14px", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                <span style={{ fontFamily: F.m, fontSize: 12, color: C.dim, width: 18, flexShrink: 0 }}>{i + 1}</span>
                <TeamAvatar name={t.name} size={28} />
                <span style={{ fontFamily: F.b, fontSize: 14, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
              </div>
              <Badge color={C.amber} style={{ flexShrink: 0, marginLeft: 8 }}>🏆 {t.championship_count || t.championships}</Badge>
            </Card>
          ))}
        </div>
      )}
      <Footer />
    </div>
  );
}

// ─── STANDINGS ───
function StandingsPage({ divisions, activeSeason, goPage }) {
  const [divId, setDivId] = useState(null);
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState("monday");

  const days = useMemo(() => {
    const d = [...new Set((divisions || []).map(div => div.day_of_week))];
    return d.sort((a, b) => (dayOrder[a] ?? 9) - (dayOrder[b] ?? 9));
  }, [divisions]);

  const dayDivisions = useMemo(() => {
    return (divisions || []).filter(d => d.day_of_week === selectedDay);
  }, [divisions, selectedDay]);

  useEffect(() => {
    if (dayDivisions.length) setDivId(dayDivisions[0].id);
  }, [selectedDay, dayDivisions.length]);

  useEffect(() => {
    if (divisions?.length) {
      const firstDay = divisions[0].day_of_week;
      if (!days.includes(selectedDay)) setSelectedDay(firstDay);
      if (!divId) {
        setSelectedDay(firstDay);
        setDivId(divisions[0].id);
      }
    }
  }, [divisions, days]);
  useEffect(() => {
    if (!divId) return;
    setLoading(true);
    const selDiv = divisions?.find(d => d.id === divId);
    const seasonIdForPlayoffs = selDiv?.season_id || activeSeason?.id;
    Promise.all([
      q("division_standings", `division_id=eq.${divId}&order=calculated_rank`),
      q("matches", `division_id=eq.${divId}&status=eq.completed&winner_id=not.is.null&order=scheduled_date.desc,scheduled_time.desc`),
      seasonIdForPlayoffs ? q("playoff_appearances", `season_id=eq.${seasonIdForPlayoffs}`) : Promise.resolve([]),
    ]).then(([d, matches, playoffData]) => {
      const playoffMap = {};
      (playoffData || []).forEach(p => { playoffMap[p.team_id] = p.round_reached; });
      // Compute streaks from matches if not in standings view
      const streakMap = {};
      if (matches?.length) {
        const teamIds = [...new Set((d || []).map(s => s.team_id))];
        teamIds.forEach(tid => {
          const teamMatches = matches.filter(m => m.team_a_id === tid || m.team_b_id === tid);
          let streak = 0, type = "";
          for (const m of teamMatches) {
            const won = m.winner_id === tid;
            const thisType = won ? "W" : "L";
            if (!type) { type = thisType; streak = 1; }
            else if (thisType === type) streak++;
            else break;
          }
          if (type) streakMap[tid] = `${type}${streak}`;
        });
      }
      const enriched = (d || []).map(s => ({
        ...s,
        streak: s.streak || s.current_streak || streakMap[s.team_id] || null,
        playoffRound: playoffMap[s.team_id] || null,
      }));
      setStandings(enriched);
      setLoading(false);
    });
  }, [divId, divisions]);

  const rows = useMemo(() => {
    const ranked = computeRanks(standings);
    if (!ranked.length) return [];
    const leader = ranked[0];
    return ranked.map(t => ({
      ...t,
      gb: t.wins === leader.wins && t.losses === leader.losses ? "—" : calcGB(leader.wins, leader.losses, t.wins, t.losses),
      rankLabel: t.isTied ? `T${t.displayRank}` : `${t.displayRank}`,
    }));
  }, [standings]);

  const selDiv = divisions?.find(d => d.id === divId);

  return (
    <div>
      <h2 style={{ fontFamily: F.d, fontSize: 22, color: C.text, margin: "0 0 4px" }}>Standings</h2>
      <p style={{ fontFamily: F.b, fontSize: 13, color: C.muted, margin: "0 0 16px" }}>
        {activeSeason?.name}{selDiv ? ` · ${cap(selDiv.day_of_week)} ${cap(selDiv.level)}` : ""}
      </p>
      <MockBanner />
      {/* Day toggle */}
      {days.length > 1 && (
        <div style={{ display: "flex", gap: 4, marginBottom: 10, background: C.surface, borderRadius: 10, padding: 3, border: `1px solid ${C.border}` }}>
          {days.map(day => (
            <button key={day} onClick={() => setSelectedDay(day)} style={{
              flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer",
              background: selectedDay === day ? C.amber : "transparent",
              color: selectedDay === day ? C.bg : C.muted,
              fontFamily: F.m, fontSize: 11, fontWeight: 700, transition: "all 0.15s",
            }}>{cap(day)}</button>
          ))}
        </div>
      )}
      {/* Level pills - only show if more than one division in this day */}
      {dayDivisions.length > 1 && <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {dayDivisions.sort((a, b) => (levelOrder[a.level] ?? 9) - (levelOrder[b.level] ?? 9)).map(d => {
          const active = divId === d.id;
          const days_ = ['monday','tuesday','wednesday'];
          const stripped_ = d.name.replace(/^(monday|tuesday|wednesday)\s*/i, '').trim();
          const label = (stripped_ && !days_.includes(stripped_.toLowerCase()) && stripped_.toLowerCase() !== d.level) ? stripped_ : cap(d.level);
          return (
            <button key={d.id} onClick={() => setDivId(d.id)} style={{
              background: active ? C.amber : C.surface, color: active ? C.bg : C.muted,
              border: `1px solid ${active ? C.amber : C.border}`,
              borderRadius: 8, padding: "7px 14px", cursor: "pointer",
              fontFamily: F.m, fontSize: 11, fontWeight: active ? 700 : 500,
              whiteSpace: "nowrap", transition: "all 0.15s",
            }}>
              {levelEmoji(d.level)} {label}
            </button>
          );
        })}
      </div>}

      {loading ? <Loader /> : !rows.length ? <Empty msg="No standings data" /> : (() => {
        const hasPlayoffData = rows.some(t => t.playoffRound);
        return (
        <div style={{ position: "relative" }}>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <Card style={{ padding: 0, overflow: "hidden", minWidth: 380 }}>
          <div style={{
            display: "grid", gridTemplateColumns: "30px 1fr 32px 32px 34px 42px 38px",
            alignItems: "center", padding: "10px 12px", background: C.hover, borderBottom: `1px solid ${C.border}`,
          }}>
            {["#", "Team", "W", "L", "GB", "STRK", "OT"].map(h => (
              <span key={h} style={{
                fontFamily: F.m, fontSize: 9, fontWeight: 700, color: C.dim,
                textTransform: "uppercase", letterSpacing: 1,
                textAlign: h === "Team" || h === "#" ? "left" : "center",
              }}>{h}</span>
            ))}
          </div>
          {rows.map((t, i) => {
            const useTop5 = !hasPlayoffData;
            const isTop5 = t.displayRank <= 5;
            const lastTop5Idx = useTop5 ? rows.reduce((last, r, j) => r.displayRank <= 5 ? j : last, -1) : -1;
            return (
            <div key={t.team_id || i} onClick={() => goPage("teams", { teamId: t.team_id })} style={{
              display: "grid", gridTemplateColumns: "30px 1fr 32px 32px 34px 42px 38px",
              alignItems: "center", padding: "12px 12px", cursor: "pointer",
              borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : "none",
              background: useTop5 && isTop5 ? C.amberGlow : "transparent", position: "relative",
            }}>
              {useTop5 && i === lastTop5Idx && i < rows.length - 1 && (
                <div style={{ position: "absolute", bottom: 0, left: 14, right: 14, height: 1, background: `repeating-linear-gradient(90deg, ${C.amber}50, ${C.amber}50 4px, transparent 4px, transparent 8px)` }} />
              )}
              <span style={{ fontFamily: F.m, fontSize: 12, fontWeight: 800, color: useTop5 && isTop5 ? C.amber : C.dim }}>{t.rankLabel}</span>
              <div style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", fontFamily: F.b, fontSize: 13, fontWeight: 600, color: C.text, display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t.team_name}</span>
                {t.playoffRound && (
                  <span style={{ fontSize: 10, flexShrink: 0 }}>{
                    t.playoffRound === "champion" ? "🏆" :
                    t.playoffRound === "final" ? "🥈" :
                    t.playoffRound === "semifinal" ? "🎖️" :
                    "☆"
                  }</span>
                )}</div>
              <span style={{ textAlign: "center", fontFamily: F.m, fontSize: 13, fontWeight: 700, color: C.green }}>{t.wins}</span>
              <span style={{ textAlign: "center", fontFamily: F.m, fontSize: 13, color: C.red }}>{t.losses}</span>
              <span style={{ textAlign: "center", fontFamily: F.m, fontSize: 12, color: C.muted }}>{t.gb}</span>
              <span style={{ textAlign: "center" }}>
                {(t._streak || t.streak) ? (
                  <Badge color={(t._streak || t.streak).startsWith("W") ? C.green : C.red} style={{ fontSize: 10, padding: "2px 7px" }}>{t._streak || t.streak}</Badge>
                ) : <span style={{ color: C.dim }}>—</span>}
              </span>
              <span style={{ textAlign: "center", fontFamily: F.m, fontSize: 12, color: C.dim }}>
                {(t.ot_wins || 0) + (t.ot_losses || 0) > 0 ? `${t.ot_wins}-${t.ot_losses}` : "—"}
              </span>
            </div>
          )})}
        </Card>
        </div>
        <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 32, background: `linear-gradient(90deg, transparent, ${C.bg}cc)`, pointerEvents: "none", borderRadius: "0 14px 14px 0" }} />
        </div>
      )})()}

      <div style={{ display: "flex", gap: 16, marginTop: 12, justifyContent: "center", flexWrap: "wrap" }}>
        {rows.some(t => t.playoffRound) ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 10 }}>🏆</span>
              <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>Champion</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 10 }}>🥈</span>
              <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>Runner-up</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 10 }}>🎖️</span>
              <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>Banquet</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 10, color: C.amber }}>☆</span>
              <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>Playoffs</span>
            </div>
          </div>
        ) : (<>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: C.amberGlow, border: `1px solid ${C.amber}30` }} />
            <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>Playoff</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 12, height: 2, background: `repeating-linear-gradient(90deg, ${C.amber}60, ${C.amber}60 3px, transparent 3px, transparent 6px)` }} />
            <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>Cutline</span>
          </div>
        </>)}
      </div>
      <Footer />
    </div>
  );
}

// ─── MATCHES (renamed from Schedule) ───
function MatchesPage({ divisions, activeSeason, goPage }) {
  const [divId, setDivId] = useState(null);
  const [allMatches, setAllMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState("monday");

  const progress = getSeasonProgress(activeSeason);

  // Default to null, will compute from data
  const [weekFilter, setWeekFilter] = useState(null);
  const [dataCurrentWeek, setDataCurrentWeek] = useState(null);
  const currentWeek = dataCurrentWeek || progress.week || null;

  useEffect(() => {
    // Only auto-set week filter for active seasons; past seasons show "All"
    if (dataCurrentWeek && weekFilter === null && activeSeason?.is_active) setWeekFilter(dataCurrentWeek);
  }, [dataCurrentWeek]);

  // Get unique days from divisions
  const days = useMemo(() => {
    const d = [...new Set((divisions || []).map(div => div.day_of_week))];
    return d.sort((a, b) => (dayOrder[a] ?? 9) - (dayOrder[b] ?? 9));
  }, [divisions]);

  // Filter divisions by selected day
  const dayDivisions = useMemo(() => {
    return (divisions || []).filter(d => d.day_of_week === selectedDay);
  }, [divisions, selectedDay]);

  // Auto-select first division when day changes
  useEffect(() => {
    if (dayDivisions.length) setDivId(dayDivisions[0].id);
  }, [selectedDay, dayDivisions.length]);

  useEffect(() => {
    if (divisions?.length) {
      const firstDay = divisions[0].day_of_week;
      if (!days.includes(selectedDay)) setSelectedDay(firstDay);
      if (!divId) {
        setSelectedDay(firstDay);
        setDivId(divisions[0].id);
      }
    }
    setWeekFilter(null);
    setDataCurrentWeek(null);
  }, [divisions, days]);

  useEffect(() => {
    if (!divId || !activeSeason) return;
    setLoading(true);
    q("recent_matches", `division_id=eq.${divId}&order=scheduled_date,scheduled_time&limit=200`).then(d => {
      const withWeeks = (d || []).map(m => ({
        ...m,
        _week: m._week || getWeekNum(m.scheduled_date, activeSeason.start_date),
      }));
      setAllMatches(withWeeks);
      // Compute current week: max completed week + 1
      const completedWeeks = withWeeks.filter(m => m.status === "completed").map(m => m._week);
      const maxCompleted = completedWeeks.length ? Math.max(...completedWeeks) : 0;
      const nextWeek = Math.min(maxCompleted + 1, 8);
      setDataCurrentWeek(nextWeek > 0 ? nextWeek : progress.week);
      setLoading(false);
    });
  }, [divId, activeSeason]);

  const filtered = weekFilter ? allMatches.filter(m => m._week === weekFilter) : allMatches;

  // Compute current season records from all matches in this division
  const teamRecords = useMemo(() => {
    const rec = {};
    allMatches.forEach(m => {
      if (m.status !== "completed" || !m.winner_id) return;
      [m.team_a_id, m.team_b_id].forEach(tid => {
        if (!rec[tid]) rec[tid] = { w: 0, l: 0 };
        if (m.winner_id === tid) rec[tid].w++;
        else rec[tid].l++;
      });
    });
    return rec;
  }, [allMatches]);

  const byWeek = {};
  filtered.forEach(m => {
    const w = m._week || "?";
    if (!byWeek[w]) byWeek[w] = [];
    byWeek[w].push(m);
  });
  const weekKeys = Object.keys(byWeek).sort((a, b) => +a - +b);

  return (
    <div>
      <h2 style={{ fontFamily: F.d, fontSize: 22, color: C.text, margin: "0 0 4px" }}>Matches</h2>
      <p style={{ fontFamily: F.b, fontSize: 13, color: C.muted, margin: "0 0 16px" }}>{activeSeason?.name}</p>
      <MockBanner />
      {/* Day toggle */}
      {days.length > 1 && (
        <div style={{ display: "flex", gap: 4, marginBottom: 10, background: C.surface, borderRadius: 10, padding: 3, border: `1px solid ${C.border}` }}>
          {days.map(day => (
            <button key={day} onClick={() => setSelectedDay(day)} style={{
              flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer",
              background: selectedDay === day ? C.amber : "transparent",
              color: selectedDay === day ? C.bg : C.muted,
              fontFamily: F.m, fontSize: 11, fontWeight: 700, transition: "all 0.15s",
            }}>{cap(day)}</button>
          ))}
        </div>
      )}
      {/* Level pills */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {dayDivisions.sort((a, b) => (levelOrder[a.level] ?? 9) - (levelOrder[b.level] ?? 9)).map(d => {
          const active = divId === d.id;
          return (
            <button key={d.id} onClick={() => { setDivId(d.id); setWeekFilter(currentWeek); }} style={{
              background: active ? C.amber : C.surface, color: active ? C.bg : C.muted,
              border: `1px solid ${active ? C.amber : C.border}`,
              borderRadius: 8, padding: "7px 14px", cursor: "pointer",
              fontFamily: F.m, fontSize: 11, fontWeight: active ? 700 : 500,
              whiteSpace: "nowrap", transition: "all 0.15s",
            }}>
              {levelEmoji(d.level)} {cap(d.level)}
            </button>
          );
        })}
      </div>
      <div style={{ marginBottom: 16 }}>
        <WeekPills selected={weekFilter} onSelect={setWeekFilter} currentWeek={currentWeek} />
      </div>

      {loading ? <Loader /> : !filtered.length ? <Empty msg="No matches found" /> : (
        weekKeys.map(wk => (
          <div key={wk} style={{ marginBottom: 20 }}>
            <div style={{
              fontFamily: F.m, fontSize: 11, color: C.amber, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8, paddingLeft: 2,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              Week {wk}
              {+wk === currentWeek && <Badge color={C.green} style={{ fontSize: 9, padding: "2px 6px" }}>Current</Badge>}
              {byWeek[wk][0] && <span style={{ color: C.dim, fontWeight: 500 }}>· {fmtDate(byWeek[wk][0].scheduled_date)}</span>}
            </div>
            {byWeek[wk].map((m, i) => (
              <MatchRow key={m.id || i} m={m} goPage={goPage} teamRecords={teamRecords} />
            ))}
          </div>
        ))
      )}
      <Footer />
    </div>
  );
}

// ─── TEAMS ───
function TeamsPage({ goPage, initialTeamId, activeSeason }) {
  const [teams, setTeams] = useState([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("wins");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(initialTeamId || null);
  const [teamDetail, setTeamDetail] = useState(null);
  const [teamMatches, setTeamMatches] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [profileTab, setProfileTab] = useState("matches");

  useEffect(() => {
    if (!activeSeason) return;
    // Try loading from teams table first, fallback to all standings
    Promise.all([
      q("teams", "order=recrec_elo.desc&limit=500"),
      q("division_standings", `season_name=eq.${encodeURIComponent(activeSeason.name)}&order=calculated_rank`),
    ]).then(([teamsData, standingsData]) => {
      const hasTeamsData = teamsData?.length && teamsData.some(t => (t.all_time_wins || 0) > 0);
      if (hasTeamsData) {
        setTeams(teamsData);
      } else {
        // Build team list: use current season standings for the list, but show season record
        const byTeam = {};
        (standingsData || []).forEach(s => {
          if (!byTeam[s.team_id]) {
            byTeam[s.team_id] = {
              id: s.team_id, name: s.team_name,
              all_time_wins: 0, all_time_losses: 0,
              elo_rating: 0, championship_count: 0,
              playoff_appearances: 0, seasons_played: 1,
              division_name: s.division_name,
            };
          }
          const t = byTeam[s.team_id];
          t.all_time_wins += (s.wins || 0);
          t.all_time_losses += (s.losses || 0);
        });
        setTeams(Object.values(byTeam));
      }
      setLoading(false);
    });
  }, [activeSeason]);

  useEffect(() => { if (initialTeamId) setSelectedId(initialTeamId); }, [initialTeamId]);

  useEffect(() => {
    if (!selectedId) { setTeamDetail(null); return; }
    setDetailLoading(true);
    setProfileTab("matches");
    Promise.all([
      q("teams", `id=eq.${selectedId}`),
      q("division_standings", `team_id=eq.${selectedId}&order=season_name.desc`),
      q("recent_matches", `or=(team_a_id.eq.${selectedId},team_b_id.eq.${selectedId})&order=scheduled_date.desc&limit=500`),
      q("championships", `team_id=eq.${selectedId}&select=type,season_id`),
      q("playoff_appearances", `team_id=eq.${selectedId}&select=season_id`),
    ]).then(([td, sd, md, cd, pad]) => {
      const teamsRow = td?.[0];
      const hasTeamsData = teamsRow && (teamsRow.all_time_wins || 0) > 0;

      // Compute wins/losses from actual match results (most accurate)
      const completed = (md || []).filter(m => m.status === "completed" && m.winner_id);
      const matchWins = completed.filter(m => m.winner_id === selectedId).length;
      const matchLosses = completed.filter(m => m.winner_id && m.winner_id !== selectedId && (m.team_a_id === selectedId || m.team_b_id === selectedId)).length;
      const seasonNames = new Set((sd || []).map(s => s.season_name));

      // Merge playoff_appearances + banquet/finalist/league championships, deduped by season
      const playoffSeasonIds = new Set((pad || []).map(p => p.season_id));
      (cd || []).filter(c => ["league","finalist","banquet"].includes(c.type)).forEach(c => playoffSeasonIds.add(c.season_id));
      const totalPlayoffs = playoffSeasonIds.size;

      setTeamDetail({
        id: selectedId,
        name: teamsRow?.name || sd?.[0]?.team_name || "Unknown",
        all_time_wins: hasTeamsData ? teamsRow.all_time_wins : matchWins,
        all_time_losses: hasTeamsData ? teamsRow.all_time_losses : matchLosses,
        elo_rating: teamsRow?.recrec_elo || null,
        championships: teamsRow?.championship_count || 0,
        seasons_played: hasTeamsData ? (teamsRow.seasons_played || seasonNames.size) : seasonNames.size,
        playoff_appearances: totalPlayoffs,
        league_titles: (cd || []).filter(c => c.type === "league").length,
        banquet_count: (cd || []).filter(c => ["league","finalist","banquet"].includes(c.type)).length,
        division_titles: (cd || []).filter(c => c.type === "division").length,
        _standings: sd || [],
        _allTeamIds: [selectedId],
      });
      setTeamMatches(md || []);
      setDetailLoading(false);

      // Non-blocking: fetch alias teams and their matches + championships
      q("teams", `primary_team_id=eq.${selectedId}&select=id,name`).then(aliasTeams => {
        const aliases = (aliasTeams || []).filter(a => a.id !== selectedId);
        if (!aliases.length) return;
        const aliasIds = aliases.map(a => a.id);
        const orMatch = aliasIds.map(id => `team_a_id.eq.${id},team_b_id.eq.${id}`).join(",");
        const orChamps = aliasIds.map(id => `team_id.eq.${id}`).join(",");
        Promise.all([
          q("recent_matches", `or=(${orMatch})&order=scheduled_date.desc&limit=500`),
          q("championships", `or=(${orChamps})&select=type,season_id`),
          q("playoff_appearances", `team_id=in.(${aliasIds.join(",")})&select=season_id`),
        ]).then(([aliasMd, aliasCd, aliasPa]) => {
          setTeamMatches(prev => {
            const seen = new Set(prev.map(m => m.id));
            const newMatches = (aliasMd || []).filter(m => !seen.has(m.id));
            if (!newMatches.length) return prev;
            return [...prev, ...newMatches].sort((a, b) => (b.scheduled_date || "").localeCompare(a.scheduled_date || ""));
          });
          setTeamDetail(prev => {
            if (!prev) return prev;
            const extraLeague = (aliasCd || []).filter(c => c.type === "league").length;
            const extraBanquet = (aliasCd || []).filter(c => ["league","finalist","banquet"].includes(c.type)).length;
            const extraDivision = (aliasCd || []).filter(c => c.type === "division").length;
            // Merge alias playoff seasons deduped
            const aliasPlayoffSeasons = new Set((aliasPa || []).map(p => p.season_id));
            (aliasCd || []).filter(c => ["league","finalist","banquet"].includes(c.type)).forEach(c => aliasPlayoffSeasons.add(c.season_id));
            const extraPlayoffs = aliasPlayoffSeasons.size;
            return {
              ...prev,
              _allTeamIds: [selectedId, ...aliasIds],
              league_titles: (prev.league_titles || 0) + extraLeague,
              banquet_count: (prev.banquet_count || 0) + extraBanquet,
              division_titles: (prev.division_titles || 0) + extraDivision,
              playoff_appearances: (prev.playoff_appearances || 0) + extraPlayoffs,
            };
          });
        });
      });
    });
  }, [selectedId]);

  const sorted = useMemo(() => {
    let t = [...teams];
    if (sortBy === "wins") t.sort((a, b) => (b.all_time_wins || 0) - (a.all_time_wins || 0));
    else if (sortBy === "winpct") {
      t.sort((a, b) => {
        const pa = (a.all_time_wins || 0) / Math.max((a.all_time_wins || 0) + (a.all_time_losses || 0), 1);
        const pb = (b.all_time_wins || 0) / Math.max((b.all_time_wins || 0) + (b.all_time_losses || 0), 1);
        return pb - pa;
      });
    }
    else if (sortBy === "name") t.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    else if (sortBy === "elo") t.sort((a, b) => (b.elo_rating || b.recrec_elo || 0) - (a.elo_rating || a.recrec_elo || 0));
    else if (sortBy === "champs") t.sort((a, b) => ((b.championship_count || b.championships || 0) - (a.championship_count || a.championships || 0)) || ((b.all_time_wins || 0) - (a.all_time_wins || 0)));
    return t.filter(x => x.name?.toLowerCase().includes(search.toLowerCase()));
  }, [teams, sortBy, search]);

  // ─── TEAM PROFILE ───
  if (selectedId) {
    if (detailLoading) return <Loader />;
    const t = teamDetail;
    if (!t) return <Empty msg="Team not found" />;
    const winPct = ((t.all_time_wins || 0) / Math.max((t.all_time_wins || 0) + (t.all_time_losses || 0), 1) * 100).toFixed(1);
    const completed = teamMatches.filter(m => m.status === "completed");
    const upcoming = teamMatches.filter(m => m.status !== "completed");
    // Current season matches only for Matches tab
    const seasonName = activeSeason?.name || "";
    const currentCompleted = completed.filter(m => {
      const year = m.scheduled_date?.slice(0, 4) || "?";
      const month = +(m.scheduled_date?.slice(5, 7) || 0);
      let s;
      if (month <= 3) s = `Winter ${year}`;
      else if (month <= 5) s = `Spring ${year}`;
      else if (month <= 8) s = `Summer ${year}`;
      else s = `Fall ${year}`;
      return s === seasonName;
    }).sort((a, b) => (b.scheduled_date || "").localeCompare(a.scheduled_date || ""));
    const currentUpcoming = upcoming.filter(m => {
      const year = m.scheduled_date?.slice(0, 4) || "?";
      const month = +(m.scheduled_date?.slice(5, 7) || 0);
      let s;
      if (month <= 3) s = `Winter ${year}`;
      else if (month <= 5) s = `Spring ${year}`;
      else if (month <= 8) s = `Summer ${year}`;
      else s = `Fall ${year}`;
      return s === seasonName;
    }).sort((a, b) => (a.scheduled_date || "").localeCompare(b.scheduled_date || ""));
    const isChamp = (t.championships || t.championship_count || 0) > 0;

    return (
      <div>
        <button onClick={() => setSelectedId(null)} style={{
          background: "none", border: "none", cursor: "pointer",
          fontFamily: F.b, fontSize: 13, color: C.amber, padding: 0, marginBottom: 16,
        }}>← All Teams</button>

        <Card style={{ background: `linear-gradient(135deg, ${C.surface}, #1a1520)`, textAlign: "center", padding: "24px 20px", marginBottom: 16 }}>
          <div style={{ margin: "0 auto 14px", display: "flex", justifyContent: "center" }}>
            <TeamAvatar name={t.name} size={56} />
          </div>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8 }}>
            <h3 style={{ fontFamily: F.d, fontSize: 20, color: C.text, margin: 0 }}>{t.name}</h3>
            {isChamp && <span title={`${t.championships || t.championship_count} championship${(t.championships || t.championship_count) > 1 ? "s" : ""}`} style={{ fontSize: 18, cursor: "default" }}>🏆</span>}
          </div>
          <div style={{ fontFamily: F.m, fontSize: 12, color: C.muted, marginTop: 4, marginBottom: 18 }}>{(t.elo_rating || t.recrec_elo) ? `ELO ${t.elo_rating || t.recrec_elo} · ` : ""}{t.seasons_played || 1} season{(t.seasons_played || 1) > 1 ? "s" : ""}</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
            {[
              ["Wins", t.all_time_wins || 0, C.green],
              ["Losses", t.all_time_losses || 0, C.red],
              ["Win %", `${winPct}%`, C.text],
            ].map(([l, v, c]) => (
              <div key={l} style={{ textAlign: "center", minWidth: 48 }}>
                <div style={{ fontFamily: F.d, fontSize: 20, fontWeight: 700, color: c }}>{v}</div>
                <div style={{ fontFamily: F.m, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>{l}</div>
              </div>
            ))}
          </div>
          {(t.playoff_appearances > 0 || t.division_titles > 0 || t.banquet_count > 0 || t.league_titles > 0) && (
            <>
              <div style={{ borderTop: `1px solid ${C.border}`, margin: "14px 0 12px" }} />
              <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
                {[
                  ...(t.league_titles > 0 ? [["🏆", t.league_titles, "League", "#fbbf24", "league"]] : []),
                  ...(t.banquet_count > 0 ? [["🎖️", t.banquet_count, "Banquet*", C.amber, "banquet"]] : []),
                  ...(t.playoff_appearances > 0 ? [["🏅", t.playoff_appearances, "Playoffs*", C.muted, "playoffs"]] : []),
                  ...(t.division_titles > 0 ? [["🥇", t.division_titles, "Division*", C.blue, "division"]] : []),
                ].map(([icon, val, label, color, histTab]) => (
                  <div key={label} onClick={() => goPage("fame", { tab: histTab })} style={{ textAlign: "center", background: C.surface, borderRadius: 10, padding: "10px 8px", flex: 1, minWidth: 0, cursor: "pointer" }}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
                    <div style={{ fontFamily: F.d, fontSize: 20, fontWeight: 700, color }}>{val}</div>
                    <div style={{ fontFamily: F.m, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
                  </div>
                ))}
              </div>
            </>
          )}
          <div style={{ fontFamily: F.b, fontSize: 10, color: C.dim, textAlign: "center", marginTop: 10 }}>*Data is currently incomplete</div>
        </Card>

        <div style={{ display: "flex", gap: 4, marginBottom: 16, background: C.surface, borderRadius: 10, padding: 3, border: `1px solid ${C.border}` }}>
          {[["matches", "Matches"], ["history", "History"], ["stats", "Stats"], ["roster", "Roster"]].map(([k, l]) => (
            <button key={k} onClick={() => setProfileTab(k)} style={{
              flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer",
              background: profileTab === k ? C.amber : "transparent",
              color: profileTab === k ? C.bg : C.muted,
              fontFamily: F.m, fontSize: 11, fontWeight: 700, transition: "all 0.15s",
            }}>{l}</button>
          ))}
        </div>

        {profileTab === "matches" && (
          <div>
            {currentUpcoming.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: F.m, fontSize: 11, color: C.amber, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>Upcoming</div>
                {currentUpcoming.map((m, i) => <MatchRow key={m.id || i} m={m} goPage={goPage} />)}
              </div>
            )}
            {currentCompleted.length > 0 && (
              <div>
                <div style={{ fontFamily: F.m, fontSize: 11, color: C.amber, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>Results</div>
                {currentCompleted.map((m, i) => <MatchRow key={m.id || i} m={m} goPage={goPage} />)}
              </div>
            )}
            {!currentUpcoming.length && !currentCompleted.length && <Empty msg="No matches this season" />}
          </div>
        )}

        {profileTab === "stats" && (() => {
          const allIds = t._allTeamIds || [selectedId];

          // ── H2H records ──
          const h2h = {};
          completed.forEach(m => {
            const isTeamA = allIds.includes(m.team_a_id);
            const isTeamB = allIds.includes(m.team_b_id);
            if (!isTeamA && !isTeamB) return;
            const oppId = isTeamA ? m.team_b_id : m.team_a_id;
            const oppName = isTeamA ? m.team_b_name : m.team_a_name;
            if (!oppId) return;
            if (!h2h[oppId]) h2h[oppId] = { name: oppName, wins: 0, losses: 0 };
            h2h[oppId].name = oppName;
            if (allIds.includes(m.winner_id)) h2h[oppId].wins++;
            else if (m.winner_id) h2h[oppId].losses++;
          });
          const opponents = Object.entries(h2h)
            .map(([id, s]) => ({ id, ...s, total: s.wins + s.losses, pct: s.wins / Math.max(s.wins + s.losses, 1) }))
            .filter(o => o.total > 0)
            .sort((a, b) => b.wins - a.wins || b.total - a.total || b.pct - a.pct);

          // ── Streaks ──
          const sortedMatches = [...completed].sort((a, b) => (b.scheduled_date || "").localeCompare(a.scheduled_date || ""));
          let currentStreak = 0, streakType = null;
          for (const m of sortedMatches) {
            const won = allIds.includes(m.winner_id);
            const lost = m.winner_id && !allIds.includes(m.winner_id);
            if (!won && !lost) continue;
            const thisType = won ? "W" : "L";
            if (!streakType) { streakType = thisType; currentStreak = 1; }
            else if (thisType === streakType) currentStreak++;
            else break;
          }
          let longestWin = 0, run = 0;
          for (const m of [...completed].sort((a, b) => (a.scheduled_date || "").localeCompare(b.scheduled_date || ""))) {
            if (allIds.includes(m.winner_id)) { run++; if (run > longestWin) longestWin = run; }
            else if (m.winner_id) run = 0;
          }

          // ── Best/worst opponents (min 2 meetings) ──
          const qualified = opponents.filter(o => o.total >= 2);
          const best = qualified.length ? qualified.reduce((a, b) => a.pct > b.pct || (a.pct === b.pct && a.total > b.total) ? a : b) : null;
          const worst = qualified.length ? qualified.reduce((a, b) => a.pct < b.pct || (a.pct === b.pct && a.total > b.total) ? a : b) : null;

          // ── Court stats ──
          const courtStats = {};
          completed.forEach(m => {
            if (!m.court) return;
            const ct = String(m.court).replace(/^Court\s*/i, "").replace(/^0+/, "") || m.court;
            if (!courtStats[ct]) courtStats[ct] = { wins: 0, losses: 0 };
            if (allIds.includes(m.winner_id)) courtStats[ct].wins++;
            else if (m.winner_id && !allIds.includes(m.winner_id) && (allIds.includes(m.team_a_id) || allIds.includes(m.team_b_id))) courtStats[ct].losses++;
          });
          const courts = Object.entries(courtStats)
            .map(([ct, s]) => ({ court: ct, ...s, total: s.wins + s.losses, pct: s.wins / Math.max(s.wins + s.losses, 1) }))
            .sort((a, b) => +a.court - +b.court);

          return (
            <div>
              {/* Quick Stats */}
              {completed.length > 0 && (
                <Card style={{ padding: "16px 18px", marginBottom: 16 }}>
                  <div style={{ fontFamily: F.m, fontSize: 11, color: C.amber, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Quick Stats</div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {streakType && (
                      <div style={{ flex: "1 1 45%", background: C.surfAlt, borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ fontFamily: F.m, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Current Streak</div>
                        <div style={{ fontFamily: F.d, fontSize: 20, fontWeight: 700, color: streakType === "W" ? C.green : C.red }}>
                          {streakType === "W" ? "🔥" : "❄️"} {streakType}{currentStreak}
                        </div>
                      </div>
                    )}
                    {longestWin > 1 && (
                      <div style={{ flex: "1 1 45%", background: C.surfAlt, borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ fontFamily: F.m, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Best Win Streak</div>
                        <div style={{ fontFamily: F.d, fontSize: 20, fontWeight: 700, color: C.green }}>🔥 {longestWin}</div>
                      </div>
                    )}
                    {best && (
                      <div style={{ flex: "1 1 45%", background: C.surfAlt, borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ fontFamily: F.m, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Best Matchup</div>
                        <div style={{ fontFamily: F.b, fontSize: 13, fontWeight: 600, color: C.green }}>{best.wins}-{best.losses}</div>
                        <div style={{ fontFamily: F.b, fontSize: 11, color: C.muted, marginTop: 2 }}>vs {best.name}</div>
                      </div>
                    )}
                    {worst && worst.id !== best?.id && (
                      <div style={{ flex: "1 1 45%", background: C.surfAlt, borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ fontFamily: F.m, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Toughest Matchup</div>
                        <div style={{ fontFamily: F.b, fontSize: 13, fontWeight: 600, color: C.red }}>{worst.wins}-{worst.losses}</div>
                        <div style={{ fontFamily: F.b, fontSize: 11, color: C.muted, marginTop: 2 }}>vs {worst.name}</div>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {/* Court Win Rates */}
              {courts.length > 0 && (
                <Card style={{ padding: "16px 18px", marginBottom: 16 }}>
                  <div style={{ fontFamily: F.m, fontSize: 11, color: C.amber, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Court Win Rates</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {courts.map(c => (
                      <div key={c.court}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                          <span style={{ fontFamily: F.m, fontSize: 12, color: C.text }}>Court {c.court}</span>
                          <span style={{ fontFamily: F.m, fontSize: 11, color: C.muted }}>
                            {c.wins}W-{c.losses}L
                            <span style={{ color: c.pct >= 0.6 ? C.green : c.pct <= 0.4 ? C.red : C.text, fontWeight: 700, marginLeft: 6 }}>
                              {(c.pct * 100).toFixed(0)}%
                            </span>
                          </span>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: C.surfAlt, overflow: "hidden" }}>
                          <div style={{
                            height: "100%", borderRadius: 3,
                            width: `${c.pct * 100}%`,
                            background: c.pct >= 0.6 ? C.green : c.pct <= 0.4 ? C.red : C.amber,
                            transition: "width 0.3s",
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* H2H Records */}
              {opponents.length > 0 && (
                <Card style={{ padding: "16px 18px", marginBottom: 16 }}>
                  <div style={{ fontFamily: F.m, fontSize: 11, color: C.amber, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Head-to-Head</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {opponents.map(o => (
                      <div key={o.id} onClick={() => { setSelectedId(o.id); setProfileTab("matches"); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                        <TeamAvatar name={o.name} size={28} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: F.b, fontSize: 13, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.name}</div>
                        </div>
                        <div style={{ fontFamily: F.m, fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>
                          <span style={{ color: C.green, fontWeight: 700 }}>{o.wins}</span>
                          <span style={{ color: C.dim }}> - </span>
                          <span style={{ color: C.red, fontWeight: 700 }}>{o.losses}</span>
                        </div>
                        <div style={{
                          width: 40, textAlign: "right",
                          fontFamily: F.m, fontSize: 11, fontWeight: 700,
                          color: o.pct >= 0.6 ? C.green : o.pct <= 0.4 ? C.red : C.text,
                        }}>{(o.pct * 100).toFixed(0)}%</div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}


            </div>
          );
        })()}

        {profileTab === "roster" && (
          <RosterPublicView teamId={selectedId} seasonId={activeSeason?.id} />
        )}

        {profileTab === "history" && (
          <div>
            <p style={{ fontFamily: F.b, fontSize: 13, color: C.muted, margin: "0 0 12px" }}>All match results across seasons</p>
            {!completed.length ? <Empty msg="No historical matches" /> : (() => {
              const allIds = t._allTeamIds || [selectedId];
              const standingsMap = {};
              (t._standings || []).forEach(s => { standingsMap[s.season_name] = s; });
              const byDate = {};
              completed.forEach(m => {
                const year = m.scheduled_date?.slice(0, 4) || "?";
                const month = +(m.scheduled_date?.slice(5, 7) || 0);
                let season;
                if (month <= 3) season = `Winter ${year}`;
                else if (month <= 5) season = `Spring ${year}`;
                else if (month <= 8) season = `Summer ${year}`;
                else season = `Fall ${year}`;
                if (!byDate[season]) byDate[season] = [];
                byDate[season].push(m);
              });
              return Object.entries(byDate).map(([season, matches]) => {
                const st = standingsMap[season];
                const wins = matches.filter(m2 => allIds.includes(m2.winner_id) || (allIds.includes(m2.team_a_id) && m2.team_a_match_wins > m2.team_b_match_wins) || (allIds.includes(m2.team_b_id) && m2.team_b_match_wins > m2.team_a_match_wins)).length;
                const losses = matches.filter(m2 => m2.winner_id && !allIds.includes(m2.winner_id) && (allIds.includes(m2.team_a_id) || allIds.includes(m2.team_b_id))).length;
                // Check if this season was played under an alias name
                const aliasName = matches.reduce((found, m) => {
                  if (found) return found;
                  const aId = allIds.find(id => id !== selectedId && (m.team_a_id === id || m.team_b_id === id));
                  if (aId) return m.team_a_id === aId ? m.team_a_name : m.team_b_name;
                  return null;
                }, null);
                return (
                <div key={season} style={{ marginBottom: 20 }}>
                  <div style={{ fontFamily: F.m, fontSize: 11, color: C.amber, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>
                    {season}
                    <span style={{ color: C.dim, fontWeight: 500, marginLeft: 8 }}>{wins}W-{losses}L</span>
                    {st?.division_name && <span style={{ color: C.dim, fontWeight: 400, marginLeft: 8 }}>{st.division_name}</span>}
                  </div>
                  {aliasName && aliasName !== t.name && (
                    <div style={{ fontFamily: F.b, fontSize: 11, color: C.dim, fontStyle: "italic", marginBottom: 6 }}>as {aliasName}</div>
                  )}
                  {matches.map((m2, i) => <MatchRow key={m2.id || i} m={m2} goPage={goPage} />)}
                </div>
                );
              });
            })()}
          </div>
        )}
        <Footer />
      </div>
    );
  }

  // ─── TEAMS LIST ───
  return (
    <div>
      <h2 style={{ fontFamily: F.d, fontSize: 22, color: C.text, margin: "0 0 16px" }}>Teams</h2>
      <MockBanner />
      <div style={{ position: "relative", marginBottom: 12 }}>
        <input type="text" placeholder="Search teams..." value={search} onChange={e => setSearch(e.target.value)}
          style={{
            width: "100%", padding: "12px 16px 12px 40px", boxSizing: "border-box",
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
            color: C.text, fontFamily: F.b, fontSize: 14, outline: "none",
          }} />
        <svg style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", width: 16, height: 16 }} viewBox="0 0 24 24" fill="none" stroke={C.dim} strokeWidth="2.5" strokeLinecap="round">
          <circle cx="10.5" cy="10.5" r="7" /><line x1="15.5" y1="15.5" x2="21" y2="21" />
        </svg>
      </div>

      <div style={{ display: "flex", gap: 5, marginBottom: 16, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        {[["wins", "Wins"], ["winpct", "Win %"], ["elo", "ELO"], ["champs", "Titles"], ["name", "A-Z"]].map(([k, l]) => (
          <button key={k} onClick={() => setSortBy(k)} style={{
            background: sortBy === k ? C.amber : C.surface, color: sortBy === k ? C.bg : C.muted,
            border: `1px solid ${sortBy === k ? C.amber : C.border}`,
            borderRadius: 8, padding: "6px 12px", cursor: "pointer",
            fontFamily: F.m, fontSize: 11, fontWeight: sortBy === k ? 700 : 500, whiteSpace: "nowrap",
          }}>{l}</button>
        ))}
      </div>

      {loading ? <Loader /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.slice(0, 50).map(t => {
            const wp = ((t.all_time_wins || 0) / Math.max((t.all_time_wins || 0) + (t.all_time_losses || 0), 1) * 100).toFixed(0);
            const subtext = sortBy === "elo" ? `ELO ${t.elo_rating || t.recrec_elo || '—'}` : sortBy === "winpct" ? `${wp}% win rate` : sortBy === "champs" ? `${t.championship_count || t.championships || 0} titles` : sortBy === "name" ? (t.division_name || "") : `${t.all_time_wins || 0}W - ${t.all_time_losses || 0}L`;
            return (
              <Card key={t.id} onClick={() => setSelectedId(t.id)} style={{ padding: "14px 18px", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
                    <TeamAvatar name={t.name} size={34} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: F.b, fontSize: 14, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                      <div style={{ fontFamily: F.m, fontSize: 11, color: C.dim }}>{subtext}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, marginLeft: 12 }}>
                    {(t.championship_count || t.championships || 0) > 0 && <Badge color={C.amber}>🏆 {t.championship_count || t.championships}</Badge>}
                    <span style={{ fontFamily: F.m, fontSize: 13, color: C.muted, minWidth: 48, textAlign: "right" }}>{t.all_time_wins || 0}-{t.all_time_losses || 0}</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {!loading && !sorted.length && <Empty msg="No teams found" />}
      {!loading && sorted.length > 50 && (
        <p style={{ textAlign: "center", fontFamily: F.m, fontSize: 11, color: C.dim, marginTop: 12 }}>Showing 50 of {sorted.length} · refine search</p>
      )}
      <Footer />
    </div>
  );
}

// ─── HALL OF FAME ───
function HallOfFamePage({ seasons, goPage, initialTab }) {
  const [champs, setChamps] = useState([]);
  const [playoffData, setPlayoffData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(initialTab || "league");
  const [allDivisions, setAllDivisions] = useState([]);

  useEffect(() => {
    Promise.all([
      q("championships", "select=*,teams!championships_team_id_fkey(name),seasons(name,start_date),divisions(name,day_of_week,level)&order=season_id.desc"),
      q("playoff_appearances", "select=*,teams:team_id(name),seasons:season_id(name,start_date)&order=season_id.desc"),
      q("divisions", "select=id,name,day_of_week,level,season_id,seasons(name,start_date)&level=neq.party&order=season_id.desc,day_of_week,level"),
    ]).then(([cd, pd, dd]) => {
      setChamps(cd || []);
      setPlayoffData(pd || []);
      setAllDivisions(dd || []);
      setLoading(false);
    });
  }, []);

  const filtered = champs.filter(c => {
    if (tab === "league") return c.type === "league";
    if (tab === "banquet") return ["league", "finalist", "banquet"].includes(c.type);
    if (tab === "division") return c.type === "division";
    return true;
  }).sort((a, b) => {
    const da = a.seasons?.start_date || "0000";
    const db = b.seasons?.start_date || "0000";
    if (db !== da) return db.localeCompare(da);
    // fallback: sort by season name
    return (b.seasons?.name || "").localeCompare(a.seasons?.name || "");
  });

  // Team alias map: old name → current name
  const TEAM_ALIASES = {
    "The Tanglorious Bastards": 'Shuffle-"Bored to Death"',
    "Tanglorious Basterds": 'Shuffle-"Bored to Death"',
    "There Will Be Biscuits": "The Philly Specials",
    "Chicken In A Biscuit": "Kitchensurfing",
  };
  const ALIAS_LABELS = {
    'Shuffle-"Bored to Death"': "formerly Tanglorious Basterds",
    "The Philly Specials": "formerly There Will Be Biscuits",
    "Kitchensurfing": "formerly Chicken In A Biscuit",
  };

  // Playoff leaderboard — merge playoff_appearances + championships (all banquet/finalist/champ = playoff appearance)
  const playoffLB = {};
  const playoffSeenKey = new Set(); // dedupe team+season

  const addToPlayoffLB = (rawName, teamId, seasonName, seasonDate) => {
    const key = `${teamId}__${seasonName}`;
    if (playoffSeenKey.has(key)) return;
    playoffSeenKey.add(key);
    const n = TEAM_ALIASES[rawName] || rawName;
    if (!playoffLB[n]) playoffLB[n] = { name: n, count: 0, teamId, alias: ALIAS_LABELS[n] || null };
    playoffLB[n].count++;
    if (!TEAM_ALIASES[rawName]) playoffLB[n].teamId = teamId;
  };

  playoffData.forEach(p => addToPlayoffLB(p.teams?.name || "Unknown", p.team_id, p.seasons?.name, p.seasons?.start_date));
  // Also count banquet/finalist/league champs as playoff appearances
  champs.filter(c => ["league","finalist","banquet"].includes(c.type)).forEach(c =>
    addToPlayoffLB(c.teams?.name || "Unknown", c.team_id, c.seasons?.name, c.seasons?.start_date)
  );

  const sortedPlayoffLB = Object.values(playoffLB).sort((a, b) => b.count - a.count);

  // Playoffs by season
  const playoffsBySeason = {};
  playoffData.forEach(p => {
    const sn = p.seasons?.name || "?";
    const sd = p.seasons?.start_date || "";
    if (!playoffsBySeason[sn]) playoffsBySeason[sn] = { name: sn, start_date: sd, teams: [] };
    playoffsBySeason[sn].teams.push(p);
  });
  const playoffSeasons = Object.values(playoffsBySeason).sort((a, b) => b.start_date.localeCompare(a.start_date));

  const leaderboard = {};
  filtered.forEach(c => {
    const rawName = c.teams?.name || "Unknown";
    const n = TEAM_ALIASES[rawName] || rawName;
    if (!leaderboard[n]) leaderboard[n] = { name: n, count: 0, teamId: c.team_id, alias: ALIAS_LABELS[n] || null };
    leaderboard[n].count++;
    // prefer the current team's id for linking
    if (!TEAM_ALIASES[rawName]) leaderboard[n].teamId = c.team_id;
  });
  const sortedLB = Object.values(leaderboard).sort((a, b) => b.count - a.count);

  const tabLabel = tab === "league" ? "League Champions" : tab === "banquet" ? "Banquet (Final 4)" : tab === "playoffs" ? "Playoff Appearances" : "Division Champions";

  const roundLabel = { champion: "🏆 Champion", final: "🥈 Final", semifinal: "🏅 Banquet", round_2: "Round 2", round_1: "Round 1" };

  const dataNote = tab === "banquet" ? "Banquet data is incomplete for seasons before Winter 2023. Help us fill in the gaps!"
    : tab === "playoffs" ? "Playoff data available for Winter 2023 – Winter 2025. Earlier seasons coming soon."
    : tab === "division" ? "Division champion data is incomplete. Help us fill in the gaps!" : null;

  return (
    <div>
      <h2 style={{ fontFamily: F.d, fontSize: 22, color: C.text, margin: "0 0 4px" }}>League History</h2>
      <p style={{ fontFamily: F.b, fontSize: 13, color: C.muted, margin: "0 0 16px" }}>
        {seasons?.length || 0} seasons
      </p>
      <MockBanner />

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, background: C.surface, borderRadius: 10, padding: 3, border: `1px solid ${C.border}` }}>
        {[["league", "🏆 League"], ["banquet", "🎖️ Banquet"], ["playoffs", "🏅 Playoffs"], ["division", "🥇 Division"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer",
            background: tab === k ? C.amber : "transparent",
            color: tab === k ? C.bg : C.muted,
            fontFamily: F.m, fontSize: 11, fontWeight: 700, transition: "all 0.15s",
          }}>{l}</button>
        ))}
      </div>

      {dataNote && (
        <Card style={{ padding: "10px 16px", marginBottom: 16, background: C.surfAlt, borderLeft: `3px solid ${C.amber}` }}>
          <p style={{ fontFamily: F.b, fontSize: 12, color: C.muted, margin: 0 }}>⚠️ {dataNote}</p>
        </Card>
      )}

      {loading ? <Loader /> : tab === "playoffs" ? (
        /* ─── PLAYOFFS TAB ─── */
        !playoffData.length ? (
          <Card style={{ textAlign: "center", padding: 32 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏅</div>
            <p style={{ fontFamily: F.b, fontSize: 14, color: C.muted, margin: 0 }}>Playoff data coming soon</p>
          </Card>
        ) : (
          <>
            <SectionTitle right="All-time">Playoff Appearances</SectionTitle>
            <Card style={{ padding: 0, overflow: "hidden", marginBottom: 24 }}>
              {sortedPlayoffLB.slice(0, 20).map((t, i) => (
                <div key={t.name} onClick={() => goPage("teams", { teamId: t.teamId })} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "13px 18px", cursor: "pointer",
                  borderBottom: i < Math.min(sortedPlayoffLB.length, 20) - 1 ? `1px solid ${C.border}` : "none",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
                    <span style={{ fontFamily: F.m, fontSize: 14, fontWeight: 800, width: 24, flexShrink: 0, color: C.muted }}>{i + 1}</span>
                    <TeamAvatar name={t.name} size={28} />
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontFamily: F.b, fontSize: 14, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{t.name}</span>
                      {t.alias && <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>{t.alias}</span>}
                    </div>
                  </div>
                  <Badge color={C.amber} style={{ flexShrink: 0, marginLeft: 8 }}>🏅 {t.count}</Badge>
                </div>
              ))}
            </Card>
          </>
        )
      ) : !filtered.length ? (
        <Card style={{ textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>{tab === "league" ? "🏆" : tab === "banquet" ? "🎖️" : "🥇"}</div>
          <p style={{ fontFamily: F.b, fontSize: 14, color: C.muted, margin: 0 }}>
            {tab === "banquet" ? "Banquet data coming soon" : "Championship data coming soon"}
          </p>
          <p style={{ fontFamily: F.b, fontSize: 12, color: C.dim, margin: "8px 0 0" }}>Historical records are being compiled.</p>
        </Card>
      ) : (
        <>
          {sortedLB.length > 0 && (
            <>
              <SectionTitle right="All-time">{tabLabel}</SectionTitle>
              <Card style={{ padding: 0, overflow: "hidden", marginBottom: 24 }}>
                {sortedLB.slice(0, 15).map((t, i) => (
                  <div key={t.name} onClick={() => goPage("teams", { teamId: t.teamId })} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "13px 18px", cursor: "pointer",
                    borderBottom: i < Math.min(sortedLB.length, 15) - 1 ? `1px solid ${C.border}` : "none",
                    background: "transparent",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
                      <span style={{ fontFamily: F.m, fontSize: 14, fontWeight: 800, width: 24, flexShrink: 0, color: C.muted }}>{i + 1}</span>
                      <TeamAvatar name={t.name} size={28} />
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontFamily: F.b, fontSize: 14, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{t.name}</span>
                      {t.alias && <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>{t.alias}</span>}
                    </div>
                    </div>
                    <Badge color={C.amber} style={{ flexShrink: 0, marginLeft: 8 }}>
                      {tab === "banquet" ? "🎖️" : tab === "division" ? "🥇" : "🏆"} {t.count}
                    </Badge>
                  </div>
                ))}
              </Card>
            </>
          )}

          <SectionTitle>By Season</SectionTitle>
          {tab === "banquet" ? (() => {
            // Group by season
            const bySeason = {};
            filtered.forEach(c => {
              const sn = c.seasons?.name || "?";
              const sd = c.seasons?.start_date || "0000";
              if (!bySeason[sn]) bySeason[sn] = { name: sn, start_date: sd, teams: [] };
              bySeason[sn].teams.push(c);
            });
            const typeOrder = { league: 0, finalist: 1, banquet: 2 };
            return Object.values(bySeason)
              .sort((a, b) => b.start_date.localeCompare(a.start_date))
              .map(season => {
                const sorted = [...season.teams].sort((a, b) => (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9));
                const hasChamp = sorted.some(t => t.type === "league");
                const isComplete = sorted.length >= 4;
                return (
                  <Card key={season.name} style={{ marginBottom: 10, padding: "14px 18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <span style={{ fontFamily: F.d, fontSize: 15, fontWeight: 700, color: C.text }}>{season.name}</span>
                      {!isComplete && <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>partial data</span>}
                    </div>
                    {sorted.map(c => {
                      const icon = c.type === "league" ? "🏆" : c.type === "finalist" ? "🥈" : "🎖️";
                      const color = c.type === "league" ? C.amber : c.type === "finalist" ? C.blue : C.muted;
                      return (
                        <div key={c.id} onClick={() => goPage("teams", { teamId: c.team_id })}
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                          <span style={{ fontSize: 14, width: 20, textAlign: "center" }}>{icon}</span>
                          <TeamAvatar name={c.teams?.name || "?"} size={22} />
                          <span style={{ fontFamily: F.b, fontSize: 13, color: C.text, flex: 1 }}>{c.teams?.name}</span>
                          <span style={{ fontFamily: F.m, fontSize: 10, color }}>{c.type === "league" ? "Champion" : c.type === "finalist" ? "Finalist" : "Final 4"}</span>
                        </div>
                      );
                    })}
                    {!hasChamp && (
                      <div style={{ paddingTop: 8, fontFamily: F.m, fontSize: 11, color: C.dim, textAlign: "center" }}>Champion data missing</div>
                    )}
                  </Card>
                );
              });
          })() : tab === "division" ? (() => {
            const dayOrder = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3 };
            const levelOrder = { pilot: 0, cherry: 1, hammer: 2, party: 3 };
            // Build winner map: division_id → champ entry (dedupe by division_id)
            const winnerMap = {};
            filtered.forEach(c => {
              if (!c.division_id) return;
              if (!winnerMap[c.division_id]) winnerMap[c.division_id] = c;
            });
            // Group all divisions by season
            const bySeason = {};
            allDivisions.forEach(d => {
              const sn = d.seasons?.name || "?";
              const sd = d.seasons?.start_date || "0000";
              if (!bySeason[sn]) bySeason[sn] = { name: sn, start_date: sd, divs: [] };
              bySeason[sn].divs.push(d);
            });
            return Object.values(bySeason)
              .sort((a, b) => b.start_date.localeCompare(a.start_date))
              .map(season => {
                const sorted = [...season.divs].sort((a, b) => {
                  const da = dayOrder[a.day_of_week] ?? 9;
                  const db = dayOrder[b.day_of_week] ?? 9;
                  if (da !== db) return da - db;
                  return (levelOrder[a.level] ?? 9) - (levelOrder[b.level] ?? 9);
                });
                const hasAny = sorted.some(d => winnerMap[d.id]);
                if (!hasAny) return null; // skip seasons with zero data
                const allComplete = sorted.every(d => winnerMap[d.id]);
                return (
                  <Card key={season.name} style={{ marginBottom: 10, padding: "14px 18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <span style={{ fontFamily: F.d, fontSize: 15, fontWeight: 700, color: C.text }}>{season.name}</span>
                      {!allComplete && <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>partial data</span>}
                    </div>
                    {sorted.map(d => {
                      const c = winnerMap[d.id];
                      return (
                        <div key={d.id} onClick={c ? () => goPage("teams", { teamId: c.team_id }) : undefined}
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.border}`, cursor: c ? "pointer" : "default", opacity: c ? 1 : 0.5 }}>
                          <span style={{ fontSize: 14, width: 20, textAlign: "center" }}>{c ? "🥇" : "—"}</span>
                          {c ? <TeamAvatar name={c.teams?.name || "?"} size={22} /> : <div style={{ width: 22, height: 22, borderRadius: "50%", background: C.surface, border: `1px solid ${C.border}` }} />}
                          <span style={{ fontFamily: F.b, fontSize: 13, color: c ? C.text : C.muted, flex: 1 }}>
                            {c ? c.teams?.name : "Data incomplete"}
                          </span>
                          <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>
                            {cap(d.day_of_week)} {cap(d.level)}
                          </span>
                        </div>
                      );
                    })}
                  </Card>
                );
              }).filter(Boolean);
          })() : filtered.map((c, i) => (
            <Card key={c.id || i} onClick={() => goPage("teams", { teamId: c.team_id })}
              style={{ padding: "12px 18px", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <TeamAvatar name={c.teams?.name || "?"} size={28} />
                <div>
                  <div style={{ fontFamily: F.b, fontSize: 14, fontWeight: 600, color: C.text }}>{c.teams?.name}</div>
                  {c.divisions && (
                    <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>
                      {cap(c.divisions.day_of_week)} {cap(c.divisions.level)}
                    </div>
                  )}
                </div>
              </div>
              <Badge color={C.muted}>{c.seasons?.name || "—"}</Badge>
            </Card>
          ))}
        </>
      )}
      <Footer />
    </div>
  );
}


// ── Public Roster View (team profile page) ───────────────
function RosterPublicView({ teamId, seasonId }) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId || !seasonId) { setLoading(false); return; }
    q("team_players", `team_id=eq.${teamId}&season_id=eq.${seasonId}&order=is_captain.desc&select=id,is_captain,players(id,name)`)
      .then(data => {
        setPlayers((data || []).map(tp => ({ ...tp, name: tp.players?.name || "—" })));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [teamId, seasonId]);

  if (loading) return <Loader />;

  if (!players.length) return (
    <Card style={{ padding: "24px 16px", textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
      <div style={{ fontFamily: F.d, fontSize: 16, color: C.text, marginBottom: 8 }}>Roster</div>
      <p style={{ fontFamily: F.b, fontSize: 13, color: C.muted, margin: 0 }}>No roster added yet.</p>
    </Card>
  );

  return (
    <Card style={{ padding: "16px" }}>
      <div style={{ fontFamily: F.d, fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 12 }}>Roster</div>
      {players.map(p => (
        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: C.surfAlt, border: `1px solid ${C.border}`, marginBottom: 6 }}>
          {p.is_captain && <CaptainBadge size={20} />}
          <span style={{ fontFamily: F.b, fontSize: 14, color: C.text, fontWeight: p.is_captain ? 700 : 400 }}>{p.name}</span>
          {p.is_captain && <span style={{ fontFamily: F.m, fontSize: 11, color: C.amber, marginLeft: "auto" }}>Captain</span>}
        </div>
      ))}
    </Card>
  );
}

// ── Captain Badge (styled C) ──────────────────────────────
function CaptainBadge({ size = 18 }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: size, height: size, borderRadius: "50%",
      background: C.amber, color: C.bg,
      fontFamily: F.b, fontSize: size * 0.55, fontWeight: 900,
      flexShrink: 0, lineHeight: 1,
    }}>C</span>
  );
}

function TosModal({ onAccept, onDecline }) {
  const [scrolled, setScrolled] = useState(false);
  const bodyRef = useRef(null);
  const handleScroll = () => {
    const el = bodyRef.current;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 10) setScrolled(true);
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.borderL}`, borderRadius: 18, width: "100%", maxWidth: 480, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <Logo size={28} />
            <div style={{ fontFamily: F.d, fontSize: 18, fontWeight: 800 }}><span style={{ color: C.text }}>Tang</span><span style={{ color: C.amber }}> Time</span></div>
          </div>
          <h2 style={{ fontFamily: F.d, fontSize: 20, margin: 0, color: C.text }}>Terms of Service</h2>
          <p style={{ fontFamily: F.b, fontSize: 12, color: C.muted, margin: "4px 0 0" }}>Please read and accept to continue as a captain.</p>
        </div>
        <div ref={bodyRef} onScroll={handleScroll} style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          {[
            ["What TangTime Does", "TangTime is an unofficial companion app for the shuffleboard league at Royal Palms Brooklyn. It is not affiliated with, endorsed by, or operated by Royal Palms."],
            ["Captain Responsibilities", "As a team captain, you are responsible for accurately reporting your match results. Submitting false or misleading results is a violation of these Terms."],
            ["Player & Team Information", "TangTime displays team names, player names, match results, and statistics. By participating in the league, players consent to the display of their name. Players may request removal by contacting us."],
            ["Account & Access", "Your captain account is associated with a single team. You may only submit results for matches in which your team participates. Access may be revoked at any time by an administrator."],
            ["Data & Privacy", "We collect your Google account name and email solely for authentication. We do not sell or share your personal data."],
            ["Disclaimer", "TangTime is provided \"as is\" without warranties. We are not responsible for official league decisions, standings disputes, or scheduling."],
          ].map(([title, body]) => (
            <div key={title} style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: F.b, fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>{title}</div>
              <div style={{ fontFamily: F.b, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{body}</div>
            </div>
          ))}
          {!scrolled && <div style={{ textAlign: "center", padding: "12px 0 4px" }}><span style={{ fontFamily: F.m, fontSize: 11, color: C.amber }}>↓ Scroll to read all</span></div>}
        </div>
        <div style={{ padding: "16px 24px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10 }}>
          <button onClick={onDecline} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontFamily: F.b, fontSize: 14, cursor: "pointer" }}>Decline</button>
          <button onClick={scrolled ? onAccept : null} style={{ flex: 2, padding: "12px 0", borderRadius: 10, border: "none", background: scrolled ? C.amber : C.border, color: scrolled ? C.bg : C.dim, fontFamily: F.b, fontSize: 14, fontWeight: 700, cursor: scrolled ? "pointer" : "not-allowed", transition: "all 0.2s" }}>
            {scrolled ? "I Accept" : "Read to Accept"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SignInPage({ mode = "captain" }) {
  const [loading, setLoading] = useState(false);
  const handleSignIn = () => {
    setLoading(true);
    signInWithGoogle(mode === "admin" ? "/admin" : "/captain");
  };
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", paddingTop: "12vh", padding: "12vh 24px 24px" }}>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 6 }}>
            <Logo size={44} />
            <div>
              <div style={{ fontFamily: F.d, fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}><span style={{ color: C.text }}>Tang</span><span style={{ color: C.amber }}> Time</span></div>
              <div style={{ fontFamily: F.m, fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 2 }}>Royal Palms BK</div>
            </div>
          </div>
          <div style={{ fontFamily: F.b, fontSize: 14, color: C.muted, marginTop: 8 }}>{mode === "admin" ? "Admin Panel" : "Captain Portal"}</div>
        </div>
        <Card>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>{mode === "admin" ? "🔐" : <CaptainBadge size={40} />}</div>
            <h2 style={{ fontFamily: F.d, fontSize: 20, fontWeight: 700, margin: "0 0 8px", color: C.text }}>Sign In</h2>
            <p style={{ fontFamily: F.b, fontSize: 13, color: C.muted, margin: "0 0 24px", lineHeight: 1.5 }}>
              {mode === "captain" ? "Sign in to submit match results and update rosters for your team." : "Sign in to edit any match result, manage captains, or update team rosters."}
            </p>
            <button onClick={handleSignIn} disabled={loading} style={{ width: "100%", padding: "14px 20px", borderRadius: 12, border: `1px solid ${C.borderL}`, background: loading ? C.surface : C.surfAlt, color: loading ? C.dim : C.text, cursor: loading ? "wait" : "pointer", fontFamily: F.b, fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, transition: "all 0.15s" }}>
              {loading ? (
                <><div style={{ width: 18, height: 18, border: `2px solid ${C.border}`, borderTopColor: C.amber, borderRadius: "50%", animation: "ttspin 0.8s linear infinite" }} /> Signing in...</>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                </>
              )}
            </button>
            <p style={{ fontFamily: F.b, fontSize: 11, color: C.dim, margin: "16px 0 0", lineHeight: 1.5 }}>
              By signing in, you agree to the <a href="/terms" target="_blank" style={{ color: C.amber, textDecoration: "none" }}>Terms of Service</a>.
            </p>
          </div>
        </Card>
        <div style={{ textAlign: "center", marginTop: 24 }}>
          <a href="/" style={{ fontFamily: F.m, fontSize: 12, color: C.dim, textDecoration: "none" }}>← Back to standings</a>
        </div>
      </div>
      <style>{`@keyframes ttspin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function CaptainMatchCard({ match, myTeamId, onSubmit, submitting }) {
  const [confirm, setConfirm] = useState(null);
  const isTeamA = match.team_a_id === myTeamId;
  const myName = isTeamA ? match.team_a_name : match.team_b_name;
  const oppName = isTeamA ? match.team_b_name : match.team_a_name;
  const oppId = isTeamA ? match.team_b_id : match.team_a_id;
  const done = match.status === "completed";
  const iWon = done && match.winner_id === myTeamId;
  const iLost = done && match.winner_id === oppId;
  return (
    <Card style={{ padding: 0, overflow: "hidden", marginBottom: 10, opacity: done ? 0.75 : 1 }}>
      <div style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontFamily: F.m, fontSize: 11, color: C.dim }}>{fmtDate(match.scheduled_date)}{match.court ? ` · Court ${match.court}` : ""}</span>
          {done && <Badge color={iWon ? C.green : C.red}>{iWon ? (match.went_to_ot ? "✓ Won in OT" : "✓ Won") : (match.went_to_ot ? "✗ Lost in OT" : "✗ Lost")}</Badge>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 6 }}>
          <div>
            <div style={{ fontFamily: F.b, fontSize: 14, fontWeight: 700, color: C.amber }}>{myName}</div>
            <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>Your team</div>
          </div>
          <div style={{ fontFamily: F.m, fontSize: 12, color: C.dim, textAlign: "center" }}>vs</div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: F.b, fontSize: 14, fontWeight: 500, color: C.text }}>{oppName}</div>
            <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>Opponent</div>
          </div>
        </div>
      </div>
      {!done && (
        confirm ? (
          <div style={{ padding: "10px 16px", background: `${C.amber}10`, borderTop: `1px solid ${C.amber}30` }}>
            <p style={{ fontFamily: F.b, fontSize: 13, color: C.text, margin: "0 0 10px", textAlign: "center" }}>
              Confirm: {myName} {confirm === "won_ot" ? "won in OT (1-1)" : "won 2-0"}?
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirm(null)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontFamily: F.b, fontSize: 13, cursor: "pointer" }}>Cancel</button>
              <button onClick={() => { onSubmit(match.id, confirm === "won_ot"); setConfirm(null); }} disabled={submitting} style={{ flex: 2, padding: "10px 0", borderRadius: 10, border: "none", background: C.green, color: "#fff", fontFamily: F.b, fontSize: 13, fontWeight: 700, cursor: submitting ? "wait" : "pointer" }}>
                {submitting ? "Submitting..." : "✓ Confirm Result"}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8 }}>
            <button onClick={() => setConfirm("won")} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1px solid ${C.green}40`, background: `${C.green}12`, color: C.green, fontFamily: F.b, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>🏆 Won 2-0</button>
            <button onClick={() => setConfirm("won_ot")} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1px solid ${C.amber}40`, background: `${C.amber}12`, color: C.amber, fontFamily: F.b, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>⚡ Won in OT</button>
          </div>
        )
      )}
    </Card>
  );
}

function CaptainApp({ user, myRole }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [tab, setTab] = useState("results");

  const loadMatches = useCallback(async () => {
    if (!myRole?.team_id) return;
    setLoading(true);
    try {
      const data = await qAuth(
        "matches",
        `or=(team_a_id.eq.${myRole.team_id},team_b_id.eq.${myRole.team_id})&scheduled_date=gte.2026-01-01&order=scheduled_date.desc&limit=50&select=id,team_a_id,team_b_id,scheduled_date,scheduled_time,court,status,winner_id,went_to_ot,team_a:teams!team_a_id(id,name),team_b:teams!team_b_id(id,name)`
      );
      setMatches((data || []).map(m => ({ ...m, team_a_name: m.team_a?.name || "—", team_b_name: m.team_b?.name || "—" })));
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [myRole?.team_id]);

  useEffect(() => { loadMatches(); }, [loadMatches]);

  const handleSubmit = async (matchId, isOT) => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await rpc("submit_match_result", { match_id: matchId, winner_team_id: myRole.team_id, is_ot: isOT });
      setSuccess("Result submitted! Standings will update shortly.");
      await loadMatches();
    } catch (e) { setError(e.message); }
    setSubmitting(false);
  };

  const pending = matches.filter(m => m.status !== "completed").sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));
  const completed = matches.filter(m => m.status === "completed").sort((a, b) => new Date(b.scheduled_date) - new Date(a.scheduled_date)).slice(0, 5);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F.b }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${C.border}`, background: `${C.surface}dd`, backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Logo size={30} />
          <div>
            <div style={{ fontFamily: F.d, fontSize: 15, fontWeight: 800 }}><span style={{ color: C.text }}>Tang</span><span style={{ color: C.amber }}> Time</span></div>
            <div style={{ fontFamily: F.m, fontSize: 9, color: C.amber, letterSpacing: 1 }}>Captain Portal</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: F.b, fontSize: 12, color: C.text, fontWeight: 600 }}>{myRole?.team_name}</div>
            <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>{user?.email}</div>
          </div>
          <button onClick={signOut} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontFamily: F.m, fontSize: 11, cursor: "pointer" }}>Sign out</button>
        </div>
      </header>
      <main style={{ padding: "16px 16px 60px", maxWidth: 520, margin: "0 auto" }}>
        {success && <div style={{ background: `${C.green}15`, border: `1px solid ${C.green}30`, borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}><span style={{ fontFamily: F.b, fontSize: 13, color: C.green }}>✓ {success}</span></div>}
        {error && <div style={{ background: `${C.red}15`, border: `1px solid ${C.red}30`, borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}><span style={{ fontFamily: F.b, fontSize: 13, color: C.red }}>{error}</span></div>}

        <div style={{ display: "flex", gap: 4, marginBottom: 16, background: C.surface, borderRadius: 10, padding: 3, border: `1px solid ${C.border}` }}>
          {[["results", "📋 Results"], ["roster", "👕 Roster"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", cursor: "pointer", background: tab === k ? C.amber : "transparent", color: tab === k ? C.bg : C.muted, fontFamily: F.m, fontSize: 12, fontWeight: 700, transition: "all 0.15s" }}>{l}</button>
          ))}
        </div>

        {tab === "results" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "0 0 12px" }}>
              <h3 style={{ fontFamily: F.d, fontSize: 18, color: C.text, margin: 0 }}>Submit Results</h3>
              <Badge color={pending.length > 0 ? C.amber : C.green}>{pending.length > 0 ? `${pending.length} pending` : "All reported"}</Badge>
            </div>
            {loading ? <Loader /> : pending.length === 0 ? (
              <Card style={{ textAlign: "center", padding: "32px 20px" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}><CaptainBadge size={40} /></div>
                <p style={{ fontFamily: F.b, fontSize: 14, color: C.muted, margin: 0 }}>No pending matches to report.</p>
              </Card>
            ) : pending.map(m => <CaptainMatchCard key={m.id} match={m} myTeamId={myRole.team_id} onSubmit={handleSubmit} submitting={submitting} />)}
            {completed.length > 0 && !loading && (
              <>
                <h3 style={{ fontFamily: F.d, fontSize: 16, color: C.muted, margin: "24px 0 10px" }}>Recent Results</h3>
                {completed.map(m => <CaptainMatchCard key={m.id} match={m} myTeamId={myRole.team_id} onSubmit={handleSubmit} submitting={submitting} />)}
              </>
            )}
          </>
        )}

        {tab === "roster" && myRole?.team_id && myRole?.season_id && (
          <RosterManager teamId={myRole.team_id} teamName={myRole.team_name} seasonId={myRole.season_id} />
        )}
        {tab === "roster" && myRole?.team_id && !myRole?.season_id && (
          <Card style={{ textAlign: "center", padding: "32px 20px" }}>
            <p style={{ fontFamily: F.b, fontSize: 14, color: C.muted, margin: 0 }}>Roster management unavailable — no active season found.</p>
          </Card>
        )}

        <div style={{ textAlign: "center", marginTop: 32 }}><a href="/" style={{ fontFamily: F.m, fontSize: 12, color: C.dim, textDecoration: "none" }}>← Back to standings</a></div>
      </main>
    </div>
  );
}

function AdminEditModal({ match, onClose, onSave }) {
  const [winnerId, setWinnerId] = useState(match.winner_id || "");
  const [isOT, setIsOT] = useState(match.went_to_ot || false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await rpc("admin_update_match_result", { match_id: match.id, new_winner_id: winnerId || null, is_ot: isOT });
      onSave();
    } catch (e) { setError(e.message); setSaving(false); }
  };

  const clearResult = async () => {
    setSaving(true);
    setError(null);
    try {
      await rpc("admin_clear_match_result", { match_id: match.id });
      onSave();
    } catch (e) { setError(e.message); setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <Card style={{ width: "100%", maxWidth: 420, padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontFamily: F.d, fontSize: 18, margin: 0 }}>Edit Result</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ fontFamily: F.b, fontSize: 12, color: C.dim, marginBottom: 16 }}>
          {fmtDate(match.scheduled_date)} · {match.team_a_name} vs {match.team_b_name}{match.court ? ` · Court ${match.court}` : ""}
        </div>
        {error && <div style={{ background: `${C.red}15`, border: `1px solid ${C.red}30`, borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}><span style={{ fontFamily: F.b, fontSize: 12, color: C.red }}>{error}</span></div>}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: F.b, fontSize: 12, color: C.muted, marginBottom: 8 }}>Winner</div>
          {[{ id: match.team_a_id, name: match.team_a_name }, { id: match.team_b_id, name: match.team_b_name }].map(t => (
            <button key={t.id} onClick={() => setWinnerId(t.id)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${winnerId === t.id ? C.amber : C.border}`, background: winnerId === t.id ? C.amberGlow : "transparent", color: winnerId === t.id ? C.amber : C.text, fontFamily: F.b, fontSize: 14, fontWeight: winnerId === t.id ? 700 : 400, cursor: "pointer", marginBottom: 6, textAlign: "left" }}>
              <span style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${winnerId === t.id ? C.amber : C.border}`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {winnerId === t.id && <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.amber }} />}
              </span>
              {t.name}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <button onClick={() => setIsOT(!isOT)} style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${isOT ? C.amber : C.border}`, background: isOT ? C.amber : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {isOT && <span style={{ color: C.bg, fontSize: 12, fontWeight: 900 }}>✓</span>}
          </button>
          <span style={{ fontFamily: F.b, fontSize: 13, color: C.text }}>Went to overtime (1-1)</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {match.winner_id && <button onClick={clearResult} disabled={saving} style={{ padding: "11px 14px", borderRadius: 10, border: `1px solid ${C.red}40`, background: `${C.red}12`, color: C.red, fontFamily: F.b, fontSize: 12, cursor: saving ? "wait" : "pointer" }}>Clear Result</button>}
          <button onClick={handleSave} disabled={!winnerId || saving} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", background: winnerId ? C.amber : C.border, color: winnerId ? C.bg : C.dim, fontFamily: F.b, fontSize: 14, fontWeight: 700, cursor: winnerId && !saving ? "pointer" : "not-allowed" }}>
            {saving ? "Saving..." : "Save Result"}
          </button>
        </div>
      </Card>
    </div>
  );
}

function AdminApp({ user, myRole }) {
  const [tab, setTab] = useState("requests");
  const [divisionId, setDivisionId] = useState(null);
  const [seasonId, setSeasonId] = useState(null);
  const [divisions, setDivisions] = useState([]);
  const [matches, setMatches] = useState([]);
  const [captains, setCaptains] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [loadingCaptains, setLoadingCaptains] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Load season + divisions once on mount
  useEffect(() => {
    (async () => {
      const seasons = await q("seasons", "is_active=eq.true&select=id&limit=1");
      if (!seasons?.length) return;
      setSeasonId(seasons[0].id);
      const d = await q("divisions", `season_id=eq.${seasons[0].id}&order=day_of_week,level&select=id,name,day_of_week,level,season_id,team_seasons(team_id)`);
      const filtered = (d || []).filter(x => x.level !== "party" || (x.team_seasons?.length > 0));
      setDivisions(filtered.map(x => ({ ...x, has_data: (x.team_seasons?.length || 0) > 0 })));
      if (filtered.length) setDivisionId(filtered[0].id);
    })();
  }, []);

  // Load matches when divisionId changes (only if on matches tab)
  useEffect(() => {
    if (!divisionId) return;
    if (tab !== "matches") return;
    setLoadingMatches(true);
    qAuth("matches", `division_id=eq.${divisionId}&order=scheduled_date.desc&limit=80&select=id,team_a_id,team_b_id,scheduled_date,scheduled_time,court,status,winner_id,went_to_ot,team_a:teams!team_a_id(id,name),team_b:teams!team_b_id(id,name)`)
      .then(data => {
        setMatches((data || []).map(m => ({ ...m, team_a_name: m.team_a?.name || "—", team_b_name: m.team_b?.name || "—" })));
        setLoadingMatches(false);
      }).catch(e => { setError(e.message); setLoadingMatches(false); });
  }, [divisionId]);

  // Load matches when switching to matches tab
  useEffect(() => {
    if (tab !== "matches" || !divisionId) return;
    setLoadingMatches(true);
    qAuth("matches", `division_id=eq.${divisionId}&order=scheduled_date.desc&limit=80&select=id,team_a_id,team_b_id,scheduled_date,scheduled_time,court,status,winner_id,went_to_ot,team_a:teams!team_a_id(id,name),team_b:teams!team_b_id(id,name)`)
      .then(data => {
        setMatches((data || []).map(m => ({ ...m, team_a_name: m.team_a?.name || "—", team_b_name: m.team_b?.name || "—" })));
        setLoadingMatches(false);
      }).catch(e => { setError(e.message); setLoadingMatches(false); });
  }, [tab]);

  // Load requests when on requests tab
  useEffect(() => {
    if (tab !== "requests") return;
    setLoadingRequests(true);
    qAuth("access_requests", "status=eq.pending&order=created_at.asc&select=id,email,request_type,team_id,reason,created_at,teams(id,name)")
      .then(data => { setRequests(data || []); setLoadingRequests(false); })
      .catch(e => { setError(e.message); setLoadingRequests(false); });
  }, [tab]);

  // Load captains when on captains or admins tab
  useEffect(() => {
    if (tab !== "captains" && tab !== "admins") return;
    setLoadingCaptains(true);
    qAuth("user_roles", "select=id,email,role,team_id,tos_accepted,teams(name)&order=created_at.desc")
      .then(caps => { setCaptains(caps || []); setLoadingCaptains(false); })
      .catch(e => { setError(e.message); setLoadingCaptains(false); });
  }, [tab]);

  const handleApprove = async (requestId) => {
    try {
      await rpc("approve_access_request", { request_id: requestId });
      setRequests(prev => prev.filter(r => r.id !== requestId));
      setSuccess("Access approved!");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) { setError(e.message); }
  };

  const handleDeny = async (requestId) => {
    if (!window.confirm("Deny this request?")) return;
    try {
      await rpc("deny_access_request", { request_id: requestId });
      setRequests(prev => prev.filter(r => r.id !== requestId));
      setSuccess("Request denied.");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) { setError(e.message); }
  };

  const handleEditSave = () => {
    setEditing(null);
    setSuccess("Result updated!");
    const id = divisionId;
    setDivisionId(null);
    setTimeout(() => setDivisionId(id), 50);
    setTimeout(() => setSuccess(null), 3000);
  };

  const removeCapRole = async (roleId) => {
    if (!window.confirm("Remove this captain's access?")) return;
    try {
      await qAuth("user_roles", `id=eq.${roleId}`, "DELETE");
      setCaptains(prev => prev.filter(c => c.id !== roleId));
      setSuccess("Captain removed.");
    } catch (e) { setError(e.message); }
  };

  const visibleMatches = matches.filter(m => filter === "all" ? true : filter === "pending" ? m.status !== "completed" : m.status === "completed");

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F.b }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${C.border}`, background: `${C.surface}dd`, backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Logo size={30} />
          <div>
            <div style={{ fontFamily: F.d, fontSize: 15, fontWeight: 800 }}><span style={{ color: C.text }}>Tang</span><span style={{ color: C.amber }}> Time</span></div>
            <div style={{ fontFamily: F.m, fontSize: 9, color: C.red, letterSpacing: 1 }}>Admin Panel</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ textAlign: "right" }}>
            <Badge color={C.red} style={{ marginBottom: 2 }}>🔐 Super Admin</Badge>
            <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>{user?.email}</div>
          </div>
          <button onClick={signOut} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontFamily: F.m, fontSize: 11, cursor: "pointer" }}>Sign out</button>
        </div>
      </header>
      <main style={{ padding: "16px 16px 60px", maxWidth: 520, margin: "0 auto" }}>
        {success && <div style={{ background: `${C.green}15`, border: `1px solid ${C.green}30`, borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}><span style={{ fontFamily: F.b, fontSize: 13, color: C.green }}>✓ {success}</span></div>}
        {error && <div style={{ background: `${C.red}15`, border: `1px solid ${C.red}30`, borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}><span style={{ fontFamily: F.b, fontSize: 13, color: C.red }}>{error}</span><button onClick={() => setError(null)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", float: "right" }}>✕</button></div>}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, background: C.surface, borderRadius: 10, padding: 3, border: `1px solid ${C.border}` }}>
          {[["requests", `🔔${requests.length ? ` (${requests.length})` : " Requests"}`], ["matches", "📋 Matches"], ["roster", "👕 Roster"], ["captains", null], ["admins", "🔐 Admins"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", cursor: "pointer", background: tab === k ? C.amber : "transparent", color: tab === k ? C.bg : C.muted, fontFamily: F.m, fontSize: 11, fontWeight: 700, transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
              {k === "captains" ? <><CaptainBadge size={13} /> Captains</> : l}
            </button>
          ))}
        </div>

        {tab === "matches" && (
          <>
            <div style={{ overflowX: "auto", margin: "0 -16px 14px", padding: "0 16px" }}>
              <div style={{ display: "flex", gap: 6, minWidth: "max-content" }}>
                {divisions.map(d => (
                  <button key={d.id} onClick={() => setDivisionId(d.id)} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${divisionId === d.id ? C.amber : C.border}`, background: divisionId === d.id ? C.amber : C.surface, color: divisionId === d.id ? C.bg : C.muted, fontFamily: F.m, fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                    {levelEmoji(d.level)} {d.name}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
              {[["all", "All"], ["pending", "Pending"], ["completed", "Completed"]].map(([k, l]) => (
                <button key={k} onClick={() => setFilter(k)} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${filter === k ? C.amber : C.border}`, background: filter === k ? C.amberGlow : "transparent", color: filter === k ? C.amber : C.muted, fontFamily: F.m, fontSize: 11, fontWeight: filter === k ? 700 : 500, cursor: "pointer" }}>{l}</button>
              ))}
              <span style={{ fontFamily: F.m, fontSize: 11, color: C.dim, alignSelf: "center", marginLeft: 4 }}>{visibleMatches.length} matches</span>
            </div>
            {loadingMatches ? <Loader /> : visibleMatches.length === 0 ? <Empty msg="No matches found" /> : visibleMatches.map(m => (
              <div key={m.id} onClick={() => setEditing(m)} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8, cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontFamily: F.m, fontSize: 11, color: C.dim }}>{fmtDate(m.scheduled_date)}{m.court ? ` · Court ${m.court}` : ""}</span>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {m.status === "completed" && m.went_to_ot && <Badge color={C.amber} style={{ fontSize: 9, padding: "1px 6px" }}>OT</Badge>}
                    <Badge color={m.status === "completed" ? C.green : C.muted} style={{ fontSize: 9, padding: "1px 6px" }}>{m.status === "completed" ? "✓ Done" : "⋯ Pending"}</Badge>
                    <span style={{ fontFamily: F.m, fontSize: 11, color: C.dim }}>Edit →</span>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 6, alignItems: "center" }}>
                  <span style={{ fontFamily: F.b, fontSize: 13, fontWeight: m.winner_id === m.team_a_id ? 700 : 400, color: m.winner_id === m.team_a_id ? C.text : C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.winner_id === m.team_a_id && "🏆 "}{m.team_a_name}</span>
                  <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim, textAlign: "center" }}>vs</span>
                  <span style={{ fontFamily: F.b, fontSize: 13, fontWeight: m.winner_id === m.team_b_id ? 700 : 400, color: m.winner_id === m.team_b_id ? C.text : C.muted, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.winner_id === m.team_b_id && "🏆 "}{m.team_b_name}</span>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === "requests" && (
          <>
            {loadingRequests ? <Loader /> : requests.length === 0 ? (
              <Card style={{ textAlign: "center", padding: "32px 20px" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                <p style={{ fontFamily: F.b, fontSize: 14, color: C.muted, margin: 0 }}>No pending requests.</p>
              </Card>
            ) : requests.map(r => (
              <Card key={r.id} style={{ padding: "14px 16px", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <Badge color={r.request_type === "admin" ? C.red : C.amber} style={{ marginBottom: 6 }}>
                      {r.request_type === "admin" ? "🔐 Admin Request" : "Captain Request"}
                    </Badge>
                    <div style={{ fontFamily: F.b, fontSize: 14, color: C.text, fontWeight: 600 }}>{r.email}</div>
                    {r.request_type === "captain" && r.teams?.name && (
                      <div style={{ fontFamily: F.m, fontSize: 12, color: C.muted, marginTop: 2 }}>Team: {r.teams.name}</div>
                    )}
                    {r.request_type === "admin" && r.reason && (
                      <div style={{ fontFamily: F.b, fontSize: 12, color: C.muted, marginTop: 4, fontStyle: "italic" }}>"{r.reason}"</div>
                    )}
                    <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim, marginTop: 4 }}>{new Date(r.created_at).toLocaleDateString()}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => handleDeny(r.id)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1px solid ${C.red}40`, background: `${C.red}12`, color: C.red, fontFamily: F.b, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Deny</button>
                  <button onClick={() => handleApprove(r.id)} style={{ flex: 2, padding: "10px 0", borderRadius: 10, border: "none", background: C.amber, color: C.bg, fontFamily: F.b, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>✓ Approve</button>
                </div>
              </Card>
            ))}
          </>
        )}

        {tab === "roster" && seasonId && <AdminRosterTab seasonId={seasonId} />}

        {tab === "captains" && (
          <>
            <div style={{ background: `${C.blue}10`, border: `1px solid ${C.blue}25`, borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
              <span style={{ fontFamily: F.b, fontSize: 12, color: C.blue }}>ℹ️ To add a new captain, have them sign in at <strong>/captain</strong> and submit an access request.</span>
            </div>
            {loadingCaptains ? <Loader /> : (() => {
              const caps = captains.filter(c => c.role === "captain");
              return caps.length === 0 ? <Empty msg="No captains yet" /> : caps.map(c => (
                <Card key={c.id} style={{ padding: "12px 16px", marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: F.b, fontSize: 13, color: C.text, marginBottom: 4 }}>{c.email}</div>
                      {c.team_id && <TeamNameEditor teamId={c.team_id} teamName={c.teams?.name} onSaved={(n) => setCaptains(prev => prev.map(x => x.id === c.id ? { ...x, teams: { ...x.teams, name: n } } : x))} />}
                    </div>
                    <button onClick={() => removeCapRole(c.id)} style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.red}40`, background: `${C.red}10`, color: C.red, fontFamily: F.m, fontSize: 11, cursor: "pointer", flexShrink: 0 }}>Remove</button>
                  </div>
                </Card>
              ));
            })()}
          </>
        )}

        {tab === "admins" && (
          <>
            <div style={{ background: `${C.red}10`, border: `1px solid ${C.red}25`, borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
              <span style={{ fontFamily: F.b, fontSize: 12, color: C.red }}>⚠️ Admins have full access to all data. Grant carefully.</span>
            </div>
            {loadingCaptains ? <Loader /> : (() => {
              const admins = captains.filter(c => c.role === "super_admin");
              return admins.length === 0 ? <Empty msg="No admins" /> : admins.map(c => (
                <Card key={c.id} style={{ padding: "12px 16px", marginBottom: 8 }}>
                  <div style={{ fontFamily: F.b, fontSize: 13, color: C.text }}>{c.email}</div>
                </Card>
              ));
            })()}
          </>
        )}

        <div style={{ textAlign: "center", marginTop: 32 }}><a href="/" style={{ fontFamily: F.m, fontSize: 12, color: C.dim, textDecoration: "none" }}>← Back to standings</a></div>
      </main>
      {editing && <AdminEditModal match={editing} onClose={() => setEditing(null)} onSave={handleEditSave} />}
    </div>
  );
}

function RequestAccessForm({ user, mode, onSubmitted }) {
  const [teams, setTeams] = useState([]);
  const [teamId, setTeamId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [existingRequest, setExistingRequest] = useState(null);
  const [checkingRequest, setCheckingRequest] = useState(true);

  useEffect(() => {
    (async () => {
      // Check if they already submitted a request
      try {
        const existing = await qAuth("access_requests", `user_id=eq.${user.id}&request_type=eq.${mode === "admin" ? "admin" : "captain"}&select=id,status,request_type,team_id&order=created_at.desc&limit=1`);
        if (existing?.length) { setExistingRequest(existing[0]); setCheckingRequest(false); return; }
      } catch {}

      // Load teams for captain requests
      if (mode === "captain") {
        try {
          const seasons = await q("seasons", "is_active=eq.true&select=id&limit=1");
          if (seasons?.length) {
            const divs = await q("divisions", `season_id=eq.${seasons[0].id}&select=id,team_seasons(team_id,teams(id,name))&level=neq.party`);
            const teamSet = new Map();
            divs?.forEach(d => d.team_seasons?.forEach(ts => {
              if (ts.teams) teamSet.set(ts.teams.id, ts.teams.name);
            }));
            setTeams([...teamSet.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));
          }
        } catch {}
      }
      setCheckingRequest(false);
    })();
  }, [user.id, mode]);

  const handleSubmit = async () => {
    if (mode === "captain" && !teamId) { setError("Please select your team."); return; }
    if (mode === "admin" && !reason.trim()) { setError("Please enter a reason for access."); return; }
    setSubmitting(true);
    setError(null);
    try {
      await qAuth("access_requests", "", "POST", {
        user_id: user.id,
        email: user.email,
        request_type: mode === "admin" ? "admin" : "captain",
        team_id: mode === "captain" ? teamId : null,
        reason: mode === "admin" ? reason.trim() : null,
        status: "pending",
      });
      onSubmitted();
    } catch (e) {
      setError(e.message.includes("unique") ? "You already submitted a request." : e.message);
    }
    setSubmitting(false);
  };

  if (checkingRequest) return <Loader />;

  if (existingRequest) {
    const isStaleApproval = existingRequest.status === "approved";
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>
          {existingRequest.status === "approved" ? "✅" : existingRequest.status === "denied" ? "❌" : "⏳"}
        </div>
        <h3 style={{ fontFamily: F.d, fontSize: 18, margin: "0 0 8px", color: C.text }}>
          {existingRequest.status === "approved" ? "Access Approved!" : existingRequest.status === "denied" ? "Request Denied" : "Request Submitted"}
        </h3>
        <p style={{ fontFamily: F.b, fontSize: 13, color: C.muted, margin: "0 0 16px", lineHeight: 1.6 }}>
          {existingRequest.status === "approved"
            ? "Your access has been approved. Please refresh the page to continue."
            : existingRequest.status === "denied"
            ? "Your request was not approved. Contact a league admin for more information."
            : "Your request is pending review. You'll be notified once approved."}
        </p>
        {existingRequest.status === "approved"
          ? <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
              <button onClick={() => window.location.reload()} style={{ padding: "11px 24px", borderRadius: 10, border: "none", background: C.amber, color: C.bg, fontFamily: F.b, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Refresh</button>
              <button onClick={async () => {
                try { await qAuth("access_requests", `id=eq.${existingRequest.id}`, "DELETE"); } catch {}
                setExistingRequest(null);
              }} style={{ padding: "8px 16px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.dim, fontFamily: F.m, fontSize: 12, cursor: "pointer" }}>Re-submit request instead</button>
              <button onClick={signOut} style={{ padding: "6px 14px", borderRadius: 10, border: "none", background: "transparent", color: C.dim, fontFamily: F.m, fontSize: 11, cursor: "pointer" }}>Sign out</button>
            </div>
          : <button onClick={signOut} style={{ padding: "10px 20px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontFamily: F.b, fontSize: 13, cursor: "pointer" }}>Sign out</button>
        }
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 36, textAlign: "center", marginBottom: 12 }}>{mode === "captain" ? <CaptainBadge size={40} /> : "🔐"}</div>
      <h3 style={{ fontFamily: F.d, fontSize: 18, textAlign: "center", margin: "0 0 6px" }}>Request Access</h3>
      <p style={{ fontFamily: F.b, fontSize: 13, color: C.muted, textAlign: "center", margin: "0 0 20px", lineHeight: 1.5 }}>
        {mode === "captain" ? "Select your team to request captain access." : "Tell us why you need admin access."}
      </p>
      <div style={{ background: C.surfAlt, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", marginBottom: 16 }}>
        <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim, marginBottom: 2 }}>Signed in as</div>
        <div style={{ fontFamily: F.m, fontSize: 12, color: C.text }}>{user.email}</div>
      </div>
      {error && <div style={{ background: `${C.red}15`, border: `1px solid ${C.red}30`, borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}><span style={{ fontFamily: F.b, fontSize: 12, color: C.red }}>{error}</span></div>}
      {mode === "captain" ? (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: F.b, fontSize: 12, color: C.muted, marginBottom: 6 }}>Your Team</div>
          <select value={teamId} onChange={e => setTeamId(e.target.value)} style={{ width: "100%", padding: "11px 12px", borderRadius: 10, border: `1px solid ${teamId ? C.amber : C.border}`, background: C.surface, color: teamId ? C.text : C.dim, fontFamily: F.b, fontSize: 14, cursor: "pointer", outline: "none" }}>
            <option value="">Select your team...</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: F.b, fontSize: 12, color: C.muted, marginBottom: 6 }}>Reason for Access</div>
          <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. League coordinator, need to manage match results..." rows={3} style={{ width: "100%", padding: "11px 12px", borderRadius: 10, border: `1px solid ${reason ? C.amber : C.border}`, background: C.surface, color: C.text, fontFamily: F.b, fontSize: 13, resize: "none", outline: "none", boxSizing: "border-box" }} />
        </div>
      )}
      <button onClick={handleSubmit} disabled={submitting} style={{ width: "100%", padding: "13px 0", borderRadius: 10, border: "none", background: C.amber, color: C.bg, fontFamily: F.b, fontSize: 14, fontWeight: 700, cursor: submitting ? "wait" : "pointer" }}>
        {submitting ? "Submitting..." : "Request Access"}
      </button>
      <button onClick={signOut} style={{ width: "100%", marginTop: 8, padding: "10px 0", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontFamily: F.b, fontSize: 13, cursor: "pointer" }}>Sign out</button>
    </div>
  );
}

// ── Roster Manager (shared by Admin + Captain) ───────────
// ── Team Name Editor ─────────────────────────────────────
function TeamNameEditor({ teamId, teamName, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(teamName || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    if (!name.trim() || name.trim() === teamName) { setEditing(false); return; }
    setSaving(true);
    setError(null);
    try {
      await qAuth("teams", `id=eq.${teamId}`, "PATCH", { name: name.trim() });
      onSaved(name.trim());
      setEditing(false);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  if (!editing) return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
      <span style={{ fontFamily: F.d, fontSize: 16, color: C.text, fontWeight: 700 }}>{teamName}</span>
      <button onClick={() => { setEditing(true); setName(teamName || ""); }} style={{ padding: "3px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.dim, fontFamily: F.m, fontSize: 11, cursor: "pointer", flexShrink: 0 }}>✎ Rename</button>
    </div>
  );

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
          autoFocus
          style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.amber}`, background: C.surface, color: C.text, fontFamily: F.b, fontSize: 14, outline: "none" }}
        />
        <button onClick={() => setEditing(false)} style={{ padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontFamily: F.m, fontSize: 11, cursor: "pointer" }}>Cancel</button>
        <button onClick={handleSave} disabled={saving} style={{ padding: "6px 12px", borderRadius: 7, border: "none", background: C.amber, color: C.bg, fontFamily: F.b, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{saving ? "..." : "Save"}</button>
      </div>
      {error && <div style={{ fontFamily: F.m, fontSize: 11, color: C.red, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

function RosterManager({ teamId, teamName, seasonId, isAdmin = false }) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState(null);
  const [currentTeamName, setCurrentTeamName] = useState(teamName || "");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await qAuth(
        "team_players",
        `team_id=eq.${teamId}&season_id=eq.${seasonId}&order=is_captain.desc,players(name).asc&select=id,is_captain,player_id,players(id,name)`
      );
      setPlayers((data || []).map(tp => ({ ...tp, name: tp.players?.name || "—" })));
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [teamId, seasonId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      // Find or create player by name (case-insensitive)
      let playerData = await qAuth("players", `name=ilike.${encodeURIComponent(newName.trim())}&limit=1`);
      let playerId;
      if (playerData?.length) {
        playerId = playerData[0].id;
      } else {
        const created = await qAuth("players", "", "POST", { name: newName.trim() });
        playerId = created[0].id;
      }
      await qAuth("team_players", "", "POST", { player_id: playerId, team_id: teamId, season_id: seasonId, is_captain: false });
      setNewName("");
      setAdding(false);
      await load();
    } catch (e) {
      setError(e.message.includes("unique") ? "Player already on this roster." : e.message);
    }
    setSaving(false);
  };

  const handleRemove = async (tpId) => {
    if (!window.confirm("Remove this player from the roster?")) return;
    try {
      await qAuth(`team_players`, `id=eq.${tpId}`, "DELETE");
      setPlayers(prev => prev.filter(p => p.id !== tpId));
    } catch (e) { setError(e.message); }
  };

  const handleToggleCaptain = async (tpId, current) => {
    try {
      await qAuth("team_players", `id=eq.${tpId}`, "PATCH", { is_captain: !current });
      setPlayers(prev => prev.map(p => p.id === tpId ? { ...p, is_captain: !current } : p));
    } catch (e) { setError(e.message); }
  };

  const handleEditSave = async (tpId, playerId) => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await qAuth("players", `id=eq.${playerId}`, "PATCH", { name: editName.trim() });
      setPlayers(prev => prev.map(p => p.id === tpId ? { ...p, name: editName.trim() } : p));
      setEditingId(null);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  return (
    <div>
      <TeamNameEditor teamId={teamId} teamName={currentTeamName} onSaved={setCurrentTeamName} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontFamily: F.b, fontSize: 13, color: C.muted }}>{players.length} player{players.length !== 1 ? "s" : ""}</div>
        <button onClick={() => { setAdding(true); setNewName(""); }} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.amber}40`, background: `${C.amber}12`, color: C.amber, fontFamily: F.b, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>+ Add Player</button>
      </div>

      {error && <div style={{ background: `${C.red}15`, border: `1px solid ${C.red}30`, borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}><span style={{ fontFamily: F.b, fontSize: 12, color: C.red }}>{error}</span></div>}

      {adding && (
        <div style={{ background: C.surfAlt, border: `1px solid ${C.amber}30`, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
          <div style={{ fontFamily: F.b, fontSize: 12, color: C.muted, marginBottom: 6 }}>New Player Name</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdd()}
              placeholder="e.g. Jane Smith"
              autoFocus
              style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontFamily: F.b, fontSize: 13, outline: "none" }}
            />
            <button onClick={() => setAdding(false)} style={{ padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontFamily: F.b, fontSize: 12, cursor: "pointer" }}>Cancel</button>
            <button onClick={handleAdd} disabled={!newName.trim() || saving} style={{ padding: "9px 14px", borderRadius: 8, border: "none", background: C.amber, color: C.bg, fontFamily: F.b, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {saving ? "..." : "Add"}
            </button>
          </div>
        </div>
      )}

      {loading ? <Loader /> : players.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 0", fontFamily: F.b, fontSize: 13, color: C.dim }}>No players on roster yet.</div>
      ) : players.map(p => (
        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: C.surfAlt, border: `1px solid ${C.border}`, marginBottom: 6 }}>
          {editingId === p.id ? (
            <>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleEditSave(p.id, p.player_id)}
                autoFocus
                style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.amber}`, background: C.surface, color: C.text, fontFamily: F.b, fontSize: 13, outline: "none" }}
              />
              <button onClick={() => setEditingId(null)} style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontFamily: F.m, fontSize: 11, cursor: "pointer" }}>Cancel</button>
              <button onClick={() => handleEditSave(p.id, p.player_id)} disabled={saving} style={{ padding: "5px 10px", borderRadius: 7, border: "none", background: C.amber, color: C.bg, fontFamily: F.b, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Save</button>
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                {p.is_captain && <CaptainBadge size={18} />}
                <span style={{ fontFamily: F.b, fontSize: 14, color: C.text, fontWeight: p.is_captain ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                {p.is_captain && <span style={{ fontFamily: F.m, fontSize: 11, color: C.amber, flexShrink: 0 }}>Captain</span>}
              </div>
              <button
                onClick={() => handleToggleCaptain(p.id, p.is_captain)}
                title={p.is_captain ? "Remove captain" : "Make captain"}
                style={{ padding: "4px 10px", borderRadius: 7, border: `1px solid ${p.is_captain ? C.amber : C.border}`, background: p.is_captain ? `${C.amber}20` : "transparent", color: p.is_captain ? C.amber : C.dim, fontFamily: F.b, fontSize: 10, fontWeight: 700, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}
              >{p.is_captain ? "★ Captain" : "☆ Captain"}</button>
              <button onClick={() => { setEditingId(p.id); setEditName(p.name); }} style={{ padding: "4px 8px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontFamily: F.m, fontSize: 11, cursor: "pointer" }}>Edit</button>
              <button onClick={() => handleRemove(p.id)} style={{ padding: "4px 8px", borderRadius: 7, border: `1px solid ${C.red}30`, background: `${C.red}10`, color: C.red, fontFamily: F.m, fontSize: 11, cursor: "pointer" }}>✕</button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Admin Roster Tab ──────────────────────────────────────
function AdminRosterTab({ seasonId }) {
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [teamSearch, setTeamSearch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [csvMode, setCsvMode] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvPreview, setCsvPreview] = useState(null);
  const [csvError, setCsvError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  useEffect(() => {
    if (!seasonId) return;
    q("divisions", `season_id=eq.${seasonId}&select=id,team_seasons(team_id,teams(id,name))&level=neq.party`)
      .then(divs => {
        const teamSet = new Map();
        divs?.forEach(d => d.team_seasons?.forEach(ts => {
          if (ts.teams) teamSet.set(ts.teams.id, ts.teams.name);
        }));
        const sorted = [...teamSet.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
        setTeams(sorted);
        setLoading(false);
      });
  }, [seasonId]);

  const parseCSV = (text) => {
    const lines = text.trim().split("\n").filter(l => l.trim());
    const rows = [];
    const errors = [];
    lines.forEach((line, i) => {
      const parts = line.split(",").map(s => s.trim());
      if (parts.length < 2) { errors.push(`Line ${i + 1}: needs at least player_name, team_name`); return; }
      const [playerName, teamName, isCap] = parts;
      if (!playerName) { errors.push(`Line ${i + 1}: missing player name`); return; }
      if (!teamName) { errors.push(`Line ${i + 1}: missing team name`); return; }
      const team = teams.find(t => t.name.toLowerCase() === teamName.toLowerCase());
      if (!team) { errors.push(`Line ${i + 1}: team "${teamName}" not found`); return; }
      rows.push({ playerName, teamName, teamId: team.id, isCaptain: isCap?.toLowerCase() === "true" });
    });
    return { rows, errors };
  };

  const handleCsvPreview = () => {
    setCsvError(null);
    setCsvPreview(null);
    const { rows, errors } = parseCSV(csvText);
    if (errors.length) { setCsvError(errors.join("\n")); return; }
    setCsvPreview(rows);
  };

  const handleCsvImport = async () => {
    if (!csvPreview?.length) return;
    setImporting(true);
    setCsvError(null);
    let added = 0, skipped = 0;
    for (const row of csvPreview) {
      try {
        let pData = await qAuth("players", `name=ilike.${encodeURIComponent(row.playerName)}&limit=1`);
        let playerId;
        if (pData?.length) {
          playerId = pData[0].id;
        } else {
          const created = await qAuth("players", "", "POST", { name: row.playerName });
          playerId = created[0].id;
        }
        await qAuth("team_players", "", "POST", { player_id: playerId, team_id: row.teamId, season_id: seasonId, is_captain: row.isCaptain });
        added++;
      } catch (e) {
        if (e.message.includes("unique")) skipped++; else skipped++;
      }
    }
    setImportResult({ added, skipped });
    setCsvText("");
    setCsvPreview(null);
    setCsvMode(false);
    setImporting(false);
  };

  if (loading) return <Loader />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontFamily: F.b, fontSize: 13, color: C.muted }}>Manage team rosters</div>
        <button onClick={() => { setCsvMode(!csvMode); setCsvPreview(null); setCsvError(null); }} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: csvMode ? C.surface : "transparent", color: csvMode ? C.amber : C.muted, fontFamily: F.m, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
          {csvMode ? "✕ Cancel CSV" : "⬆ Bulk CSV Upload"}
        </button>
      </div>

      {importResult && (
        <div style={{ background: `${C.green}15`, border: `1px solid ${C.green}30`, borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
          <span style={{ fontFamily: F.b, fontSize: 13, color: C.green }}>✓ Import complete — {importResult.added} added, {importResult.skipped} skipped</span>
          <button onClick={() => setImportResult(null)} style={{ background: "none", border: "none", color: C.green, cursor: "pointer", float: "right" }}>✕</button>
        </div>
      )}

      {csvMode ? (
        <Card style={{ padding: "16px" }}>
          <div style={{ fontFamily: F.b, fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6 }}>CSV Format</div>
          <div style={{ background: C.surfAlt, borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontFamily: "monospace", fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
            player_name, team_name, is_captain<br />
            John Smith, Hammered at the Palms, true<br />
            Jane Doe, Hammered at the Palms, false<br />
            Jane Doe, Sling Blades, false
          </div>
          {csvError && <div style={{ background: `${C.red}15`, border: `1px solid ${C.red}30`, borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontFamily: "monospace", fontSize: 11, color: C.red, whiteSpace: "pre" }}>{csvError}</div>}
          <textarea
            value={csvText}
            onChange={e => { setCsvText(e.target.value); setCsvPreview(null); setCsvError(null); }}
            placeholder="Paste CSV here..."
            rows={8}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontFamily: "monospace", fontSize: 12, resize: "vertical", outline: "none", boxSizing: "border-box", marginBottom: 10 }}
          />
          {csvPreview ? (
            <>
              <div style={{ fontFamily: F.b, fontSize: 12, color: C.muted, marginBottom: 8 }}>{csvPreview.length} rows ready to import:</div>
              <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 12 }}>
                {csvPreview.map((r, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 7, background: C.surfAlt, marginBottom: 4 }}>
                    {r.isCaptain && <CaptainBadge size={16} />}
                    <span style={{ fontFamily: F.b, fontSize: 13, color: C.text, flex: 1 }}>{r.playerName}</span>
                    <span style={{ fontFamily: F.m, fontSize: 11, color: C.muted }}>{r.teamName}</span>
                  </div>
                ))}
              </div>
              <button onClick={handleCsvImport} disabled={importing} style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: C.amber, color: C.bg, fontFamily: F.b, fontSize: 14, fontWeight: 700, cursor: importing ? "wait" : "pointer" }}>
                {importing ? "Importing..." : `Import ${csvPreview.length} Players`}
              </button>
            </>
          ) : (
            <button onClick={handleCsvPreview} disabled={!csvText.trim()} style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: csvText.trim() ? C.amber : C.border, color: csvText.trim() ? C.bg : C.dim, fontFamily: F.b, fontSize: 14, fontWeight: 700, cursor: csvText.trim() ? "pointer" : "not-allowed" }}>
              Preview Import
            </button>
          )}
        </Card>
      ) : (
        <>
          <>
            <div style={{ marginBottom: 14, position: "relative" }}>
              <input
                placeholder="Search team..."
                value={teamSearch || ""}
                onChange={e => setTeamSearch(e.target.value)}
                onFocus={() => { if (!teamSearch) setTeamSearch(""); }}
                onBlur={() => setTimeout(() => setTeamSearch(""), 150)}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontFamily: F.b, fontSize: 14, outline: "none", boxSizing: "border-box" }}
              />
              {teamSearch !== "" && teamSearch !== null && teamSearch !== undefined && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, marginTop: 4, maxHeight: 240, overflowY: "auto", zIndex: 20 }}>
                  {teams.filter(t => !teamSearch || t.name.toLowerCase().includes(teamSearch.toLowerCase())).map(t => (
                    <div key={t.id} onMouseDown={() => { setSelectedTeam(t); setTeamSearch(""); }} style={{ padding: "10px 14px", cursor: "pointer", fontFamily: F.b, fontSize: 13, color: C.text, borderBottom: `1px solid ${C.border}` }}>
                      {t.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {selectedTeam && (
              <Card>
                <RosterManager key={selectedTeam.id} teamId={selectedTeam.id} teamName={selectedTeam.name} seasonId={seasonId} isAdmin />
              </Card>
            )}
          </>
        </>
      )}
    </div>
  );
}

function AuthWrapper({ mode }) {
  const [authState, setAuthState] = useState("loading");
  const [user, setUser] = useState(null);
  const [myRole, setMyRole] = useState(null);
  const [showTos, setShowTos] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      handleAuthCallback();
      const u = await getUser();
      if (!mounted) return;
      if (!u) { setAuthState("unauthenticated"); return; }
      setUser(u);
      let roleData;
      try { roleData = await rpc("get_my_role"); } catch { setAuthState("needs_request"); return; }
      if (!roleData?.length) { setAuthState("needs_request"); return; }
      const role = roleData[0];
      // Also fetch active season_id for roster management
      try {
        const seasons = await q("seasons", "is_active=eq.true&select=id&limit=1");
        if (seasons?.length) role.season_id = seasons[0].id;
      } catch {}
      setMyRole(role);
      if (mode === "admin" && role.role !== "super_admin") { setAuthState("needs_request"); return; }
      if (mode === "captain" && !["captain", "super_admin"].includes(role.role)) { setAuthState("needs_request"); return; }
      if (role.role === "captain" && !role.tos_accepted) { setAuthState("authorized"); return; }
      setAuthState("authorized");
    })();
    return () => { mounted = false; };
  }, [mode]);

  const handleTosAccept = async () => {
    await qAuth("user_roles", `user_id=eq.${user.id}`, "PATCH", { tos_accepted: true, tos_accepted_at: new Date().toISOString() });
    setMyRole(prev => ({ ...prev, tos_accepted: true }));
    setShowTos(false);
    setAuthState("authorized");
  };

  if (authState === "loading") return <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}><Loader /></div>;
  if (authState === "unauthenticated") return <SignInPage mode={mode} />;
  if (authState === "needs_request") return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 4 }}>
            <Logo size={32} />
            <div style={{ fontFamily: F.d, fontSize: 20, fontWeight: 800 }}><span style={{ color: C.text }}>Tang</span><span style={{ color: C.amber }}> Time</span></div>
          </div>
        </div>
        <Card>
          <RequestAccessForm user={user} mode={mode} onSubmitted={() => setAuthState("request_submitted")} />
        </Card>
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <a href="/" style={{ fontFamily: F.m, fontSize: 12, color: C.dim, textDecoration: "none" }}>← Back to standings</a>
        </div>
      </div>
    </div>
  );
  if (authState === "request_submitted") return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Card style={{ maxWidth: 380, textAlign: "center", padding: "32px 24px" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
        <h2 style={{ fontFamily: F.d, fontSize: 20, margin: "0 0 10px", color: C.text }}>Request Submitted!</h2>
        <p style={{ fontFamily: F.b, fontSize: 13, color: C.muted, margin: "0 0 20px", lineHeight: 1.6 }}>Your request has been sent. You'll be notified once it's been approved.</p>
        <button onClick={signOut} style={{ padding: "10px 20px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontFamily: F.b, fontSize: 13, cursor: "pointer" }}>Sign out</button>
      </Card>
    </div>
  );
  return (
    <>
      {showTos && <TosModal onAccept={handleTosAccept} onDecline={signOut} />}
      {authState === "authorized" && (mode === "admin" ? <AdminApp user={user} myRole={myRole} /> : <CaptainApp user={user} myRole={myRole} />)}
    </>
  );
}

function TermsPage() {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F.b, padding: "24px 16px" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <a href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
            <Logo size={28} />
            <span style={{ fontFamily: F.d, fontSize: 16, color: C.text }}><span style={{ color: C.text }}>Tang</span><span style={{ color: C.amber }}> Time</span></span>
          </a>
        </div>
        <h1 style={{ fontFamily: F.d, fontSize: 26, color: C.text, margin: "0 0 6px" }}>Terms of Service</h1>
        <p style={{ fontFamily: F.m, fontSize: 11, color: C.dim, margin: "0 0 24px" }}>Last updated: February 17, 2026</p>
        {[
          ["Welcome to TangTime", "TangTime is an unofficial companion app for the shuffleboard league community at Royal Palms Brooklyn. It is not affiliated with, endorsed by, or operated by Royal Palms. By accessing or using TangTime, you agree to these Terms of Service."],
          ["What TangTime Does", "TangTime provides league standings, match results, team statistics, and historical data for the shuffleboard community. Certain features, such as submitting match results, require a registered account."],
          ["User Accounts", "Account creation is available for team captains and league administrators. By creating an account, you agree to provide accurate information and are responsible for maintaining the security of your credentials."],
          ["Player & Team Information", "TangTime displays team names, player names, match results, and league statistics. By participating in the league, players consent to the display of their name. Players may request removal by contacting us."],
          ["Acceptable Use", "You agree not to attempt to access others' accounts, interfere with the App, use the App unlawfully, scrape or redistribute data without permission, or submit false match results."],
          ["Match Results", "Captains who submit results are responsible for their accuracy. TangTime reserves the right to correct or override submitted results at any time."],
          ["Data & Privacy", "For accounts created via Google Sign-In, we store your name and email solely for authentication. We do not sell or share your personal information with third parties."],
          ["Disclaimer", "TangTime is provided \"as is\" without warranties. We are not responsible for official league decisions, standings disputes, or scheduling. This is a community project."],
          ["Changes", "We may update these Terms from time to time. Continued use constitutes acceptance of updated Terms."],
          ["Contact", "For questions or removal requests, reach out through the league community or via the App."],
        ].map(([title, body]) => (
          <div key={title} style={{ marginBottom: 20 }}>
            <h3 style={{ fontFamily: F.d, fontSize: 16, color: C.text, margin: "0 0 6px" }}>{title}</h3>
            <p style={{ fontFamily: F.b, fontSize: 13, color: C.muted, margin: 0, lineHeight: 1.7 }}>{body}</p>
          </div>
        ))}
        <div style={{ marginTop: 32, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
          <a href="/" style={{ fontFamily: F.m, fontSize: 12, color: C.dim, textDecoration: "none" }}>← Back to standings</a>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════
// ─── MAIN APP ───
// ══════════════════════════════════════

export default function TangTime() {
  const path = window.location.pathname;
  if (path === "/captain") return <AuthWrapper mode="captain" />;
  if (path === "/admin") return <AuthWrapper mode="admin" />;
  if (path === "/terms") return <TermsPage />;
  return <MainApp />;
}

function MainApp() {
  const [page, setPage] = useState("home");
  const [pageData, setPageData] = useState({});
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [divisions, setDivisions] = useState([]);
  const [champs, setChamps] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const mainRef = useRef(null);

  useEffect(() => {
    const l = document.createElement("link");
    l.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;800&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap";
    l.rel = "stylesheet";
    document.head.appendChild(l);
  }, []);

  useEffect(() => {
    Promise.all([
      q("seasons", "order=start_date.desc"),
      q("championships", "select=*,teams!championships_team_id_fkey(name),seasons(name,start_date),divisions(name,day_of_week,level)&order=season_id.desc"),
    ]).then(([sd, cd]) => {
      if (sd?.length) {
        setSeasons(sd);
        setSelectedSeason(sd.find(s => s.is_active) || sd[0]);
      }
      setChamps(cd || []);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!selectedSeason) return;
    q("divisions", `season_id=eq.${selectedSeason.id}&order=day_of_week,level&select=id,name,day_of_week,level,season_id,team_seasons(team_id)`).then(d => {
      setDivisions((d || []).filter(div => div.level !== "party" || (div.team_seasons?.length > 0)));
    });
  }, [selectedSeason]);

  const goPage = useCallback((p, data = {}) => {
    setPage(p);
    setPageData(data);
    mainRef.current?.scrollTo(0, 0);
  }, []);

  const renderPage = () => {
    switch (page) {
      case "home":
        return <HomePage seasons={seasons} activeSeason={selectedSeason} divisions={divisions} goPage={goPage} champs={champs} />;
      case "standings":
        return <StandingsPage divisions={divisions} activeSeason={selectedSeason} goPage={goPage} />;
      case "matches":
        return <MatchesPage divisions={divisions} activeSeason={selectedSeason} goPage={goPage} />;
      case "teams":
        return <TeamsPage goPage={goPage} initialTeamId={pageData.teamId} activeSeason={selectedSeason} />;
      case "fame":
        return <HallOfFamePage seasons={seasons} goPage={goPage} initialTab={pageData.tab} />;
      default:
        return null;
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, fontFamily: F.b, color: C.text,
      display: "flex", flexDirection: "column", maxWidth: 520, margin: "0 auto",
      opacity: loaded ? 1 : 0, transition: "opacity 0.4s ease",
    }}>
      {/* Header */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
        background: `${C.surface}dd`, backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => goPage("home")}>
          <Logo size={34} />
          <div>
            <div style={{ fontFamily: F.d, fontSize: 17, fontWeight: 800, lineHeight: 1.1 }}>
              <span style={{ color: C.text }}>Tang</span><span style={{ color: C.amber }}> Time</span>
            </div>
            <div style={{ fontFamily: F.m, fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 2 }}>
              Royal Palms BK
            </div>
          </div>
        </div>
        <SeasonSelector seasons={seasons} selected={selectedSeason} onSelect={setSelectedSeason} />
      </header>

      {/* Content */}
      <main ref={mainRef} style={{ flex: 1, padding: "16px 16px 100px", overflowY: "auto" }}>
        {renderPage()}
      </main>

      {/* Bottom Nav */}
      <nav style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 520, display: "flex", justifyContent: "space-around",
        padding: "8px 4px 16px", zIndex: 100,
        background: `linear-gradient(180deg, transparent 0%, ${C.bg} 25%)`,
        borderTop: `1px solid ${C.border}`,
      }}>
        {[
          ["home", "⌂", "Home"],
          ["standings", "☰", "Standings"],
          ["matches", "◉", "Matches"],
          ["teams", "◈", "Teams"],
          ["fame", "♕", "History"],
        ].map(([key, icon, label]) => {
          const active = page === key;
          return (
            <button key={key} onClick={() => goPage(key)} style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              background: "none", border: "none", cursor: "pointer",
              color: active ? C.amber : C.dim, padding: "6px 6px", borderRadius: 10,
              position: "relative", fontFamily: F.b, transition: "color 0.15s",
            }}>
              {active && (
                <div style={{ position: "absolute", top: -1, left: "50%", transform: "translateX(-50%)", width: 18, height: 3, borderRadius: 2, background: C.amber }} />
              )}
              <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
              <span style={{ fontSize: 9, fontWeight: active ? 700 : 500, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
