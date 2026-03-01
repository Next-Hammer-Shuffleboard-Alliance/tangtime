// Vercel Serverless Function — /api/create-checkout.js
// Creates a Stripe Checkout Session for league registration (team or free agent)

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    division_id, division_name, team_name, captain_email,
    is_new_team, is_free_agent, player_name, partner_request,
    team_id, amount_cents, season_name, roster, rename_from,
  } = req.body;

  if (!division_id || !captain_email || !amount_cents) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  if (!is_free_agent && !team_name) {
    return res.status(400).json({ error: "Team name required" });
  }
  if (is_free_agent && !player_name) {
    return res.status(400).json({ error: "Player name required for free agent registration" });
  }

  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET) return res.status(500).json({ error: "Stripe not configured" });

  const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, "") || "https://tangtime.app";

  try {
    const productName = is_free_agent
      ? `Free Agent Registration — ${division_name || "Division"}`
      : `League Registration — ${division_name || "Division"}`;

    const productDesc = is_free_agent
      ? `${season_name || "Season"} · Player: ${player_name}`
      : `${season_name || "Season"} · Team: ${team_name}`;

    const params = new URLSearchParams({
      "mode": "payment",
      "success_url": `${origin}/register?success=true&session_id={CHECKOUT_SESSION_ID}`,
      "cancel_url": `${origin}/register?canceled=true`,
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][product_data][name]": productName,
      "line_items[0][price_data][product_data][description]": productDesc,
      "line_items[0][price_data][unit_amount]": String(amount_cents),
      "line_items[0][quantity]": "1",
      "customer_email": captain_email,
      "metadata[division_id]": division_id,
      "metadata[team_name]": team_name || "",
      "metadata[team_id]": team_id || "",
      "metadata[is_new_team]": String(is_new_team || false),
      "metadata[is_free_agent]": String(is_free_agent || false),
      "metadata[player_name]": player_name || "",
      "metadata[partner_request]": partner_request || "",
      "metadata[captain_email]": captain_email,
      "metadata[roster]": JSON.stringify(roster || []),
      "metadata[rename_from]": rename_from || "",
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

    return res.status(200).json({ url: session.url, session_id: session.id });
  } catch (err) {
    console.error("Checkout error:", err);
    return res.status(500).json({ error: err.message });
  }
}
