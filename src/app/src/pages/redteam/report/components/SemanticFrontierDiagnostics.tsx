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

        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Semantic frontier diagnostics by plugin</caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Plugin and coverage</th>
                <th scope="col">Status</th>
                <th scope="col">Structural coverage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {diagnostics.map((diagnostic) => {
                const status = getStatus(diagnostic);
                const pluginName =
                  displayNameOverrides[diagnostic.pluginId as keyof typeof displayNameOverrides] ||
                  diagnostic.pluginId;
                const frontierLabel = diagnostic.frontierCount === 1 ? 'frontier' : 'frontiers';

                return (
                  <tr key={diagnostic.pluginId}>
                    <th scope="row" className="min-w-0 px-4 py-3 text-left font-normal">
                      <p className="truncate font-medium">{pluginName}</p>
                      <p className="text-sm text-muted-foreground">
                        {diagnostic.completeFrontierCount}/{diagnostic.frontierCount}{' '}
                        {frontierLabel} complete
                      </p>
                    </th>

                    <td className="px-4 py-3">
                      <Badge variant={status.variant} className="w-fit">
                        {status.label}
                      </Badge>
                    </td>

                    <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                      {diagnostic.unreachableFeatureIds.length > 0
                        ? `Unreachable: ${diagnostic.unreachableFeatureIds.join(', ')}`
                        : 'No structurally unreachable features'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
