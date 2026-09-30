// 브라우저 TTS (Web Speech API)
let voices = [];
function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  voices = window.speechSynthesis.getVoices();
}
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

export const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

export function speak(text, { rate = 0.92 } = {}) {
  if (!ttsSupported || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = rate;
  const v = voices.find((x) => /en[-_]US/i.test(x.lang) && /female|samantha|zira|aria|jenny/i.test(x.name))
    || voices.find((x) => /en[-_]US/i.test(x.lang)) || voices.find((x) => /^en/i.test(x.lang));
  if (v) u.voice = v;
  window.speechSynthesis.speak(u);
}
export function stopSpeaking() { if (ttsSupported) window.speechSynthesis.cancel(); }
