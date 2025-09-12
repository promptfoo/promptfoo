# CSV Metadata Filtering Demo

Shows how to add metadata to CSV test files for filtering in Promptfoo.

## Files

- `basic_categories.csv` + `basic_categories_config.yaml` - Single metadata column (category)
- `multi_dimension_filtering.csv` + `multi_dimension_config.yaml` - Multiple metadata columns (category, difficulty)
- `rich_metadata_arrays.csv` + `rich_metadata_config.yaml` - Complex metadata with arrays and multiple dimensions

## CSV Metadata Format

Add these special columns to your CSV:

- `__metadata:column_name` - Single value (category, difficulty, grade_level, etc.)
- `__metadata:column_name[]` - Array values (skills, tags, etc.)

### Basic Example:

```csv
question,expected_answer,__metadata:category
"What is 2+2?","contains: 4","math"
```

### Advanced Example with Arrays:

```csv
question,expected_answer,__metadata:category,__metadata:difficulty,__metadata:skills[],__metadata:grade_level,__metadata:time_estimate
"Solve: x² + 5x + 6 = 0","contains: -2","math","hard","algebra,quadratic_equations,problem_solving","high_school","5 minutes"
```

## Usage

Set API key:

```bash
export GOOGLE_API_KEY="your-key"
```

Run demos:

```bash
# Basic category filtering
promptfoo eval -c basic_categories_config.yaml
promptfoo view

# Multiple dimensions
promptfoo eval -c multi_dimension_config.yaml
promptfoo view

# Rich metadata with arrays
promptfoo eval -c rich_metadata_config.yaml
promptfoo view
```

Filter from command line:

```bash
promptfoo eval -c multi_dimension_config.yaml --filter-metadata category=science difficulty=hard
```

## Features

- **Automatic Dashboard Filters**: Metadata columns become dashboard filters automatically
- **Array Support**: Use `[]` suffix for comma-separated array values
- **Multiple Dimensions**: Combine multiple metadata columns for complex filtering
- **Default Metadata**: Add default metadata to all tests via config `defaultTest.metadata`

## Available Metadata in Examples

- **Basic**: category
- **Multi-dimension**: category, difficulty
- **Rich arrays**: category, difficulty, skills[], grade_level, time_estimate
