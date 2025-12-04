const RIFF = Buffer.from('RIFF');

export const ensureWav = (audio: Buffer, sampleRate = 24000): Buffer => {
  if (audio.length >= 4 && audio.subarray(0, 4).equals(RIFF)) {
    return audio;
  }

  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = audio.length;
  const riffSize = 36 + dataSize;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(riffSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, audio]);
};

export const stripWavHeaderToPcm16 = (audio: Buffer): Buffer => {
  if (audio.length < 44 || !audio.subarray(0, 4).equals(RIFF)) {
    return audio;
  }

  // WAV files can have multiple chunks, so we need to find the "data" chunk
  // Format: "data" (4 bytes) + size (4 bytes) + actual data
  let offset = 12; // Skip "RIFF" + size + "WAVE"

  while (offset < audio.length - 8) {
    const chunkId = audio.subarray(offset, offset + 4).toString('ascii');
    const chunkSize = audio.readUInt32LE(offset + 4);

    if (chunkId === 'data') {
      // Found the data chunk, return everything from here (excluding the chunk header)
      return audio.subarray(offset + 8);
    }

    // Move to next chunk (chunk header is 8 bytes: 4 for ID, 4 for size)
    offset += 8 + chunkSize;
  }

  // Fallback to old behavior if we can't find data chunk
  return audio.subarray(44);
};

export const describeWav = (audio: Buffer) => {
  if (audio.length < 44 || !audio.subarray(0, 4).equals(RIFF)) {
    return { hasHeader: false, frames: null, sampleRate: null, durationSec: null };
  }

  // Read fmt chunk info (should be at offset 20-35)
  const sampleRate = audio.readUInt32LE(24);
  const bitsPerSample = audio.readUInt16LE(34);
  const numChannels = audio.readUInt16LE(22);

  // Find the actual data chunk to get the real data size
  let dataSize = 0;
  let dataOffset = -1;
  let offset = 12; // Skip "RIFF" + size + "WAVE"

  while (offset < audio.length - 8) {
    const chunkId = audio.subarray(offset, offset + 4).toString('ascii');
    const chunkSize = audio.readUInt32LE(offset + 4);

    if (chunkId === 'data') {
      dataSize = chunkSize;
      dataOffset = offset + 8;
      break;
    }

    offset += 8 + chunkSize;
  }

  // Fallback to reading from offset 40 if we can't find data chunk
  if (dataSize === 0 && audio.length >= 44) {
    dataSize = audio.readUInt32LE(40);
    dataOffset = 44;
  }

  // Calculate the actual available data size
  const actualDataSize = dataOffset > 0 ? audio.length - dataOffset : 0;

  const bytesPerSample = bitsPerSample / 8;
  const frames = dataSize / (bytesPerSample * numChannels);
  const durationSec = frames / sampleRate;

  // Also calculate actual duration based on available bytes
  const actualFrames = actualDataSize / (bytesPerSample * numChannels);
  const actualDurationSec = actualFrames / sampleRate;

  return {
    hasHeader: true,
    frames,
    sampleRate,
    durationSec,
    declaredDataSize: dataSize,
    actualDataSize,
    actualDurationSec,
    actualSize: audio.length,
    dataOffset,
  };
};

/**
 * Concatenates multiple WAV audio buffers into a single WAV file.
 * All buffers must have the same sample rate, channels, and bit depth.
 */
export const concatenateWav = (audioBuffers: Buffer[], sampleRate = 24000): Buffer => {
  if (audioBuffers.length === 0) {
    return ensureWav(Buffer.alloc(0), sampleRate);
  }

  if (audioBuffers.length === 1) {
    return ensureWav(audioBuffers[0], sampleRate);
  }

  // Strip headers and collect PCM data
  const pcmChunks = audioBuffers.map(stripWavHeaderToPcm16);
  const totalPcmSize = pcmChunks.reduce((sum, chunk) => sum + chunk.length, 0);

  // Concatenate all PCM data
  const combinedPcm = Buffer.concat(pcmChunks, totalPcmSize);

  // Add WAV header to combined PCM
  return ensureWav(combinedPcm, sampleRate);
};

/**
 * Interleaves audio from two arrays of WAV buffers, creating a single conversation audio file.
 * Alternates between attacker and target audio: attacker1, target1, attacker2, target2, etc.
 * All buffers must have the same sample rate, channels, and bit depth.
 */
export const interleaveConversationAudio = (
  attackerBuffers: Buffer[],
  targetBuffers: Buffer[],
  sampleRate = 24000,
): Buffer => {
  if (attackerBuffers.length === 0 && targetBuffers.length === 0) {
    return ensureWav(Buffer.alloc(0), sampleRate);
  }

  const pcmChunks: Buffer[] = [];
  const maxTurns = Math.max(attackerBuffers.length, targetBuffers.length);

  for (let i = 0; i < maxTurns; i++) {
    // Add attacker audio for this turn
    if (i < attackerBuffers.length) {
      pcmChunks.push(stripWavHeaderToPcm16(attackerBuffers[i]));
    }

    // Add target audio for this turn
    if (i < targetBuffers.length) {
      pcmChunks.push(stripWavHeaderToPcm16(targetBuffers[i]));
    }
  }

  const totalPcmSize = pcmChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combinedPcm = Buffer.concat(pcmChunks, totalPcmSize);

  return ensureWav(combinedPcm, sampleRate);
};
