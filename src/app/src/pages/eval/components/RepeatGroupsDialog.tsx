import { useRef, useState } from 'react';

import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@app/components/ui/dialog';
import { EVAL_ROUTES } from '@app/constants/routes';
import useApiConfig from '@app/stores/apiConfig';
import { useUserStore } from '@app/stores/userStore';
import { callApi, getApiBaseUrl } from '@app/utils/api';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { EvalRunOutput } from './EvalOutputCell';
import type { CompletedPrompt, EvalTableDTO, RepeatGroupsResponse } from '@promptfoo/types';

const PAGE_SIZE = 20;

function useRepeatPage<T>(path: string) {
  const endpoint = getApiBaseUrl(useApiConfig((state) => state.apiBaseUrl));
  const authVersion = useUserStore((state) => state.authVersion);
  return useQuery<T>({
    queryKey: ['repeat-groups', endpoint, authVersion, path],
    queryFn: async ({ signal }) => {
      const response = await callApi(path, { signal }, endpoint);
      if (!response.ok) {
        throw new Error('Could not load repeated test results.');
      }
      return response.json();
    },
    gcTime: 0,
    retry: false,
  });
}

function PageControls({
  page,
  hasMore,
  onChange,
  label,
}: {
  page: number;
  hasMore: boolean;
  onChange: (page: number) => void;
  label: string;
}) {
  if (!page && !hasMore) {
    return null;
  }
  return (
    <nav aria-label={label} className="flex items-center justify-end gap-3">
      <Button size="sm" variant="outline" disabled={!page} onClick={() => onChange(page - 1)}>
        Previous
      </Button>
      <span>Page {page + 1}</span>
      <Button size="sm" variant="outline" disabled={!hasMore} onClick={() => onChange(page + 1)}>
        Next
      </Button>
    </nav>
  );
}

function promptName(prompt: CompletedPrompt | undefined, index: number) {
  return [prompt?.label || `Prompt ${index + 1}`, prompt?.provider].filter(Boolean).join(' · ');
}

function GroupRuns({ evalId, groupId }: { evalId: string; groupId: string }) {
  const [page, setPage] = useState(0);
  const query = new URLSearchParams({
    repeatGroupId: groupId,
    offset: String(page * PAGE_SIZE),
    limit: String(PAGE_SIZE),
  });
  const { data, isError } = useRepeatPage<EvalTableDTO>(
    `${EVAL_ROUTES.DETAIL(encodeURIComponent(evalId))}/table?${query}`,
  );
  if (isError) {
    return <p role="alert">Could not load runs.</p>;
  }
  if (!data) {
    return <p role="status">Loading runs…</p>;
  }
  const { head, body } = data.table;
  return (
    <div className="space-y-3 overflow-x-auto p-3">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th scope="col">Run</th>
            {head.prompts.map((prompt, index) => (
              <th key={index} scope="col" className="px-2">
                {promptName(prompt, index)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row) => {
            const repeatIndex = row.outputs.find(
              (output) => output?.repeatGroupId === groupId,
            )?.repeatIndex;
            return (
              <tr key={row.testIdx} className="border-t align-top">
                <th scope="row" className="py-2">
                  {repeatIndex === undefined ? '—' : repeatIndex + 1}
                </th>
                {head.prompts.map((_, index) => {
                  const output = row.outputs[index];
                  if (!output) {
                    return (
                      <td key={index} className="p-2">
                        —
                      </td>
                    );
                  }
                  return (
                    <td key={index} className="whitespace-pre-wrap p-2">
                      <EvalRunOutput output={output} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <PageControls
        label="Run pages"
        page={page}
        hasMore={(page + 1) * PAGE_SIZE < data.filteredCount}
        onChange={setPage}
      />
    </div>
  );
}

function GroupList({ evalId, prompts }: { evalId: string; prompts: CompletedPrompt[] }) {
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data, isError } = useRepeatPage<RepeatGroupsResponse>(
    `${EVAL_ROUTES.DETAIL(encodeURIComponent(evalId))}/repeat-groups?offset=${page * PAGE_SIZE}&limit=${PAGE_SIZE}`,
  );
  if (isError) {
    return <p role="alert">Could not load repeated tests.</p>;
  }
  if (!data) {
    return <p role="status">Loading repeated tests…</p>;
  }
  return (
    <>
      {data.groups.length === 0 && <p>No recorded repeat groups.</p>}
      {data.groups.map((group) => {
        const open = expanded === group.id;
        const Chevron = open ? ChevronDown : ChevronRight;
        return (
          <section key={group.id} className="rounded-md border">
            <button
              type="button"
              aria-expanded={open}
              className="w-full cursor-pointer p-3 text-left hover:bg-muted"
              onClick={() => setExpanded(open ? null : group.id)}
            >
              <span className="flex items-center gap-2 font-medium">
                <Chevron className="size-4 shrink-0" />
                {group.description || `Test ${group.firstTestIdx + 1}`}
              </span>
              <span className="pl-6 text-xs text-muted-foreground">{group.id}</span>
              {group.prompts.map((p) => (
                <span key={p.promptIdx} className="block pl-6 text-sm">
                  {promptName(prompts[p.promptIdx], p.promptIdx)} · {p.passed} PASS · {p.failed}{' '}
                  FAIL · {p.errors} ERROR
                </span>
              ))}
            </button>
            {open && <GroupRuns evalId={evalId} groupId={group.id} />}
          </section>
        );
      })}
      <PageControls
        label="Repeated test pages"
        page={page}
        hasMore={data.hasMore}
        onChange={(next) => {
          setExpanded(null);
          setPage(next);
        }}
      />
    </>
  );
}

export default function RepeatGroupsDialog({
  evalId,
  prompts,
}: {
  evalId: string;
  prompts: CompletedPrompt[];
}) {
  const overviewRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Repeated tests
        </Button>
      </DialogTrigger>
      <DialogContent
        ref={overviewRef}
        className="max-w-4xl"
        onEscapeKeyDown={(event) => {
          // A portaled image preview handles its own Escape key.
          const targetDialog =
            event.target instanceof Element && event.target.closest('[role="dialog"]');
          if (targetDialog && targetDialog !== overviewRef.current) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Repeated tests</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Counts include recorded runs across all result pages.
          </p>
        </DialogHeader>
        <GroupList evalId={evalId} prompts={prompts} />
      </DialogContent>
    </Dialog>
  );
}
