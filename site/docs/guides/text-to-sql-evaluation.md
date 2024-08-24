# Evaluating LLM text-to-SQL performance

Promptfoo is a command-line tool that allows you to test and validate text-to-SQL conversions.

This guide will walk you through setting up an eval harness that will help you improve the quality of your text-to-SQL prompts.

The end result is a view that looks like this:

![text to sql evaluation](/img/docs/text-to-sql-eval.png)

## Configuration

Start by creating a blank `promptfooconfig.yaml` file (optionally, generate a placeholder using `npx promptfoo@latest init`).

### Step 1: Define the Prompt(s)

Specify the text prompts that will be used to generate the SQL queries. Use `{{placeholders}}` for variables that will be replaced with actual values during testing.

```yaml
prompts:
  - |
    Output a SQL query that returns the number of {{product}} sold in the last month.

    Database schema:
    {{database}}

    Only output SQL code.
```

If you'd like, you can reference prompts in an external file:

```yaml:
prompts:
  - file://path/to/my_prompt.txt
  - file://path/to/another_prompt.json
```

### Step 2: Specify the Providers

Define one or more language model providers to use. For example, here we compare the performance between GPT 3.5 and GPT 4:

```yaml
providers:
  - openai:gpt-4o-mini
  - openai:gpt-4o
```

A wide variety of LLM APIs are supported, including local models. See [providers](/docs/providers) for more information.

### Step 3: Define the Tests

Create test cases to validate the generated SQL queries. Each test case includes:

- **vars**: Variables used in the prompt template.
- **assert**: Assertions to used to validate the output.

#### Basic SQL Validation

This test checks produces a query for `bananas` (remember our prompt above) and confirms that the generated output is valid SQL.

```yaml
- vars:
    product: bananas
    database: file://database.sql
  assert:
    - type: is-sql
```

:::tip
Use `contains-sql` instead of `is-sql` to allow responses that contain text with SQL code blocks.
:::

#### Table-Specific SQL Validation

This test ensures the SQL query only uses specified tables (`Products` and `Shipments`).

```yaml
- vars:
    product: apples
    database: file://database.sql
  assert:
    - type: is-sql
      value:
        databaseType: 'MySQL'
        allowedTables:
          - select::null::Products
          - select::null::Shipments
```

The format for allowed notation is ` {type}::{tableName}::{columnName}`, and `null` can be used to allow any.

#### Column-Specific SQL Validation

This test is expected to fail since the `DoesntExist` column is not present in the database:

```yaml
- vars:
    product: oranges
    database: file://database.sql
  assert:
    - type: is-sql
      value:
        databaseType: 'MySQL'
        allowedColumns:
          - select::null::DoesntExist
```

### Step 4: Define the Database Schema

Define the structure of your database in a separate SQL file (`database.sql`).

```sql
CREATE DATABASE IF NOT EXISTS ShipmentSystem;

USE ShipmentSystem;

CREATE TABLE IF NOT EXISTS Products (
    product_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Shipments (
    shipment_id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    shipment_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES Products(product_id)
);

CREATE TABLE IF NOT EXISTS ShipmentDetails (
    detail_id INT AUTO_INCREMENT PRIMARY KEY,
    shipment_id INT NOT NULL,
    location VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (shipment_id) REFERENCES Shipments(shipment_id)
);
```

### Final Configuration

Combine all the steps into a final configuration file (`promptfooconfig.yaml`):

```yaml
description: 'Is-SQL example'

prompts:
  - |
    Output a SQL query that returns the number of {{product}} sold in the last month.

    Database schema:
    {{database}}

    Only output SQL code.

providers:
  - openai:gpt-4o-mini

tests:
  - vars:
      product: bananas
      database: file://database.sql
    assert:
      - type: is-sql

  - vars:
      product: apples
      database: file://database.sql
    assert:
      - type: is-sql
        value:
          databaseType: 'MySQL'
          allowedTables:
            - select::null::Products
            - select::null::Shipments

  - vars:
      product: oranges
      database: file://database.sql
    assert:
      - type: is-sql
        value:
          databaseType: 'MySQL'
          allowedColumns:
            - select::null::DoesntExist
```

## Running Tests

Run your tests:

```
npx promptfoo@latest eval
```

This will generate a summary of outputs in your terminal.

## Review results

Use the web viewer:

```
npx promptfoo@latest view
```

This will open your test results and allow you to refine your prompts and compare model performance.

![text to sql evaluation](/img/docs/text-to-sql-eval.png)
