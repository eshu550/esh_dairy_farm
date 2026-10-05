// api/ask.js
//
// Vercel serverless function — secure proxy to Google's Gemini API for the
// in-app "Ask AI" feature. Vercel auto-detects anything under /api as a
// serverless function regardless of your frontend framework, so you don't
// need any extra config for this to work alongside your Vite app.
//
// This uses Gemini instead of Claude because Gemini has a genuine free tier
// (no card, no spend) for the model below — a good fit for a single farm
// asking a handful of questions a day. The trade-off: on the free tier,
// Google may use what you send to improve their models, and there are
// rate limits (generous enough for personal use, but they exist).
//
// SETUP (one-time):
//   1. Go to https://aistudio.google.com/app/apikey and click "Create API key"
//      (sign in with any Google account — no billing required for the free tier).
//   2. In your Vercel project: Settings -> Environment Variables
//        Name:  GEMINI_API_KEY
//        Value: (paste the key)
//      Add it for Production (and Preview/Development if you test locally).
//   3. Redeploy. That's it — no other code changes needed.
//
// This file never exposes your API key to the browser: the key only ever
// lives on Vercel's server and is read from the environment at request time.

// Google's free-tier model lineup shifts over time — if this model ever
// stops being free or gets retired, swap the name here. Check the current
// list at https://ai.google.dev/gemini-api/docs/pricing
const MODEL = 'gemini-3.8-flash';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The free tier occasionally returns 503 "model is overloaded" — this is
// genuinely transient (Google says so in the message itself), so retry a
// couple of times with a short, increasing delay before giving up.
async function callGeminiWithRetry(url, options, attempts = 3) {
  let lastResponse, lastData;
  for (let i = 0; i < attempts; i++) {
    const response = await fetch(url, options);
    const data = await response.json();
    if (response.ok) return { response, data };
    lastResponse = response;
    lastData = data;
    const isOverloaded = response.status === 503 || response.status === 429;
    if (!isOverloaded || i === attempts - 1) break;
    await sleep(600 * (i + 1)); // 600ms, then 1200ms
  }
  return { response: lastResponse, data: lastData };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { question, context, history, focusCow } = req.body || {};

  if (!question || typeof question !== 'string' || !question.trim()) {
    res.status(400).json({ error: 'Missing question.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: "The AI assistant isn't set up yet — add a GEMINI_API_KEY environment variable in your Vercel project settings and redeploy.",
    });
    return;
  }

  const today = (context && context.today) || new Date().toISOString().slice(0, 10);
  const farmName = (context && context.farmName) || 'the farm';

  const systemPrompt = `You are the built-in AI assistant inside "${farmName}"'s dairy farm management app.
You answer the farm owner's questions using ONLY the farm data given below — never invent numbers, dates, or records that aren't present in it.
${focusCow ? `This conversation was opened from ${focusCow}'s page — if a question is ambiguous about which animal it refers to, assume it's about ${focusCow} unless the question says otherwise.` : ''}

Rules:
- Be direct and concise. Answer in plain conversational language — no JSON, no markdown tables, no headers.
- If the data needed to answer isn't present, say so plainly rather than guessing.
- When doing math (totals, averages, counts, date differences), compute carefully from the raw records given — don't round carelessly.
- All dates in the data are in YYYY-MM-DD format. Today's date is ${today}.
- Keep answers short — a sentence or two, or a short list — unless the question clearly asks for more detail.

FARM DATA (JSON):
${JSON.stringify(context || {})}`;

  const contents = [
    ...(Array.isArray(history) ? history.filter((m) => m && m.content).slice(-10) : [])
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    { role: 'user', parts: [{ text: question }] },
  ];

  try {
    const { response, data } = await callGeminiWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { maxOutputTokens: 1024 },
        }),
      }
    );

    if (!response.ok) {
      const isOverloaded = response.status === 503 || response.status === 429;
      res.status(response.status).json({
        error: isOverloaded
          ? "The AI is getting a lot of requests right now — please try again in a minute."
          : (data && data.error && data.error.message) || 'The AI service returned an error.',
      });
      return;
    }

    const candidate = (data.candidates || [])[0];
    const answer = candidate
      ? (candidate.content?.parts || []).map((p) => p.text || '').join('').trim()
      : '';

    if (!answer) {
      // Most common cause: the response was blocked by a safety filter, or
      // the free-tier rate limit was hit for the moment.
      const reason = candidate?.finishReason || data?.promptFeedback?.blockReason;
      res.status(200).json({
        answer: reason === 'SAFETY' || reason === 'BLOCKED'
          ? "I can't answer that one — try rephrasing the question."
          : "I couldn't come up with an answer for that. Please try again.",
      });
      return;
    }

    res.status(200).json({ answer });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong talking to the AI service. Please try again.' });
  }
}
