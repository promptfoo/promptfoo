import React, { useCallback, useMemo, useState } from 'react';

import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Card, CardContent } from '@app/components/ui/card';
import { HelperText } from '@app/components/ui/helper-text';
import {
  ClearIcon,
  CloudIcon,
  CloudUploadIcon,
  ComputerIcon,
  DeleteIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  GitHubIcon,
  LockIcon,
  StorageIcon,
  UploadIcon,
} from '@app/components/ui/icons';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@app/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import { callApi } from '@app/utils/api';
import { useModelAuditConfigStore } from '../stores';

import type { ScanPath } from '../ModelAudit.types';

interface PathSelectorProps {
  paths: ScanPath[];
  onAddPath: (path: ScanPath) => void;
  onRemovePath: (index: number) => void;
  currentWorkingDir?: string;
}

const SUPPORTED_FILE_TYPES = {
  PyTorch: ['.pt', '.pth', '.bin'],
  TensorFlow: ['.pb', '.h5', '.keras', '.tflite'],
  ONNX: ['.onnx'],
  Pickle: ['.pkl'],
  SafeTensors: ['.safetensors'],
  Checkpoint: ['.ckpt'],
};

const extractNameFromPath = (path: string): string => {
  const normalizedPath = path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
  const parts = normalizedPath.split('/');
  return parts[parts.length - 1] || normalizedPath;
};

function getFileTypeBadge(filename: string) {
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0] || '';

  for (const [type, extensions] of Object.entries(SUPPORTED_FILE_TYPES)) {
    if (extensions.includes(ext)) {
      return (
        <Badge variant="secondary" className="ml-2 text-xs">
          {type}
        </Badge>
      );
    }
  }
  return null;
}

