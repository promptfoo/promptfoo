import type { DataRecord } from 'natural';
import type { Stemmer } from 'natural';
import { PorterStemmer, WordNet } from 'natural';
import type { AssertionParams, GradingResult } from '../types';
import invariant from '../util/invariant';

type WordPair = [number, string];
type MatchPair = [number, number];

interface MeteorAssertion {
  type: string;
  threshold?: number;
  alpha?: number;
  beta?: number;
  gamma?: number;
}

function preprocessWord(word: string): string {
  return word.toLowerCase();
}

function generateEnums(
  candidate: string[],
  reference: string[],
  preprocess: (word: string) => string = preprocessWord,
): [WordPair[], WordPair[]] {
  if (typeof candidate === 'string') {
    throw new TypeError(`"candidate" expects pre-tokenized candidate (string[]): ${candidate}`);
  }

  if (typeof reference === 'string') {
    throw new TypeError(`"reference" expects pre-tokenized reference (string[]): ${reference}`);
  }

  const enumCandidateList: WordPair[] = candidate.map(
    (word, idx): WordPair => [idx, preprocess(word)],
  );
  const enumReferenceList: WordPair[] = reference.map(
    (word, idx): WordPair => [idx, preprocess(word)],
  );
  return [enumCandidateList, enumReferenceList];
}

function matchExactEnums(
  enumCandidateList: WordPair[],
  enumReferenceList: WordPair[],
): [MatchPair[], WordPair[], WordPair[]] {
  const wordMatch: MatchPair[] = [];
  const candidateCopy = [...enumCandidateList];
  const referenceCopy = [...enumReferenceList];

  for (let i = candidateCopy.length - 1; i >= 0; i--) {
    for (let j = referenceCopy.length - 1; j >= 0; j--) {
      if (candidateCopy[i][1] === referenceCopy[j][1]) {
        wordMatch.push([candidateCopy[i][0], referenceCopy[j][0]]);
        candidateCopy.splice(i, 1);
        referenceCopy.splice(j, 1);
        break;
      }
    }
  }

  return [wordMatch, candidateCopy, referenceCopy];
}

function matchStemEnums(
  enumCandidateList: WordPair[],
  enumReferenceList: WordPair[],
  stemmer: Stemmer = PorterStemmer,
): [MatchPair[], WordPair[], WordPair[]] {
  const candidateCopy = [...enumCandidateList];
  const referenceCopy = [...enumReferenceList];

  // Create stemmed versions of words
  const candidateStems = candidateCopy.map(
    ([idx, word]) => [idx, stemmer.stem(word)] as [number, string],
  );
  const referenceStems = referenceCopy.map(
    ([idx, word]) => [idx, stemmer.stem(word)] as [number, string],
  );

  return matchExactEnums(
    candidateStems.map(([idx, stem]) => [idx, stem] as WordPair),
    referenceStems.map(([idx, stem]) => [idx, stem] as WordPair),
  );
}

async function matchSynonymEnums(
  enumCandidateList: WordPair[],
  enumReferenceList: WordPair[],
  wordnet: WordNet = new WordNet(),
): Promise<[MatchPair[], WordPair[], WordPair[]]> {
  const wordMatch: MatchPair[] = [];
  const candidateCopy = [...enumCandidateList];
  const referenceCopy = [...enumReferenceList];

  for (let i = candidateCopy.length - 1; i >= 0; i--) {
    const candidateWord = candidateCopy[i][1];

    // Get all synsets and their synonyms
    const candidateSynsets = await new Promise<DataRecord[]>((resolve) => {
      wordnet.lookup(candidateWord, (results: DataRecord[]) => resolve(results));
    });

    // Create set of synonyms, filtering out ones with underscores
    // and including the original word
    const candidateSynonymSet = new Set([
      candidateWord,
      ...candidateSynsets.flatMap((synset) =>
        synset.synonyms.filter((syn: string) => !syn.includes('_')),
      ),
    ]);

    for (let j = referenceCopy.length - 1; j >= 0; j--) {
      const referenceWord = referenceCopy[j][1];
      if (candidateSynonymSet.has(referenceWord)) {
        wordMatch.push([candidateCopy[i][0], referenceCopy[j][0]]);
        candidateCopy.splice(i, 1);
        referenceCopy.splice(j, 1);
        break;
      }
    }
  }

  return [wordMatch, candidateCopy, referenceCopy];
}

