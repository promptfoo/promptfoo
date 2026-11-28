export default function mentionsFruitLoops(output) {
  return typeof output === 'string' && /\b(?:fruit|froot) loops\b/i.test(output);
}
