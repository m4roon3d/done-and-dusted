// The opening tune for the "Alarm bonk" splash: tick-tock, alarm bell, boing, pop, sparkles, ta-da.
// Every sound is made from oscillators and noise, so there are no audio files.
// startedAt is performance.now() when the animation began; sounds whose moment has passed are skipped,
// so the tune stays in step even if the app took a moment to load.
// Browsers block sound before the first tap; then the context stays suspended and nothing plays.

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const hz = (n) => { const m = n.match(/^([A-G])(\d)$/); return 440 * Math.pow(2, (NOTE[m[1]] - 9) / 12 + (+m[2] - 4)); };

export function playSplashSound(startedAt) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  let ctx;
  try { ctx = new AC(); } catch { return null; }
  const out = ctx.createGain();
  out.gain.value = .8;
  out.connect(ctx.createDynamicsCompressor()).connect(ctx.destination);
  let noiseBuf = null, closed = false;
  const close = () => { if (!closed) { closed = true; ctx.close().catch(() => {}); } };

  const env = (g, t, peak, a, d) => { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + d); };
  const tone = (t, f, { type = "sine", vol = .15, a = .005, d = .4, to = null } = {}) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + a + d);
    env(g, t, vol, a, d); o.connect(g).connect(out); o.start(t); o.stop(t + a + d + .05);
  };
  const noise = (t, dur, { type = "bandpass", f = 2000, vol = .1 } = {}) => {
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; fl.type = type; fl.frequency.value = f; env(g, t, vol, .005, Math.max(.02, dur));
    s.connect(fl).connect(g).connect(out); s.start(t); s.stop(t + dur + .05);
  };
  const glock = (t, n, v = .12) => { const f = hz(n); tone(t, f, { vol: v, d: 1.1 }); tone(t, f * 2.76, { vol: v * .3, d: .4 }); };
  const marimba = (t, n, v = .06) => { const f = hz(n); tone(t, f, { vol: v, d: .22 }); tone(t, f * 3.9, { vol: v * .25, d: .05 }); };
  const wood = (t, f) => { tone(t, f, { vol: .2, d: .05 }); noise(t, .025, { type: "highpass", f: 3000, vol: .05 }); };
  const boing = (t, f0, f1, v) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain();
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + .35);
    l.frequency.value = 22; lg.gain.value = f0 * .08; l.connect(lg).connect(o.frequency);
    env(g, t, v, .005, .4); o.connect(g).connect(out); o.start(t); l.start(t); o.stop(t + .5); l.stop(t + .5);
  };

  const schedule = () => {
    if (closed || ctx.state !== "running") { close(); return; }
    const base = ctx.currentTime - (performance.now() - startedAt) / 1000 + .03;
    const at = (x, fn) => { const t = base + x; if (t >= ctx.currentTime - .01) fn(Math.max(t, ctx.currentTime)); };
    at(0, (t) => wood(t, 1400)); at(.2, (t) => wood(t, 1000));                                   // tick-tock
    for (let x = .32, i = 0; x < 1.02; x += .045, i++) at(x, (t) => tone(t, i % 2 ? 2093 : 2349, { type: "triangle", vol: .045, d: .04 })); // brrring
    at(1.05, (t) => { boing(t, 520, 140, .17); wood(t, 300); });                                 // BONK
    at(1.22, (t) => { tone(t, 600, { vol: .2, d: .08, to: 1600 }); noise(t, .05, { type: "highpass", f: 2000, vol: .12 }); }); // pop
    [["G5", 1.32], ["B5", 1.44], ["D6", 1.56]].forEach(([n, x]) => at(x, (t) => glock(t, n)));   // the three ticks land
    ["G4", "D5", "B4", "D5", "G4", "D5"].forEach((n, i) => at(1.25 + i * .2, (t) => marimba(t, n)));
    ["C5", "E5", "G5", "C6"].forEach((n, i) => at(1.8 + i * .065, (t) => glock(t, n, .11)));    // ta-da
    ["C4", "E4", "G4"].forEach((n) => at(2, (t) => tone(t, hz(n), { type: "triangle", vol: .035, a: .03, d: 1.1 })));
    setTimeout(close, 4000);
  };
  const p = ctx.state === "running" ? null : ctx.resume();
  if (p && p.then) Promise.race([p, new Promise((r) => setTimeout(r, 150))]).then(schedule, close); else schedule();

  return { stop() { if (closed) return; try { out.gain.setTargetAtTime(.0001, ctx.currentTime, .05); } catch {} setTimeout(close, 300); } };
}
