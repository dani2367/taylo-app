import { Redirect, useLocalSearchParams } from 'expo-router';

export default function OutlookAuthRedirect() {
  const params = useLocalSearchParams<{ connected?: string; error?: string }>();
  const query = new URLSearchParams();
  if (params.connected) query.set('connected', String(params.connected));
  if (params.error) query.set('error', String(params.error));
  const suffix = query.toString();
  return <Redirect href={suffix ? `/(tabs)/more/connections?${suffix}` : '/(tabs)/more/connections'} />;
}
