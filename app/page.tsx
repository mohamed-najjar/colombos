'use client';

import useSWR from 'swr';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, Stat } from '../components/ui';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { RefreshCw, Server, AlertTriangle, Info, ChevronDown, X } from 'lucide-react';

const CHART = {
  grid: '#2a2a2a',
  axis: '#9ca3af',
  bar: '#60a5fa',         // blue-400
  pie: ['#22c55e', '#ef4444'], // Ready, NotReady
};

/* -------------------- fetcher that shows real API error text -------------------- */
const fetcher = async (url: string) => {
  const r = await fetch(url);
  let body: any = null;
  try { body = await r.json(); } catch {}
  if (!r.ok) {
    const msg = (body && (body.error || body.message)) || `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return body;
};

/* -------------------- types -------------------- */
type ContextItem = {
  name: string;              // full kube context name (e.g., "mohna10-dev")
  display?: string;
  cluster?: string | null;
  user?: string | null;
  namespace?: string | null;
};

/* -------------------- search helpers -------------------- */
const norm = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().replace(/[_:.@/]+/g, ' ').replace(/\s+/g, ' ').trim();

function isSubsequence(q: string, s: string) {
  let i = 0;
  for (const ch of s) if (ch === q[i]) i++;
  return i === q.length;
}

function scoreMatch(query: string, ctx: ContextItem): number {
  if (!query) return 0; // neutral
  const q = norm(query);
  const hay = [
    ctx.name, ctx.display, ctx.cluster, ctx.user, ctx.namespace
  ].map(norm).join(' ');
  const name = norm(ctx.name);

  // Higher is better
  if (name === q) return 10000;                   // exact name match
  if (name.startsWith(q)) return 8000;            // name startsWith
  if (hay.includes(q)) return 6000;               // full hay includes
  // token AND-match (orderless)
  const tokens = q.split(' ').filter(Boolean);
  if (tokens.length && tokens.every(t => hay.includes(t))) return 5000;
  // fuzzy subsequence on name
  if (isSubsequence(q, name)) return 3000;

  return -1; // no match
}

/* ========================================================================== */
/* Searchable Combobox for contexts                                           */
/* ========================================================================== */
function Combobox({
  items,
  value,
  onChange,
  placeholder = 'Search contexts…',
}: {
  items: ContextItem[];
  value: string | null;
  onChange: (name: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const ranked = useMemo(() => {
    const withScore = items.map(c => ({ c, s: scoreMatch(q, c) }));
    const filtered = withScore.filter(x => x.s >= 0 || !q);
    filtered.sort((a, b) => {
      if (b.s !== a.s) return b.s - a.s; // higher score first
      // tie-breaker: shorter name first, then alpha
      if (a.c.name.length !== b.c.name.length) return a.c.name.length - b.c.name.length;
      return a.c.name.localeCompare(b.c.name);
    });
    const out = filtered.map(x => x.c);
    // If empty query and we have a selected value, show it at the top
    if (!q && value) {
      const i = out.findIndex(x => x.name === value);
      if (i > 0) {
        const sel = out[i];
        out.splice(i, 1);
        out.unshift(sel);
      }
    }
    return out;
  }, [items, q, value]);

  useEffect(() => {
    setActiveIdx(prev => Math.min(prev, Math.max(ranked.length - 1, 0)));
  }, [ranked.length]);

  const commit = useCallback((idx: number) => {
    const chosen = ranked[idx];
    if (!chosen) return;
    onChange(chosen.name);
    setOpen(false);
    setQ('');
  }, [ranked, onChange]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (!open) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, Math.max(ranked.length - 1, 0)));
      requestAnimationFrame(() => {
        const el = listRef.current?.querySelector(`[data-idx="${Math.min(activeIdx + 1, ranked.length - 1)}"]`) as HTMLElement | null;
        el?.scrollIntoView({ block: 'nearest' });
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
      requestAnimationFrame(() => {
        const el = listRef.current?.querySelector(`[data-idx="${Math.max(activeIdx - 1, 0)}"]`) as HTMLElement | null;
        el?.scrollIntoView({ block: 'nearest' });
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commit(activeIdx);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const selectedLabel = value ?? '';

  return (
    <div className="relative">
      <div className="text-sm text-neutral-400 mb-1">Context</div>
      <div
        className="rounded-xl border border-neutral-700 bg-neutral-900 focus-within:ring-2 focus-within:ring-neutral-500 flex items-center"
        onKeyDown={onKeyDown}
      >
        <input
          ref={inputRef}
          className="flex-1 bg-transparent px-3 py-2 outline-none"
          placeholder={placeholder}
          value={open ? q : selectedLabel}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        {selectedLabel && !open ? (
          <button
            className="px-2 py-2 text-neutral-400 hover:text-neutral-200"
            title="Open"
            onClick={() => { setOpen(true); inputRef.current?.focus(); }}
          >
            <ChevronDown className="size-4" />
          </button>
        ) : (
          <button
            className="px-2 py-2 text-neutral-400 hover:text-neutral-200"
            title="Close"
            onClick={() => { setOpen(false); setQ(''); }}
          >
            {open ? <X className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        )}
      </div>

      {open && (
        <div
          role="listbox"
          ref={listRef}
          className="absolute z-30 mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl max-h-[50vh] overflow-y-auto"
        >
          {ranked.length === 0 && (
            <div className="px-3 py-2 text-sm text-neutral-400">No matches</div>
          )}
          {ranked.map((c, idx) => {
            const active = idx === activeIdx;
            return (
              <button
                key={c.name}
                data-idx={idx}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => commit(idx)}
                className={`w-full text-left px-3 py-2 text-sm ${active ? 'bg-neutral-800' : 'hover:bg-neutral-800/70'}`}
                aria-selected={active}
              >
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-neutral-400 truncate">
                  {c.cluster ? `cluster: ${c.cluster}` : ''}{c.user ? `  ·  user: ${c.user}` : ''}{c.namespace ? `  ·  ns: ${c.namespace}` : ''}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default function Page() {
  const { data: ctxData, error: ctxError } =
    useSWR<{ current: string; contexts: ContextItem[] }>('/api/kube/contexts', fetcher);

  const allContexts = ctxData?.contexts ?? [];

  const [selected, setSelected] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (ctxData?.current && !selected) setSelected(ctxData.current);
  }, [ctxData, selected]);

  const { data: summary, error: sumError, mutate } =
    useSWR(selected ? `/api/kube/summary?context=${encodeURIComponent(selected)}` : null, fetcher, { refreshInterval: 15000 });

  const { data: rich, error: richError, mutate: mutateRich } =
    useSWR(detailsOpen && selected ? `/api/kube/summary?context=${encodeURIComponent(selected)}&detail=1` : null, fetcher);

  const nodeStatusData = useMemo(() => {
    if (!summary) return [];
    return [
      { name: 'Ready', value: summary.nodes.ready },
      { name: 'NotReady', value: summary.nodes.notReady },
    ];
  }, [summary]);

  const podsPerNs = useMemo(() => summary?.namespaces.topByPods ?? [], [summary]);

  return (
    <div className="container mx-auto p-4 space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Server className="size-6 opacity-80" />
          <h1 className="text-2xl font-semibold">Kube.config Dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { mutate(); if (detailsOpen) mutateRich(); }}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 transition"
            title="Refresh now"
          >
            <RefreshCw className="size-4" /> Refresh
          </button>
        </div>
      </header>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:items-end">
          <div className="md:col-span-2">
            <Combobox
              items={allContexts}
              value={selected}
              onChange={(name) => setSelected(name)}
              placeholder="Search contexts (e.g. mohna10-dev, qa, 10.23, wcp)…"
            />
            {ctxError ? <div className="text-red-400 mt-2">Failed to read kubeconfig: {String(ctxError)}</div> : null}
          </div>
          <div className="text-xs text-neutral-400 md:justify-self-end">
            Reading from <span className="badge">~/.kube/config</span>.
          </div>
        </div>
      </Card>

      {(sumError || richError) && (
        <Card title="Error">
          <div className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="size-5" />
            <div>{String(sumError || richError)}</div>
          </div>
        </Card>
      )}

      {summary && (
        <>
          <div className="flex justify-end -mb-3">
            <button
              onClick={() => { setDetailsOpen(true); mutateRich(); }}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 transition"
              title="Cluster details"
            >
              <Info className="size-4" /> Details
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-4">
              <Card title="Cluster Overview">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  <Stat label="Context" value={summary.context} />
                  <Stat
                    label="API Server"
                    value={
                      <span
                        className="truncate inline-block max-w-[16rem]"
                        title={summary.clusterServer ?? undefined}
                      >
                        {summary.clusterServer ?? 'n/a'}
                      </span>
                    }
                  />

                  <Stat
                    label="User"
                    value={
                      <span
                        className="truncate inline-block max-w-[16rem] break-all"
                        title={summary.user ?? undefined}
                      >
                        {summary.user ?? 'n/a'}
                      </span>
                    }
                  />
                  <Stat label="Namespace" value={summary.namespace ?? '—'} />
                  <Stat label="Version" value={summary.version?.gitVersion ?? 'unknown'} sub={summary.version?.platform} />
                  <Stat label="CRDs" value={summary.crds} />
                </div>
              </Card>

              {/* Nodes health: responsive layout, no overlapping */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card title="Nodes Health">
                  <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                    <div className="w-full lg:w-[50%] h-[240px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={nodeStatusData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={55}
                            outerRadius={90}
                            paddingAngle={4}
                            labelLine={false}
                            stroke="#0b0b0b"   // ring edge for dark mode
                            strokeWidth={2}
                          >
                            {nodeStatusData.map((_, idx) => (
                              <Cell key={`cell-${idx}`} fill={CHART.pie[idx % CHART.pie.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ background: '#111', border: '1px solid #333', color: '#eee' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="grid grid-cols-3 gap-3 flex-1">
                      <Stat label="Total" value={summary.nodes.total} />
                      <Stat label="Ready" value={summary.nodes.ready} />
                      <Stat label="Not Ready" value={summary.nodes.notReady} />
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-neutral-400">
                        <tr>
                          <th className="text-left py-2 pr-3">Name</th>
                          <th className="text-left py-2 pr-3">Roles</th>
                          <th className="text-left py-2 pr-3">Kubelet</th>
                          <th className="text-left py-2 pr-3">CPU</th>
                          <th className="text-left py-2 pr-3">Memory</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.nodes.items.map((n: any) => (
                          <tr key={n.name} className="border-t border-neutral-800">
                            <td className="py-2 pr-3">{n.name}</td>
                            <td className="py-2 pr-3">{n.roles.length ? n.roles.join(', ') : '—'}</td>
                            <td className="py-2 pr-3">{n.kubeletVersion}</td>
                            <td className="py-2 pr-3">{n.cpu ?? '—'}</td>
                            <td className="py-2 pr-3">{n.memory ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card title="Top Namespaces by Pods">
                  <div className="w-full h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={podsPerNs}>
                        <CartesianGrid stroke={CHART.grid} />
                        <XAxis dataKey="namespace" tickMargin={8} stroke={CHART.axis} />
                        <YAxis allowDecimals={false} width={40} stroke={CHART.axis} />
                        <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', color: '#eee' }} />
                        <Bar dataKey="pods" fill={CHART.bar} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-4">
                    <Stat label="Namespaces" value={summary.namespaces.total} />
                    <Stat label="Pods" value={summary.workloads.pods} />
                    <Stat label="Services" value={summary.workloads.services} />
                  </div>
                </Card>
              </div>

              <Card title="Workloads Snapshot">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  <Stat label="Deployments" value={summary.workloads.deployments} />
                  <Stat label="StatefulSets" value={summary.workloads.statefulsets} />
                  <Stat label="DaemonSets" value={summary.workloads.daemonsets} />
                  <Stat label="Ingresses" value={summary.workloads.ingresses} />
                  <Stat label="StorageClasses" value={summary.storage.storageClasses} />
                  <Stat label="PVCs" value={summary.storage.persistentVolumeClaims} />
                </div>
              </Card>
            </div>
          </div>
        </>
      )}

      {/* Modal for details (fixed height, internal scroll) */}
      {detailsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-6xl h-[85vh] card flex flex-col">
            <div className="card-header flex items-center justify-between sticky top-0 bg-neutral-900/80 backdrop-blur z-10">
              <div className="uppercase tracking-wider text-neutral-400">Cluster details</div>
              <button
                onClick={() => setDetailsOpen(false)}
                className="rounded-lg px-3 py-1 border border-neutral-700 hover:bg-neutral-800"
              >
                Close
              </button>
            </div>
            <div className="card-body overflow-y-auto">
              {!rich && !richError && <div className="text-neutral-400">Loading…</div>}
              {richError && (
                <div className="flex items-center gap-2 text-red-400">
                  <AlertTriangle className="size-5" />
                  <div>{String(richError)}</div>
                </div>
              )}
              {rich && (
                <Tabs
                  tabs={[
                    { key: 'nodes', title: 'Nodes', content: <NodesTab version={summary?.version?.gitVersion} items={summary?.nodes.items || []} /> },
                    { key: 'pods', title: `Pods (${rich.details?.pods.length ?? 0})`, content: <PodsTab items={rich.details?.pods || []} /> },
                    { key: 'deployments', title: `Deployments (${rich.details?.deployments.length ?? 0})`, content: <DeploymentsTab items={rich.details?.deployments || []} /> },
                    { key: 'services', title: `Services (${rich.details?.services.length ?? 0})`, content: <ServicesTab items={rich.details?.services || []} /> },
                    { key: 'ingresses', title: `Ingresses (${rich.details?.ingresses.length ?? 0})`, content: <IngressesTab items={rich.details?.ingresses || []} /> },
                    { key: 'storage', title: `PVCs (${rich.details?.pvcs.length ?? 0})`, content: <PvcsTab items={rich.details?.pvcs || []} /> },
                    { key: 'crds', title: `CRDs (${summary?.crds ?? 0})`, content: <div className="text-sm text-neutral-300">CRD count: {summary?.crds ?? 0}</div> },
                  ]}
                />
              )}
            </div>
          </div>
        </div>
      )}
            <footer className="text-center text-xs text-neutral-500 mt-8">
        © {new Date().getFullYear()} <a href="https://github.com/mohamed-najjar" target='_blank'>Mohamed Najjar</a>. All rights reserved.
      </footer>
    </div>
  );
}

/* ---------- Tiny UI helpers for tabs & detail tables ---------- */

function Tabs(props: { tabs: { key: string; title: string; content: React.ReactNode }[] }) {
  const [active, setActive] = useState(props.tabs[0]?.key);
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4 sticky top-0 bg-neutral-900/70 backdrop-blur py-2 z-10">
        {props.tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`px-3 py-1.5 rounded-xl border ${active === t.key ? 'bg-neutral-800 border-neutral-600' : 'bg-neutral-900 border-neutral-800 hover:bg-neutral-800'}`}
          >
            {t.title}
          </button>
        ))}
      </div>
      <div>
        {props.tabs.find(t => t.key === active)?.content}
      </div>
    </div>
  );
}

function NodesTab({ version, items }: { version?: string; items: any[] }) {
  return (
    <div className="space-y-3">
      <div className="text-sm text-neutral-400">Kubernetes Version: <span className="text-neutral-200">{version || 'unknown'}</span></div>
      <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="text-neutral-400">
            <tr>
              <th className="text-left py-2 pr-3">Name</th>
              <th className="text-left py-2 pr-3">Roles</th>
              <th className="text-left py-2 pr-3">Kubelet</th>
              <th className="text-left py-2 pr-3">OS</th>
              <th className="text-left py-2 pr-3">Runtime</th>
              <th className="text-left py-2 pr-3">CPU</th>
              <th className="text-left py-2 pr-3">Memory</th>
            </tr>
          </thead>
          <tbody>
            {items.map((n: any) => (
              <tr key={n.name} className="border-t border-neutral-800">
                <td className="py-2 pr-3">{n.name}</td>
                <td className="py-2 pr-3">{n.roles?.join(', ') || '—'}</td>
                <td className="py-2 pr-3">{n.kubeletVersion}</td>
                <td className="py-2 pr-3">{n.osImage || '—'}</td>
                <td className="py-2 pr-3">{n.containerRuntime || '—'}</td>
                <td className="py-2 pr-3">{n.cpu || '—'}</td>
                <td className="py-2 pr-3">{n.memory || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PodsTab({ items }: { items: Array<{ name: string; namespace: string; phase?: string }> }) {
  return (
    <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="text-neutral-400">
          <tr>
            <th className="text-left py-2 pr-3">Namespace</th>
            <th className="text-left py-2 pr-3">Name</th>
            <th className="text-left py-2 pr-3">Phase</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p, i) => (
            <tr key={`${p.namespace}_${p.name}_${i}`} className="border-t border-neutral-800">
              <td className="py-2 pr-3">{p.namespace}</td>
              <td className="py-2 pr-3">{p.name}</td>
              <td className="py-2 pr-3">{p.phase ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeploymentsTab({ items }: { items: Array<{ name: string; namespace: string; ready?: string; replicas?: number }> }) {
  return (
    <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="text-neutral-400">
          <tr>
            <th className="text-left py-2 pr-3">Namespace</th>
            <th className="text-left py-2 pr-3">Name</th>
            <th className="text-left py-2 pr-3">Ready</th>
            <th className="text-left py-2 pr-3">Replicas</th>
          </tr>
        </thead>
        <tbody>
          {items.map((d, i) => (
            <tr key={`${d.namespace}_${d.name}_${i}`} className="border-t border-neutral-800">
              <td className="py-2 pr-3">{d.namespace}</td>
              <td className="py-2 pr-3">{d.name}</td>
              <td className="py-2 pr-3">{d.ready ?? '—'}</td>
              <td className="py-2 pr-3">{d.replicas ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ServicesTab({ items }: { items: Array<{ name: string; namespace: string; type?: string; clusterIP?: string }> }) {
  return (
    <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="text-neutral-400">
          <tr>
            <th className="text-left py-2 pr-3">Namespace</th>
            <th className="text-left py-2 pr-3">Name</th>
            <th className="text-left py-2 pr-3">Type</th>
            <th className="text-left py-2 pr-3">ClusterIP</th>
          </tr>
        </thead>
        <tbody>
          {items.map((s, i) => (
            <tr key={`${s.namespace}_${s.name}_${i}`} className="border-t border-neutral-800">
              <td className="py-2 pr-3">{s.namespace}</td>
              <td className="py-2 pr-3">{s.name}</td>
              <td className="py-2 pr-3">{s.type ?? '—'}</td>
              <td className="py-2 pr-3">{s.clusterIP ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IngressesTab({ items }: { items: Array<{ name: string; namespace: string; hosts: string[] }> }) {
  return (
    <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="text-neutral-400">
          <tr>
            <th className="text-left py-2 pr-3">Namespace</th>
            <th className="text-left py-2 pr-3">Name</th>
            <th className="text-left py-2 pr-3">Hosts</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i, idx) => (
            <tr key={`${i.namespace}_${i.name}_${idx}`} className="border-t border-neutral-800">
              <td className="py-2 pr-3">{i.namespace}</td>
              <td className="py-2 pr-3">{i.name}</td>
              <td className="py-2 pr-3">{i.hosts?.join(', ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PvcsTab({ items }: { items: Array<{ name: string; namespace: string; status?: string; storageClass?: string; capacity?: string }> }) {
  return (
    <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="text-neutral-400">
          <tr>
            <th className="text-left py-2 pr-3">Namespace</th>
            <th className="text-left py-2 pr-3">Name</th>
            <th className="text-left py-2 pr-3">Status</th>
            <th className="text-left py-2 pr-3">StorageClass</th>
            <th className="text-left py-2 pr-3">Capacity</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c, idx) => (
            <tr key={`${c.namespace}_${c.name}_${idx}`} className="border-t border-neutral-800">
              <td className="py-2 pr-3">{c.namespace}</td>
              <td className="py-2 pr-3">{c.name}</td>
              <td className="py-2 pr-3">{c.status ?? '—'}</td>
              <td className="py-2 pr-3">{c.storageClass ?? '—'}</td>
              <td className="py-2 pr-3">{c.capacity ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
