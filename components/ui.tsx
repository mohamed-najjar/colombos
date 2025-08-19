'use client';
import { clsx } from 'clsx';

export function Card(props: { title?: string; className?: string; children?: React.ReactNode }) {
  return (
    <div className={clsx('card', props.className)}>
      {props.title ? <div className="card-header">{props.title}</div> : null}
      <div className="card-body">{props.children}</div>
    </div>
  );
}

export function Stat(props: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 p-3 rounded-xl bg-neutral-900 border border-neutral-800">
      <div className="text-xs uppercase tracking-wide text-neutral-400">{props.label}</div>
      <div className="text-2xl font-bold">{props.value}</div>
      {props.sub ? <div className="text-xs text-neutral-400">{props.sub}</div> : null}
    </div>
  );
}
