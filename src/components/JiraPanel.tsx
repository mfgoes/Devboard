import { useState, useEffect, useCallback } from 'react';
import { useBoardStore } from '../store/boardStore';
import { toast } from '../utils/toast';

// ── localStorage keys ────────────────────────────────────────────────────────
const LS_JIRA_DOMAIN = 'devboard-jira-domain';
const LS_JIRA_EMAIL  = 'devboard-jira-email';
const LS_JIRA_TOKEN  = 'devboard-jira-token';

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    priority?: { name: string };
    issuetype?: { name: string };
    assignee?: { displayName: string } | null;
    labels?: string[];
  };
}

// Priority → sticky color mapping
const PRIORITY_COLORS: Record<string, string> = {
  Highest:  '#fca5a5', // red
  High:     '#fdba74', // orange
  Medium:   '#fde68a', // yellow
  Low:      '#bbf7d0', // green
  Lowest:   '#bfdbfe', // blue
};

function statusBadgeColor(status: string): string {
  const s = status.toLowerCase();
  if (s === 'done' || s === 'closed' || s === 'resolved') return '#22c55e';
  if (s.includes('progress') || s === 'review') return 'var(--c-line)';
  return '#a1a1aa';
}

function generateId() { return Math.random().toString(36).slice(2, 11); }

