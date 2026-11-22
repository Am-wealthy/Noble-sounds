function createNoiseBuffer(
  ctx: BaseAudioContext,
  durationSec: number,
  pink = false
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * durationSec));
  const buffer = ctx.createBuffer(2, length, sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (pink) {
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      } else {
        data[i] = white;
      }
    }
  }
  return buffer;
}

function normalizeBuffer(buffer: AudioBuffer, targetPeak = 0.86): AudioBuffer {
  let maxVal = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > maxVal) maxVal = abs;
    }
  }
  if (maxVal > 0.0001) {
    const gain = targetPeak / maxVal;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        data[i] *= gain;
      }
    }
  }
  return buffer;
}

export async function renderPresetBuffer(
  presetKey: string,
  sampleRate = 44100
): Promise<AudioBuffer> {
  const durations: Record<string, number> = {
    eagle: 1.65,
    wolf: 2.6,
    lion: 2.2,
    thunder: 3.2,
    airhorn: 1.8,
    scratch: 0.95,
    laser: 0.75,
    raven: 1.15,
    ocean: 3.0,
    bell: 3.4,
    glass: 1.4,
    cheer: 2.8,
    cyber_riser: 3.2,
    sub_drop: 2.4,
    rev_cymbal: 2.5,
    downlifter: 2.4,
    snare_roll: 2.6,
    impact: 2.5,
    tape_stop: 1.8,
    uplift_chord: 3.0,
    jet_whoosh: 2.2,
    siren_build: 2.8,
    bass_cannon: 1.6,
    strobe_gate: 2.6,
  };

  const duration = durations[presetKey] ?? 1.5;
  const ctx = new OfflineAudioContext(2, Math.floor(sampleRate * duration), sampleRate);

  switch (presetKey) {
    case 'eagle': {
      // Piercing raptor scream with FM grit and downward tail glide
      const osc = ctx.createOscillator();
      const mod = ctx.createOscillator();
      const modGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const amp = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1950, 0);
      osc.frequency.exponentialRampToValueAtTime(3400, 0.14);
      osc.frequency.exponentialRampToValueAtTime(2800, 0.55);
      osc.frequency.exponentialRampToValueAtTime(1450, 1.45);

      mod.type = 'sine';
      mod.frequency.setValueAtTime(42, 0);
      mod.frequency.linearRampToValueAtTime(28, 1.4);
      modGain.gain.setValueAtTime(140, 0);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2700, 0);
      filter.Q.setValueAtTime(3.2, 0);

      amp.gain.setValueAtTime(0.001, 0);
      amp.gain.linearRampToValueAtTime(0.9, 0.06);
      amp.gain.setValueAtTime(0.85, 0.45);
      amp.gain.exponentialRampToValueAtTime(0.001, 1.58);

      mod.connect(modGain);
      modGain.connect(osc.frequency);
      osc.connect(filter);
      filter.connect(amp);
      amp.connect(ctx.destination);

      osc.start(0);
      mod.start(0);
      osc.stop(duration);
      mod.stop(duration);
      break;
    }

    case 'wolf': {
      // Haunting resonant howl with gentle vibrato
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const vib = ctx.createOscillator();
      const vibGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const amp = ctx.createGain();

      osc1.type = 'triangle';
      osc2.type = 'sawtooth';
      osc1.frequency.setValueAtTime(260, 0);
      osc1.frequency.exponentialRampToValueAtTime(510, 0.45);
      osc1.frequency.setValueAtTime(510, 1.35);
      osc1.frequency.exponentialRampToValueAtTime(310, 2.5);

      osc2.frequency.setValueAtTime(260 * 1.004, 0);
      osc2.frequency.exponentialRampToValueAtTime(510 * 1.004, 0.45);
      osc2.frequency.setValueAtTime(510 * 1.004, 1.35);
      osc2.frequency.exponentialRampToValueAtTime(310 * 1.004, 2.5);

      vib.frequency.setValueAtTime(5.4, 0);
      vibGain.gain.setValueAtTime(11, 0);
      vib.connect(vibGain);
      vibGain.connect(osc1.frequency);
      vibGain.connect(osc2.frequency);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(680, 0);
      filter.frequency.linearRampToValueAtTime(1100, 0.6);
      filter.frequency.linearRampToValueAtTime(550, 2.5);
      filter.Q.setValueAtTime(2.6, 0);

      const g2 = ctx.createGain();
      g2.gain.value = 0.25;

      amp.gain.setValueAtTime(0.001, 0);
      amp.gain.linearRampToValueAtTime(0.95, 0.28);
      amp.gain.setValueAtTime(0.85, 1.4);
      amp.gain.exponentialRampToValueAtTime(0.001, 2.55);

      osc1.connect(filter);
      osc2.connect(g2);
      g2.connect(filter);
      filter.connect(amp);
      amp.connect(ctx.destination);

      osc1.start(0);
      osc2.start(0);
      vib.start(0);
      osc1.stop(duration);
      osc2.stop(duration);
      vib.stop(duration);
      break;
    }

    case 'lion': {
      // Deep throat growl + textured noise roar
      const sub = ctx.createOscillator();
      const growl = ctx.createOscillator();
      const noise = ctx.createBufferSource();
      noise.buffer = createNoiseBuffer(ctx, duration, true);

      sub.type = 'sawtooth';
      sub.frequency.setValueAtTime(115, 0);
      sub.frequency.exponentialRampToValueAtTime(72, 1.9);

      growl.type = 'square';
      growl.frequency.setValueAtTime(38, 0);

      const modGain = ctx.createGain();
      modGain.gain.value = 26;
      growl.connect(modGain);
      modGain.connect(sub.frequency);

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(420, 0);
      noiseFilter.frequency.linearRampToValueAtTime(240, 2.0);
      noiseFilter.Q.value = 1.4;

      const subFilter = ctx.createBiquadFilter();
      subFilter.type = 'lowpass';
      subFilter.frequency.setValueAtTime(520, 0);
      subFilter.frequency.linearRampToValueAtTime(220, 2.0);

      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.001, 0);
      amp.gain.linearRampToValueAtTime(1.0, 0.14);
      amp.gain.setValueAtTime(0.85, 0.8);
      amp.gain.exponentialRampToValueAtTime(0.001, 2.15);

      sub.connect(subFilter);
      noise.connect(noiseFilter);
      subFilter.connect(amp);
      noiseFilter.connect(amp);
      amp.connect(ctx.destination);

      sub.start(0);
      growl.start(0);
      noise.start(0);
      sub.stop(duration);
      growl.stop(duration);
      noise.stop(duration);
      break;
    }

    case 'thunder': {
      // Initial lightning crack + deep rolling sub rumble
      const crackNoise = ctx.createBufferSource();
      crackNoise.buffer = createNoiseBuffer(ctx, duration, false);
      const crackFilter = ctx.createBiquadFilter();
      crackFilter.type = 'highpass';
      crackFilter.frequency.setValueAtTime(650, 0);
      const crackAmp = ctx.createGain();
      crackAmp.gain.setValueAtTime(1.0, 0);
      crackAmp.gain.exponentialRampToValueAtTime(0.001, 0.35);

      const rumbleNoise = ctx.createBufferSource();
      rumbleNoise.buffer = createNoiseBuffer(ctx, duration, true);
      const rumbleFilter = ctx.createBiquadFilter();
      rumbleFilter.type = 'lowpass';
      rumbleFilter.frequency.setValueAtTime(320, 0);
      rumbleFilter.frequency.exponentialRampToValueAtTime(75, 2.8);
      const rumbleAmp = ctx.createGain();
      rumbleAmp.gain.setValueAtTime(0.01, 0);
      rumbleAmp.gain.linearRampToValueAtTime(1.0, 0.08);
      rumbleAmp.gain.setValueAtTime(0.7, 0.7);
      rumbleAmp.gain.exponentialRampToValueAtTime(0.001, 3.15);

      crackNoise.connect(crackFilter);
      crackFilter.connect(crackAmp);
      crackAmp.connect(ctx.destination);

      rumbleNoise.connect(rumbleFilter);
      rumbleFilter.connect(rumbleAmp);
      rumbleAmp.connect(ctx.destination);

      crackNoise.start(0);
      rumbleNoise.start(0);
      break;
    }

    case 'airhorn': {
      // Detuned stadium brass chord blast
      const freqs = [392, 493.88, 587.33, 394.5, 496.2];
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3200, 0);
      filter.Q.value = 1.6;

      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.001, 0);
      amp.gain.linearRampToValueAtTime(0.95, 0.018);
      amp.gain.setValueAtTime(0.9, 1.55);
      amp.gain.exponentialRampToValueAtTime(0.001, 1.78);

      freqs.forEach((f) => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f * 0.96, 0);
        osc.frequency.exponentialRampToValueAtTime(f, 0.04);
        osc.connect(filter);
        osc.start(0);
        osc.stop(duration);
      });

      filter.connect(amp);
      amp.connect(ctx.destination);
      break;
    }

    case 'scratch': {
      // DJ chirp scratch bursts + vinyl texture
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, 0);
      osc.frequency.exponentialRampToValueAtTime(980, 0.09);
      osc.frequency.exponentialRampToValueAtTime(180, 0.22);
      osc.frequency.exponentialRampToValueAtTime(1150, 0.36);
      osc.frequency.exponentialRampToValueAtTime(140, 0.62);
      osc.frequency.exponentialRampToValueAtTime(420, 0.78);

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, 0);
      filter.Q.value = 2.0;

      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.95, 0);
      amp.gain.setValueAtTime(0.85, 0.65);
      amp.gain.exponentialRampToValueAtTime(0.001, 0.92);

      osc.connect(filter);
      filter.connect(amp);
      amp.connect(ctx.destination);
      osc.start(0);
      osc.stop(duration);
      break;
    }

    case 'laser': {
      const osc = ctx.createOscillator();
      const sub = ctx.createOscillator();
      osc.type = 'sawtooth';
      sub.type = 'sine';
      osc.frequency.setValueAtTime(2400, 0);
      osc.frequency.exponentialRampToValueAtTime(110, 0.42);
      sub.frequency.setValueAtTime(1200, 0);
      sub.frequency.exponentialRampToValueAtTime(65, 0.42);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(5200, 0);
      filter.frequency.exponentialRampToValueAtTime(420, 0.5);
      filter.Q.value = 5.5;

      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.95, 0);
      amp.gain.exponentialRampToValueAtTime(0.001, 0.7);

      osc.connect(filter);
      sub.connect(filter);
      filter.connect(amp);
      amp.connect(ctx.destination);
      osc.start(0);
      sub.start(0);
      osc.stop(duration);
      sub.stop(duration);
      break;
    }

    case 'raven': {
      // Double raspy caw
      const makeCaw = (start: number, len: number) => {
        const osc = ctx.createOscillator();
        const mod = ctx.createOscillator();
        const modG = ctx.createGain();
        const bp = ctx.createBiquadFilter();
        const amp = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(540, start);
        osc.frequency.linearRampToValueAtTime(660, start + len * 0.3);
        osc.frequency.exponentialRampToValueAtTime(380, start + len);

        mod.type = 'square';
        mod.frequency.value = 58;
        modG.gain.value = 95;
        mod.connect(modG);
        modG.connect(osc.frequency);

        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(1250, start);
        bp.Q.value = 2.8;

        amp.gain.setValueAtTime(0.001, start);
        amp.gain.linearRampToValueAtTime(0.9, start + 0.04);
        amp.gain.exponentialRampToValueAtTime(0.001, start + len);

        osc.connect(bp);
        bp.connect(amp);
        amp.connect(ctx.destination);
        osc.start(start);
        mod.start(start);
        osc.stop(start + len + 0.02);
        mod.stop(start + len + 0.02);
      };
      makeCaw(0.02, 0.36);
      makeCaw(0.52, 0.48);
      break;
    }

    case 'ocean': {
      const noise = ctx.createBufferSource();
      noise.buffer = createNoiseBuffer(ctx, duration, true);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(220, 0);
      filter.frequency.exponentialRampToValueAtTime(1900, 0.85);
      filter.frequency.exponentialRampToValueAtTime(280, 2.9);

      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.01, 0);
      amp.gain.linearRampToValueAtTime(0.95, 0.75);
      amp.gain.exponentialRampToValueAtTime(0.001, 2.95);

      noise.connect(filter);
      filter.connect(amp);
      amp.connect(ctx.destination);
      noise.start(0);
      break;
    }

    case 'bell': {
      // Cathedral metallic partials
      const base = 329.63; // E4
      const ratios = [1, 2, 2.4, 3, 4.2, 5.4];
      const amps = [0.6, 0.45, 0.35, 0.25, 0.16, 0.1];
      ratios.forEach((r, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(base * r, 0);
        g.gain.setValueAtTime(amps[idx], 0);
        g.gain.exponentialRampToValueAtTime(0.0005, 3.3 / (1 + idx * 0.25));
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(0);
        osc.stop(duration);
      });
      break;
    }

    case 'glass': {
      // Sparkling high-frequency bursts + metallic pings
      const noise = ctx.createBufferSource();
      noise.buffer = createNoiseBuffer(ctx, duration, false);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 3400;
      const nAmp = ctx.createGain();
      nAmp.gain.setValueAtTime(0.85, 0);
      nAmp.gain.exponentialRampToValueAtTime(0.001, 0.45);
      noise.connect(hp);
      hp.connect(nAmp);
      nAmp.connect(ctx.destination);
      noise.start(0);

      for (let i = 0; i < 14; i++) {
        const t = i * 0.045 + Math.random() * 0.03;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2400 + Math.random() * 4800, t);
        g.gain.setValueAtTime(0.32 * (1 - i / 16), t);
        g.gain.exponentialRampToValueAtTime(0.0008, t + 0.35);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.38);
      }
      break;
    }

    case 'cheer': {
      // Layered stadium swell bandpass pink noise
      const n1 = ctx.createBufferSource();
      const n2 = ctx.createBufferSource();
      n1.buffer = createNoiseBuffer(ctx, duration, true);
      n2.buffer = createNoiseBuffer(ctx, duration, false);

      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.setValueAtTime(950, 0);
      f1.Q.value = 0.85;

      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.setValueAtTime(2400, 0);
      f2.Q.value = 1.2;

      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.001, 0);
      amp.gain.linearRampToValueAtTime(0.95, 0.35);
      amp.gain.setValueAtTime(0.82, 1.8);
      amp.gain.exponentialRampToValueAtTime(0.001, 2.75);

      n1.connect(f1);
      n2.connect(f2);
      f1.connect(amp);
      f2.connect(amp);
      amp.connect(ctx.destination);
      n1.start(0);
      n2.start(0);
      break;
    }

    case 'cyber_riser': {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const noise = ctx.createBufferSource();
      noise.buffer = createNoiseBuffer(ctx, duration, false);

      osc1.type = 'sawtooth';
      osc2.type = 'sawtooth';
      osc1.frequency.setValueAtTime(110, 0);
      osc1.frequency.exponentialRampToValueAtTime(1760, 3.0);
      osc2.frequency.setValueAtTime(111.5, 0);
      osc2.frequency.exponentialRampToValueAtTime(1778, 3.0);

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(250, 0);
      filter.frequency.exponentialRampToValueAtTime(6500, 3.0);
      filter.Q.value = 4.0;

      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.01, 0);
      amp.gain.exponentialRampToValueAtTime(0.95, 2.92);
      amp.gain.linearRampToValueAtTime(0.001, 3.16);

      osc1.connect(filter);
      osc2.connect(filter);
      noise.connect(filter);
      filter.connect(amp);
      amp.connect(ctx.destination);
      osc1.start(0);
      osc2.start(0);
      noise.start(0);
      osc1.stop(duration);
      osc2.stop(duration);
      break;
    }

    case 'sub_drop': {
      const osc = ctx.createOscillator();
      const click = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(135, 0);
      osc.frequency.exponentialRampToValueAtTime(34, 0.55);
      osc.frequency.linearRampToValueAtTime(28, 2.3);

      click.type = 'triangle';
      click.frequency.setValueAtTime(480, 0);
      click.frequency.exponentialRampToValueAtTime(60, 0.04);

      const clickG = ctx.createGain();
      clickG.gain.setValueAtTime(0.5, 0);
      clickG.gain.exponentialRampToValueAtTime(0.001, 0.045);

      const amp = ctx.createGain();
      amp.gain.setValueAtTime(1.0, 0);
      amp.gain.setValueAtTime(0.88, 0.4);
      amp.gain.exponentialRampToValueAtTime(0.001, 2.35);

      osc.connect(amp);
      click.connect(clickG);
      clickG.connect(amp);
      amp.connect(ctx.destination);
      osc.start(0);
      click.start(0);
      osc.stop(duration);
      click.stop(0.06);
      break;
    }

    case 'rev_cymbal': {
      const noise = ctx.createBufferSource();
      noise.buffer = createNoiseBuffer(ctx, duration, false);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(1800, 0);
      const bp = ctx.createBiquadFilter();
      bp.type = 'peaking';
      bp.frequency.setValueAtTime(6200, 0);
      bp.gain.value = 6;

      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.003, 0);
      amp.gain.exponentialRampToValueAtTime(0.98, 2.36);
      amp.gain.linearRampToValueAtTime(0.001, 2.48);

      noise.connect(hp);
      hp.connect(bp);
      bp.connect(amp);
      amp.connect(ctx.destination);
      noise.start(0);
      break;
    }

    case 'downlifter': {
      const osc = ctx.createOscillator();
      const noise = ctx.createBufferSource();
      noise.buffer = createNoiseBuffer(ctx, duration, false);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(980, 0);
      osc.frequency.exponentialRampToValueAtTime(55, 2.3);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(6000, 0);
      filter.frequency.exponentialRampToValueAtTime(120, 2.3);
      filter.Q.value = 4.5;

      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.95, 0);
      amp.gain.exponentialRampToValueAtTime(0.001, 2.36);

      osc.connect(filter);
      noise.connect(filter);
      filter.connect(amp);
      amp.connect(ctx.destination);
      osc.start(0);
      noise.start(0);
      osc.stop(duration);
      break;
    }

    case 'snare_roll': {
      // Accelerating 16th-to-32nd snare build
      const hits: number[] = [];
      let t = 0.02;
      let step = 0.22;
      while (t < 2.42) {
        hits.push(t);
        t += step;
        step = Math.max(0.042, step * 0.9);
      }
      hits.forEach((hitTime, idx) => {
        const progress = idx / Math.max(1, hits.length - 1);
        const body = ctx.createOscillator();
        body.type = 'triangle';
        body.frequency.setValueAtTime(200 + progress * 80, hitTime);
        body.frequency.exponentialRampToValueAtTime(95, hitTime + 0.07);

        const bodyG = ctx.createGain();
        bodyG.gain.setValueAtTime(0.35 + progress * 0.55, hitTime);
        bodyG.gain.exponentialRampToValueAtTime(0.001, hitTime + 0.09);

        const snap = ctx.createBufferSource();
        snap.buffer = createNoiseBuffer(ctx, 0.14, false);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 1600;
        const snapG = ctx.createGain();
        snapG.gain.setValueAtTime(0.3 + progress * 0.65, hitTime);
        snapG.gain.exponentialRampToValueAtTime(0.001, hitTime + 0.12);

        body.connect(bodyG);
        bodyG.connect(ctx.destination);
        snap.connect(hp);
        hp.connect(snapG);
        snapG.connect(ctx.destination);
        body.start(hitTime);
        body.stop(hitTime + 0.1);
        snap.start(hitTime);
      });
      break;
    }

    case 'impact': {
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(160, 0);
      sub.frequency.exponentialRampToValueAtTime(32, 0.35);

      const subG = ctx.createGain();
      subG.gain.setValueAtTime(1.0, 0);
      subG.gain.exponentialRampToValueAtTime(0.001, 2.2);

      const noise = ctx.createBufferSource();
      noise.buffer = createNoiseBuffer(ctx, duration, false);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(4800, 0);
      lp.frequency.exponentialRampToValueAtTime(180, 1.9);
      const nG = ctx.createGain();
      nG.gain.setValueAtTime(0.9, 0);
      nG.gain.exponentialRampToValueAtTime(0.001, 2.3);

      sub.connect(subG);
      subG.connect(ctx.destination);
      noise.connect(lp);
      lp.connect(nG);
      nG.connect(ctx.destination);
      sub.start(0);
      sub.stop(duration);
      noise.start(0);
      break;
    }

    case 'tape_stop': {
      const chord = [261.63, 329.63, 392.0, 523.25];
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3600, 0);
      filter.frequency.exponentialRampToValueAtTime(120, 1.72);

      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.85, 0);
      amp.gain.setValueAtTime(0.85, 0.2);
      amp.gain.exponentialRampToValueAtTime(0.001, 1.76);

      chord.forEach((f) => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, 0);
        osc.frequency.setValueAtTime(f, 0.18);
        osc.frequency.exponentialRampToValueAtTime(f * 0.08, 1.74);
        osc.connect(filter);
        osc.start(0);
        osc.stop(duration);
      });
      filter.connect(amp);
      amp.connect(ctx.destination);
      break;
    }

    case 'uplift_chord': {
      const notes = [220, 277.18, 329.63, 440, 554.37];
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(280, 0);
      filter.frequency.exponentialRampToValueAtTime(5600, 2.7);
      filter.Q.value = 2.2;

      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.01, 0);
      amp.gain.exponentialRampToValueAtTime(0.9, 2.55);
      amp.gain.linearRampToValueAtTime(0.001, 2.95);

      notes.forEach((f) => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, 0);
        osc.connect(filter);
        osc.start(0);
        osc.stop(duration);
      });
      filter.connect(amp);
      amp.connect(ctx.destination);
      break;
    }

    case 'jet_whoosh': {
      const noise = ctx.createBufferSource();
      noise.buffer = createNoiseBuffer(ctx, duration, false);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(180, 0);
      bp.frequency.exponentialRampToValueAtTime(3800, 1.05);
      bp.frequency.exponentialRampToValueAtTime(220, 2.15);
      bp.Q.value = 3.6;

      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.01, 0);
      amp.gain.linearRampToValueAtTime(0.95, 1.0);
      amp.gain.exponentialRampToValueAtTime(0.001, 2.15);

      noise.connect(bp);
      bp.connect(amp);
      amp.connect(ctx.destination);
      noise.start(0);
      break;
    }

    case 'siren_build': {
      const osc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(340, 0);
      osc.frequency.exponentialRampToValueAtTime(1120, 2.6);

      lfo.frequency.setValueAtTime(3, 0);
      lfo.frequency.linearRampToValueAtTime(11, 2.6);
      lfoGain.gain.value = 95;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2800;

      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.01, 0);
      amp.gain.linearRampToValueAtTime(0.85, 0.25);
      amp.gain.setValueAtTime(0.85, 2.4);
      amp.gain.exponentialRampToValueAtTime(0.001, 2.75);

      osc.connect(filter);
      filter.connect(amp);
      amp.connect(ctx.destination);
      osc.start(0);
      lfo.start(0);
      osc.stop(duration);
      lfo.stop(duration);
      break;
    }

    case 'bass_cannon': {
      const sub = ctx.createOscillator();
      const saw = ctx.createOscillator();
      sub.type = 'sine';
      saw.type = 'sawtooth';
      sub.frequency.setValueAtTime(180, 0);
      sub.frequency.exponentialRampToValueAtTime(42, 0.22);
      saw.frequency.setValueAtTime(90, 0);
      saw.frequency.exponentialRampToValueAtTime(42, 0.22);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1800, 0);
      lp.frequency.exponentialRampToValueAtTime(160, 0.9);
      lp.Q.value = 3.0;

      const amp = ctx.createGain();
      amp.gain.setValueAtTime(1.0, 0);
      amp.gain.exponentialRampToValueAtTime(0.001, 1.55);

      sub.connect(lp);
      saw.connect(lp);
      lp.connect(amp);
      amp.connect(ctx.destination);
      sub.start(0);
      saw.start(0);
      sub.stop(duration);
      saw.stop(duration);
      break;
    }

    case 'strobe_gate':
    default: {
      // Rhythmic 16th-note gated chord swell
      const freqs = [261.63, 311.13, 392, 466.16];
      const gate = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, 0);
      filter.frequency.exponentialRampToValueAtTime(4800, 2.4);

      const stepDur = 0.125;
      for (let t = 0; t < 2.5; t += stepDur) {
        gate.gain.setValueAtTime(0.95, t);
        gate.gain.exponentialRampToValueAtTime(0.08, t + stepDur * 0.72);
      }
      gate.gain.linearRampToValueAtTime(0.001, 2.58);

      freqs.forEach((f) => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, 0);
        osc.connect(filter);
        osc.start(0);
        osc.stop(duration);
      });
      filter.connect(gate);
      gate.connect(ctx.destination);
      break;
    }
  }

  const rendered = await ctx.startRendering();
  return normalizeBuffer(rendered, 0.85);
}
