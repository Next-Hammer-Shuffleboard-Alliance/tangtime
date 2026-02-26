// Vercel Serverless Function — /api/verify-checkout.js
// Verifies Stripe session payment and updates registration to "paid"

const SUPA_URL = "https://ynwohnffmlfyejhfttxq.supabase.co/rest/v1";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlud29obmZmbWxmeWVqaGZ0dHhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NTUxMzIsImV4cCI6MjA4NjQzMTEzMn0.ICBlMtcXmWGxd8gKAa6miEVWpr0uJROUV3osfnhm-9g";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { session_id } = req.body;
  if (!session_id) return res.status(400).json({ error: "Missing session_id" });

  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET) return res.status(500).json({ error: "Stripe not configured" });

  try {
    // 1. Retrieve session from Stripe
    const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${session_id}`, {
      headers: { "Authorization": `Bearer ${STRIPE_SECRET}` },
    });
    const session = await stripeRes.json();

    if (!stripeRes.ok || session.payment_status !== "paid") {
      return res.status(400).json({ error: "Payment not completed", status: session.payment_status });
    }

    // 2. Update registration to paid
    const updateRes = await fetch(
      `${SUPA_URL}/registrations?stripe_session_id=eq.${session_id}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPA_KEY,
          Authorization: `Bearer ${SUPA_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          payment_status: "paid",
          stripe_payment_intent: session.payment_intent,
          updated_at: new Date().toISOString(),
        }),
      }
    );

    const updated = await updateRes.json();

    return res.status(200).json({
      success: true,
      team_name: session.metadata?.team_name,
      registration: updated?.[0] || null,
    });
  } catch (err) {
    console.error("Verify error:", err);
    return res.status(500).json({ error: err.message });
  }
}
