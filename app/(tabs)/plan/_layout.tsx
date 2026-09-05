import { Stack } from 'expo-router';
import { colors } from '@/constants/theme';

export default function PlanLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.ivory },
      }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="list/[collectionId]" />
      <Stack.Screen name="item/[itemId]" />
      <Stack.Screen name="later" />
      <Stack.Screen name="month" />
      <Stack.Screen name="person/[personId]" />
    </Stack>
  );
}
