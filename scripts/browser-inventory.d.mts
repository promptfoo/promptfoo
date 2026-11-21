export interface BrowserInventoryReport {
  schemaVersion: 1;
  surface: 'app' | 'site';
  buildConfiguration?: { posthogKeyPresent: boolean };
  components: { name: string; version: string }[];
  assets: { path: string; sha256: string; size: number }[];
  externalResources: { url: string; source: string }[];
  limitations: string[];
}

export function listAssetPaths(directory: string, prefix?: string): Promise<string[]>;

export class BrowserInventory {
  constructor(surface: 'app' | 'site');
  addModule(resource: string | null | undefined): void;
  addExternalResource(url: string, source: string): void;
  write(
    outDir: string,
    options?: {
      assetPaths?: Iterable<string>;
      buildConfiguration?: { posthogKeyPresent: boolean };
      limitations?: string[];
    },
  ): Promise<BrowserInventoryReport>;
}
