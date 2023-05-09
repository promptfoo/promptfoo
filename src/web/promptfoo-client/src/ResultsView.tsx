import * as React from 'react';

import './index.css';

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';

import './ResultsView.css';

import type { CellContext, HeaderContext } from '@tanstack/table-core';

type EvalHead = {
  prompts: string[];
  vars: string[];
};

type EvalRow = {
  outputs: string[]; // var inputs
  vars: string[]; // model outputs
};

type EvalTable = {
  head: EvalHead[];
  body: EvalRow[];
};

const MAX_TEXT_LENGTH = 250;

const defaultData: EvalRow[] = [
  {
    outputs: [
      'Renewable energy has revolutionized power generation by reducing reliance on fossil fuels, leading to changes in work processes and lifestyles of people in the industry towards more sustainable practices.',
      'Renewable Energy has transformed Power generation by providing a sustainable and clean source of energy, which has improved the daily lives of individuals involved in that field by reducing pollution, creating job opportunities, and promoting energy independence.',
      'Renewable energy has revolutionized the power generation sector by providing a sustainable and environmentally friendly alternative to traditional fossil fuels, leading to a shift towards cleaner energy sources and a more sustainable way of living and working.',
    ],
    vars: [
      'Renewable Energy',
      'Power generation',
      '"Mentions ""clean"" or ""sustainable"\n" References lifestyle"',
    ],
  },
  {
    outputs: [
      '[FAIL] Does not describe specifics\n---\nRobotics has greatly improved the efficiency and accuracy of logistics operations, leading to faster delivery times, reduced costs, and increased customer satisfaction.',
      'The integration of robotics in logistics has revolutionized the industry by increasing efficiency, reducing costs, and changing the nature of work for employees.',
      'Robotics has transformed logistics by increasing efficiency, reducing costs, and improving safety, ultimately improving the daily lives of individuals involved in the field by allowing them to focus on higher-level tasks and reducing the risk of injury.',
    ],
    vars: ['Robotics', 'Logistics', 'Describes specific impact on employees'],
  },
  {
    outputs: [
      'Biotech has revolutionized environmental conservation by providing innovative solutions for sustainable agriculture, waste management, and renewable energy, leading to a more efficient and eco-friendly way of living and working in this sector.',
      'Biotech has transformed environmental conservation by providing innovative solutions for sustainable agriculture, waste management, and pollution control, improving the daily lives of individuals involved in the field by creating a cleaner and healthier environment.',
      'Biotech has had a significant influence on environmental conservation by introducing innovative solutions and technologies that have transformed work processes and lifestyles in the industry.',
    ],
    vars: [
      'Biotech',
      'Environmental Conservation',
      'Refers to a specific environmental conservation effort',
    ],
  },
];

const evalHead: EvalHead = {
  prompts: [
    'Describe the impact of {{technology}} on {{industry}} and how it has revolutionized the way people work and live in this sector.',
    'Explain how {{technology}} has transformed {{industry}} and the ways in which it has improved the daily lives of individuals involved in that field.',
    'Discuss the influence of {{technology}} on {{industry}} and the significant changes it has brought about in the work processes and lifestyles of people in the industry.',
  ],
  vars: ['technology', 'industry', '__expected'],
};

const columnHelper = createColumnHelper<EvalRow>();
const columns = [
  columnHelper.group({
    id: 'prompts',
    header: () => <span>Prompts</span>,
    columns: evalHead.prompts.map((prompt, idx) =>
      columnHelper.accessor((row: EvalRow) => row.outputs[idx], {
        id: `Prompt ${idx + 1}`,
        header: () => <TruncatedText text={prompt} maxLength={MAX_TEXT_LENGTH} />,
        cell: (info: CellContext<EvalRow, string>) => <PromptOutput text={info.getValue()} />,
      }),
    ),
  }),
  columnHelper.group({
    id: 'vars',
    header: () => <span>Variables</span>,
    columns: evalHead.vars.map((varName, idx) =>
      columnHelper.accessor((row: EvalRow) => row.vars[idx], {
        id: `Variable ${idx + 1}`,
        header: varName,
        cell: (info: CellContext<EvalRow, string>) => <TruncatedText text={info.getValue()} maxLength={MAX_TEXT_LENGTH} />,
      }),
    ),
  }),
];

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
}

function PromptOutput({ text }: PromptOutputProps) {
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
      {isFail && <div className="fail">{chunks[0]}</div>}
      {' '}
      <TruncatedText text={text} maxLength={MAX_TEXT_LENGTH} />
    </>
  );
}

export default function ResultsView() {
  const [data, setData] = React.useState(() => [...defaultData]);
  const [columnVisibility, setColumnVisibility] = React.useState({})

  const [maxTextLength, setMaxTextLength] = React.useState<number>(MAX_TEXT_LENGTH);

  const table = useReactTable({
    data,
    columns,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),

    state: {
      columnVisibility,
    },
    onColumnVisibilityChange: setColumnVisibility,

    debugTable: true,
    debugHeaders: true,
    debugColumns: true,
  });

  return (
    <div>
      <div className="p-2">
        <div className="inline-block border border-black shadow rounded">
          <div className="px-1 border-b border-black">
            <label>
              <input
                {...{
                  type: 'checkbox',
                  checked: table.getIsAllColumnsVisible(),
                  onChange: table.getToggleAllColumnsVisibilityHandler(),
                }}
              />{' '}
              Toggle All
            </label>
          </div>
          {table.getAllLeafColumns().map((column) => {
            return (
              <div key={column.id} className="px-1">
                <label>
                  <input
                    {...{
                      type: 'checkbox',
                      checked: column.getIsVisible(),
                      onChange: column.getToggleVisibilityHandler(),
                    }}
                  />{' '}
                  {column.id}
                </label>
              </div>
            );
          })}
        </div>
      </div>
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
    </div>
  );
}
