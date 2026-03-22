export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { address, bedrooms, purchasePrice, downPct } = req.body;

  if (!address || !bedrooms || !purchasePrice || !downPct) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured. Please add ANTHROPIC_API_KEY in Vercel environment variables.' });
  }

  const prompt = `You are Dealora, a Canadian short-term rental (STR/Airbnb) deal analyzer. Analyze this deal and return ONLY a JSON object, no markdown, no explanation, no backticks.

Property: ${address}
Bedrooms: ${bedrooms}
Purchase Price: $${Number(purchasePrice).toLocaleString()}
Down Payment: ${(downPct * 100).toFixed(0)}%

Return this exact JSON structure with realistic Canadian STR estimates:

{
  "market": "City, Province",
  "adr": 250,
  "occupancy": 0.68,
  "monthlyRevenue": 5100,
  "annualRevenue": 61200,
  "expenses": {
    "mortgage": 2800,
    "propertyTax": 350,
    "insurance": 200,
    "management": 765,
    "utilities": 250,
    "maintenance": 300,
    "cleaning": 400
  },
  "cashflow": 35,
  "annualCashflow": 420,
  "cocReturn": 0.012,
  "capRate": 0.045,
  "dealScore": 62,
  "verdict": "Solid Deal",
  "verdictReason": "One sentence explaining the verdict.",
  "comps": [
    { "name": "Listing name", "adr": 220, "occupancy": 0.65, "beds": 2 },
    { "name": "Listing name", "adr": 260, "occupancy": 0.71, "beds": 2 },
    { "name": "Listing name", "adr": 240, "occupancy": 0.68, "beds": 2 }
  ],
  "insights": [
    { "type": "positive", "text": "Insight about this deal." },
    { "type": "neutral", "text": "Insight about this market." },
    { "type": "warning", "text": "Risk to consider." },
    { "type": "positive", "text": "Another strength." }
  ],
  "bestMonths": "June, July, August",
  "strRisk": "Medium"
}

verdict must be one of: "Strong Buy", "Solid Deal", "Marginal", "Pass"
strRisk must be one of: "Low", "Medium", "High"
insight type must be one of: "positive", "neutral", "warning"
Return ONLY the JSON. No other text.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic error:', JSON.stringify(data));
      return res.status(500).json({ error: 'Anthropic API error: ' + (data.error?.message || 'Unknown error') });
    }

    const text = data.content?.map(i => i.text || '').join('') || '';
    const clean = text.replace(/```json|```/g, '').trim();

    let result;
    try {
      result = JSON.parse(clean);
    } catch (parseErr) {
      console.error('JSON parse error. Raw text:', text);
      return res.status(500).json({ error: 'Failed to parse analysis. Please try again.' });
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
