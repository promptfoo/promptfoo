# PageWrapper Component

A reusable wrapper component for red-team setup pages that provides a consistent layout with scrolling behavior and persistent navigation.

## Features

- **Minimizing Header**: Title shrinks and description hides as you scroll down
- **Persistent Navigation**: Next/Back buttons remain visible at the bottom
- **Smooth Transitions**: Animated transitions for header state changes
- **Flexible**: Configurable props for different page requirements

## Usage

```tsx
import PageWrapper from './PageWrapper';

function MySetupPage({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return (
    <PageWrapper
      title="My Setup Page"
      description="This is a description of what this page does."
      onNext={onNext}
      onBack={onBack}
      nextDisabled={false}
    >
      {/* Your page content goes here */}
      <YourContent />
    </PageWrapper>
  );
}
```

## Props

| Prop           | Type              | Default  | Description                                |
| -------------- | ----------------- | -------- | ------------------------------------------ |
| `title`        | `string`          | Required | The page title shown in the header         |
| `description`  | `string`          | Optional | Description text that hides when scrolling |
| `children`     | `React.ReactNode` | Required | The main content of the page               |
| `onNext`       | `() => void`      | Optional | Handler for the Next button                |
| `onBack`       | `() => void`      | Optional | Handler for the Back button                |
| `nextLabel`    | `string`          | `"Next"` | Text for the Next button                   |
| `backLabel`    | `string`          | `"Back"` | Text for the Back button                   |
| `showNext`     | `boolean`         | `true`   | Whether to show the Next button            |
| `showBack`     | `boolean`         | `true`   | Whether to show the Back button            |
| `nextDisabled` | `boolean`         | `false`  | Whether the Next button is disabled        |
| `backDisabled` | `boolean`         | `false`  | Whether the Back button is disabled        |

## Behavior

- **Initial State**: Full header with large title and visible description
- **Scrolled State** (after 50px): Minimized header with smaller title and hidden description
- **Navigation**: Fixed buttons at bottom that don't scroll with content
- **Responsive**: Accounts for the sidebar width (280px)

## Example: Converting Existing Components

Before:

```tsx
export default function Targets({ onNext, onBack }: TargetsProps) {
  return (
    <Stack direction="column" spacing={3}>
      <Typography variant="h4">Select Red Team Target</Typography>
      <Typography variant="body1">Description...</Typography>

      {/* Content */}
      <YourContent />

      {/* Navigation buttons at bottom */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button onClick={onBack}>Back</Button>
        <Button onClick={onNext}>Next</Button>
      </Box>
    </Stack>
  );
}
```

After:

```tsx
export default function Targets({ onNext, onBack }: TargetsProps) {
  return (
    <PageWrapper
      title="Select Red Team Target"
      description="Description..."
      onNext={onNext}
      onBack={onBack}
    >
      {/* Content - no need for navigation buttons */}
      <YourContent />
    </PageWrapper>
  );
}
```

## Benefits

1. **Consistent UX**: Same scrolling behavior across all setup pages
2. **Less Boilerplate**: No need to implement navigation buttons in each component
3. **Better UX**: Persistent navigation buttons improve usability on long pages
4. **Responsive Design**: Handles different screen sizes and the sidebar layout
5. **Accessible**: Built with proper semantic structure

## Example Implementation

See `TargetsWithPageWrapper.tsx` for a complete example of how to refactor an existing component to use the PageWrapper.
