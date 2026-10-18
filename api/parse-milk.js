// api/parse-milk.js
//
// Vercel serverless function — turns a spoken milk record such as
//   "Ganga eight, Lakshmi six point five, Radha seven and a half, yesterday evening"
// into structured data the Log Milk form can use. It uses the SAME GROQ_API_KEY
// as api/ask.js and api/transcribe.js, so there's nothing new to set up.
//
// This function only EXTRACTS what was said (name as heard + litres + optional
// morning/evening and day). Matching the heard names to your real cows, and all
// the sanity checks, happen in the app so you always get a review screen first.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODELS_BY_LANGUAGE = {
  en: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'],
  kn: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'], // larger model first for Kannada
};

// Strict schema: Groq guarantees the reply matches this exactly (every field required).
const SCHEMA = {
  type: 'object',
  properties: {
    session: { type: 'string', enum: ['AM', 'PM', 'none'] },
    day: { type: 'string', enum: ['today', 'yesterday', 'none'] },
    entries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heard: { type: 'string' },
          name_latin: { type: 'string' },
          tag: { type: 'string' },
          liters: { type: 'number' },
        },
        required: ['heard', 'name_latin', 'tag', 'liters'],
        additionalProperties: false,
      },
    },
  },
  required: ['session', 'day', 'entries'],
  additionalProperties: false,
};

function buildSystemPrompt(cows) {
  const list = cows.map((c) => `${c.name} (tag ${c.tag})`).join(', ');
  return `You convert a spoken dairy-farm milk record into structured data. The speaker names cows and says how many litres of milk each one gave in a single milking. The text comes from speech recognition, so names can be slightly misspelled.

Known animals: ${list || 'none'}.

Return JSON with:
- entries: one item per cow the speaker gave a number for, in the order spoken.
  - heard: the name exactly as it appears in the text (or the tag number if only a tag was spoken).
  - name_latin: that name spelled in English letters. If the text is in Kannada script, transliterate it. If it clearly sounds like one of the known animals, use that animal's spelling.
  - tag: the ear-tag number ONLY if the speaker said a tag number instead of a name, otherwise an empty string.
  - liters: the amount as a decimal number ("eight" -> 8, "six point five" -> 6.5, "seven and a half" -> 7.5; Kannada number words too). "zero"/"none" -> 0.
- session: "AM" if the speaker says morning, "PM" if they say evening, night or afternoon, otherwise "none".
- day: "yesterday" if the speaker says yesterday, "today" if they explicitly say today, otherwise "none".

Rules: never invent animals or numbers. If a name has no number, leave it out. If the speaker says to skip a cow, leave it out. If nothing usable was said, return an empty entries list.`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Voice isn't set up yet — add a GROQ_API_KEY environment variable in your Vercel project settings and redeploy." });
    return;
  }

  const { transcript, language, cows } = req.body || {};
  const text = typeof transcript === 'string' ? transcript.trim().slice(0, 2000) : '';
  if (!text) {
    res.status(400).json({ error: 'Nothing to read.' });
    return;
  }
  const lang = language === 'kn' ? 'kn' : 'en';
  const cowList = (Array.isArray(cows) ? cows : [])
    .filter((c) => c && typeof c.name === 'string')
    .slice(0, 80)
    .map((c) => ({ name: c.name.slice(0, 30), tag: String(c.tag == null ? '' : c.tag).slice(0, 12) }));

  const baseBody = {
    messages: [
      { role: 'system', content: buildSystemPrompt(cowList) },
      { role: 'user', content: text },
    ],
    temperature: 0,
    max_completion_tokens: 1200,
    reasoning_effort: 'low',
    include_reasoning: false,
  };

  const call = (model, mode) => fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      ...baseBody,
      model,
      response_format: mode === 'schema'
        ? { type: 'json_schema', json_schema: { name: 'milk_entries', strict: true, schema: SCHEMA } }
        : { type: 'json_object' },
    }),
  });

  try {
    let last = null;
    for (const model of MODELS_BY_LANGUAGE[lang]) {
      let response = await call(model, 'schema');
      let data = await response.json().catch(() => ({}));

      // If strict schema output isn't accepted for this model, fall back to plain JSON mode.
      if (response.status === 400 && /response_format|json_schema|schema|strict/i.test((data && data.error && data.error.message) || '')) {
        response = await call(model, 'json');
        data = await response.json().catch(() => ({}));
      }

      if (response.ok) {
        const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
        const parsed = safeParse(content);
        if (parsed) {
          res.status(200).json(clean(parsed));
          return;
        }
        last = { status: 502, data: {} };
        continue; // unreadable output -> try the next model
      }

      last = { status: response.status, data };
      if ([429, 500, 502, 503].includes(response.status)) continue;
      break;
    }

    const status = (last && last.status) || 500;
    const apiMsg = (last && last.data && last.data.error && last.data.error.message) || '';
    let error = "I couldn't work out the milk numbers from that. Please try again.";
    if (status === 401) error = "The AI key isn't valid — check GROQ_API_KEY in your Vercel settings.";
    else if (status === 429) {
      error = /per day|\(TPD\)|\(RPD\)/i.test(apiMsg)
        ? "You've used up today's free AI allowance — it resets within 24 hours. You can still type the milk."
        : 'The free AI is at its per-minute limit — wait a moment and try again.';
    } else if (status >= 500) error = 'The AI service is busy right now — please try again in a moment.';
    res.status(status === 429 ? 429 : 502).json({ error });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong while reading the recording. Please try again.' });
  }
}

function safeParse(content) {
  try { return JSON.parse(content); } catch (e) { /* try to find the JSON inside */ }
  const a = content.indexOf('{');
  const b = content.lastIndexOf('}');
  if (a !== -1 && b > a) {
    try { return JSON.parse(content.slice(a, b + 1)); } catch (e) { /* fall through */ }
  }
  return null;
}

// Whatever the model sent, only pass on safe, well-formed values.
function clean(p) {
  const entries = (Array.isArray(p.entries) ? p.entries : [])
    .map((e) => ({
      heard: String((e && e.heard) || '').slice(0, 40),
      name_latin: String((e && e.name_latin) || '').slice(0, 40),
      tag: String((e && e.tag) || '').replace(/[^0-9A-Za-z-]/g, '').slice(0, 12),
      liters: Number(e && e.liters),
    }))
    .filter((e) => Number.isFinite(e.liters) && e.liters >= 0 && e.liters <= 200 && (e.heard || e.name_latin || e.tag))
    .slice(0, 80)
    .map((e) => ({ ...e, liters: Math.round(e.liters * 100) / 100 }));
  return {
    session: p.session === 'AM' || p.session === 'PM' ? p.session : 'none',
    day: p.day === 'yesterday' || p.day === 'today' ? p.day : 'none',
    entries,
  };
}
