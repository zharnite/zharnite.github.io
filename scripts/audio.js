// Procedural audio. Nothing is downloaded and nothing is sampled: every sound
// here is synthesised from oscillators and noise at play time, which is also
// why there is no licensing question to answer.
//
// Architecture follows the pattern in the reference project: one lazily
// created AudioContext, a compressor on the master bus, and an onended reaper
// that disconnects every node so repeated plays cannot leak them.

const STORE_KEY = 'zharnite.sound';
const TRACK_KEY = 'zharnite.track';

let ctx = null;
let master = null;
let enabled = false;

// --- persistence ----------------------------------------------------------

function readStored() {
  try {
    return localStorage.getItem(STORE_KEY) === 'on';
  } catch (e) {
    return false;
  }
}

function writeStored(on) {
  try {
    localStorage.setItem(STORE_KEY, on ? 'on' : 'off');
  } catch (e) {
    /* private mode, blocked storage: not fatal */
  }
}

// Sound is off until asked for. Never autoplay.
enabled = readStored();

// --- graph ----------------------------------------------------------------

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    ctx.onstatechange = () => {
      try {
        if (ctx.state !== 'running' && !document.hidden) ctx.resume();
      } catch (e) {
        /* ignore */
      }
    };
  }
  return ctx;
}

function masterBus(ac) {
  if (!master || master.ac !== ac) {
    const comp = ac.createDynamicsCompressor();
    try {
      comp.threshold.value = -18;
      comp.knee.value = 24;
      comp.ratio.value = 6;
    } catch (e) {
      /* older implementations */
    }
    comp.connect(ac.destination);

    const g = ac.createGain();
    g.gain.value = 0.5;
    g.connect(comp);

    master = { ac, node: g };
  }
  return master.node;
}

// Disconnect everything once a source finishes.
function reap(src, ...nodes) {
  src.onended = () => {
    try {
      src.disconnect();
    } catch (e) {
      /* ignore */
    }
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch (e) {
        /* ignore */
      }
    }
  };
}

// The 1930s character is mostly bandwidth: old optical and shellac tracks had
// no deep bass and little above ~3.5 kHz. Running a modern synth voice through
// that window is most of the era cue.
function eraBus(ac, dest, lowHz, highHz) {
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = lowHz;

  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = highHz;

  hp.connect(lp);
  lp.connect(dest);
  return { input: hp, nodes: [hp, lp] };
}

function noiseBuffer(ac, dur) {
  const len = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// --- voices ---------------------------------------------------------------

// Brass: stacked detuned sawtooths through a resonant lowpass, with a fast
// attack transient. Exponential ramps must not target 0, hence 1e-4.
function brass(ac, dest, freq, at, dur, vol) {
  const g = ac.createGain();
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 3.2;
  f.frequency.setValueAtTime(freq * 2.2, at);
  f.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.2, 200), at + dur * 0.8);

  g.gain.setValueAtTime(1e-4, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.035);
  g.gain.setValueAtTime(vol, at + dur * 0.55);
  g.gain.exponentialRampToValueAtTime(1e-4, at + dur);

  g.connect(f);
  f.connect(dest);

  const oscs = [];
  [0, -6, 7].forEach((cents, i) => {
    const o = ac.createOscillator();
    o.type = i === 2 ? 'square' : 'sawtooth';
    o.frequency.value = freq;
    try {
      o.detune.value = cents;
    } catch (e) {
      /* ignore */
    }
    const og = ac.createGain();
    og.gain.value = i === 2 ? 0.22 : 0.5;
    o.connect(og);
    og.connect(g);
    o.start(at);
    o.stop(at + dur + 0.05);
    reap(o, og);
    oscs.push(o);
  });

  // Reap the shared nodes off the last oscillator to finish.
  reap(oscs[oscs.length - 1], g, f);
}

