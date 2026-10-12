let audio: AudioContext | null = null;

/** Call from the tap that opens the scanner: browsers only allow sound
 * from a context created or resumed inside a user gesture. */
export function primeScanSound() {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    // No Web Audio — scans just stay silent.
  }
}

/** A short beep (high when added, low when the code wasn't found) and a
 * buzz where the phone supports it, so the seller needn't look down. */
export function scanFeedback(ok: boolean) {
  navigator.vibrate?.(ok ? 40 : [60, 60, 60]);
  if (!audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.frequency.value = ok ? 1320 : 330;
  gain.gain.setValueAtTime(0.12, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.12);
  osc.connect(gain).connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + 0.12);
}
