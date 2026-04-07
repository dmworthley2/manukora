# Design Spec: Data Sources Landing Page

**Date:** April 7, 2026  
**Feature:** Data Sources as public home page with CSV upload, mock connectors, and dataset history  
**Status:** Design Approved

---

## 1. Overview

The Data Sources page serves as both:
- **Public entry point** for new users (replaces current home redirect)
- **Data management hub** accessible from authenticated dashboard users

Users can upload CSV files, view integrations (Shopify, Stripe as placeholders), browse upload history, and initiate analysis workflows.

---

## 2. User Flows

### Flow A: New User Landing
1. User arrives at `/` (home)
2. Redirects to `/data-sources`
3. Explores upload options and dataset examples
4. Uploads CSV file
5. File appears in dataset history
6. Clicks "Analyze Dataset" → creates report run
7. Redirects to analysis page (to be wired separately)

### Flow B: Returning User (Authenticated)
1. User logs in / navigates dashboard
2. Clicks "Data Sources" in nav (or uses `/data-sources` directly)
3. Sees their upload history
4. Can upload new file or re-analyze existing datasets
5. Same analyze flow as A

### Flow C: Mock Connector Click
1. User clicks Shopify or Stripe card
2. Toast/modal says: "Coming soon: [Connector Name] integration"
3. No further action

---

## 3. Page Structure & Components

### 3.1 Overall Layout
```
┌─────────────────────────────────────┐
│ Page Header                         │
│ "Data Sources" title + description  │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ UPLOAD SECTION                      │
│ ├─ CSV Drag-Drop Area               │
│ └─ Connector Cards (Shopify/Stripe) │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ DATASET HISTORY SECTION             │
│ ├─ Title + "View Archive" link      │
│ └─ Table of uploads                 │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ INFO SECTION (optional)             │
│ Value prop + metrics                │
└─────────────────────────────────────┘
```

### 3.2 Components & Files

**Pages:**
- `web/src/app/page.tsx` — Refactored to render Data Sources (instead of redirect)
- `web/src/app/layout.tsx` — Update root layout if needed for data sources

**Components:**
- `web/src/components/data-sources/UploadSection.tsx`
  - CSV drag-drop input
  - Three connector cards (Shopify, Stripe, Laboratory)
  - File validation and upload state
  - Success/error handling

- `web/src/components/data-sources/ConnectorCard.tsx`
  - Reusable card for each data source
  - Icon, name, description
  - Hover states
  - Click handler (toast for unimplemented connectors)

- `web/src/components/data-sources/DatasetHistory.tsx`
  - Table/list of uploads
  - Columns: File name, upload date, file size, row count, status, actions
  - Status badge (Analysis Ready, Archived)
  - "Analyze Dataset" button → creates report run
  - "View Archive" link (no-op for now)

- `web/src/hooks/useDatasetUpload.ts`
  - Handle file upload to `/api/uploads`
  - State: uploading, success, error
  - Refetch dataset list after upload
  - Validation (file type, size)

- `web/src/hooks/useDatasets.ts` (if needed)
  - Fetch list of datasets from `/api/uploads`
  - Polling or manual refetch after upload

**Shared Types:**
- Import `UploadRow` from `@manukora/backend`
- Define types for upload request/response

---

## 4. Data Flow

### Upload Flow
```
User selects file
     ↓
Frontend validates (type, size)
     ↓
POST /api/uploads (FormData with file)
     ↓
Backend: uploadCsv(client, csvBytes, meta)
     ↓
Supabase: stores to BUCKET_UPLOADS, returns UploadRow
     ↓
Frontend: show success toast, refetch dataset list
     ↓
New dataset appears at top of history
```

### Analyze Dataset Flow
```
User clicks "Analyze Dataset" button on upload
     ↓
POST /api/reports (uploadId, period, metadata)
     ↓
Backend: createReportRun(client, { uploadId, period, ... })
     ↓
Supabase: inserts ReportRun, returns run record
     ↓
Frontend: redirect to /dashboard/analysis?reportId=<id>
     ↓
User sees briefing generation workflow
```

---

## 5. Component Specifications

### 5.1 UploadSection

**Props:**
```typescript
interface UploadSectionProps {
  onUploadSuccess?: (upload: UploadRow) => void;
  isPublic?: boolean; // true = no auth required
}
```

**Features:**
- Drag-drop zone with visual feedback
  - Hover state: highlight border, change background
  - Accepted: `.csv` files only
  - Rejected: show error toast with reason
- Three connector cards:
  - Shopify (clickable, shows "Coming soon" toast)
  - Stripe (clickable, shows "Coming soon" toast)
  - Laboratory (same)
- Upload button (alternative to drag-drop)
- File size validation (max 50MB, configurable)
- Loading state while uploading
- Success/error messages

**UI:**
- Use shadcn `Card`, `Button`, `Input`, `Alert`
- Icons from lucide-react
- Responsive: connectors stack on mobile, 3-col grid on desktop