function countChunks(matches: MatchPair[]): number {
  if (matches.length === 0) {
    return 0;
  }
  let chunks = 1;
  for (let i = 0; i < matches.length - 1; i++) {
    if (matches[i + 1][0] !== matches[i][0] + 1 || matches[i + 1][1] !== matches[i][1] + 1) {
      chunks++;
    }
  }
  return chunks;
}

async function calculateSingleMeteorScore(
  reference: string[],
  candidate: string[],
  alpha: number = 0.9,
  beta: number = 3.0,
  gamma: number = 0.5,
): Promise<number> {
  const [enumCandidate, enumReference] = generateEnums(candidate, reference);
  const translationLength = enumCandidate.length;
  const referenceLength = enumReference.length;

  // Stage 1: Exact matches
  const [exactMatches, remainingCandidate, remainingReference] = matchExactEnums(
    enumCandidate,
    enumReference,
  );

  // Stage 2: Stem matches
  const [stemMatches, remainingCandidateAfterStem, remainingReferenceAfterStem] = matchStemEnums(
    remainingCandidate,
    remainingReference,
  );

  // Stage 3: Synonym matches
  const [synonymMatches, ,] = await matchSynonymEnums(
    remainingCandidateAfterStem,
    remainingReferenceAfterStem,
  );

  // Combine all matches
  const allMatches = [...exactMatches, ...stemMatches, ...synonymMatches].sort(
    (a, b) => a[0] - b[0],
  );
  const matchesCount = allMatches.length;

  if (matchesCount === 0) {
    return 0;
  }

  let fragFrac = 0;
  let fmean = 0;
  if (translationLength === 0 || referenceLength === 0 || matchesCount === 0) {
    return 0.0;
  }

  const precision = matchesCount / translationLength;
  const recall = matchesCount / referenceLength;
  const denominator = alpha * precision + (1 - alpha) * recall;

  if (denominator === 0) {
    return 0.0;
  }

  fmean = (precision * recall) / denominator;
  const chunkCount = countChunks(allMatches);
  fragFrac = chunkCount / matchesCount;
  const penalty = gamma * Math.pow(fragFrac, beta);

  return (1 - penalty) * fmean;
}

async function calculateMeteorScore(
  candidate: string,
  references: string[],
  alpha: number = 0.9,
  beta: number = 3.0,
  gamma: number = 0.5,
): Promise<number> {
  if (!candidate || references.length === 0) {
    throw new Error('Invalid inputs');
  }

  const scores = await Promise.all(
    references.map((reference) =>
      calculateSingleMeteorScore(
        reference.split(/\s+/).map((word) => word.replace(/\.+$/, '')),
        candidate.split(/\s+/).map((word) => word.replace(/\.+$/, '')),
        alpha,
        beta,
        gamma,
      ),
    ),
  );

  return Math.max(...scores);
}

export async function handleMeteorAssertion({
  assertion,
  inverse,
  outputString,
  renderedValue,
  test,
}: AssertionParams): Promise<GradingResult> {
  // Validate inputs
  invariant(
    typeof renderedValue === 'string' ||
      (Array.isArray(renderedValue) && renderedValue.every((v) => typeof v === 'string')),
    '"meteor" assertion must have a string or array of strings value',
  );

  const references = Array.isArray(renderedValue) ? renderedValue : [renderedValue];

  // Get parameters from assertion or use defaults
  const meteorAssertion = assertion as unknown as MeteorAssertion;
  const alpha = meteorAssertion.alpha ?? 0.9;
  const beta = meteorAssertion.beta ?? 3.0;
  const gamma = meteorAssertion.gamma ?? 0.5;
  const threshold = meteorAssertion.threshold ?? 0.5;

  const score = await calculateMeteorScore(outputString, references, alpha, beta, gamma);

  const pass = inverse ? score < threshold : score >= threshold;

  return {
    pass,
    score: inverse ? 1 - score : score,
    reason: pass
      ? 'METEOR assertion passed'
      : `METEOR score ${score.toFixed(4)} did not meet threshold ${threshold}`,
    assertion,
  };
}