function EnterpriseTabContent({
  icon: Icon,
  title,
  description,
  examples,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  examples?: { provider: string; desc: string; example: string }[];
}) {
  return (
    <div className="py-8 text-center">
      <Icon className="size-16 text-muted-foreground/50 mx-auto mb-4" />
      <h3 className="text-lg font-medium text-muted-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">{description}</p>

      {examples && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 max-w-3xl mx-auto">
          {examples.map(({ provider, desc, example }) => (
            <Card key={provider} className="bg-muted/50">
              <CardContent className="p-4 text-center">
                <CloudUploadIcon className="size-8 text-muted-foreground/50 mx-auto mb-2" />
                <h4 className="font-medium mb-1">{provider}</h4>
                <p className="text-xs text-muted-foreground mb-2">{desc}</p>
                <code className="text-xs bg-muted px-2 py-1 rounded">{example}</code>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Button variant="outline" asChild>
        <a
          href="https://promptfoo.dev/docs/guides/enterprise"
          target="_blank"
          rel="noopener noreferrer"
        >
          <LockIcon className="size-4 mr-2" />
          Available in Enterprise
        </a>
      </Button>
    </div>
  );
}

export default function PathSelector({
  paths,
  onAddPath,
  onRemovePath,
  currentWorkingDir,
}: PathSelectorProps) {
  const [pathInput, setPathInput] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { recentScans, clearRecentScans, removeRecentPath } = useModelAuditConfigStore();
  const [hoveredChipIndex, setHoveredChipIndex] = useState<number | null>(null);

  const handleAddPath = async (input: string) => {
    const trimmedPath = input.trim();
    if (!trimmedPath) {
      return;
    }

    if (paths.some((p) => p.path === trimmedPath)) {
      setError('Path already added');
      setTimeout(() => setError(null), 3000);
      return;
    }

    setIsChecking(true);
    setError(null);

    try {
      const response = await callApi('/model-audit/check-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: trimmedPath }),
      });

      const data = await response.json();

      if (data.exists) {
        onAddPath({
          path: trimmedPath,
          type: data.type,
          name: data.name || extractNameFromPath(trimmedPath),
        });
        setPathInput('');
      } else {
        setError('Path does not exist or is not accessible');
        const isDirectory = trimmedPath.endsWith('/');
        onAddPath({
          path: trimmedPath,
          type: isDirectory ? 'directory' : 'file',
          name: extractNameFromPath(trimmedPath),
        });
        setPathInput('');
        setTimeout(() => setError(null), 5000);
      }
    } catch (_error) {
      setError('Failed to check path. The path will be added anyway.');
      const isDirectory = trimmedPath.endsWith('/');
      onAddPath({
        path: trimmedPath,
        type: isDirectory ? 'directory' : 'file',
        name: extractNameFromPath(trimmedPath),
      });
      setPathInput('');
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsChecking(false);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const items = Array.from(e.dataTransfer.items);
      items.forEach((item) => {
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            if (entry.isDirectory) {
              handleAddPath(entry.fullPath + '/');
            } else {
              handleAddPath(entry.fullPath);
            }
          }
        }
      });
    },
    [paths],
  );

  const recentPaths = useMemo(() => {
    return recentScans
      .flatMap((scan) => scan.paths.map((path) => ({ ...path, scanId: scan.id })))
      .filter((path, index, self) => index === self.findIndex((p) => p.path === path.path))
      .slice(0, 8);
  }, [recentScans]);

  return (
    <div className="space-y-6">
      <Tabs defaultValue="local" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="local" className="flex items-center gap-2">
            <ComputerIcon className="size-4" />
            <span className="hidden sm:inline">Local Files</span>
          </TabsTrigger>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger value="cloud" disabled className="flex items-center gap-2 opacity-60">
                <div className="relative">
                  <CloudIcon className="size-4" />
                  <LockIcon className="size-2.5 absolute -top-1 -right-1 text-muted-foreground" />
                </div>
                <span className="hidden sm:inline">Cloud</span>
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent>Cloud storage is available in Enterprise</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger value="github" disabled className="flex items-center gap-2 opacity-60">
                <div className="relative">
                  <GitHubIcon className="size-4" />
                  <LockIcon className="size-2.5 absolute -top-1 -right-1 text-muted-foreground" />
                </div>
                <span className="hidden sm:inline">GitHub</span>
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent>GitHub integration is available in Enterprise</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger value="registry" disabled className="flex items-center gap-2 opacity-60">
                <div className="relative">
                  <StorageIcon className="size-4" />
                  <LockIcon className="size-2.5 absolute -top-1 -right-1 text-muted-foreground" />
                </div>
                <span className="hidden sm:inline">Registry</span>
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent>Model registries are available in Enterprise</TooltipContent>
          </Tooltip>
        </TabsList>

        <TabsContent value="local" className="mt-6 space-y-6">
          {/* Current Working Directory Info */}
          {currentWorkingDir && (
            <Alert variant="info">
              <AlertContent>
                <AlertDescription>
                  <strong>Current directory:</strong> {currentWorkingDir}
                  <span className="block text-xs text-muted-foreground mt-1">
                    Relative paths will be resolved from this directory
                  </span>
                </AlertDescription>
              </AlertContent>
            </Alert>
          )}

          {/* Drag and Drop Zone */}
          <div>
            <Label htmlFor="model-path-input" className="text-muted-foreground block">
              Add model path
            </Label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                'border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer',
                isDragging
                  ? 'border-primary bg-primary/5 scale-[1.02]'
                  : 'border-border hover:border-primary hover:bg-muted/50',
              )}
            >
              <UploadIcon
                className={cn(
                  'size-10 mx-auto mb-3',
                  isDragging ? 'text-primary' : 'text-muted-foreground',
                )}
              />
              <p className="font-medium mb-1">Drop files or folders here to add their paths</p>
              <p className="text-sm text-muted-foreground mb-4">or type the path manually below</p>

              {/* Supported file types */}
              <div className="flex flex-wrap gap-2 justify-center">
                {Object.entries(SUPPORTED_FILE_TYPES).map(([type, exts]) => (
                  <Badge key={type} variant="outline" className="text-xs">
                    {type} ({exts.join(', ')})
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Manual Input */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <FolderOpenIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                id="model-path-input"
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddPath(pathInput);
                  }
                }}
                placeholder="Type a path or drag & drop above"
                disabled={isChecking}
                className={cn('pl-10', error && 'border-destructive')}
              />
            </div>
            <Button
              onClick={() => handleAddPath(pathInput)}
              disabled={!pathInput.trim() || isChecking}
            >
              {isChecking ? 'Checking...' : 'Add'}
            </Button>
          </div>
          {error && (
            <HelperText error className="-mt-4">
              {error}
            </HelperText>
          )}

          {/* Recent Paths */}
          {recentPaths.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-muted-foreground">Recent Paths</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearRecentScans}
                  className="text-muted-foreground"
                >
                  <ClearIcon className="size-4 mr-1" />
                  Clear All
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-border/50 bg-muted/30">
                {recentPaths.map((path, index) => (
                  <button
                    key={`${path.path}-${index}`}
                    type="button"
                    onClick={() => {
                      if (!paths.some((p) => p.path === path.path)) {
                        handleAddPath(path.path);
                      }
                    }}
                    onMouseEnter={() => setHoveredChipIndex(index)}
                    onMouseLeave={() => setHoveredChipIndex(null)}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/50 text-sm',
                      'transition-all hover:bg-accent hover:-translate-y-0.5',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    )}
                  >
                    {path.type === 'directory' ? (
                      <FolderIcon className="size-4 text-primary" />
                    ) : (
                      <FileIcon className="size-4 text-muted-foreground" />
                    )}
                    <span>{path.name || path.path}</span>
                    {hoveredChipIndex === index && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          removeRecentPath(path.scanId, path.path);
                        }}
                        className="ml-1 hover:text-destructive"
                      >
                        <ClearIcon className="size-3.5" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="cloud">
          <EnterpriseTabContent
            icon={CloudIcon}
            title="Cloud Storage Integration"
            description="Scan models directly from cloud storage providers with automatic authentication and secure access."
            examples={[
              {
                provider: 'AWS S3',
                desc: 'IAM roles, credentials',
                example: 's3://bucket/models/',
              },
              {
                provider: 'Azure Blob',
                desc: 'Managed identity, SAS',
                example: 'az://container/path/',
              },
              {
                provider: 'Google Cloud',
                desc: 'Service accounts',
                example: 'gs://bucket/models/',
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="github">
          <EnterpriseTabContent
            icon={GitHubIcon}
            title="Git Repository Integration"
            description="Scan models directly from GitHub, GitLab, or Bitbucket repositories with OAuth integration. Configure paths like: github:org/repo/path/to/model.pkl"
          />
        </TabsContent>

        <TabsContent value="registry">
          <EnterpriseTabContent
            icon={StorageIcon}
            title="Model Registry Integration"
            description="Connect to MLflow, Weights & Biases, Neptune, and other model registries. Scan models by registry URI: mlflow://model-name/version"
          />
        </TabsContent>
      </Tabs>

      {/* Selected Paths */}
      {paths.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-lg font-semibold">Selected Paths</h3>
            <Badge variant="default" className="text-xs">
              {paths.length}
            </Badge>
          </div>
          <div className="space-y-2 p-3 rounded-lg border border-border/50 bg-muted/30">
            {paths.map((path, index) => (
              <div
                key={index}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card',
                  'transition-all hover:border-primary/50 hover:translate-x-1',
                  'group',
                )}
              >
                {path.type === 'directory' ? (
                  <FolderIcon className="size-6 text-primary shrink-0" />
                ) : (
                  <FileIcon className="size-6 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {path.name || extractNameFromPath(path.path)}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-mono truncate">
                      {path.path}
                    </span>
                    {path.type === 'file' && getFileTypeBadge(path.path)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemovePath(index);
                  }}
                  className="opacity-70 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10"
                  aria-label={`Remove ${path.name}`}
                >
                  <DeleteIcon className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
