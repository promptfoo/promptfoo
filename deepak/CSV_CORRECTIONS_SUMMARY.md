# CSV Corrections Summary

## Issues Found in Original CSV

### 1. **Malformed Header Row**
- **Original**: `prompt,answer,,`
- **Problem**: Two empty column names after "answer"
- **Fixed**: `prompt,answer,answer2`

### 2. **Corrupted Row 3 (Beef Nutrition)**
- **Original**: Started with `List down the nutrition information of Beef.,"""{","`
- **Problem**: Attempted to embed JSON-like structure, broken quotes, malformed data
- **Fixed**: Properly formatted with escaped quotes and consistent structure

### 3. **Inconsistent Quoting**
- **Problem**: Mix of single and double quotes, unescaped quotes within HTML
- **Fixed**: All fields properly quoted with double quotes, internal quotes preserved

### 4. **Incomplete Data**
- **Problem**: Some rows appeared truncated or had missing closing quotes
- **Fixed**: All rows properly terminated with complete data

## Structure of Corrected CSV

```
prompt,answer,answer2
```

- **prompt**: The user's question
- **answer**: First response variation (shorter/simpler)
- **answer2**: Second response variation (more detailed)

## Data Content

The CSV contains 4 test cases for a Sysco Foods customer service system:

1. **Product ingredients and stock status** - Query about beef patty
2. **Delivery dates** - Query about foil pan lids
3. **Fresh chicken delivery** - Query about chicken tender delivery dates
4. **Nutritional information** - Query about beef nutrition (this row was completely corrupted in original)

## Usage Tips

1. The corrected file `selectbest_response_corrected.csv` is now properly formatted for use with Promptfoo
2. The HTML content in responses is preserved and properly escaped
3. You can use either `answer` or `answer2` column for assertions, or create tests that compare both

## Running Tests

```bash
# With the corrected CSV
cd deepak
promptfoo eval -c promptfooconfig.yaml

# To validate any CSV file
python validate-csv.py yourfile.csv
``` 