// Soft pad: triangle plus a sine an octave up, slow attack and long release.
function pad(ac, dest, freq, at, dur, vol) {
  const g = ac.createGain();
  g.gain.setValueAtTime(1e-4, at);
  g.gain.exponentialRampToValueAtTime(vol, at + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(1e-4, at + dur);
  g.connect(dest);

  const a = ac.createOscillator();
  a.type = 'triangle';
  a.frequency.value = freq;

  const b = ac.createOscillator();
  b.type = 'sine';
  b.frequency.value = freq * 2;
  const bg = ac.createGain();
  bg.gain.value = 0.3;

  a.connect(g);
  b.connect(bg);
  bg.connect(g);

  a.start(at);
  b.start(at);
  a.stop(at + dur + 0.05);
  b.stop(at + dur + 0.05);

  reap(a, g);
  reap(b, bg);
}

// Filtered noise with a slow swell: surf, or surface hiss.
function wash(ac, dest, at, dur, vol, hz, q) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, dur);

  const f = ac.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = hz;
  f.Q.value = q;

  const g = ac.createGain();
  g.gain.setValueAtTime(1e-4, at);
  g.gain.exponentialRampToValueAtTime(vol, at + dur * 0.4);
  g.gain.exponentialRampToValueAtTime(1e-4, at + dur);

  src.connect(f);
  f.connect(g);
  g.connect(dest);

  src.start(at);
  src.stop(at + dur);
  reap(src, f, g);
}

// --- stings ---------------------------------------------------------------

// A main-title fanfare in Bb: two pickup notes, a rise, then a held triad.
// Band-limited to sound like it came off a 1930s optical track.
function airshipSting(ac, bus) {
  const era = eraBus(ac, bus, 190, 3400);
  const d = era.input;
  const t = ac.currentTime + 0.04;

  const Bb3 = midiToHz(58);
  const D4 = midiToHz(62);
  const F4 = midiToHz(65);
  const Bb4 = midiToHz(70);

  brass(ac, d, F4, t + 0.00, 0.15, 0.16);
  brass(ac, d, F4, t + 0.17, 0.15, 0.16);
  brass(ac, d, Bb4, t + 0.34, 0.30, 0.20);

  const hold = t + 0.66;
  brass(ac, d, Bb3, hold, 1.70, 0.13);
  brass(ac, d, D4, hold + 0.02, 1.66, 0.11);
  brass(ac, d, F4, hold + 0.04, 1.62, 0.11);
  brass(ac, d, Bb4, hold + 0.06, 1.58, 0.09);

  // Surface noise, so it reads as a recording rather than a synth.
  wash(ac, bus, t, 2.5, 0.012, 2200, 0.7);
}

// Calm, wide, unhurried: a fifth over a slow surf wash.
function seaSting(ac, bus) {
  const t = ac.currentTime + 0.04;

  const D3 = midiToHz(50);
  const A3 = midiToHz(57);
  const D4 = midiToHz(62);

  pad(ac, bus, D3, t, 3.0, 0.085);
  pad(ac, bus, A3, t + 0.25, 2.8, 0.065);
  pad(ac, bus, D4, t + 0.55, 2.4, 0.045);

  wash(ac, bus, t, 3.2, 0.05, 520, 0.5);
}

// Stings are tied to the wallpaper, not the jukebox: they are the sound of
// changing the picture. 'none' deliberately has none.
const STINGS = {
  airship: airshipSting,
  'sea-sunset': seaSting,
  card: airshipSting,
  'card-mono': airshipSting,
};

// --- music ----------------------------------------------------------------
//
// Generative, not a loop. A fixed loop on a homepage is unbearable by the
// third pass; this walks a fixed chord progression and improvises a fresh
// line over it every time, so it never repeats exactly and stays background.
//
// Timing uses the Web Audio clock with a look-ahead scheduler. setTimeout is
// only accurate enough to decide *what* to schedule, never to place a note.

const LOOKAHEAD = 0.8;

// A 1930s sweet-band turnaround in F: I - ii - V, twice round.
const PROG = [
  { root: 41, tones: [0, 4, 7, 11] }, // Fmaj7
  { root: 38, tones: [0, 3, 7, 10] }, // Dm7
  { root: 43, tones: [0, 3, 7, 10] }, // Gm7
  { root: 36, tones: [0, 4, 7, 10] }, // C7
  { root: 41, tones: [0, 4, 7, 9] }, // F6
  { root: 45, tones: [0, 3, 7, 10] }, // Am7
  { root: 43, tones: [0, 3, 7, 10] }, // Gm7
  { root: 36, tones: [0, 4, 7, 10] }, // C7
];

const F_MAJOR = [0, 2, 4, 5, 7, 9, 11];

