import { Badge } from '@app/components/ui/badge';
import { Card, CardContent } from '@app/components/ui/card';
import { displayNameOverrides } from '@promptfoo/redteam/constants';
import type { SemanticFrontierDiagnostic } from '@promptfoo/redteam/generation/frontierDiagnostics';

interface SemanticFrontierDiagnosticsProps {
  diagnostics: readonly SemanticFrontierDiagnostic[];
}

function getStatus(diagnostic: SemanticFrontierDiagnostic): {
  label: string;
  variant: 'success' | 'warning';
} {
  if (diagnostic.structurallyDegraded) {
    return { label: 'Structurally limited', variant: 'warning' };
  }

  if (diagnostic.completeFrontierCount === diagnostic.frontierCount) {
    return { label: 'Complete', variant: 'success' };
  }

  return { label: 'Incomplete', variant: 'warning' };
}

export default function SemanticFrontierDiagnostics({
  diagnostics,
}: SemanticFrontierDiagnosticsProps) {
  if (diagnostics.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">Semantic Frontier Diagnostics</h2>
        </div>

        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {diagnostics.map((diagnostic) => {
            const status = getStatus(diagnostic);
            const pluginName =
              displayNameOverrides[diagnostic.pluginId as keyof typeof displayNameOverrides] ||
              diagnostic.pluginId;
            const frontierLabel = diagnostic.frontierCount === 1 ? 'frontier' : 'frontiers';

            return (
              <div
                key={diagnostic.pluginId}
                className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{pluginName}</p>
                  <p className="text-sm text-muted-foreground">
                    {diagnostic.completeFrontierCount}/{diagnostic.frontierCount} {frontierLabel}{' '}
                    complete
                  </p>
                </div>

                <Badge variant={status.variant} className="w-fit">
                  {status.label}
                </Badge>

                <p className="text-sm text-muted-foreground md:text-right">
                  {diagnostic.unreachableFeatureIds.length > 0
                    ? `Unreachable: ${diagnostic.unreachableFeatureIds.join(', ')}`
                    : 'No structurally unreachable features'}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
