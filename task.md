# Task: Export Conversation History in WebUI Eval Export

## Overview

This task involves adding conversation history data to the webui eval export functionality, specifically for redteaming and other multi-turn conversations. Currently, the export functions don't include the rich conversation data that's available in the UI.

## ⚠️ CRITICAL UNCERTAINTIES - MUST INVESTIGATE FIRST

### 1. Data Structure Location (HIGH PRIORITY)
**UNCERTAIN:** Where exactly is conversation data stored in the export data?

**Current Evidence:**
- `DownloadMenu.tsx:208` accesses `row.outputs[0]?.metadata?.redteamFinalPrompt`
- `EvalOutputPromptDialog.tsx:562` accesses `metadata?.redteamFinalPrompt`
- `EvaluateTableOutput` has both `metadata` and `response?.metadata` fields
- `SimulatedUser` stores data in `ProviderResponse.metadata.messages`

**NEED TO VERIFY:**
- Is conversation data in `output.metadata` or `output.response?.metadata`?
- How does data flow from `ProviderResponse.metadata` → `EvaluateTableOutput.metadata`?
- Are these fields flattened during processing?

### 2. Multi-Turn Strategy Coverage (HIGH PRIORITY)
**UNCERTAIN:** What conversation formats exist across ALL multi-turn strategies?

**Known Strategies:**
- ✅ Redteam iterative: `redteamHistory` array
- ✅ Redteam tree search: `redteamTreeHistory` array
- ✅ Crescendo: `redteamHistory` + confidence scores
- ✅ SimulatedUser: `messages` array with roles
- ❓ Regular chat providers: Unknown format
- ❓ Agent providers: Unknown format
- ❓ Other multi-turn workflows: Unknown

**NEED TO VERIFY:**
- Find all providers that generate multi-turn conversations
- Document their metadata formats
- Check if any use formats other than `messages`, `redteamHistory`, `redteamTreeHistory`

### 3. Data Pipeline Flow (MEDIUM PRIORITY)
**UNCERTAIN:** How does conversation data flow through the system?

**NEED TO TRACE:**
- Provider response → Evaluation result → Table output → Export
- Are there transformations or filtering steps?
- Do different export functions access data differently?

## Current State Analysis

### Existing Export Functions (`src/app/src/pages/eval/components/DownloadMenu.tsx`)

1. **downloadCsv()** - Exports basic table data in CSV format (line 157-192)
2. **downloadTable()** - Exports table JSON (line 147-155)
3. **downloadDpoJson()** - Exports chosen/rejected responses for DPO training (line 130-145)
4. **downloadHumanEvalTestCases()** - Exports test cases with redteamFinalPrompt (line 194-226)

### Conversation Data Structure (TENTATIVE - NEEDS VERIFICATION)

Based on limited code analysis, conversation data MAY be stored in metadata:

```typescript
// UNCERTAIN: This may be wrong - need to verify actual structure
interface EvaluateTableOutput {
  metadata?: {
    redteamFinalPrompt?: string;           // Final prompt used in attack
    messages?: Message[] | string;         // Full conversation (format unclear)
    redteamHistory?: Array<{               // Simple prompt/output pairs
      prompt: string;
      output: string;
      score?: number;
      isOnTopic?: boolean;
      graderPassed?: boolean;
    }>;
    redteamTreeHistory?: TreeSearchOutput[]; // Tree search specific history
    [key: string]: any;
  };
  response?: {
    metadata?: {
      // UNCERTAIN: May contain the actual conversation data
      [key: string]: any;
    };
  };
}
```

### How Conversations Are Currently Displayed

1. **ChatMessages Component** (`src/app/src/pages/eval/components/ChatMessages.tsx`)
   - Displays array of `Message` objects with `role` and `content`
   - Supports user/assistant/system roles
   - Has expand/collapse functionality

2. **EvalOutputPromptDialog Component** (`src/app/src/pages/eval/components/EvalOutputPromptDialog.tsx`)
   - Shows `redteamFinalPrompt` in a code display (line 562-574)
   - Displays conversation attempts from `redteamHistory` or `redteamTreeHistory` (line 711-737)
   - Parses `metadata?.messages` as JSON for regular conversations (line 471)

