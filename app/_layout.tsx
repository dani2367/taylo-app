import { colors, fontAssets } from '@/constants/theme';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import 'react-native-reanimated';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts(fontAssets);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.ivory }} />;
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ivory } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="signup" options={{ contentStyle: { backgroundColor: colors.ivory } }} />
        <Stack.Screen name="signin" options={{ contentStyle: { backgroundColor: colors.ivory } }} />
        <Stack.Screen name="(tabs)" options={{ contentStyle: { backgroundColor: colors.ivory } }} />
      </Stack>
      <StatusBar style="dark" />
    </>
  );
}
