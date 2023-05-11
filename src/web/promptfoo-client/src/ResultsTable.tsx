import * as React from 'react';

import './index.css';

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';

import './ResultsTable.css';

import type { CellContext, VisibilityState } from '@tanstack/table-core';

import type { EvalHead, EvalRow } from './types.js';

interface TruncatedTextProps {
  text: string;
  maxLength: number;
}

function TruncatedText({ text, maxLength }: TruncatedTextProps) {
  const [isTruncated, setIsTruncated] = React.useState<boolean>(true);

  const toggleTruncate = () => {
    setIsTruncated(!isTruncated);
  };

  const renderTruncatedText = () => {
    if (text.length <= maxLength) {
      return text;
    }
    if (isTruncated) {
      return (
        <>
          <span style={{ cursor: 'pointer' }} onClick={toggleTruncate}>
            {text.substring(0, maxLength)} ...
          </span>
        </>
      );
    } else {
      return (
        <>
          <span style={{ cursor: 'pointer' }} onClick={toggleTruncate}>
            {text}
          </span>
        </>
      );
    }
  };

  return <div>{renderTruncatedText()}</div>;
}

interface PromptOutputProps {
  text: string;
  maxTextLength: number;
}

function PromptOutput({ text, maxTextLength }: PromptOutputProps) {
  const isPass = text.startsWith('[PASS] ');
  const isFail = text.startsWith('[FAIL] ');
  let chunks: string[] = [];
  if (isPass) {
    text = text.substring(7);
  } else if (isFail) {
    chunks = text.split('\n---\n');
    text = chunks.slice(1).join('\n---\n');
  }
  return (
    <>
      {isPass && <span className="pass">[PASS]</span>}
      {isFail && <div className="fail">{chunks[0]}</div>}{' '}
      <TruncatedText text={text} maxLength={maxTextLength} />
    </>
  );
}

function TableHeader({ text, maxLength, smallText }: TruncatedTextProps & { smallText: string }) {
  return (
    <div>
      <TruncatedText text={text} maxLength={maxLength} />
      <span className="smalltext">{smallText}</span>
    </div>
  );
}

interface ResultsViewProps {
  headers: EvalHead;
  data: EvalRow[];
  maxTextLength: number;
  columnVisibility: VisibilityState;
}

export default function ResultsTable({
  headers,
  data,
  maxTextLength,
  columnVisibility,
}: ResultsViewProps) {
  // TODO(ian): Correctly plumb through the results instead of parsing the string.
  const numGood = headers.prompts.map((_, idx) =>
    data.reduce((acc, row) => {
      return acc + (row.outputs[idx].startsWith('[PASS]') ? 1 : 0);
    }, 0),
  );
  const numBad = headers.prompts.map((_, idx) =>
    data.reduce((acc, row) => {
      return acc + (row.outputs[idx].startsWith('[FAIL]') ? 1 : 0);
    }, 0),
  );

  console.log(headers);
  console.log(data)

  const columnHelper = createColumnHelper<EvalRow>();
  const columns = [
    columnHelper.group({
      id: 'prompts',
      header: () => <span>Prompts</span>,
      columns: headers.prompts.map((prompt, idx) =>
        columnHelper.accessor((row: EvalRow) => row.outputs[idx], {
          id: `Prompt ${idx + 1}`,
          header: () => (
            <>
              <TableHeader
                smallText={`Prompt ${idx + 1}`}
                text={prompt}
                maxLength={maxTextLength}
              />
              {numGood[idx]} / {numGood[idx] + numBad[idx]} passing
            </>
          ),
          cell: (info: CellContext<EvalRow, string>) => (
            <PromptOutput text={info.getValue()} maxTextLength={maxTextLength} />
          ),
        }),
      ),
    }),
    columnHelper.group({
      id: 'vars',
      header: () => <span>Variables</span>,
      columns: headers.vars.map((varName, idx) =>
        columnHelper.accessor((row: EvalRow) => row.vars[idx], {
          id: `Variable ${idx + 1}`,
          header: () => (
            <TableHeader
              smallText={`Variable ${idx + 1}`}
              text={varName}
              maxLength={maxTextLength}
            />
          ),
          cell: (info: CellContext<EvalRow, string>) => (
            <TruncatedText text={info.getValue()} maxLength={maxTextLength} />
          ),
        }),
      ),
    }),
  ];

  const table = useReactTable({
    data,
    columns,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),

    state: {
      columnVisibility,
    },
  });

  return (
    <table>
      <thead>
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <th
                {...{
                  key: header.id,
                  colSpan: header.colSpan,
                  style: {
                    width: header.getSize(),
                  },
                }}
              >
                {header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext())}
                <div
                  {...{
                    onMouseDown: header.getResizeHandler(),
                    onTouchStart: header.getResizeHandler(),
                    className: `resizer ${header.column.getIsResizing() ? 'isResizing' : ''}`,
                  }}
                />
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td
                {...{
                  key: cell.id,
                  style: {
                    width: cell.column.getSize(),
                  },
                }}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
