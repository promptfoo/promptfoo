applypatch <<'PATCH'
*** Begin Patch
*** Update File: src/providers/openai.ts
@@
+import { withRetries, GuardrailConfig } from '../lib/guardrails';
@@
-export async function callOpenAI(args: OpenAIArgs): Promise<OpenAIResponse> {
-  const res = await fetch('https://api.openai.com/v1/...', {
-    method: 'POST',
-    headers: { /* auth */ },
-    body: JSON.stringify(args),
-  });
-  if (!res.ok) {
-    const e: any = new Error(\`HTTP \${res.status}\`);
-    e.status = res.status;
-    e.retryAfterSeconds = Number(res.headers.get('retry-after')) || undefined;
-    throw e;
-  }
-  return await res.json();
-}
+export async function callOpenAI(
+  args: OpenAIArgs,
+  guardrails: GuardrailConfig = {},
+): Promise<OpenAIResponse> {
+  return withRetries<OpenAIArgs, OpenAIResponse>(
+    async (a, signal) => {
+      const res = await fetch('https://api.openai.com/v1/...', {
+        method: 'POST',
+        signal,
+        headers: { /* auth */ },
+        body: JSON.stringify(a),
+      });
+      if (!res.ok) {
+        const e: any = new Error(\`HTTP \${res.status}\`);
+        e.status = res.status;
+        e.retryAfterSeconds = Number(res.headers.get('retry-after')) || undefined;
+        throw e;
+      }
+      return await res.json();
+    },
+    args,
+    'openai',
+    guardrails,
+  );
+}
*** End Patch
PATCH
