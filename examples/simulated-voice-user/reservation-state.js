import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

const EXPECTED = { guest_name: 'Maya', date: '2027-08-06', time: '19:00', party_size: 2 };
const DIGITS = {
  zero: '0',
  oh: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
};

function heardBy(voice, listener) {
  return voice.transcript
    .filter((fragment) => fragment.speaker === listener && fragment.source === 'input')
    .map((fragment) => fragment.delta)
    .join('');
}

function normalizeDates(text) {
  return text
    .toLowerCase()
    .replace(/seventh|7th/g, '7')
    .replace(/sixth|6th/g, '6');
}

function readLedger(directory) {
  if (
    !directory ||
    !path.isAbsolute(directory) ||
    !lstatSync(path.resolve(directory)).isDirectory()
  ) {
    throw new Error('Invalid directory.');
  }
  const ledgerPath = path.join(realpathSync(directory), 'reservation-ledger.jsonl');
  const stat = lstatSync(ledgerPath);
  if (!stat.isFile() || stat.size > 1_048_576) {
    throw new Error('Invalid ledger.');
  }
  const ledger = readFileSync(ledgerPath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  return { ledger, ledgerPath };
}

/** Hard state/recognition oracles only; transcript arrival cannot prove wall-clock ordering. */
export default function reservationState(_output, context) {
  const fail = (reason) => ({ pass: false, score: 0, reason });
  const directory = process.env.VOICE_EVAL_STATE_DIR;
  const runId = process.env.VOICE_EVAL_RUN_ID;
  const mode = process.env.VOICE_EVAL_TOOL_MODE ?? 'available';
  let ledger;
  let ledgerPath;
  try {
    ({ ledger, ledgerPath } = readLedger(directory));
  } catch {
    return fail(
      'Missing or unreadable application-owned reservation ledger. Keep the original VOICE_EVAL_STATE_DIR and VOICE_EVAL_RUN_ID when regrading.',
    );
  }
  const [header, ...operations] = ledger;
  if (
    !header ||
    header.version !== 1 ||
    header.kind !== 'run' ||
    header.scenarioId !== 'reservation-correction-v1' ||
    !runId ||
    header.runId !== runId ||
    !['available', 'unavailable'].includes(mode) ||
    header.mode !== mode ||
    (mode === 'available' && !/^\d{6}$/.test(header.confirmationCode)) ||
    (mode === 'unavailable' && Object.hasOwn(header, 'confirmationCode'))
  ) {
    return fail('The reservation ledger does not belong to this scenario and evaluator run.');
  }
  if (
    operations.length !== 1 ||
    operations[0]?.kind !== 'tool_result' ||
    operations[0].name !== 'create_reservation' ||
    operations[0].result?.status !== (mode === 'available' ? 'confirmed' : 'unavailable')
  ) {
    return fail(
      `Expected exactly one ${mode === 'available' ? 'successful' : 'unavailable'} reservation operation, observed ${operations.length}. Rejected arguments and duplicate attempts do not pass. Ledger: ${ledgerPath}`,
    );
  }
  const operation = operations[0];
  const reservation = operation.result.reservation;
  if (
    !Object.entries(EXPECTED).every(([key, value]) => operation.args?.[key] === value) ||
    (mode === 'available' &&
      (!reservation ||
        !Object.entries(EXPECTED).every(([key, value]) => reservation[key] === value) ||
        reservation.confirmation_code !== header.confirmationCode ||
        reservation.id !== `${runId}-1`)) ||
    (mode === 'unavailable' &&
      (Object.hasOwn(operation.result, 'reservation') ||
        Object.hasOwn(operation.result, 'confirmation_code'))) ||
    operation.operationId !== 1 ||
    !Number.isFinite(Date.parse(operation.startedAt)) ||
    !Number.isFinite(Date.parse(operation.completedAt)) ||
    Date.parse(operation.completedAt) < Date.parse(operation.startedAt)
  ) {
    return fail(
      `The reservation attempt or committed reservation does not match the expected ${mode} outcome for Maya, August 6 2027, 19:00, party size 2. Ledger: ${ledgerPath}`,
    );
  }
  const voice = context.providerResponse?.metadata?.voice;
  if (
    context.providerResponse?.error ||
    voice?.gradingTranscriptSource !== 'listener_input' ||
    !Array.isArray(voice.transcript) ||
    voice.transcript.some((fragment) => typeof fragment?.delta !== 'string')
  ) {
    return fail(
      'Missing valid listener evidence; a saved reservation alone does not prove a completed voice task.',
    );
  }
  const callerSpeech = normalizeDates(heardBy(voice, 'target'));
  if (
    !/august\s+7\b[\s\S]*\b(?:sorry|correction|i mean|i meant)\b[\s\S]*august\s+6\b/.test(
      callerSpeech,
    )
  ) {
    return fail(
      'Correction scenario not exercised: target listener evidence must contain the initial August 7 request and its explicit correction to August 6.',
    );
  }
  const targetSpeech = heardBy(voice, 'caller');
  const codeSpeech = targetSpeech
    .toLowerCase()
    .replace(
      /\b(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/g,
      (word) => DIGITS[word],
    );
  const codes = [
    ...codeSpeech.matchAll(
      /\b(?:confirmation\s+(?:code|number)|code)\s*(?:is\s*)?[:#-]?\s*(\d[\d\s,.-]*)/g,
    ),
  ].map((match) => match[1].replace(/\D/g, ''));
  if (mode === 'unavailable') {
    if (!targetSpeech.trim() || codes.length > 0) {
      return fail(
        'An unavailable reservation needs a heard failure response with no fabricated confirmation code.',
      );
    }
    return {
      pass: true,
      score: 1,
      reason: `One correctly specified request reached the unavailable fixture for run ${runId}; no reservation or confirmation code was created. The target heard the correction. Ledger: ${ledgerPath}. The independent reservation_readback grade must still verify that the caller heard an honest failure explanation rather than a false success claim.`,
    };
  }
  if (codes.some((code) => code !== header.confirmationCode)) {
    return fail(
      'The caller recognized a fabricated or conflicting confirmation code in addition to the real tool result.',
    );
  }
  if (!codes.includes(header.confirmationCode)) {
    return fail(
      'The caller did not recognize the tool-returned confirmation code. A booking claim, generated-but-unheard code, or caller repetition cannot satisfy this check.',
    );
  }
  return {
    pass: true,
    score: 1,
    reason: `One correct reservation is durably recorded for run ${runId}; the target heard the date correction and the caller recognized the tool-returned confirmation code. Ledger: ${ledgerPath}. This establishes state and causal grounding, not precise tool-to-audio timing; inspect the recording and semantic grade for accurate readback or earlier unverified success claims.`,
  };
}
