// api/ask.js
//
// Vercel serverless function — secure proxy to Groq's API for the in-app
// "Ask AI" feature. Groq is very fast and has a free plan (no card needed).
// Vercel auto-detects anything under /api as a serverless function, so this
// works alongside your Vite app with no extra config.
//
// SETUP (one-time):
//   1. Go to https://console.groq.com/keys and click "Create API Key"
//      (sign in with Google/GitHub — no billing needed for the free plan).
//   2. In your Vercel project: Settings -> Environment Variables
//        Name:  GROQ_API_KEY
//        Value: (paste the key, it starts with gsk_)
//      Add it for Production (and Preview if you test on PR links).
//   3. Redeploy. No other changes needed.
//
// FREE-PLAN LIMITS (per model, Oct 2026): 30 requests/min, 1,000 requests/day,
// but only ~8,000 tokens/min and ~200,000 tokens/day. The app therefore sends a
// COMPACT farm summary (see buildFarmContext in App.jsx), and this function
// falls back to a second model (separate limits) if the first is busy.
//
// The API key never reaches the browser — it only lives on Vercel's server.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Each model has its own free limits, so falling back to the second one
// effectively doubles what you can ask per minute / per day.
// English: fastest model first. Kannada: the larger model first (better Kannada).
const MODELS_BY_LANGUAGE = {
  en: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'],
  kn: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
};

const MAX_CONTEXT_CHARS = 15000; // hard safety cap (keeps requests under the free per-minute token limit)

const LANGUAGE_RULES = {
  en: '- Always reply in English, even if the question looks like it is in another language (it may be a mis-heard voice recording — just answer the most likely farm question, or ask the person to repeat it).',
  kn: '- Always reply in Kannada (ಕನ್ನಡ script). Keep animal names, numbers, dates and the ₹ sign exactly as in the data (write numbers with digits). The question may be typed or spoken in Kannada and may spell animal names in Kannada script — match them to the English names in the data. If the question looks mis-heard or unclear, politely ask the person to repeat it in Kannada.',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { question, context, history, focusCow, language } = req.body || {};
  const lang = language === 'kn' ? 'kn' : 'en';

  if (!question || typeof question !== 'string' || !question.trim()) {
    res.status(400).json({ error: 'Missing question.' });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: "The AI assistant isn't set up yet — add a GROQ_API_KEY environment variable in your Vercel project settings and redeploy.",
    });
    return;
  }

  const contextText = (typeof context === 'string' ? context : JSON.stringify(context || {})).slice(0, MAX_CONTEXT_CHARS);

  const systemPrompt = `You are the built-in assistant inside a dairy farm management app. Answer the farm owner's questions using ONLY the farm data below. Never invent numbers, dates, animals or records that are not in the data.
${focusCow ? `The chat was opened from the page of ${focusCow}; if a question doesn't say which animal, assume it is about ${focusCow}.` : ''}

Rules:
- Be direct and brief: one or two sentences, or a short list. Plain language, no markdown tables or headers.
- Do arithmetic carefully (totals, averages, counts, date differences) from the records given.
- Dates are YYYY-MM-DD. "TODAY" in the data header is the current date.
- The data only covers the windows listed under DATA WINDOWS. If the question needs older or missing data, say so plainly instead of guessing.
- Currency is Indian rupees (₹); milk is in litres.
${LANGUAGE_RULES[lang]}

FARM DATA:
${contextText}`;

  const past = (Array.isArray(history) ? history : [])
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .slice(-6)
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content.slice(0, 500) }));

  const baseBody = {
    messages: [
      { role: 'system', content: systemPrompt },
      ...past,
      { role: 'user', content: question.slice(0, 1000) },
    ],
    temperature: 0.3,
    max_completion_tokens: lang === 'kn' ? 1400 : 900, // Kannada text uses more tokens
  };

  const callGroq = (model, withReasoningOptions) => fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      ...baseBody,
      model,
      // These models "think" before answering; keep that short and don't return it.
      ...(withReasoningOptions ? { reasoning_effort: 'low', include_reasoning: false } : {}),
    }),
  });

  try {
    let last = null; // { status, data }
    for (const model of MODELS_BY_LANGUAGE[lang]) {
      let response = await callGroq(model, true);
      let data = await response.json().catch(() => ({}));

      // If a reasoning option isn't accepted for this model, retry once without it.
      if (response.status === 400 && /reasoning/i.test((data && data.error && data.error.message) || '')) {
        response = await callGroq(model, false);
        data = await response.json().catch(() => ({}));
      }

      if (response.ok) {
        const choice = data.choices && data.choices[0];
        const answer = ((choice && choice.message && choice.message.content) || '').trim();
        if (answer) {
          res.status(200).json({ answer });
          return;
        }
        res.status(200).json({
          answer: choice && choice.finish_reason === 'length'
            ? 'That answer got cut off — try asking something a bit more specific.'
            : "I couldn't come up with an answer for that. Please try again.",
        });
        return;
      }

      last = { status: response.status, data };
      // Busy / rate-limited / server hiccup -> try the next model (it has its own limits).
      if ([429, 500, 502, 503].includes(response.status)) continue;
      break;
    }

    const status = (last && last.status) || 500;
    const apiMsg = (last && last.data && last.data.error && last.data.error.message) || '';
    let error = 'The AI service returned an error. Please try again.';
    if (status === 401) error = "The AI key isn't valid — check GROQ_API_KEY in your Vercel settings.";
    else if (status === 413) error = 'That question needs more farm data than the free plan allows at once. Try asking about one animal or a shorter time range.';
    else if (status === 429) {
      error = /per day|\(TPD\)|\(RPD\)/i.test(apiMsg)
        ? "You've used up today's free AI allowance — it resets within 24 hours."
        : "The free AI is at its per-minute limit — please wait about a minute and try again.";
    } else if (status === 503 || status === 502 || status === 500) error = 'The AI service is busy right now — please try again in a moment.';
    res.status(status === 429 || status === 413 ? status : 502).json({ error });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong talking to the AI service. Please try again.' });
  }
}
