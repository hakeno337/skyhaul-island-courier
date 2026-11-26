// Skyhaul — tiny WebAudio event sounds. No audio files: every blip is an
// oscillator envelope, created lazily on the first pilot input so the browser
// never blocks it. M fails silent and stays silent.

let ctx = null;
let muted = false;

export function unlockAudio() {
  if (ctx) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  } catch {
    ctx = null;
  }
}

function tone(freqA, freqB, seconds, type, gainPeak, when = 0) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqA, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(freqB, 1), t0 + seconds);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(gainPeak, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + seconds + 0.05);
}

export const sfx = {
  ring() { tone(880, 1320, 0.16, 'sine', 0.16); tone(1320, 1760, 0.2, 'sine', 0.1, 0.07); },
  checkpoint() { tone(660, 990, 0.14, 'triangle', 0.16); tone(990, 1320, 0.18, 'triangle', 0.12, 0.08); },
  warn() { tone(220, 196, 0.13, 'square', 0.07); },
  thud() { tone(120, 45, 0.28, 'sine', 0.3); },
  success() { [523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.22, 'triangle', 0.14, i * 0.09)); },
  fail() { tone(392, 130, 0.7, 'sawtooth', 0.1); },
  click() { tone(1200, 900, 0.05, 'sine', 0.08); },
};

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') muted = !muted;
});
