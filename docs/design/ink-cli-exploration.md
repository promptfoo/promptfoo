# Comprehensive Plan: Exploring Ink for promptfoo CLI

## Executive Summary

This document explores wrapping the promptfoo CLI with [Ink](https://github.com/vadimdemedes/ink), a React-based terminal UI framework. The goal is to evaluate whether Ink's declarative, component-based approach could enhance the CLI's user experience while maintaining or improving developer productivity.

**Reference Implementation**: This document incorporates learnings from [Gemini CLI](https://github.com/google-gemini/gemini-cli), a production-grade open-source CLI built with Ink that demonstrates best practices for large-scale Ink applications.

---

## 1. Current State Analysis

### Current Architecture

The promptfoo CLI is built with:
- **[Commander.js](https://github.com/tj/commander.js)** v14 - Command routing and argument parsing
- **[Inquirer](https://github.com/SBoudrias/Inquirer.js)** v5-6 - Interactive prompts (select, confirm, checkbox, input, editor)
- **[cli-progress](https://github.com/npkgz/cli-progress)** v3 - Progress bars (evaluation runs)
- **[cli-table3](https://github.com/cli-table/cli-table3)** - Data tables (results display)
- **[ora](https://github.com/sindresorhus/ora)** v9 - Spinners (code scanning)
- **[chalk](https://github.com/chalk/chalk)** v5 - Terminal colors

### Key Pain Points to Consider

1. **Imperative UI Code**: Current progress/table/prompt code is scattered and imperative
2. **Limited Interactivity**: No real-time updates during long-running operations
3. **Inconsistent UX**: Different commands use different UI patterns
4. **Testing Difficulty**: Terminal UI code is hard to unit test

### What Works Well

1. **Commander.js routing** - Mature, battle-tested argument parsing
2. **Modular commands** - Clean separation in `src/commands/`
3. **Existing patterns** - Team familiarity with current approach

---

## 2. Design Goals

### Primary Goals

| Goal | Description | Priority |
|------|-------------|----------|
| **Declarative UI** | React component model for terminal output | High |
| **Real-time Updates** | Live progress, streaming output during evals | High |
| **Consistent UX** | Unified component library across all commands | High |
| **Testability** | Unit-testable UI components | Medium |
| **Incremental Migration** | Adopt gradually, not big-bang rewrite | High |

### Non-Goals

- Complete replacement of Commander.js (keep for arg parsing)
- Rebuilding all commands at once
- Adding features that don't improve UX

### Success Criteria

1. Improved developer experience when adding new CLI features
2. More responsive, polished user experience
3. Easier to maintain consistent styling
4. No regression in performance or reliability

---

## 3. Proposed Architecture

### Hybrid Approach: Commander.js + Ink

Rather than replacing Commander.js entirely, use a **hybrid architecture**:

```
┌─────────────────────────────────────────────────────────────┐
│                     User Input (CLI)                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Commander.js (Argument Parsing)                │
│  - Route to commands                                        │
│  - Parse flags/options                                      │
│  - Validate inputs                                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Command Handlers                          │
│  - Detect interactive vs non-interactive mode               │
│  - Branch to appropriate UI                                 │
└─────────────────────────────────────────────────────────────┘
                    │                     │
        ┌───────────┘                     └───────────┐
        ▼                                             ▼
┌───────────────────────┐               ┌───────────────────────┐
│   Interactive Mode    │               │  Non-Interactive Mode │
│   (Ink React Layer)   │               │  (Direct stdout)      │
│  - UI Components      │               │  - TextOutput class   │
│  - State management   │               │  - JSON/text output   │
│  - Real-time render   │               │  - No Ink dependency  │
└───────────────────────┘               └───────────────────────┘
```

### Recommended Directory Structure (Based on Gemini CLI)

```
src/ui/                        # All UI code isolated here
├── App.tsx                    # Root component
├── AppContainer.tsx           # Main container with all providers
├── types.ts                   # UI-specific types
├── semantic-colors.ts         # Theme color definitions
│
├── components/                # Reusable Ink components
│   ├── shared/                # Low-level primitives
│   │   ├── TextInput.tsx
│   │   ├── ScrollableList.tsx
│   │   ├── VirtualizedList.tsx
│   │   ├── MaxSizedBox.tsx
│   │   └── text-buffer.ts
│   ├── messages/              # Message display components
│   │   ├── UserMessage.tsx
│   │   ├── ErrorMessage.tsx
│   │   ├── ToolMessage.tsx
│   │   └── InfoMessage.tsx
│   ├── dialogs/               # Modal dialogs
│   │   ├── ConfirmDialog.tsx
│   │   └── SettingsDialog.tsx
│   ├── Banner.tsx
│   ├── MainContent.tsx
│   ├── Composer.tsx           # Input area
│   ├── LoadingIndicator.tsx
│   └── ProgressDisplay.tsx
│
├── contexts/                  # React contexts for state
│   ├── UIStateContext.tsx     # Global UI state
│   ├── ConfigContext.tsx      # CLI config
│   ├── SessionContext.tsx     # Session/metrics
│   ├── KeypressContext.tsx    # Keyboard handling
│   ├── MouseContext.tsx       # Mouse events (optional)
│   ├── ScrollProvider.tsx     # Scroll state
│   └── SettingsContext.tsx
│
├── hooks/                     # Custom React hooks
│   ├── useKeypress.ts
│   ├── useTerminalSize.ts
│   ├── useHistoryManager.ts
│   ├── useEvalStream.ts
│   └── useSlashCommands.ts
│
├── layouts/                   # Layout variations
│   ├── DefaultAppLayout.tsx
│   └── ScreenReaderLayout.tsx
│
├── utils/                     # UI utilities
│   ├── displayUtils.ts
│   ├── textUtils.ts
│   └── ConsolePatcher.ts
│
└── noninteractive/            # Non-TTY output
    └── nonInteractiveUi.ts
```

---

## 4. Key Technical Decisions

### 4.1 How Ink Renders

Ink uses [Yoga](https://yogalayout.dev/) (Facebook's Flexbox engine) to calculate layouts and renders to terminal using ANSI escape codes. This means:

- **Flexbox layouts work** - `flexDirection`, `gap`, `justifyContent`, etc.
- **Re-renders are efficient** - Only changed portions update
- **Full React lifecycle** - `useState`, `useEffect`, custom hooks all work

### 4.2 Critical: Non-Interactive Mode Separation

**Lesson from Gemini CLI**: Keep non-interactive mode completely separate from Ink.

```typescript
// gemini.tsx pattern
export async function main() {
  const config = await loadConfig();

  if (config.isInteractive()) {
    // Only load Ink for interactive mode
    await startInteractiveUI(config);
  } else {
    // Completely separate code path - NO Ink
    await runNonInteractive(config);
  }
}
```

**Non-interactive mode** (`src/ui/noninteractive/`):
- Direct `process.stdout.write()` / `process.stderr.write()`
- JSON streaming output for programmatic consumption
- Handle EPIPE errors gracefully (piped output closed early)
- Ctrl+C cancellation via readline keypress events

This pattern ensures:
- No Ink bundle loaded for CI/piped usage
- Predictable output for scripting
- Graceful degradation

### 4.3 State Management Pattern

**Gemini CLI uses heavy Context-based state management:**

```typescript
// UIStateContext.tsx - Single large state interface
export interface UIState {
  history: HistoryItem[];
  historyManager: UseHistoryManagerReturn;
  isAuthenticating: boolean;
  streamingState: StreamingState;
  pendingHistoryItems: HistoryItemWithoutId[];
  terminalWidth: number;
  terminalHeight: number;
  // ... ~140 fields total
}

// Provider pattern in AppContainer
const AppWrapper = () => (
  <SettingsContext.Provider value={settings}>
    <KeypressProvider config={config}>
      <MouseProvider mouseEventsEnabled={mouseEventsEnabled}>
        <ScrollProvider>
          <SessionStatsProvider>
            <VimModeProvider settings={settings}>
              <AppContainer config={config} />
            </VimModeProvider>
          </SessionStatsProvider>
        </ScrollProvider>
      </MouseProvider>
    </KeypressProvider>
  </SettingsContext.Provider>
);
```

**Recommendation for promptfoo**: Start simpler with fewer contexts, expand as needed:
- `EvalStateContext` - Evaluation progress/results
- `ConfigContext` - CLI configuration
- `UIContext` - Terminal dimensions, theme, etc.

### 4.4 The `<Static>` Component Pattern

For chat-like UIs with history, Ink's `<Static>` component is essential:

```tsx
// MainContent.tsx from Gemini CLI
export const MainContent = () => {
  const { history, pendingHistoryItems } = useUIState();

  return (
    <>
      {/* Static: Completed items that won't re-render */}
      <Static items={history}>
        {(item) => <HistoryItemDisplay key={item.id} item={item} />}
      </Static>

      {/* Dynamic: Currently streaming/pending items */}
      <Box flexDirection="column">
        {pendingHistoryItems.map((item, i) => (
          <HistoryItemDisplay key={i} item={item} isPending={true} />
        ))}
      </Box>
    </>
  );
};
```

This prevents re-rendering the entire conversation history on each update.

### 4.5 Virtualized Scrolling for Large Lists

Gemini CLI implements custom `VirtualizedList` and `ScrollableList` components for performance:

```tsx
// For eval results with many test cases
<ScrollableList
  hasFocus={!dialogOpen}
  data={testResults}
  renderItem={({ item }) => <TestResultRow result={item} />}
  estimatedItemHeight={() => 3}
  keyExtractor={(item) => item.id}
  initialScrollIndex={SCROLL_TO_END}
/>
```

### 4.6 Ink Render Options

```typescript
const instance = render(
  <AppWrapper />,
  {
    stdout: inkStdout,           // Custom stdout for patching
    stderr: inkStderr,
    stdin: process.stdin,
    exitOnCtrlC: false,          // Handle Ctrl+C manually
    patchConsole: false,         // Don't auto-patch console.*
    alternateBuffer: true,       // Full-screen mode (optional)
    incrementalRendering: true,  // Performance optimization
    onRender: ({ renderTime }) => {
      if (renderTime > 200) {
        recordSlowRender(renderTime);
      }
    },
  },
);
```

### 4.7 Testing with ink-testing-library

```typescript
import { render } from 'ink-testing-library';

describe('App', () => {
  const renderWithProviders = (ui: React.ReactElement, state: UIState) =>
    render(
      <ConfigContext.Provider value={mockConfig}>
        <UIStateContext.Provider value={state}>
          {ui}
        </UIStateContext.Provider>
      </ConfigContext.Provider>
    );

  it('should render main content when not quitting', () => {
    const { lastFrame } = renderWithProviders(<App />, mockUIState);
    expect(lastFrame()).toContain('MainContent');
    expect(lastFrame()).toContain('Composer');
  });

  it('renders correctly (snapshot)', () => {
    const { lastFrame } = renderWithProviders(<App />, mockUIState);
    expect(lastFrame()).toMatchSnapshot();
  });
});
```

### 4.8 Component Memoization

Gemini CLI heavily uses `memo()` for performance:

```tsx
const MemoizedHistoryItemDisplay = memo(HistoryItemDisplay);
const MemoizedAppHeader = memo(AppHeader);

// In render
{history.map((item) => (
  <MemoizedHistoryItemDisplay key={item.id} item={item} />
))}
```

---

## 5. Revised Component Hierarchy

### Core Components Needed for promptfoo

Based on Gemini CLI patterns, here's what promptfoo would need:

```
src/ui/
├── components/
│   ├── shared/
│   │   ├── TextInput.tsx          # Multi-line text input with cursor
│   │   ├── ScrollableList.tsx     # Scrollable container
│   │   ├── ProgressBar.tsx        # Progress visualization
│   │   └── Spinner.tsx            # Loading indicator
│   │
│   ├── eval/                      # Eval-specific components
│   │   ├── EvalProgress.tsx       # Overall eval progress
│   │   ├── ProviderStatus.tsx     # Per-provider status
│   │   ├── TestCaseResult.tsx     # Individual test result
│   │   └── ResultsTable.tsx       # Results summary table
│   │
│   ├── prompts/
│   │   ├── SelectPrompt.tsx       # Single selection
│   │   ├── MultiSelectPrompt.tsx  # Multi selection
│   │   ├── ConfirmPrompt.tsx      # Yes/No
│   │   └── InputPrompt.tsx        # Text input
│   │
│   └── feedback/
│       ├── Alert.tsx              # Warning/error/info messages
│       ├── StatusMessage.tsx      # Success/fail status
│       └── Badge.tsx              # Status badges
│
├── screens/                       # Full command UIs
│   ├── EvalScreen.tsx
│   ├── InitScreen.tsx
│   └── RedteamSetupScreen.tsx
│
├── contexts/
│   ├── EvalContext.tsx            # Eval state and progress
│   ├── ConfigContext.tsx          # CLI config
│   └── UIContext.tsx              # Terminal/theme state
│
└── hooks/
    ├── useEvalProgress.ts         # Hook into evaluator events
    ├── useKeypress.ts             # Keyboard handling
    └── useTerminalSize.ts         # Responsive sizing
```

---

## 6. Migration Strategy (Revised)

### Phase 0: Proof of Concept

**Goal**: Validate Ink works for promptfoo's core use case (eval progress)

1. Create isolated `src/ui/` directory
2. Implement minimal `EvalProgress` component
3. Test integration with existing evaluator
4. Benchmark performance vs current cli-progress
5. **Key validation**: Non-interactive fallback works correctly

### Phase 1: Foundation

**Goal**: Establish infrastructure based on Gemini CLI patterns

1. **Set up Ink infrastructure**
   ```bash
   npm install ink@5 ink-spinner react@19
   npm install -D ink-testing-library @types/react
   ```

2. **Implement core architecture**
   - `src/ui/App.tsx` - Root component
   - `src/ui/contexts/` - State contexts
   - `src/ui/noninteractive/` - Non-TTY fallback

3. **Build essential shared components**
   - TextInput (based on Gemini CLI's implementation)
   - ProgressBar
   - Spinner
   - ScrollableList (if needed for results)

4. **Create integration helper**
   ```typescript
   // src/ui/render.ts
   export async function renderInteractive<P>(
     Component: React.FC<P>,
     props: P,
     options?: { onExit?: () => void }
   ) {
     if (!process.stdout.isTTY) {
       throw new Error('Interactive mode requires TTY');
     }

     const { render } = await import('ink');
     return render(<Component {...props} />, {
       exitOnCtrlC: false,
       // ... options
     });
   }
   ```

### Phase 2: Eval Command Migration

**Goal**: Full Ink implementation for `eval` command

1. **EvalScreen component**
   - Progress display with provider breakdown
   - Real-time test case streaming
   - Error display
   - Final results summary

2. **Integration with evaluator**
   - Subscribe to evaluator events
   - Update React state from event handlers
   - Handle cancellation (Ctrl+C)

3. **Non-interactive eval** (already works, just needs verification)

### Phase 3: Interactive Commands

**Goal**: Migrate init wizards and other interactive flows

1. `init` command - Project setup wizard
2. `redteam init` - Red team configuration
3. Config commands with interactive editing

### Phase 4: Cleanup and Documentation

1. Remove old UI library usage
2. Document component library
3. Create contribution guide for new UI components

---

## 7. Risk Analysis (Updated)

### Technical Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Performance regression | High | Low | Benchmark; use `<Static>`, memoization |
| Terminal compatibility | Medium | Medium | Test on macOS, Linux, Windows Terminal, WSL |
| ESM/CJS conflicts | Low | Low | Project already ESM |
| Slow renders | Medium | Medium | Monitor with `onRender`, optimize hot paths |
| Memory leaks | Medium | Low | Proper cleanup on unmount |

### Operational Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Learning curve | Medium | High | Document patterns; reference Gemini CLI |
| CI/CD breakage | High | Medium | Strict non-interactive mode separation |
| Partial migration limbo | Medium | Medium | Clear phase boundaries |

---

## 8. Key Learnings from Gemini CLI

### What They Do Well

1. **Complete separation of interactive/non-interactive modes** - Different code paths, not conditional rendering

2. **Extensive use of React Context** - Clean state management without prop drilling

3. **Custom shared components** - `TextInput`, `ScrollableList`, `VirtualizedList` built from scratch for terminal needs

4. **Performance focus** - `<Static>` for history, memoization, render time monitoring

5. **Accessibility** - Screen reader mode with separate layout

6. **Keyboard handling** - Custom `useKeypress` hook with Kitty protocol support

7. **Testing strategy** - Mock child components, snapshot tests, context providers in test utils

8. **Graceful degradation** - EPIPE handling, alternate buffer toggle, cleanup on exit

### What to Adapt for promptfoo

1. **Simpler state model** - promptfoo has simpler UI needs than a chat interface
2. **Keep chalk** - Gemini CLI uses chalk even inside Ink components; it works fine
3. **Lazy load Ink** - Don't import Ink until interactive mode is confirmed
4. **Reuse their TextInput** - It's well-implemented with cursor, selection, viewport scrolling

---

## 9. Open Questions (Updated)

1. **Alternate buffer mode**: Should promptfoo support full-screen mode for long evals?
   - Pro: Better UX for watching progress
   - Con: More complexity, accessibility concerns

2. **Mouse support**: Is mouse scrolling/clicking worth implementing?
   - Gemini CLI supports it
   - Adds complexity but improves UX significantly

3. **Vim mode**: Should text inputs support vim keybindings?
   - Gemini CLI implements full vim mode
   - Probably overkill for promptfoo's use cases

4. **Ink version**: Use stock `ink@5` or a fork?
   - Gemini CLI uses `@jrichman/ink@6.4.6` (a fork)
   - Start with stock, fork if needed

---

## 10. Next Steps

1. **Prototype**: Create minimal `EvalProgress` component
2. **Validate**: Test with real eval runs, measure performance
3. **Decide**: Based on prototype results, commit to full migration or not
4. **Execute**: Follow phased migration plan

---

## 11. Appendix: Code Examples from Gemini CLI

### Entry Point Pattern

```typescript
// gemini.tsx (simplified)
export async function main() {
  const settings = loadSettings();
  const argv = await parseArguments(settings);
  const config = await loadCliConfig(settings, argv);

  if (config.isInteractive()) {
    await startInteractiveUI(config, settings);
  } else {
    await runNonInteractive({ config, settings, input: argv.prompt });
  }
}

async function startInteractiveUI(config: Config, settings: LoadedSettings) {
  const { stdout: inkStdout, stderr: inkStderr } = createWorkingStdio();

  const instance = render(
    <SettingsContext.Provider value={settings}>
      <KeypressProvider config={config}>
        <AppContainer config={config} />
      </KeypressProvider>
    </SettingsContext.Provider>,
    {
      stdout: inkStdout,
      stderr: inkStderr,
      exitOnCtrlC: false,
      patchConsole: false,
    },
  );

  registerCleanup(() => instance.unmount());
}
```

### App Component Pattern

```tsx
// App.tsx
export const App = () => {
  const uiState = useUIState();

  if (uiState.quittingMessages) {
    return <QuittingDisplay />;
  }

  return (
    <StreamingContext.Provider value={uiState.streamingState}>
      <DefaultAppLayout />
    </StreamingContext.Provider>
  );
};
```

### Layout Pattern

```tsx
// DefaultAppLayout.tsx
export const DefaultAppLayout: React.FC = () => {
  const uiState = useUIState();

  return (
    <Box flexDirection="column" width={uiState.mainAreaWidth}>
      <MainContent />
      <Box flexDirection="column" ref={uiState.mainControlsRef}>
        <Notifications />
        {uiState.dialogsVisible ? (
          <DialogManager />
        ) : (
          <Composer />
        )}
        <ExitWarning />
      </Box>
    </Box>
  );
};
```

### TextInput Component

```tsx
// shared/TextInput.tsx (simplified from Gemini CLI)
export function TextInput({
  buffer,
  placeholder = '',
  onSubmit,
  onCancel,
  focus = true,
}: TextInputProps) {
  const { text, handleInput, visualCursor, viewportVisualLines } = buffer;

  useKeypress((key) => {
    if (key.name === 'escape') onCancel?.();
    else if (key.name === 'return') onSubmit?.(text);
    else handleInput(key);
  }, { isActive: focus });

  if (text.length === 0 && placeholder) {
    return <Text color="gray">{placeholder}</Text>;
  }

  return (
    <Box flexDirection="column">
      {viewportVisualLines.map((line, idx) => (
        <Text key={idx}>{renderLineWithCursor(line, idx)}</Text>
      ))}
    </Box>
  );
}
```

---

## References

- [Ink - GitHub](https://github.com/vadimdemedes/ink)
- [Ink UI - GitHub](https://github.com/vadimdemedes/ink-ui)
- [Gemini CLI - GitHub](https://github.com/google-gemini/gemini-cli) - Production Ink implementation
- [ink-testing-library](https://github.com/vadimdemedes/ink-testing-library)
- [Building CLI tools with React using Ink and Pastel](https://medium.com/trabe/building-cli-tools-with-react-using-ink-and-pastel-2e5b0d3e2793)
- [Using Ink UI with React to build interactive, custom CLIs - LogRocket](https://blog.logrocket.com/using-ink-ui-react-build-interactive-custom-clis/)
