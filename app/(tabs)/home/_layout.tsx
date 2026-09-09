import { Stack } from 'expo-router';
import { colors } from '@/constants/theme';

export default function HomeLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.ivory },
      }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="today" />
    </Stack>
  );
}
