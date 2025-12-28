# Migration Audit Report

**Last Updated:** 2025-12-27
**Migration:** MUI v7 → shadcn/Radix UI + Tailwind CSS
**Overall Progress:** ~25-30% complete

---

## Executive Summary

| Metric | Value | Target |
|--------|-------|--------|
| Total Frontend Files | 508 | - |
| Files Using MUI | 195 (38%) | 0% |
| Files Using New UI | 65 (13%) | 100% |
| UI Components Built | 27/27 | Complete |
| Test Coverage | 100% | 100% |
| MUI Import Statements | 1,311 | 0 |
| sx= Prop Usages | 1,165 | 0 |

---

## Phase Completion Status

| Phase | Status | Progress | Notes |
|-------|--------|----------|-------|
| Phase 0: Foundation | ✅ Complete | 100% | Tailwind, CSS vars, component structure |
| Phase 1: Core Primitives | ✅ Complete | 100% | 24 components built and tested |
| Phase 2: Layout & Typography | ✅ Complete | 100% | Card, Separator, Tailwind typography |
| Phase 3: Complex Components | 🟡 Partial | 60% | DataTable done, Navigation pending |
| Phase 4: Forms | 🟡 Partial | 40% | Missing Combobox/Autocomplete |
| Phase 5: Icons | 🟡 Partial | 78% | 67/86 icons mapped |
| Phase 6: Theme & Dark Mode | 🟡 Partial | 70% | CSS vars done, MUI theme still present |
| Phase 7: Page Migration | 🔴 Early | 25% | Model Audit complete, others pending |
| Phase 8: Cleanup | 🔴 Not Started | 0% | Dependencies still present |

---

## Component Library Status

### UI Components (27 total - ALL COMPLETE)

| Component | Lines | Tests | Usage | Status |
|-----------|-------|-------|-------|--------|
| `button.tsx` | 48 | ✅ | 35 imports | Complete - 7 variants |
| `dialog.tsx` | 128 | ✅ | 21 imports | Complete - Full modal system |
| `tooltip.tsx` | 34 | ✅ | 26 imports | Complete |
| `icons.tsx` | 77 | ✅ | 24 imports | 67 icon mappings |
| `card.tsx` | 69 | ✅ | 17 imports | Complete - 6 sub-components |
| `badge.tsx` | 43 | ✅ | 15 imports | Complete - 10 variants |
| `input.tsx` | 24 | ✅ | 11 imports | Complete |
| `alert.tsx` | 62 | ✅ | 9 imports | Complete - 5 variants |
| `label.tsx` | 20 | ✅ | 8 imports | Complete |
| `spinner.tsx` | 26 | ✅ | 7 imports | Complete - 3 sizes |
| `select.tsx` | 169 | ✅ | 5 imports | Complete - Full select system |
| `copy-button.tsx` | 42 | ✅ | 4 imports | Complete |
| `dropdown-menu.tsx` | 210 | ✅ | 3 imports | Complete - Full menu system |
| `tabs.tsx` | 56 | ✅ | 3 imports | Complete |
| `collapsible.tsx` | 10 | ✅ | 3 imports | Complete |
| `separator.tsx` | 28 | ✅ | 3 imports | Complete |
| `popover.tsx` | 40 | ✅ | 2 imports | Complete |
| `textarea.tsx` | 26 | ✅ | 2 imports | Complete |
| `checkbox.tsx` | 54 | ✅ | 1 import | Complete - Indeterminate support |
| `switch.tsx` | 26 | ✅ | 1 import | Complete |
| `skeleton.tsx` | 8 | ✅ | 1 import | Complete |
| `navigation-menu.tsx` | 134 | ✅ | 1 import | Complete |
| `progress.tsx` | 27 | ✅ | 0 imports | Complete (unused) |
| `breadcrumb.tsx` | 98 | ✅ | 0 imports | Complete (unused) |
| `json-textarea.tsx` | 47 | ✅ | 0 imports | Complete (unused) |
| `radio-group.tsx` | 220 | ✅ | 0 imports | Complete - 3 variants |
| `slider.tsx` | 235 | ✅ | 0 imports | Complete - Slider, SliderWithLabel, RangeSlider |
| `combobox.tsx` | 450 | ✅ | 0 imports | Complete - Combobox, ComboboxMultiple + Command primitives |

### Missing Components (Blockers)

| Component | Blocks | Priority | Complexity |
|-----------|--------|----------|------------|
| **NumberInput** | BaseNumberInput replacement | 🟡 High | Medium |
| **Gauge/Chart** | RiskCard | 🟡 High | Medium |

---

## MUI Component Usage Audit

### Top 30 Most Used MUI Components

