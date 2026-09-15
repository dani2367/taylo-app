import { isSameLondonDay } from '@/lib/placement';
import { supabase } from '@/lib/supabase';
import {
  insightRepeatsCaptured,
  isUsableInsight,
  looksLikeMentalLoad,
} from '../supabase/functions/_shared/noticed.ts';

export { insightRepeatsCaptured, isUsableInsight, looksLikeMentalLoad };

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let inFlight: Promise<{ regenerated: boolean }> | null = null;

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
  if (!session?.access_token || !session.user?.id || !supabaseUrl || !supabaseAnonKey) {
    return { regenerated: false };
  }

  let shouldForce = force;
  if (!shouldForce) {
    const [{ data }, { data: openRows }] = await Promise.all([
      supabase
        .from('home_noticed')
        .select('generated_at, insight_text')
        .eq('user_id', session.user.id)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('items').select('title').eq('user_id', session.user.id).eq('status', 'open').limit(80),
    ]);
    const row = data as { generated_at?: string; insight_text?: string } | null;
    const generatedAt = row?.generated_at;
    const titles = ((openRows as { title?: string | null }[] | null) ?? [])
      .map((item) => item.title)
      .filter((title): title is string => !!title);
    const insight = row?.insight_text;
    if (insightRepeatsCaptured(insight, titles)) {
      shouldForce = true;
    } else if (
      isSameLondonDay(generatedAt) &&
      isUsableInsight(insight) &&
      looksLikeMentalLoad(insight)
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
    body: JSON.stringify({ force: shouldForce }),
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
