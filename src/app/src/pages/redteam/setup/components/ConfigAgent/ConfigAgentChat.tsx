import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@app/components/ui/button';
import { Input } from '@app/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  SendHorizontal,
} from 'lucide-react';

import type { AgentMessage, DiscoveredConfig } from '../../hooks/useConfigAgent';

interface ConfigAgentChatProps {
  messages: AgentMessage[];
  isLoading: boolean;
  onSendMessage: (message: string) => void;
  onSelectOption: (optionId: string) => void;
  onSubmitApiKey: (apiKey: string, field?: string) => void;
}

export default function ConfigAgentChat({
  messages,
  isLoading,
  onSendMessage,
  onSelectOption,
  onSubmitApiKey,
}: ConfigAgentChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  const lastMessage = messages[messages.length - 1];
  const inputRequest = lastMessage?.metadata?.inputRequest;
  const quickOptions = lastMessage?.metadata?.options;
  const isApiKeyMode = inputRequest?.type === 'api_key';

  // biome-ignore lint/correctness/useExhaustiveDependencies: message count is the scroll trigger
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSendMessage = useCallback(() => {
    const message = inputValue.trim();
    if (!message) {
      return;
    }

    onSendMessage(message);
    setInputValue('');
  }, [inputValue, onSendMessage]);

  const handleSubmitApiKey = useCallback(() => {
    const apiKey = apiKeyValue.trim();
    if (!apiKey) {
      return;
    }

    onSubmitApiKey(apiKey, inputRequest?.field);
    setApiKeyValue('');
    setShowApiKey(false);
  }, [apiKeyValue, inputRequest?.field, onSubmitApiKey]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== 'Enter' || event.shiftKey) {
        return;
      }

      event.preventDefault();
      if (isApiKeyMode) {
        handleSubmitApiKey();
      } else {
        handleSendMessage();
      }
    },
    [handleSendMessage, handleSubmitApiKey, isApiKeyMode],
  );

  const handleToggleApiKeyVisibility = useCallback(() => {
    setShowApiKey((visible) => !visible);
    inputRef.current?.focus();
  }, []);

  return (
    <TooltipProvider delayDuration={0}>
      <section className="flex h-full min-h-0 flex-col bg-muted/20">
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {isLoading && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>

        {quickOptions && quickOptions.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pb-3">
            {quickOptions.map((option) => (
              <Button
                key={option.id}
                type="button"
                size="sm"
                variant={option.primary ? 'default' : 'outline'}
                onClick={() => onSelectOption(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        )}

        <div
          className={cn(
            'border-t border-border bg-background p-4',
            isApiKeyMode &&
              'border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/20',
          )}
        >
          {isApiKeyMode && (
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
              <KeyRound className="size-3.5" />
              Secure input
            </div>
          )}

          <div className="relative">
            <Input
              ref={inputRef}
              type={isApiKeyMode && !showApiKey ? 'password' : 'text'}
              placeholder={
                isApiKeyMode
                  ? inputRequest.placeholder || 'Enter API key...'
                  : 'Type a message... (Enter to send)'
              }
              value={isApiKeyMode ? apiKeyValue : inputValue}
              onChange={(event) =>
                isApiKeyMode
                  ? setApiKeyValue(event.target.value)
                  : setInputValue(event.target.value)
              }
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              autoComplete="off"
              className={cn('h-11 rounded-full pr-20', isApiKeyMode && 'border-amber-300')}
            />
            <div className="absolute inset-y-0 right-1 flex items-center gap-1">
              {isApiKeyMode && (
                <IconButton
                  label={showApiKey ? 'Hide' : 'Show'}
                  onClick={handleToggleApiKeyVisibility}
                >
                  {showApiKey ? <EyeOff /> : <Eye />}
                </IconButton>
              )}
              <IconButton
                label="Send"
                onClick={isApiKeyMode ? handleSubmitApiKey : handleSendMessage}
                disabled={isLoading || (isApiKeyMode ? !apiKeyValue.trim() : !inputValue.trim())}
                emphasized
              >
                <SendHorizontal />
              </IconButton>
            </div>
          </div>
        </div>
      </section>
    </TooltipProvider>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 pl-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-1 rounded-md bg-primary/10 px-3 py-2">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="size-1.5 animate-pulse rounded-full bg-primary"
            style={{ animationDelay: `${index * 120}ms` }}
          />
        ))}
      </div>
      <span className="font-mono">analyzing...</span>
    </div>
  );
}

function MessageBubble({ message }: { message: AgentMessage }) {
  if (message.type === 'status') {
    return (
      <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-primary" />
        <span className="font-mono">{message.content}</span>
      </div>
    );
  }

  const isUser = message.type === 'user';
  const labeled = ['discovery', 'success', 'error'].includes(message.type);

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <article
        className={cn(
          'max-w-[88%] rounded-md border bg-card p-3 text-sm leading-6 shadow-sm',
          getMessageClassName(message.type),
          isUser ? 'border-r-2' : 'border-l-2',
        )}
      >
        {!isUser && labeled && (
          <div
            className={cn(
              'mb-1 text-[11px] font-semibold uppercase',
              getLabelClassName(message.type),
            )}
          >
            {getMessageLabel(message.type)}
          </div>
        )}
        <div className="whitespace-pre-wrap text-foreground">
          {renderFormattedText(message.content)}
        </div>

        {message.metadata?.discoveredConfig && (
          <ConfigPreview config={message.metadata.discoveredConfig} />
        )}
      </article>
    </div>
  );
}

