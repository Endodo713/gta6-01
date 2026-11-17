// All sound is synthesised with the Web Audio API: no audio files anywhere in the entry.
// One AudioContext is created lazily on the first user gesture (browsers refuse to start one
// before then), and every voice is a short graph that is torn down when it finishes, so a
// hundred shots cost nothing. Muting is a single gain node at the top of the graph.

const MASTER = 0.5;

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engine = null;
  let siren = null;
  let noiseBuffer = null;

  function buildNoise() {
    const frames = ctx.sampleRate * 1;
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** Bring the context up on a real gesture; safe to call any number of times. */
  function unlock() {
    try {
      if (!ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        ctx = new AudioContext();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : MASTER;
        master.connect(ctx.destination);
        noiseBuffer = buildNoise();
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch {
      ctx = null;
    }
  }

  function now() {
    return ctx ? ctx.currentTime : 0;
  }

  function env(gainNode, from, peak, hold, release) {
    const t = now();
    gainNode.gain.setValueAtTime(from, t);
    gainNode.gain.linearRampToValueAtTime(peak, t + hold);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + hold + release);
  }

  function noiseBurst(peak, duration, filterFreq, type) {
    if (!ctx) return;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    source.connect(filter).connect(gain).connect(master);
    env(gain, 0, peak, 0.004, duration);
    source.start();
    source.stop(now() + duration + 0.06);
  }

  function tone(freq, peak, duration, type, freqTo) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now());
    if (freqTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), now() + duration);
    const gain = ctx.createGain();
    osc.connect(gain).connect(master);
    env(gain, 0, peak, 0.008, duration);
    osc.start();
    osc.stop(now() + duration + 0.08);
  }

  function arp(freqs, step, duration, type, peak) {
    if (!ctx) return;
    for (let i = 0; i < freqs.length; i += 1) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freqs[i];
      const gain = ctx.createGain();
      const at = now() + i * step;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(peak, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      osc.connect(gain).connect(master);
      osc.start(at);
      osc.stop(at + duration + 0.05);
    }
  }

  // The engine hum: two detuned saws through a low-pass, pitch and loudness following the
  // car. `level` is 0 when on foot, so the voice stays silent and costs nothing.
  function engineHum(level, throttle) {
    if (!ctx || !master) return;
    if (level > 0.001) {
      if (!engine) {
        engine = { osc: [], gain: ctx.createGain(), filter: ctx.createBiquadFilter() };
        engine.filter.type = 'lowpass';
        engine.filter.frequency.value = 420;
        engine.gain.gain.value = 0;
        for (let i = 0; i < 2; i += 1) {
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.value = i === 0 ? 62 : 94;
          osc.detune.value = i === 0 ? 0 : 9;
          osc.connect(engine.filter);
          osc.start();
          engine.osc.push(osc);
        }
        engine.filter.connect(engine.gain).connect(master);
      }
      const speed = 62 + level * 118;
      const t = now();
      engine.osc[0].frequency.setTargetAtTime(speed, t, 0.06);
      engine.osc[1].frequency.setTargetAtTime(speed * 1.5 + 3, t, 0.06);
      engine.gain.gain.setTargetAtTime(0.028 + throttle * 0.02 + level * 0.02, t, 0.09);
    } else if (engine) {
      const t = now();
      engine.gain.gain.setTargetAtTime(0, t, 0.1);
    }
  }

  // A two-tone wail whose pitch loops, the way a siren really wails.
  function sirenHum(level) {
    if (!ctx || !master) return;
    if (level > 0.001) {
      if (!siren) {
        siren = { osc: ctx.createOscillator(), lfo: ctx.createOscillator(), gain: ctx.createGain(), lfoGain: ctx.createGain() };
        siren.osc.type = 'triangle';
        siren.osc.frequency.value = 690;
        siren.lfo.type = 'sine';
        siren.lfo.frequency.value = 0.55;
        siren.lfoGain.gain.value = 150;
        siren.lfo.connect(siren.lfoGain).connect(siren.osc.frequency);
        siren.gain.gain.value = 0;
        siren.osc.connect(siren.gain).connect(master);
        siren.osc.start();
        siren.lfo.start();
      }
      siren.gain.gain.setTargetAtTime(0.012 * level, now(), 0.1);
    } else if (siren) {
      siren.gain.gain.setTargetAtTime(0, now(), 0.14);
    }
  }

  function stopLoops() {
    if (engine) {
      const t = now();
      engine.gain.gain.setTargetAtTime(0, t, 0.08);
    }
    if (siren) {
      siren.gain.gain.setTargetAtTime(0, now(), 0.1);
    }
  }

  function play(name) {
    if (!ctx) return;
    if (name === 'shot') {
      noiseBurst(0.22, 0.07, 2600, 'lowpass');
      tone(210, 0.09, 0.05, 'square', 90);
    } else if (name === 'punch') {
      noiseBurst(0.14, 0.05, 700, 'lowpass');
      tone(150, 0.06, 0.04, 'square', 70);
    } else if (name === 'hit') {
      noiseBurst(0.1, 0.06, 900, 'lowpass');
    } else if (name === 'pickup') {
      tone(660, 0.07, 0.08, 'sine', 990);
      tone(990, 0.05, 0.1, 'sine', 1320);
    } else if (name === 'click') {
      tone(520, 0.05, 0.05, 'square', 300);
    } else if (name === 'door') {
      noiseBurst(0.09, 0.06, 1000, 'lowpass');
      tone(220, 0.04, 0.06, 'triangle', 120);
    } else if (name === 'screech') {
      noiseBurst(0.07, 0.12, 2600, 'bandpass');
    } else if (name === 'crash') {
      noiseBurst(0.16, 0.16, 700, 'lowpass');
      tone(90, 0.08, 0.12, 'square', 50);
    } else if (name === 'sirenBlip') {
      tone(760, 0.05, 0.12, 'triangle', 1080);
    } else if (name === 'jingle') {
      arp([523, 659, 784, 1046], 0.11, 0.3, 'triangle', 0.09);
      arp([1046, 1318], 0.12, 0.36, 'sine', 0.06);
    } else if (name === 'fail') {
      arp([330, 262, 208], 0.14, 0.3, 'sawtooth', 0.06);
    } else if (name === 'mission') {
      arp([392, 523, 659, 784], 0.16, 0.34, 'square', 0.05);
    }
  }

  return {
    unlock,
    play,
    engineHum,
    sirenHum,
    stopLoops,
    setMuted: function (value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : MASTER;
    },
    isMuted: function () {
      return muted;
    },
  };
}
