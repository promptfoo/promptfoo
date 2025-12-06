import { Box, Paper, Skeleton, Stack } from '@mui/material';

/**
 * Skeleton loader for the Model Audit result page.
 * Provides a visual placeholder while scan data is loading.
 */
export function ResultPageSkeleton() {
  return (
    <Paper elevation={0} sx={{ p: { xs: 3, md: 5 }, mb: 4 }}>
      {/* Breadcrumbs skeleton */}
      <Stack direction="row" spacing={1} mb={3}>
        <Skeleton variant="text" width={80} />
        <Skeleton variant="text" width={20} />
        <Skeleton variant="text" width={60} />
        <Skeleton variant="text" width={20} />
        <Skeleton variant="text" width={100} />
      </Stack>

      {/* Header skeleton */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={2}
        mb={4}
      >
        <Box>
          <Skeleton variant="text" width={300} height={40} />
          <Stack direction="row" spacing={2}>
            <Skeleton variant="text" width={150} />
            <Skeleton variant="text" width={100} />
          </Stack>
        </Box>
        <Stack direction="row" spacing={1}>
          <Skeleton variant="rounded" width={100} height={36} />
          <Skeleton variant="rounded" width={80} height={36} />
          <Skeleton variant="rounded" width={70} height={36} />
        </Stack>
      </Stack>

      {/* Scan Details skeleton */}
      <Paper variant="outlined" sx={{ p: 2, mb: 4 }}>
        <Skeleton variant="text" width={100} sx={{ mb: 1 }} />
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={4}>
          <Box>
            <Skeleton variant="text" width={80} />
            <Skeleton variant="text" width={200} />
          </Box>
          <Box>
            <Skeleton variant="text" width={60} />
            <Skeleton variant="text" width={120} />
          </Box>
          <Box>
            <Skeleton variant="text" width={50} />
            <Skeleton variant="text" width={80} />
          </Box>
        </Stack>
      </Paper>

      {/* Results skeleton */}
      <Box>
        <Skeleton variant="text" width={150} height={32} sx={{ mb: 2 }} />
        {/* Summary cards skeleton */}
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} mb={3}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rounded" width="100%" height={80} />
          ))}
        </Stack>
        {/* Issues list skeleton */}
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rounded" width="100%" height={60} sx={{ mb: 1 }} />
        ))}
      </Box>
    </Paper>
  );
}

/**
 * Skeleton loader for the scan history DataGrid.
 */
export function HistoryTableSkeleton() {
  return (
    <Box>
      {/* Toolbar skeleton */}
      <Stack direction="row" justifyContent="space-between" p={1} borderBottom={1} borderColor="divider">
        <Stack direction="row" spacing={1}>
          <Skeleton variant="rounded" width={100} height={32} />
          <Skeleton variant="rounded" width={80} height={32} />
          <Skeleton variant="rounded" width={60} height={32} />
        </Stack>
        <Skeleton variant="rounded" width={200} height={32} />
      </Stack>

      {/* Table header skeleton */}
      <Stack direction="row" spacing={2} p={2} borderBottom={1} borderColor="divider">
        <Skeleton variant="text" width="25%" />
        <Skeleton variant="text" width="30%" />
        <Skeleton variant="text" width="15%" />
        <Skeleton variant="text" width="15%" />
        <Skeleton variant="text" width="10%" />
      </Stack>

      {/* Table rows skeleton */}
      {[1, 2, 3, 4, 5].map((i) => (
        <Stack key={i} direction="row" spacing={2} p={2} borderBottom={1} borderColor="divider">
          <Skeleton variant="text" width="25%" />
          <Skeleton variant="text" width="30%" />
          <Skeleton variant="rounded" width={60} height={24} />
          <Skeleton variant="text" width="15%" />
          <Skeleton variant="circular" width={32} height={32} />
        </Stack>
      ))}
    </Box>
  );
}

/**
 * Skeleton loader for the latest scan page empty state check.
 */
export function LatestScanSkeleton() {
  return (
    <Paper elevation={0} sx={{ p: { xs: 3, md: 5 }, mb: 4 }}>
      {/* Header skeleton */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={2}
        mb={4}
      >
        <Box>
          <Skeleton variant="text" width={250} height={40} />
          <Skeleton variant="text" width={350} />
        </Box>
        <Stack direction="row" spacing={2}>
          <Skeleton variant="rounded" width={100} height={36} />
          <Skeleton variant="rounded" width={120} height={36} />
        </Stack>
      </Stack>

      {/* Summary cards skeleton */}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} mb={3}>
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="rounded" width="100%" height={100} />
        ))}
      </Stack>

      {/* Content skeleton */}
      <Skeleton variant="rounded" width="100%" height={200} />
    </Paper>
  );
}