### Data Flow (UNCERTAIN)

1. **Redteam providers** generate conversation data and store it in metadata:
   - `redteamHistory`: Used by iterative, crescendo, goat, custom providers
   - `redteamTreeHistory`: Used by iterative tree search provider
   - `messages`: Used for general conversation storage

2. **Display components** read this metadata and format it for UI display

3. **Export functions** currently only export basic result data, missing the rich conversation context

## INVESTIGATION STEPS REQUIRED BEFORE IMPLEMENTATION

### Step 1: Create Test Data (CRITICAL)
**Goal:** Generate actual evaluation data with conversations to examine structure

**Actions:**
1. Run a simple redteam evaluation with iterative strategy
2. Run a simulated user evaluation
3. Run a regular chat evaluation (if applicable)
4. Export the table JSON and examine the actual data structure

**Files to examine:**
- Look at the downloaded JSON from `downloadTable()`
- Check both `output.metadata` and `output.response?.metadata`
- Document the exact field names and data formats

### Step 2: Trace Data Pipeline
**Goal:** Understand how conversation data flows from providers to exports

**Actions:**
1. Find where `ProviderResponse.metadata` gets copied to `EvaluateTableOutput`
2. Check `src/util/convertEvalResultsToTable.ts` or similar transformation files
3. Verify if data is flattened, filtered, or transformed

### Step 3: Audit All Multi-Turn Providers
**Goal:** Complete inventory of conversation formats

**Actions:**
1. Search for all providers that call `callApi` in a loop or maintain state
2. Check `src/providers/` directory for chat/multi-turn providers
3. Document their metadata formats
4. Look for any providers using websockets, streaming, or session IDs

### Step 4: Test Current Export Functionality
**Goal:** Understand what currently works and what's missing

**Actions:**
1. Test each export function with multi-turn data
2. Check if conversation data appears in any current exports
3. Document exactly what's missing vs what's already there

## REVISED IMPLEMENTATION APPROACH

**ONLY PROCEED AFTER COMPLETING INVESTIGATION STEPS**

### Phase 1: Data Structure Verification
- Create helper function to safely access conversation data from unknown structure
- Handle both `output.metadata` and `output.response?.metadata` paths
- Add error handling for malformed data

### Phase 2: Format Normalization
- Create unified conversation format that works across all strategies
- Handle edge cases (empty conversations, malformed JSON, missing fields)
- Ensure backward compatibility

### Phase 3: Incremental Export Enhancement
- Start with one export function (e.g., Table JSON)
- Add conversation data without breaking existing structure
- Test thoroughly before expanding to other exports

### Phase 4: Comprehensive Coverage
- Extend to other export functions only after verification
- Add UI options for conversation-specific exports
- Document the new export capabilities

## RISKS AND UNCERTAINTIES

### Technical Risks
- **Data structure assumptions may be wrong** - Could require complete rewrite
- **Performance impact** - Large conversation histories might affect export speed
- **Memory usage** - Full conversation data could increase memory requirements significantly

### Coverage Risks
- **Missing strategy types** - May not cover all multi-turn conversation formats
- **Future compatibility** - New conversation formats might break the implementation
- **Edge cases** - Malformed data, very long conversations, non-JSON metadata

### UX Risks
- **File size explosion** - CSV files with full conversations could become unwieldy
- **Data format complexity** - Users might not understand the exported conversation format
- **Backward compatibility** - Existing export workflows might break

## OPEN QUESTIONS

1. **Should conversation data be a separate export or integrated into existing ones?**
2. **What's the maximum conversation length we need to handle?**
3. **Should we provide both raw and summarized conversation data?**
4. **How do we handle conversations with embedded media/images?**
5. **Should trace data be included with conversation exports?**

## SUCCESS CRITERIA

- [ ] All multi-turn conversation types are identified and documented
- [ ] Data structure and access patterns are verified with real data
- [ ] Export functionality works for 100% of identified conversation formats
- [ ] Performance impact is minimal (< 10% increase in export time)
- [ ] Backward compatibility is maintained
- [ ] Documentation explains the new conversation export capabilities