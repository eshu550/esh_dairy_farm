// api/transcribe.js
//
// Vercel serverless function — turns a short voice recording into text for the
// in-app "Ask AI" voice button, using Groq's Whisper speech-to-text.
// It uses the SAME GROQ_API_KEY you already added for api/ask.js, so there's
// nothing new to set up in Vercel. Works in all browsers (the app records with
// MediaRecorder, so it doesn't depend on the browser's built-in speech engine).
//
// Whisper understands 100+ languages (English, Hindi, Kannada, Tamil, Telugu,
// Marathi...) and auto-detects which one is being spoken.

const GROQ_STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

// Turbo is the fastest; fall back to the full model if turbo is busy (separate limits).
const MODELS = ['whisper-large-v3-turbo', 'whisper-large-v3'];

// Vercel rejects request bodies over ~4.5 MB; a 60-second voice clip is far smaller than this.
const MAX_AUDIO_BYTES = 3 * 1024 * 1024;

const EXTENSIONS = {
  'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
};

// Whisper sometimes "hears" these when the recording is silent or just noise.
const SILENCE_HALLUCINATIONS = new Set(['thank you', 'thank you.', 'thanks.', 'thanks for watching', 'thanks for watching!', 'you', 'bye', 'bye.', '.']);

const PROMPT_INTRO = 'Questions about a dairy farm: milk, heat, insemination, vaccination, feed, expenses.';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: "Voice isn't set up yet — add a GROQ_API_KEY environment variable in your Vercel project settings and redeploy.",
    });
    return;
  }

  const { audio, mime, names } = req.body || {};
  if (!audio || typeof audio !== 'string') {
    res.status(400).json({ error: 'No audio received.' });
    return;
  }

  const buffer = Buffer.from(audio, 'base64');
  if (!buffer.length) {
    res.status(400).json({ error: 'The recording was empty.' });
    return;
  }
  if (buffer.length > MAX_AUDIO_BYTES) {
    res.status(413).json({ error: 'That recording is too long — please keep it under a minute.' });
    return;
  }

  const baseMime = String(mime || 'audio/webm').split(';')[0].trim().toLowerCase();
  const extension = EXTENSIONS[baseMime] || 'webm';

  // Giving Whisper the animal names helps it spell them correctly.
  const nameList = Array.isArray(names)
    ? names.filter((n) => typeof n === 'string' && n.trim()).slice(0, 30).map((n) => n.trim().slice(0, 24)).join(', ')
    : '';
  const prompt = (PROMPT_INTRO + (nameList ? ` Cow names: ${nameList}.` : '')).slice(0, 600);

  const transcribe = (model) => {
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: baseMime }), `voice.${extension}`);
    form.append('model', model);
    form.append('response_format', 'json');
    form.append('temperature', '0');
    form.append('prompt', prompt);
    return fetch(GROQ_STT_URL, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form });
  };

  try {
    let last = null;
    for (const model of MODELS) {
      const response = await transcribe(model);
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        const text = String((data && data.text) || '').trim();
        const lowered = text.toLowerCase();
        // Silence can make Whisper echo our prompt or invent a stock phrase — treat both as "nothing heard".
        if (!text || text.length < 2 || lowered.includes('questions about a dairy farm') || SILENCE_HALLUCINATIONS.has(lowered)) {
          res.status(422).json({ error: "I couldn't hear anything — try again, a little closer to the microphone." });
          return;
        }
        res.status(200).json({ text });
        return;
      }

      last = { status: response.status, data };
      if ([429, 500, 502, 503].includes(response.status)) continue; // try the next model
      break;
    }

    const status = (last && last.status) || 500;
    const apiMsg = (last && last.data && last.data.error && last.data.error.message) || '';
    let error = "Couldn't understand the recording. Please try again.";
    if (status === 401) error = "The AI key isn't valid — check GROQ_API_KEY in your Vercel settings.";
    else if (status === 413) error = 'That recording is too long — please keep it under a minute.';
    else if (status === 429) {
      error = /per day|\(ASD\)|\(RPD\)|\(TPD\)/i.test(apiMsg)
        ? "You've used up today's free voice allowance — it resets within 24 hours. You can still type your question."
        : 'The free voice service is at its per-minute limit — wait a moment and try again.';
    } else if (status >= 500) error = 'The voice service is busy right now — please try again in a moment.';
    res.status(status === 429 || status === 413 ? status : 502).json({ error });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong while processing the recording. Please try again.' });
  }
}