| Component | Files | Replacement Strategy |
|-----------|-------|---------------------|
| Box | 99 | `<div>` + Tailwind flex/grid |
| Typography | 97 | Semantic HTML + Tailwind text classes |
| Button | 59 | `@app/components/ui/button` ✅ |
| IconButton | 53 | Button with `variant="ghost"` + icon |
| Tooltip | 43 | `@app/components/ui/tooltip` ✅ |
| TextField | 38 | `@app/components/ui/input` ✅ |
| Paper | 37 | `@app/components/ui/card` or div with border |
| Stack | 35 | Tailwind `flex` utilities |
| Dialog* | 29 | `@app/components/ui/dialog` ✅ |
| Alert | 25 | `@app/components/ui/alert` ✅ |
| useTheme | 23 | CSS variables + Tailwind dark: |
| CircularProgress | 19 | `@app/components/ui/spinner` ✅ |
| Link | 18 | React Router Link + Tailwind |
| MenuItem | 15 | `@app/components/ui/dropdown-menu` ✅ |
| FormControl | 14 | Compose from primitives |
| Chip | 14 | `@app/components/ui/badge` ✅ |
| FormControlLabel | 13 | Label + Checkbox/Switch |
| Select | 11 | `@app/components/ui/select` ✅ |
| Accordion* | 9 | `@app/components/ui/collapsible` ✅ |
| Card* | 9 | `@app/components/ui/card` ✅ |
| Grid | 9 | Tailwind grid utilities |
| Divider | 8 | `@app/components/ui/separator` ✅ |
| Checkbox | 8 | `@app/components/ui/checkbox` ✅ |
| List* | 8 | Semantic HTML `<ul>/<li>` |
| Tabs* | 6 | `@app/components/ui/tabs` ✅ |
| Switch | 6 | `@app/components/ui/switch` ✅ |
| Radio* | 6 | `@app/components/ui/radio-group` ✅ |
| Table* | 4 | DataTable (TanStack) ✅ |
| Autocomplete | 3 | `@app/components/ui/combobox` ✅ |
| Slider | 3 | `@app/components/ui/slider` ✅ |

### styled() Component Usage (11 files)

| File | Components | Priority |
|------|------------|----------|
| `components/DarkMode.tsx` | 1 | Low |
| `components/Logo.tsx` | 3 | Low |
| `components/UpdateBanner.tsx` | 3 | Low |
| `pages/eval/components/CustomMetrics.tsx` | 2 | Medium |
| `pages/eval/components/ResultsFilters/FiltersButton.tsx` | 1 | High |
| `pages/eval/components/ResultsView.tsx` | 1 | High |
| `pages/launcher/page.tsx` | 2 | Low |
| `pages/redteam/report/components/StrategyStats.tsx` | 2 | Medium |
| `pages/redteam/setup/components/CustomIntentPluginSection.tsx` | 1 | Medium |
| `pages/redteam/setup/components/PageWrapper.tsx` | 4 | Medium |
| `pages/redteam/setup/page.tsx` | 2 | High |

### sx= Prop Usage by Area

| Directory | Count | % of Total |
|-----------|-------|------------|
| pages/redteam/ | 870 | 76% |
| pages/eval/ | 240 | 21% |
| components/ | 55 | 3% |
| pages/model-audit*/ | 0 | 0% |
| pages/prompts/ | 0 | 0% |

---

## Page Migration Status

### Fully Migrated (100%)

| Area | Files | Notes |
|------|-------|-------|
| model-audit-history | 2 | Reference implementation |
| model-audit-latest | 2 | Reference implementation |
| model-audit-result | 2 | Reference implementation |
| model-audit-setup | 2 | Reference implementation |
| launcher | 1 | Complete |

### Mostly Migrated (50-99%)

| Area | Files | MUI | New UI | Notes |
|------|-------|-----|--------|-------|
| model-audit | 13 | 1 | 12 | 92% - Only InstallationCheck.tsx pending |
| eval-creator | 22 | 11 | 10 | 50% - Main page migrated |
| history | 2 | 1 | 1 | 50% |

### Partially Migrated (25-50%)

| Area | Files | MUI | New UI | Notes |
|------|-------|-----|--------|-------|
| datasets | 3 | 2 | 1 | Dialog migrated |
| prompts | 3 | 2 | 1 | Dialog migrated |

### Minimal Migration (<25%)

| Area | Files | MUI Imports | Complexity | Blockers |
|------|-------|-------------|------------|----------|
| eval | 43 | 271 | **CRITICAL** | ResultsView.tsx (1,120 lines, 23 MUI components) |
| redteam | 83 | 820 | **CRITICAL** | setup/page.tsx (904 lines), Targets/ (40+ files) |
| evals | 5 | ~50 | Medium | EvalsTable |

