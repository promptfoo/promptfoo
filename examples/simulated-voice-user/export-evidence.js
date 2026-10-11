import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { analyzePcm16, readPcm16Wav, writePcm16Wav } from './audio-utils.js';

const MAX_EXPORT_BYTES = 256 * 1024 * 1024;
const MAX_AUDIO_BYTES = 30 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

async function readBounded(file, limit) {
  const info = await stat(file);
  if (!info.isFile() || info.size > limit) {
    throw new Error(`Expected a regular file no larger than ${limit} bytes.`);
  }
  const bytes = await readFile(file);
  if (bytes.length > limit) {
    throw new Error(`File exceeds ${limit} bytes.`);
  }
  return bytes;
}

function decodeAudio(data) {
  if (typeof data !== 'string' || data.length > Math.ceil(MAX_AUDIO_BYTES / 3) * 4) {
    throw new Error('Missing or oversized base64 audio.');
  }
  const bytes = Buffer.from(data, 'base64');
  if (!bytes.length || bytes.toString('base64') !== data || bytes.length > MAX_AUDIO_BYTES) {
    throw new Error('Audio must contain canonical base64 within the recording size limit.');
  }
  return bytes;
}

/** Resolve content by its hash only. Never fetch URLs or infer a local path from a blob URI. */
async function recordingBytes(audio, assets, configDir) {
  const ref = audio?.blobRef;
  if (!ref || !HASH.test(ref.hash)) {
    throw new Error('A recording blob reference with a SHA-256 hash is required.');
  }
  if (!Number.isSafeInteger(ref.sizeBytes) || ref.sizeBytes < 1) {
    throw new Error('The recording reference is missing its byte count.');
  }
  const matching = assets.filter((asset) => asset?.hash === ref.hash);
  if (matching.length > 1) {
    throw new Error('The export contains duplicate assets for this recording hash.');
  }
  let bytes;
  let source;
  if (matching.length === 1) {
    const asset = matching[0];
    bytes = decodeAudio(asset.data);
    if (asset.sizeBytes !== bytes.length || asset.mimeType !== 'audio/wav') {
      throw new Error('Embedded recording metadata does not match the WAV asset.');
    }
    source = 'portable-export';
  } else if (configDir && ref.provider === 'filesystem') {
    const base = await realpath(path.join(configDir, 'blobs'));
    const file = await realpath(
      path.join(base, ref.hash.slice(0, 2), ref.hash.slice(2, 4), ref.hash),
    );
    const relative = path.relative(base, file);
    if (
      !relative ||
      relative.startsWith(`..${path.sep}`) ||
      relative === '..' ||
      path.isAbsolute(relative)
    ) {
      throw new Error('The recording resolves outside the selected filesystem blob directory.');
    }
    bytes = await readBounded(file, MAX_AUDIO_BYTES);
    source = 'filesystem';
  } else {
    throw new Error(
      'Recording bytes are missing. Export this eval with --include-media, or supply --config-dir for its local filesystem blobs.',
    );
  }
  if (
    sha256(bytes) !== ref.hash ||
    bytes.length !== ref.sizeBytes ||
    ref.mimeType !== 'audio/wav'
  ) {
    throw new Error('Recording SHA-256, byte count, or MIME type does not match its reference.');
  }
  return { bytes, source, hash: ref.hash };
}

function channelsFromRecording(bytes, voice, audio) {
  if (
    !Array.isArray(voice?.audioChannels) ||
    voice.audioChannels.length !== 2 ||
    voice.audioChannels[0] !== 'target' ||
    voice.audioChannels[1] !== 'caller'
  ) {
    throw new Error('Expected an explicit target-left, caller-right audio channel mapping.');
  }
  const wav = readPcm16Wav(bytes);
  if (
    wav.channels !== 2 ||
    wav.sampleRate !== 24000 ||
    (audio.channels !== undefined && audio.channels !== wav.channels) ||
    (audio.sampleRate !== undefined && audio.sampleRate !== wav.sampleRate)
  ) {
    throw new Error('Expected stereo PCM16 at 24000 Hz with matching audio metadata.');
  }
  const target = new Int16Array(wav.samples.length / 2);
  const caller = new Int16Array(target.length);
  for (let index = 0; index < target.length; index++) {
    target[index] = wav.samples[index * 2];
    caller[index] = wav.samples[index * 2 + 1];
  }
  return { sampleRate: wav.sampleRate, target, caller };
}

