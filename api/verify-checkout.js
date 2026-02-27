// Vercel Serverless Function — /api/verify-checkout.js
// Verifies Stripe payment and auto-provisions team registration
// Uses raw Supabase REST calls (no SDK required)

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { session_id } = req.body;
  if (!session_id) return res.status(400).json({ error: "Missing session_id" });

  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  const SB_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!STRIPE_SECRET || !SB_URL || !SB_KEY) {
    return res.status(500).json({ error: "Server not configured" });
  }

  // Helper: Supabase REST call
  async function sb(table, query = "", method = "GET", body = null) {
    const url = `${SB_URL}/rest/v1/${table}${query ? `?${query}` : ""}`;
    const headers = {
      "apikey": SB_KEY,
      "Authorization": `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
    };
    if (method === "POST" || method === "PATCH") headers["Prefer"] = "return=representation";
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`Supabase ${method} ${table}: ${r.status} ${text}`);
    }
    if (r.status === 204) return null;
    return r.json();
  }

  try {
    // 1. Retrieve Stripe session
    const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${session_id}`, {
      headers: { "Authorization": `Bearer ${STRIPE_SECRET}` },
    });
    const session = await stripeRes.json();

    if (!stripeRes.ok || session.payment_status !== "paid") {
      return res.status(400).json({ error: "Payment not confirmed" });
    }

    const meta = session.metadata || {};
    const divisionId = meta.division_id;
    const isFreeAgent = meta.is_free_agent === "true";
    const isNewTeam = meta.is_new_team === "true";
    const teamName = meta.team_name;
    const existingTeamId = meta.team_id || null;
    const captainEmail = meta.captain_email;
    const playerName = meta.player_name || null;
    const partnerRequest = meta.partner_request || null;
    const renameFrom = meta.rename_from || null;
    let roster = [];
    try { roster = JSON.parse(meta.roster || "[]"); } catch {}

    // 2. Check for existing registration (idempotent)
    const existing = await sb("registrations", `stripe_session_id=eq.${session_id}&select=id&limit=1`);
    if (existing?.length) {
      return res.status(200).json({ success: true, message: "Already processed" });
    }

    // 3. Get division → season_id
    const divArr = await sb("divisions", `id=eq.${divisionId}&select=id,season_id&limit=1`);
    if (!divArr?.length) return res.status(400).json({ error: "Division not found" });
    const seasonId = divArr[0].season_id;

    // 4. Get venue_id
    const venueArr = await sb("seasons", "select=venue_id&limit=1");
    const venueId = venueArr?.[0]?.venue_id;

    let finalTeamId = existingTeamId;
    let provisioned = false;

    if (!isFreeAgent) {
      // === TEAM REGISTRATION ===

      if (isNewTeam) {
        // Create new team
        try {
          const newTeam = await sb("teams", "", "POST", {
            name: teamName,
            venue_id: venueId,
            championship_count: 0,
          });
          if (newTeam?.[0]?.id) finalTeamId = newTeam[0].id;
        } catch (e) {
          console.error("Team creation error:", e.message);
        }
      } else if (renameFrom && existingTeamId) {
        // Rename team
        try {
          await sb("teams", `id=eq.${existingTeamId}`, "PATCH", { name: teamName });
        } catch (e) {
          console.error("Team rename error:", e.message);
        }
      }

      // Create team_seasons entry
      if (finalTeamId) {
        try {
          // Check if already exists
          const existing_ts = await sb("team_seasons", `team_id=eq.${finalTeamId}&season_id=eq.${seasonId}&select=id&limit=1`);
          if (!existing_ts?.length) {
            await sb("team_seasons", "", "POST", {
              team_id: finalTeamId,
              season_id: seasonId,
              division_id: divisionId,
            });
          }
          provisioned = true;
        } catch (e) {
          console.error("team_seasons error:", e.message);
        }
      }

      // Seed roster members (best-effort)
      if (finalTeamId && roster.length > 0) {
        for (const member of roster) {
          if (member.name?.trim()) {
            try {
              await sb("roster_members", "", "POST", {
                team_id: finalTeamId,
                season_id: seasonId,
                name: member.name.trim(),
                email: member.email?.trim() || null,
              });
            } catch {}
          }
        }
      }
    }

    // 5. Create registration record
    await sb("registrations", "", "POST", {
      division_id: divisionId,
      season_id: seasonId,
      team_id: finalTeamId || null,
      team_name: isFreeAgent ? null : teamName,
      captain_email: captainEmail,
      is_new_team: isNewTeam,
      is_free_agent: isFreeAgent,
      player_name: playerName,
      partner_request: partnerRequest,
      stripe_session_id: session_id,
      stripe_payment_intent: session.payment_intent,
      payment_status: "paid",
      amount_cents: session.amount_total,
      waiver_accepted: true,
      roster: roster,
      provisioned: provisioned,
    });

    return res.status(200).json({ success: true, provisioned, team_id: finalTeamId });
  } catch (err) {
    console.error("Verify error:", err);
    return res.status(500).json({ error: err.message });
  }
}
