import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ─── Supabase ───
const SUPA = "https://ynwohnffmlfyejhfttxq.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlud29obmZmbWxmeWVqaGZ0dHhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NTUxMzIsImV4cCI6MjA4NjQzMTEzMn0.ICBlMtcXmWGxd8gKAa6miEVWpr0uJROUV3osfnhm-9g";
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
let USE_MOCK = false;

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
const dayOrder = { monday: 0, tuesday: 1 };

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
    return b.wins !== a.wins ? b.wins - a.wins : a.losses - b.losses;
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
  const start = new Date(season.start_date + "T12:00:00");
  const end = new Date(season.end_date + "T12:00:00");
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
      <rect width="40" height="40" rx="8" fill="#0f1a2e" />
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
      <circle cx={cx} cy={cy} r={r * 0.85} fill="#1a1a2e" stroke={`${C.amber}22`} strokeWidth={1} />
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
      background: color + "18", color, letterSpacing: 0.3, ...style,
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
    <div style={{ textAlign: "center", marginTop: 40, paddingBottom: 8 }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
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
  const sorted = [...(divisions || [])].sort((a, b) =>
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
                  {levelEmoji(d.level)} {cap(d.level)}
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
function MatchRow({ m, goPage }) {
  const aWon = m.winner_id === m.team_a_id;
  const bWon = m.winner_id === m.team_b_id;
  const done = m.status === "completed" && m.winner_id;
  const isOT = m.went_to_ot;
  return (
    <Card style={{ padding: 0, overflow: "hidden", marginBottom: 8 }}>
      <div style={{ padding: "14px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <TeamLink name={m.team_a_name} teamId={m.team_a_id} goPage={goPage}
              style={{
                fontFamily: F.b, fontSize: 14,
                fontWeight: done && aWon ? 700 : 400,
                color: done ? (aWon ? C.text : C.muted) : C.text,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block",
              }} />
          </div>
          <div style={{ padding: "0 10px", textAlign: "center", flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>
            {done ? (<>
              {aWon ? <Badge color={C.green} style={{ fontSize: 9, padding: "2px 6px" }}>W</Badge> :
               <Badge color={C.red} style={{ fontSize: 9, padding: "2px 6px" }}>L</Badge>}
              <span style={{ color: C.dim, fontSize: 11 }}>vs</span>
              {bWon ? <Badge color={C.green} style={{ fontSize: 9, padding: "2px 6px" }}>W</Badge> :
               <Badge color={C.red} style={{ fontSize: 9, padding: "2px 6px" }}>L</Badge>}
              {isOT && <Badge color={C.amber} style={{ fontSize: 9, padding: "2px 5px" }}>OT</Badge>}
            </>) : (
              <span style={{ fontFamily: F.m, fontSize: 11, color: C.amber, fontWeight: 700 }}>VS</span>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0, textAlign: "right" }}>
            <TeamLink name={m.team_b_name} teamId={m.team_b_id} goPage={goPage}
              style={{
                fontFamily: F.b, fontSize: 14,
                fontWeight: done && bWon ? 700 : 400,
                color: done ? (bWon ? C.text : C.muted) : C.text,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block",
              }} />
          </div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 14, padding: "8px 18px", background: C.surfAlt, borderTop: `1px solid ${C.border}` }}>
        <span style={{ fontFamily: F.m, fontSize: 11, color: C.dim }}>{fmtDate(m.scheduled_date)}</span>
        {m.scheduled_time && <span style={{ fontFamily: F.m, fontSize: 11, color: C.dim }}>{fmtTime(m.scheduled_time)}</span>}
        {m.court && <span style={{ fontFamily: F.m, fontSize: 11, color: C.dim }}>Court {m.court}</span>}
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

  // Compute actual current week from data (max games played + 1)
  const dataWeek = useMemo(() => {
    if (isPast) return null; // Past seasons don't need week
    if (!allStandings.length) return progress.week;
    const maxGames = Math.max(...allStandings.map(s => (s.wins || 0) + (s.losses || 0)));
    return maxGames > 0 ? Math.min(maxGames + 1, 8) : progress.week;
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
    if (!isPast || !champs?.length) return [];
    return champs.filter(c => c.seasons?.name === activeSeason?.name && c.type === "division");
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
            color={progress.status === "completed" ? C.muted : progress.status === "upcoming" ? C.blue : C.green}
            style={{ flexShrink: 0 }}
          >
            {progress.status === "completed" ? "✓" : progress.status === "upcoming" ? "◷" : "●"} {progressLabel}
          </Badge>
        </div>
        <p style={{ fontFamily: F.b, fontSize: 13, color: C.muted, margin: "0 0 18px" }}>Royal Palms Brooklyn</p>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: F.d, fontSize: 26, fontWeight: 700, color: C.text }}>{teamCount || "96"}</div>
            <div style={{ fontFamily: F.m, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1.2 }}>Teams</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: F.d, fontSize: 26, fontWeight: 700, color: C.text }}>{divisions?.length || 0}</div>
            <div style={{ fontFamily: F.m, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1.2 }}>Divisions</div>
          </div>
          <div style={{ textAlign: "center" }}>
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
            <Card key={i} onClick={() => goPage("teams", { teamId: dw.team_id })}
              style={{ padding: "14px 18px", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <TeamAvatar name={dw.teams?.name || "?"} size={36} />
                <div>
                  <div style={{ fontFamily: F.b, fontSize: 14, fontWeight: 600, color: C.text }}>{dw.teams?.name}</div>
                  <div style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>
                    {dw.divisions ? `${cap(dw.divisions.day_of_week)} ${cap(dw.divisions.level)}` : ""}
                  </div>
                </div>
              </div>
              <Badge color={C.amber}>🥇</Badge>
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
              style={{ padding: "12px 18px", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: F.m, fontSize: 12, color: C.dim, width: 18 }}>{i + 1}</span>
                <TeamAvatar name={t.name} size={28} />
                <span style={{ fontFamily: F.b, fontSize: 14, fontWeight: 600, color: C.text }}>{t.name}</span>
              </div>
              <Badge color={C.amber}>🏆 {t.championship_count || t.championships}</Badge>
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
    if (divisions?.length && !divId) {
      setSelectedDay(divisions[0].day_of_week);
      setDivId(divisions[0].id);
    }
  }, [divisions]);
  useEffect(() => {
    if (!divId) return;
    setLoading(true);
    q("division_standings", `division_id=eq.${divId}&order=calculated_rank`).then(d => {
      setStandings(d || []);
      setLoading(false);
    });
  }, [divId]);

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
      {/* Level pills */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {dayDivisions.sort((a, b) => (levelOrder[a.level] ?? 9) - (levelOrder[b.level] ?? 9)).map(d => {
          const active = divId === d.id;
          return (
            <button key={d.id} onClick={() => setDivId(d.id)} style={{
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

      {loading ? <Loader /> : !rows.length ? <Empty msg="No standings data" /> : (
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
          {rows.map((t, i) => (
            <div key={t.team_id || i} onClick={() => goPage("teams", { teamId: t.team_id })} style={{
              display: "grid", gridTemplateColumns: "30px 1fr 32px 32px 34px 42px 38px",
              alignItems: "center", padding: "12px 12px", cursor: "pointer",
              borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : "none",
              background: t.displayRank <= 5 ? C.amberGlow : "transparent", position: "relative",
            }}>
              {t.displayRank === 5 && i < rows.length - 1 && (
                <div style={{ position: "absolute", bottom: 0, left: 14, right: 14, height: 1, background: `repeating-linear-gradient(90deg, ${C.amber}50, ${C.amber}50 4px, transparent 4px, transparent 8px)` }} />
              )}
              <span style={{ fontFamily: F.m, fontSize: 12, fontWeight: 800, color: t.displayRank <= 5 ? C.amber : C.dim }}>{t.rankLabel}</span>
              <div style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", fontFamily: F.b, fontSize: 13, fontWeight: 600, color: C.text }}>{t.team_name}</div>
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
          ))}
        </Card>
        </div>
        <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 32, background: `linear-gradient(90deg, transparent, ${C.bg}cc)`, pointerEvents: "none", borderRadius: "0 14px 14px 0" }} />
        </div>
      )}

      <div style={{ display: "flex", gap: 16, marginTop: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: C.amberGlow, border: `1px solid ${C.amber}30` }} />
          <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>Playoff (Top 5)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 12, height: 2, background: `repeating-linear-gradient(90deg, ${C.amber}60, ${C.amber}60 3px, transparent 3px, transparent 6px)` }} />
          <span style={{ fontFamily: F.m, fontSize: 10, color: C.dim }}>Cutline</span>
        </div>
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
    if (divisions?.length && !divId) {
      setSelectedDay(divisions[0].day_of_week);
      setDivId(divisions[0].id);
    }
    // Reset week filter when season changes
    setWeekFilter(null);
    setDataCurrentWeek(null);
  }, [divisions]);

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
              <MatchRow key={m.id || i} m={m} goPage={goPage} />
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
  const [sortBy, setSortBy] = useState("name");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(initialTeamId || null);
  const [teamDetail, setTeamDetail] = useState(null);
  const [teamMatches, setTeamMatches] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [profileTab, setProfileTab] = useState("results");

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
    setProfileTab("results");
    Promise.all([
      q("teams", `id=eq.${selectedId}`),
      q("division_standings", `team_id=eq.${selectedId}&order=season_name.desc`),
      q("recent_matches", `or=(team_a_id.eq.${selectedId},team_b_id.eq.${selectedId})&order=scheduled_date.desc&limit=500`),
    ]).then(([td, sd, md]) => {
      const teamsRow = td?.[0];
      const hasTeamsData = teamsRow && (teamsRow.all_time_wins || 0) > 0;

      // Compute wins/losses from actual match results (most accurate)
      const completed = (md || []).filter(m => m.status === "completed" && m.winner_id);
      const matchWins = completed.filter(m => m.winner_id === selectedId).length;
      const matchLosses = completed.filter(m => m.winner_id && m.winner_id !== selectedId && (m.team_a_id === selectedId || m.team_b_id === selectedId)).length;
      const seasonNames = new Set((sd || []).map(s => s.season_name));

      setTeamDetail({
        id: selectedId,
        name: teamsRow?.name || sd?.[0]?.team_name || "Unknown",
        all_time_wins: hasTeamsData ? teamsRow.all_time_wins : matchWins,
        all_time_losses: hasTeamsData ? teamsRow.all_time_losses : matchLosses,
        elo_rating: teamsRow?.recrec_elo || null,
        championships: teamsRow?.championship_count || 0,
        seasons_played: hasTeamsData ? (teamsRow.seasons_played || seasonNames.size) : seasonNames.size,
        playoff_appearances: teamsRow?.playoff_appearances || 0,
        _standings: sd || [],
      });
      setTeamMatches(md || []);
      setDetailLoading(false);
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
              ["Seasons", t.seasons_played || "—", C.text],
              ["Playoffs", t.playoff_appearances || 0, C.amber],
            ].map(([l, v, c]) => (
              <div key={l} style={{ textAlign: "center", minWidth: 48 }}>
                <div style={{ fontFamily: F.d, fontSize: 20, fontWeight: 700, color: c }}>{v}</div>
                <div style={{ fontFamily: F.m, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>{l}</div>
              </div>
            ))}
          </div>
        </Card>

        <div style={{ display: "flex", gap: 4, marginBottom: 16, background: C.surface, borderRadius: 10, padding: 3, border: `1px solid ${C.border}` }}>
          {[["results", "Results"], ["schedule", "Schedule"], ["history", "History"]].map(([k, l]) => (
            <button key={k} onClick={() => setProfileTab(k)} style={{
              flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer",
              background: profileTab === k ? C.amber : "transparent",
              color: profileTab === k ? C.bg : C.muted,
              fontFamily: F.m, fontSize: 11, fontWeight: 700, transition: "all 0.15s",
            }}>{l}</button>
          ))}
        </div>

        {profileTab === "results" && (
          !completed.length ? <Empty msg="No match history" /> :
          completed.map((m, i) => <MatchRow key={m.id || i} m={m} goPage={goPage} />)
        )}

        {profileTab === "schedule" && (
          !upcoming.length ? <Empty msg="No upcoming matches" /> :
          upcoming.map((m, i) => <MatchRow key={m.id || i} m={m} goPage={goPage} />)
        )}

        {profileTab === "history" && (
          <div>
            <p style={{ fontFamily: F.b, fontSize: 13, color: C.muted, margin: "0 0 12px" }}>All match results across seasons</p>
            {!completed.length ? <Empty msg="No historical matches" /> : (() => {
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
              return Object.entries(byDate).map(([season, matches]) => (
                <div key={season} style={{ marginBottom: 20 }}>
                  <div style={{ fontFamily: F.m, fontSize: 11, color: C.amber, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
                    {season}
                    <span style={{ color: C.dim, fontWeight: 500, marginLeft: 8 }}>
                      {matches.filter(m2 => m2.winner_id === selectedId || (m2.team_a_id === selectedId && m2.team_a_match_wins > m2.team_b_match_wins) || (m2.team_b_id === selectedId && m2.team_b_match_wins > m2.team_a_match_wins)).length}W-
                      {matches.filter(m2 => m2.winner_id && m2.winner_id !== selectedId && (m2.team_a_id === selectedId || m2.team_b_id === selectedId)).length}L
                    </span>
                  </div>
                  {matches.map((m2, i) => <MatchRow key={m2.id || i} m={m2} goPage={goPage} />)}
                </div>
              ));
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
        {[["name", "A-Z"], ["wins", "Wins"], ["winpct", "Win %"], ["elo", "ELO"], ["champs", "Titles"]].map(([k, l]) => (
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
function HallOfFamePage({ seasons, goPage }) {
  const [champs, setChamps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("league");

  useEffect(() => {
    q("championships", "select=*,teams(name),seasons(name),divisions(name,day_of_week,level)&order=season_id.desc").then(d => {
      setChamps(d || []);
      setLoading(false);
    });
  }, []);

  const filtered = champs.filter(c => {
    if (tab === "league") return !c.type || c.type === "league";
    if (tab === "banquet") return c.type === "banquet";
    if (tab === "division") return c.type === "division";
    return true;
  });

  const leaderboard = {};
  filtered.forEach(c => {
    const n = c.teams?.name || "Unknown";
    if (!leaderboard[n]) leaderboard[n] = { name: n, count: 0, teamId: c.team_id };
    leaderboard[n].count++;
  });
  const sortedLB = Object.values(leaderboard).sort((a, b) => b.count - a.count);

  const tabLabel = tab === "league" ? "League Champions" : tab === "banquet" ? "Banquet (Final 4)" : "Division Champions";

  return (
    <div>
      <h2 style={{ fontFamily: F.d, fontSize: 22, color: C.text, margin: "0 0 4px" }}>League History</h2>
      <p style={{ fontFamily: F.b, fontSize: 13, color: C.muted, margin: "0 0 16px" }}>
        {seasons?.length || 0} seasons
      </p>
      <MockBanner />

      {/* Tabs: League, Banquet, Division */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, background: C.surface, borderRadius: 10, padding: 3, border: `1px solid ${C.border}` }}>
        {[["league", "🏆 League"], ["banquet", "🎖️ Banquet"], ["division", "🥇 Division"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer",
            background: tab === k ? C.amber : "transparent",
            color: tab === k ? C.bg : C.muted,
            fontFamily: F.m, fontSize: 11, fontWeight: 700, transition: "all 0.15s",
          }}>{l}</button>
        ))}
      </div>

      {loading ? <Loader /> : !filtered.length ? (
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
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontFamily: F.m, fontSize: 14, fontWeight: 800, width: 24, color: C.muted }}>{i + 1}</span>
                      <TeamAvatar name={t.name} size={28} />
                      <span style={{ fontFamily: F.b, fontSize: 14, fontWeight: 600, color: C.text }}>{t.name}</span>
                    </div>
                    <Badge color={C.amber}>
                      {tab === "banquet" ? "🎖️" : tab === "division" ? "🥇" : "🏆"} {t.count}
                    </Badge>
                  </div>
                ))}
              </Card>
            </>
          )}

          <SectionTitle>By Season</SectionTitle>
          {filtered.map((c, i) => (
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

// ══════════════════════════════════════
// ─── MAIN APP ───
// ══════════════════════════════════════

export default function TangTime() {
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
      q("championships", "select=*,teams(name),seasons(name),divisions(name,day_of_week,level)&order=season_id.desc"),
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
    q("divisions", `season_id=eq.${selectedSeason.id}&order=day_of_week,level`).then(d => {
      setDivisions(d || []);
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
        return <HallOfFamePage seasons={seasons} goPage={goPage} />;
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
              Tang<span style={{ color: C.amber }}> Time</span>
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
