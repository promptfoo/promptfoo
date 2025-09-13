# TODO: Model Audit UI Improvements

This document outlines areas for improvement in the new Model Audit UI based on a review of the recent changes.

## 1. State Management

- **Centralize State:** In `ModelAuditHistory.tsx`, the `scans`, `isLoading`, and `error` state are managed with `useState`. This state should be moved to the `useModelAuditHistoryStore` to centralize state management and make the component more predictable.

- **Store Usage:** Ensure that all relevant state is being managed by the appropriate Zustand store. Review the new stores (`useModelAuditConfigStore` and `useModelAuditHistoryStore`) to ensure they are being used effectively and that there is no unnecessary local state in the components.

## 2. Type Safety

- **Improve `ScanResult` Type:** In `ModelAuditResult.tsx`, the `results` property of the `ScanResult` interface is typed as `any`. This should be replaced with a more specific type that matches the actual shape of the scan results. This will improve type safety and reduce the risk of runtime errors.

## 3. Error Handling

- **Specific Error Messages:** The error handling in some components could be more robust. When an API call fails, the components often display a generic error message. It would be better to display a more specific error message based on the API response to help with debugging.

## 4. Code Duplication

- **Create Reusable Fetch Logic:** There is some code duplication in the data fetching logic. For example, the `fetchScans` logic in `ModelAuditHistory.tsx` and the fetch logic in `ModelAuditResultLatestPage.tsx` are similar. This could be extracted into a reusable hook or utility function to reduce duplication and improve maintainability.

## 5. Component Decomposition

- **Extract Large Components:** Some components are quite large and could be broken down into smaller, more manageable components. For example, the `DataGrid` and its configuration in `ModelAuditHistory.tsx` could be extracted into its own component to improve readability and reusability.
