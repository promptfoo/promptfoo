# promptfoo-toolkit

A React component library for promptfoo applications.

## Installation

```bash
npm install promptfoo-toolkit
```

## Usage

```tsx
import React from 'react';
import { Button, Card, Input } from 'promptfoo-toolkit';

function App() {
  return (
    <div>
      <Card title="Example Card" subtitle="This is a sample card">
        <Input
          label="Name"
          placeholder="Enter your name"
          onChange={(value) => console.log(value)}
        />
        <Button variant="primary" onClick={() => console.log('Clicked!')}>
          Click me
        </Button>
      </Card>
    </div>
  );
}
```

## Components

### Button

A customizable button component with multiple variants and sizes.

**Props:**

- `children`: The button content
- `variant`: 'primary' | 'secondary' | 'outline' (default: 'primary')
- `size`: 'small' | 'medium' | 'large' (default: 'medium')
- `disabled`: boolean (default: false)
- `onClick`: () => void
- `className`: string

### Card

A container component for grouping related content.

**Props:**

- `children`: The card content
- `title`: string (optional)
- `subtitle`: string (optional)
- `elevated`: boolean (default: false)
- `className`: string

### Input

A form input component with label, validation, and help text support.

**Props:**

- `label`: string (optional)
- `placeholder`: string (optional)
- `value`: string
- `type`: 'text' | 'email' | 'password' | 'number' (default: 'text')
- `disabled`: boolean (default: false)
- `required`: boolean (default: false)
- `error`: string (optional)
- `helpText`: string (optional)
- `onChange`: (value: string) => void
- `className`: string

## Development

```bash
# Install dependencies
npm install

# Build the library
npm run build

# Watch for changes during development
npm run dev

# Type check
npm run type-check

# Clean build artifacts
npm run clean
```

## License

MIT
