import { supabase } from '@/lib/supabase';
import { validEmail } from '@/lib/signup';

export type SignInResult = { ok: true } | { ok: false; message: string };

const INVALID_CREDENTIALS =
  "Email or password is incorrect. Try again, or sign up if you don't have an account yet.";
const EMAIL_NOT_CONFIRMED =
  'Please confirm your email before signing in. Check your inbox for the confirmation link.';

function friendlySignInMessage(message: string) {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('invalid credentials')) {
    return INVALID_CREDENTIALS;
  }
  if (m.includes('email not confirmed')) {
    return EMAIL_NOT_CONFIRMED;
  }
  if (m.includes('too many requests') || m.includes('rate limit')) {
    return 'Too many attempts. Wait a moment and try again.';
  }
  return message || 'Something went wrong. Please try again.';
}

export { validEmail };

export async function signIn(email: string, password: string): Promise<SignInResult> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error || !data.session || !data.user) {
      return { ok: false, message: friendlySignInMessage(error?.message || INVALID_CREDENTIALS) };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
    return { ok: false, message };
  }
}
