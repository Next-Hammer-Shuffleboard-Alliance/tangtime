// Vercel Serverless Function — /api/create-checkout.js
// Creates Stripe Checkout Session + records pending registration in Supabase

const SUPA_URL = "https://ynwohnffmlfyejhfttxq.supabase.co/rest/v1";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlud29obmZmbWxmeWVqaGZ0dHhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NTUxMzIsImV4cCI6MjA4NjQzMTEzMn0.ICBlMtcXmWGxd8gKAa6miEVWpr0uJROUV3osfnhm-9g";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { division_id, division_name, team_name, captain_email, is_new_team, team_id, amount_cents, season_name } = req.body;

  if (!division_id || !team_name || !captain_email || !amount_cents) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET) return res.status(500).json({ error: "Stripe not configured" });

  const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, "") || "https://tangtime.app";

  try {
    // 1. Create Stripe Checkout Session
    const params = new URLSearchParams({
      "mode": "payment",
      "success_url": `${origin}/register?success=true&session_id={CHECKOUT_SESSION_ID}`,
      "cancel_url": `${origin}/register?canceled=true`,
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][product_data][name]": `League Registration — ${division_name || "Division"}`,
      "line_items[0][price_data][product_data][description]": `${season_name || "Season"} · Team: ${team_name}`,
      "line_items[0][price_data][unit_amount]": String(amount_cents),
      "line_items[0][quantity]": "1",
      "customer_email": captain_email,
      "metadata[division_id]": division_id,
      "metadata[team_name]": team_name,
      "metadata[team_id]": team_id || "",
      "metadata[is_new_team]": String(is_new_team || false),
      "metadata[captain_email]": captain_email,
    });

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${STRIPE_SECRET}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const session = await stripeRes.json();
    if (!stripeRes.ok) {
      console.error("Stripe error:", session);
      return res.status(500).json({ error: session.error?.message || "Stripe session creation failed" });
    }

    // 2. Get season_id from division
    const divRes = await fetch(`${SUPA_URL}/divisions?id=eq.${division_id}&select=season_id`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    });
    const divData = await divRes.json();
    const season_id = divData?.[0]?.season_id;

    // 3. Insert pending registration
    await fetch(`${SUPA_URL}/registrations`, {
      method: "POST",
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        division_id,
        season_id,
        team_id: team_id || null,
        team_name,
        captain_email,
        is_new_team: is_new_team || false,
        stripe_session_id: session.id,
        payment_status: "pending",
        amount_cents,
        waiver_accepted: true,
      }),
    });

    return res.status(200).json({ url: session.url, session_id: session.id });
  } catch (err) {
    console.error("Checkout error:", err);
    return res.status(500).json({ error: err.message });
  }
}