function frameActivity(samples, sampleRate) {
  const count = Math.round(sampleRate * 0.02);
  const active = [];
  for (let start = 0; start < samples.length; start += count) {
    let squares = 0;
    const end = Math.min(samples.length, start + count);
    for (let index = start; index < end; index++) {
      squares += (samples[index] / 32768) ** 2;
    }
    active.push(Math.sqrt(squares / (end - start)) >= 0.01);
  }
  return active;
}

/** Activity observations locate review regions; they do not prove semantic interruption success. */
function interventionObservations(voice, target, caller, sampleRate) {
  const targetActive = frameActivity(target, sampleRate);
  const callerActive = frameActivity(caller, sampleRate);
  return (Array.isArray(voice.interventions) ? voice.interventions : []).map((entry) => {
    const startMs = entry.firstFrameAtMs;
    const endMs = entry.completedAtMs;
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      startMs < 0 ||
      endMs <= startMs ||
      endMs > (target.length / sampleRate) * 1000
    ) {
      return {
        scheduledAtMs: entry.scheduledAtMs,
        measurement: 'unavailable',
        reason: 'No valid complete audio interval.',
      };
    }
    const startFrame = Math.floor(startMs / 20);
    const endFrame = Math.min(targetActive.length, Math.ceil(endMs / 20));
    let overlapFrames = 0;
    let firstCallerFrame;
    for (let frame = startFrame; frame < endFrame; frame++) {
      if (callerActive[frame] && firstCallerFrame === undefined) {
        firstCallerFrame = frame;
      }
      if (targetActive[frame] && callerActive[frame]) {
        overlapFrames++;
      }
    }
    const preceding = targetActive.slice(Math.max(0, startFrame - 5), startFrame);
    const activeBeforeCue = preceding.length > 0 && preceding.every(Boolean);
    const firstQuietAt = (frames) => {
      if (firstCallerFrame !== undefined) {
        for (let frame = firstCallerFrame; frame + frames <= targetActive.length; frame++) {
          if (targetActive.slice(frame, frame + frames).every((value) => !value)) {
            return frame * 20;
          }
        }
      }
      return null;
    };
    const activeBeforeOnset = (frames) =>
      firstCallerFrame === undefined
        ? null
        : targetActive
            .slice(Math.max(0, firstCallerFrame - frames), firstCallerFrame)
            .filter(Boolean).length * 20;
    const recent1000Ms = activeBeforeOnset(50);
    const recent100Ms = activeBeforeOnset(5);
    const completeLookback = firstCallerFrame !== undefined && firstCallerFrame >= 50;
    return {
      scheduledAtMs: entry.scheduledAtMs,
      firstFrameAtMs: startMs,
      completedAtMs: endMs,
      activityThresholdDbfs: -40,
      frameMs: 20,
      targetActiveFor100MsBeforeCue: activeBeforeCue,
      callerActivityOnsetMs: firstCallerFrame === undefined ? null : firstCallerFrame * 20,
      overlapMs: overlapFrames * 20,
      first100MsTargetQuietAtMs: firstQuietAt(5),
      first200MsTargetQuietAtMs: firstQuietAt(10),
      targetActiveMsIn1000MsBeforeCallerOnset: recent1000Ms,
      targetActiveMsIn100MsBeforeCallerOnset: recent100Ms,
      activeSpeechOpportunity: completeLookback
        ? recent1000Ms >= 300 && recent100Ms >= 20
          ? 'eligible-by-pcm'
          : 'not-exercised-by-pcm'
        : 'unavailable',
      activeSpeechOpportunityCriteria: {
        lookbackMs: 1000,
        minimumActiveMs: 300,
        immediateLookbackMs: 100,
        minimumImmediateActiveMs: 20,
        interpretation:
          'Advisory benchmark eligibility, not semantic success. Verify from the audio that the original utterance was unfinished at caller onset.',
      },
      interruptionOpportunity: activeBeforeCue
        ? 'target-active-before-cue'
        : 'needs-listening-review',
      interpretation:
        'Zero overlap can occur when the target stops at the cue. Quiet is not proof of yielding; inspect whether the obsolete answer stops and the new request is answered.',
    };
  });
}

