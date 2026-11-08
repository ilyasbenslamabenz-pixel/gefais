// Effets sonores synthétisés (Web Audio) : aucun fichier audio à télécharger.
import { useStore } from './store';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let loop: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode; osc: OscillatorNode; oscGain: GainNode } | null = null;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  master!.gain.value = useStore.getState().settings.volume * 0.5;
  return ctx;
}

export function unlockAudio() {
  ensure();
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.3, delay = 0, slide = 0) {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, freq: number, vol = 0.3, q = 1) {
  const c = ensure();
  if (!c || !master || !noiseBuf) return;
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t);
  s.stop(t + dur);
}

export const sfx = {
  click: () => tone(660, 0.06, 'triangle', 0.15),
  coin: () => [0, 0.07, 0.14].forEach((d, i) => tone(880 * Math.pow(1.26, i), 0.18, 'square', 0.12, d)),
  buy: () => [0, 0.08, 0.16, 0.24].forEach((d, i) => tone(523 * Math.pow(1.19, i), 0.25, 'triangle', 0.2, d)),
  error: () => tone(160, 0.2, 'sawtooth', 0.15, 0, -60),
  level: () => [0, 0.1, 0.2, 0.3, 0.45].forEach((d, i) => tone(440 * Math.pow(1.25, i), 0.35, 'triangle', 0.22, d)),
  pickup: () => tone(1200, 0.12, 'sine', 0.15, 0, 600),
  breakIt: () => { noise(0.35, 500, 0.5, 0.7); tone(120, 0.25, 'square', 0.15, 0, -60); },
  jump: () => noise(0.25, 900, 0.15, 2),
  engine: () => tone(90, 0.4, 'sawtooth', 0.12, 0, 60),
  msg: () => tone(990, 0.08, 'sine', 0.1),
};

/** Boucle sonore continue pendant le nettoyage. */
export function setCleaningSound(active: boolean, tool: number, vehicle: boolean) {
  const c = ensure();
  if (!c || !master || !noiseBuf) return;
  if (!loop) {
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    const gain = c.createGain();
    gain.gain.value = 0;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    const oscGain = c.createGain();
    oscGain.gain.value = 0;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    src.connect(filter).connect(gain).connect(master);
    osc.connect(lp).connect(oscGain).connect(master);
    src.start();
    osc.start();
    loop = { src, filter, gain, osc, oscGain };
  }
  const t = c.currentTime;
  const vacuum = tool >= 3 || vehicle;
  loop.filter.frequency.setTargetAtTime(vacuum ? 1800 : 3200 + Math.sin(t * 20) * 800, t, 0.05);
  loop.filter.Q.value = vacuum ? 0.6 : 1.5;
  loop.gain.gain.setTargetAtTime(active ? (vacuum ? 0.12 : 0.08) : 0, t, 0.08);
  loop.osc.frequency.setTargetAtTime(vehicle ? 70 : 110 + tool * 15, t, 0.1);
  loop.oscGain.gain.setTargetAtTime(active && vacuum ? 0.05 : 0, t, 0.1);
}
