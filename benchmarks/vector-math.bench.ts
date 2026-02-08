import { bench, describe } from 'vitest';

// Vector math functions to benchmark
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must be of equal length');
  }
  const dotProduct = vecA.reduce((acc, val, idx) => acc + val * vecB[idx], 0);
  const vecAMagnitude = Math.sqrt(vecA.reduce((acc, val) => acc + val * val, 0));
  const vecBMagnitude = Math.sqrt(vecB.reduce((acc, val) => acc + val * val, 0));
  return dotProduct / (vecAMagnitude * vecBMagnitude);
}

function dotProduct(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must be of equal length');
  }
  return vecA.reduce((acc, val, idx) => acc + val * vecB[idx], 0);
}

function euclideanDistance(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must be of equal length');
  }
  const sumSquaredDiff = vecA.reduce((acc, val, idx) => {
    const diff = val - vecB[idx];
    return acc + diff * diff;
  }, 0);
  return Math.sqrt(sumSquaredDiff);
}

// Test vectors for benchmarking
const smallVectorA = Array.from({ length: 10 }, (_, i) => i * 0.1);
const smallVectorB = Array.from({ length: 10 }, (_, i) => Math.sin(i * 0.1));

const mediumVectorA = Array.from({ length: 100 }, (_, i) => i * 0.01);
const mediumVectorB = Array.from({ length: 100 }, (_, i) => Math.sin(i * 0.01));

const largeVectorA = Array.from({ length: 1000 }, (_, i) => i * 0.001);
const largeVectorB = Array.from({ length: 1000 }, (_, i) => Math.sin(i * 0.001));

describe('Vector Math Operations', () => {
  describe('Cosine Similarity', () => {
    bench('small vectors (10 elements)', () => {
      cosineSimilarity(smallVectorA, smallVectorB);
    });

    bench('medium vectors (100 elements)', () => {
      cosineSimilarity(mediumVectorA, mediumVectorB);
    });

    bench('large vectors (1000 elements)', () => {
      cosineSimilarity(largeVectorA, largeVectorB);
    });
  });

  describe('Dot Product', () => {
    bench('small vectors (10 elements)', () => {
      dotProduct(smallVectorA, smallVectorB);
    });

    bench('medium vectors (100 elements)', () => {
      dotProduct(mediumVectorA, mediumVectorB);
    });

    bench('large vectors (1000 elements)', () => {
      dotProduct(largeVectorA, largeVectorB);
    });
  });

  describe('Euclidean Distance', () => {
    bench('small vectors (10 elements)', () => {
      euclideanDistance(smallVectorA, smallVectorB);
    });

    bench('medium vectors (100 elements)', () => {
      euclideanDistance(mediumVectorA, mediumVectorB);
    });

    bench('large vectors (1000 elements)', () => {
      euclideanDistance(largeVectorA, largeVectorB);
    });
  });
});
