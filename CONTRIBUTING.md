# Contributing

## Database

Promptfoo uses SQLite as its default database, managed through the Drizzle ORM. By default, the database is stored in `/.promptfoo/`. You can override this location by setting `PROMPTFOO_CONFIG_DIR`. The database schema is defined in `src/database.ts` and migrations are stored in `drizzle`. Note that the migrations are all generated and you should not access these files directly.

### Main Tables

#### `evals` - Stores evaluation details

- `id`: Primary key, unique identifier for each evaluation.
- `createdAt`: Timestamp when the evaluation was created.
- `author`: Author of the evaluation. This is set by `promptfoo config set email <email>`.
- `description`: Description of the evaluation set from the description tag in `promptfooconfig.yaml`.
- `results`: JSON object storing evaluation results.
- `config`: JSON object storing partial unified configuration.
- `version`: Promptfoo version from when the evaluation was run.

#### `prompts` - Stores information about different prompts

- `id`: Primary key, unique identifier for each prompt.
- `createdAt`: Timestamp when the prompt was created.
- `prompt`: Text of the prompt. This is typically a nunjucks template string but may be the source code of a function.

#### `datasets` - Stores dataset information

- `id`: Primary key, unique identifier for each dataset.
- `tests`: JSON object storing tests configuration.
- `createdAt`: Timestamp when the dataset was created.

#### `evalsToPrompts` - Many-to-many relationship between `evals` and `prompts`

- `evalId`: Foreign key referencing `evals.id`.
- `promptId`: Foreign key referencing `prompts.id`.
- Primary Key: Composite key of `evalId` and `promptId`.

#### `evalsToDatasets` - Many-to-many relationship between `evals` and `datasets`

- `evalId`: Foreign key referencing `evals.id`.
- `datasetId`: Foreign key referencing `datasets.id`.
- Primary Key: Composite key of `evalId` and `datasetId`.

You can view the contents of each of these tables by running `npx drizzle-kit studio`, which will start a web server.

### Adding a Migration

1. **Modify Schema**: Make changes to your schema in `src/database.ts`.
2. **Generate Migration**: Run the command to create a new migration:

   ```sh
   drizzle generate
   ```

   This command will create a new SQL file in the `drizzle` directory.

3. **Review Migration**: Inspect the generated migration file to ensure it captures your intended changes.
4. **Apply Migration**: Apply the migration with:

   ```sh
   npx ts-node src/migrate.ts
   ```

#### Best Practices

1. **Review Generated Migrations**: Always review generated migration files before applying them.
2. **Keep Migrations Small**: Focus migrations on specific changes to keep them manageable.
3. **Test in Development**: Test migrations in a development environment before applying them to production.
4. **Backup Your Database**: Back up your database before applying migrations in production.
