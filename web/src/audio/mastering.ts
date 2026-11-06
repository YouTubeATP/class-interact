/**
 * The output stage every sound goes through, tuned for where ClassInteract is heard: a projector's built-in speaker,
 * classroom ceiling speakers, a TV over HDMI or a laptop, in a reverberant room, often from the back.
 *
 * Those systems reproduce little below about 80–100 Hz and smear the low mids in a hard-walled room, so energy there
 * only costs headroom and clarity. The chain removes it, adds a little presence where speech and melodies carry,
 * evens out the level and then brings it up to a loudness that works at a normal AV volume, without ever clipping:
 *
 *   high-pass 85 Hz → low-mid cut (−2.5 dB at 280 Hz) → presence (+3 dB at 2.8 kHz) → glue compressor →
 *   make-up gain → limiter → soft clipper (ceiling about −0.9 dBFS)
 *
 * Measured with an EBU R128 meter on rendered pieces (see the audio e2e test and .scratch/render-audio.mjs), music
 * lands around −16 LUFS integrated and sound effects peak just under the ceiling, comparable to streaming and
 * broadcast loudness, so the projector's volume slider at 100% is genuinely loud.
 */

/** Gain after the glue compressor, set by measuring rendered music against the loudness target. */
export const MAKEUP_GAIN = 3.2;
/** Highest sample value the soft clipper lets through (about −0.9 dBFS). */
export const CEILING = 0.9;

function biquad(ctx: BaseAudioContext, type: BiquadFilterType, freq: number, q: number, gain = 0) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  f.gain.value = gain;
  return f;
}

let curve: Float32Array<ArrayBuffer> | null = null;
/** A smooth saturation curve: linear for normal levels, rounding off to `CEILING` instead of clipping. */
function softClipCurve(): Float32Array<ArrayBuffer> {
  if (curve) return curve;
  const n = 4096;
  curve = new Float32Array(n);
  const knee = 0.6 * CEILING; // below this the curve is a straight line
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + (CEILING - knee) * Math.tanh((a - knee) / (CEILING - knee));
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

/** Builds the chain into `dest` and returns its input. */
export function masterChain(ctx: BaseAudioContext, dest: AudioNode): AudioNode {
  const highpass = biquad(ctx, 'highpass', 85, 0.71);
  const mud = biquad(ctx, 'peaking', 280, 1, -2.5);
  const presence = biquad(ctx, 'peaking', 2800, 0.9, 3);

  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -24;
  glue.knee.value = 8;
  glue.ratio.value = 3;
  glue.attack.value = 0.012;
  glue.release.value = 0.25;

  const makeup = ctx.createGain();
  makeup.gain.value = MAKEUP_GAIN;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -4;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;

  const clip = ctx.createWaveShaper();
  clip.curve = softClipCurve();
  clip.oversample = '4x';

  highpass.connect(mud);
  mud.connect(presence);
  presence.connect(glue);
  glue.connect(makeup);
  makeup.connect(limiter);
  limiter.connect(clip);
  clip.connect(dest);
  return highpass;
}
