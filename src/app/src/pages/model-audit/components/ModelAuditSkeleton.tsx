import { Card } from '@app/components/ui/card';
import { Skeleton } from '@app/components/ui/skeleton';

/**
 * Skeleton loader for the Model Audit result page.
 * Provides a visual placeholder while scan data is loading.
 */
export function ResultPageSkeleton() {
  return (
    <Card className="p-6 md:p-10 mb-4">
      {/* Breadcrumbs skeleton */}
      <div className="flex gap-2 mb-6">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-5" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-5" />
        <Skeleton className="h-4 w-24" />
      </div>

      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <Skeleton className="h-10 w-72 mb-2" />
          <div className="flex gap-4">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-18" />
        </div>
      </div>

      {/* Scan Details skeleton */}
      <Card className="p-4 mb-8 border border-border">
        <Skeleton className="h-4 w-24 mb-2" />
        <div className="flex flex-col md:flex-row gap-8">
          <div>
            <Skeleton className="h-4 w-20 mb-1" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div>
            <Skeleton className="h-4 w-16 mb-1" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div>
            <Skeleton className="h-4 w-14 mb-1" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
      </Card>

      {/* Results skeleton */}
      <div>
        <Skeleton className="h-8 w-36 mb-4" />
        {/* Summary cards skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        {/* Issues list skeleton */}
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full mb-2" />
        ))}
      </div>
    </Card>
  );
}

/**
 * Skeleton loader for the scan history DataGrid.
 */
export function HistoryTableSkeleton() {
  return (
    <div>
      {/* Toolbar skeleton */}
      <div className="flex justify-between p-2 border-b border-border">
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-16" />
        </div>
        <Skeleton className="h-8 w-48" />
      </div>

      {/* Table header skeleton */}
      <div className="flex gap-4 p-4 border-b border-border">
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-4 w-3/10" />
        <Skeleton className="h-4 w-1/6" />
        <Skeleton className="h-4 w-1/6" />
        <Skeleton className="h-4 w-1/10" />
      </div>

      {/* Table rows skeleton */}
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex gap-4 p-4 border-b border-border">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-3/10" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-4 w-1/6" />
          <Skeleton className="size-8 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton loader for the latest scan page empty state check.
 */
export function LatestScanSkeleton() {
  return (
    <Card className="p-6 md:p-10 mb-4">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <Skeleton className="h-10 w-60 mb-2" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="flex gap-4">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>

      {/* Summary cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>

      {/* Content skeleton */}
      <Skeleton className="h-48 w-full" />
    </Card>
  );
}