export default function JiraPanel({ onClose }: { onClose: () => void }) {
  const [domain, setDomain]   = useState(() => localStorage.getItem(LS_JIRA_DOMAIN) ?? '');
  const [email, setEmail]     = useState(() => localStorage.getItem(LS_JIRA_EMAIL) ?? '');
  const [token, setToken]     = useState(() => localStorage.getItem(LS_JIRA_TOKEN) ?? '');
  const [showSetup, setShowSetup] = useState(() => !localStorage.getItem(LS_JIRA_TOKEN));

  const [jql, setJql]         = useState('assignee = currentUser() AND resolution = Unresolved ORDER BY priority DESC');
  const [issues, setIssues]   = useState<JiraIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const addNode    = useBoardStore((s) => s.addNode);
  const camera     = useBoardStore((s) => s.camera);
  const saveHistory = useBoardStore((s) => s.saveHistory);

  const isConfigured = domain.trim() && email.trim() && token.trim();

  // Persist credentials to localStorage
  const saveCredentials = () => {
    localStorage.setItem(LS_JIRA_DOMAIN, domain.trim());
    localStorage.setItem(LS_JIRA_EMAIL, email.trim());
    localStorage.setItem(LS_JIRA_TOKEN, token.trim());
    setShowSetup(false);
    toast('Jira credentials saved');
  };

  const clearCredentials = () => {
    localStorage.removeItem(LS_JIRA_DOMAIN);
    localStorage.removeItem(LS_JIRA_EMAIL);
    localStorage.removeItem(LS_JIRA_TOKEN);
    setDomain('');
    setEmail('');
    setToken('');
    setIssues([]);
    setShowSetup(true);
    toast('Jira credentials cleared');
  };

  const fetchIssues = useCallback(async () => {
    if (!isConfigured) return;
    setLoading(true);
    setError(null);
    try {
      const base = domain.trim().replace(/\/+$/, '');
      const url = `https://${base}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=30&fields=summary,status,priority,issuetype,assignee,labels`;
      const res = await fetch(url, {
        headers: {
          Authorization: 'Basic ' + btoa(`${email.trim()}:${token.trim()}`),
          Accept: 'application/json',
        },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`${res.status} ${res.statusText}${body ? ': ' + body.slice(0, 200) : ''}`);
      }
      const data = await res.json();
      setIssues(data.issues ?? []);
      if ((data.issues ?? []).length === 0) {
        setError('No issues found for this query.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setIssues([]);
    } finally {
      setLoading(false);
    }
  }, [domain, email, token, jql, isConfigured]);

  // Auto-fetch on mount if configured
  useEffect(() => {
    if (isConfigured && !showSetup) fetchIssues();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const importIssue = (issue: JiraIssue) => {
    saveHistory();
    const cx = (window.innerWidth / 2 - camera.x) / camera.scale;
    const cy = (window.innerHeight / 2 - camera.y) / camera.scale;
    const priorityName = issue.fields.priority?.name ?? 'Medium';
    const color = PRIORITY_COLORS[priorityName] ?? '#fde68a';
    const lines = [
      `[${issue.key}] ${issue.fields.summary}`,
      '',
      `Status: ${issue.fields.status.name}`,
      issue.fields.priority ? `Priority: ${priorityName}` : '',
      issue.fields.issuetype ? `Type: ${issue.fields.issuetype.name}` : '',
      issue.fields.assignee ? `Assignee: ${issue.fields.assignee.displayName}` : '',
      issue.fields.labels?.length ? `Labels: ${issue.fields.labels.join(', ')}` : '',
    ].filter(Boolean).join('\n');

    const id = generateId();
    addNode({
      id,
      type: 'sticky',
      x: cx - 120 + Math.random() * 40 - 20,
      y: cy - 100 + Math.random() * 40 - 20,
      width: 260,
      height: 200,
      text: lines,
      color,
    } as import('../types').StickyNoteNode);
    toast(`Imported ${issue.key}`);
  };

  const importAll = () => {
    if (!issues.length) return;
    saveHistory();
    const cx = (window.innerWidth / 2 - camera.x) / camera.scale;
    const cy = (window.innerHeight / 2 - camera.y) / camera.scale;
    const COLS = 4;
    const GAP_X = 280;
    const GAP_Y = 220;
    issues.forEach((issue, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const priorityName = issue.fields.priority?.name ?? 'Medium';
      const color = PRIORITY_COLORS[priorityName] ?? '#fde68a';
      const lines = [
        `[${issue.key}] ${issue.fields.summary}`,
        '',
        `Status: ${issue.fields.status.name}`,
        issue.fields.priority ? `Priority: ${priorityName}` : '',
        issue.fields.issuetype ? `Type: ${issue.fields.issuetype.name}` : '',
      ].filter(Boolean).join('\n');

      addNode({
        id: generateId(),
        type: 'sticky',
        x: cx - ((COLS - 1) * GAP_X) / 2 + col * GAP_X,
        y: cy + row * GAP_Y,
        width: 260,
        height: 200,
        text: lines,
        color,
      } as import('../types').StickyNoteNode);
    });
    toast(`Imported ${issues.length} issues`);
  };

  return (
    <div className="absolute top-11 right-0 z-[200] w-[380px] max-h-[calc(100vh-60px)] bg-[var(--c-panel)] border-l border-b border-[var(--c-border)] shadow-xl flex flex-col font-sans text-[12px] select-none overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--c-border)] bg-[var(--c-panel)]">
        <div className="flex items-center gap-2">
          <IconJira />
          <span className="text-[var(--c-text-hi)] font-semibold text-[13px]">Jira</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSetup((v) => !v)}
            className="p-1 rounded hover:bg-[var(--c-hover)] text-[var(--c-text-md)] transition-colors"
            title="Settings"
          >
            <IconGear />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--c-hover)] text-[var(--c-text-md)] transition-colors"
            title="Close"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>
      </div>

      {/* Setup / credentials */}
      {showSetup && (
        <div className="px-3 py-3 border-b border-[var(--c-border)] space-y-2 bg-[var(--c-panel)]">
          <p className="text-[11px] text-[var(--c-text-lo)] leading-snug">
            Enter your Atlassian domain, email, and API token.
            <br />
            <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer" className="text-[var(--c-line)] underline">
              Create an API token
            </a>
          </p>
          <label className="block">
            <span className="text-[10px] uppercase text-[var(--c-text-lo)] tracking-wide">Domain</span>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="yourcompany.atlassian.net"
              className="mt-0.5 w-full px-2 py-1.5 rounded bg-[var(--c-canvas)] border border-[var(--c-border)] text-[var(--c-text-hi)] text-[12px] font-sans placeholder:text-[var(--c-text-off)] focus:outline-none focus:border-[var(--c-line)]"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase text-[var(--c-text-lo)] tracking-wide">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="mt-0.5 w-full px-2 py-1.5 rounded bg-[var(--c-canvas)] border border-[var(--c-border)] text-[var(--c-text-hi)] text-[12px] font-sans placeholder:text-[var(--c-text-off)] focus:outline-none focus:border-[var(--c-line)]"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase text-[var(--c-text-lo)] tracking-wide">API Token</span>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="paste token here"
              className="mt-0.5 w-full px-2 py-1.5 rounded bg-[var(--c-canvas)] border border-[var(--c-border)] text-[var(--c-text-hi)] text-[12px] font-sans placeholder:text-[var(--c-text-off)] focus:outline-none focus:border-[var(--c-line)]"
            />
          </label>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={saveCredentials}
              disabled={!domain.trim() || !email.trim() || !token.trim()}
              className="px-3 py-1.5 rounded bg-[var(--c-line)] text-white text-[11px] font-semibold hover:opacity-80 disabled:opacity-40 disabled:cursor-default transition-colors"
            >
              Save &amp; Connect
            </button>
            {localStorage.getItem(LS_JIRA_TOKEN) && (
              <button
                onClick={clearCredentials}
                className="px-3 py-1.5 rounded border border-red-400/40 text-red-400 text-[11px] hover:bg-red-500/10 transition-colors"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
      )}

      {/* JQL search bar */}
      {isConfigured && !showSetup && (
        <div className="px-3 py-2 border-b border-[var(--c-border)] space-y-1.5">
          <label className="block">
            <span className="text-[10px] uppercase text-[var(--c-text-lo)] tracking-wide">JQL Query</span>
            <textarea
              value={jql}
              onChange={(e) => setJql(e.target.value)}
              rows={2}
              className="mt-0.5 w-full px-2 py-1.5 rounded bg-[var(--c-canvas)] border border-[var(--c-border)] text-[var(--c-text-hi)] text-[11px] font-sans placeholder:text-[var(--c-text-off)] focus:outline-none focus:border-[var(--c-line)] resize-none"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchIssues}
              disabled={loading}
              className="px-3 py-1.5 rounded bg-[var(--c-line)] text-white text-[11px] font-semibold hover:opacity-80 disabled:opacity-60 transition-colors"
            >
              {loading ? 'Loading…' : 'Fetch Issues'}
            </button>
            {issues.length > 0 && (
              <button
                onClick={importAll}
                className="px-3 py-1.5 rounded border border-[var(--c-line)]/40 text-[var(--c-line)] text-[11px] font-semibold hover:bg-[var(--c-line)]/10 transition-colors"
              >
                Import all ({issues.length})
              </button>
            )}
            {issues.length > 0 && (
              <span className="ml-auto text-[10px] text-[var(--c-text-off)]">{issues.length} issues</span>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-3 py-2 text-[11px] text-red-400 bg-red-500/5 border-b border-[var(--c-border)] leading-snug break-words">
          {error}
        </div>
      )}

      {/* Issue list */}
      <div className="flex-1 overflow-y-auto">
        {issues.map((issue) => (
          <button
            key={issue.key}
            onClick={() => importIssue(issue)}
            className="w-full text-left px-3 py-2 border-b border-[var(--c-border)] hover:bg-[var(--c-hover)] transition-colors group"
            title={`Click to import ${issue.key} as a sticky note`}
          >
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[var(--c-line)] font-semibold text-[11px]">{issue.key}</span>
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wide"
                style={{
                  backgroundColor: statusBadgeColor(issue.fields.status.name) + '22',
                  color: statusBadgeColor(issue.fields.status.name),
                }}
              >
                {issue.fields.status.name}
              </span>
              {issue.fields.priority && (
                <span className="text-[9px] text-[var(--c-text-off)]">{issue.fields.priority.name}</span>
              )}
              <span className="ml-auto text-[9px] text-[var(--c-text-off)] opacity-0 group-hover:opacity-100 transition-opacity">
                + import
              </span>
            </div>
            <div className="text-[var(--c-text-md)] text-[11px] leading-snug line-clamp-2">
              {issue.fields.summary}
            </div>
            {issue.fields.assignee && (
              <div className="text-[9px] text-[var(--c-text-off)] mt-0.5">{issue.fields.assignee.displayName}</div>
            )}
          </button>
        ))}

        {/* Empty state when configured but no issues loaded yet */}
        {isConfigured && !showSetup && issues.length === 0 && !loading && !error && (
          <div className="px-3 py-8 text-center text-[var(--c-text-lo)] text-[11px]">
            Hit <strong>Fetch Issues</strong> to load tickets from Jira.
          </div>
        )}

        {/* Not configured empty state */}
        {!isConfigured && !showSetup && (
          <div className="px-3 py-8 text-center text-[var(--c-text-lo)] text-[11px]">
            <button onClick={() => setShowSetup(true)} className="text-[var(--c-line)] underline">Set up credentials</button> to get started.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────

function IconJira() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M14.5 7.6L8.9 2 8 1.1 3.2 5.9l-.7.7a.5.5 0 000 .7L6.8 11.6l1.2 1.2 4.8-4.8.7-.7a.5.5 0 000-.7zM8 10.1L5.9 8 8 5.9 10.1 8 8 10.1z" fill="var(--c-line)"/>
    </svg>
  );
}

function IconGear() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M5.5 1.5h2l.3 1.3a4 4 0 011 .6l1.3-.4.9 1.6-1 .9a4 4 0 010 1.1l1 .9-.9 1.6-1.3-.4a4 4 0 01-1 .6L7.5 11.5h-2l-.3-1.3a4 4 0 01-1-.6l-1.3.4-.9-1.6 1-.9a4 4 0 010-1.1l-1-.9.9-1.6 1.3.4a4 4 0 011-.6L5.5 1.5z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="6.5" cy="6.5" r="1.5" stroke="currentColor" strokeWidth="1.1"/>
    </svg>
  );
}