### 5.2 DatasetHistory

**Props:**
```typescript
interface DatasetHistoryProps {
  uploads: UploadRow[];
  isLoading?: boolean;
  onAnalyze?: (uploadId: string) => void;
}
```

**Features:**
- Display recent uploads (limit 20, paginate if needed)
- Columns:
  - File name (clickable for details?)
  - Upload date (formatted)
  - File size (human-readable, e.g., "4.2MB")
  - Row count (from metadata)
  - Status badge ("Analysis Ready", "Archived", "Processing")
  - Actions: "Analyze Dataset" button, visibility toggle (mock)
- Table rows show on hover: subtle background color shift
- "View Archive" link expands list or navigates (no-op for now)

**UI:**
- Use shadcn `Table` component
- Status badges: different colors per status
  - Analysis Ready: primary color
  - Archived: muted
  - Processing: info/blue
- Buttons: primary on last column
- Responsive: stack columns on mobile, or horizontal scroll

### 5.3 ConnectorCard (Reusable)

**Props:**
```typescript
interface ConnectorCardProps {
  name: string;
  description: string;
  icon: React.ReactNode;
  status?: "available" | "coming-soon";
  onClick?: () => void;
}
```

**Features:**
- Icon at top
- Name + description
- Hover: scale slightly, shadow
- Click handler
  - If `status === "coming-soon"`: toast "Coming soon: [Name] integration"
  - If available: trigger authentication or connection flow

**UI:**
- Use shadcn `Card`
- Consistent sizing with upload area

---

## 6. API Integration

### Existing APIs Used
- **POST /api/uploads** — Upload CSV file
  - Input: `FormData { file: File }`
  - Output: `UploadRow`
  - Calls: `uploadCsv(client, csvBytes, meta)`
  
- **GET /api/uploads** — Fetch recent uploads
  - Query: `?limit=50`
  - Output: `UploadRow[]`
  - Calls: `listUploads(client, { limit })`

### New API (if needed)
- **POST /api/reports** — Create report run to initiate analysis
  - Input: `{ uploadId: string, period?: string, metadata?: Record }`
  - Output: `ReportRunRow`
  - Calls: `createReportRun(client, { uploadId, period, ... })`
  - **Note:** May already exist from dashboard. Reuse if available.

---

## 7. Styling & Responsive Design

### Breakpoints
- Mobile: 640px and below (single column, stacked cards)
- Tablet: 641px–1024px (2-col grid for connectors)
- Desktop: 1025px+ (3-col grid for connectors, full-width table)

### Color & Typography
- Match existing dashboard (shadcn/ui defaults)
- No serif fonts, no asymmetry
- Clear hierarchy: page title > section titles > content

### Accessibility
- All interactive elements keyboard-navigable
- Upload area keyboard accessible (file input with label)
- Table has proper headers and roles
- Status badges use color + text (not color alone)
- ARIA labels on icon-only buttons

---

## 8. Error Handling & Edge Cases

### Upload Errors
| Scenario | Behavior |
|----------|----------|
| File too large (>50MB) | Show validation error before upload; button disabled |
| Wrong file type (not CSV) | Reject on drop; show error toast |
| Network error during upload | Show retry button in error toast |
| Server returns 500 | Show friendly error message; don't expose stack trace |
| No files in history | Show empty state message: "No datasets yet. Upload a CSV to get started." |

### Loading States
- Upload section: spinner over button while uploading
- Dataset history: skeleton loader for table rows while fetching
- Connectors: cursor pointer on hover, no disabled state

### Success States
- Upload success: toast with file name + row count
- Dataset appears immediately in table (optimistic update)
- "Analyze Dataset" click: navigate to report page

---

## 9. Testing Strategy

### Unit Tests
- `useDatasetUpload` hook
  - File validation logic
  - Error state management
  - Success state management

### Component Tests
- `UploadSection`
  - Drag-drop acceptance/rejection
  - File input picker works
  - Success/error toasts display
  
- `DatasetHistory`
  - Table renders with uploads
  - Status badges correct
  - Analyze button calls callback
  - Empty state shows when no data

- `ConnectorCard`
  - Click handler fires
  - Coming-soon toast shows for inactive connectors

### Integration Tests
- Upload → fetches list → new dataset appears
- Analyze button → creates report run → redirects
- (E2E if possible: full flow from upload to analysis page)

---

## 10. Deployment Notes

### Environment Variables
- No new env vars needed (uses existing Supabase config)

### Database
- No schema changes (uses existing `uploads` and `reports` tables)

### Build & Runtime
- Build: `npm run build` (no new dependencies)
- Runtime: no new runtime requirements

---

## 11. Future Enhancements

These are out of scope for this spec but planned:
- Shopify API integration (connect OAuth flow)
- Stripe API integration
- Dataset archive/restore
- Bulk upload
- Field mapping UI for non-standard CSVs
- Data validation and preview before analysis
