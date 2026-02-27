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

// Group stage standings - sort by W-L, flag ties
// R16 bracket labels: match_number -> { team1Label, team2Label }
const R16_LABELS = {
  1: { t1: "A1", t2: "B2" }, 2: { t1: "C1", t2: "D2" },
  3: { t1: "E1", t2: "F2" }, 4: { t1: "G1", t2: "H2" },
  5: { t1: "B1", t2: "A2" }, 6: { t1: "D1", t2: "C2" },
  7: { t1: "F1", t2: "E2" }, 8: { t1: "H1", t2: "G2" },
};

function computeGroupStandings(teamList, matches, overrideOrder = null) {
  const st = {};
  teamList.forEach(t => {
    st[t.team_id] = { team_id: t.team_id, team_name: t.team_name, seed_label: t.seed_label, w: 0, l: 0 };
  });
  const completed = matches.filter(m => m.status === "completed");
  completed.forEach(m => {
    if (st[m.team1_id]) {
      if (m.winner_id === m.team1_id) st[m.team1_id].w++;
      else if (m.winner_id === m.team2_id) st[m.team1_id].l++;
    }
    if (st[m.team2_id]) {
      if (m.winner_id === m.team2_id) st[m.team2_id].w++;
      else if (m.winner_id === m.team1_id) st[m.team2_id].l++;
    }
  });

  // If admin override order exists, use that
  if (overrideOrder && overrideOrder.length === teamList.length) {
    return overrideOrder.map((tid, idx) => {
      const s = st[tid];
      return s ? { ...s, rank: idx + 1, tied: false } : null;
    }).filter(Boolean);
  }

  // Sort by W desc, L asc
  const arr = Object.values(st).sort((a, b) => b.w - a.w || a.l - b.l);

  // Flag ties at the cutline (positions 2/3 matter for advancement)
  return arr.map((team, idx) => {
    const sameRecord = arr.filter(t => t.w === team.w && t.l === team.l);
    const tied = sameRecord.length > 1;
    // Check if this tie spans the cutline (top 2 advance)
    const positions = sameRecord.map(t => arr.indexOf(t));
    const crossesCutline = tied && positions.some(p => p < 2) && positions.some(p => p >= 2);
    return { ...team, rank: idx + 1, tied, crossesCutline };
  });
}