// The jukebox. Every track is the same harmony and the same players, wired
// differently: tempo, who turns up, how talkative the melody is. `pad` shuts
// the rhythm section off entirely and holds chords for that many beats
// instead, which is what makes a track ambient rather than a band.
export const TRACKS = [
  { id: 'off', label: 'Off' },
  {
    id: 'deco',
    label: 'Deco Band',
    bpm: 92,
    swing: 0.66,
    pad: 0,
    bass: true,
    strings: true,
    brass: true,
    brushes: true,
    mel: [0.6, 0.4],
  },
  {
    id: 'parlour',
    label: 'Parlour',
    bpm: 72,
    swing: 0.62,
    pad: 0,
    bass: true,
    strings: true,
    brass: false,
    brushes: false,
    mel: [0.36, 0.16],
  },
  {
    id: 'drift',
    label: 'Drift',
    bpm: 58,
    swing: 0.5,
    pad: 8,
    bass: false,
    strings: true,
    brass: false,
    brushes: false,
    mel: [0, 0],
  },
];

function getTrackDef(id) {
  return TRACKS.find((t) => t.id === id) || null;
}

let musicNodes = null;
let musicTimer = null;
let musicNextT = 0;
let musicBeat = 0;
let trackId = 'off';
let lastNote = 76;

// The optical-soundtrack chain, built once and shared by every note:
// band-limit, wow and flutter on pitch, and constant surface hiss.
function musicGraph(ac) {
  if (musicNodes && musicNodes.ac === ac) return musicNodes;

  const out = ac.createGain();
  out.gain.value = 0;
  out.connect(masterBus(ac));

  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 190;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3400;
  hp.connect(lp);
  lp.connect(out);

  // Wow is the slow drift of a warped disc; flutter is the faster waver of
  // the transport. Both modulate pitch, so they drive detune in cents.
  const wow = ac.createOscillator();
  wow.frequency.value = 0.7;
  const wowAmt = ac.createGain();
  wowAmt.gain.value = 7;
  wow.connect(wowAmt);
  wow.start();

  const flutter = ac.createOscillator();
  flutter.frequency.value = 6.3;
  const flutAmt = ac.createGain();
  flutAmt.gain.value = 2.5;
  flutter.connect(flutAmt);
  flutter.start();

  const hiss = ac.createBufferSource();
  hiss.buffer = noiseBuffer(ac, 2.0);
  hiss.loop = true;
  const hissF = ac.createBiquadFilter();
  hissF.type = 'bandpass';
  hissF.frequency.value = 2600;
  hissF.Q.value = 0.6;
  const hissG = ac.createGain();
  hissG.gain.value = 0.009;
  hiss.connect(hissF);
  hissF.connect(hissG);
  hissG.connect(out);
  hiss.start();

  musicNodes = { ac, out, input: hp, lfos: [wowAmt, flutAmt] };
  return musicNodes;
}

function warp(g, osc) {
  for (const lfo of g.lfos) {
    try {
      lfo.connect(osc.detune);
    } catch (e) {
      /* detune unsupported: the note just plays steady */
    }
  }
}

function mString(ac, g, freq, at, dur, vol) {
  const o = ac.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = freq;
  warp(g, o);

  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = Math.max(900, freq * 4);

  const gn = ac.createGain();
  gn.gain.setValueAtTime(1e-4, at);
  gn.gain.exponentialRampToValueAtTime(vol, at + dur * 0.3);
  gn.gain.setValueAtTime(vol, at + dur * 0.62);
  gn.gain.exponentialRampToValueAtTime(1e-4, at + dur);

  o.connect(f);
  f.connect(gn);
  gn.connect(g.input);
  o.start(at);
  o.stop(at + dur + 0.05);
  reap(o, f, gn);
}

// Clarinet: a closed pipe, so mostly odd harmonics. A square wave through a
// gentle bandpass is a serviceable stand-in.
function mReed(ac, g, freq, at, dur, vol) {
  const o = ac.createOscillator();
  o.type = 'square';
  o.frequency.value = freq;
  warp(g, o);

  const f = ac.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq * 2.1;
  f.Q.value = 1.1;

  const gn = ac.createGain();
  gn.gain.setValueAtTime(1e-4, at);
  gn.gain.exponentialRampToValueAtTime(vol, at + 0.045);
  gn.gain.exponentialRampToValueAtTime(1e-4, at + dur);

  o.connect(f);
  f.connect(gn);
  gn.connect(g.input);
  o.start(at);
  o.stop(at + dur + 0.05);
  reap(o, f, gn);
}

function mBass(ac, g, freq, at, dur, vol) {
  const o = ac.createOscillator();
  o.type = 'triangle';
  o.frequency.value = freq;
  warp(g, o);

  const gn = ac.createGain();
  gn.gain.setValueAtTime(1e-4, at);
  gn.gain.exponentialRampToValueAtTime(vol, at + 0.02);
  gn.gain.exponentialRampToValueAtTime(1e-4, at + dur);

  o.connect(gn);
  gn.connect(g.input);
  o.start(at);
  o.stop(at + dur + 0.05);
  reap(o, gn);
}