function getMessageClassName(type: AgentMessage['type']): string {
  switch (type) {
    case 'user':
      return 'border-primary/30 bg-primary/5';
    case 'discovery':
      return 'border-sky-500/30 bg-sky-50/70 dark:bg-sky-950/20';
    case 'success':
      return 'border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/20';
    case 'error':
      return 'border-destructive/30 bg-destructive/5';
    default:
      return 'border-border';
  }
}

function getLabelClassName(type: AgentMessage['type']): string {
  switch (type) {
    case 'discovery':
      return 'text-sky-700 dark:text-sky-300';
    case 'success':
      return 'text-emerald-700 dark:text-emerald-300';
    case 'error':
      return 'text-destructive';
    default:
      return 'text-muted-foreground';
  }
}

function getMessageLabel(type: AgentMessage['type']): string {
  switch (type) {
    case 'discovery':
      return 'Discovery';
    case 'success':
      return 'Success';
    case 'error':
      return 'Error';
    default:
      return '';
  }
}

function ConfigPreview({ config }: { config: Partial<DiscoveredConfig> }) {
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const configJson = JSON.stringify(config, null, 2);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(configJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable in embedded browser contexts.
    }
  }, [configJson]);

  return (
    <section className="mt-3">
      <div className="mb-2 flex items-center justify-between">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-1 text-xs text-muted-foreground"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronDown /> : <ChevronRight />}
          Configuration
        </Button>
        {expanded && (
          <IconButton label={copied ? 'Copied!' : 'Copy JSON'} onClick={handleCopy}>
            {copied ? <Check /> : <Copy />}
          </IconButton>
        )}
      </div>

      {expanded && (
        <div className="overflow-hidden rounded-md border border-border">
          <div className="border-b border-border bg-muted/40 px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
            config.json
          </div>
          <pre className="max-h-60 overflow-auto bg-zinc-950 p-3 font-mono text-xs leading-5 text-zinc-100 dark:bg-zinc-950">
            <SyntaxHighlightedJson json={configJson} />
          </pre>
        </div>
      )}
    </section>
  );
}

function IconButton({
  children,
  disabled = false,
  emphasized = false,
  label,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  emphasized?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant={emphasized ? 'default' : 'ghost'}
          className={cn('size-8 rounded-full', !emphasized && 'text-muted-foreground')}
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function SyntaxHighlightedJson({ json }: { json: string }) {
  const tokenPattern =
    /"(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|true|false|null|[{}[\],:]/gi;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(json)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(json.slice(lastIndex, match.index));
    }

    const token = match[0];
    nodes.push(
      <span
        key={`${match.index}-${token}`}
        className={getJsonTokenClassName(token, json, match.index)}
      >
        {token}
      </span>,
    );
    lastIndex = tokenPattern.lastIndex;
  }

  if (lastIndex < json.length) {
    nodes.push(json.slice(lastIndex));
  }

  return <code>{nodes}</code>;
}

function getJsonTokenClassName(token: string, json: string, index: number): string {
  if (token.startsWith('"')) {
    return /^\s*:/.test(json.slice(index + token.length)) ? 'text-sky-300' : 'text-blue-200';
  }
  if (/^-?\d/.test(token)) {
    return 'text-cyan-200';
  }
  if (token === 'true' || token === 'false' || token === 'null') {
    return 'text-rose-300';
  }
  return 'text-zinc-400';
}

function renderFormattedText(text: string): React.ReactNode[] {
  return text.split('\n').flatMap((line, lineIndex) => {
    const nodes = renderInlineText(line, `line-${lineIndex}`);
    return lineIndex === 0 ? nodes : [<br key={`break-${lineIndex}`} />, ...nodes];
  });
}

function renderInlineText(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const tokenPattern = /(\*\*.+?\*\*|`.+?`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(<strong key={`${keyPrefix}-${match.index}`}>{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(
        <code
          key={`${keyPrefix}-${match.index}`}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    lastIndex = tokenPattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}