---

## Critical Blocking Files

### Tier 1 - Must Fix First

| File | Lines | MUI Components | Icons | Impact |
|------|-------|----------------|-------|--------|
| `eval/components/ResultsView.tsx` | 1,120 | 23 | 13 | Blocks entire eval page |
| `redteam/setup/page.tsx` | 904 | 14 | 9 | Blocks redteam setup |
| `eval/components/ResultsFilters/FiltersForm.tsx` | ~300 | 10+ | 5 | Blocks eval filtering |

### Tier 2 - High Impact

| File | Lines | MUI Components | Impact |
|------|-------|----------------|--------|
| `eval/components/Eval.tsx` | 381 | 2 | Orchestrates eval view |
| `redteam/setup/components/Targets/*` | 40+ files | Heavy | Target configuration |
| `redteam/report/components/RiskCard.tsx` | ~200 | 5 + Gauge | Risk visualization |

### Tier 3 - Completeness

| File | Notes |
|------|-------|
| `eval/components/TableSettings/*` | Complex sliders, range inputs |
| `redteam/report/*` | 15+ report visualization files |
| `components/PageShell.tsx` | Theme provider (375 lines) |

---

## Icon Migration Status

### Summary

| Library | Files | Unique Icons | Status |
|---------|-------|--------------|--------|
| @mui/icons-material | 260 | 86 | Legacy |
| lucide-react | 20 | 27 | Active |
| Mixed (icons.tsx) | 1 | - | Migration bridge |

### Icon Mapping Coverage

- **Mapped in icons.tsx:** 67 icons (78%)
- **Unmapped (need Lucide equivalent):** 19 icons (22%)

### Top 10 Most Used MUI Icons

| Icon | Usage | Lucide Equivalent | Mapped |
|------|-------|-------------------|--------|
| ContentCopyIcon | 12 | Copy | ✅ |
| InfoOutlinedIcon | 11 | Info | ✅ |
| ExpandMoreIcon | 11 | ChevronDown | ✅ |
| CloseIcon | 11 | X | ✅ |
| CheckCircleIcon | 10 | CheckCircle | ✅ |
| DeleteIcon | 9 | Trash2 | ✅ |
| AddIcon | 9 | Plus | ✅ |
| PlayArrowIcon | 8 | Play | ✅ |
| DownloadIcon | 7 | Download | ✅ |
| CheckIcon | 7 | Check | ✅ |

### Unmapped Icons (Need Research)

```
AccessTimeIcon, AccountBalanceOutlined, ArrowDownwardIcon, ArrowUpwardIcon,
AssessmentIcon, AssignmentIcon, AutoAwesomeIcon, BarChartIcon,
BugReportIcon, CalendarTodayIcon, CodeIcon, CompareIcon,
DarkModeIcon, DescriptionIcon, EmailIcon, FileUploadIcon,
FilterAltIcon, FilterListIcon, FingerprintIcon
```

---

## Dependencies

### MUI Dependencies (To Remove)

| Package | Version | Status |
|---------|---------|--------|
| @mui/material | 7.3.5 | Active - 195 files |
| @mui/icons-material | 7.3.5 | Active - 260 files |
| @mui/system | 7.3.5 | Active |
| @mui/x-charts | 8.19.0 | Active - 1 file (RiskCard) |
| @emotion/react | 11.14.0 | MUI dependency |
| @emotion/styled | 11.14.1 | MUI dependency |

### Radix UI Dependencies (Active)

| Package | Version | Wrapper |
|---------|---------|---------|
| @radix-ui/react-collapsible | 1.1.12 | ✅ collapsible.tsx |
| @radix-ui/react-dialog | 1.1.15 | ✅ dialog.tsx |
| @radix-ui/react-dropdown-menu | 2.1.16 | ✅ dropdown-menu.tsx |
| @radix-ui/react-label | 2.1.8 | ✅ label.tsx |
| @radix-ui/react-navigation-menu | 1.2.14 | ✅ navigation-menu.tsx |
| @radix-ui/react-popover | 1.1.15 | ✅ popover.tsx |
| @radix-ui/react-progress | 1.1.8 | ✅ progress.tsx |
| @radix-ui/react-radio-group | 1.2.4 | ✅ radio-group.tsx |
| @radix-ui/react-select | 2.2.6 | ✅ select.tsx |
| @radix-ui/react-slider | 1.2.4 | ✅ slider.tsx |
| @radix-ui/react-separator | 1.1.8 | ✅ separator.tsx |
| @radix-ui/react-slot | 1.2.4 | Used in button.tsx |
| @radix-ui/react-switch | 1.2.6 | ✅ switch.tsx |
| @radix-ui/react-tabs | 1.1.13 | ✅ tabs.tsx |
| @radix-ui/react-tooltip | 1.2.8 | ✅ tooltip.tsx |