function mBrush(ac, g, at, vol) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.22);
  const f = ac.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 1500;
  const gn = ac.createGain();
  gn.gain.setValueAtTime(vol, at);
  gn.gain.exponentialRampToValueAtTime(1e-4, at + 0.2);
  src.connect(f);
  f.connect(gn);
  gn.connect(g.input);
  src.start(at);
  src.stop(at + 0.22);
  reap(src, f, gn);
}

function crackle(ac, g, at) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.02);
  const gn = ac.createGain();
  gn.gain.setValueAtTime(0.05, at);
  gn.gain.exponentialRampToValueAtTime(1e-4, at + 0.018);
  src.connect(gn);
  gn.connect(g.out);
  src.start(at);
  src.stop(at + 0.02);
  reap(src, gn);
}

// Weighted random walk: chord tones are likeliest, scale tones next, and big
// leaps are unlikely. The same idea the reference project used for its score.
function pickNote(ch, last) {
  const cands = [];
  let total = 0;
  for (let m = 69; m <= 86; m++) {
    const pc = (((m - 5) % 12) + 12) % 12;
    const inChord = ch.tones.some((iv) => ((((ch.root + iv - 5) % 12) + 12) % 12) === pc);
    let w = inChord ? 3 : F_MAJOR.indexOf(pc) >= 0 ? 1 : 0.05;
    const d = m - last;
    w *= Math.exp(-(d * d) / 26) + 0.04;
    cands.push([m, w]);
    total += w;
  }
  let x = Math.random() * total;
  for (const [m, w] of cands) {
    x -= w;
    if (x <= 0) return m;
  }
  return last;
}

function playBeat(ac, g, t, beat, tr) {
  const beatLen = 60 / tr.bpm;
  const bar = Math.floor(beat / 4) % PROG.length;
  const ch = PROG[bar];

  // Ambient tracks have no pulse at all, just long overlapping chords.
  if (tr.pad) {
    if (beat % tr.pad !== 0) return;
    ch.tones.forEach((iv, i) => {
      mString(ac, g, midiToHz(ch.root + 12 + iv), t + i * 0.05, beatLen * (tr.pad + 0.5), 0.028);
    });
    if (Math.random() < 0.5) {
      lastNote = pickNote(ch, lastNote);
      mReed(ac, g, midiToHz(lastNote), t + beatLen * 2, beatLen * 2.4, 0.022);
    }
    return;
  }

  const b = beat % 4;

  // Two-feel bass: root on one, fifth on three.
  if (tr.bass && b === 0) mBass(ac, g, midiToHz(ch.root), t, beatLen * 0.85, 0.1);
  if (tr.bass && b === 2) mBass(ac, g, midiToHz(ch.root + 7), t, beatLen * 0.85, 0.085);

  // Strings hold the bar, voices a few milliseconds apart so the section
  // does not sound like one instrument playing a chord.
  if (tr.strings && b === 0) {
    ch.tones.forEach((iv, i) => {
      mString(ac, g, midiToHz(ch.root + 12 + iv), t + i * 0.013, beatLen * 3.8, 0.034);
    });
  }

  if (tr.brass && b === 0 && bar % 2 === 1) {
    brass(ac, g.input, midiToHz(ch.root + 12 + ch.tones[2]), t, beatLen * 1.5, 0.038);
  }

  if (tr.brushes && (b === 1 || b === 3)) mBrush(ac, g, t, 0.026);

  // Melody, swung and deliberately full of holes.
  if (Math.random() < tr.mel[0]) {
    lastNote = pickNote(ch, lastNote);
    mReed(ac, g, midiToHz(lastNote), t, beatLen * 0.52, 0.05);
  }
  if (Math.random() < tr.mel[1]) {
    lastNote = pickNote(ch, lastNote);
    mReed(ac, g, midiToHz(lastNote), t + beatLen * tr.swing, beatLen * 0.28, 0.04);
  }

  if (Math.random() < 0.12) crackle(ac, g, t + Math.random() * beatLen);
}

