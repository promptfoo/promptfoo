import { describe, expect, it } from 'vitest';
import { annotateSingleFileDiffWithLineNumbers } from '../../../src/codeScan/git/diffAnnotator';

describe('annotateDiffWithLineNumbers', () => {
  describe('basic functionality', () => {
    it('should handle empty patch', () => {
      expect(annotateSingleFileDiffWithLineNumbers('')).toBe('');
      expect(annotateSingleFileDiffWithLineNumbers('   ')).toBe('   ');
    });

    it('should preserve file headers without annotation', () => {
      const patch = `diff --git a/test.ts b/test.ts
index abc123..def456 100644
--- a/test.ts
+++ b/test.ts`;

      const result = annotateSingleFileDiffWithLineNumbers(patch);
      expect(result).toBe(patch);
    });

    it('should annotate simple hunk with additions', () => {
      const patch = `@@ -1,3 +1,4 @@
 line 1
 line 2
+new line 3
 line 4`;

      const result = annotateSingleFileDiffWithLineNumbers(patch);
      expect(result).toBe(`@@ -1,3 +1,4 @@
L1:  line 1
L2:  line 2
L3: +new line 3
L4:  line 4`);
    });

    it('should annotate simple hunk with deletions', () => {
      const patch = `@@ -1,4 +1,3 @@
 line 1
-deleted line
 line 2
 line 3`;

      const result = annotateSingleFileDiffWithLineNumbers(patch);
      expect(result).toBe(`@@ -1,4 +1,3 @@
L1:  line 1
-deleted line
L2:  line 2
L3:  line 3`);
    });

    it('should annotate hunk with mixed changes', () => {
      const patch = `@@ -5,5 +5,6 @@
 context before
-old line
+new line 1
+new line 2
 context after`;

      const result = annotateSingleFileDiffWithLineNumbers(patch);
      expect(result).toBe(`@@ -5,5 +5,6 @@
L5:  context before
-old line
L6: +new line 1
L7: +new line 2
L8:  context after`);
    });
  });

  describe('multiple hunks', () => {
    it('should handle multiple hunks with correct line numbering', () => {
      const patch = `@@ -1,3 +1,3 @@
 line 1
-old line 2
+new line 2
 line 3
@@ -10,2 +10,3 @@
 line 10
+inserted line
 line 11`;

      const result = annotateSingleFileDiffWithLineNumbers(patch);
      expect(result).toBe(`@@ -1,3 +1,3 @@
L1:  line 1
-old line 2
L2: +new line 2
L3:  line 3
@@ -10,2 +10,3 @@
L10:  line 10
L11: +inserted line
L12:  line 11`);
    });
  });

  describe('full patch with headers', () => {
    it('should annotate complete patch including file headers', () => {
      const patch = `diff --git a/src/test.ts b/src/test.ts
index abc123..def456 100644
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,3 +1,4 @@
 import { foo } from 'bar';
+import { baz } from 'qux';

 function test() {`;

      const result = annotateSingleFileDiffWithLineNumbers(patch);
      expect(result).toBe(`diff --git a/src/test.ts b/src/test.ts
index abc123..def456 100644
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,3 +1,4 @@
L1:  import { foo } from 'bar';
L2: +import { baz } from 'qux';
L3: 
L4:  function test() {`);
    });
  });

  describe('real-world example from PR #5', () => {
    it('should correctly annotate the mcp tool definition hunk', () => {
      // This is a simplified excerpt from the actual PR #5
      const patch = `@@ -18,20 +20,64 @@ const getRetentionOffers = tool({
     customer_id: z.string(),
     account_type: z.string(),
     current_plan: z.string(),
-    tenure_months: z.integer(),
+    tenure_months: z.number().int(),
     recent_complaints: z.boolean(),
   }),
   execute: async (input: {
     customer_id: string;
     account_type: string;
     current_plan: string;
-    tenure_months: integer;
+    tenure_months: number;
     recent_complaints: boolean;
   }) => {
-    // TODO: Unimplemented
+    // Mock implementation - returns sample retention offers
+    return {
+      offers: [
+        {
+          type: "discount",
+          description: "20% off for 12 months",
+          monthly_savings: 15,
+        },
+        {
+          type: "upgrade",
+          description: "Free upgrade to premium plan for 3 months",
+          value: 45,
+        },
+      ],
+    };
   },
 });

+const mcp = hostedMcpTool({
+  serverLabel: "dropbox",
+  connectorId: "connector_dropbox",
+  serverDescription: "Return Policy Knowledge",
+  allowedTools: [
+    "fetch",
+    "fetch_file",
+    "get_profile",
+    "list_recent_files",
+    "search",
+    "search_files",
+  ],
+  requireApproval: "never",
+});`;

      const result = annotateSingleFileDiffWithLineNumbers(patch);

      // Verify key line numbers
      expect(result).toContain('L51: +const mcp = hostedMcpTool({');
      expect(result).toContain('L63: +  requireApproval: "never",');
      expect(result).toContain('L64: +});');

      // Verify that context lines are also numbered
      expect(result).toContain('L20:      customer_id: z.string(),');
      expect(result).toContain('L21:      account_type: z.string(),');

      // Verify that removed lines have no line numbers
      const lines = result.split('\n');
      const removedLine = lines.find((l) => l.includes('tenure_months: z.integer()'));
      expect(removedLine).toBeDefined();
      expect(removedLine).toMatch(/^-/);
    });

    it('should verify line numbering is absolute, not relative to hunk', () => {
      // This test explicitly verifies the bug we're fixing
      // The hunk starts at line 20, so lines should be numbered starting from 20
      const patch = `@@ -18,20 +20,10 @@
     customer_id: z.string(),
     account_type: z.string(),
     current_plan: z.string(),
   }),
   execute: async (input: {
     customer_id: string;
+const mcp = hostedMcpTool({
+  serverLabel: "dropbox",`;

      const result = annotateSingleFileDiffWithLineNumbers(patch);

      // Should start numbering at 20 (the hunk start), not at 1
      expect(result).toContain('L20:      customer_id: z.string(),');
      expect(result).toContain('L21:      account_type: z.string(),');

      // The mcp tool should be at L26 (20 + 6 lines)
      expect(result).toContain('L26: +const mcp = hostedMcpTool({');
    });
  });

  describe('edge cases', () => {
    it('should handle hunk at start of file (line 1)', () => {
      const patch = `@@ -0,0 +1,3 @@
+new file line 1
+new file line 2
+new file line 3`;

      const result = annotateSingleFileDiffWithLineNumbers(patch);
      expect(result).toBe(`@@ -0,0 +1,3 @@
L1: +new file line 1
L2: +new file line 2
L3: +new file line 3`);
    });

    it('should handle "No newline at end of file" marker', () => {
      const patch = `@@ -1,2 +1,2 @@
 line 1
-line 2
\\ No newline at end of file
+line 2 with newline`;

      const result = annotateSingleFileDiffWithLineNumbers(patch);

      // The marker line should be preserved
      expect(result).toContain('\\ No newline at end of file');

      // Verify the marker line itself doesn't have a line number
      const lines = result.split('\n');
      const markerLine = lines.find((l) => l.includes('No newline at end of file'));
      expect(markerLine).toBe('\\ No newline at end of file');
    });

    it('should handle empty lines (context)', () => {
      const patch = `@@ -1,4 +1,4 @@
 line 1

 line 3
+line 4`;

      const result = annotateSingleFileDiffWithLineNumbers(patch);
      expect(result).toBe(`@@ -1,4 +1,4 @@
L1:  line 1
L2: 
L3:  line 3
L4: +line 4`);
    });

    it('should handle consecutive additions', () => {
      const patch = `@@ -1,1 +1,5 @@
 existing line
+added line 1
+added line 2
+added line 3
+added line 4`;

      const result = annotateSingleFileDiffWithLineNumbers(patch);
      expect(result).toBe(`@@ -1,1 +1,5 @@
L1:  existing line
L2: +added line 1
L3: +added line 2
L4: +added line 3
L5: +added line 4`);
    });

    it('should handle consecutive deletions', () => {
      const patch = `@@ -1,5 +1,1 @@
 kept line
-deleted 1
-deleted 2
-deleted 3
-deleted 4`;

      const result = annotateSingleFileDiffWithLineNumbers(patch);
      expect(result).toBe(`@@ -1,5 +1,1 @@
L1:  kept line
-deleted 1
-deleted 2
-deleted 3
-deleted 4`);
    });
  });

  describe('hunk header variations', () => {
    it('should handle hunk header without line count', () => {
      const patch = `@@ -1 +1,2 @@
 line 1
+line 2`;

      const result = annotateSingleFileDiffWithLineNumbers(patch);
      expect(result).toBe(`@@ -1 +1,2 @@
L1:  line 1
L2: +line 2`);
    });

    it('should handle hunk header with function context', () => {
      const patch = `@@ -10,3 +10,4 @@ function myFunction() {
   const x = 1;
   const y = 2;
+  const z = 3;
   return x + y;`;

      const result = annotateSingleFileDiffWithLineNumbers(patch);
      expect(result).toContain('L10:    const x = 1;');
      expect(result).toContain('L11:    const y = 2;');
      expect(result).toContain('L12: +  const z = 3;');
      expect(result).toContain('L13:    return x + y;');
    });
  });

  describe('trailing content', () => {
    it('should handle trailing blank line without annotation', () => {
      // Git diffs often have trailing blank lines
      const patch = `@@ -1,2 +1,2 @@
 line 1
+added line
`;

      const result = annotateSingleFileDiffWithLineNumbers(patch);

      // The trailing blank should not be annotated
      expect(result).toBe(`@@ -1,2 +1,2 @@
L1:  line 1
L2: +added line
`);
    });
  });
});
