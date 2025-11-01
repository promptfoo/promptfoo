// src/pages/eval/diff/components/InlineDiff.tsx
import { diff_match_patch, Diff } from "diff-match-patch";

// Renders a semantic-cleaned inline diff:
// - unchanged: normal text
// - deletions: red background + strike-through
// - insertions: green background
export function DiffMatchPatch({ before, after }: { before: string; after: string }) {
  const dmp = new diff_match_patch();      // create the diff engine
  const diffs: Diff[] = dmp.diff_main(before, after); // compute raw diff tuples
  dmp.diff_cleanupSemantic(diffs);         // cleanup to human-friendly chunks

  return (
    <pre className="whitespace-pre-wrap break-words text-sm">
      {diffs.map(([op, text], idx) => {
        if (op === 0)   return <span key={idx}>{text}</span>;                                 // equal
        if (op === -1)  return <span key={idx} className="bg-red-100 line-through">{text}</span>; // deletion
        /* op === 1 */  return <span key={idx} className="bg-green-100">{text}</span>;            // insertion
      })}
    </pre>
  );
}