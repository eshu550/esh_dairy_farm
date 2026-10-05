// api/ask.js
//
// Vercel serverless function — secure proxy to the Anthropic API for the
// in-app "Ask AI" feature. Vercel auto-detects anything under /api as a
// serverless function regardless of your frontend framework, so you don't
// need any extra config for this to work alongside your Vite app.
//
// SETUP (one-time):
//   1. Get an API key at https://console.anthropic.com/settings/keys
//   2. In your Vercel project: Settings -> Environment Variables
//        Name:  ANTHROPIC_API_KEY
//        Value: sk-ant-...   (paste your key)
//      Add it for Production (and Preview/Development if you test locally).
//   3. Redeploy. That's it — no other code changes needed.
//
// This file never exposes your API key to the browser: the key only ever
// lives on Vercel's server and is read from the environment at request time.

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: "The AI assistant isn't set up yet — add an ANTHROPIC_API_KEY environment variable in your Vercel project settings and redeploy.",
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

  const messages = [
    ...(Array.isArray(history) ? history.filter((m) => m && m.content).slice(-10) : []),
    { role: 'user', content: question },
  ];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        // Swap to 'claude-haiku-4-5-20251001' if you want faster/cheaper
        // answers — plenty good for straightforward data lookups like these.
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      res.status(response.status).json({ error: (data && data.error && data.error.message) || 'The AI service returned an error.' });
      return;
    }

    const answer = (data.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    res.status(200).json({ answer: answer || "I couldn't come up with an answer for that." });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong talking to the AI service. Please try again.' });
  }
}
