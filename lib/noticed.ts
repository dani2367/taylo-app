import { supabase } from '@/lib/supabase';

const STALE_MS = 4 * 60 * 60 * 1000;
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let inFlight: Promise<{ regenerated: boolean }> | null = null;

export function isUsableInsight(raw: string | null | undefined): boolean {
  const text = (raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return false;
  const watching = /keep(ing)? (an )?eye|worth (keeping|watching)\b/i.test(text);
  const practical = /\b(confirm|add|start|book|pack|send|call|reply|form|photo|order|check|talk you through|if you want|tonight|this week)\b/i.test(
    text,
  );
  if (watching && !practical) return false;
  return true;
}

export async function refreshNoticed(opts?: { force?: boolean }): Promise<{ regenerated: boolean }> {
  const force = Boolean(opts?.force);
  if (inFlight && !force) return inFlight;

  const run = doRefresh(force);
  if (!inFlight) {
    inFlight = run.finally(() => {
      inFlight = null;
    });
    return inFlight;
  }
  return run;
}

async function doRefresh(force: boolean): Promise<{ regenerated: boolean }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token || !supabaseUrl || !supabaseAnonKey) {
    return { regenerated: false };
  }

  if (!force) {
    const { data } = await supabase
      .from('home_noticed')
      .select('generated_at, insight_text')
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = data as { generated_at?: string; insight_text?: string } | null;
    const generatedAt = row?.generated_at;
    if (
      generatedAt &&
      Date.now() - new Date(generatedAt).getTime() < STALE_MS &&
      isUsableInsight(row?.insight_text)
    ) {
      return { regenerated: false };
    }
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/taylo-noticed`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ force }),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    skipped?: boolean;
    error?: string;
  };
  if (!res.ok || !payload.success) {
    console.error('Noticed refresh failed:', payload.error || res.status);
    return { regenerated: false };
  }
  return { regenerated: !payload.skipped };
}
