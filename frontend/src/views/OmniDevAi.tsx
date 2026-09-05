import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BrainCircuit, Send, Trash2, Copy, Check, Sparkles,
  ShieldCheck, AlertTriangle, User, Bot, RefreshCw,
} from 'lucide-react';
import { useOrg } from '@/lib/org';
import {
  askOmniDevStream, OmniDevNotConfiguredError, OmniDevUnreachableError, OmniDevQuotaError,
  type OmniDevMessage,
} from '@/lib/omnidev';

const STORAGE_KEY = 'scrivia_copilot_thread';

const SUGGESTED_PROMPTS = [
  'Generate a salary differential letter for an employee',
  'Explain how GSIS, PhilHealth, Pag-IBIG deductions are computed',
  'How do I run the Regular Payroll for my division?',
  'Search for all employees with duplicate STACODEs',
  'Create a memo for payroll adjustment approval',
  'Walk me through the DBF export flow',
  'What are the BIR tax brackets for 2026?',
  'Generate a leave without pay (LWOP) notice letter',
];

interface ThreadMsg extends OmniDevMessage {
  id: string;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function loadThread(): ThreadMsg[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OmniDevMessage[];
    return Array.isArray(parsed) ? parsed.map((m) => ({ ...m, id: makeId() })) : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* ChatGPT-style markdown rendering                                    */
/* ------------------------------------------------------------------ */

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <div className="my-3 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-950 dark:bg-slate-900">
      <div className="flex items-center justify-between pl-4 pr-2 py-1.5 bg-slate-900 dark:bg-slate-800/80 border-b border-slate-800">
        <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">{lang}</span>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy code'}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed text-slate-100 font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Markdown({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => {
            const match = /language-([\w-]+)/.exec(className ?? '');
            const isBlock = match || String(children).includes('\n');
            if (isBlock) {
              return (
                <CodeBlock
                  lang={match?.[1] ?? 'text'}
                  code={String(children).replace(/\n$/, '')}
                />
              );
            }
            return (
              <code className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[12.5px] font-mono text-rose-600 dark:text-rose-400 border border-slate-200 dark:border-slate-700">
                {children}
              </code>
            );
          },
          h1: ({ children }) => (
            <h1 className="text-xl font-bold text-slate-900 dark:text-white mt-5 mb-2">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-5 mb-2">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-slate-900 dark:text-white mt-4 mb-1.5">{children}</h3>
          ),
          p: ({ children }) => <p className="my-2.5">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-slate-900 dark:text-white">{children}</strong>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-aurora-600 dark:text-aurora-400 underline underline-offset-2 hover:text-aurora-700 dark:hover:text-aurora-300"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="my-2.5 list-disc pl-5 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="my-2.5 list-decimal pl-5 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-4 border-aurora-300 dark:border-aurora-700 pl-4 py-0.5 text-slate-500 dark:text-slate-400 italic">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-slate-200 dark:border-slate-700" />,
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="min-w-full text-[13px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-slate-50 dark:bg-slate-800/60">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 align-top">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-sm">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main view                                                           */
/* ------------------------------------------------------------------ */

export default function OmniDevAi() {
  const { scopedCodes, selectedDivision, selectedRegion } = useOrg();
  const [thread, setThread] = useState<ThreadMsg[]>(loadThread);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  // Note: notConfigured, unreachable, and quotaExceeded are kept for
  // backward compatibility but the built-in copilot never triggers them.
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<ThreadMsg[]>(thread);
  threadRef.current = thread;

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(threadRef.current.map(({ role, content }) => ({ role, content }))),
      );
    } catch { /* ignore quota */ }
  }, [thread]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [thread, busy]);

  const org = useMemo(() => ({
    scoped: scopedCodes != null && scopedCodes.length > 0,
    regionName: selectedRegion?.region_name ?? null,
    divisionName: selectedDivision?.division_name ?? null,
    regcode: scopedCodes && scopedCodes.length > 0 ? scopedCodes[0].regcode : null,
    divcode: scopedCodes && scopedCodes.length > 0 ? scopedCodes[0].divcode : null,
  }), [scopedCodes, selectedDivision, selectedRegion]);

  const send = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    setError(null);
    setNotConfigured(false);
    setUnreachable(false);
    setQuotaExceeded(false);

    const userMsg: ThreadMsg = { id: makeId(), role: 'user', content };
    const assistantId = makeId();
    setThread((prev) => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '' }]);
    setInput('');
    setBusy(true);

    const history = [...threadRef.current, userMsg].map(({ role, content: c }) => ({ role, content: c }));
    try {
      const finalReply = await askOmniDevStream(history, org, (acc) => {
        setThread((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m)));
      });
      setThread((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: finalReply } : m)));
    } catch (err) {
      if (err instanceof OmniDevNotConfiguredError) {
        setNotConfigured(true);
      } else if (err instanceof OmniDevUnreachableError) {
        setUnreachable(true);
      } else if (err instanceof OmniDevQuotaError) {
        setQuotaExceeded(true);
      } else {
        setError(err instanceof Error ? err.message : 'OmniDev AI hit an error. Please try again.');
      }
      // Drop the empty placeholder so the interrupted exchange doesn't linger.
      setThread((prev) => prev.filter((m) => !(m.id === assistantId && m.content === '')));
    } finally {
      setBusy(false);
    }
  }, [busy, org]);

  function handleSend() {
    if (!input.trim() || busy) return;
    void send(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function copyMessage(id: string, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1600);
    } catch { /* clipboard unavailable */ }
  }

  const scopeChip = org.scoped ? (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-aurora-50 dark:bg-aurora-900/30 text-aurora-800 dark:text-aurora-200 border border-aurora-200 dark:border-aurora-800 text-xs font-medium">
      <ShieldCheck className="w-3.5 h-3.5" />
      {org.divisionName ?? org.regionName ?? 'Scoped'}
      {org.regcode && (
        <span className="font-mono text-[10px] text-aurora-600 dark:text-aurora-300">
          {org.regcode}{org.divcode ? ` · ${org.divcode}` : ''}
        </span>
      )}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-medium">
      <ShieldCheck className="w-3.5 h-3.5" />
      All Divisions (Super Admin)
    </span>
  );

  const lastAssistant = [...thread].reverse().find((m) => m.role === 'assistant');
  const showTyping = busy && thread.length > 0 && thread[thread.length - 1]?.content === '';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Search, analyze, and generate — your built-in AI for payroll, letters, and employee data.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {scopeChip}
          {thread.length > 0 && (
            <button
              onClick={() => { setThread([]); setError(null); setNotConfigured(false); setUnreachable(false); setQuotaExceeded(false); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              title="Clear conversation"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Built-in copilot — no edge function needed */}

      {error && <ErrorLine>{error}</ErrorLine>}

      {/* Chat card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden flex flex-col">
        {/* Thread */}
        <div ref={scrollRef} className="h-[56vh] min-h-[420px] overflow-y-auto">
          {thread.length === 0 && !busy ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-aurora-500/15 to-nexora-500/15 border border-aurora-200/60 dark:border-aurora-800/40 flex items-center justify-center mb-4">
                <Sparkles className="w-8 h-8 text-aurora-600 dark:text-aurora-300" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                Payroll Copilot — AI Search Engine
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md">
                Search employee data, generate letters, analyze payroll — ask anything.
              </p>
              <div className="flex flex-wrap justify-center gap-2 mt-5 max-w-2xl">
                {SUGGESTED_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => void send(p)}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-full text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-aurora-300 dark:hover:border-aurora-700 hover:text-aurora-700 dark:hover:text-aurora-300 transition-colors disabled:opacity-50"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 space-y-5">
              <AnimatePresence initial={false}>
                {thread.map((m) => {
                  if (m.role === 'assistant' && m.content === '') return null;
                  const isUser = m.role === 'user';
                  return (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25 }}
                      className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        isUser
                          ? 'bg-deped-700 text-white'
                          : 'bg-gradient-to-br from-nexora-600 to-deped-700 text-white'
                      }`}>
                        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                      </div>
                      {isUser ? (
                        <div className="max-w-[85%] sm:max-w-[75%] bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-tr-sm px-4 py-2.5">
                          <p className="text-sm whitespace-pre-wrap leading-relaxed text-slate-800 dark:text-slate-100">
                            {m.content}
                          </p>
                        </div>
                      ) : (
                        <div className="min-w-0 flex-1 group">
                          <Markdown content={m.content} />
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              onClick={() => copyMessage(m.id, m.content)}
                              className="inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500 hover:text-aurora-600 dark:hover:text-aurora-300 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              {copiedId === m.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              {copiedId === m.id ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {/* Typing indicator */}
              {showTyping && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-nexora-600 to-deped-700 text-white flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="px-1 py-2.5 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-aurora-400 animate-bounce" />
                    <span className="w-2 h-2 rounded-full bg-aurora-400 animate-bounce [animation-delay:120ms]" />
                    <span className="w-2 h-2 rounded-full bg-aurora-400 animate-bounce [animation-delay:240ms]" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-slate-200 dark:border-slate-800 p-3 sm:p-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder="Search, ask, or generate — try: 'Create a salary adjustment letter'…  (Enter to send)"
                className="flex-1 resize-none max-h-32 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-aurora-500/30 focus:border-aurora-500 transition-all"
              />
              <button
                onClick={handleSend}
                disabled={busy || !input.trim()}
                className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-aurora-500 to-nexora-600 text-white shadow-aurora hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                title="Send"
              >
                {busy ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2 flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-aurora-500" />
              Answers are generated by AI from system knowledge and your current division scope — always verify against official records before acting.
            </p>
          </div>
        </div>
      </div>

      {/* Status footer */}
      {lastAssistant && (
        <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500 px-1">
          <span>{thread.length} message{thread.length === 1 ? '' : 's'} · thread saved on this device</span>
          <span className="font-mono">AI search engine · PostgreSQL RPC</span>
        </div>
      )}
    </div>
  );
}