### Other Active Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| lucide-react | 0.562.0 | Icon library |
| cmdk | - | Command menu / Combobox primitives |
| class-variance-authority | - | Component variants |
| tailwind-merge | - | Class merging |
| clsx | - | Conditional classes |

---

## Recommended Migration Order

### Phase 1: Quick Wins (1-2 days)

1. **Complete icon mappings** - Add 19 missing icons to icons.tsx
2. **Migrate datasets page** (3 files) - Simple dialogs
3. **Migrate prompts page** (3 files) - Simple dialogs
4. **Migrate history page** (2 files) - Simple list

### Phase 2: Build Missing Components (2-3 days)

1. ~~**Create Combobox/Autocomplete** - Blocks FiltersForm~~ ✅ **COMPLETE**
2. **Create NumberInput** - Replace BaseNumberInput
3. ~~**Create Slider** - For TableSettings~~ ✅ **COMPLETE**
4. ~~**Create RadioGroup** - For form controls~~ ✅ **COMPLETE**

### Phase 3: Complete eval-creator (1-2 days)

1. Migrate remaining 11 files
2. All patterns already established

### Phase 4: Eval Page (1 week)

1. **Refactor ResultsView.tsx** - Break into smaller components
2. Migrate FiltersForm (needs Combobox first)
3. Migrate remaining eval components
4. Migrate TableSettings

### Phase 5: Redteam (2 weeks)

1. **Refactor setup/page.tsx** - Break into smaller components
2. Create target configuration components
3. Migrate report components
4. Replace Gauge chart in RiskCard

### Phase 6: Cleanup

1. Remove @mui/* dependencies
2. Remove @emotion/* dependencies
3. Delete legacy/ directory if exists
4. Update documentation

---

## Anti-Patterns Found

### Good News
- **No mixed components detected** - Files are either MUI or new UI, not both
- **Consistent import patterns** - Clean separation maintained
- **Z-index properly configured** - All portaled components use CSS variables

### Issues to Address
- **Monolithic components** - ResultsView.tsx (1,120 lines), setup/page.tsx (904 lines)
- **Heavy sx= usage** - 1,165 instances, concentrated in redteam (76%)
- **styled() components** - 11 files still using MUI's styled()

---

## Reference Implementations

Use these files as patterns for migration:

| Pattern | Reference File |
|---------|----------------|
| Page layout | `pages/model-audit-history/page.tsx` |
| Results page | `pages/model-audit-result/page.tsx` |
| Form page | `pages/model-audit-setup/page.tsx` |
| Dialog usage | `pages/eval-creator/components/ProviderConfigDialog.tsx` |
| Card layouts | `pages/model-audit/components/IssueCard.tsx` |
| Severity styling | `pages/model-audit-result/components/SeveritySection.tsx` |

---

## Success Metrics

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| MUI dependencies | 6 | 0 | 🔴 |
| Files using MUI | 195 | 0 | 🔴 |
| sx= prop usages | 1,165 | 0 | 🔴 |
| styled() usages | 11 | 0 | 🔴 |
| UI components | 24 | 24 | ✅ |
| Icon coverage | 78% | 100% | 🟡 |
| Bundle size reduction | - | 30%+ | Pending |

---

## Changelog

### 2025-12-27 (Update 2)
- Added Slider component (slider.tsx) - 26th component
  - Slider, SliderWithLabel, RangeSlider variants
  - Support for marks, size variants, orientation
  - 36 comprehensive tests
- Added Combobox component (combobox.tsx) - 27th component
  - Combobox (single select) and ComboboxMultiple
  - Support for freeSolo mode, async loading, search filtering
  - Command primitives for custom usage
  - 36 comprehensive tests
- Installed @radix-ui/react-slider and cmdk packages
- All critical blocker components now complete (except NumberInput and Gauge)

### 2025-12-27 (Update 1)
- Added RadioGroup component (radio-group.tsx) - 25th component
- RadioGroup includes: RadioGroup, RadioGroupItem, RadioGroupItemWithLabel
- Support for horizontal/vertical orientation, size variants (sm/default)
- Card variant for prominent option displays
- 30 comprehensive tests
- Removed RadioGroup from missing components blockers

### 2025-12-27 (Initial)
- Initial comprehensive audit completed
- Documented all 24 UI components as complete
- Identified 3 critical blocking files
- Mapped 67/86 icons
- Created migration priority order