function scheduleMusic() {
  try {
    if (!ctx || !enabled) return;
    const tr = getTrackDef(trackId);
    if (!tr || tr.id === 'off') return;

    const ac = ctx;
    if (ac.state !== 'running') return;

    const g = musicGraph(ac);
    if (musicNextT < ac.currentTime) musicNextT = ac.currentTime + 0.06;

    const beatLen = 60 / tr.bpm;
    while (musicNextT < ac.currentTime + LOOKAHEAD) {
      playBeat(ac, g, musicNextT, musicBeat, tr);
      musicNextT += beatLen;
      musicBeat++;
    }
  } catch (e) {
    /* never let the score break the page */
  }
}

function runMusicTimer() {
  if (musicTimer) return;
  const tick = () => {
    scheduleMusic();
    musicTimer = setTimeout(tick, 80);
  };
  musicTimer = setTimeout(tick, 80);
}

function stopMusicTimer() {
  if (musicTimer) clearTimeout(musicTimer);
  musicTimer = null;
}

function fadeMusic(to, secs) {
  if (!musicNodes || !ctx) return;
  try {
    musicNodes.out.gain.setTargetAtTime(to, ctx.currentTime, secs);
  } catch (e) {
    /* ignore */
  }
}

// --- public API -----------------------------------------------------------

let desiredTrack = 'deco';

function readTrack() {
  try {
    const v = localStorage.getItem(TRACK_KEY);
    return TRACKS.some((t) => t.id === v) ? v : 'deco';
  } catch (e) {
    return 'deco';
  }
}

desiredTrack = readTrack();

export function isEnabled() {
  return enabled;
}

function applyMusic() {
  const ac = getCtx();
  if (!ac) return;

  if (!enabled || !desiredTrack || desiredTrack === 'off') {
    trackId = 'off';
    fadeMusic(0, 0.4);
    stopMusicTimer();
    return;
  }

  if (ac.state !== 'running') ac.resume();
  if (trackId !== desiredTrack) {
    trackId = desiredTrack;
    musicBeat = 0;
    musicNextT = 0;
  }
  musicGraph(ac);
  runMusicTimer();
  fadeMusic(1, 1.2);
}

// The jukebox selection, independent of which wallpaper is up. Safe to call
// before sound is switched on; it is remembered either way.
export function setTrack(id) {
  desiredTrack = TRACKS.some((t) => t.id === id) ? id : 'off';
  try {
    localStorage.setItem(TRACK_KEY, desiredTrack);
  } catch (e) {
    /* blocked storage is not fatal */
  }
  if (enabled) applyMusic();
  else fadeMusic(0, 0.2);
}

export function getTrack() {
  return desiredTrack;
}

export function setEnabled(on) {
  enabled = !!on;
  writeStored(enabled);

  if (enabled) {
    const ac = getCtx();
    if (ac && ac.state !== 'running') ac.resume();
    applyMusic();
  } else {
    fadeMusic(0, 0.25);
    stopMusicTimer();
    trackId = 'off';
    // Suspending mid-fade clicks, so let the ramp finish first.
    setTimeout(() => {
      try {
        if (!enabled && ctx) ctx.suspend();
      } catch (e) {
        /* ignore */
      }
    }, 600);
  }
  return enabled;
}

// Call from a user gesture. Does nothing unless sound is switched on.
export function play(themeId) {
  if (!enabled) return;
  try {
    const ac = getCtx();
    if (!ac) return;
    if (ac.state !== 'running') ac.resume();
    const fn = STINGS[themeId];
    if (!fn) return;
    fn(ac, masterBus(ac));
  } catch (e) {
    /* audio is never allowed to break the page */
  }
}

export function available() {
  return !!(window.AudioContext || window.webkitAudioContext);
}

document.addEventListener('visibilitychange', () => {
  try {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else if (enabled) ctx.resume();
  } catch (e) {
    /* ignore */
  }
});

// A returning visitor who already switched sound on still arrives with a
// suspended context, because browsers require a gesture. Rather than leave
// them in silence until they happen to press the toggle again, unlock on the
// first interaction of any kind. They opted in; this only honours it.
(function armUnlock() {
  const fire = () => {
    // Keep waiting while sound is off. Consuming the one-shot on an
    // interaction that happens before the visitor turns sound on would
    // throw away the only gesture we had to unlock the context with.
    if (!enabled) return;
    window.removeEventListener('pointerdown', fire);
    window.removeEventListener('keydown', fire);
    try {
      const ac = getCtx();
      if (ac && ac.state !== 'running') ac.resume();
      applyMusic();
    } catch (e) {
      /* ignore */
    }
  };
  window.addEventListener('pointerdown', fire);
  window.addEventListener('keydown', fire);
})();
