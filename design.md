
# Model Audit UI Redesign

This document outlines a proposal for redesigning the Model Audit UI in promptfoo. The goal is to improve the user experience by separating the scan history from the main scan configuration page and using a more powerful data grid for displaying historical scans.

## 1. Current Implementation Analysis

The current Model Audit UI is a single-page application built with React and Material-UI. It uses a tabbed interface to switch between three main sections:

*   **Configuration:** Where users can select files/directories to scan and configure scan options.
*   **Results:** Displays the results of the most recent scan.
*   **History:** Shows a list of past scans in a simple table.

The frontend is located in `src/app/src/pages/model-audit` and the backend routes are in `src/server/routes/modelAudit.ts`.

**Frontend:**

*   `ModelAudit.tsx`: The main component that manages the tabbed interface and state.
*   `HistoryTab.tsx`: Displays the scan history in a basic Material-UI `Table`.
*   `store.ts`: A `zustand` store that manages all the state for the Model Audit feature.

**Backend:**

*   `POST /api/model-audit/scan`: Runs a new scan.
*   `GET /api/model-audit/scans`: Retrieves all historical scans.
*   `GET /api/model-audit/scans/:id`: Retrieves a single scan by ID.
*   `DELETE /api/model-audit/scans/:id`: Deletes a scan.

**Pain Points:**

*   **Single-Page Overload:** The single-page design is becoming cluttered. As more features are added, it will become even harder to manage.
*   **Basic History View:** The current history table is very basic. It lacks features like sorting, filtering, and pagination, which are essential for managing a large number of scans.
*   **Lack of Detail in History:** The history view doesn't provide a way to view the detailed results of a past scan without re-running it.

## 2. Proposed Redesign

I propose to refactor the Model Audit UI into a multi-page application. This will involve creating two new pages:

1.  **Scan History Page:** A dedicated page to display the list of historical scans.
2.  **Scan Result Page:** A dedicated page to display the detailed results of a specific scan.

### 2.1. Design Options

#### Option 1: Minimalistic Approach (MVP)

This option focuses on delivering the core functionality with minimal changes to the existing codebase.

*   **Scan History Page:**
    *   Create a new page at `/model-audit/history`.
    *   Use the Material-UI Data Grid (`DataGrid`) to display the scan history.
    *   The data grid will have columns for `ID`, `Name`, `Model Path`, `Created At`, `Status`, and `Issues Found`.
    *   Enable sorting and filtering on all columns.
    *   Add a "View" button to each row that navigates to the Scan Result Page.
*   **Scan Result Page:**
    *   Create a new page at `/model-audit/history/:id`.
    *   This page will fetch the scan data from the `/api/model-audit/scans/:id` endpoint.
    *   It will display the detailed scan results, similar to the current "Results" tab.
*   **Model Audit Page:**
    *   Remove the "History" tab.
    *   Add a button or link that navigates to the new Scan History Page.

**Pros:**

*   Faster to implement.
*   Less risk of introducing bugs.
*   Improves the user experience significantly with minimal effort.

**Cons:**

*   Doesn't address all the potential UI improvements.
*   The Scan Result Page will be a simple display of the data, without much interactivity.

#### Option 2: Enhanced User Experience

This option builds on top of Option 1 and adds more features to improve the user experience.

*   **Scan History Page:**
    *   All features from Option 1.
    *   Add pagination to the data grid.
    *   Add a search bar to filter scans by name or model path.
    *   Add a "Delete" button to each row to delete a scan.
*   **Scan Result Page:**
    *   All features from Option 1.
    *   Display the scan results in a more interactive way. For example, use collapsible sections for each issue and display the code snippets with syntax highlighting.
    *   Add a button to download the scan results as a JSON or CSV file.
*   **Model Audit Page:**
    *   Same as Option 1.

**Pros:**

*   Provides a much better user experience.
*   More feature-rich and scalable.

**Cons:**

*   Takes more time to implement.
*   More complex, which could lead to more bugs.

### 2.2. Recommended Approach

I recommend starting with **Option 1 (MVP)** to deliver the core improvements quickly. Once the MVP is shipped and we get user feedback, we can iterate on it and implement the features from **Option 2**.

## 3. Implementation Plan (for Option 1)

1.  **Create New Pages:**
    *   Create a new directory `src/app/src/pages/model-audit-history`.
    *   Inside this directory, create `page.tsx` and `ModelAuditHistory.tsx`.
    *   Create a new directory `src/app/src/pages/model-audit-result`.
    *   Inside this directory, create `page.tsx` and `ModelAuditResult.tsx`.

2.  **Implement Scan History Page:**
    *   In `ModelAuditHistory.tsx`, use the `useEffect` hook to fetch the scan history from the `/api/model-audit/scans` endpoint.
    *   Use the Material-UI `DataGrid` component to display the data.
    *   Add a "View" button to each row that navigates to `/model-audit/history/:id`.

3.  **Implement Scan Result Page:**
    *   In `ModelAuditResult.tsx`, use the `useParams` hook from `react-router-dom` to get the scan ID from the URL.
    *   Use the `useEffect` hook to fetch the scan data from the `/api/model-audit/scans/:id` endpoint.
    *   Display the scan results.

4.  **Update Model Audit Page:**
    *   In `ModelAudit.tsx`, remove the "History" tab.
    *   Add a `Button` or `Link` component that navigates to `/model-audit/history`.

5.  **Update Routing:**
    *   In `src/app/src/App.tsx`, add the new routes for the Scan History and Scan Result pages.

## 4. Testing and QA

*   **Unit Tests:**
    *   Write unit tests for the new components (`ModelAuditHistory.tsx`, `ModelAuditResult.tsx`).
    *   Mock the API calls to test the components in isolation.
*   **Integration Tests:**
    *   Write integration tests to verify the end-to-end flow:
        1.  Run a scan.
        2.  Navigate to the Scan History page and see the new scan.
        3.  Click on the "View" button and see the detailed results.
*   **Manual QA:**
    *   Manually test the new features in a staging environment.
    *   Test with different types of scans (e.g., scans with and without issues).
    *   Test the sorting, filtering, and pagination features of the data grid.
    *   Test the error handling when API calls fail.

## 5. Conclusion

By refactoring the Model Audit UI into a multi-page application, we can significantly improve the user experience and create a more scalable and maintainable codebase. Starting with an MVP approach will allow us to deliver value quickly and gather feedback for future iterations.
