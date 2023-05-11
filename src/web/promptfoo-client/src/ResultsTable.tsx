import * as React from 'react';

import './index.css';

import invariant from 'tiny-invariant';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';

import { useStore } from './store.js';

import type { CellContext, VisibilityState } from '@tanstack/table-core';

import type { EvalRow } from './types.js';

import './ResultsTable.css';

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
  rowIndex: number;
  promptIndex: number;
  onRating: (rowIndex: number, promptIndex: number, isPass: boolean) => void;
}

function PromptOutput({ text, maxTextLength, rowIndex, promptIndex, onRating }: PromptOutputProps) {
  const isPass = text.startsWith('[PASS] ');
  const isFail = text.startsWith('[FAIL] ');
  let chunks: string[] = [];
  if (isPass) {
    text = text.substring(7);
  } else if (isFail) {
    if (text.includes('---')) {
      chunks = text.split('---');
      text = chunks.slice(1).join('---');
    } else {
      chunks = ['[FAIL]'];
      if (text.startsWith('[FAIL] ')) {
        text = text.substring(7);
      }
    }
  }

  const handleClick = (isPass: boolean) => {
    onRating(rowIndex, promptIndex, isPass);
  };

  return (
    <div className="cell">
      {isPass && <div className="status pass">[PASS]</div>}
      {isFail && <div className="status fail">{chunks[0]}</div>}{' '}
      <TruncatedText text={text} maxLength={maxTextLength} />
      <div className="cell-rating">
        <span className="rating" onClick={() => handleClick(true)}>
          👍
        </span>
        <span className="rating" onClick={() => handleClick(false)}>
          👎
        </span>
      </div>
    </div>
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
  maxTextLength: number;
  columnVisibility: VisibilityState;
}

export default function ResultsTable({ maxTextLength, columnVisibility }: ResultsViewProps) {
  const { table, setTable } = useStore();
  invariant(table, 'Table should be defined');
  const { head, body } = table;
  // TODO(ian): Correctly plumb through the results instead of parsing the string.
  const numGood = head.prompts.map((_, idx) =>
    body.reduce((acc, row) => {
      return acc + (row.outputs[idx].startsWith('[PASS]') ? 1 : 0);
    }, 0),
  );

  const handleRating = (rowIndex: number, promptIndex: number, isPass: boolean) => {
    const updatedData = [...body];
    const updatedRow = { ...updatedData[rowIndex] };
    const updatedOutputs = [...updatedRow.outputs];
    const updatedOutput = isPass
      ? `[PASS] ${updatedOutputs[promptIndex].replace(/^\[(PASS|FAIL)\] /, '')}`
      : `[FAIL] ${updatedOutputs[promptIndex].replace(/^\[(PASS|FAIL)\] /, '')}`;
    updatedOutputs[promptIndex] = updatedOutput;
    updatedRow.outputs = updatedOutputs;
    updatedData[rowIndex] = updatedRow;
    setTable({
      head,
      body: updatedData,
    });
  };

  const columnHelper = createColumnHelper<EvalRow>();
  const columns = [
    columnHelper.group({
      id: 'prompts',
      header: () => <span>Prompts</span>,
      columns: head.prompts.map((prompt, idx) =>
        columnHelper.accessor((row: EvalRow) => row.outputs[idx], {
          id: `Prompt ${idx + 1}`,
          header: () => (
            <>
              <TableHeader
                smallText={`Prompt ${idx + 1}`}
                text={prompt}
                maxLength={maxTextLength}
              />
              {numGood[idx]} / {body.length} 👍
            </>
          ),
          cell: (info: CellContext<EvalRow, string>) => (
            <PromptOutput
              text={info.getValue()}
              maxTextLength={maxTextLength}
              rowIndex={info.row.index}
              promptIndex={idx}
              onRating={handleRating}
            />
          ),
        }),
      ),
    }),
    columnHelper.group({
      id: 'vars',
      header: () => <span>Variables</span>,
      columns: head.vars.map((varName, idx) =>
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

  const reactTable = useReactTable({
    data: body,
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
        {reactTable.getHeaderGroups().map((headerGroup) => (
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
        {reactTable.getRowModel().rows.map((row) => (
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