function getSeasonProgress(season) {
  if (!season) return { label: "", status: "active", week: null };
  const now = new Date();
  const start = new Date(season.start_date + "T00:00:00");
  if (now < start) return { label: "Starting Soon", status: "upcoming", week: null };
  if (!season.is_active) return { label: "Completed", status: "completed", week: null };
  const rawWeek = Math.max(Math.floor((now - start) / (7 * 24 * 60 * 60 * 1000)) + 1, 1);
  // Monday of week 9+ → Completed
  if (rawWeek >= 9) return { label: "Completed", status: "completed", week: null };
  // Wednesday of week 8+ → Postseason (Tue night matches are done)
  if (rawWeek === 8) {
    const week8Monday = new Date(start.getTime() + 7 * 7 * 24 * 60 * 60 * 1000);
    const week8Wednesday = new Date(week8Monday.getTime() + 2 * 24 * 60 * 60 * 1000);
    if (now >= week8Wednesday) return { label: "🏆 Postseason", status: "postseason", week: 8 };
  }
  const week = Math.min(rawWeek, 8);
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
  const postponed = m.status === "postponed";
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
            </>) : postponed ? (
              <Badge color={C.amber} style={{ fontSize: 8, padding: "2px 6px" }}>PPD</Badge>
            ) : (
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
function HomePage({ seasons, activeSeason, divisions, goPage, champs, hasPlayoffTab }) {
  const [leaders, setLeaders] = useState([]);
  const [recent, setRecent] = useState([]);
  const [allStandings, setAllStandings] = useState([]);
  const [topTeams, setTopTeams] = useState([]);
  const [loading, setLoading] = useState(true);

  const progress = getSeasonProgress(activeSeason);
  const isPast = progress.status === "completed";
  const isPostseason = progress.status === "postseason";

  // Compute actual current week from data
  const dataWeek = useMemo(() => {
    if (isPast) return null;
    const maxGames = allStandings.length
      ? Math.max(...allStandings.map(s => (s.wins || 0) + (s.losses || 0)))
      : 0;
    const dataW = maxGames > 0 ? Math.min(maxGames, 8) : 0;
    return Math.max(dataW, progress.week || 0) || null;
  }, [allStandings, progress.week, isPast]);
  const progressLabel = isPast ? "Completed" : isPostseason ? "🏆 Postseason" : (dataWeek ? `Week ${dataWeek} of 8` : progress.label);

  useEffect(() => {
    if (!activeSeason || !divisions?.length) return;
    setLoading(true);
    const ids = divisions.map(d => d.id);
    Promise.all([
      q("division_standings", `season_name=eq.${encodeURIComponent(activeSeason.name)}&order=division_name,calculated_rank&limit=200`),
      q("recent_matches", `division_id=in.(${ids.join(",")})&status=in.(completed,postponed)&order=scheduled_date.desc&limit=20`),
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

  // Get banquet Final 4 for past seasons
  const banquetTeams = useMemo(() => {
    if (!isPast || !champs?.length) return [];
    const seasonChamps = champs.filter(c => c.seasons?.name === activeSeason?.name);
    const typeOrder = { league: 0, finalist: 1, banquet: 2 };
    const found = seasonChamps
      .filter(c => c.type === "league" || c.type === "finalist" || c.type === "banquet")
      .sort((a, b) => (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9));
    // Final 4 = 1 league + 1 finalist + 2 banquet. Fill missing slots.
    const hasLeague = found.some(c => c.type === "league");
    const hasFinalist = found.some(c => c.type === "finalist");
    const banquetCount = found.filter(c => c.type === "banquet").length;
    const result = [...found];
    if (!hasLeague) result.unshift({ _incomplete: true, type: "league" });
    if (!hasFinalist) result.splice(hasLeague ? 1 : 1, 0, { _incomplete: true, type: "finalist" });
    for (let i = banquetCount; i < 2; i++) result.push({ _incomplete: true, type: "banquet" });
    return result;
  }, [isPast, champs, activeSeason]);

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
            color={progress.status === "completed" ? C.muted : progress.status === "postseason" ? C.amber : progress.status === "upcoming" ? C.blue : C.green}
            style={{ flexShrink: 0 }}
          >
            {progress.status === "completed" ? "✓" : progress.status === "postseason" ? "" : progress.status === "upcoming" ? "◷" : "●"} {progressLabel}
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

      {/* PAST SEASON: Champion (only show when no Playoffs tab — otherwise it's on Playoffs) */}
      {isPast && !hasPlayoffTab && seasonChamp && (
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

      {/* PAST SEASON: Banquet Final 4 (only show when no Playoffs tab — otherwise it's on Playoffs) */}
      {isPast && !hasPlayoffTab && banquetTeams.some(bt => !bt._incomplete) && (
        <div>
          <SectionTitle right="Final 4">Banquet</SectionTitle>
          {banquetTeams.map((bt, i) => {
            const badgeLabel = bt.type === "league" ? "🏆 Champion" : bt.type === "finalist" ? "🥈 Finalist" : "🏅 Semifinal";
            const badgeColor = bt.type === "league" ? C.amber : bt.type === "finalist" ? "#c0c0c0" : "#cd7f32";
            return (
              <Card key={bt.id || `inc-${i}`} onClick={bt._incomplete ? undefined : () => goPage("teams", { teamId: bt.team_id })}
                style={{ padding: "12px 18px", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: bt._incomplete ? "default" : "pointer", opacity: bt._incomplete ? 0.6 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {bt._incomplete
                    ? <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.surface, border: `1px solid ${C.border}`, flexShrink: 0 }} />
                    : <TeamAvatar name={bt.teams?.name || "?"} size={36} />}
                  <div>
                    <div style={{ fontFamily: F.b, fontSize: 14, fontWeight: 600, color: bt._incomplete ? C.muted : bt.type === "league" ? C.amber : C.text }}>
                      {bt._incomplete ? "Data incomplete" : bt.teams?.name}
                    </div>
                  </div>
                </div>
                <Badge color={bt._incomplete ? C.muted : badgeColor}>{badgeLabel}</Badge>
              </Card>
            );
          })}
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

      {/* Recent Results — current season only */}
      {!isPast && recent.length > 0 && (
        <div>
          <SectionTitle right="Latest">Recent Results</SectionTitle>
          {recent.slice(0, 6).map((m, i) => {
            const aWon = m.winner_id === m.team_a_id;
            const bWon = m.winner_id === m.team_b_id;
            const isOT = m.went_to_ot;
            const ppd = m.status === "postponed";
            return (
              <Card key={m.id || i} style={{ padding: "12px 18px", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <TeamLink name={m.team_a_name} teamId={m.team_a_id} goPage={goPage}
                      style={{
                        fontFamily: F.b, fontSize: 14,
                        fontWeight: ppd ? 400 : aWon ? 700 : 400,
                        color: ppd ? C.text : aWon ? C.text : C.muted,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block",
                      }} />
                  </div>
                  <div style={{ padding: "0 10px", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    {ppd ? (
                      <Badge color={C.amber} style={{ fontSize: 9, padding: "2px 6px" }}>PPD</Badge>
                    ) : (<>
                      {aWon ? <Badge color={C.green} style={{ fontSize: 9, padding: "2px 6px" }}>W</Badge> :
                       bWon ? <Badge color={C.red} style={{ fontSize: 9, padding: "2px 6px" }}>L</Badge> : null}
                      <span style={{ color: C.dim, fontSize: 11 }}>vs</span>
                      {bWon ? <Badge color={C.green} style={{ fontSize: 9, padding: "2px 6px" }}>W</Badge> :
                       aWon ? <Badge color={C.red} style={{ fontSize: 9, padding: "2px 6px" }}>L</Badge> : null}
                      {isOT && <Badge color={C.amber} style={{ fontSize: 9, padding: "2px 5px" }}>OT</Badge>}
                    </>)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, textAlign: "right" }}>
                    <TeamLink name={m.team_b_name} teamId={m.team_b_id} goPage={goPage}
                      style={{
                        fontFamily: F.b, fontSize: 14,
                        fontWeight: ppd ? 400 : bWon ? 700 : 400,
                        color: ppd ? C.text : bWon ? C.text : C.muted,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block",
                      }} />
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 6 }}>
                  <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>{fmtDate(m.scheduled_date)}</span>
                  {m.scheduled_time && <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>{fmtTime(m.scheduled_time)}</span>}
                  {m.court && <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>Court {String(m.court).replace(/^Court\s*/i, "").replace(/^0+/, "") || m.court}</span>}
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
            const playoffSpots = selDiv?.playoff_spots || 5;
            const useTopN = !hasPlayoffData;
            const isTopN = t.displayRank <= playoffSpots;
            const lastTopNIdx = useTopN ? rows.reduce((last, r, j) => r.displayRank <= playoffSpots ? j : last, -1) : -1;
            return (
            <div key={t.team_id || i} onClick={() => goPage("teams", { teamId: t.team_id })} style={{
              display: "grid", gridTemplateColumns: "30px 1fr 32px 32px 34px 42px 38px",
              alignItems: "center", padding: "12px 12px", cursor: "pointer",
              borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : "none",
              background: useTopN && isTopN ? C.amberGlow : "transparent", position: "relative",
            }}>
              {useTopN && i === lastTopNIdx && i < rows.length - 1 && (
                <div style={{ position: "absolute", bottom: 0, left: 14, right: 14, height: 1, background: `repeating-linear-gradient(90deg, ${C.amber}50, ${C.amber}50 4px, transparent 4px, transparent 8px)` }} />
              )}
              <span style={{ fontFamily: F.m, fontSize: 12, fontWeight: 800, color: useTopN && isTopN ? C.amber : C.dim }}>{t.rankLabel}</span>
              <div style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", fontFamily: F.b, fontSize: 13, fontWeight: 600, color: C.text, display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t.team_name}</span>
                {t.playoffRound && (
                  <span style={{ fontSize: 10, flexShrink: 0 }}>{
                    t.playoffRound === "champion" ? "🏆" :
                    t.playoffRound === "finalist" ? "🥈" :
                    t.playoffRound === "banquet" ? "🎖️" :
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

// ─── PLAYOFFS ───
function PlayoffsPage({ activeSeason, divisions, goPage }) {
  const [playoffTab, setPlayoffTab] = useState("groups");
  const [groups, setGroups] = useState(null);
  const [playoffTeams, setPlayoffTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDraw, setShowDraw] = useState(false);
  const [drawComplete, setDrawComplete] = useState(false);
  const [lotteryData, setLotteryData] = useState(null);
  const [lotteryReplay, setLotteryReplay] = useState(null);
  const [lotteryAnimating, setLotteryAnimating] = useState(false);
  const [groupMatches, setGroupMatches] = useState({});
  const [bracketMatches, setBracketMatches] = useState({});
  const [groupOverrides, setGroupOverrides] = useState({});

  useEffect(() => {
    if (!activeSeason) { setLoading(false); return; }
    Promise.all([
      q("playoff_groups", `season_id=eq.${activeSeason.id}&select=group_name,team_id,team_name,seed_label,division_id,court&order=group_name,position`),
      q("playoff_appearances", `season_id=eq.${activeSeason.id}&select=team_id,seed_label,round_reached`),
      q("seasons", `id=eq.${activeSeason.id}&select=lottery_data,group_overrides`),
      q("group_matches", `season_id=eq.${activeSeason.id}&order=group_name,match_number`),
    ]).then(([grps, pa, seasonInfo, gm]) => {
      if (grps?.length > 0) {
        const groupMap = {};
        grps.forEach(g => {
          if (!groupMap[g.group_name]) groupMap[g.group_name] = [];
          groupMap[g.group_name].push(g);
        });
        setGroups(groupMap);
      }
      setPlayoffTeams(pa || []);
      if (seasonInfo?.[0]?.lottery_data) setLotteryData(seasonInfo[0].lottery_data);
      if (seasonInfo?.[0]?.group_overrides) setGroupOverrides(seasonInfo[0].group_overrides);
      if (gm?.length > 0) {
        const matchMap = {};
        const bracketMap = {};
        const bracketRounds = ["R16", "QF", "SF", "FIN", "3RD"];
        gm.forEach(m => {
          if (bracketRounds.includes(m.group_name)) {
            if (!bracketMap[m.group_name]) bracketMap[m.group_name] = [];
            bracketMap[m.group_name].push(m);
          } else {
            if (!matchMap[m.group_name]) matchMap[m.group_name] = [];
            matchMap[m.group_name].push(m);
          }
        });
        setGroupMatches(matchMap);
        setBracketMatches(bracketMap);
      }
      setLoading(false);
    });
  }, [activeSeason]);

  // Poll for match updates every 60s
  useEffect(() => {
    if (!activeSeason || !groups || Object.keys(groups).length === 0) return;

    const poll = setInterval(async () => {
      try {
        const gm = await q("group_matches", `season_id=eq.${activeSeason.id}&order=group_name,match_number`);
        if (gm?.length > 0) {
          const matchMap = {};
          const bracketMap = {};
          const bracketRounds = ["R16", "QF", "SF", "FIN", "3RD"];
          gm.forEach(m => {
            if (bracketRounds.includes(m.group_name)) {
              if (!bracketMap[m.group_name]) bracketMap[m.group_name] = [];
              bracketMap[m.group_name].push(m);
            } else {
              if (!matchMap[m.group_name]) matchMap[m.group_name] = [];
              matchMap[m.group_name].push(m);
            }
          });
          setGroupMatches(matchMap);
          setBracketMatches(bracketMap);
        }
      } catch {}
    }, 60000);
    return () => clearInterval(poll);
  }, [activeSeason, !!groups]);

  // Shuffle groups for animation
  const shuffleGroups = (grps) => {
    const allTeams = Object.values(grps).flat().sort(() => Math.random() - 0.5);
    const names = Object.keys(grps).sort();
    const result = {};
    names.forEach((n, i) => {
      result[n] = allTeams.slice(i * 4, (i + 1) * 4);
    });
    return result;
  };

  const runDrawAnimation = async () => {
    if (!groups) return;
    setShowDraw(true);
    setDrawComplete(false);
    const final = {};
    Object.entries(groups).forEach(([k, v]) => { final[k] = [...v]; });
    for (let tick = 0; tick < 14; tick++) {
      setGroups(shuffleGroups(final));
      await new Promise(r => setTimeout(r, 150 + tick * 30));
    }
    setGroups(final);
    setDrawComplete(true);
  };

  const runLotteryReplay = async () => {
    if (!lotteryData?.drawn?.length || !lotteryData?.pool) return;
    setLotteryAnimating(true);
    const pool = lotteryData.pool;
    const poolNames = lotteryData.pool_names || {};

    // Draw WC1
    setLotteryReplay({ step: "wc1", showing: null });
    for (let tick = 0; tick < 14; tick++) {
      const randomId = pool[Math.floor(Math.random() * pool.length)];
      setLotteryReplay({ step: "wc1", showing: randomId });
      await new Promise(r => setTimeout(r, 120 + tick * 25));
    }
    const wc1 = lotteryData.drawn[0];
    setLotteryReplay({ step: "wc1_result", showing: wc1.team_id });
    await new Promise(r => setTimeout(r, 2000));

    // Draw WC2 if exists
    if (lotteryData.drawn.length > 1) {
      setLotteryReplay({ step: "wc2", showing: null });
      const remainingPool = pool.filter(id => id !== wc1.team_id);
      for (let tick = 0; tick < 14; tick++) {
        const randomId = remainingPool[Math.floor(Math.random() * remainingPool.length)];
        setLotteryReplay({ step: "wc2", showing: randomId });
        await new Promise(r => setTimeout(r, 120 + tick * 25));
      }
      const wc2 = lotteryData.drawn[1];
      setLotteryReplay({ step: "wc2_result", showing: wc2.team_id });
      await new Promise(r => setTimeout(r, 2000));
    }

    setLotteryReplay({ step: "done" });
    setLotteryAnimating(false);
  };

  const seedColor = (label) => {
    if (!label) return C.dim;
    if (label.startsWith("WC")) return C.blue;
    const num = parseInt(label.replace(/[^0-9]/g, ""));
    if (num === 1) return C.green;
    if (num === 2) return C.amber;
    return C.dim;
  };

  const divLabel = (code) => {
    const map = { MH: "Mon Hammer", MC: "Mon Cherry", MP: "Mon Pilot", TH: "Tue Hammer", TC: "Tue Cherry", TP: "Tue Pilot", WC: "Wild Card" };
    const prefix = code?.replace(/[0-9]/g, "") || "";
    return map[prefix] || code;
  };

  const progress = getSeasonProgress(activeSeason);

  if (loading) return <Loader />;

  // ── PHASE 1: Postseason started, no teams confirmed ──
  if (playoffTeams.length === 0) {
    return (
      <div>
        <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>
          🏆 Playoffs
        </div>
        <Card style={{
          padding: "24px 16px", textAlign: "center",
          background: `linear-gradient(135deg, ${C.surface}, ${C.amber}06)`,
          border: `1px solid ${C.amber}15`,
        }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🏆</div>
          <div style={{ fontFamily: F.d, fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>
            Postseason Has Begun
          </div>
          <div style={{ fontFamily: F.m, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
            The regular season is complete! The playoff field is being finalized.
            Check back soon for the official wildcard lottery and group draw.
          </div>
          <div style={{
            marginTop: 16, padding: "10px 14px", borderRadius: 8,
            background: `${C.amber}08`, border: `1px solid ${C.amber}15`,
          }}>
            <div style={{ fontFamily: F.b, fontSize: 11, color: C.amber }}>What's Next</div>
            <div style={{ fontFamily: F.m, fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
              ① Playoff teams confirmed by division{"\n"}
              ② Wildcard lottery for final 2 spots{"\n"}
              ③ Group draw — 32 teams into 8 groups{"\n"}
              ④ Group stage matches → Championship bracket
            </div>
          </div>
        </Card>
        <Footer />
      </div>
    );
  }

  // ── PHASE 2: Teams confirmed, no groups yet ──
  if (!groups) {
    // Organize teams by division origin
    const qualifiedByDiv = {};
    const wcTeams = [];
    playoffTeams.forEach(pt => {
      if (pt.seed_label?.startsWith("WC")) {
        wcTeams.push(pt);
      } else {
        const divCode = pt.seed_label?.replace(/[0-9]/g, "") || "?";
        if (!qualifiedByDiv[divCode]) qualifiedByDiv[divCode] = [];
        qualifiedByDiv[divCode].push(pt);
      }
    });

    return (
      <div>
        <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>
          🏆 Playoff Field
        </div>

        {/* Summary hero */}
        <Card style={{
          padding: "16px", marginBottom: 14, textAlign: "center",
          background: `linear-gradient(135deg, ${C.surface}, ${C.amber}06)`,
          border: `1px solid ${C.amber}15`,
        }}>
          <div style={{ fontFamily: F.d, fontSize: 32, fontWeight: 800, color: C.amber }}>{playoffTeams.length}</div>
          <div style={{ fontFamily: F.m, fontSize: 12, color: C.muted }}>teams qualified for playoffs</div>
          <div style={{ fontFamily: F.m, fontSize: 11, color: C.dim, marginTop: 6 }}>
            {groups ? "Groups drawn!" : playoffTeams.length >= 32 ? "Group draw coming soon..." : "Finalizing playoff field..."}
          </div>
        </Card>

        {/* Lottery Replay */}
        {lotteryData?.drawn?.length > 0 && (
          <Card style={{ padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5 }}>
                🎲 Wildcard Lottery
              </div>
              {!lotteryAnimating && lotteryReplay?.step !== "done" && (
                <button onClick={runLotteryReplay}
                  style={{
                    padding: "5px 12px", borderRadius: 6, border: "none",
                    background: C.amber, color: C.bg, fontFamily: F.b, fontSize: 10, fontWeight: 700, cursor: "pointer",
                  }}>
                  ▶ Watch Lottery
                </button>
              )}
              {lotteryReplay?.step === "done" && (
                <button onClick={() => { setLotteryReplay(null); }}
                  style={{
                    padding: "5px 12px", borderRadius: 6, border: `1px solid ${C.border}`,
                    background: "transparent", color: C.muted, fontFamily: F.m, fontSize: 10, cursor: "pointer",
                  }}>
                  🔄 Replay
                </button>
              )}
            </div>

            {/* Animating lottery */}
            {lotteryAnimating && lotteryReplay && (
              <div style={{ textAlign: "center", padding: "8px 0" }}>
                <div style={{ fontFamily: F.b, fontSize: 12, color: C.amber, marginBottom: 8 }}>
                  🎲 Drawing {lotteryReplay.step === "wc1" ? "Wildcard 1" : "Wildcard 2"}...
                </div>
                {lotteryReplay.showing && (
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px",
                    background: `${C.amber}10`, borderRadius: 10, transition: "all 0.1s",
                  }}>
                    <span style={{ fontSize: 16 }}>🎲</span>
                    <span style={{ fontFamily: F.b, fontSize: 14, color: C.amber }}>
                      {lotteryData.pool_names?.[lotteryReplay.showing] || "..."}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* WC1 result */}
            {lotteryReplay?.step === "wc1_result" && (
              <div style={{
                display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
                background: `${C.amber}10`, border: `1px solid ${C.amber}30`, borderRadius: 10, marginBottom: 8,
              }}>
                <Badge color={C.amber} style={{ fontSize: 12, padding: "4px 8px" }}>WC1</Badge>
                <TeamAvatar name={lotteryData.pool_names?.[lotteryReplay.showing] || "?"} size={28} />
                <span style={{ flex: 1, fontFamily: F.b, fontSize: 14, fontWeight: 700, color: C.amber }}>
                  {lotteryData.pool_names?.[lotteryReplay.showing] || "?"}
                </span>
                <span style={{ fontSize: 20 }}>🎉</span>
              </div>
            )}

            {/* Final results */}
            {(lotteryReplay?.step === "wc2_result" || lotteryReplay?.step === "done" || !lotteryReplay) && lotteryData.drawn.map((wc, i) => (
              <div key={wc.team_id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                background: `${C.amber}08`, border: `1px solid ${C.amber}20`, borderRadius: 10,
                marginBottom: i < lotteryData.drawn.length - 1 ? 6 : 0,
              }}>
                <Badge color={C.amber} style={{ fontSize: 11, padding: "3px 7px" }}>{wc.label}</Badge>
                <TeamAvatar name={lotteryData.pool_names?.[wc.team_id] || "?"} size={24} />
                <span style={{ flex: 1, fontFamily: F.b, fontSize: 13, fontWeight: 600, color: C.text }}>
                  {lotteryData.pool_names?.[wc.team_id] || "?"}
                </span>
              </div>
            ))}

            {/* Pool info */}
            {lotteryData.pool && !lotteryAnimating && (
              <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim, marginTop: 8, textAlign: "center" }}>
                Drawn from a pool of {lotteryData.pool.length} eligible teams
              </div>
            )}
          </Card>
        )}

        {/* Qualified teams by division */}
        {Object.entries(qualifiedByDiv).sort(([a], [b]) => a.localeCompare(b)).map(([divCode, teams]) => (
          <Card key={divCode} style={{ padding: "10px 14px", marginBottom: 8 }}>
            <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
              {divLabel(divCode)}
            </div>
            {teams.sort((a, b) => {
              const aNum = parseInt(a.seed_label?.replace(/[^0-9]/g, "")) || 99;
              const bNum = parseInt(b.seed_label?.replace(/[^0-9]/g, "")) || 99;
              return aNum - bNum;
            }).map((t, i) => (
              <div key={t.team_id} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "5px 0",
                borderTop: i > 0 ? `1px solid ${C.border}` : "none",
              }}>
                <Badge color={seedColor(t.seed_label)} style={{ fontSize: 9, padding: "2px 6px", minWidth: 30, textAlign: "center" }}>
                  {t.seed_label}
                </Badge>
                <span style={{ fontFamily: F.b, fontSize: 12, color: C.text }}>{t.seed_label}</span>
              </div>
            ))}
          </Card>
        ))}

        <Footer />
      </div>
    );
  }

  // ── PHASE 3: Groups drawn ──
  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
        {[
          { id: "groups", label: "⚔️ Groups" },
          { id: "bracket", label: "🏆 Bracket" },
        ].map(t => (
          <button key={t.id} onClick={() => setPlayoffTab(t.id)}
            style={{
              flex: 1, padding: "9px 0", borderRadius: 8, border: "none",
              background: playoffTab === t.id ? `${C.amber}15` : "transparent",
              color: playoffTab === t.id ? C.amber : C.muted,
              fontFamily: F.b, fontSize: 12, fontWeight: 600, cursor: "pointer",
              transition: "all 0.15s",
              borderBottom: playoffTab === t.id ? `2px solid ${C.amber}` : `2px solid transparent`,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── GROUPS TAB ── */}
      {playoffTab === "groups" && (
        <>
          {/* Hero */}
          <Card style={{
            padding: "16px", marginBottom: 14, textAlign: "center",
            background: `linear-gradient(135deg, ${C.surface}, ${C.amber}06)`,
            border: `1px solid ${C.amber}15`,
          }}>
            <div style={{ fontSize: 28, marginBottom: 4 }}>⚔️</div>
            <div style={{ fontFamily: F.d, fontSize: 17, fontWeight: 800, marginBottom: 4 }}>
              Group Stage
            </div>
            <div style={{ fontFamily: F.m, fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
              {Object.values(groups).flat().length} teams drawn into {Object.keys(groups).length} groups · Top 2 advance to bracket
            </div>
            {!showDraw ? (
              <button onClick={runDrawAnimation}
                style={{
                  marginTop: 12, padding: "8px 20px", borderRadius: 8, border: "none",
                  background: C.amber, color: C.bg, fontFamily: F.b, fontSize: 11,
                  fontWeight: 700, cursor: "pointer",
                }}>
                ▶ Watch the Draw
              </button>
            ) : drawComplete ? (
              <button onClick={() => { setShowDraw(false); setDrawComplete(false); }}
                style={{
                  marginTop: 12, padding: "7px 16px", borderRadius: 8,
                  border: `1px solid ${C.border}`, background: "transparent",
                  color: C.muted, fontFamily: F.b, fontSize: 10, cursor: "pointer",
                }}>
                🔄 Replay Draw
              </button>
            ) : (
              <div style={{ marginTop: 12, fontFamily: F.b, fontSize: 12, color: C.amber }}>
                🎲 Drawing groups...
              </div>
            )}
          </Card>

          {/* Lottery replay in groups phase */}
          {lotteryData?.drawn?.length > 0 && (
            <Card style={{ padding: "12px 14px", marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>
                  🎲 Wildcard Lottery
                </div>
                {!lotteryAnimating && lotteryReplay?.step !== "done" && (
                  <button onClick={runLotteryReplay}
                    style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${C.border}`, background: "transparent", color: C.amber, fontFamily: F.m, fontSize: 10, cursor: "pointer" }}>
                    ▶ Watch
                  </button>
                )}
                {lotteryReplay?.step === "done" && (
                  <button onClick={() => { setLotteryReplay(null); }}
                    style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${C.border}`, background: "transparent", color: C.dim, fontFamily: F.m, fontSize: 10, cursor: "pointer" }}>
                    🔄 Replay
                  </button>
                )}
              </div>
              {lotteryData.drawn.map(wc => (
                <div key={wc.team_id} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "5px 0",
                  borderTop: `1px solid ${C.border}`,
                }}>
                  <Badge color={C.blue} style={{ fontSize: 9, padding: "2px 6px", minWidth: 30, textAlign: "center" }}>
                    {wc.label}
                  </Badge>
                  <TeamAvatar name={lotteryData.pool_names?.[wc.team_id] || "?"} size={20} />
                  <span style={{ fontFamily: F.b, fontSize: 12, color: C.text }}>
                    {lotteryData.pool_names?.[wc.team_id] || "?"}
                  </span>
                </div>
              ))}
              {/* Inline lottery animation */}
              {lotteryAnimating && lotteryReplay && (
                <div style={{ textAlign: "center", padding: "10px 0 4px" }}>
                  <div style={{ fontFamily: F.b, fontSize: 11, color: C.amber, marginBottom: 6 }}>
                    🎲 {lotteryReplay.step === "wc1" || lotteryReplay.step === "wc1_result" ? "Wildcard 1" : "Wildcard 2"}
                  </div>
                  {lotteryReplay.showing && (
                    <Badge color={C.amber} style={{ fontSize: 12, padding: "4px 10px" }}>
                      {lotteryData.pool_names?.[lotteryReplay.showing] || "..."}
                    </Badge>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* Groups grid */}
          {Object.keys(groupMatches).length === 0 ? (
            // No matches yet — show teams by seed
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, minWidth: 0 }}>
              {Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([groupName, teamList]) => (
                <Card key={groupName} style={{
                  padding: "10px 12px", minWidth: 0, overflow: "hidden",
                  border: `1px solid ${showDraw && !drawComplete ? C.amber + "25" : C.border}`,
                  transition: "border-color 0.15s",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{
                      fontFamily: F.d, fontSize: 13, fontWeight: 800,
                      width: 26, height: 26, borderRadius: 13,
                      background: `${C.amber}18`, color: C.amber,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {groupName}
                    </div>
                    <span style={{ fontFamily: F.m, fontSize: 9, color: C.dim }}>Group {groupName}</span>
                  </div>
                  {[...teamList].sort((a, b) => {
                    const aWC = a.seed_label?.startsWith("WC") ? 1 : 0;
                    const bWC = b.seed_label?.startsWith("WC") ? 1 : 0;
                    if (aWC !== bWC) return aWC - bWC;
                    const aNum = parseInt(a.seed_label?.replace(/[^0-9]/g, "")) || 99;
                    const bNum = parseInt(b.seed_label?.replace(/[^0-9]/g, "")) || 99;
                    return aNum - bNum;
                  }).map((t, i) => (
                    <div key={t.team_id} style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "5px 0",
                      borderTop: i > 0 ? `1px solid ${C.border}` : "none",
                      cursor: "pointer",
                    }}
                    onClick={() => goPage("teams", { teamId: t.team_id })}>
                      <TeamAvatar name={t.team_name} size={20} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontFamily: F.b, fontSize: 11, color: C.text, fontWeight: 500,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {t.team_name}
                        </div>
                        <div style={{ fontFamily: F.m, fontSize: 9, color: C.dim }}>
                          {divLabel(t.seed_label?.replace(/[0-9]/g, ""))}
                        </div>
                      </div>
                      <Badge color={seedColor(t.seed_label)} style={{ fontSize: 8, padding: "1px 5px" }}>
                        {t.seed_label}
                      </Badge>
                    </div>
                  ))}
                </Card>
              ))}
            </div>
          ) : (
            // Matches exist — show standings + results per group
            <div>
              {Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([groupName, teamList]) => {
                const gMatches = groupMatches[groupName] || [];
                const completed = gMatches.filter(m => m.status === "completed").length;
                const court = teamList[0]?.court;

                // Calculate standings with admin overrides
                const standingsArr = computeGroupStandings(teamList, gMatches, groupOverrides[groupName]);
                const hasCutlineTie = standingsArr.some(s => s.crossesCutline) && !groupOverrides[groupName];

                return (
                  <Card key={groupName} style={{ padding: "12px 14px", marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{
                          fontFamily: F.d, fontSize: 14, fontWeight: 800,
                          width: 28, height: 28, borderRadius: 14,
                          background: `${C.amber}18`, color: C.amber,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {groupName}
                        </div>
                        <div>
                          <div style={{ fontFamily: F.b, fontSize: 12, color: C.text }}>Group {groupName}</div>
                          {court && <div style={{ fontFamily: F.m, fontSize: 9, color: C.dim }}>Court {court}</div>}
                        </div>
                      </div>
                      <Badge color={completed === gMatches.length && completed > 0 ? C.green : C.amber} style={{ fontSize: 9 }}>
                        {completed}/{gMatches.length}
                      </Badge>
                    </div>

                    {/* Standings table */}
                    <div style={{ marginBottom: completed > 0 ? 10 : 0 }}>
                      <div style={{ display: "flex", gap: 4, marginBottom: 4, padding: "0 4px" }}>
                        <span style={{ width: 16 }} />
                        <span style={{ flex: 1, fontFamily: F.m, fontSize: 8, color: C.dim, textTransform: "uppercase" }}>Team</span>
                        <span style={{ width: 28, fontFamily: F.m, fontSize: 8, color: C.dim, textAlign: "center" }}>W</span>
                        <span style={{ width: 28, fontFamily: F.m, fontSize: 8, color: C.dim, textAlign: "center" }}>L</span>
                      </div>
                      {(completed > 0 ? standingsArr : teamList.map(t => ({ team_id: t.team_id, team_name: t.team_name, seed_label: t.seed_label, w: 0, l: 0, crossesCutline: false }))).map((s, idx) => {
                        const groupDone = completed === gMatches.length && completed > 0;
                        const advances = groupDone && idx < 2 && !hasCutlineTie;
                        const eliminated = groupDone && idx >= 2 && !hasCutlineTie;
                        return (
                        <div key={s.team_id} style={{
                          display: "flex", alignItems: "center", gap: 4, padding: "5px 4px",
                          borderTop: idx > 0 ? `1px solid ${C.border}` : "none",
                          background: advances ? `${C.green}08` : "transparent",
                          borderRadius: advances ? 4 : 0,
                          cursor: "pointer",
                        }}
                        onClick={() => goPage("teams", { teamId: s.team_id })}>
                          <TeamAvatar name={s.team_name} size={18} />
                          <span style={{
                            flex: 1, fontFamily: F.b, fontSize: 11,
                            color: advances ? C.green : eliminated ? C.muted : C.text,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {advances ? "✓ " : ""}{s.team_name}
                          </span>
                          <span style={{ width: 28, fontFamily: F.d, fontSize: 11, color: eliminated ? C.dim : C.text, textAlign: "center", fontWeight: 700 }}>{s.w}</span>
                          <span style={{ width: 28, fontFamily: F.d, fontSize: 11, color: C.dim, textAlign: "center" }}>{s.l}</span>
                        </div>
                        );
                      })}
                      {hasCutlineTie && (
                        <div style={{ marginTop: 6, padding: "4px 6px", borderRadius: 4, background: `${C.amber}10`, border: `1px solid ${C.amber}20` }}>
                          <span style={{ fontFamily: F.m, fontSize: 9, color: C.amber }}>
                            ⚡ Tiebreaker pending
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Match results */}
                    {gMatches.length > 0 && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                        <div style={{ fontFamily: F.m, fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                          Matches
                        </div>
                        {gMatches.map((m, idx) => {
                          const t1Wins = m.winner_id && String(m.winner_id) === String(m.team1_id);
                          const t2Wins = m.winner_id && String(m.winner_id) === String(m.team2_id);
                          return (
                          <div key={m.match_number} style={{
                            display: "flex", alignItems: "center", gap: 4, padding: "4px 0",
                            borderTop: idx > 0 ? `1px solid ${C.border}` : "none",
                          }}>
                            <span style={{ fontFamily: F.m, fontSize: 8, color: C.dim, width: 12, textAlign: "center" }}>{m.match_number}</span>
                            <span style={{
                              flex: 1, fontFamily: F.b, fontSize: 10,
                              color: t1Wins ? C.green : m.status === "completed" ? C.muted : C.text,
                              fontWeight: t1Wins ? 700 : 400,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {t1Wins && <span style={{ fontSize: 8, marginRight: 2 }}>W</span>}
                              {m.team1_name}
                            </span>
                            {m.status === "completed" ? (
                              m.team1_score != null ? (
                                <span style={{ fontFamily: F.d, fontSize: 10, fontWeight: 700, color: C.text, minWidth: 36, textAlign: "center" }}>
                                  {m.team1_score}-{m.team2_score}
                                </span>
                              ) : (
                                <span style={{ fontFamily: F.m, fontSize: 8, color: C.green, minWidth: 36, textAlign: "center" }}>✓</span>
                              )
                            ) : (
                              <span style={{ fontFamily: F.m, fontSize: 9, color: C.dim, minWidth: 36, textAlign: "center" }}>vs</span>
                            )}
                            <span style={{
                              flex: 1, fontFamily: F.b, fontSize: 10, textAlign: "right",
                              color: t2Wins ? C.green : m.status === "completed" ? C.muted : C.text,
                              fontWeight: t2Wins ? 700 : 400,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {m.team2_name}
                              {t2Wins && <span style={{ fontSize: 8, marginLeft: 2 }}>W</span>}
                            </span>
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── BRACKET TAB ── */}
      {playoffTab === "bracket" && (
        <>
          <Card style={{
            padding: "20px 16px", textAlign: "center", marginBottom: 14,
            background: `linear-gradient(135deg, ${C.surface}, ${C.amber}06)`,
            border: `1px solid ${C.amber}15`,
          }}>
            <div style={{ fontSize: 28, marginBottom: 4 }}>🏆</div>
            <div style={{ fontFamily: F.d, fontSize: 17, fontWeight: 800, marginBottom: 4 }}>
              Championship Bracket
            </div>
            <div style={{ fontFamily: F.m, fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
              16-team single elimination · Group winners vs runners-up
            </div>
          </Card>

          {(bracketMatches["R16"] || []).length === 0 ? (
            <Card style={{ padding: "24px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🏆</div>
              <div style={{ fontFamily: F.b, fontSize: 13, color: C.text, marginBottom: 6 }}>
                Bracket Coming Soon
              </div>
              <div style={{ fontFamily: F.m, fontSize: 11, color: C.dim, lineHeight: 1.5 }}>
                The championship bracket will be generated once all group stage matches have been completed. Top 2 teams from each group advance to the Round of 16.
              </div>
            </Card>
          ) : (
            <>
            {/* Champion banner */}
            {(() => {
              const fin = (bracketMatches["FIN"] || []).find(m => m.status === "completed");
              if (!fin) return null;
              const champName = String(fin.winner_id) === String(fin.team1_id) ? fin.team1_name : fin.team2_name;
              return (
                <Card style={{
                  padding: "20px 16px", textAlign: "center", marginBottom: 14,
                  background: `linear-gradient(135deg, ${C.surface}, ${C.amber}15)`,
                  border: `1px solid ${C.amber}30`,
                }}>
                  <div style={{ fontSize: 36, marginBottom: 6 }}>🏆</div>
                  <div style={{ fontFamily: F.d, fontSize: 18, fontWeight: 800, color: C.amber, marginBottom: 4 }}>
                    {champName}
                  </div>
                  <div style={{ fontFamily: F.m, fontSize: 12, color: C.muted }}>
                    Season {activeSeason?.number || ""} Champions
                  </div>
                </Card>
              );
            })()}
            {["R16", "QF", "SF", "3RD", "FIN"].map(round => {
              const matches = (bracketMatches[round] || []).sort((a, b) => a.match_number - b.match_number);
              if (matches.length === 0) return null;
              const roundNames = { R16: "Round of 16", QF: "Quarterfinals", SF: "Semifinals", FIN: "Final", "3RD": "3rd Place" };
              return (
                <div key={round} style={{ marginBottom: 14 }}>
                  <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
                    {roundNames[round]}
                  </div>
                  {matches.map(m => {
                    const r16L = round === "R16" ? R16_LABELS[m.match_number] : null;
                    const t1Wins = m.winner_id && String(m.winner_id) === String(m.team1_id);
                    const t2Wins = m.winner_id && String(m.winner_id) === String(m.team2_id);
                    const mIcon = (teamId) => {
                      if (round === "FIN" && m.status === "completed") return String(m.winner_id) === String(teamId) ? "🏆 " : "🥈 ";
                      if (["SF", "FIN", "3RD"].includes(round)) return "🎖️ ";
                      return "";
                    };
                    return (
                    <Card key={m.match_number} style={{ padding: "10px 12px", marginBottom: 6 }}>
                      {m.court && (
                        <div style={{ fontFamily: F.m, fontSize: 9, color: C.dim, marginBottom: 4 }}>
                          Court {m.court}{r16L ? ` · ${r16L.t1} vs ${r16L.t2}` : ""}
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{
                          flex: 1, padding: "6px 8px", borderRadius: 6, textAlign: "center",
                          background: t1Wins ? `${C.green}10` : "transparent",
                          border: `1px solid ${t1Wins ? C.green + "25" : C.border}`,
                        }}>
                          {r16L && !m.court && <div style={{ fontFamily: F.d, fontSize: 9, color: C.amber, fontWeight: 700, marginBottom: 2 }}>{r16L.t1}</div>}
                          <div style={{
                            fontFamily: F.b, fontSize: 11, fontWeight: t1Wins ? 700 : 400,
                            color: t1Wins ? C.green : m.team1_name ? C.text : C.dim,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {m.team1_id ? mIcon(m.team1_id) : ""}{m.team1_name || "TBD"}
                          </div>
                          {m.team1_score != null && (
                            <div style={{ fontFamily: F.d, fontSize: 14, fontWeight: 700, color: C.text }}>{m.team1_score}</div>
                          )}
                        </div>
                        <span style={{ fontFamily: F.d, fontSize: 11, color: C.dim, fontWeight: 700 }}>
                          {m.status === "completed" ? "" : "vs"}
                        </span>
                        <div style={{
                          flex: 1, padding: "6px 8px", borderRadius: 6, textAlign: "center",
                          background: t2Wins ? `${C.green}10` : "transparent",
                          border: `1px solid ${t2Wins ? C.green + "25" : C.border}`,
                        }}>
                          {r16L && !m.court && <div style={{ fontFamily: F.d, fontSize: 9, color: C.amber, fontWeight: 700, marginBottom: 2 }}>{r16L.t2}</div>}
                          <div style={{
                            fontFamily: F.b, fontSize: 11, fontWeight: t2Wins ? 700 : 400,
                            color: t2Wins ? C.green : m.team2_name ? C.text : C.dim,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {m.team2_id ? mIcon(m.team2_id) : ""}{m.team2_name || "TBD"}
                          </div>
                          {m.team2_score != null && (
                            <div style={{ fontFamily: F.d, fontSize: 14, fontWeight: 700, color: C.text }}>{m.team2_score}</div>
                          )}
                        </div>
                      </div>
                    </Card>
                    );
                  })}
                </div>
              );
            })}
            </>
          )}
        </>
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
      q("teams", "primary_team_id=is.null&order=recrec_elo.desc&limit=500"),
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
          <h3 style={{ fontFamily: F.d, fontSize: 20, color: C.text, margin: 0 }}>
            {t.name}{isChamp && <span title={`${t.championships || t.championship_count} championship${(t.championships || t.championship_count) > 1 ? "s" : ""}`} style={{ fontSize: 18, cursor: "default", marginLeft: 6 }}>🏆</span>}
          </h3>
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
              <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
                {[
                  ...(t.league_titles > 0 ? [["🏆", t.league_titles, "League", "#fbbf24", "league"]] : []),
                  ...(t.banquet_count > 0 ? [["🎖️", t.banquet_count, "Banquet*", C.amber, "banquet"]] : []),
                  ...(t.playoff_appearances > 0 ? [["🏅", t.playoff_appearances, "Playoffs*", C.muted, "playoffs"]] : []),
                  ...(t.division_titles > 0 ? [["🥇", t.division_titles, "Division*", C.blue, "division"]] : []),
                ].map(([icon, val, label, color, histTab]) => (
                  <div key={label} onClick={() => goPage("fame", { tab: histTab })} style={{ textAlign: "center", background: C.surface, borderRadius: 10, padding: "10px 8px", flex: 1, minWidth: 0, cursor: "pointer" }}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
                    <div style={{ fontFamily: F.d, fontSize: 20, fontWeight: 700, color }}>{val}</div>
                    <div style={{ fontFamily: F.m, fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
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
  const [showAllLB, setShowAllLB] = useState(false);

  const [aliasTeams, setAliasTeams] = useState([]);

  useEffect(() => { setShowAllLB(false); }, [tab]);

  useEffect(() => {
    Promise.all([
      q("championships", "select=*,teams!championships_team_id_fkey(name),seasons(name,start_date),divisions(name,day_of_week,level)&order=season_id.desc"),
      q("playoff_appearances", "select=*,teams:team_id(name),seasons:season_id(name,start_date)&order=season_id.desc"),
      q("divisions", "select=id,name,day_of_week,level,season_id,seasons(name,start_date)&level=neq.party&order=season_id.desc,day_of_week,level"),
      q("teams", "select=id,name,primary_team_id"),
    ]).then(([cd, pd, dd, at]) => {
      setChamps(cd || []);
      setPlayoffData(pd || []);
      setAllDivisions(dd || []);
      setAliasTeams(at || []);
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

  // Team alias map: old name → current name (built from DB)
  const teamNameById = {};
  aliasTeams.forEach(t => { teamNameById[t.id] = t.name; });
  const TEAM_ALIASES = {};
  const aliasNamesMap = {}; // primary name → [alias names]
  aliasTeams.filter(t => t.primary_team_id).forEach(at => {
    const primaryName = teamNameById[at.primary_team_id];
    if (primaryName && at.name !== primaryName) {
      TEAM_ALIASES[at.name] = primaryName;
      if (!aliasNamesMap[primaryName]) aliasNamesMap[primaryName] = [];
      aliasNamesMap[primaryName].push(at.name);
    }
  });
  const ALIAS_LABELS = {};
  Object.entries(aliasNamesMap).forEach(([primary, names]) => {
    ALIAS_LABELS[primary] = names.length === 1 ? `formerly ${names[0]}` : `formerly ${names[0]} + ${names.length - 1} other${names.length > 2 ? "s" : ""}`;
  });

  // Playoff leaderboard — merge playoff_appearances + championships (all banquet/finalist/champ = playoff appearance)
  const playoffLB = {};
  const playoffSeenKey = new Set(); // dedupe team+season

  const addToPlayoffLB = (rawName, teamId, seasonName, seasonDate) => {
    const n = TEAM_ALIASES[rawName] || rawName;
    const key = `${n}__${seasonName}`;
    if (playoffSeenKey.has(key)) return;
    playoffSeenKey.add(key);
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

  const roundLabel = { champion: "🏆 Champion", finalist: "🥈 Final", banquet: "🏅 Banquet", qualified: "☆ Qualified", wildcard: "★ Wildcard", round_2: "Round 2", round_1: "Round 1" };

  const dataNote = tab === "banquet" ? "Banquet data is incomplete for seasons before Winter 2023. Help us fill in the gaps!"
    : tab === "playoffs" ? "Playoffs data is incomplete. Help us fill in the gaps!"
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
              {sortedPlayoffLB.slice(0, showAllLB ? sortedPlayoffLB.length : 15).map((t, i, arr) => (
                <div key={t.name} onClick={() => goPage("teams", { teamId: t.teamId })} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "13px 18px", cursor: "pointer",
                  borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none",
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
              {!showAllLB && sortedPlayoffLB.length > 15 && (
                <button onClick={() => setShowAllLB(true)} style={{ width: "100%", padding: "12px 0", border: "none", borderTop: `1px solid ${C.border}`, background: "transparent", color: C.amber, fontFamily: F.m, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Show all ({sortedPlayoffLB.length})</button>
              )}
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
                {sortedLB.slice(0, showAllLB ? sortedLB.length : 15).map((t, i, arr) => (
                  <div key={t.name} onClick={() => goPage("teams", { teamId: t.teamId })} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "13px 18px", cursor: "pointer",
                    borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none",
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
                {!showAllLB && sortedLB.length > 15 && (
                  <button onClick={() => setShowAllLB(true)} style={{ width: "100%", padding: "12px 0", border: "none", borderTop: `1px solid ${C.border}`, background: "transparent", color: C.amber, fontFamily: F.m, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Show all ({sortedLB.length})</button>
                )}
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

// ══════════════════════════════════════
// ─── ADMIN POSTSEASON TAB ───
// ══════════════════════════════════════

function AdminPostseasonTab({ seasonId, divisions, seasonData: activeSeason }) {
  const [standings, setStandings] = useState({});  // divId -> [{team_id, team_name, wins, losses}]
  const [existingChamps, setExistingChamps] = useState([]); // championships for this season
  const [existingPlayoffs, setExistingPlayoffs] = useState([]); // playoff_appearances for this season
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // "div-<id>" or "playoff-<id>" while saving
  const [confirmedDivWinners, setConfirmedDivWinners] = useState({}); // divId -> team_id
  const [confirmedPlayoffs, setConfirmedPlayoffs] = useState({}); // divId -> [team_ids]
  const [wildcards, setWildcards] = useState([]); // [team_id, team_id]
  const [seedLabels, setSeedLabels] = useState({}); // team_id -> "MH1" etc
  const [expandedDiv, setExpandedDiv] = useState(null);
  const [playoffSpotsMap, setPlayoffSpotsMap] = useState({}); // divId -> number
  const [lotteryPool, setLotteryPool] = useState(new Set()); // team_ids in lottery
  const [lotteryDrawn, setLotteryDrawn] = useState([]); // drawn team_ids
  const [lotteryAnimating, setLotteryAnimating] = useState(false);
  const [lotteryMode, setLotteryMode] = useState("pool"); // "pool" | "drawn" | "manual"
  // Group draw state
  const [groups, setGroups] = useState(null); // { A: [{team_id, team_name, seed_label, division_id}], ... }
  const [groupDrawStep, setGroupDrawStep] = useState("idle"); // "idle" | "animating" | "done"
  const [drawingTier, setDrawingTier] = useState(null); // current tier being drawn
  const [drawingTeam, setDrawingTeam] = useState(null); // current team being placed
  const [existingGroups, setExistingGroups] = useState(null); // loaded from DB
  const [courtAssignments, setCourtAssignments] = useState({}); // groupName -> court number
  const [groupMatches, setGroupMatches] = useState({}); // groupName -> [{match_number, team1_id, team1_name, team2_id, team2_name, ...}]
  const [bracketMatches, setBracketMatches] = useState({}); // "R16"->[], "QF"->[], "SF"->[], "FIN"->[], "3RD"->[]
  const [groupOverrides, setGroupOverrides] = useState({}); // groupName -> [team_id ordered]
  const [editingScore, setEditingScore] = useState(null); // {groupName, matchNumber}
  const [scoreInputs, setScoreInputs] = useState({ team1: "", team2: "" });
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);
  const DEFAULT_PLAYOFF_SPOTS = 5;
  const getPlayoffSpots = (divId) => playoffSpotsMap[divId] || DEFAULT_PLAYOFF_SPOTS;

  // Generate seed label: MH1 = Monday Hammer 1st, TC3 = Tuesday Cherry 3rd, WC1 = Wildcard 1
  const makeSeedLabel = (div, seedNum) => {
    const dayAbbr = { monday: "M", tuesday: "T", wednesday: "W", thursday: "Th", friday: "F", saturday: "Sa", sunday: "Su" };
    const lvlAbbr = { hammer: "H", cherry: "C", pilot: "P", party: "Pa" };
    return `${dayAbbr[div.day_of_week] || "?"}${lvlAbbr[div.level] || "?"}${seedNum}`;
  };

  useEffect(() => {
    if (!seasonId) return;
    (async () => {
      try {
        // Load playoff_spots from divisions
        const spotsMap = {};
        divisions.forEach(d => { if (d.playoff_spots) spotsMap[d.id] = d.playoff_spots; });
        setPlayoffSpotsMap(spotsMap);

        // Load standings for all divisions
        const divs = divisions.filter(d => d.has_data);
        const standingsMap = {};
        for (const d of divs) {
          const ts = await q("team_seasons", `division_id=eq.${d.id}&select=team_id,wins,losses,teams(id,name)&order=wins.desc,losses.asc`);
          standingsMap[d.id] = (ts || []).map((t, i) => ({
            team_id: t.team_id,
            team_name: t.teams?.name || "Unknown",
            wins: t.wins || 0,
            losses: t.losses || 0,
            rank: i + 1,
          }));
        }
        setStandings(standingsMap);

        // Load existing championships + playoff_appearances
        const [champs, playoffs] = await Promise.all([
          q("championships", `season_id=eq.${seasonId}&select=team_id,type`),
          q("playoff_appearances", `season_id=eq.${seasonId}&select=team_id,round_reached,seed_label`),
        ]);
        setExistingChamps(champs || []);
        setExistingPlayoffs(playoffs || []);

        // Pre-populate confirmed states from existing data
        const divWinners = {};
        (champs || []).filter(c => c.type === "division").forEach(c => {
          // Find which division this team is in
          for (const [divId, teams] of Object.entries(standingsMap)) {
            if (teams.find(t => t.team_id === c.team_id)) {
              divWinners[divId] = c.team_id;
              break;
            }
          }
        });
        setConfirmedDivWinners(divWinners);

        const divPlayoffs = {};
        const playoffTeamIds = new Set((playoffs || []).map(p => p.team_id));
        for (const [divId, teams] of Object.entries(standingsMap)) {
          const qualified = teams.filter(t => playoffTeamIds.has(t.team_id)).map(t => t.team_id);
          if (qualified.length > 0) divPlayoffs[divId] = qualified;
        }
        setConfirmedPlayoffs(divPlayoffs);

        // Check for wildcards (playoff teams not in top 5 of any division)
        const wcTeams = [];
        (playoffs || []).forEach(p => {
          let inTopN = false;
          for (const [, teams] of Object.entries(standingsMap)) {
            const idx = teams.findIndex(t => t.team_id === p.team_id);
            if (idx >= 0 && idx < DEFAULT_PLAYOFF_SPOTS) { inTopN = true; break; }
          }
          if (!inTopN) wcTeams.push(p.team_id);
        });
        setWildcards(wcTeams);

        // Populate seed labels from existing data
        const labels = {};
        (playoffs || []).forEach(p => {
          if (p.seed_label) labels[p.team_id] = p.seed_label;
        });
        setSeedLabels(labels);

        // Load existing group draw
        try {
          const grps = await q("playoff_groups", `season_id=eq.${seasonId}&select=group_name,team_id,team_name,seed_label,division_id,court&order=group_name,position`);
          if (grps?.length > 0) {
            const groupMap = {};
            const courts = {};
            grps.forEach(g => {
              if (!groupMap[g.group_name]) groupMap[g.group_name] = [];
              groupMap[g.group_name].push(g);
              if (g.court && !courts[g.group_name]) courts[g.group_name] = g.court;
            });
            setExistingGroups(groupMap);
            setGroups(groupMap);
            setCourtAssignments(courts);
            setGroupDrawStep("done");

            // Load group matches + bracket
            const gm = await q("group_matches", `season_id=eq.${seasonId}&order=group_name,match_number`);
            if (gm?.length > 0) {
              const matchMap = {};
              const bracketMap = {};
              const bracketRounds = ["R16", "QF", "SF", "FIN", "3RD"];
              gm.forEach(m => {
                if (bracketRounds.includes(m.group_name)) {
                  if (!bracketMap[m.group_name]) bracketMap[m.group_name] = [];
                  bracketMap[m.group_name].push(m);
                } else {
                  if (!matchMap[m.group_name]) matchMap[m.group_name] = [];
                  matchMap[m.group_name].push(m);
                }
              });
              setGroupMatches(matchMap);
              setBracketMatches(bracketMap);
            }

            // Load group overrides
            const seasonInfo = await q("seasons", `id=eq.${seasonId}&select=group_overrides`);
            if (seasonInfo?.[0]?.group_overrides) setGroupOverrides(seasonInfo[0].group_overrides);
          }
        } catch {}

      } catch (e) { console.error(e); setError(e.message); }
      setLoading(false);
    })();
  }, [seasonId, divisions.length]);

  const confirmDivisionWinner = async (divId, teamId) => {
    setSaving(`div-${divId}`);
    setError(null);
    try {
      const div = divisions.find(d => d.id === divId);
      const label = div ? makeSeedLabel(div, 1) : "?1";

      // Clean slate: remove any existing division championship for this division's teams
      const divTeamIds = (standings[divId] || []).map(t => t.team_id);
      for (const tid of divTeamIds) {
        await qAuth("championships", `team_id=eq.${tid}&season_id=eq.${seasonId}&type=eq.division`, "DELETE").catch(() => {});
      }

      // Insert new championship
      await qAuth("championships", "", "POST", {
        team_id: teamId,
        season_id: seasonId,
        division_id: divId,
        type: "division",
      });

      // Auto-add as playoff team #1 seed — delete existing first to avoid duplicates
      await qAuth("playoff_appearances", `team_id=eq.${teamId}&season_id=eq.${seasonId}`, "DELETE").catch(() => {});
      await qAuth("playoff_appearances", "", "POST", {
        team_id: teamId,
        season_id: seasonId,
        round_reached: "qualified",
        seed_label: label,
      });

      // Update all state at once
      setConfirmedDivWinners(prev => ({ ...prev, [divId]: teamId }));
      setConfirmedPlayoffs(prev => ({
        ...prev,
        [divId]: [...(prev[divId] || []).filter(id => id !== teamId), teamId],
      }));
      setExistingChamps(prev => [
        ...prev.filter(c => !(c.type === "division" && divTeamIds.includes(c.team_id))),
        { team_id: teamId, type: "division" },
      ]);
      setExistingPlayoffs(prev => [
        ...prev.filter(p => p.team_id !== teamId),
        { team_id: teamId, round_reached: "qualified", seed_label: label },
      ]);
      setSeedLabels(prev => ({ ...prev, [teamId]: label }));
      setSuccess(`Division winner confirmed! (${label})`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) { setError(e.message); }
    setSaving(null);
  };

  const confirmPlayoffTeam = async (divId, teamId) => {
    setSaving(`playoff-${teamId}`);
    setError(null);
    try {
      const div = divisions.find(d => d.id === divId);
      const divTeams = standings[divId] || [];
      const seedNum = divTeams.findIndex(t => t.team_id === teamId) + 1;
      const label = div ? makeSeedLabel(div, seedNum) : `?${seedNum}`;

      // Delete first to avoid duplicates
      await qAuth("playoff_appearances", `team_id=eq.${teamId}&season_id=eq.${seasonId}`, "DELETE").catch(() => {});
      await qAuth("playoff_appearances", "", "POST", {
        team_id: teamId,
        season_id: seasonId,
        round_reached: "qualified",
        seed_label: label,
      });

      setConfirmedPlayoffs(prev => ({
        ...prev,
        [divId]: [...(prev[divId] || []).filter(id => id !== teamId), teamId],
      }));
      setExistingPlayoffs(prev => [
        ...prev.filter(p => p.team_id !== teamId),
        { team_id: teamId, round_reached: "qualified", seed_label: label },
      ]);
      setSeedLabels(prev => ({ ...prev, [teamId]: label }));
      setSuccess(`Playoff team confirmed! (${label})`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) { setError(e.message); }
    setSaving(null);
  };

  const removePlayoffTeam = async (divId, teamId) => {
    setSaving(`playoff-${teamId}`);
    setError(null);
    try {
      await qAuth("playoff_appearances", `team_id=eq.${teamId}&season_id=eq.${seasonId}`, "DELETE");

      // Also remove division championship if this was the winner
      const winnerDivId = Object.keys(confirmedDivWinners).find(did => confirmedDivWinners[did] === teamId);
      if (winnerDivId) {
        await qAuth("championships", `team_id=eq.${teamId}&season_id=eq.${seasonId}&type=eq.division`, "DELETE");
        setConfirmedDivWinners(prev => { const next = { ...prev }; delete next[winnerDivId]; return next; });
        setExistingChamps(prev => prev.filter(c => !(c.team_id === teamId && c.type === "division")));
      }

      setConfirmedPlayoffs(prev => {
        const next = { ...prev };
        // Remove from the specific division, or search all divisions
        if (divId && next[divId]) {
          next[divId] = next[divId].filter(id => id !== teamId);
        } else {
          for (const did of Object.keys(next)) {
            next[did] = next[did].filter(id => id !== teamId);
          }
        }
        return next;
      });
      setExistingPlayoffs(prev => prev.filter(p => p.team_id !== teamId));
      setSeedLabels(prev => { const next = { ...prev }; delete next[teamId]; return next; });
      setWildcards(prev => prev.filter(id => id !== teamId));
      // Clear lottery data if a wildcard was removed
      const wasWC = seedLabels[teamId]?.startsWith("WC");
      if (wasWC) {
        await qAuth("seasons", `id=eq.${seasonId}`, "PATCH", { lottery_data: null }).catch(() => {});
      }
    } catch (e) { setError(e.message); }
    setSaving(null);
  };

  const confirmWildcard = async (teamId) => {
    setSaving(`wc-${teamId}`);
    setError(null);
    try {
      const label = `WC${wildcards.length + 1}`;

      // Delete-then-insert to avoid duplicates
      await qAuth("playoff_appearances", `team_id=eq.${teamId}&season_id=eq.${seasonId}`, "DELETE").catch(() => {});
      await qAuth("playoff_appearances", "", "POST", {
        team_id: teamId,
        season_id: seasonId,
        round_reached: "wildcard",
        seed_label: label,
      });

      setWildcards(prev => [...prev, teamId]);
      setExistingPlayoffs(prev => [...prev, { team_id: teamId, round_reached: "wildcard", seed_label: label }]);
      setSeedLabels(prev => ({ ...prev, [teamId]: label }));
      setSuccess(`Wildcard team confirmed! (${label})`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) { setError(e.message); }
    setSaving(null);
  };

  const confirmAllTopN = async (divId) => {
    const divTeams = standings[divId] || [];
    const spots = getPlayoffSpots(divId);
    const topN = divTeams.slice(0, spots);
    const div = divisions.find(d => d.id === divId);
    setSaving(`batch-${divId}`);
    setError(null);
    try {
      const newLabels = {};
      for (let i = 0; i < topN.length; i++) {
        const t = topN[i];
        const label = div ? makeSeedLabel(div, i + 1) : `?${i + 1}`;
        newLabels[t.team_id] = label;
        // Delete-then-insert to avoid duplicates
        await qAuth("playoff_appearances", `team_id=eq.${t.team_id}&season_id=eq.${seasonId}`, "DELETE").catch(() => {});
        await qAuth("playoff_appearances", "", "POST", {
          team_id: t.team_id,
          season_id: seasonId,
          round_reached: "qualified",
          seed_label: label,
        });
      }
      setConfirmedPlayoffs(prev => ({
        ...prev,
        [divId]: topN.map(t => t.team_id),
      }));
      setExistingPlayoffs(prev => {
        const filtered = prev.filter(p => !topN.find(t => t.team_id === p.team_id));
        const newEntries = topN.map(t => ({ team_id: t.team_id, round_reached: "qualified", seed_label: newLabels[t.team_id] }));
        return [...filtered, ...newEntries];
      });
      setSeedLabels(prev => ({ ...prev, ...newLabels }));
      setSuccess(`All top ${spots} confirmed for playoffs!`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) { setError(e.message); }
    setSaving(null);
  };

  // Get all non-qualifying teams for wildcard picker
  const allNonQualifying = useMemo(() => {
    const qualifiedSet = new Set(existingPlayoffs.map(p => p.team_id));
    const all = [];
    for (const [, teams] of Object.entries(standings)) {
      teams.forEach(t => {
        if (!qualifiedSet.has(t.team_id)) {
          all.push(t);
        }
      });
    }
    return all.sort((a, b) => (b.wins - b.losses) - (a.wins - a.losses));
  }, [standings, existingPlayoffs]);

  const totalConfirmed = existingPlayoffs.length;

  // ── Group Draw Algorithm ──
  const buildPlayoffTeamList = () => {
    // Collect all confirmed playoff teams with metadata
    const teams = [];
    for (const [divId, teamIds] of Object.entries(confirmedPlayoffs)) {
      const div = divisions.find(d => d.id === divId);
      for (const tid of teamIds) {
        const team = (standings[divId] || []).find(t => t.team_id === tid);
        if (team) {
          const label = seedLabels[tid] || "";
          const seedNum = parseInt(label.replace(/[^0-9]/g, "")) || 99;
          teams.push({
            team_id: tid,
            team_name: team.team_name,
            seed_label: label,
            seed_num: label.startsWith("WC") ? 99 : seedNum,
            division_id: divId,
            div_code: label.replace(/[0-9]/g, ""), // "MH", "TC", etc.
          });
        }
      }
    }
    // Add wildcards
    for (const wcId of wildcards) {
      let wcTeam = null;
      let wcDivId = null;
      for (const [divId, dTeams] of Object.entries(standings)) {
        const found = dTeams.find(t => t.team_id === wcId);
        if (found) { wcTeam = found; wcDivId = divId; break; }
      }
      if (wcTeam && !teams.find(t => t.team_id === wcId)) {
        teams.push({
          team_id: wcId,
          team_name: wcTeam.team_name,
          seed_label: seedLabels[wcId] || "WC",
          seed_num: 99,
          division_id: wcDivId,
          div_code: "WC",
        });
      }
    }
    return teams;
  };

  const runGroupDraw = (allTeams) => {
    const groupNames = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const result = {};
    groupNames.forEach(g => result[g] = []);

    // Sort teams into tiers by seed number
    const tiers = {};
    allTeams.forEach(t => {
      const tier = t.seed_num;
      if (!tiers[tier]) tiers[tier] = [];
      tiers[tier].push(t);
    });

    // Process tiers in order
    const tierKeys = Object.keys(tiers).map(Number).sort((a, b) => a - b);

    for (const tierNum of tierKeys) {
      // Shuffle within tier
      const tierTeams = [...tiers[tierNum]].sort(() => Math.random() - 0.5);

      for (const team of tierTeams) {
        // Find eligible groups
        const eligible = groupNames.filter(g => {
          if (result[g].length >= 4) return false;
          // No same-division team in group
          if (result[g].some(t => t.division_id === team.division_id)) return false;
          return true;
        });

        if (eligible.length === 0) {
          // Fallback: just find a group with space (ignore division constraint)
          const fallback = groupNames.filter(g => result[g].length < 4);
          if (fallback.length > 0) {
            const minSize = Math.min(...fallback.map(g => result[g].length));
            const smallest = fallback.filter(g => result[g].length === minSize);
            const pick = smallest[Math.floor(Math.random() * smallest.length)];
            result[pick].push(team);
          }
        } else {
          // Prefer emptier groups
          const minSize = Math.min(...eligible.map(g => result[g].length));
          const smallest = eligible.filter(g => result[g].length === minSize);
          const pick = smallest[Math.floor(Math.random() * smallest.length)];
          result[pick].push(team);
        }
      }
    }
    return result;
  };

  const startGroupDraw = async () => {
    const allTeams = buildPlayoffTeamList();
    if (allTeams.length < 8) {
      setError(`Need at least 8 teams for group draw. Currently have ${allTeams.length}.`);
      return;
    }

    setGroupDrawStep("animating");
    setGroups(null);

    // Animate: show random shuffles
    for (let tick = 0; tick < 10; tick++) {
      const shuffled = runGroupDraw(allTeams);
      setGroups(shuffled);
      const tierNum = tick < 3 ? 1 : tick < 5 ? 2 : tick < 7 ? 3 : tick < 9 ? 4 : 5;
      setDrawingTier(`Seed ${tierNum}`);
      await new Promise(r => setTimeout(r, 200 + tick * 50));
    }

    // Final draw
    const finalGroups = runGroupDraw(allTeams);
    setGroups(finalGroups);
    setDrawingTier(null);
    setDrawingTeam(null);
    setGroupDrawStep("done");
  };

  const saveGroups = async () => {
    if (!groups) return;
    setSaving("groups");
    try {
      // Delete existing groups for this season
      await qAuth("playoff_groups", `season_id=eq.${seasonId}`, "DELETE").catch(() => {});

      // Insert all groups
      for (const [groupName, teams] of Object.entries(groups)) {
        for (let i = 0; i < teams.length; i++) {
          const t = teams[i];
          await qAuth("playoff_groups", "", "POST", {
            season_id: seasonId,
            group_name: groupName,
            team_id: t.team_id,
            team_name: t.team_name,
            seed_label: t.seed_label,
            division_id: t.division_id,
            position: i + 1,
          });
        }
      }
      setExistingGroups(groups);
      setSuccess("Group draw saved!");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) { setError(e.message); }
    setSaving(null);
  };

  const clearGroups = async () => {
    if (!window.confirm("Clear the group draw? This cannot be undone.")) return;
    try {
      await qAuth("group_matches", `season_id=eq.${seasonId}`, "DELETE").catch(() => {});
      await qAuth("playoff_groups", `season_id=eq.${seasonId}`, "DELETE");
      setGroups(null);
      setExistingGroups(null);
      setGroupMatches({});
      setCourtAssignments({});
      setGroupDrawStep("idle");
      setSuccess("Group draw cleared.");
    } catch (e) { setError(e.message); }
  };

  // ── Court Assignments ──
  const assignCourtsRandomly = async () => {
    if (!groups) return;
    const groupNames = Object.keys(groups).sort();
    const courts = [1, 2, 3, 4, 5, 6, 7, 8].sort(() => Math.random() - 0.5);
    const assignments = {};
    groupNames.forEach((g, i) => { assignments[g] = courts[i]; });
    setCourtAssignments(assignments);

    // Save to DB
    for (const [gName, court] of Object.entries(assignments)) {
      await qAuth("playoff_groups", `season_id=eq.${seasonId}&group_name=eq.${gName}`, "PATCH", { court }).catch(() => {});
    }
    setSuccess("Courts assigned!");
    setTimeout(() => setSuccess(null), 2000);
  };

  const updateCourt = async (groupName, court) => {
    const num = parseInt(court);
    if (isNaN(num) || num < 1 || num > 10) return;
    setCourtAssignments(prev => ({ ...prev, [groupName]: num }));
    await qAuth("playoff_groups", `season_id=eq.${seasonId}&group_name=eq.${groupName}`, "PATCH", { court: num }).catch(() => {});
  };

  // ── Match Schedule Generation ──
  const generateRoundRobin = (teamList) => {
    // All possible pairings for 4 teams (6 matches)
    const pairings = [];
    for (let i = 0; i < teamList.length; i++) {
      for (let j = i + 1; j < teamList.length; j++) {
        pairings.push([teamList[i], teamList[j]]);
      }
    }

    // Shuffle and validate: no team plays 3 in a row
    const isValid = (order) => {
      for (let i = 0; i < order.length - 2; i++) {
        const teams1 = [order[i][0].team_id, order[i][1].team_id];
        const teams2 = [order[i + 1][0].team_id, order[i + 1][1].team_id];
        const teams3 = [order[i + 2][0].team_id, order[i + 2][1].team_id];
        // Check if any team appears in all 3 consecutive matches
        const allTeams = [...teams1, ...teams2, ...teams3];
        const counts = {};
        allTeams.forEach(t => { counts[t] = (counts[t] || 0) + 1; });
        if (Object.values(counts).some(c => c >= 3)) return false;
      }
      return true;
    };

    // Try shuffling up to 100 times to find valid order
    for (let attempt = 0; attempt < 100; attempt++) {
      const shuffled = [...pairings].sort(() => Math.random() - 0.5);
      if (isValid(shuffled)) return shuffled;
    }
    // Fallback: return shuffled anyway
    return pairings.sort(() => Math.random() - 0.5);
  };

  const generateAllGroupMatches = async () => {
    if (!groups || !existingGroups) return;
    setSaving("matches");
    setError(null);
    try {
      // Delete existing matches
      await qAuth("group_matches", `season_id=eq.${seasonId}`, "DELETE").catch(() => {});

      const newMatches = {};
      for (const [gName, teamList] of Object.entries(groups)) {
        const schedule = generateRoundRobin(teamList);
        const court = courtAssignments[gName] || null;
        newMatches[gName] = [];

        for (let i = 0; i < schedule.length; i++) {
          const [t1, t2] = schedule[i];
          const matchData = {
            season_id: seasonId,
            group_name: gName,
            match_number: i + 1,
            team1_id: t1.team_id,
            team2_id: t2.team_id,
            team1_name: t1.team_name,
            team2_name: t2.team_name,
            court: court,
            status: "scheduled",
          };
          await qAuth("group_matches", "", "POST", matchData);
          newMatches[gName].push(matchData);
        }
      }
      setGroupMatches(newMatches);
      setSuccess("Match schedules generated for all groups!");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) { setError(e.message); }
    setSaving(null);
  };

  // ── Score Entry ──
  const saveMatchResult = async (groupName, matchNumber, winnerId, team1Score = null, team2Score = null) => {
    setSaving(`score-${groupName}-${matchNumber}`);
    try {
      const isBracket = ["R16", "QF", "SF", "FIN", "3RD"].includes(groupName);
      const source = isBracket ? bracketMatches : groupMatches;
      const match = (source[groupName] || []).find(m => m.match_number === matchNumber);
      if (!match) return;

      const updates = { winner_id: winnerId, status: "completed" };
      if (team1Score !== null && team2Score !== null) {
        updates.team1_score = parseInt(team1Score);
        updates.team2_score = parseInt(team2Score);
      }

      await qAuth("group_matches",
        `season_id=eq.${seasonId}&group_name=eq.${groupName}&match_number=eq.${matchNumber}`,
        "PATCH", updates
      );

      const setter = isBracket ? setBracketMatches : setGroupMatches;
      setter(prev => ({
        ...prev,
        [groupName]: (prev[groupName] || []).map(m =>
          m.match_number === matchNumber ? { ...m, ...updates } : m
        ),
      }));
      setEditingScore(null);
      setScoreInputs({ team1: "", team2: "" });

      // Auto-advance bracket: populate next round
      if (isBracket) {
        await advanceBracket(groupName, matchNumber, winnerId, match);
      }
    } catch (e) { setError(e.message); }
    setSaving(null);
  };

  // R16 matchups: A1vB2, C1vD2, E1vF2, G1vH2, B1vA2, D1vC2, F1vE2, H1vG2
  const R16_MATCHUPS = [
    { m: 1, g1: "A", s1: 0, g2: "B", s2: 1 }, // A1 vs B2
    { m: 2, g1: "C", s1: 0, g2: "D", s2: 1 }, // C1 vs D2
    { m: 3, g1: "E", s1: 0, g2: "F", s2: 1 }, // E1 vs F2
    { m: 4, g1: "G", s1: 0, g2: "H", s2: 1 }, // G1 vs H2
    { m: 5, g1: "B", s1: 0, g2: "A", s2: 1 }, // B1 vs A2
    { m: 6, g1: "D", s1: 0, g2: "C", s2: 1 }, // D1 vs C2
    { m: 7, g1: "F", s1: 0, g2: "E", s2: 1 }, // F1 vs E2
    { m: 8, g1: "H", s1: 0, g2: "G", s2: 1 }, // H1 vs G2
  ];

  const generateR16 = async () => {
    if (!groups || !groupMatches) return;
    setSaving("bracket");
    setError(null);
    try {
      // Compute standings for each group using overrides
      const groupStandings = {};
      Object.entries(groups).forEach(([gName, teamList]) => {
        groupStandings[gName] = computeGroupStandings(teamList, groupMatches[gName] || [], groupOverrides[gName]);
      });

      // Check for unresolved cutline ties
      const hasUnresolved = Object.entries(groupStandings).some(([gName, st]) =>
        st.some(s => s.crossesCutline) && !groupOverrides[gName]
      );
      if (hasUnresolved) {
        setError("Cannot generate bracket: resolve all tied groups first.");
        setSaving(null);
        return;
      }

      // Delete existing bracket matches
      for (const round of ["R16", "QF", "SF", "FIN", "3RD"]) {
        await qAuth("group_matches", `season_id=eq.${seasonId}&group_name=eq.${round}`, "DELETE").catch(() => {});
      }

      const r16 = [];
      for (const mu of R16_MATCHUPS) {
        const t1 = groupStandings[mu.g1]?.[mu.s1];
        const t2 = groupStandings[mu.g2]?.[mu.s2];
        if (!t1 || !t2) { setError(`Missing team for match ${mu.m}`); setSaving(null); return; }
        const matchData = {
          season_id: seasonId,
          group_name: "R16",
          match_number: mu.m,
          team1_id: t1.team_id,
          team1_name: t1.team_name,
          team2_id: t2.team_id,
          team2_name: t2.team_name,
          court: mu.m, // Courts 1-8
          status: "scheduled",
        };
        await qAuth("group_matches", "", "POST", matchData);
        r16.push(matchData);
      }

      setBracketMatches({ R16: r16 });
      setSuccess("R16 bracket generated!");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) { setError(e.message); }
    setSaving(null);
  };

  // Default courts per round
  const BRACKET_COURTS = { R16: [1,2,3,4,5,6,7,8], QF: [1,2,3,4], SF: [1,2], FIN: [3], "3RD": [4] };

  // When a bracket match completes, auto-create next round match
  const advanceBracket = async (round, matchNum, winnerId, match) => {
    const wId = String(winnerId);
    const winnerName = String(match.team1_id) === wId ? match.team1_name : match.team2_name;
    const loserId = String(match.team1_id) === wId ? match.team2_id : match.team1_id;
    const loserName = String(match.team1_id) === wId ? match.team2_name : match.team1_name;

    try {
      // R16 → QF: matches 1&5→QF1, 2&6→QF2, 3&7→QF3, 4&8→QF4
      if (round === "R16") {
        const qfMatch = matchNum <= 4 ? matchNum : matchNum - 4;
        const isTeam1 = matchNum <= 4;
        await upsertBracketSlot("QF", qfMatch, isTeam1, winnerId, winnerName, BRACKET_COURTS.QF[qfMatch - 1] || qfMatch);
      }
      // QF → SF: 1&2→SF1, 3&4→SF2
      if (round === "QF") {
        const sfMatch = matchNum <= 2 ? 1 : 2;
        const isTeam1 = matchNum % 2 === 1;
        await upsertBracketSlot("SF", sfMatch, isTeam1, winnerId, winnerName, BRACKET_COURTS.SF[sfMatch - 1] || sfMatch);
        // Update playoff_appearances: this team reached the banquet (Final 4)
        try { await qAuth("playoff_appearances", `season_id=eq.${seasonId}&team_id=eq.${winnerId}`, "PATCH", { round_reached: "banquet" }); }
        catch (e) { console.warn("Failed to update playoff_appearances to banquet:", e.message); }
      }
      // SF → FIN + 3RD
      if (round === "SF") {
        await upsertBracketSlot("FIN", 1, matchNum === 1, winnerId, winnerName, BRACKET_COURTS.FIN[0]);
        await upsertBracketSlot("3RD", 1, matchNum === 1, loserId, loserName, BRACKET_COURTS["3RD"][0]);
      }
      // FIN complete → update playoff_appearances only (championships written at season complete)
      if (round === "FIN") {
        try { await qAuth("playoff_appearances", `season_id=eq.${seasonId}&team_id=eq.${winnerId}`, "PATCH", { round_reached: "champion" }); }
        catch (e) { console.warn("Failed to update playoff_appearances champion:", e.message); }
        try { await qAuth("playoff_appearances", `season_id=eq.${seasonId}&team_id=eq.${loserId}`, "PATCH", { round_reached: "finalist" }); }
        catch (e) { console.warn("Failed to update playoff_appearances finalist:", e.message); }
      }
    } catch (e) {
      setError("Bracket advance failed: " + e.message);
    }
  };

  // Admin designates which tied team advances from a group
  const designateAdvance = async (groupName, advancingTeamId, standings) => {
    // Build ordered list: move advancing team into position 2 if tied at cutline
    const order = standings.map(s => s.team_id);
    const advIdx = order.indexOf(advancingTeamId);
    if (advIdx > 1) {
      // Swap with whoever is at position 1 (2nd place)
      [order[1], order[advIdx]] = [order[advIdx], order[1]];
    }
    const updated = { ...groupOverrides, [groupName]: order };
    setGroupOverrides(updated);
    try {
      await qAuth("seasons", `id=eq.${seasonId}`, "PATCH", { group_overrides: updated });
    } catch (e) { setError(e.message); }
  };

  const upsertBracketSlot = async (round, matchNum, isTeam1, teamId, teamName, court) => {
    // Query DB for existing match (don't rely on React state which may be stale)
    const existing = await q("group_matches", `season_id=eq.${seasonId}&group_name=eq.${round}&match_number=eq.${matchNum}`);
    const match = existing?.[0];

    if (match) {
      const field = isTeam1
        ? { team1_id: teamId, team1_name: teamName }
        : { team2_id: teamId, team2_name: teamName };
      await qAuth("group_matches", `season_id=eq.${seasonId}&group_name=eq.${round}&match_number=eq.${matchNum}`, "PATCH", field);
      setBracketMatches(prev => ({
        ...prev,
        [round]: (prev[round] || []).map(m => m.match_number === matchNum ? { ...m, ...field } : m),
      }));
    } else {
      const data = {
        season_id: seasonId, group_name: round, match_number: matchNum, status: "scheduled",
        team1_id: isTeam1 ? teamId : null, team1_name: isTeam1 ? teamName : null,
        team2_id: isTeam1 ? null : teamId, team2_name: isTeam1 ? null : teamName,
        court: court || null,
      };
      const result = await qAuth("group_matches", "", "POST", data);
      setBracketMatches(prev => {
        const updated = { ...prev, [round]: [...(prev[round] || []), data] };
        return updated;
      });
    }
  };

  if (loading) return <Loader />;

  const activeDivs = divisions.filter(d => d.has_data).sort((a, b) => {
    const dayDiff = (dayOrder[a.day_of_week] ?? 9) - (dayOrder[b.day_of_week] ?? 9);
    if (dayDiff !== 0) return dayDiff;
    return (levelOrder[a.level] ?? 9) - (levelOrder[b.level] ?? 9);
  });

  return (
    <div>
      {success && <div style={{ background: `${C.green}15`, border: `1px solid ${C.green}30`, borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}><span style={{ fontFamily: F.b, fontSize: 13, color: C.green }}>✓ {success}</span></div>}
      {error && <div style={{ background: `${C.red}15`, border: `1px solid ${C.red}30`, borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}><span style={{ fontFamily: F.b, fontSize: 13, color: C.red }}>{error}</span></div>}

      {/* Summary */}
      <Card style={{ marginBottom: 16, padding: "14px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: F.d, fontSize: 16, fontWeight: 700, color: C.text }}>Postseason Setup</div>
            <div style={{ fontFamily: F.m, fontSize: 11, color: C.muted, marginTop: 2 }}>
              {Object.keys(confirmedDivWinners).length}/{activeDivs.length} div winners · {totalConfirmed} playoff teams
            </div>
          </div>
          <Badge color={totalConfirmed >= (activeDivs.reduce((sum, d) => sum + getPlayoffSpots(d.id), 0) + 2) ? C.green : C.amber}>
            {totalConfirmed >= (activeDivs.reduce((sum, d) => sum + getPlayoffSpots(d.id), 0) + 2) ? "✓ Complete" : "In Progress"}
          </Badge>
        </div>
        {/* Auto-confirm all clear (untied) winners */}
        {(() => {
          const unconfirmed = activeDivs.filter(d => {
            if (confirmedDivWinners[d.id]) return false;
            const teams = standings[d.id] || [];
            if (teams.length < 2) return false;
            return teams[0].wins !== teams[1].wins || teams[0].losses !== teams[1].losses;
          });
          if (unconfirmed.length === 0) return null;
          return (
            <button onClick={async () => {
              setSaving("all-winners");
              for (const d of unconfirmed) {
                const teams = standings[d.id] || [];
                if (teams[0]) await confirmDivisionWinner(d.id, teams[0].team_id);
              }
              setSaving(null);
              setSuccess(`${unconfirmed.length} division winners confirmed!`);
              setTimeout(() => setSuccess(null), 3000);
            }}
              disabled={!!saving}
              style={{ marginTop: 10, width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.green}30`, background: `${C.green}10`, color: C.green, fontFamily: F.b, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              {saving === "all-winners" ? "Confirming..." : `👑 Confirm ${unconfirmed.length} Clear Winner${unconfirmed.length > 1 ? "s" : ""}`}
            </button>
          );
        })()}
      </Card>

      {/* Division-by-division */}
      {activeDivs.map(d => {
        const divTeams = standings[d.id] || [];
        const isExpanded = expandedDiv === d.id;
        const divWinner = confirmedDivWinners[d.id];
        const divPlayoffTeams = confirmedPlayoffs[d.id] || [];
        const spots = getPlayoffSpots(d.id);

        // Compute display ranks: within each same-record group, confirmed teams sort first
        // This handles any combination of ties and manual resolutions
        const displayRanks = (() => {
          const confirmedSet = new Set(divPlayoffTeams);
          // Sort: by record (already sorted), then within same record: confirmed before unconfirmed
          const sorted = [...divTeams].sort((a, b) => {
            // Primary: wins desc
            if (b.wins !== a.wins) return b.wins - a.wins;
            // Secondary: losses asc
            if (a.losses !== b.losses) return a.losses - b.losses;
            // Tertiary: confirmed teams first (winner first, then other confirmed)
            const aConf = a.team_id === divWinner ? 2 : confirmedSet.has(a.team_id) ? 1 : 0;
            const bConf = b.team_id === divWinner ? 2 : confirmedSet.has(b.team_id) ? 1 : 0;
            return bConf - aConf;
          });

          // Now compute display ranks — only UNCONFIRMED teams with same record are "tied"
          return sorted.map((t, i) => {
            const isConfirmed = confirmedSet.has(t.team_id);
            // Find unconfirmed teams with same record
            const unconfirmedSameRecord = sorted.filter(x =>
              x.wins === t.wins && x.losses === t.losses && !confirmedSet.has(x.team_id)
            );
            const firstUnconfIdx = sorted.findIndex(x =>
              x.wins === t.wins && x.losses === t.losses && !confirmedSet.has(x.team_id)
            );

            let displayRank, tiedCount, tiedRank;
            if (isConfirmed) {
              // Confirmed teams get their exact position, no tie marker
              displayRank = `${i + 1}`;
              tiedCount = 1;
              tiedRank = i + 1;
            } else if (unconfirmedSameRecord.length > 1) {
              // Multiple unconfirmed with same record = tied
              const tieStartRank = firstUnconfIdx + 1;
              displayRank = `T${tieStartRank}`;
              tiedCount = unconfirmedSameRecord.length;
              tiedRank = tieStartRank;
            } else {
              displayRank = `${i + 1}`;
              tiedCount = 1;
              tiedRank = i + 1;
            }

            return { ...t, displayRank, rawIdx: i, tiedCount, tiedRank };
          });
        })();

        // Cutoff tie: check if unconfirmed teams straddle the cutoff
        const hasCutoffTie = displayRanks.length > spots && (() => {
          const atCutoff = displayRanks[spots - 1];
          const belowCutoff = displayRanks[spots];
          if (!atCutoff || !belowCutoff) return false;
          // Only a cutoff tie if both are unconfirmed with same record
          const confirmedSet = new Set(divPlayoffTeams);
          return !confirmedSet.has(atCutoff.team_id) && !confirmedSet.has(belowCutoff.team_id) &&
            atCutoff.wins === belowCutoff.wins && atCutoff.losses === belowCutoff.losses;
        })();

        const tieAt1 = !divWinner && divTeams.length > 1 && divTeams[0].wins === divTeams[1].wins && divTeams[0].losses === divTeams[1].losses;

        return (
          <Card key={d.id} style={{ marginBottom: 10, padding: 0, overflow: "hidden" }}>
            {/* Division Header — simplified */}
            <div
              onClick={() => setExpandedDiv(isExpanded ? null : d.id)}
              style={{
                padding: "12px 16px", cursor: "pointer",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: isExpanded ? `${C.amber}08` : "transparent",
              }}>
              <div>
                <span style={{ fontFamily: F.d, fontSize: 15, fontWeight: 700, color: C.text }}>
                  {levelEmoji(d.level)} {cap(d.day_of_week)} {cap(d.level)}
                </span>
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <Badge color={divPlayoffTeams.length >= spots ? C.green : C.dim} style={{ fontSize: 9 }}>
                    {divPlayoffTeams.length}/{spots} playoff
                  </Badge>
                  {divWinner && <Badge color={C.green} style={{ fontSize: 9 }}>✓ Winner</Badge>}
                </div>
              </div>
              <span style={{ color: C.dim, fontSize: 14, transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}>▼</span>
            </div>

            {/* Expanded Standings */}
            {isExpanded && (
              <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${C.border}` }}>
                {/* Playoff spots control */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "12px 0 8px" }}>
                  <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5 }}>Standings</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>Playoff spots:</span>
                    {[4, 5, 6, 7].map(n => (
                      <button key={n} onClick={(e) => {
                          e.stopPropagation();
                          setPlayoffSpotsMap(prev => ({ ...prev, [d.id]: n }));
                          qAuth("divisions", `id=eq.${d.id}`, "PATCH", { playoff_spots: n }).catch(err => console.error("Save playoff_spots:", err));
                        }}
                        style={{
                          width: 24, height: 24, borderRadius: 6, border: "none", cursor: "pointer",
                          background: spots === n ? C.amber : C.surfAlt,
                          color: spots === n ? C.bg : C.dim,
                          fontFamily: F.m, fontSize: 11, fontWeight: 700,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>{n}</button>
                    ))}
                  </div>
                </div>

                {/* Standings */}
                {(() => {
                  const topTeams = displayRanks.slice(0, spots);
                  const bottomTeams = displayRanks.slice(spots);
                  const renderTeamRow = (t, isAboveCutoff) => {
                    const isWinner = divWinner === t.team_id;
                    const isPlayoff = divPlayoffTeams.includes(t.team_id);
                    const isTiedFor1st = tieAt1 && divTeams[0]?.wins === t.wins && divTeams[0]?.losses === t.losses;
                    const previewLabel = makeSeedLabel(d, t.rawIdx + 1);
                    const isTiedAtCutoff = hasCutoffTie && divTeams[spots - 1]?.wins === t.wins && divTeams[spots - 1]?.losses === t.losses;

                    return (
                      <div key={t.team_id} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "8px 10px", borderRadius: 8, marginBottom: 3,
                        background: isWinner ? `${C.green}12` : isPlayoff ? `${C.amber}08` : isAboveCutoff ? C.surface : "transparent",
                        border: `1px solid ${isWinner ? C.green + "30" : isPlayoff ? C.amber + "20" : isTiedAtCutoff && !isAboveCutoff ? C.red + "25" : "transparent"}`,
                        opacity: !isAboveCutoff && !isPlayoff && !isTiedAtCutoff ? 0.5 : 1,
                      }}>
                        <span style={{ fontFamily: F.m, fontSize: 11, color: t.displayRank.startsWith("T") ? C.red : C.dim, width: 22, textAlign: "center", fontWeight: t.displayRank.startsWith("T") ? 600 : 400 }}>{t.displayRank}</span>
                        <TeamAvatar name={t.team_name} size={24} />
                        <span style={{ flex: 1, fontFamily: F.b, fontSize: 13, fontWeight: isWinner ? 700 : 400, color: isWinner ? C.green : isPlayoff ? C.amber : isAboveCutoff ? C.text : C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.team_name}
                        </span>
                        <span style={{ fontFamily: F.m, fontSize: 12, color: C.muted, marginRight: 2 }}>{t.wins}-{t.losses}</span>

                        {/* Seed preview when not confirmed */}
                        {!isPlayoff && !isWinner && isAboveCutoff && (
                          <span style={{ fontFamily: F.m, fontSize: 9, color: C.dim, minWidth: 28, textAlign: "center" }}>{previewLabel}</span>
                        )}

                        {/* Winner buttons */}
                        {t.rawIdx === 0 && !divWinner && !tieAt1 && (
                          <button onClick={(e) => { e.stopPropagation(); confirmDivisionWinner(d.id, t.team_id); }}
                            disabled={saving === `div-${d.id}`}
                            style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: C.green, color: C.bg, fontFamily: F.m, fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                            {saving === `div-${d.id}` ? "..." : "👑 Winner"}
                          </button>
                        )}
                        {isTiedFor1st && !divWinner && tieAt1 && (
                          <button onClick={(e) => { e.stopPropagation(); confirmDivisionWinner(d.id, t.team_id); }}
                            disabled={saving === `div-${d.id}`}
                            style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.green}50`, background: `${C.green}15`, color: C.green, fontFamily: F.m, fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                            {saving === `div-${d.id}` ? "..." : "👑 Pick"}
                          </button>
                        )}

                        {/* Confirmed badges */}
                        {isWinner && <Badge color={C.green} style={{ fontSize: 9, padding: "2px 6px" }}>👑 {seedLabels[t.team_id] || previewLabel}</Badge>}
                        {isPlayoff && !isWinner && <Badge color={C.amber} style={{ fontSize: 9, padding: "2px 6px" }}>{seedLabels[t.team_id] || previewLabel}</Badge>}

                        {/* Add/remove buttons */}
                        {!isPlayoff && !isWinner && isAboveCutoff && divPlayoffTeams.length < spots && (
                          <button onClick={(e) => { e.stopPropagation(); confirmPlayoffTeam(d.id, t.team_id); }}
                            disabled={saving === `playoff-${t.team_id}`}
                            style={{ padding: "3px 6px", borderRadius: 5, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontFamily: F.m, fontSize: 9, cursor: "pointer" }}>
                            {saving === `playoff-${t.team_id}` ? "..." : "+"}
                          </button>
                        )}
                        {!isPlayoff && !isAboveCutoff && isTiedAtCutoff && (
                          <button onClick={(e) => { e.stopPropagation(); confirmPlayoffTeam(d.id, t.team_id); }}
                            style={{ padding: "3px 6px", borderRadius: 5, border: `1px solid ${C.red}50`, background: `${C.red}10`, color: C.red, fontFamily: F.m, fontSize: 9, cursor: "pointer" }}>
                            + Tie
                          </button>
                        )}
                        {(isPlayoff || isWinner) && (
                          <button onClick={(e) => { e.stopPropagation(); removePlayoffTeam(d.id, t.team_id); }}
                            disabled={saving === `playoff-${t.team_id}`}
                            style={{ padding: "3px 5px", borderRadius: 5, border: "none", background: `${C.red}15`, color: C.red, fontFamily: F.m, fontSize: 9, cursor: "pointer" }}>
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  };


                  return (
                    <>
                      {topTeams.map((t) => renderTeamRow(t, true))}

                      {/* Cutoff line */}
                      {bottomTeams.length > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0", padding: "0 10px" }}>
                          <div style={{ flex: 1, height: 1, background: C.red + "40" }} />
                          <span style={{ fontFamily: F.m, fontSize: 9, color: C.red }}>PLAYOFF CUTOFF</span>
                          <div style={{ flex: 1, height: 1, background: C.red + "40" }} />
                        </div>
                      )}

                      {/* Below cutoff */}
                      {bottomTeams.map((t) => renderTeamRow(t, false))}
                    </>
                  );
                })()}

                {/* Quick actions */}
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  {!hasCutoffTie && divPlayoffTeams.length < spots && (
                    <button onClick={() => confirmAllTopN(d.id)}
                      disabled={!!saving}
                      style={{
                        flex: 1, padding: "10px 0", borderRadius: 8, border: "none",
                        background: C.amber, color: C.bg, fontFamily: F.b, fontSize: 12, fontWeight: 700, cursor: "pointer",
                      }}>
                      {saving === `batch-${d.id}` ? "Confirming..." : `✓ Confirm Top ${spots}`}
                    </button>
                  )}
                  {hasCutoffTie && divPlayoffTeams.length < spots && (
                    <div style={{ flex: 1, padding: "8px 12px", borderRadius: 8, background: `${C.red}10`, border: `1px solid ${C.red}25` }}>
                      <span style={{ fontFamily: F.m, fontSize: 11, color: C.red }}>
                        Cutoff tie — manually confirm teams or adjust playoff spots
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        );
      })}

      {/* Wildcard Section */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>
          🎲 Wildcard Teams ({wildcards.length}/2)
        </div>

        {/* Confirmed wildcards */}
        {wildcards.length > 0 && (
          <Card style={{ padding: "14px 16px", marginBottom: 10 }}>
            {wildcards.map(wcId => {
              let wcTeam = null;
              for (const [, teams] of Object.entries(standings)) {
                wcTeam = teams.find(t => t.team_id === wcId);
                if (wcTeam) break;
              }
              return wcTeam ? (
                <div key={wcId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                  <TeamAvatar name={wcTeam.team_name} size={24} />
                  <span style={{ flex: 1, fontFamily: F.b, fontSize: 13, color: C.amber }}>{wcTeam.team_name}</span>
                  <span style={{ fontFamily: F.m, fontSize: 11, color: C.dim }}>{wcTeam.wins}-{wcTeam.losses}</span>
                  <Badge color={C.amber} style={{ fontSize: 9 }}>{seedLabels[wcId] || "WC"}</Badge>
                  <button onClick={() => removePlayoffTeam(null, wcId)}
                    style={{ padding: "3px 5px", borderRadius: 5, border: "none", background: `${C.red}15`, color: C.red, fontFamily: F.m, fontSize: 9, cursor: "pointer" }}>
                    ✕
                  </button>
                </div>
              ) : null;
            })}
          </Card>
        )}

        {/* Lottery / Manual picker */}
        {wildcards.length < 2 && (
          <Card style={{ padding: "14px 16px" }}>
            {/* Mode tabs */}
            <div style={{ display: "flex", gap: 0, marginBottom: 14, borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}` }}>
              {[["pool", "🎲 Lottery"], ["manual", "✏️ Manual Pick"]].map(([m, label]) => (
                <button key={m} onClick={() => { setLotteryMode(m); setLotteryDrawn([]); }}
                  style={{
                    flex: 1, padding: "9px 0", border: "none", fontFamily: F.m, fontSize: 11, fontWeight: 600,
                    cursor: "pointer", transition: "all 0.15s",
                    background: lotteryMode === m ? C.amber : C.surfAlt,
                    color: lotteryMode === m ? C.bg : C.muted,
                  }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Lottery Mode */}
            {lotteryMode === "pool" && !lotteryDrawn.length && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontFamily: F.b, fontSize: 12, color: C.muted }}>
                    Select teams entering the lottery ({lotteryPool.size} teams)
                  </span>
                  <button onClick={() => {
                    if (lotteryPool.size === allNonQualifying.length) {
                      setLotteryPool(new Set());
                    } else {
                      setLotteryPool(new Set(allNonQualifying.map(t => t.team_id)));
                    }
                  }}
                    style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.amber, fontFamily: F.m, fontSize: 10, cursor: "pointer" }}>
                    {lotteryPool.size === allNonQualifying.length ? "Deselect All" : "Select All"}
                  </button>
                </div>
                <div style={{ maxHeight: 240, overflowY: "auto", marginBottom: 12 }}>
                  {allNonQualifying.length === 0 ? (
                    <span style={{ fontFamily: F.m, fontSize: 12, color: C.dim }}>No eligible teams yet</span>
                  ) : allNonQualifying.map(t => {
                    const inPool = lotteryPool.has(t.team_id);
                    return (
                      <div key={t.team_id} onClick={() => {
                        setLotteryPool(prev => {
                          const next = new Set(prev);
                          if (next.has(t.team_id)) next.delete(t.team_id);
                          else next.add(t.team_id);
                          return next;
                        });
                      }}
                        style={{
                          display: "flex", alignItems: "center", gap: 8, padding: "7px 8px",
                          borderBottom: `1px solid ${C.border}`, cursor: "pointer",
                          background: inPool ? `${C.amber}08` : "transparent",
                        }}>
                        <div style={{
                          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                          border: `2px solid ${inPool ? C.amber : C.dim}`,
                          background: inPool ? C.amber : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {inPool && <span style={{ color: C.bg, fontSize: 11, fontWeight: 900 }}>✓</span>}
                        </div>
                        <TeamAvatar name={t.team_name} size={22} />
                        <span style={{ flex: 1, fontFamily: F.b, fontSize: 12, color: inPool ? C.text : C.muted }}>{t.team_name}</span>
                        <span style={{ fontFamily: F.m, fontSize: 11, color: C.dim }}>{t.wins}-{t.losses}</span>
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={async () => {
                    if (lotteryPool.size < 2) { setError("Need at least 2 teams in the lottery pool"); return; }
                    setLotteryAnimating(true);
                    const poolArr = [...lotteryPool];
                    // Draw one team at a time
                    for (let tick = 0; tick < 14; tick++) {
                      const shuffled = [...poolArr].sort(() => Math.random() - 0.5);
                      setLotteryDrawn([shuffled[0]]);
                      await new Promise(r => setTimeout(r, 120 + tick * 25));
                    }
                    // Final pick for WC1
                    const finalShuffled = [...poolArr].sort(() => Math.random() - 0.5);
                    setLotteryDrawn([finalShuffled[0]]);
                    setLotteryAnimating(false);
                  }}
                  disabled={lotteryPool.size < 2 || lotteryAnimating}
                  style={{
                    width: "100%", padding: "12px 0", borderRadius: 10, border: "none",
                    background: lotteryPool.size >= 2 ? C.amber : C.dim,
                    color: C.bg, fontFamily: F.b, fontSize: 14, fontWeight: 700, cursor: "pointer",
                    opacity: lotteryPool.size < 2 ? 0.5 : 1,
                  }}>
                  {lotteryAnimating ? "🎲 Drawing WC1..." : `🎲 Draw Wildcard ${wildcards.length + 1}`}
                </button>
              </>
            )}

            {/* Lottery Result — WC1 drawn, confirm before WC2 */}
            {lotteryMode === "pool" && lotteryDrawn.length === 1 && !lotteryAnimating && (
              <div>
                <div style={{ textAlign: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: 28, marginBottom: 4 }}>🎉</div>
                  <div style={{ fontFamily: F.d, fontSize: 16, fontWeight: 700, color: C.text }}>
                    Wildcard {wildcards.length + 1} Drawn!
                  </div>
                </div>
                {(() => {
                  const tid = lotteryDrawn[0];
                  let team = null;
                  for (const [, teams] of Object.entries(standings)) {
                    team = teams.find(t => t.team_id === tid);
                    if (team) break;
                  }
                  return team ? (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
                      background: `${C.amber}10`, border: `1px solid ${C.amber}30`,
                      borderRadius: 10, marginBottom: 12,
                    }}>
                      <Badge color={C.amber} style={{ fontSize: 13, padding: "4px 8px" }}>WC{wildcards.length + 1}</Badge>
                      <TeamAvatar name={team.team_name} size={28} />
                      <span style={{ flex: 1, fontFamily: F.b, fontSize: 14, fontWeight: 700, color: C.amber }}>{team.team_name}</span>
                      <span style={{ fontFamily: F.m, fontSize: 12, color: C.muted }}>{team.wins}-{team.losses}</span>
                    </div>
                  ) : null;
                })()}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setLotteryDrawn([])}
                    style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontFamily: F.b, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    🔄 Redraw
                  </button>
                  <button onClick={async () => {
                    const tid = lotteryDrawn[0];
                    // Save lottery data to season
                    const poolNames = {};
                    for (const pid of lotteryPool) {
                      for (const [, teams] of Object.entries(standings)) {
                        const t = teams.find(x => x.team_id === pid);
                        if (t) { poolNames[pid] = t.team_name; break; }
                      }
                    }
                    let lottData;
                    if (wildcards.length === 0) {
                      // First wildcard - start fresh
                      lottData = { pool: [...lotteryPool], pool_names: poolNames, drawn: [{ team_id: tid, label: "WC1" }] };
                    } else {
                      // Second wildcard - append to existing
                      const existingLottery = await q("seasons", `id=eq.${seasonId}&select=lottery_data`);
                      lottData = existingLottery?.[0]?.lottery_data || { pool: [...lotteryPool], pool_names: poolNames, drawn: [] };
                      lottData.drawn = [...(lottData.drawn || []), { team_id: tid, label: `WC${wildcards.length + 1}` }];
                    }
                    await qAuth("seasons", `id=eq.${seasonId}`, "PATCH", { lottery_data: lottData });

                    await confirmWildcard(tid);
                    setLotteryDrawn([]);

                    // If WC1 was just confirmed and need WC2, keep pool open minus drawn team
                    if (wildcards.length + 1 < 2) {
                      setLotteryPool(prev => {
                        const next = new Set(prev);
                        next.delete(tid);
                        return next;
                      });
                    } else {
                      setLotteryPool(new Set());
                    }
                  }}
                    disabled={!!saving}
                    style={{ flex: 2, padding: "10px 0", borderRadius: 8, border: "none", background: C.amber, color: C.bg, fontFamily: F.b, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    {wildcards.length + 1 < 2 ? `✓ Confirm WC${wildcards.length + 1} & Draw Next` : `✓ Confirm WC${wildcards.length + 1}`}
                  </button>
                </div>
              </div>
            )}

            {/* Lottery animating state */}
            {lotteryAnimating && lotteryDrawn.length > 0 && (
              <div style={{ marginTop: 12 }}>
                {lotteryDrawn.map((tid, i) => {
                  let team = null;
                  for (const [, teams] of Object.entries(standings)) {
                    team = teams.find(t => t.team_id === tid);
                    if (team) break;
                  }
                  return team ? (
                    <div key={`anim-${i}`} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                      background: `${C.amber}08`, borderRadius: 10, marginBottom: 6,
                      transition: "all 0.1s",
                    }}>
                      <span style={{ fontSize: 18 }}>🎲</span>
                      <span style={{ fontFamily: F.b, fontSize: 13, color: C.amber }}>{team.team_name}</span>
                    </div>
                  ) : null;
                })}
              </div>
            )}

            {/* Manual Mode */}
            {lotteryMode === "manual" && (
              <>
                <div style={{ fontFamily: F.b, fontSize: 12, color: C.muted, marginBottom: 8 }}>
                  Manually select wildcard teams:
                </div>
                <div style={{ maxHeight: 240, overflowY: "auto" }}>
                  {allNonQualifying.length === 0 ? (
                    <span style={{ fontFamily: F.m, fontSize: 12, color: C.dim }}>No eligible teams yet</span>
                  ) : allNonQualifying.map(t => (
                    <div key={t.team_id} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "7px 8px",
                      borderBottom: `1px solid ${C.border}`, cursor: "pointer",
                    }}
                      onClick={() => confirmWildcard(t.team_id)}>
                      <TeamAvatar name={t.team_name} size={22} />
                      <span style={{ flex: 1, fontFamily: F.b, fontSize: 12, color: C.muted }}>{t.team_name}</span>
                      <span style={{ fontFamily: F.m, fontSize: 11, color: C.dim }}>{t.wins}-{t.losses}</span>
                      <span style={{ fontFamily: F.m, fontSize: 10, color: C.amber }}>+ Add</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        )}
      </div>

      {/* Total Summary */}
      <Card style={{ marginTop: 16, padding: "14px 16px", background: `${C.surface}` }}>
        <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
          Playoff Field Summary
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: F.d, fontSize: 22, fontWeight: 800, color: C.green }}>{Object.keys(confirmedDivWinners).length}</div>
            <div style={{ fontFamily: F.m, fontSize: 10, color: C.muted }}>Div Winners</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: F.d, fontSize: 22, fontWeight: 800, color: C.amber }}>{totalConfirmed - wildcards.length}</div>
            <div style={{ fontFamily: F.m, fontSize: 10, color: C.muted }}>Qualified</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: F.d, fontSize: 22, fontWeight: 800, color: C.blue }}>{wildcards.length}</div>
            <div style={{ fontFamily: F.m, fontSize: 10, color: C.muted }}>Wildcards</div>
          </div>
        </div>
      </Card>

      {/* ── Group Draw Section ── */}
      <div style={{ marginTop: 20 }}>
          <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>
            ⚔️ Playoff Group Draw
          </div>

          {/* Draw controls */}
          {groupDrawStep === "idle" && !existingGroups && (
            <Card style={{ padding: "16px", textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>⚔️</div>
              {totalConfirmed >= 32 ? (
                <>
                  <div style={{ fontFamily: F.d, fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 6 }}>
                    Ready to Draw Groups
                  </div>
                  <div style={{ fontFamily: F.m, fontSize: 12, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>
                    {totalConfirmed} teams will be drawn into 8 groups of 4.
                    Teams are seeded by finish — same-division teams are separated.
                  </div>
                  <button onClick={startGroupDraw}
                    style={{
                      width: "100%", padding: "14px 0", borderRadius: 10, border: "none",
                      background: C.amber, color: C.bg, fontFamily: F.b, fontSize: 14, fontWeight: 700,
                      cursor: "pointer",
                    }}>
                    🎲 Draw Groups
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontFamily: F.d, fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 6 }}>
                    Playoff Group Draw
                  </div>
                  <div style={{ fontFamily: F.m, fontSize: 12, color: C.muted, marginBottom: 8, lineHeight: 1.5 }}>
                    Confirm all 32 playoff teams above before generating the group draw.
                  </div>
                  <div style={{ fontFamily: F.d, fontSize: 28, fontWeight: 800, color: totalConfirmed > 0 ? C.amber : C.dim, marginBottom: 4 }}>
                    {totalConfirmed} / 32
                  </div>
                  <div style={{ fontFamily: F.m, fontSize: 11, color: C.dim, marginBottom: 14 }}>teams confirmed</div>
                  {/* Progress bar */}
                  <div style={{ width: "100%", height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${(totalConfirmed / 32) * 100}%`, height: "100%", background: totalConfirmed >= 32 ? C.green : C.amber, borderRadius: 3, transition: "width 0.3s" }} />
                  </div>
                </>
              )}
            </Card>
          )}

          {/* Animating state */}
          {groupDrawStep === "animating" && (
            <div style={{ textAlign: "center", marginBottom: 12 }}>
              <div style={{ fontFamily: F.d, fontSize: 16, fontWeight: 700, color: C.amber, marginBottom: 4 }}>
                🎲 Drawing {drawingTier || "..."}
              </div>
              <div style={{ fontFamily: F.m, fontSize: 11, color: C.dim }}>Shuffling teams into groups...</div>
            </div>
          )}

          {/* Groups display */}
          {groups && (
            <>
              {groupDrawStep === "done" && !existingGroups && (
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <button onClick={() => { setGroups(null); setGroupDrawStep("idle"); }}
                    style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontFamily: F.b, fontSize: 12, cursor: "pointer" }}>
                    🔄 Redraw
                  </button>
                  <button onClick={saveGroups} disabled={saving === "groups"}
                    style={{ flex: 2, padding: "10px 0", borderRadius: 8, border: "none", background: C.green, color: "#fff", fontFamily: F.b, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    {saving === "groups" ? "Saving..." : "✓ Confirm & Save Groups"}
                  </button>
                </div>
              )}

              {existingGroups && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <Badge color={C.green} style={{ fontSize: 10 }}>✓ Groups Confirmed</Badge>
                  <button onClick={clearGroups}
                    style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.red}30`, background: `${C.red}10`, color: C.red, fontFamily: F.m, fontSize: 10, cursor: "pointer" }}>
                    Clear & Redraw
                  </button>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([groupName, teamList]) => (
                  <Card key={groupName} style={{
                    padding: "10px 12px",
                    border: `1px solid ${groupDrawStep === "animating" ? C.amber + "30" : C.border}`,
                    transition: "all 0.15s",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{
                        fontFamily: F.d, fontSize: 14, fontWeight: 800,
                        width: 26, height: 26, borderRadius: 13,
                        background: `${C.amber}20`, color: C.amber,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {groupName}
                      </div>
                      <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>
                        {teamList.length} team{teamList.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {teamList.map((t, i) => (
                      <div key={t.team_id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "5px 0",
                        borderTop: i > 0 ? `1px solid ${C.border}` : "none",
                      }}>
                        <TeamAvatar name={t.team_name} size={20} />
                        <span style={{
                          flex: 1, fontFamily: F.b, fontSize: 11, color: C.text,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {t.team_name}
                        </span>
                        <Badge color={
                          t.seed_label?.startsWith("WC") ? C.blue :
                          t.seed_label?.endsWith("1") ? C.green : C.dim
                        } style={{ fontSize: 8, padding: "1px 4px" }}>
                          {t.seed_label}
                        </Badge>
                      </div>
                    ))}
                  </Card>
                ))}
              </div>

              {/* ── Court Assignments ── */}
              {existingGroups && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5 }}>
                      🏟 Court Assignments
                    </div>
                    {Object.keys(courtAssignments).length === 0 ? (
                      <button onClick={assignCourtsRandomly}
                        style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: C.amber, color: C.bg, fontFamily: F.b, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                        🎲 Random Assign
                      </button>
                    ) : (
                      <button onClick={assignCourtsRandomly}
                        style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontFamily: F.m, fontSize: 10, cursor: "pointer" }}>
                        🔄 Reshuffle
                      </button>
                    )}
                  </div>
                  <Card style={{ padding: "10px 14px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      {Object.keys(groups).sort().map(gName => (
                        <div key={gName} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{
                            fontFamily: F.d, fontSize: 12, fontWeight: 800, color: C.amber,
                            width: 22, height: 22, borderRadius: 11,
                            background: `${C.amber}18`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>{gName}</div>
                          <span style={{ fontFamily: F.m, fontSize: 11, color: C.muted, marginRight: 4 }}>→</span>
                          <select
                            value={courtAssignments[gName] || ""}
                            onChange={e => updateCourt(gName, e.target.value)}
                            style={{
                              flex: 1, padding: "5px 8px", borderRadius: 6, border: `1px solid ${C.border}`,
                              background: C.bg, color: C.text, fontFamily: F.b, fontSize: 11, outline: "none",
                            }}>
                            <option value="">--</option>
                            {[1,2,3,4,5,6,7,8,9,10].map(c => (
                              <option key={c} value={c}>Court {c}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              )}

              {/* ── Match Schedule ── */}
              {existingGroups && Object.keys(courtAssignments).length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5 }}>
                      📋 Group Matches
                    </div>
                    {Object.keys(groupMatches).length === 0 ? (
                      <button onClick={generateAllGroupMatches} disabled={saving === "matches"}
                        style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: C.amber, color: C.bg, fontFamily: F.b, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                        {saving === "matches" ? "Generating..." : "🎲 Generate Schedules"}
                      </button>
                    ) : (
                      <button onClick={() => {
                        if (window.confirm("Regenerate all match schedules? Existing scores will be lost.")) generateAllGroupMatches();
                      }} disabled={saving === "matches"}
                        style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontFamily: F.m, fontSize: 10, cursor: "pointer" }}>
                        🔄 Regenerate
                      </button>
                    )}
                  </div>

                  {Object.keys(groupMatches).length > 0 && (
                    Object.entries(groupMatches).sort(([a], [b]) => a.localeCompare(b)).map(([gName, gMatches]) => {
                      const court = courtAssignments[gName];
                      const completed = gMatches.filter(m => m.status === "completed").length;
                      // Calculate group standings
                      const gStandings = {};
                      (groups[gName] || []).forEach(t => {
                        gStandings[t.team_id] = { team_id: t.team_id, team_name: t.team_name, w: 0, l: 0 };
                      });
                      gMatches.filter(m => m.status === "completed").forEach(m => {
                        if (gStandings[m.team1_id]) {
                          if (m.winner_id === m.team1_id) gStandings[m.team1_id].w++;
                          else if (m.winner_id === m.team2_id) gStandings[m.team1_id].l++;
                        }
                        if (gStandings[m.team2_id]) {
                          if (m.winner_id === m.team2_id) gStandings[m.team2_id].w++;
                          else if (m.winner_id === m.team1_id) gStandings[m.team2_id].l++;
                        }
                      });
                      const standingsArr = computeGroupStandings(groups[gName] || [], gMatches, groupOverrides[gName]);
                      const groupDone = completed === gMatches.length && completed > 0;
                      const hasCutlineTie = groupDone && standingsArr.some(s => s.crossesCutline);
                      const isResolved = !!groupOverrides[gName];

                      return (
                        <Card key={gName} style={{ padding: "12px 14px", marginBottom: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{
                                fontFamily: F.d, fontSize: 14, fontWeight: 800, color: C.amber,
                                width: 26, height: 26, borderRadius: 13, background: `${C.amber}18`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                              }}>{gName}</div>
                              <span style={{ fontFamily: F.m, fontSize: 11, color: C.muted }}>
                                Court {court}
                              </span>
                            </div>
                            <Badge color={completed === gMatches.length ? C.green : C.amber}
                              style={{ fontSize: 9 }}>
                              {completed}/{gMatches.length} played
                            </Badge>
                          </div>

                          {/* Mini standings */}
                          {completed > 0 && (
                            <div style={{ marginBottom: 10, padding: "6px 8px", borderRadius: 6, background: C.bg }}>
                              <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                                <span style={{ flex: 1, fontFamily: F.m, fontSize: 8, color: C.dim, textTransform: "uppercase" }}>Team</span>
                                <span style={{ width: 28, fontFamily: F.m, fontSize: 8, color: C.dim, textAlign: "center" }}>W</span>
                                <span style={{ width: 28, fontFamily: F.m, fontSize: 8, color: C.dim, textAlign: "center" }}>L</span>
                              </div>
                              {standingsArr.map((s, idx) => {
                                const advances = groupDone && idx < 2 && (!hasCutlineTie || isResolved);
                                return (
                                <div key={s.team_id} style={{
                                  display: "flex", alignItems: "center", gap: 4, padding: "3px 0",
                                  borderTop: idx > 0 ? `1px solid ${C.border}` : "none",
                                  background: advances ? `${C.green}06` : "transparent",
                                }}>
                                  <span style={{
                                    flex: 1, fontFamily: F.b, fontSize: 10,
                                    color: advances ? C.green : C.muted,
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                  }}>
                                    {advances ? "✓ " : ""}{s.team_name}
                                  </span>
                                  <span style={{ width: 28, fontFamily: F.d, fontSize: 10, color: C.text, textAlign: "center", fontWeight: 700 }}>{s.w}</span>
                                  <span style={{ width: 28, fontFamily: F.d, fontSize: 10, color: C.dim, textAlign: "center" }}>{s.l}</span>
                                </div>
                                );
                              })}
                              {/* Tie resolution */}
                              {hasCutlineTie && !isResolved && (() => {
                                const tiedTeams = standingsArr.filter(s => s.crossesCutline);
                                return (
                                  <div style={{ marginTop: 6, padding: "6px", borderRadius: 6, background: `${C.amber}08`, border: `1px solid ${C.amber}20` }}>
                                    <div style={{ fontFamily: F.m, fontSize: 9, color: C.amber, marginBottom: 6 }}>
                                      ⚡ Tie — pick who advances:
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                      {tiedTeams.map(t => (
                                        <button key={t.team_id}
                                          onClick={() => designateAdvance(gName, t.team_id, standingsArr)}
                                          style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.green}30`, background: `${C.green}08`, color: C.green, fontFamily: F.b, fontSize: 10, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
                                          ✓ Advance {t.team_name}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })()}
                              {isResolved && hasCutlineTie && (
                                <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <span style={{ fontFamily: F.m, fontSize: 9, color: C.green }}>✓ Tiebreaker resolved</span>
                                  <button onClick={() => {
                                    const updated = { ...groupOverrides };
                                    delete updated[gName];
                                    setGroupOverrides(updated);
                                    qAuth("seasons", `id=eq.${seasonId}`, "PATCH", { group_overrides: Object.keys(updated).length ? updated : null });
                                  }}
                                    style={{ padding: "2px 6px", borderRadius: 4, border: `1px solid ${C.border}`, background: "transparent", color: C.dim, fontFamily: F.m, fontSize: 8, cursor: "pointer" }}>
                                    Reset
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Match list */}
                          {gMatches.map((m, idx) => {
                            const isEditing = editingScore?.groupName === gName && editingScore?.matchNumber === m.match_number;
                            return (
                              <div key={m.match_number} style={{
                                padding: "8px 0",
                                borderTop: idx > 0 ? `1px solid ${C.border}` : "none",
                              }}>
                                {/* Completed match display */}
                                {m.status === "completed" && !isEditing && (
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ fontFamily: F.m, fontSize: 9, color: C.dim, width: 14, textAlign: "center" }}>{m.match_number}</span>
                                    <span style={{
                                      fontFamily: F.b, fontSize: 11, fontWeight: m.winner_id === m.team1_id ? 700 : 400,
                                      color: m.winner_id === m.team1_id ? C.green : C.muted,
                                    }}>
                                      {m.winner_id === m.team1_id ? "W " : ""}
                                    </span>
                                    <span style={{
                                      flex: 1, fontFamily: F.b, fontSize: 11,
                                      color: m.winner_id === m.team1_id ? C.text : C.muted,
                                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                    }}>
                                      {m.team1_name}
                                    </span>
                                    {m.team1_score != null && (
                                      <span style={{ fontFamily: F.d, fontSize: 12, fontWeight: 700, color: C.text, minWidth: 44, textAlign: "center" }}>
                                        {m.team1_score}-{m.team2_score}
                                      </span>
                                    )}
                                    <span style={{
                                      flex: 1, fontFamily: F.b, fontSize: 11, textAlign: "right",
                                      color: m.winner_id === m.team2_id ? C.text : C.muted,
                                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                    }}>
                                      {m.team2_name}
                                    </span>
                                    <span style={{
                                      fontFamily: F.b, fontSize: 11, fontWeight: m.winner_id === m.team2_id ? 700 : 400,
                                      color: m.winner_id === m.team2_id ? C.green : C.muted,
                                    }}>
                                      {m.winner_id === m.team2_id ? " W" : ""}
                                    </span>
                                    <button onClick={() => { setEditingScore({ groupName: gName, matchNumber: m.match_number }); setScoreInputs({ team1: m.team1_score != null ? String(m.team1_score) : "", team2: m.team2_score != null ? String(m.team2_score) : "" }); }}
                                      style={{ padding: "2px 5px", borderRadius: 4, border: "none", background: "transparent", color: C.dim, fontFamily: F.m, fontSize: 9, cursor: "pointer", flexShrink: 0 }}>
                                      ✏️
                                    </button>
                                  </div>
                                )}

                                {/* Pending match — tap to select winner */}
                                {m.status !== "completed" && !isEditing && (
                                  <div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                      <span style={{ fontFamily: F.m, fontSize: 9, color: C.dim, width: 14, textAlign: "center" }}>{m.match_number}</span>
                                      <span style={{ flex: 1, fontFamily: F.b, fontSize: 11, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {m.team1_name}
                                      </span>
                                      <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>vs</span>
                                      <span style={{ flex: 1, fontFamily: F.b, fontSize: 11, color: C.text, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {m.team2_name}
                                      </span>
                                    </div>
                                    <div style={{ display: "flex", gap: 6, paddingLeft: 20 }}>
                                      <button onClick={() => saveMatchResult(gName, m.match_number, m.team1_id)}
                                        disabled={!!saving}
                                        style={{
                                          flex: 1, padding: "7px 4px", borderRadius: 6,
                                          border: `1px solid ${C.green}30`, background: `${C.green}08`,
                                          color: C.green, fontFamily: F.b, fontSize: 10, fontWeight: 600,
                                          cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                        }}>
                                        ✓ {m.team1_name?.split(" ").slice(0, 2).join(" ")}
                                      </button>
                                      <button onClick={() => saveMatchResult(gName, m.match_number, m.team2_id)}
                                        disabled={!!saving}
                                        style={{
                                          flex: 1, padding: "7px 4px", borderRadius: 6,
                                          border: `1px solid ${C.green}30`, background: `${C.green}08`,
                                          color: C.green, fontFamily: F.b, fontSize: 10, fontWeight: 600,
                                          cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                        }}>
                                        ✓ {m.team2_name?.split(" ").slice(0, 2).join(" ")}
                                      </button>
                                      <button onClick={() => { setEditingScore({ groupName: gName, matchNumber: m.match_number }); setScoreInputs({ team1: "", team2: "" }); }}
                                        style={{ padding: "7px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.dim, fontFamily: F.m, fontSize: 9, cursor: "pointer", flexShrink: 0 }}>
                                        +Score
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* Score input expanded */}
                                {isEditing && (
                                  <div style={{ padding: "6px 0 2px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                                      <span style={{ fontFamily: F.m, fontSize: 9, color: C.dim, width: 14, textAlign: "center" }}>{m.match_number}</span>
                                      <span style={{ fontFamily: F.b, fontSize: 11, color: C.text }}>{m.team1_name} vs {m.team2_name}</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 20 }}>
                                      <div style={{ flex: 1, textAlign: "center" }}>
                                        <div style={{ fontFamily: F.m, fontSize: 9, color: C.muted, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {m.team1_name?.split(" ").slice(0, 2).join(" ")}
                                        </div>
                                        <input type="number" placeholder="—" value={scoreInputs.team1}
                                          onChange={e => setScoreInputs(prev => ({ ...prev, team1: e.target.value }))}
                                          style={{ width: "100%", padding: "8px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: F.d, fontSize: 16, fontWeight: 700, textAlign: "center", outline: "none" }}
                                          autoFocus />
                                      </div>
                                      <span style={{ fontFamily: F.d, fontSize: 14, color: C.dim, fontWeight: 700, paddingTop: 16 }}>—</span>
                                      <div style={{ flex: 1, textAlign: "center" }}>
                                        <div style={{ fontFamily: F.m, fontSize: 9, color: C.muted, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {m.team2_name?.split(" ").slice(0, 2).join(" ")}
                                        </div>
                                        <input type="number" placeholder="—" value={scoreInputs.team2}
                                          onChange={e => setScoreInputs(prev => ({ ...prev, team2: e.target.value }))}
                                          style={{ width: "100%", padding: "8px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: F.d, fontSize: 16, fontWeight: 700, textAlign: "center", outline: "none" }} />
                                      </div>
                                    </div>
                                    <div style={{ display: "flex", gap: 6, marginTop: 8, paddingLeft: 20 }}>
                                      <button onClick={() => {
                                        const s1 = scoreInputs.team1 ? parseInt(scoreInputs.team1) : null;
                                        const s2 = scoreInputs.team2 ? parseInt(scoreInputs.team2) : null;
                                        const winnerId = s1 != null && s2 != null ? (s1 > s2 ? m.team1_id : m.team2_id) : null;
                                        if (!winnerId) { setError("Enter scores for both teams to determine winner"); return; }
                                        saveMatchResult(gName, m.match_number, winnerId, s1, s2);
                                      }}
                                        disabled={!!saving}
                                        style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: C.green, color: "#fff", fontFamily: F.b, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                                        ✓ Save Score
                                      </button>
                                      <button onClick={() => setEditingScore(null)}
                                        style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.dim, fontFamily: F.m, fontSize: 11, cursor: "pointer" }}>
                                        ✕
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </Card>
                      );
                    })
                  )}
                </div>
              )}

              {/* ── Bracket ── */}
              {existingGroups && Object.keys(groupMatches).length > 0 && (() => {
                const groupNames = Object.keys(groups);
                const groupStatus = groupNames.map(gName => {
                  const gm = groupMatches[gName] || [];
                  const total = gm.length;
                  const done = gm.filter(m => m.status === "completed").length;
                  return { gName, total, done, allDone: total > 0 && done === total };
                });
                const allGroupsDone = groupStatus.every(g => g.allDone);
                const hasUnresolvedTies = Object.entries(groups).some(([gName, teamList]) => {
                  const st = computeGroupStandings(teamList, groupMatches[gName] || [], groupOverrides[gName]);
                  return st.some(s => s.crossesCutline) && !groupOverrides[gName];
                });
                const hasR16 = (bracketMatches["R16"] || []).length > 0;
                const bracketRoundNames = { R16: "Round of 16", QF: "Quarterfinals", SF: "Semifinals", FIN: "Final", "3RD": "3rd Place" };

                return (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5 }}>
                        🏆 Bracket
                      </div>
                      {allGroupsDone && !hasR16 && !hasUnresolvedTies && (
                        <button onClick={generateR16} disabled={saving === "bracket"}
                          style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: C.amber, color: C.bg, fontFamily: F.b, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                          {saving === "bracket" ? "Generating..." : "🏆 Generate R16 Bracket"}
                        </button>
                      )}
                      {hasR16 && (
                        <button onClick={() => { if (window.confirm("Regenerate bracket? All bracket results will be lost.")) generateR16(); }}
                          disabled={saving === "bracket"}
                          style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontFamily: F.m, fontSize: 10, cursor: "pointer" }}>
                          ♻️ Regenerate
                        </button>
                      )}
                    </div>

                    {hasUnresolvedTies && !hasR16 && (
                      <Card style={{ padding: "12px 14px", marginBottom: 10 }}>
                        <div style={{ fontFamily: F.m, fontSize: 11, color: C.red }}>
                          ⚡ Resolve all tied groups before generating bracket
                        </div>
                      </Card>
                    )}

                    {!allGroupsDone && !hasR16 && (
                      <Card style={{ padding: "12px 14px", marginBottom: 10 }}>
                        <div style={{ fontFamily: F.m, fontSize: 11, color: C.muted, marginBottom: 6 }}>
                          Group stage in progress:
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {groupStatus.map(g => (
                            <Badge key={g.gName} color={g.allDone ? C.green : C.amber} style={{ fontSize: 9 }}>
                              {g.gName}: {g.done}/{g.total}
                            </Badge>
                          ))}
                        </div>
                      </Card>
                    )}

                    {/* Bracket matches by round */}
                    {["R16", "QF", "SF", "3RD", "FIN"].map(round => {
                      const matches = bracketMatches[round] || [];
                      if (matches.length === 0) return null;
                      const completedCount = matches.filter(m => m.status === "completed").length;
                      return (
                        <div key={round} style={{ marginBottom: 14 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <span style={{ fontFamily: F.b, fontSize: 12, color: C.text }}>{bracketRoundNames[round]}</span>
                            <Badge color={completedCount === matches.length ? C.green : C.amber} style={{ fontSize: 9 }}>
                              {completedCount}/{matches.length}
                            </Badge>
                          </div>
                          {matches.sort((a, b) => a.match_number - b.match_number).map(m => {
                            const isEditing = editingScore?.groupName === round && editingScore?.matchNumber === m.match_number;
                            const ready = m.team1_id && m.team2_id;
                            const r16L = round === "R16" ? R16_LABELS[m.match_number] : null;
                            const t1Wins = m.winner_id && String(m.winner_id) === String(m.team1_id);
                            const t2Wins = m.winner_id && String(m.winner_id) === String(m.team2_id);
                            const milestoneIcon = (teamId) => {
                              if (round === "FIN" && m.status === "completed") return String(m.winner_id) === String(teamId) ? "🏆 " : "🥈 ";
                              if (["SF", "FIN", "3RD"].includes(round)) return "🎖️ ";
                              return "";
                            };
                            return (
                              <Card key={m.match_number} style={{ padding: "10px 12px", marginBottom: 6 }}>
                                {/* Court row */}
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    <span style={{ fontFamily: F.m, fontSize: 9, color: C.dim }}>Court</span>
                                    <select value={m.court || ""} onChange={async (e) => {
                                      const val = e.target.value ? parseInt(e.target.value) : null;
                                      await qAuth("group_matches", `season_id=eq.${seasonId}&group_name=eq.${round}&match_number=eq.${m.match_number}`, "PATCH", { court: val });
                                      setBracketMatches(prev => ({
                                        ...prev,
                                        [round]: (prev[round] || []).map(x => x.match_number === m.match_number ? { ...x, court: val } : x),
                                      }));
                                    }}
                                      style={{ padding: "2px 4px", borderRadius: 4, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: F.d, fontSize: 10, width: 40 }}>
                                      <option value="">—</option>
                                      {[1,2,3,4,5,6,7,8,9,10].map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                  </div>
                                  {r16L && <span style={{ fontFamily: F.m, fontSize: 9, color: C.dim }}>{r16L.t1} vs {r16L.t2}</span>}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{
                                    flex: 1, fontFamily: F.b, fontSize: 11,
                                    color: t1Wins ? C.green : m.team1_name ? C.text : C.dim,
                                    fontWeight: t1Wins ? 700 : 400,
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                  }}>
                                    {m.team1_id ? milestoneIcon(m.team1_id) : ""}{m.team1_name || "TBD"}
                                  </span>
                                  {m.status === "completed" && m.team1_score != null ? (
                                    <span style={{ fontFamily: F.d, fontSize: 12, fontWeight: 700, color: C.text, minWidth: 44, textAlign: "center" }}>
                                      {m.team1_score}-{m.team2_score}
                                    </span>
                                  ) : (
                                    <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim, minWidth: 30, textAlign: "center" }}>
                                      {m.status === "completed" ? "✓" : "vs"}
                                    </span>
                                  )}
                                  <span style={{
                                    flex: 1, fontFamily: F.b, fontSize: 11, textAlign: "right",
                                    color: t2Wins ? C.green : m.team2_name ? C.text : C.dim,
                                    fontWeight: t2Wins ? 700 : 400,
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                  }}>
                                    {m.team2_name || "TBD"}{m.team2_id ? ` ${milestoneIcon(m.team2_id).trim()}` : ""}
                                  </span>
                                  {m.status === "completed" && !isEditing && (
                                    <button onClick={() => { setEditingScore({ groupName: round, matchNumber: m.match_number }); setScoreInputs({ team1: m.team1_score != null ? String(m.team1_score) : "", team2: m.team2_score != null ? String(m.team2_score) : "" }); }}
                                      style={{ padding: "2px 5px", borderRadius: 4, border: "none", background: "transparent", color: C.dim, fontSize: 9, cursor: "pointer" }}>
                                      ✏️
                                    </button>
                                  )}
                                </div>
                                {/* Winner select buttons */}
                                {m.status !== "completed" && ready && !isEditing && (
                                  <div style={{ display: "flex", gap: 6, marginTop: 8, paddingLeft: 20 }}>
                                    <button onClick={() => saveMatchResult(round, m.match_number, m.team1_id)}
                                      disabled={!!saving}
                                      style={{ flex: 1, padding: "7px 4px", borderRadius: 6, border: `1px solid ${C.green}30`, background: `${C.green}08`, color: C.green, fontFamily: F.b, fontSize: 10, fontWeight: 600, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      ✓ {m.team1_name?.split(" ").slice(0, 2).join(" ")}
                                    </button>
                                    <button onClick={() => saveMatchResult(round, m.match_number, m.team2_id)}
                                      disabled={!!saving}
                                      style={{ flex: 1, padding: "7px 4px", borderRadius: 6, border: `1px solid ${C.green}30`, background: `${C.green}08`, color: C.green, fontFamily: F.b, fontSize: 10, fontWeight: 600, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      ✓ {m.team2_name?.split(" ").slice(0, 2).join(" ")}
                                    </button>
                                    <button onClick={() => { setEditingScore({ groupName: round, matchNumber: m.match_number }); setScoreInputs({ team1: "", team2: "" }); }}
                                      style={{ padding: "7px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.dim, fontFamily: F.m, fontSize: 9, cursor: "pointer", flexShrink: 0 }}>
                                      +Score
                                    </button>
                                  </div>
                                )}
                                {/* Score input */}
                                {isEditing && (
                                  <div style={{ padding: "6px 0 2px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 20 }}>
                                      <div style={{ flex: 1, textAlign: "center" }}>
                                        <div style={{ fontFamily: F.m, fontSize: 9, color: C.muted, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {m.team1_name?.split(" ").slice(0, 2).join(" ")}
                                        </div>
                                        <input type="number" placeholder="—" value={scoreInputs.team1}
                                          onChange={e => setScoreInputs(prev => ({ ...prev, team1: e.target.value }))}
                                          style={{ width: "100%", padding: "8px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: F.d, fontSize: 16, fontWeight: 700, textAlign: "center", outline: "none" }}
                                          autoFocus />
                                      </div>
                                      <span style={{ fontFamily: F.d, fontSize: 14, color: C.dim, fontWeight: 700, paddingTop: 16 }}>—</span>
                                      <div style={{ flex: 1, textAlign: "center" }}>
                                        <div style={{ fontFamily: F.m, fontSize: 9, color: C.muted, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {m.team2_name?.split(" ").slice(0, 2).join(" ")}
                                        </div>
                                        <input type="number" placeholder="—" value={scoreInputs.team2}
                                          onChange={e => setScoreInputs(prev => ({ ...prev, team2: e.target.value }))}
                                          style={{ width: "100%", padding: "8px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: F.d, fontSize: 16, fontWeight: 700, textAlign: "center", outline: "none" }} />
                                      </div>
                                    </div>
                                    <div style={{ display: "flex", gap: 6, marginTop: 8, paddingLeft: 20 }}>
                                      <button onClick={() => {
                                        const s1 = scoreInputs.team1 ? parseInt(scoreInputs.team1) : null;
                                        const s2 = scoreInputs.team2 ? parseInt(scoreInputs.team2) : null;
                                        const wId = s1 != null && s2 != null ? (s1 > s2 ? m.team1_id : m.team2_id) : null;
                                        if (!wId) { setError("Enter scores for both teams"); return; }
                                        saveMatchResult(round, m.match_number, wId, s1, s2);
                                      }}
                                        disabled={!!saving}
                                        style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: C.green, color: "#fff", fontFamily: F.b, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                                        ✓ Save
                                      </button>
                                      <button onClick={() => setEditingScore(null)}
                                        style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.dim, fontFamily: F.m, fontSize: 11, cursor: "pointer" }}>
                                        ✕
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </Card>
                            );
                          })}
                        </div>
                      );
                    })}

                    {/* Complete Season button when FIN is done */}
                    {(() => {
                      const fin = (bracketMatches["FIN"] || []).find(m => m.status === "completed");
                      if (!fin) return null;
                      const champId = fin.winner_id;
                      const champName = String(champId) === String(fin.team1_id) ? fin.team1_name : fin.team2_name;
                      const finalistId = String(champId) === String(fin.team1_id) ? fin.team2_id : fin.team1_id;
                      const finalistName = String(champId) === String(fin.team1_id) ? fin.team2_name : fin.team1_name;
                      // Collect SF teams (banquet = Final 4 who lost in SF)
                      const sfMatches = bracketMatches["SF"] || [];
                      const banquetTeams = sfMatches.filter(m => m.status === "completed").map(m => {
                        const loserId = String(m.winner_id) === String(m.team1_id) ? m.team2_id : m.team1_id;
                        const loserName = String(m.winner_id) === String(m.team1_id) ? m.team2_name : m.team1_name;
                        return { id: loserId, name: loserName };
                      });

                      const completeSeason = async () => {
                        if (!window.confirm("Mark this season as completed? This will write championship data and finalize all results.")) return;
                        setSaving("complete");
                        setError(null);
                        const errors = [];

                        // 1. Update playoff_appearances round_reached
                        const roundUpdates = [
                          { teamId: champId, round: "champion" },
                          { teamId: finalistId, round: "finalist" },
                          ...banquetTeams.map(t => ({ teamId: t.id, round: "banquet" })),
                        ];
                        for (const { teamId, round } of roundUpdates) {
                          try {
                            await qAuth("playoff_appearances", `season_id=eq.${seasonId}&team_id=eq.${teamId}`, "PATCH", { round_reached: round });
                          } catch (e) { errors.push(`playoff_appearances ${round}: ${e.message}`); }
                        }

                        // 2. Clear any existing championship entries for this season (idempotent)
                        try {
                          await qAuth("championships", `season_id=eq.${seasonId}&type=in.(league,finalist,banquet)`, "DELETE");
                        } catch (e) { errors.push(`clear old champs: ${e.message}`); }

                        // 3. Write championship entries
                        const champEntries = [
                          { season_id: seasonId, team_id: champId, type: "league" },
                          { season_id: seasonId, team_id: finalistId, type: "finalist" },
                          ...banquetTeams.map(t => ({ season_id: seasonId, team_id: t.id, type: "banquet" })),
                        ];
                        for (const entry of champEntries) {
                          try {
                            await qAuth("championships", "", "POST", entry);
                          } catch (e) { errors.push(`championship ${entry.type}: ${e.message}`); }
                        }

                        // 4. Increment winner's championship count
                        try {
                          const teamData = await q("teams", `id=eq.${champId}&select=championship_count`);
                          const currentCount = teamData?.[0]?.championship_count || 0;
                          await qAuth("teams", `id=eq.${champId}`, "PATCH", { championship_count: currentCount + 1 });
                        } catch (e) { errors.push(`championship_count: ${e.message}`); }

                        // 5. Mark season as completed
                        try {
                          await qAuth("seasons", `id=eq.${seasonId}`, "PATCH", { is_active: false });
                        } catch (e) { errors.push(`season is_active: ${e.message}`); }

                        if (errors.length) {
                          setError("Some writes failed:\n" + errors.join("\n"));
                          console.error("Complete season errors:", errors);
                        } else {
                          setSuccess("Season completed! Reloading...");
                          setTimeout(() => { window.location.reload(); }, 2000);
                        }
                        setSaving(null);
                      };

                      return (
                        <Card style={{
                          padding: "16px", textAlign: "center", marginTop: 10,
                          background: `linear-gradient(135deg, ${C.surface}, ${C.amber}10)`,
                          border: `1px solid ${C.amber}25`,
                        }}>
                          <div style={{ fontSize: 28, marginBottom: 4 }}>🏆</div>
                          <div style={{ fontFamily: F.d, fontSize: 15, fontWeight: 800, color: C.amber, marginBottom: 2 }}>
                            {champName}
                          </div>
                          <div style={{ fontFamily: F.m, fontSize: 10, color: C.muted, marginBottom: 4 }}>
                            🥈 {finalistName}
                          </div>
                          {banquetTeams.length > 0 && (
                            <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim, marginBottom: 10 }}>
                              🎖️ {banquetTeams.map(t => t.name).join(" · ")}
                            </div>
                          )}
                          {activeSeason?.is_active !== false ? (
                            <button onClick={completeSeason}
                              disabled={!!saving}
                              style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: C.green, color: C.bg, fontFamily: F.b, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                              {saving === "complete" ? "Writing data..." : "✓ Complete Season"}
                            </button>
                          ) : (
                            <Badge color={C.green} style={{ fontSize: 11 }}>✓ Season Completed</Badge>
                          )}
                        </Card>
                      );
                    })()}
                  </div>
                );
              })()}
            </>
          )}
        </div>

    </div>
  );
}

function AdminApp({ user, myRole }) {
  const [adminGroup, setAdminGroup] = useState("manage"); // "season" | "manage"
  const [tab, setTab] = useState("requests");
  const [divisionId, setDivisionId] = useState(null);
  const [seasonId, setSeasonId] = useState(null);
  const [seasonData, setSeasonData] = useState(null);
  const [divisions, setDivisions] = useState([]);
  const [selectedDay, setSelectedDay] = useState("monday");
  const [weekFilter, setWeekFilter] = useState(null);
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
  // Seasons management state
  const [allSeasons, setAllSeasons] = useState([]);
  const [allDivisions, setAllDivisions] = useState([]); // divisions for selected manage-season
  const [seasonsLoading, setSeasonsLoading] = useState(false);
  const [selectedManageSeason, setSelectedManageSeason] = useState(null);
  const [showCreateSeason, setShowCreateSeason] = useState(false);
  const [newSeasonName, setNewSeasonName] = useState("");
  const [newSeasonStart, setNewSeasonStart] = useState("");
  const [newSeasonEnd, setNewSeasonEnd] = useState("");
  const [showAddDiv, setShowAddDiv] = useState(false);
  const [newDivDay, setNewDivDay] = useState("monday");
  const [newDivLevel, setNewDivLevel] = useState("hammer");
  const [newDivTime, setNewDivTime] = useState("7:00 PM");
  const [newDivPrice, setNewDivPrice] = useState("650");
  const [newDivMax, setNewDivMax] = useState("16");
  const [seasonsSaving, setSeasonsSaving] = useState(false);

  // Load season + divisions once on mount
  useEffect(() => {
    (async () => {
      let seasons = await q("seasons", "is_active=eq.true&select=id,name,start_date,end_date,is_active&limit=1");
      if (!seasons?.length) {
        // No active season - load most recent
        seasons = await q("seasons", "order=start_date.desc&select=id,name,start_date,end_date,is_active&limit=1");
      }
      if (!seasons?.length) return;
      setSeasonId(seasons[0].id);
      setSeasonData(seasons[0]);
      const d = await q("divisions", `season_id=eq.${seasons[0].id}&order=day_of_week,level&select=id,name,day_of_week,level,season_id,playoff_spots,team_seasons(team_id)`);
      const filtered = (d || []).filter(x => x.level !== "party" || (x.team_seasons?.length > 0));
      setDivisions(filtered.map(x => ({ ...x, has_data: (x.team_seasons?.length || 0) > 0 })));
    })();
  }, []);

  // Compute days and day-filtered divisions
  const days = useMemo(() => {
    const d = [...new Set(divisions.map(div => div.day_of_week))];
    return d.sort((a, b) => (dayOrder[a] ?? 9) - (dayOrder[b] ?? 9));
  }, [divisions]);

  const dayDivisions = useMemo(() => {
    return divisions.filter(d => d.day_of_week === selectedDay)
      .sort((a, b) => (levelOrder[a.level] ?? 9) - (levelOrder[b.level] ?? 9));
  }, [divisions, selectedDay]);

  // Auto-select first division when day changes
  useEffect(() => {
    if (dayDivisions.length) setDivisionId(dayDivisions[0].id);
  }, [selectedDay, dayDivisions.length]);

  // Auto-select first day on load
  useEffect(() => {
    if (days.length && !days.includes(selectedDay)) setSelectedDay(days[0]);
  }, [days]);

  // Load matches when divisionId changes (only if on matches tab)
  useEffect(() => {
    if (!divisionId) return;
    if (tab !== "matches") return;
    setLoadingMatches(true);
    qAuth("matches", `division_id=eq.${divisionId}&order=scheduled_date,scheduled_time&limit=200&select=id,team_a_id,team_b_id,scheduled_date,scheduled_time,court,status,winner_id,went_to_ot,team_a:teams!team_a_id(id,name),team_b:teams!team_b_id(id,name)`)
      .then(data => {
        const withWeeks = (data || []).map(m => ({
          ...m,
          team_a_name: m.team_a?.name || "—",
          team_b_name: m.team_b?.name || "—",
          _week: getWeekNum(m.scheduled_date, seasonData?.start_date),
        }));
        setMatches(withWeeks);
        // Auto-set week filter to current week
        if (weekFilter === null && seasonData) {
          const completedWeeks = withWeeks.filter(m => m.status === "completed").map(m => m._week);
          const maxCompleted = completedWeeks.length ? Math.max(...completedWeeks) : 0;
          const nextWeek = Math.min(maxCompleted + 1, 8);
          setWeekFilter(nextWeek > 0 ? nextWeek : 1);
        }
        setLoadingMatches(false);
      }).catch(e => { setError(e.message); setLoadingMatches(false); });
  }, [divisionId]);

  // Load matches when switching to matches tab
  useEffect(() => {
    if (tab !== "matches" || !divisionId) return;
    setLoadingMatches(true);
    qAuth("matches", `division_id=eq.${divisionId}&order=scheduled_date,scheduled_time&limit=200&select=id,team_a_id,team_b_id,scheduled_date,scheduled_time,court,status,winner_id,went_to_ot,team_a:teams!team_a_id(id,name),team_b:teams!team_b_id(id,name)`)
      .then(data => {
        const withWeeks = (data || []).map(m => ({
          ...m,
          team_a_name: m.team_a?.name || "—",
          team_b_name: m.team_b?.name || "—",
          _week: getWeekNum(m.scheduled_date, seasonData?.start_date),
        }));
        setMatches(withWeeks);
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

  const currentWeek = useMemo(() => {
    const completedWeeks = matches.filter(m => m.status === "completed").map(m => m._week);
    const maxCompleted = completedWeeks.length ? Math.max(...completedWeeks) : 0;
    return Math.min(maxCompleted + 1, 8) || 1;
  }, [matches]);

  const visibleMatches = matches
    .filter(m => weekFilter ? m._week === weekFilter : true)
    .filter(m => filter === "all" ? true : filter === "pending" ? m.status !== "completed" : m.status === "completed")
    .sort((a, b) => {
      // Completed: most recent first. Pending/All: soonest first.
      if (filter === "completed") return b.scheduled_date.localeCompare(a.scheduled_date) || (b.scheduled_time || "").localeCompare(a.scheduled_time || "");
      return a.scheduled_date.localeCompare(b.scheduled_date) || (a.scheduled_time || "").localeCompare(b.scheduled_time || "");
    });

  // ── Season management functions ──
  const loadAllSeasons = async () => {
    setSeasonsLoading(true);
    try {
      const s = await q("seasons", "order=start_date.desc&select=id,name,start_date,end_date,is_active");
      setAllSeasons(s || []);
    } catch (e) { setError(e.message); }
    setSeasonsLoading(false);
  };

  const loadSeasonDivisions = async (sId) => {
    try {
      const d = await q("divisions", `season_id=eq.${sId}&order=day_of_week,level&select=id,name,day_of_week,level,time_slot,price_cents,max_teams,registration_open,playoff_spots`);
      setAllDivisions(d || []);
    } catch (e) { setError(e.message); }
  };

  const createSeason = async () => {
    if (!newSeasonName.trim()) { setError("Season name required"); return; }
    if (!newSeasonStart) { setError("Start date required"); return; }
    setSeasonsSaving(true);
    try {
      // Get venue_id from an existing season
      const existing = await q("seasons", "select=venue_id&limit=1");
      const venueId = existing?.[0]?.venue_id;
      if (!venueId) { setError("No venue found — create at least one season in Supabase first"); setSeasonsSaving(false); return; }

      const slug = newSeasonName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const body = { name: newSeasonName.trim(), start_date: newSeasonStart, is_active: false, venue_id: venueId, slug };
      if (newSeasonEnd) body.end_date = newSeasonEnd;
      const created = await qAuth("seasons", "", "POST", body);
      const newId = created?.[0]?.id || created?.id;
      if (!newId) { setError("Season created but couldn't get ID — refresh and check"); setSeasonsSaving(false); return; }

      // Auto-create 6 default divisions
      const defaults = [
        ["monday", "pilot"], ["monday", "cherry"], ["monday", "hammer"],
        ["tuesday", "pilot"], ["tuesday", "cherry"], ["tuesday", "hammer"],
      ];
      for (const [day, level] of defaults) {
        await qAuth("divisions", "", "POST", {
          season_id: newId,
          name: `${cap(day)} ${cap(level)}`,
          slug: `${day}-${level}`,
          day_of_week: day,
          level,
          time_slot: level === "pilot" ? "6:30 PM" : level === "cherry" ? "7:30 PM" : "8:30 PM",
          price_cents: 65000,
          max_teams: 16,
          registration_open: false,
        });
      }

      setSuccess(`Season "${newSeasonName.trim()}" created with 6 divisions!`);
      setNewSeasonName(""); setNewSeasonStart(""); setNewSeasonEnd("");
      setShowCreateSeason(false);
      await loadAllSeasons();
      // Auto-expand new season
      setSelectedManageSeason(newId);
      await loadSeasonDivisions(newId);
    } catch (e) { setError(e.message); }
    setSeasonsSaving(false);
  };

  const createDivision = async () => {
    if (!selectedManageSeason) return;
    setSeasonsSaving(true);
    const name = `${cap(newDivDay)} ${cap(newDivLevel)}`;
    try {
      await qAuth("divisions", "", "POST", {
        season_id: selectedManageSeason,
        name,
        slug: `${newDivDay}-${newDivLevel}`,
        day_of_week: newDivDay,
        level: newDivLevel,
        time_slot: newDivTime || null,
        price_cents: parseInt(newDivPrice) * 100 || 65000,
        max_teams: parseInt(newDivMax) || 16,
        registration_open: false,
      });
      setSuccess(`Division "${name}" created!`);
      setShowAddDiv(false);
      await loadSeasonDivisions(selectedManageSeason);
    } catch (e) { setError(e.message); }
    setSeasonsSaving(false);
  };

  const toggleRegistration = async (divId, currentVal) => {
    try {
      await qAuth("divisions", `id=eq.${divId}`, "PATCH", { registration_open: !currentVal });
      setAllDivisions(prev => prev.map(d => d.id === divId ? { ...d, registration_open: !currentVal } : d));
      setSuccess(!currentVal ? "Registration opened!" : "Registration closed.");
    } catch (e) { setError(e.message); }
  };

  const toggleSeasonActive = async (sId, currentVal) => {
    try {
      if (!currentVal) {
        await qAuth("seasons", `is_active=eq.true`, "PATCH", { is_active: false });
      }
      await qAuth("seasons", `id=eq.${sId}`, "PATCH", { is_active: !currentVal });
      setSuccess(!currentVal ? "Season activated!" : "Season deactivated.");
      await loadAllSeasons();
    } catch (e) { setError(e.message); }
  };

  const deleteDiv = async (divId, divName) => {
    if (!window.confirm(`Delete division "${divName}"? This cannot be undone.`)) return;
    try {
      await qAuth("divisions", `id=eq.${divId}`, "DELETE");
      setAllDivisions(prev => prev.filter(d => d.id !== divId));
      setSuccess("Division deleted.");
    } catch (e) { setError(e.message); }
  };

  const deleteSeason = async (sId, sName) => {
    // Check if season has any matches
    try {
      const matches = await q("matches", `season_id=eq.${sId}&select=id&limit=1`);
      if (matches?.length > 0) {
        setError(`Cannot delete "${sName}" — it has matches. Only seasons with 0 matches can be deleted.`);
        return;
      }
    } catch {}
    if (!window.confirm(`Delete season "${sName}" and all its divisions? This cannot be undone.`)) return;
    try {
      // Delete registrations first, then divisions, then season
      const divs = await q("divisions", `season_id=eq.${sId}&select=id`);
      for (const d of (divs || [])) {
        await qAuth("registrations", `division_id=eq.${d.id}`, "DELETE");
      }
      await qAuth("divisions", `season_id=eq.${sId}`, "DELETE");
      await qAuth("seasons", `id=eq.${sId}`, "DELETE");
      setSuccess(`Season "${sName}" deleted.`);
      if (selectedManageSeason === sId) { setSelectedManageSeason(null); setAllDivisions([]); }
      await loadAllSeasons();
    } catch (e) { setError(e.message); }
  };

  const updateDivField = async (divId, field, value) => {
    try {
      await qAuth("divisions", `id=eq.${divId}`, "PATCH", { [field]: value });
      setAllDivisions(prev => prev.map(d => d.id === divId ? { ...d, [field]: value } : d));
    } catch (e) { setError(e.message); }
  };

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
        <div style={{ display: "flex", gap: 3, marginBottom: 8, background: C.surface, borderRadius: 10, padding: 3, border: `1px solid ${C.border}` }}>
          {[["season", "🏟️ Season"], ["manage", "⚙️ Manage"]].map(([k, l]) => (
            <button key={k} onClick={() => { setAdminGroup(k); setTab(k === "season" ? "matches" : "requests"); }} style={{
              flex: 1, padding: "10px 0", borderRadius: 8, border: "none", cursor: "pointer",
              background: adminGroup === k ? C.amber : "transparent",
              color: adminGroup === k ? C.bg : C.muted,
              fontFamily: F.m, fontSize: 12, fontWeight: 700, transition: "all 0.15s",
            }}>{l}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 3, marginBottom: 16, background: C.surface, borderRadius: 10, padding: 3, border: `1px solid ${C.border}` }}>
          {(adminGroup === "season"
            ? [["matches", "📋 Matches"], ["postseason", "🏆 Postseason"]]
            : [["requests", `🔔 Requests${requests.length ? ` (${requests.length})` : ""}`], ["roster", "👕 Roster"], ["captains", null], ["admins", "🔐 Admins"], ["seasons", "📅 Seasons"]]
          ).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              flex: 1, padding: "9px 0", borderRadius: 8, border: "none", cursor: "pointer",
              background: tab === k ? `${C.amber}25` : "transparent",
              color: tab === k ? C.amber : C.muted,
              fontFamily: F.m, fontSize: 11, fontWeight: tab === k ? 700 : 500, transition: "all 0.15s",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            }}>
              {k === "captains" ? <><CaptainBadge size={13} /> Captains</> : l}
            </button>
          ))}
        </div>

        {tab === "matches" && (
          <>
            {/* Day toggle */}
            {days.length > 1 && (
              <div style={{ display: "flex", gap: 4, marginBottom: 10, background: C.surface, borderRadius: 10, padding: 3, border: `1px solid ${C.border}` }}>
                {days.map(day => (
                  <button key={day} onClick={() => { setSelectedDay(day); setWeekFilter(null); }} style={{
                    flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer",
                    background: selectedDay === day ? C.amber : "transparent",
                    color: selectedDay === day ? C.bg : C.muted,
                    fontFamily: F.m, fontSize: 11, fontWeight: 700, transition: "all 0.15s",
                  }}>{cap(day)}</button>
                ))}
              </div>
            )}
            {/* Level pills */}
            <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
              {dayDivisions.map(d => {
                const active = divisionId === d.id;
                return (
                  <button key={d.id} onClick={() => { setDivisionId(d.id); if (weekFilter === null) setWeekFilter(currentWeek); }} style={{
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
            {/* Week pills */}
            <div style={{ marginBottom: 10 }}>
              <WeekPills selected={weekFilter} onSelect={setWeekFilter} currentWeek={currentWeek} />
            </div>
            {/* Status filter */}
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
                    <Badge color={m.status === "completed" ? C.green : m.status === "postponed" ? C.amber : C.muted} style={{ fontSize: 9, padding: "1px 6px" }}>{m.status === "completed" ? "✓ Done" : m.status === "postponed" ? "PPD" : "⋯ Pending"}</Badge>
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

        {tab === "postseason" && seasonId && <AdminPostseasonTab seasonId={seasonId} divisions={divisions} seasonData={seasonData} />}

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

        {tab === "seasons" && (() => {
          // Load seasons on first view
          if (!allSeasons.length && !seasonsLoading) loadAllSeasons();

          const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontFamily: F.b, fontSize: 13, outline: "none", boxSizing: "border-box" };
          const labelStyle = { fontFamily: F.m, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, display: "block" };

          return (
            <>
              {/* Create Season */}
              {!showCreateSeason ? (
                <button onClick={() => setShowCreateSeason(true)}
                  style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: `2px dashed ${C.border}`, background: "transparent", color: C.amber, fontFamily: F.b, fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 16 }}>
                  + New Season
                </button>
              ) : (
                <Card style={{ padding: "16px", marginBottom: 16, border: `1px solid ${C.amber}30` }}>
                  <div style={{ fontFamily: F.d, fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>Create Season</div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={labelStyle}>Season Name</label>
                    <input value={newSeasonName} onChange={e => setNewSeasonName(e.target.value)} placeholder="e.g. Spring 2026" style={inputStyle} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={labelStyle}>Start Date</label>
                      <input type="date" value={newSeasonStart} onChange={e => setNewSeasonStart(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>End Date (optional)</label>
                      <input type="date" value={newSeasonEnd} onChange={e => setNewSeasonEnd(e.target.value)} style={inputStyle} />
                    </div>
                  </div>
                  <div style={{ fontFamily: F.m, fontSize: 11, color: C.dim, marginBottom: 10, padding: "8px 10px", background: `${C.amber}08`, borderRadius: 6, border: `1px solid ${C.amber}15` }}>
                    💡 6 default divisions will be created (Mon & Tue — Pilot, Cherry, Hammer). You can add, remove, or edit them after.
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setShowCreateSeason(false)}
                      style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontFamily: F.b, fontSize: 12, cursor: "pointer" }}>
                      Cancel
                    </button>
                    <button onClick={createSeason} disabled={seasonsSaving}
                      style={{ flex: 2, padding: "10px 0", borderRadius: 8, border: "none", background: C.amber, color: C.bg, fontFamily: F.b, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      {seasonsSaving ? "Creating..." : "Create Season"}
                    </button>
                  </div>
                </Card>
              )}

              {/* Seasons list */}
              {seasonsLoading ? <Loader /> : allSeasons.length === 0 ? <Empty msg="No seasons yet" /> : allSeasons.map(s => {
                const isSelected = selectedManageSeason === s.id;
                const isActive = s.is_active;
                const isFuture = s.start_date && new Date(s.start_date + "T00:00") > new Date();
                const isPast = !isActive && !isFuture;
                return (
                  <div key={s.id} style={{ marginBottom: 10 }}>
                    <Card style={{
                      padding: "14px 16px", cursor: "pointer",
                      border: `1px solid ${isSelected ? C.amber + "40" : isActive ? C.green + "30" : C.border}`,
                      background: isSelected ? `${C.amber}08` : C.surface,
                    }}
                      onClick={async () => {
                        if (isSelected) { setSelectedManageSeason(null); setAllDivisions([]); }
                        else { setSelectedManageSeason(s.id); await loadSeasonDivisions(s.id); }
                      }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ fontFamily: F.d, fontSize: 16, fontWeight: 700, color: C.text }}>
                            {s.name}
                            {isActive && <Badge color={C.green} style={{ marginLeft: 8, fontSize: 9 }}>Active</Badge>}
                          </div>
                          <div style={{ fontFamily: F.m, fontSize: 11, color: C.dim, marginTop: 2 }}>
                            {s.start_date ? new Date(s.start_date + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "No start date"}
                            {s.end_date ? ` — ${new Date(s.end_date + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {isPast ? (
                            <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim, padding: "5px 10px" }}>Completed</span>
                          ) : (
                            <button onClick={(e) => { e.stopPropagation(); toggleSeasonActive(s.id, isActive); }}
                              style={{
                                padding: "5px 10px", borderRadius: 6, border: `1px solid ${isActive ? C.green + "50" : C.border}`,
                                background: isActive ? `${C.green}15` : "transparent",
                                color: isActive ? C.green : C.muted, fontFamily: F.m, fontSize: 10, fontWeight: 600, cursor: "pointer",
                              }}>
                              {isActive ? "✓ Active" : "Set Active"}
                            </button>
                          )}
                          <span style={{ color: C.dim, fontSize: 16 }}>{isSelected ? "▾" : "▸"}</span>
                        </div>
                      </div>
                    </Card>

                    {/* Expanded: divisions for this season */}
                    {isSelected && (
                      <div style={{ padding: "10px 0 0 12px", borderLeft: `2px solid ${C.amber}30`, marginLeft: 16 }}>
                        {allDivisions.length === 0 ? (
                          <div style={{ fontFamily: F.m, fontSize: 12, color: C.dim, marginBottom: 10 }}>No divisions yet</div>
                        ) : allDivisions.map(d => {
                          const editInputStyle = { padding: "5px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: F.m, fontSize: 11, outline: "none", width: "100%" };
                          const readOnly = isPast || isActive;
                          return (
                          <Card key={d.id} style={{ padding: "12px 14px", marginBottom: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: readOnly ? 0 : 8 }}>
                              <div style={{ fontFamily: F.b, fontSize: 13, fontWeight: 600, color: C.text }}>
                                {levelEmoji(d.level)} {cap(d.day_of_week)} {cap(d.level)}
                              </div>
                              {readOnly ? (
                                <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>
                                  {d.time_slot || ""}{d.time_slot ? " · " : ""}${((d.price_cents || 65000) / 100).toFixed(0)} · {d.max_teams || 16} teams
                                </div>
                              ) : (
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <button onClick={(e) => { e.stopPropagation(); toggleRegistration(d.id, d.registration_open); }}
                                    style={{
                                      padding: "5px 10px", borderRadius: 6, border: "none",
                                      background: d.registration_open ? C.green : `${C.dim}30`,
                                      color: d.registration_open ? "#fff" : C.muted,
                                      fontFamily: F.m, fontSize: 10, fontWeight: 600, cursor: "pointer",
                                    }}>
                                    {d.registration_open ? "✓ Reg Open" : "Reg Closed"}
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); deleteDiv(d.id, d.name); }}
                                    style={{ padding: "4px 6px", borderRadius: 5, border: "none", background: `${C.red}15`, color: C.red, fontFamily: F.m, fontSize: 9, cursor: "pointer" }}>
                                    ✕
                                  </button>
                                </div>
                              )}
                            </div>
                            {!readOnly && (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                              <div>
                                <div style={{ fontFamily: F.m, fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>Time</div>
                                <input value={d.time_slot || ""} onChange={e => setAllDivisions(prev => prev.map(x => x.id === d.id ? { ...x, time_slot: e.target.value } : x))}
                                  onBlur={e => updateDivField(d.id, "time_slot", e.target.value)}
                                  style={editInputStyle} />
                              </div>
                              <div>
                                <div style={{ fontFamily: F.m, fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>Price ($)</div>
                                <input type="number" value={((d.price_cents || 65000) / 100)} onChange={e => setAllDivisions(prev => prev.map(x => x.id === d.id ? { ...x, price_cents: parseInt(e.target.value) * 100 || 65000 } : x))}
                                  onBlur={e => updateDivField(d.id, "price_cents", parseInt(e.target.value) * 100 || 65000)}
                                  style={editInputStyle} />
                              </div>
                              <div>
                                <div style={{ fontFamily: F.m, fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>Max Teams</div>
                                <input type="number" value={d.max_teams || 16} onChange={e => setAllDivisions(prev => prev.map(x => x.id === d.id ? { ...x, max_teams: parseInt(e.target.value) || 16 } : x))}
                                  onBlur={e => updateDivField(d.id, "max_teams", parseInt(e.target.value) || 16)}
                                  style={editInputStyle} />
                              </div>
                            </div>
                            )}
                          </Card>
                          );
                        })}

                        {/* Add division - only for future seasons */}
                        {!isPast && !isActive && (!showAddDiv ? (
                          <button onClick={() => setShowAddDiv(true)}
                            style={{ width: "100%", padding: "10px 0", borderRadius: 8, border: `1px dashed ${C.border}`, background: "transparent", color: C.amber, fontFamily: F.m, fontSize: 11, fontWeight: 600, cursor: "pointer", marginBottom: 8 }}>
                            + Add Division
                          </button>
                        ) : (
                          <Card style={{ padding: "14px", marginBottom: 8, border: `1px solid ${C.amber}30` }}>
                            <div style={{ fontFamily: F.b, fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 10 }}>New Division</div>

                            {/* Quick presets */}
                            <div style={{ marginBottom: 10 }}>
                              <label style={labelStyle}>Quick Add</label>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                {[["monday", "hammer"], ["monday", "cherry"], ["tuesday", "hammer"], ["tuesday", "cherry"]].map(([day, lvl]) => (
                                  <button key={`${day}-${lvl}`} onClick={() => { setNewDivDay(day); setNewDivLevel(lvl); }}
                                    style={{
                                      padding: "5px 10px", borderRadius: 6,
                                      border: `1px solid ${newDivDay === day && newDivLevel === lvl ? C.amber : C.border}`,
                                      background: newDivDay === day && newDivLevel === lvl ? `${C.amber}15` : "transparent",
                                      color: newDivDay === day && newDivLevel === lvl ? C.amber : C.muted,
                                      fontFamily: F.m, fontSize: 10, cursor: "pointer",
                                    }}>
                                    {levelEmoji(lvl)} {cap(day).slice(0, 3)} {cap(lvl)}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                              <div>
                                <label style={labelStyle}>Day</label>
                                <select value={newDivDay} onChange={e => setNewDivDay(e.target.value)} style={inputStyle}>
                                  {["monday", "tuesday", "wednesday", "thursday", "friday"].map(d => (
                                    <option key={d} value={d}>{cap(d)}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label style={labelStyle}>Level</label>
                                <select value={newDivLevel} onChange={e => setNewDivLevel(e.target.value)} style={inputStyle}>
                                  {["hammer", "cherry", "pilot", "party"].map(l => (
                                    <option key={l} value={l}>{cap(l)}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                              <div>
                                <label style={labelStyle}>Time Slot</label>
                                <input value={newDivTime} onChange={e => setNewDivTime(e.target.value)} placeholder="7:00 PM" style={inputStyle} />
                              </div>
                              <div>
                                <label style={labelStyle}>Price ($)</label>
                                <input type="number" value={newDivPrice} onChange={e => setNewDivPrice(e.target.value)} style={inputStyle} />
                              </div>
                              <div>
                                <label style={labelStyle}>Max Teams</label>
                                <input type="number" value={newDivMax} onChange={e => setNewDivMax(e.target.value)} style={inputStyle} />
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button onClick={() => setShowAddDiv(false)}
                                style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontFamily: F.b, fontSize: 11, cursor: "pointer" }}>
                                Cancel
                              </button>
                              <button onClick={createDivision} disabled={seasonsSaving}
                                style={{ flex: 2, padding: "9px 0", borderRadius: 8, border: "none", background: C.amber, color: C.bg, fontFamily: F.b, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                                {seasonsSaving ? "Creating..." : `Create ${cap(newDivDay)} ${cap(newDivLevel)}`}
                              </button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          );
        })()}

        <div style={{ height: 32 }} />
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
// ─── REGISTRATION PAGE ───
// ══════════════════════════════════════

const STRIPE_PK = "pk_test_51T4sEn0ygRD1TJO33l3aJCHDTaixcq1eaaGdUXBtYPpVwt9zNxkErgjkT9et3fPVIkxiGXYnLdJ47KXAdgRIPDzh000QD3Xf9c";

function RegisterPage() {
  const [divisions, setDivisions] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [teams, setTeams] = useState([]);
  const [regCounts, setRegCounts] = useState({});
  const [regTeams, setRegTeams] = useState({}); // divId -> [{team_name}]
  const [selectedDiv, setSelectedDiv] = useState(null);
  const [teamMode, setTeamMode] = useState("existing"); // "existing" | "new"
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [email, setEmail] = useState("");
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [wantRename, setWantRename] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [rosterMembers, setRosterMembers] = useState([{ name: "", email: "" }, { name: "", email: "" }, { name: "", email: "" }, { name: "", email: "" }]);
  const [showWaiver, setShowWaiver] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [teamSearch, setTeamSearch] = useState("");

  // Check URL params for success/cancel
  const urlParams = new URLSearchParams(window.location.search);
  const isSuccess = urlParams.get("success") === "true";
  const sessionId = urlParams.get("session_id");
  const isCanceled = urlParams.get("canceled") === "true";
  const [verified, setVerified] = useState(false);

  // Verify payment on success
  useEffect(() => {
    if (isSuccess && sessionId && !verified) {
      fetch("/api/verify-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      })
        .then(r => r.json())
        .then(d => { if (d.success) setVerified(true); })
        .catch(() => {});
    }
  }, [isSuccess, sessionId, verified]);

  useEffect(() => {
    const l = document.createElement("link");
    l.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;800&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap";
    l.rel = "stylesheet"; document.head.appendChild(l);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [divs, seas, tms, regs] = await Promise.all([
          q("divisions", "registration_open=eq.true&select=id,name,level,day_of_week,season_id,price_cents,max_teams,time_slot"),
          q("seasons", "order=start_date.desc&limit=5"),
          q("teams", "primary_team_id=is.null&order=name.asc&limit=500&select=id,name"),
          q("registrations", "payment_status=eq.paid&select=division_id,team_name"),
        ]);
        setDivisions(divs);
        setSeasons(seas);
        setTeams(tms);
        // Count registrations per division + collect team names
        const counts = {};
        const teams_by_div = {};
        (regs || []).forEach(r => {
          counts[r.division_id] = (counts[r.division_id] || 0) + 1;
          if (!teams_by_div[r.division_id]) teams_by_div[r.division_id] = [];
          teams_by_div[r.division_id].push(r.team_name);
        });
        setRegCounts(counts);
        setRegTeams(teams_by_div);
      } catch (e) { console.error(e); }
      setLoading(false);
    }
    load();
  }, []);

  const getSeasonName = (sid) => seasons.find(s => s.id === sid)?.name || "";

  const handleSubmit = async () => {
    setError("");
    const existingTeamName = teams.find(t => t.id === selectedTeamId)?.name;
    const teamName = teamMode === "new" ? newTeamName.trim() : (wantRename && renameName.trim() ? renameName.trim() : existingTeamName);
    if (!teamName) { setError(teamMode === "new" ? "Enter a team name" : "Select a team"); return; }
    if (!email.trim() || !email.includes("@")) { setError("Enter a valid email"); return; }
    if (!waiverAccepted) { setError("You must accept the terms & waiver"); return; }

    // Validate roster — at least captain email, others optional
    const validRoster = rosterMembers.filter(m => m.name.trim() || m.email.trim());

    const div = divisions.find(d => d.id === selectedDiv);
    if (!div) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          division_id: div.id,
          division_name: `${cap(div.day_of_week)} ${cap(div.level)}${div.time_slot ? ` · ${div.time_slot}` : ""}`,
          season_name: getSeasonName(div.season_id),
          team_name: teamName,
          team_id: teamMode === "existing" ? selectedTeamId : null,
          captain_email: email.trim(),
          is_new_team: teamMode === "new",
          rename_from: (teamMode === "existing" && wantRename && renameName.trim()) ? existingTeamName : null,
          roster: validRoster,
          amount_cents: div.price_cents || 65000,
        }),
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { setError("Server error — please try again or contact league@tangtime.app"); setSubmitting(false); return; }
      if (!res.ok) {
        setError(data.error || "Checkout failed");
        setSubmitting(false);
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "Something went wrong");
        setSubmitting(false);
      }
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  const filteredTeams = teamSearch
    ? teams.filter(t => t.name.toLowerCase().includes(teamSearch.toLowerCase()))
    : teams;

  const inputStyle = {
    width: "100%", padding: "12px 14px", borderRadius: 10,
    border: `1px solid ${C.border}`, background: C.surfAlt,
    color: C.text, fontFamily: F.b, fontSize: 14, outline: "none",
    boxSizing: "border-box",
  };

  const btnStyle = {
    width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
    fontFamily: F.b, fontSize: 15, fontWeight: 700, cursor: "pointer",
    transition: "all 0.2s",
  };

  // ─── Success Screen ───
  if (isSuccess) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F.b, color: C.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
          <h1 style={{ fontFamily: F.d, fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
            You're <span style={{ color: C.green }}>Registered!</span>
          </h1>
          <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
            Payment confirmed. Your team is locked in for the season. We'll send confirmation details to your email.
          </p>
          <Card style={{ textAlign: "left", marginBottom: 24 }}>
            <div style={{ fontFamily: F.m, fontSize: 11, color: C.dim, marginBottom: 6 }}>WHAT'S NEXT</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ color: C.amber, fontWeight: 700, flexShrink: 0 }}>1.</span>
                <span style={{ color: C.muted, fontSize: 14 }}>Check your email for the confirmation receipt</span>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ color: C.amber, fontWeight: 700, flexShrink: 0 }}>2.</span>
                <span style={{ color: C.muted, fontSize: 14 }}>Add your roster in the Captain Portal before Week 1</span>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ color: C.amber, fontWeight: 700, flexShrink: 0 }}>3.</span>
                <span style={{ color: C.muted, fontSize: 14 }}>Schedules will be posted once registration closes</span>
              </div>
            </div>
          </Card>
          <a href="/" style={{ ...btnStyle, display: "block", background: C.amber, color: C.bg, textDecoration: "none", textAlign: "center" }}>
            Go to TangTime
          </a>
        </div>
      </div>
    );
  }

  // ─── Canceled Screen ───
  if (isCanceled) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F.b, color: C.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>↩️</div>
          <h1 style={{ fontFamily: F.d, fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Payment Canceled</h1>
          <p style={{ color: C.muted, fontSize: 14, marginBottom: 24 }}>No worries — your spot hasn't been charged. You can try again anytime.</p>
          <a href="/register" style={{ ...btnStyle, display: "block", background: C.amber, color: C.bg, textDecoration: "none", textAlign: "center" }}>
            Back to Registration
          </a>
        </div>
      </div>
    );
  }

  // ─── Main Registration Page ───
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F.b, color: C.text, maxWidth: 520, margin: "0 auto" }}>
      {/* Header */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
        background: `${C.surface}dd`, backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <Logo size={34} />
          <div>
            <div style={{ fontFamily: F.d, fontSize: 17, fontWeight: 800, lineHeight: 1.1 }}>
              <span style={{ color: C.text }}>Tang</span><span style={{ color: C.amber }}> Time</span>
            </div>
            <div style={{ fontFamily: F.m, fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 2 }}>
              Royal Palms BK
            </div>
          </div>
        </a>
      </header>

      <main style={{ padding: "24px 16px 100px" }}>
        {/* Title */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <h1 style={{ fontFamily: F.d, fontSize: 26, fontWeight: 800, margin: "0 0 6px" }}>
            League <span style={{ color: C.amber }}>Registration</span>
          </h1>
          <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
            Sign up your team for the upcoming season at Royal Palms Brooklyn
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: C.dim }}>Loading divisions...</div>
        ) : divisions.length === 0 ? (
          <Card style={{ textAlign: "center", padding: 32 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ fontFamily: F.d, fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Registration Coming Soon</div>
            <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
              No divisions are currently open for registration. Check back soon or follow Royal Palms for announcements.
            </p>
          </Card>
        ) : (
          <>
            {/* Division Cards */}
            <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>
              Open Divisions
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {divisions.map(d => {
                const sName = getSeasonName(d.season_id);
                const regCount = regCounts[d.id] || 0;
                const spotsLeft = (d.max_teams || 16) - regCount;
                const selected = selectedDiv === d.id;
                return (
                  <Card key={d.id} onClick={() => { setSelectedDiv(selected ? null : d.id); setError(""); }}
                    style={{
                      border: `1px solid ${selected ? C.amber : C.border}`,
                      background: selected ? `${C.amber}08` : C.surface,
                      cursor: "pointer",
                    }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontFamily: F.d, fontSize: 17, fontWeight: 700, marginBottom: 2 }}>
                          {levelEmoji(d.level)} {cap(d.day_of_week)} {cap(d.level)}
                        </div>
                        <div style={{ fontFamily: F.m, fontSize: 11, color: C.muted }}>
                          {sName}{d.time_slot ? ` · ${d.time_slot}` : ""}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: F.d, fontSize: 18, fontWeight: 800, color: C.amber }}>
                          ${((d.price_cents || 65000) / 100).toFixed(0)}
                        </div>
                        <div style={{ fontFamily: F.m, fontSize: 9, color: C.dim, marginBottom: 2 }}>per team</div>
                        <div style={{ fontFamily: F.m, fontSize: 10, color: spotsLeft <= 3 ? C.red : C.muted }}>
                          {regCount > 0 ? `${regCount}/${d.max_teams || 16} teams` : `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""} left`}
                        </div>
                      </div>
                    </div>
                    {selected && <div style={{ marginTop: 4, fontSize: 10, color: C.amber }}>▼ Complete form below</div>}
                    {(regTeams[d.id] || []).length > 0 && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                        <div style={{ fontFamily: F.m, fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                          Registered ({regCount}/{d.max_teams || 16})
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {(regTeams[d.id] || []).map((name, i) => (
                            <span key={i} style={{ fontFamily: F.m, fontSize: 10, color: C.muted, background: `${C.amber}10`, border: `1px solid ${C.amber}15`, borderRadius: 5, padding: "2px 7px" }}>
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>

            {/* Registration Form */}
            {selectedDiv && (
              <div style={{ animation: "fadeIn 0.3s ease" }}>
                <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>
                  Team Information
                </div>

                {/* Team Mode Toggle */}
                <div style={{ display: "flex", gap: 0, marginBottom: 14, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.border}` }}>
                  {[["existing", "Returning Team"], ["new", "New Team"]].map(([m, label]) => (
                    <button key={m} onClick={() => { setTeamMode(m); setError(""); setSelectedTeamId(""); setNewTeamName(""); setTeamSearch(""); setWantRename(false); setRenameName(""); }}
                      style={{
                        flex: 1, padding: "10px 0", border: "none", fontFamily: F.b, fontSize: 13, fontWeight: 600,
                        cursor: "pointer", transition: "all 0.15s",
                        background: teamMode === m ? C.amber : C.surfAlt,
                        color: teamMode === m ? C.bg : C.muted,
                      }}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* Existing Team Picker */}
                {teamMode === "existing" ? (
                  <>
                  <div style={{ marginBottom: 14 }}>
                    <input
                      type="text" placeholder="Search teams..." value={teamSearch}
                      onChange={e => setTeamSearch(e.target.value)}
                      style={{ ...inputStyle, marginBottom: 8 }}
                    />
                    <div style={{
                      maxHeight: 200, overflowY: "auto", borderRadius: 10,
                      border: `1px solid ${C.border}`, background: C.surfAlt,
                    }}>
                      {filteredTeams.length === 0 ? (
                        <div style={{ padding: 14, textAlign: "center", color: C.dim, fontSize: 13 }}>No teams found</div>
                      ) : filteredTeams.map(t => (
                        <div key={t.id}
                          onClick={() => setSelectedTeamId(t.id)}
                          style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "10px 14px", cursor: "pointer",
                            background: selectedTeamId === t.id ? `${C.amber}15` : "transparent",
                            borderBottom: `1px solid ${C.border}`,
                            transition: "background 0.1s",
                          }}>
                          <TeamAvatar name={t.name} size={28} />
                          <span style={{ fontSize: 13, color: selectedTeamId === t.id ? C.amber : C.text, fontWeight: selectedTeamId === t.id ? 600 : 400 }}>
                            {t.name}
                          </span>
                          {selectedTeamId === t.id && <span style={{ marginLeft: "auto", color: C.amber }}>✓</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                  {selectedTeamId && (
                    <div style={{ marginTop: -6, marginBottom: 14 }}>
                      <div onClick={() => { setWantRename(!wantRename); setRenameName(""); }}
                        style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "6px 0" }}>
                        <div style={{
                          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                          border: `2px solid ${wantRename ? C.amber : C.dim}`,
                          background: wantRename ? C.amber : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {wantRename && <span style={{ color: C.bg, fontSize: 10, fontWeight: 900 }}>✓</span>}
                        </div>
                        <span style={{ fontFamily: F.m, fontSize: 11, color: C.muted }}>Change team name for this season</span>
                      </div>
                      {wantRename && (
                        <input type="text" placeholder="New team name" value={renameName} onChange={e => setRenameName(e.target.value)}
                          style={{ ...inputStyle, marginTop: 6 }} />
                      )}
                    </div>
                  )}
                  </>
                ) : (
                  <div style={{ marginBottom: 14 }}>
                    <input
                      type="text" placeholder="Enter your new team name"
                      value={newTeamName} onChange={e => setNewTeamName(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                )}

                {/* Captain Email */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>
                    Captain Email
                  </div>
                  <input
                    type="email" placeholder="captain@example.com"
                    value={email} onChange={e => setEmail(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                {/* Roster Members */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5 }}>
                      Team Members <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span>
                    </div>
                    <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>
                      {rosterMembers.filter(m => m.name.trim()).length} added
                    </span>
                  </div>
                  <div style={{ background: C.surfAlt, borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                    {rosterMembers.map((m, i) => (
                      <div key={i} style={{ display: "flex", gap: 6, padding: "8px 10px", borderBottom: i < rosterMembers.length - 1 ? `1px solid ${C.border}` : "none", alignItems: "center" }}>
                        <span style={{ fontFamily: F.m, fontSize: 11, color: C.dim, width: 18, textAlign: "center", flexShrink: 0 }}>{i + 1}</span>
                        <input type="text" placeholder="Name" value={m.name}
                          onChange={e => setRosterMembers(prev => prev.map((r, j) => j === i ? { ...r, name: e.target.value } : r))}
                          style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: F.b, fontSize: 12, outline: "none", minWidth: 0 }} />
                        <input type="email" placeholder="Email" value={m.email}
                          onChange={e => setRosterMembers(prev => prev.map((r, j) => j === i ? { ...r, email: e.target.value } : r))}
                          style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: F.b, fontSize: 12, outline: "none", minWidth: 0 }} />
                        {rosterMembers.length > 2 && (
                          <button onClick={() => setRosterMembers(prev => prev.filter((_, j) => j !== i))}
                            style={{ padding: "2px 5px", borderRadius: 4, border: "none", background: `${C.red}15`, color: C.red, fontSize: 10, cursor: "pointer", flexShrink: 0 }}>✕</button>
                        )}
                      </div>
                    ))}
                  </div>
                  {rosterMembers.length < 10 && (
                    <button onClick={() => setRosterMembers(prev => [...prev, { name: "", email: "" }])}
                      style={{ marginTop: 6, padding: "6px 12px", borderRadius: 6, border: `1px dashed ${C.border}`, background: "transparent", color: C.amber, fontFamily: F.m, fontSize: 11, cursor: "pointer", width: "100%" }}>
                      + Add Member
                    </button>
                  )}
                  <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim, marginTop: 4 }}>
                    Roster can also be updated later in the Captain Portal
                  </div>
                </div>

                {/* Waiver */}
                <div
                  onClick={() => setWaiverAccepted(!waiverAccepted)}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px",
                    borderRadius: 10, border: `1px solid ${C.border}`, background: C.surfAlt,
                    cursor: "pointer", marginBottom: 18,
                  }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 1,
                    border: `2px solid ${waiverAccepted ? C.amber : C.dim}`,
                    background: waiverAccepted ? C.amber : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.15s",
                  }}>
                    {waiverAccepted && <span style={{ color: C.bg, fontSize: 13, fontWeight: 900 }}>✓</span>}
                  </div>
                  <span style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
                    I agree to the <a href="/terms" target="_blank" style={{ color: C.amber, textDecoration: "underline" }}>Terms of Service</a> and
                    the <span onClick={(e) => { e.stopPropagation(); setShowWaiver(true); }} style={{ color: C.amber, textDecoration: "underline", cursor: "pointer" }}>League Waiver</span>,
                    including assumption of risk and release of liability for shuffleboard activities at Royal Palms Brooklyn.
                  </span>
                </div>

                {/* Error */}
                {error && (
                  <div style={{ padding: "10px 14px", borderRadius: 8, background: `${C.red}15`, color: C.red, fontSize: 13, marginBottom: 14, fontFamily: F.m }}>
                    {error}
                  </div>
                )}

                {/* Submit */}
                <button onClick={handleSubmit} disabled={submitting}
                  style={{
                    ...btnStyle,
                    background: submitting ? C.dim : C.amber,
                    color: C.bg,
                    opacity: submitting ? 0.7 : 1,
                  }}>
                  {submitting ? "Redirecting to payment..." : `Register & Pay $${((divisions.find(d => d.id === selectedDiv)?.price_cents || 65000) / 100).toFixed(0)}`}
                </button>

                <div style={{ textAlign: "center", marginTop: 10 }}>
                  <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>🔒 Secure payment via Stripe</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div style={{ marginTop: 40, paddingTop: 20, borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
          <p style={{ fontFamily: F.m, fontSize: 11, color: C.dim }}>
            Questions? Email <a href="mailto:league@tangtime.app" style={{ color: C.amber }}>league@tangtime.app</a>
          </p>
          <a href="/" style={{ fontFamily: F.m, fontSize: 12, color: C.dim, textDecoration: "none" }}>← Back to TangTime</a>
        </div>
      </main>

      {/* Waiver Modal */}
      {showWaiver && (
        <div onClick={() => setShowWaiver(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: C.surface, borderRadius: 14, padding: "20px 18px", maxWidth: 480,
            maxHeight: "80vh", overflowY: "auto", width: "100%", border: `1px solid ${C.border}`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontFamily: F.d, fontSize: 18, fontWeight: 700, color: C.text }}>League Waiver</div>
              <button onClick={() => setShowWaiver(false)} style={{ background: "none", border: "none", color: C.dim, fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ fontFamily: F.m, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
              <p>The Royal Palms is committed to creating a positive community-driven experience through our shuffleboard league. Should The Royal Palms deem that the behavior of any team or member of a team is in conflict with the values stated above, we reserve the right to terminate that team's membership in the league without warning or prior notice. This decision will be irrefutable and at the sole discretion of The Royal Palms. If a team is terminated from the league, they will be credited with a pro-rated refund of their league dues for that season based on however much of the season they were not able to complete.</p>
            </div>
            <button onClick={() => setShowWaiver(false)} style={{
              width: "100%", marginTop: 14, padding: "11px 0", borderRadius: 8, border: "none",
              background: C.amber, color: C.bg, fontFamily: F.b, fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}>Close</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
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
  if (path === "/register") return <RegisterPage />;
  if (path === "/terms") return <TermsPage />;
  return <MainApp />;
}

function MainApp() {
  const validPages = ["home", "standings", "matches", "playoffs", "teams", "fame"];
  const [page, setPageRaw] = useState(() => {
    try {
      const stored = sessionStorage.getItem("tt_tab");
      if (stored && validPages.includes(stored)) return stored;
    } catch {}
    return "home";
  });
  const [pageData, setPageData] = useState({});
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [divisions, setDivisions] = useState([]);
  const [champs, setChamps] = useState([]);
  const [hasPlayoffData, setHasPlayoffData] = useState(false);
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
    q("divisions", `season_id=eq.${selectedSeason.id}&order=day_of_week,level&select=id,name,day_of_week,level,season_id,playoff_spots,team_seasons(team_id)`).then(d => {
      setDivisions((d || []).filter(div => div.level !== "party" || (div.team_seasons?.length > 0)));
    });
    q("playoff_groups", `season_id=eq.${selectedSeason.id}&select=team_id&limit=1`).then(pg => {
      setHasPlayoffData(pg?.length > 0);
    });
  }, [selectedSeason]);

  const setPage = useCallback((p) => {
    setPageRaw(p);
    try { sessionStorage.setItem("tt_tab", p); } catch {}
  }, []);

  const goPage = useCallback((p, data = {}) => {
    setPage(p);
    setPageData(data);
    mainRef.current?.scrollTo(0, 0);
  }, [setPage]);

  const renderPage = () => {
    switch (page) {
      case "home":
        return <HomePage seasons={seasons} activeSeason={selectedSeason} divisions={divisions} goPage={goPage} champs={champs} hasPlayoffTab={hasPlayoffData} />;
      case "standings":
        return <StandingsPage divisions={divisions} activeSeason={selectedSeason} goPage={goPage} />;
      case "matches":
        return <MatchesPage divisions={divisions} activeSeason={selectedSeason} goPage={goPage} />;
      case "playoffs":
        return <PlayoffsPage activeSeason={selectedSeason} divisions={divisions} goPage={goPage} />;
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
        {(() => {
          const sp = getSeasonProgress(selectedSeason);
          const showPlayoffs = hasPlayoffData;
          return [
            ["home", "⌂", "Home"],
            ["standings", "☰", "Standings"],
            ["matches", "◉", "Matches"],
            ...(showPlayoffs ? [["playoffs", "🏆", "Playoffs"]] : []),
            ["teams", "◈", "Teams"],
            ["fame", "♕", "History"],
          ].map(([key, icon, label]) => {
          const active = page === key;
          return (
            <button key={key} onClick={() => goPage(key)} style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              background: "none", border: "none", cursor: "pointer",
              color: active ? C.amber : C.dim, padding: "6px 4px", borderRadius: 10,
              position: "relative", fontFamily: F.b, transition: "color 0.15s",
            }}>
              {active && (
                <div style={{ position: "absolute", top: -1, left: "50%", transform: "translateX(-50%)", width: 18, height: 3, borderRadius: 2, background: C.amber }} />
              )}
              <span style={{ fontSize: showPlayoffs ? 16 : 18, lineHeight: 1, filter: active ? "none" : "grayscale(1) brightness(0.6)", transition: "filter 0.15s" }}>{icon}</span>
              <span style={{ fontSize: showPlayoffs ? 8 : 9, fontWeight: active ? 700 : 500, textTransform: "uppercase", letterSpacing: showPlayoffs ? 0.3 : 0.5 }}>{label}</span>
            </button>
          );
        });
        })()}
      </nav>
    </div>
  );
}
