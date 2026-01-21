import { useState } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { cn } from '@app/lib/utils';
import { Plus, Settings, Trash2 } from 'lucide-react';
import AddProviderDialog from './AddProviderDialog';
import type { ProviderOptions } from '@promptfoo/types';

interface ProvidersListSectionProps {
  providers: ProviderOptions[];
  onChange: (providers: ProviderOptions[]) => void;
}

function getProviderLabel(provider: ProviderOptions): string {
  if (provider.label) {
    return provider.label;
  }
  if (typeof provider.id === 'string') {
    return provider.id;
  }
  return 'Unknown Provider';
}

function getProviderType(provider: ProviderOptions): string {
  const id = typeof provider.id === 'string' ? provider.id : '';

  if (id.startsWith('openai:')) {
    return 'OpenAI';
  }
  if (id.startsWith('anthropic:')) {
    return 'Anthropic';
  }
  if (id.startsWith('bedrock:')) {
    return 'AWS Bedrock';
  }
  if (id.startsWith('azure:')) {
    return 'Azure';
  }
  if (id.startsWith('vertex:')) {
    return 'Google Vertex';
  }
  if (id.startsWith('openrouter:')) {
    return 'OpenRouter';
  }
  if (id === 'http') {
    return 'HTTP Endpoint';
  }
  if (id === 'websocket') {
    return 'WebSocket';
  }
  if (id.startsWith('file://') && id.includes('.py')) {
    return 'Python';
  }
  if (id.startsWith('file://') && id.includes('.js')) {
    return 'JavaScript';
  }
  if (id === 'browser') {
    return 'Browser Automation';
  }

  return 'Custom';
}

export function ProvidersListSection({ providers, onChange }: ProvidersListSectionProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const handleAddProvider = (provider: ProviderOptions) => {
    onChange([...providers, provider]);
    setIsAddDialogOpen(false);
  };

  const handleEditProvider = (index: number, provider: ProviderOptions) => {
    const newProviders = [...providers];
    newProviders[index] = provider;
    onChange(newProviders);
    setEditingIndex(null);
  };

  const handleRemoveProvider = (index: number) => {
    onChange(providers.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      {/* List of providers */}
      {providers.length > 0 ? (
        <div className="space-y-2">
          {providers.map((provider, index) => {
            const label = getProviderLabel(provider);
            const type = getProviderType(provider);

            return (
              <Card
                key={`${provider.id}-${index}`}
                className={cn(
                  'p-4 flex items-center justify-between hover:bg-muted/30 transition-colors',
                  'bg-white dark:bg-zinc-900',
                )}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium truncate">{label}</p>
                      <Badge variant="secondary" className="text-xs">
                        {type}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground font-mono truncate">
                      {typeof provider.id === 'string' ? provider.id : 'custom provider'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingIndex(index)}
                    className="size-8 p-0"
                  >
                    <Settings className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveProvider(index)}
                    className="size-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="p-8 text-center bg-muted/30 border-dashed">
          <p className="text-sm text-muted-foreground mb-4">No providers configured yet</p>
          <p className="text-xs text-muted-foreground">
            Add AI models, HTTP endpoints, Python scripts, or other providers to evaluate
          </p>
        </Card>
      )}

      {/* Add provider button */}
      <Button onClick={() => setIsAddDialogOpen(true)} className="w-full" variant="outline">
        <Plus className="size-4 mr-2" />
        Add Provider
      </Button>

      {/* Add provider dialog */}
      <AddProviderDialog
        open={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSave={handleAddProvider}
      />

      {/* Edit provider dialog */}
      {editingIndex !== null && (
        <AddProviderDialog
          open={true}
          onClose={() => setEditingIndex(null)}
          onSave={(provider) => handleEditProvider(editingIndex, provider)}
          initialProvider={providers[editingIndex]}
        />
      )}
    </div>
  );
}
