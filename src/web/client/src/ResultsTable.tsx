import * as React from 'react';

import './index.css';

import invariant from 'tiny-invariant';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';

import { useStore } from './store.js';

import type { CellContext, VisibilityState } from '@tanstack/table-core';

import type { EvalRow, FilterMode } from './types.js';

import './ResultsTable.css';

interface TruncatedTextProps {
  text: string | number;
  maxLength: number;
}

function TruncatedText({ text: rawText, maxLength }: TruncatedTextProps) {
  const [isTruncated, setIsTruncated] = React.useState<boolean>(true);
  const text = String(rawText);

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
  text: string | number;
  maxTextLength: number;
  rowIndex: number;
  promptIndex: number;
  onRating: (rowIndex: number, promptIndex: number, isPass: boolean) => void;
}

function PromptOutput({ text: rawText, maxTextLength, rowIndex, promptIndex, onRating }: PromptOutputProps) {
  let text = String(rawText);
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
    <>
      <div className="cell">
        {isPass && <div className="status pass">[PASS]</div>}
        {isFail && <div className="status fail">{chunks[0]}</div>}{' '}
        <TruncatedText text={text} maxLength={maxTextLength} />
      </div>
      <div className="cell-rating">
        <span className="rating" onClick={() => handleClick(true)}>
          👍
        </span>
        <span className="rating" onClick={() => handleClick(false)}>
          👎
        </span>
      </div>
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

interface ResultsTableProps {
  maxTextLength: number;
  columnVisibility: VisibilityState;
  wordBreak: 'break-word' | 'break-all';
  filterMode: FilterMode;
  failureFilter: { [key: string]: boolean };
  onFailureFilterToggle: (columnId: string, checked: boolean) => void;
}

export default function ResultsTable({
  maxTextLength,
  columnVisibility,
  wordBreak,
  filterMode,
  failureFilter,
  onFailureFilterToggle,
}: ResultsTableProps) {
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

  const highestPassingIndex = numGood.reduce((maxIndex, currentPassCount, currentIndex, array) => {
    return currentPassCount > array[maxIndex] ? currentIndex : maxIndex;
  }, 0);
  const highestPassingCount = numGood[highestPassingIndex];
  const columnHelper = createColumnHelper<EvalRow>();
  const columns = [
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
          // Minimize the size of Variable columns.
          size: 50,
        }),
      ),
    }),
    columnHelper.group({
      id: 'prompts',
      header: () => <span>Outputs</span>,
      columns: head.prompts.map((prompt, idx) =>
        columnHelper.accessor((row: EvalRow) => row.outputs[idx], {
          id: `Prompt ${idx + 1}`,
          header: () => {
            const pct = ((numGood[idx] / body.length) * 100.0).toFixed(2);
            const isHighestPassing =
              numGood[idx] === highestPassingCount && highestPassingCount !== 0;
            const columnId = `Prompt ${idx + 1}`;
            const isChecked = failureFilter[columnId] || false;
            return (
              <>
                <TableHeader
                  smallText={`Prompt ${idx + 1}`}
                  text={prompt}
                  maxLength={maxTextLength}
                />
                {filterMode === 'failures' && (
                  <FormControlLabel
                    sx={{
                      '& .MuiFormControlLabel-label': {
                        fontSize: '0.75rem',
                      },
                    }}
                    control={
                      <Checkbox
                        checked={isChecked}
                        onChange={(event) => onFailureFilterToggle(columnId, event.target.checked)}
                      />
                    }
                    label="Show failures"
                  />
                )}
                <div className={`summary ${isHighestPassing ? 'highlight' : ''}`}>
                  Passing: <strong>{pct}%</strong> ({numGood[idx]} / {body.length})
                </div>
              </>
            );
          },
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
  ];

  const filteredBody = React.useMemo(() => {
    if (filterMode === 'failures') {
      if (Object.values(failureFilter).every((v) => !v)) {
        return body;
      }
      return body.filter((row) => {
        return row.outputs.some((output, idx) => {
          const columnId = `Prompt ${idx + 1}`;
          const isFail = output.startsWith('[FAIL] ');
          return failureFilter[columnId] && isFail;
        });
      });
    }
    return body;
  }, [body, failureFilter, filterMode]);

  const reactTable = useReactTable({
    data: filteredBody,
    columns,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),

    state: {
      columnVisibility,
    },
  });

  return (
    <table
      style={{
        wordBreak,
      }}
    >
      <thead>
        {reactTable.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id} className="header">
            {headerGroup.headers.map((header) => {
              return (
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
              );
            })}
          </tr>
        ))}
      </thead>
      <tbody>
        {reactTable.getRowModel().rows.map((row, rowIndex) => {
          let colBorderDrawn = false;
          return (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => {
                const isVariableCol = cell.column.id.startsWith('Variable');
                const shouldDrawColBorder = !isVariableCol && !colBorderDrawn;
                if (shouldDrawColBorder) {
                  colBorderDrawn = true;
                }
                const shouldDrawRowBorder = rowIndex === 0 && !isVariableCol;
                return (
                  <td
                    {...{
                      key: cell.id,
                      style: {
                        width: cell.column.getSize(),
                      },
                      className: `${isVariableCol ? 'variable' : ''} ${
                        shouldDrawRowBorder ? 'first-prompt-row' : ''
                      } ${shouldDrawColBorder ? 'first-prompt-col' : ''}`,
                    }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
