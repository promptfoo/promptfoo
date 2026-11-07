# factguard-numeric-grounding (Numeric Grounding with factguard)

Check that the numbers in an output appear in, or follow from, the JSON it was written from. The assertion uses [factguard](https://github.com/Anirudh-Nadipally/factguard), an MIT-licensed rule-based Python checker. It makes no model calls and needs no API key. The `echo` provider returns fixed summaries, so this example runs offline. Replace it with your application's provider to check real outputs.

## Setup

```sh
npx promptfoo@latest init --example factguard-numeric-grounding
cd factguard-numeric-grounding
pip install -r requirements.txt
```

The PyPI package is `factguard-check`; the import name is `factguard`. Install it into the Python that promptfoo runs. If that is a different interpreter, set `PROMPTFOO_PYTHON=/path/to/python`.

```sh
npx promptfoo@latest eval --no-cache
```

## What the example checks

`data/store.json` holds one store and two products. Each test passes a summary through `echo`, and the assertion compares every number in it with the data:

| Test                   | Expected result | Reason                                                             |
| ---------------------- | --------------- | ------------------------------------------------------------------ |
| Grounded summary       | pass            | Every number is in the data or one step of arithmetic away from it |
| Wrong product          | fail            | `15: data says products[1].units_sold=12`                          |
| Number not in the data | fail            | `25%: not in data`                                                 |

Two of the three tests fail on purpose, so the eval reports two failures. Read the reason column to see why each one failed.

## Reading results

The score is the share of numeric claims the data supports: grounded claims divided by all numeric claims. An output with no numbers scores 1.0. There are no weights. By default the assertion passes only at 1.0, so any flagged number fails the test. Set `fail_under` to accept a lower share.

A claim counts as grounded when:

- the value is in the data, at the precision written. `4.7` matches 4.68, and `3.8%` matches 0.038.
- the text signals one step of arithmetic over related fields, such as "double", "average" or "more than".

A claim is flagged when it is attached to a field that holds a different value, or when nothing in the data supports it. The reason names the stored value when there is one.

## Configuration

Set options under the assertion's `config`:

```yaml
assert:
  - type: python
    value: file://factguard_assert.py
    config:
      fail_under: 1.0 # minimum score to pass
      strict_rows: false # flag a value found only on another record
      derived: true # accept one step of arithmetic
      aliases: # words the text uses for a field
        units_sold: ['units', 'sold']
```

The source data comes from the first of `config.source` (an inline object or JSON string), `config.source_file` (a path), or `vars.source`. Set `config.source_var` to read a different variable. A variable loaded with `file://data.json` works.

## Limits

- It checks numbers only. Names, dates and other words are not verified. Years, clock times and named versions are skipped.
- Matching a number to a record and field is heuristic. It works best on English text and data with readable field names. Use `aliases` when field names differ from the words in the text.
- A wrong number that also happens to be valid for the same record is not caught.
- Derived values are limited to one step of arithmetic: a sum, mean, difference, ratio or percentage change.
- Claims about anything outside the JSON you pass, such as earlier periods, are flagged as unsupported.

On the number errors in the [INLG 2021 accuracy shared task](https://github.com/ehudreiter/accuracySharedTask) test set, factguard's published benchmark reports a precision of 0.611 and a recall of 0.406 ([method and caveats](https://github.com/Anirudh-Nadipally/factguard#benchmark-inlg-2021-accuracy-shared-task)). Treat it as a fast first check, not a complete fact check.

The assertion runs locally and sends no data to any service.

## Offline validation for contributors

From this directory, with the requirements installed:

```sh
python -m unittest factguard_assert_test.py
```

From the promptfoo repository root, run the example through the local build:

```sh
npm run local -- eval -c examples/factguard-numeric-grounding/promptfooconfig.yaml --no-cache
```
