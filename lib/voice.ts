// Browser-native speech synthesis — no API key, no external service.
// Picks the most "professional assistant" sounding female voice available
// on the user's OS/browser (Edge/Windows ship natural neural voices like
// Aria/Jenny; other platforms fall back down this list). The classic
// offline SAPI-style voices (e.g. plain "Zira") tend to sound robotic —
// scored lower on purpose, behind anything flagged Natural/Online/Neural.

const PREFERRED_FEMALE_VOICE_NAMES = [
  "Aria", // Microsoft Edge natural neural voice
  "Jenny", // Azure/Edge natural neural voice
  "Samantha", // macOS
  "Google UK English Female",
  "Victoria",
  "Karen",
  "Moira",
  "Tessa",
  "Zira", // classic Windows female voice — lowest priority, sounds dated
];

const QUALITY_HINTS = /natural|online|neural|premium|enhanced/i;

const STORAGE_KEY = "dcc-voice-uri";

function scoreVoice(voice: SpeechSynthesisVoice): number {
  let score = 0;
  const nameIndex = PREFERRED_FEMALE_VOICE_NAMES.findIndex((name) => voice.name.includes(name));
  if (nameIndex !== -1) score += (PREFERRED_FEMALE_VOICE_NAMES.length - nameIndex) * 10;
  if (QUALITY_HINTS.test(voice.name)) score += 50;
  if (!voice.localService) score += 5; // cloud-backed voices are usually the natural ones
  if (/female/i.test(voice.name)) score += 3;
  return score;
}

export function pickFemaleVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;

  const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const pool = english.length > 0 ? english : voices;

  const ranked = [...pool].sort((a, b) => scoreVoice(b) - scoreVoice(a));
  return ranked[0] ?? null;
}

// A saved choice always wins over auto-detection — the user knows what
// sounds good on their machine better than any heuristic can.
export function getSavedVoiceURI(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function saveVoiceURI(voiceURI: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, voiceURI);
}

export function resolvePreferredVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const savedURI = getSavedVoiceURI();
  if (savedURI) {
    const saved = voices.find((v) => v.voiceURI === savedURI);
    if (saved) return saved;
  }
  return pickFemaleVoice(voices);
}

export function getVoicesAsync(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const existing = window.speechSynthesis.getVoices();
    if (existing.length > 0) {
      resolve(existing);
      return;
    }
    window.speechSynthesis.onvoiceschanged = () => {
      resolve(window.speechSynthesis.getVoices());
    };
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 500);
  });
}

// Strips URLs before speech — nobody wants "h t t p s colon slash slash"
// read out loud, and marketing email is full of tracking links.
export function stripUrlsForSpeech(text: string): string {
  return text
    .replace(/\bhttps?:\/\/\S+/gi, "")
    .replace(/\bwww\.\S+/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
