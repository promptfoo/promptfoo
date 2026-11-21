import type { GeneratedTestCase } from './testCaseGenerationTypes';

function PreviewInput({ label, text }: { label: string; text: string }) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{label}</p>
      <p className="whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-sm">{text}</p>
    </div>
  );
}

export function AgentOutcomePreview({ prompt, artifact }: GeneratedTestCase) {
  return (
    <div className="space-y-4">
      <PreviewInput label="User request" text={prompt} />
      {artifact !== undefined && (
        <PreviewInput label="Third-party content for the tool" text={artifact} />
      )}
      <p className="text-sm text-muted-foreground">
        Run the red team to send this case to your target and grade its recorded effects.
      </p>
    </div>
  );
}