function evidenceFor(row, index) {
  return {
    rowIndex: index,
    resultId: row.id ?? null,
    description: row.testCase?.description ?? null,
    prompt: typeof row.prompt === 'string' ? row.prompt : (row.prompt?.raw ?? null),
    scenario: {
      instructions: row.testCase?.vars?.instructions ?? null,
      authoritativeFacts: row.testCase?.vars?.authoritativeFacts ?? null,
      requiredGoals: row.testCase?.vars?.requiredGoals ?? null,
    },
    success: row.success ?? null,
    error: row.error ?? row.response?.error ?? null,
    gradingResult: row.gradingResult ?? null,
    namedScores: row.namedScores ?? null,
    voice: row.response?.metadata?.voice ?? null,
  };
}

/** Recover only complete prepared utterances whose actual caller PCM matches the preparation hash. */
async function exportInterventionClips(voice, caller, sampleRate, destination, prefix) {
  const clips = [];
  for (const [index, intervention] of (voice.interventions ?? []).entries()) {
    if (intervention.mode !== 'audio') {
      continue;
    }
    const clip = { interventionIndex: index, firstFrameAtMs: intervention.firstFrameAtMs };
    clips.push(clip);
    try {
      const bytes = intervention.deliveredAudioBytes;
      const start = (intervention.firstFrameAtMs * sampleRate) / 1000;
      const durationMs = (bytes / (sampleRate * 2)) * 1000;
      if (
        !Number.isSafeInteger(bytes) ||
        bytes < 2 ||
        bytes % 2 !== 0 ||
        !Number.isFinite(start) ||
        start < 0 ||
        Math.abs(start - Math.round(start)) > 1e-6 ||
        !Number.isFinite(intervention.clipDurationMs) ||
        intervention.clipDurationMs <= 0 ||
        Math.abs(durationMs - intervention.clipDurationMs) > (1 / sampleRate) * 1000 ||
        !Number.isFinite(intervention.completedAtMs) ||
        Math.abs(intervention.completedAtMs - intervention.firstFrameAtMs - durationMs) >
          (1 / sampleRate) * 1000 ||
        Math.round(start) + bytes / 2 > caller.length ||
        !HASH.test(intervention.clipSha256)
      ) {
        throw new Error(
          'Prepared utterance is partial or has invalid timing, length, or hash evidence.',
        );
      }
      const samples = caller.slice(Math.round(start), Math.round(start) + bytes / 2);
      const pcm = Buffer.alloc(bytes);
      for (const [sampleIndex, sample] of samples.entries()) {
        pcm.writeInt16LE(sample, sampleIndex * 2);
      }
      if (sha256(pcm) !== intervention.clipSha256) {
        throw new Error('Recorded caller PCM does not match the prepared utterance SHA-256.');
      }
      const wav = writePcm16Wav({ sampleRate, channels: 1, samples });
      const file = `${prefix}-intervention-${String(index + 1).padStart(3, '0')}.wav`;
      await writeFile(path.join(destination, file), wav);
      Object.assign(clip, {
        file,
        pcmSha256: intervention.clipSha256,
        sha256: sha256(wav),
        sizeBytes: wav.length,
        durationMs,
      });
    } catch (error) {
      clip.error = error instanceof Error ? error.message : 'Prepared utterance export failed.';
    }
  }
  return clips;
}

