const { execFileSync } = require('node:child_process');
const path = require('node:path');

// Nova Sonic expects base64 raw PCM, not a WAV container. Match the config's
// mono, 16-bit, 16 kHz input even when the source audio uses a different rate.
module.exports = async function ({ vars }) {
  const pcm = execFileSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      path.resolve(__dirname, vars.audio_file),
      '-ar',
      '16000',
      '-ac',
      '1',
      '-f',
      's16le',
      'pipe:1',
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  );
  return [{ role: 'user', content: [{ type: 'audio', text: pcm.toString('base64') }] }];
};
