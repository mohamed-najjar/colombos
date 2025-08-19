export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { buildSummary } from '../../../../lib/kube';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const context = searchParams.get('context') || undefined;
    const detail = searchParams.get('detail') === '1';
    const summary = await buildSummary(context, detail);
    return NextResponse.json(summary, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: any) {
    const msg = (err?.response?.body && JSON.stringify(err.response.body)) || err.message || String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
