export function playChime(type: "start" | "end" | "break" = "end"): void {
  try {
    type AudioContextType = typeof AudioContext;
    const Ctx: AudioContextType =
      window.AudioContext ||
      ((window as unknown as { webkitAudioContext: AudioContextType }).webkitAudioContext);
    if (!Ctx) return;
    const ctx = new Ctx();

    const schedule: Array<{ freq: number; time: number; duration: number }> =
      type === "end"
        ? [
            { freq: 880, time: 0, duration: 0.35 },
            { freq: 660, time: 0.3, duration: 0.35 },
            { freq: 440, time: 0.6, duration: 0.5 },
          ]
        : type === "break"
        ? [
            { freq: 528, time: 0, duration: 0.35 },
            { freq: 440, time: 0.3, duration: 0.5 },
          ]
        : [{ freq: 660, time: 0, duration: 0.4 }];

    for (const note of schedule) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = note.freq;
      gain.gain.setValueAtTime(0.22, ctx.currentTime + note.time);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + note.time + note.duration
      );
      osc.start(ctx.currentTime + note.time);
      osc.stop(ctx.currentTime + note.time + note.duration + 0.05);
    }
  } catch {
    // Audio not supported
  }
}
