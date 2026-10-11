/** Read uncompressed PCM16 WAV files without assuming a fixed 44-byte header. */
export function readPcm16Wav(buffer) {
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length < 44 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new Error('Expected a PCM16 RIFF/WAVE recording.');
  }
  const declaredEnd = buffer.readUInt32LE(4) + 8;
  if (declaredEnd !== buffer.length) {
    throw new Error('WAV size does not match its header (truncated or trailing data).');
  }
  let format;
  let data;
  for (let offset = 12; offset < declaredEnd; ) {
    if (offset + 8 > declaredEnd) {
      throw new Error('Truncated WAV chunk header.');
    }
    const name = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > declaredEnd) {
      throw new Error('Truncated WAV chunk data.');
    }
    if (name === 'fmt ') {
      if (format || size < 16) {
        throw new Error('Invalid WAV format chunk.');
      }
      format = {
        encoding: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        byteRate: buffer.readUInt32LE(start + 8),
        blockAlign: buffer.readUInt16LE(start + 12),
        bits: buffer.readUInt16LE(start + 14),
      };
    } else if (name === 'data') {
      if (data) {
        throw new Error('Multiple WAV data chunks are unsupported.');
      }
      data = buffer.subarray(start, start + size);
    }
    offset = start + size + (size % 2);
    if (offset > declaredEnd) {
      throw new Error('Missing WAV chunk padding.');
    }
  }
  if (
    !format ||
    !data ||
    format.encoding !== 1 ||
    format.bits !== 16 ||
    ![1, 2].includes(format.channels) ||
    format.sampleRate < 8000 ||
    format.sampleRate > 96000 ||
    format.blockAlign !== format.channels * 2 ||
    format.byteRate !== format.sampleRate * format.blockAlign ||
    data.length % format.blockAlign !== 0 ||
    data.length === 0
  ) {
    throw new Error('Expected nonempty mono or stereo PCM16 WAV with a valid sample rate.');
  }
  const samples = new Int16Array(data.length / 2);
  for (let index = 0; index < samples.length; index++) {
    samples[index] = data.readInt16LE(index * 2);
  }
  return { sampleRate: format.sampleRate, channels: format.channels, samples };
}

/** Write interleaved PCM16 samples with no resampling, normalization or channel mixing. */
export function writePcm16Wav({ sampleRate, channels, samples }) {
  if (
    !Number.isInteger(sampleRate) ||
    sampleRate < 8000 ||
    sampleRate > 96000 ||
    ![1, 2].includes(channels) ||
    !(samples instanceof Int16Array) ||
    samples.length === 0 ||
    samples.length % channels !== 0
  ) {
    throw new Error('Expected nonempty interleaved PCM16 samples and valid channel/rate settings.');
  }
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * 2, 28);
  buffer.writeUInt16LE(channels * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  for (let index = 0; index < samples.length; index++) {
    buffer.writeInt16LE(samples[index], 44 + index * 2);
  }
  return buffer;
}

function rms(samples, start, end) {
  let squares = 0;
  for (let index = start; index < end; index++) {
    squares += samples[index] ** 2;
  }
  return end > start ? Math.sqrt(squares / (end - start)) : 0;
}

/** Advisory signal measurements, not a speech detector or a perceptual quality score. */
export function analyzePcm16(samples, sampleRate) {
  if (
    !(samples instanceof Int16Array) ||
    !samples.length ||
    !Number.isInteger(sampleRate) ||
    sampleRate < 8000 ||
    sampleRate > 96000
  ) {
    throw new Error('Expected nonempty mono PCM16 samples and valid sample rate.');
  }
  const frame = Math.round(sampleRate * 0.02);
  const activeThreshold = 32768 * 10 ** (-40 / 20);
  let peak = 0;
  let clippedSamples = 0;
  let activeSamples = 0;
  const zeroIslands = [];
  for (let index = 0; index < samples.length; index++) {
    peak = Math.max(peak, Math.abs(samples[index]));
    if (samples[index] === 32767 || samples[index] === -32768) {
      clippedSamples++;
    }
    if (samples[index] !== 0) {
      continue;
    }
    const start = index;
    while (index < samples.length && samples[index] === 0) {
      index++;
    }
    const end = index;
    if (
      end - start >= frame &&
      start >= frame &&
      end + frame <= samples.length &&
      rms(samples, start - frame, start) >= activeThreshold &&
      rms(samples, end, end + frame) >= activeThreshold
    ) {
      zeroIslands.push({
        startMs: (start * 1000) / sampleRate,
        endMs: (end * 1000) / sampleRate,
        durationMs: ((end - start) * 1000) / sampleRate,
      });
    }
    // Revisit the first nonzero sample after this run for peak/clipping accounting.
    index--;
  }
  for (let start = 0; start < samples.length; start += frame) {
    const end = Math.min(start + frame, samples.length);
    if (rms(samples, start, end) >= activeThreshold) {
      activeSamples += end - start;
    }
  }
  return {
    durationMs: (samples.length * 1000) / sampleRate,
    peak,
    rmsDbfs: Math.max(-120, 20 * Math.log10(rms(samples, 0, samples.length) / 32768)),
    clippedSamples,
    clippedFraction: clippedSamples / samples.length,
    activeMs: (activeSamples * 1000) / sampleRate,
    zeroIslands,
    activeAtEnd:
      rms(samples, Math.max(0, samples.length - frame), samples.length) >= activeThreshold,
  };
}