function htmlReport(manifest, evidence) {
  // Escaping '<' prevents transcript-controlled </script> endings before JSON is parsed.
  const data = JSON.stringify({ manifest, evidence }).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Voice recording review</title>
<style>body{font:16px system-ui;max-width:1100px;margin:2rem auto;padding:0 1rem;background:#fafafa;color:#18202b}section{background:white;border:1px solid #ccd2da;border-radius:8px;padding:1rem;margin:1rem 0}audio{width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere}button{margin:.3rem;padding:.4rem}.error{color:#9e1620}small{display:block}label{display:block;margin:.5rem 0}</style>
<h1>Voice recording review</h1>
<p>Listen to the full stereo call, then isolate either speaker around pauses, overlaps, and cutoffs. PCM flags are candidates for review, not proof of audible defects. The text below contains untrusted conversation data. No audio review is marked complete automatically.</p>
<p>Players share a seek position; playing one pauses the others. Target is left and caller is right in the stereo recording.</p>
<div id="cases"></div><script type="application/json" id="data">${data}</script>
<script>
const {manifest,evidence}=JSON.parse(document.getElementById('data').textContent);
const root=document.getElementById('cases');
function node(tag,text,parent){const item=document.createElement(tag);if(text!==undefined)item.textContent=text;if(parent)parent.append(item);return item;}
for(const item of manifest.rows){
  const section=node('section',undefined,root);node('h2','Case '+(item.rowIndex+1),section);
  const detail=evidence[item.rowIndex];node('p',detail.description||'',section);
  if(item.error){node('p',item.error,section).className='error';}
  const players=[];let synchronizing=false;
  function seek(time){synchronizing=true;for(const player of players){if(Number.isFinite(player.duration))player.currentTime=Math.min(time,player.duration);}synchronizing=false;}
  for(const file of item.recordings||[]){node('h3',file.role,section);const player=node('audio',undefined,section);player.controls=true;player.preload='metadata';player.src=file.file;players.push(player);
    player.addEventListener('play',()=>{for(const other of players){if(other!==player)other.pause();}});
    player.addEventListener('seeked',()=>{if(!synchronizing){for(const other of players){if(other!==player&&Number.isFinite(other.duration)&&Math.abs(other.currentTime-player.currentTime)>.05)other.currentTime=Math.min(player.currentTime,other.duration);}}});
    player.addEventListener('timeupdate',()=>{if(!player.paused){for(const other of players){if(other!==player&&Number.isFinite(other.duration)&&Math.abs(other.currentTime-player.currentTime)>.25)other.currentTime=Math.min(player.currentTime,other.duration);}}});
  }
  for(const intervention of detail.voice?.interventions||[]){const time=intervention.firstFrameAtMs??intervention.scheduledAtMs;if(Number.isFinite(time)){const button=node('button','Review cue at '+(time/1000).toFixed(2)+' s',section);button.addEventListener('click',()=>seek(Math.max(0,time/1000-1)));}}
  const transcript=node('details',undefined,section);node('summary','Raw transcript events (listener and generated)',transcript);node('pre',JSON.stringify(detail.voice?.transcript??[],null,2),transcript);
  const grades=node('details',undefined,section);node('summary','Scenario, grades, and measured data',grades);node('pre',JSON.stringify({scenario:detail.scenario,prompt:detail.prompt,success:detail.success,error:detail.error,gradingResult:detail.gradingResult,metrics:item.metrics},null,2),grades);
  for(const text of ['Listened to the whole stereo recording','Checked each speaker and every flagged region','Compared independent transcription with the audio','Recorded defects with timestamps, or explicitly recorded none']){const label=node('label',undefined,section);const checkbox=node('input',undefined,label);checkbox.type='checkbox';label.append(document.createTextNode(' '+text));}
  node('small','Checklist state is not saved. Record conclusions and reviewed hashes in manual-review.json.',section);
}
</script></html>\n`;
}

/** Produce an offline review directory without loading credentials or fetching media. */
export async function exportEvidence(inputPath, outputPath, { configDir } = {}) {
  const input = JSON.parse((await readBounded(inputPath, MAX_EXPORT_BYTES)).toString('utf8'));
  const rows = input.results?.results;
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 1000) {
    throw new Error('Expected an eval JSON export with 1–1000 results.results rows.');
  }
  if (input.blobAssets !== undefined && !Array.isArray(input.blobAssets)) {
    throw new Error('blobAssets must be an array.');
  }
  const destination = path.resolve(outputPath);
  await mkdir(destination); // Intentionally reject even an existing empty directory.
  const manifest = {
    version: 1,
    evalId: input.evalId ?? null,
    sourceFile: path.resolve(inputPath),
    rows: [],
    errors: 0,
  };
  const evidence = [];
  const tests = [];
  const transcriptionTests = [];
  for (const [index, row] of rows.entries()) {
    const prefix = `case-${String(index + 1).padStart(3, '0')}`;
    const detail = evidenceFor(row ?? {}, index);
    evidence.push(detail);
    const entry = {
      rowIndex: index,
      evidenceFile: `${prefix}-evidence.json`,
      evalSuccess: detail.success,
      evalError: detail.error,
      recordings: [],
    };
    manifest.rows.push(entry);
    await writeFile(path.join(destination, entry.evidenceFile), json(detail));
    try {
      const audio = row?.response?.audio;
      const voice = row?.response?.metadata?.voice;
      const recording = await recordingBytes(audio, input.blobAssets ?? [], configDir);
      const { sampleRate, target, caller } = channelsFromRecording(recording.bytes, voice, audio);
      const tracks = [
        { role: 'stereo', bytes: recording.bytes, channels: 2 },
        {
          role: 'target',
          bytes: writePcm16Wav({ sampleRate, channels: 1, samples: target }),
          channels: 1,
        },
        {
          role: 'caller',
          bytes: writePcm16Wav({ sampleRate, channels: 1, samples: caller }),
          channels: 1,
        },
      ];
      for (const track of tracks) {
        const file = `${prefix}-${track.role}.wav`;
        await writeFile(path.join(destination, file), track.bytes);
        const id = randomUUID();
        entry.recordings.push({
          role: track.role,
          file,
          sha256: sha256(track.bytes),
          sizeBytes: track.bytes.length,
          sampleRate,
          channels: track.channels,
          audioId: id,
        });
        tests.push({
          description: id,
          // Promptfoo file references are literal paths, not percent-encoded URLs.
          vars: {
            audio_file: `file://${path.join(destination, file)}`,
            audio_id: id,
            audio_view: track.role === 'stereo' ? 'stereo_conversation' : `isolated_${track.role}`,
          },
        });
        if (track.channels === 1) {
          transcriptionTests.push({
            description: id,
            // The transcription provider opens this path after prompt rendering.
            vars: { audio_path: path.join(destination, file) },
          });
        }
      }
      entry.source = recording.source;
      entry.originalSha256 = recording.hash;
      entry.durationMs = (target.length / sampleRate) * 1000;
      entry.interventionClips = await exportInterventionClips(
        voice,
        caller,
        sampleRate,
        destination,
        prefix,
      );
      const failedClips = entry.interventionClips.filter((clip) => clip.error);
      if (failedClips.length) {
        entry.error = `${failedClips.length} prepared utterance(s) could not be verified. Full conversation recordings remain available; inspect interventionClips.`;
        manifest.errors++;
      }
      entry.metrics = {
        interpretation:
          'PCM measurements flag candidate anomalies only. Natural pauses, model-generated silence, and transport loss need different evidence.',
        target: analyzePcm16(target, sampleRate),
        caller: analyzePcm16(caller, sampleRate),
        bridgePlayout: {
          target: voice.participants?.target?.playout ?? null,
          caller: voice.participants?.caller?.playout ?? null,
        },
        interventions: interventionObservations(voice, target, caller, sampleRate),
      };
    } catch (error) {
      entry.error = error instanceof Error ? error.message : 'Recording export failed.';
      manifest.errors++;
    }
  }
  await writeFile(path.join(destination, 'manifest.json'), json(manifest));
  await writeFile(path.join(destination, 'audio-review-tests.json'), json(tests));
  await writeFile(path.join(destination, 'transcription-tests.json'), json(transcriptionTests));
  await writeFile(
    path.join(destination, 'manual-review.json'),
    json({
      status: 'not-reviewed',
      reviewerType: null,
      reviewedAudioHashes: [],
      findings: [],
      instructions:
        'Record reviewer type (human listening, audio-model review, or PCM inspection), coverage, timestamps, transcription disagreements, and a conclusion. These are different forms of evidence.',
    }),
  );
  await writeFile(path.join(destination, 'index.html'), htmlReport(manifest, evidence));
  return manifest;
}

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      out: { type: 'string' },
      'config-dir': { type: 'string' },
      help: { type: 'boolean' },
    },
    allowPositionals: true,
  });
  if (values.help) {
    console.log(
      'Usage: node export-evidence.js portable.json --out NEW_DIRECTORY [--config-dir RUN_STATE_DIRECTORY]',
    );
    return;
  }
  if (positionals.length !== 1 || !values.out) {
    throw new Error('Supply one eval JSON file and --out NEW_DIRECTORY. Use --help for usage.');
  }
  const manifest = await exportEvidence(positionals[0], values.out, {
    configDir: values['config-dir'],
  });
  console.log(
    `Exported ${manifest.rows.length} row(s); ${manifest.errors} recording error(s). Review ${path.resolve(values.out, 'index.html')}`,
  );
  if (manifest.errors) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Evidence export failed.');
    process.exitCode = 1;
  });
}
