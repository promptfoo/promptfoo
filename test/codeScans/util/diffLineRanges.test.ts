import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  clampCommentLines,
  extractValidLineRanges,
  isLineInDiff,
} from '../../../src/codeScan/util/diffLineRanges';

describe('extractValidLineRanges', () => {
  describe('Git file boundaries', () => {
    let repository: string;
    let before: string;
    let after: string;
    const filenames = [
      'plain.ts',
      'with space.ts',
      'with\ttab.ts',
      'with"quote.ts',
      'with\\backslash.ts',
      'café.ts',
      '😀.ts',
      'unicode\u2028separator.ts',
      'unicode\u2029paragraph.ts',
      'with\nnewline.ts',
      'with\rcarriage.ts',
      'with\x07bell.ts',
      'with\bbackspace.ts',
      'with\vvertical.ts',
      'with\fformfeed.ts',
    ];
    const git = (args: string[], input?: string) =>
      execFileSync('git', args, { cwd: repository, encoding: 'utf8', input }).trim();

    beforeAll(() => {
      repository = mkdtempSync(path.join(tmpdir(), 'promptfoo-diff-ranges-'));
      git(['init', '--bare', '--quiet']);
      const tree = (content: string) => {
        const blob = git(['hash-object', '-w', '--stdin'], content);
        return git(
          ['mktree', '-z'],
          filenames.map((filename) => `100644 blob ${blob}\t${filename}\0`).join(''),
        );
      };
      before = tree('old\n');
      after = tree('++ b/not-a-file.ts\nnew\n');
    });

    afterAll(() => {
      rmSync(repository, { recursive: true, force: true });
    });

    it.each(['true', 'false'])('maps actual Git paths with core.quotePath=%s', (quotePath) => {
      const diff = git(['-c', `core.quotePath=${quotePath}`, 'diff', before, after, '--']);

      expect(extractValidLineRanges(diff)).toEqual(
        new Map(filenames.map((filename) => [filename, [{ start: 1, end: 2 }]])),
      );
    });
  });

  it('does not count headers of deleted or binary files in the preceding hunk', () => {
    const diff = `diff --git a/changed.ts b/changed.ts
--- a/changed.ts
+++ b/changed.ts
@@ -1 +1 @@
-old
+new
diff --git a/deleted.ts b/deleted.ts
--- a/deleted.ts
+++ /dev/null
@@ -1 +0,0 @@
-deleted
diff --git a/image.png b/image.png
Binary files a/image.png and b/image.png differ
diff --git a/renamed.ts b/new-name.ts
similarity index 100%
rename from renamed.ts
rename to new-name.ts
`;

    expect(extractValidLineRanges(diff)).toEqual(new Map([['changed.ts', [{ start: 1, end: 1 }]]]));
  });

  it.each([
    '"b/missing-quote.ts',
    String.raw`"b/unknown\q.ts"`,
    String.raw`"b/invalid\777.ts"`,
    '"b/unescaped"quote.ts"',
    '"b/trailing\\"',
  ])('does not map malformed quoted header %s', (header) => {
    const diff = `diff --git a/example b/example\n--- a/example\n+++ ${header}\n@@ -1 +1 @@\n-old\n+new\n`;

    expect(extractValidLineRanges(diff)).toEqual(new Map());
  });

  it('does not split a file at a carriage return inside added source content', () => {
    const diff =
      'diff --git a/real.ts b/real.ts\n--- a/real.ts\n+++ b/real.ts\n@@ -1 +1 @@\n-old\n+prefix\rdiff --git a/fake.ts b/fake.ts\n';

    expect(extractValidLineRanges(diff)).toEqual(new Map([['real.ts', [{ start: 1, end: 1 }]]]));
  });

  it('preserves multiple unified patches without Git section markers', () => {
    const diff = `--- a/one.ts
+++ b/one.ts
@@ -1 +1 @@
-old
+new
@@ -5 +5 @@
-old
+new
--- a/two.ts
+++ b/two.ts
@@ -1 +1 @@
-old
+new
`;

    expect(extractValidLineRanges(diff)).toEqual(
      new Map([
        [
          'one.ts',
          [
            { start: 1, end: 1 },
            { start: 5, end: 5 },
          ],
        ],
        ['two.ts', [{ start: 1, end: 1 }]],
      ]),
    );
  });

  it('preserves a bare empty context line immediately before the next file', () => {
    const diff = [
      'diff --git a/one.ts b/one.ts',
      '--- a/one.ts',
      '+++ b/one.ts',
      '@@ -1,2 +1,2 @@',
      ' context',
      '',
      'diff --git a/two.ts b/two.ts',
      '--- a/two.ts',
      '+++ b/two.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      '',
    ].join('\n');

    expect(extractValidLineRanges(diff)).toEqual(
      new Map([
        ['one.ts', [{ start: 1, end: 2 }]],
        ['two.ts', [{ start: 1, end: 1 }]],
      ]),
    );
  });

  it('should handle empty diff', () => {
    expect(extractValidLineRanges('')).toEqual(new Map());
  });

  it('should extract ranges from single file with single hunk', () => {
    const diff = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -10,7 +10,8 @@
   context line 1
   context line 2
-  removed line
+  added line 1
+  added line 2
   context line 3
   context line 4`;

    const ranges = extractValidLineRanges(diff);
    expect(ranges.get('src/foo.ts')).toEqual([{ start: 10, end: 15 }]);
  });

  it('should extract ranges from single file with multiple hunks (gap between)', () => {
    const diff = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -10,5 +10,5 @@
   context
-  old
+  new
   context
   context
@@ -50,4 +50,5 @@
   more context
+  added
   even more
   end`;

    const ranges = extractValidLineRanges(diff);
    const fileRanges = ranges.get('src/foo.ts');

    expect(fileRanges).toHaveLength(2);
    expect(fileRanges![0]).toEqual({ start: 10, end: 13 });
    expect(fileRanges![1]).toEqual({ start: 50, end: 53 });
  });

  it('should extract ranges from multiple files', () => {
    const diff = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 line 1
+added
 line 2
 line 3
diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
@@ -5,2 +5,3 @@
 line 5
+added
 line 6`;

    const ranges = extractValidLineRanges(diff);

    expect(ranges.get('src/a.ts')).toEqual([{ start: 1, end: 4 }]);
    expect(ranges.get('src/b.ts')).toEqual([{ start: 5, end: 7 }]);
  });

  it('should handle new file (all additions)', () => {
    const diff = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,5 @@
+line 1
+line 2
+line 3
+line 4
+line 5`;

    const ranges = extractValidLineRanges(diff);
    expect(ranges.get('src/new.ts')).toEqual([{ start: 1, end: 5 }]);
  });

  it('should handle deleted file (no valid ranges)', () => {
    const diff = `diff --git a/src/deleted.ts b/src/deleted.ts
deleted file mode 100644
--- a/src/deleted.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-line 1
-line 2
-line 3`;

    const ranges = extractValidLineRanges(diff);
    expect(ranges.has('src/deleted.ts')).toBe(false);
  });

  it('should not count a trailing newline as an extra context line', () => {
    // GitHub's octokit diff media type is trailing-newline-terminated, which makes
    // `unifiedDiff.split('\n')` produce a final empty-string element. That element
    // must not be treated as a real content line.
    const diffWithoutTrailingNewline = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -10,3 +10,3 @@
 context line 1
-removed line
+added line
 context line 3`;

    const diffWithTrailingNewline = `${diffWithoutTrailingNewline}\n`;

    expect(extractValidLineRanges(diffWithTrailingNewline).get('src/foo.ts')).toEqual(
      extractValidLineRanges(diffWithoutTrailingNewline).get('src/foo.ts'),
    );
    expect(extractValidLineRanges(diffWithTrailingNewline).get('src/foo.ts')).toEqual([
      { start: 10, end: 12 },
    ]);
  });

  it('should still count a bare empty line inside a hunk as a context line', () => {
    // Some diff producers emit '' instead of the strict single-space ' ' for empty
    // context lines. Only the final split artifact from a trailing newline is
    // skipped; a bare empty line mid-hunk must still advance the line counter.
    const diff = [
      'diff --git a/src/foo.ts b/src/foo.ts',
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      '@@ -1,3 +1,3 @@',
      ' line 1',
      '', // bare empty context line mid-hunk: must be counted
      '+line 3',
      '', // trailing artifact from the terminating newline: must not be counted
    ].join('\n');

    expect(extractValidLineRanges(diff).get('src/foo.ts')).toEqual([{ start: 1, end: 3 }]);
  });
});

describe('clampCommentLines', () => {
  const ranges = new Map([
    [
      'src/foo.ts',
      [
        { start: 10, end: 20 },
        { start: 50, end: 60 },
      ],
    ],
  ]);

  it('should return line unchanged if valid (single-line)', () => {
    expect(clampCommentLines('src/foo.ts', null, 15, ranges)).toEqual({
      startLine: null,
      line: 15,
    });
  });

  it('should clamp single-line comment in gap to end of previous hunk', () => {
    expect(clampCommentLines('src/foo.ts', null, 30, ranges)).toEqual({
      startLine: null,
      line: 20,
    });
  });

  it('should return both lines unchanged if valid (multi-line)', () => {
    expect(clampCommentLines('src/foo.ts', 12, 18, ranges)).toEqual({
      startLine: 12,
      line: 18,
    });
  });

  it('should clamp end line if it extends into gap', () => {
    // Start at 15 (valid), end at 25 (in gap) -> clamp end to 20
    expect(clampCommentLines('src/foo.ts', 15, 25, ranges)).toEqual({
      startLine: 15,
      line: 20,
    });
  });

  it('should return null for unknown file', () => {
    expect(clampCommentLines('src/unknown.ts', 10, 20, ranges)).toBeNull();
  });

  it('should return null for null endLine', () => {
    expect(clampCommentLines('src/foo.ts', 10, null, ranges)).toBeNull();
  });
});

describe('integration: ENG-1309 scenario', () => {
  it('should clamp comment that extends into gap between hunks', () => {
    // Based on the actual PR that triggered ENG-1309
    const diff = `diff --git a/example-app/src/tools/index.ts b/example-app/src/tools/index.ts
--- a/example-app/src/tools/index.ts
+++ b/example-app/src/tools/index.ts
@@ -53,7 +53,7 @@ export function executeTool(toolCall: ToolCall, userContext: UserContext): ToolR
         // Secure level: always use authenticated user's role as user_id
         userId = userContext.role;
       } else {
-        // Insecure level: allow any user_id (no access control)
+        // Insecure/Medium level: allow any user_id (no access control)
         const providedUserId = args.user_id as string | undefined;
         userId = providedUserId === 'current' || providedUserId === 'me' || !providedUserId
           ? userContext.role
@@ -68,7 +68,7 @@ export function executeTool(toolCall: ToolCall, userContext: UserContext): ToolR
         // Secure level: always use authenticated user's role as user_id
         userId = userContext.role;
       } else {
-        // Insecure level: allow any user_id (no access control)
+        // Insecure/Medium level: allow any user_id (no access control)
         const providedUserId = args.user_id as string | undefined;`;

    const ranges = extractValidLineRanges(diff);

    // Agent tried to comment on lines 56-62, but line 62 is in the gap (59-68)
    const result = clampCommentLines('example-app/src/tools/index.ts', 56, 62, ranges);

    expect(result).toEqual({
      startLine: 56,
      line: 59, // clamped from 62 to end of first hunk
    });

    // Verify the gap detection
    expect(isLineInDiff('example-app/src/tools/index.ts', 59, ranges)).toBe(true);
    expect(isLineInDiff('example-app/src/tools/index.ts', 62, ranges)).toBe(false);
  });
});
