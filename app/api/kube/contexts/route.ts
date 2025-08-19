export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { getContexts } from '../../../../lib/kube';

function cleanName(name: string): string {
  // Strip common env suffixes (-dev|-test|-qa|-prod) & trailing namespace/user noise
  // Examples:
  //  - "cluster-dev" -> "cluster"
  //  - "cluster@dev" -> "cluster"
  //  - "team-a:dev"  -> "team-a"
  const envStrip = name.replace(/[-@:](dev|test|qa|prod)\b.*$/i, '');
  // If nothing changed, still try to trim after first space/at/colon
  return envStrip.split(/[ @:]/)[0] || name;
}

export async function GET() {
  try {
    const { contexts, current } = getContexts();

    // De-duplicate by context name and sort
    const uniq = new Map<string, (typeof contexts)[number]>();
    for (const c of contexts) {
      if (!uniq.has(c.name)) uniq.set(c.name, c);
    }
    const list = Array.from(uniq.values()).sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      current,
      contexts: list.map(c => ({
        name: c.name,
        display: cleanName(c.name),
        cluster: c.cluster,
        user: c.user,
        namespace: c.namespace ?? null,
      }))
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to read kubeconfig' }, { status: 500 });
  }
}
