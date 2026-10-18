// api/transcribe.js
//
// Vercel serverless function — turns a short voice recording into text for the
// in-app "Ask AI" voice button, using Groq's Whisper speech-to-text.
// It uses the SAME GROQ_API_KEY you already added for api/ask.js, so there's
// nothing new to set up in Vercel. Works in all browsers (the app records with
// MediaRecorder, so it doesn't depend on the browser's built-in speech engine).
//
// Two languages are supported: English ('en') and Kannada ('kn'). The app tells us
// which one the user picked, and we pass it to Whisper explicitly. (Letting Whisper
// auto-detect made it mis-hear short or accented speech as other languages.)

const GROQ_STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

// Per-language settings. Turbo is fastest (best for English); the full model is
// more accurate for Kannada. Each model has its own free limits, so the second
// one is also the fallback if the first is busy.
const LANGUAGES = {
  en: {
    models: ['whisper-large-v3-turbo', 'whisper-large-v3'],
    intro: 'Questions about a dairy farm: milk, heat, insemination, vaccination, feed, expenses.',
    namesLabel: 'Cow names:',
    silence: ['thank you', 'thank you.', 'thanks.', 'thanks for watching', 'thanks for watching!', 'you', 'bye', 'bye.', '.'],
  },
  kn: {
    models: ['whisper-large-v3', 'whisper-large-v3-turbo'],
    intro: 'ಹೈನುಗಾರಿಕೆ ಫಾರ್ಮ್ ಬಗ್ಗೆ ಪ್ರಶ್ನೆಗಳು: ಹಾಲು, ಹಸು, ಲಸಿಕೆ, ಮೇವು, ಖರ್ಚು.',
    namesLabel: 'ಹಸುಗಳ ಹೆಸರುಗಳು:',
    silence: ['ಧನ್ಯವಾದಗಳು', 'ಧನ್ಯವಾದಗಳು.', 'ಧನ್ಯವಾದ', 'ಧನ್ಯವಾದ.', '.'],
  },
};

// Vercel rejects request bodies over ~4.5 MB; a 60-second voice clip is far smaller than this.
const MAX_AUDIO_BYTES = 3 * 1024 * 1024;

const EXTENSIONS = {
  'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
};

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

  const { audio, mime, names, language } = req.body || {};
  const langCode = LANGUAGES[language] ? language : 'en';
  const lang = LANGUAGES[langCode];
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
  const prompt = (lang.intro + (nameList ? ` ${lang.namesLabel} ${nameList}.` : '')).slice(0, 600);

  const transcribe = (model) => {
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: baseMime }), `voice.${extension}`);
    form.append('model', model);
    form.append('response_format', 'json');
    form.append('temperature', '0');
    form.append('language', langCode);
    form.append('prompt', prompt);
    return fetch(GROQ_STT_URL, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form });
  };

  try {
    let last = null;
    for (const model of lang.models) {
      const response = await transcribe(model);
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        const text = String((data && data.text) || '').trim();
        const lowered = text.toLowerCase();
        // Silence can make Whisper echo our prompt or invent a stock phrase — treat both as "nothing heard".
        if (!text || text.length < 2 || lowered.includes(lang.intro.slice(0, 18).toLowerCase()) || lang.silence.includes(lowered)) {
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
