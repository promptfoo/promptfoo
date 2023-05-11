import * as React from 'react';

import { Slider, Text, Box, MultiSelect, Flex, Paper } from '@mantine/core';

import ResultsTable from './ResultsTable.js';

import { VisibilityState } from '@tanstack/table-core';

import type { EvalRow, EvalHead } from './types.js';

export interface ResultsViewTable {
  head: EvalHead;
  body: EvalRow[];
}

interface ResultsViewProps {
  table: ResultsViewTable;
}

export default function ResultsView({ table }: ResultsViewProps) {
  const [maxTextLength, setMaxTextLength] = React.useState(250);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});

  const { head, body } = table;

  return (
    <div>
      <Paper py="md">
        <Flex gap="md" justify="flex-start" direction="row">
          <Box>
            <MultiSelect
              label="Visible columns"
              placeholder="Select columns to include"
              data={[
                ...head.prompts.map((_, idx) => ({
                  value: `Prompt ${idx + 1}`,
                  label: `Prompt ${idx + 1}`,
                  group: 'Prompts',
                })),
                ...head.vars.map((_, idx) => ({
                  value: `Variable ${idx + 1}`,
                  label: `Variable ${idx + 1}`,
                  group: 'Variables',
                })),
              ]}
              defaultValue={[
                ...head.prompts.map((_, idx) => `Prompt ${idx + 1}`),
                ...head.vars.map((_, idx) => `Variable ${idx + 1}`),
              ]}
              clearButtonProps={{ 'aria-label': 'Clear selection' }}
              clearable
              onChange={(value: string[]) => {
                const allColumns = [
                  ...head.prompts.map((_, idx) => `Prompt ${idx + 1}`),
                  ...head.vars.map((_, idx) => `Variable ${idx + 1}`),
                ];
                const newColumnVisibility: VisibilityState = {};
                allColumns.forEach((col) => {
                  newColumnVisibility[col] = value.includes(col);
                });
                setColumnVisibility(newColumnVisibility);
              }}
            />
          </Box>
          <Box>
            <Text mt="md" size="sm">
              Max text length: {maxTextLength}
            </Text>
            <Slider min={25} max={1000} value={maxTextLength} onChange={setMaxTextLength} />
          </Box>
        </Flex>
      </Paper>
      <ResultsTable
        headers={head}
        data={body}
        maxTextLength={maxTextLength}
        columnVisibility={columnVisibility}
      />
    </div>
  );
}
