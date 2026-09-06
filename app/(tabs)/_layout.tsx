import { AppHeader, HomeBrandBar } from '@/components/app/AppHeader';
import { ChatProvider } from '@/components/app/ChatProvider';
import { appStyles as s } from '@/components/app/styles';
import { TayloTabBar } from '@/components/app/TayloTabBar';
import { colors } from '@/constants/theme';
import {
  registerAppleCalendarBackgroundSync,
  syncAppleCalendar,
} from '@/lib/apple-calendar';
import { Tabs, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { AppState, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const unstable_settings = {
  initialRouteName: 'home',
};

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const onHome = pathname === '/home' || pathname.endsWith('/home');
  const onPlan = pathname === '/plan' || pathname.includes('/plan');
  const showBrandHeader = !pathname.includes('/chat') && !onHome && !onPlan;

  useEffect(() => {
    void (async () => {
      await registerAppleCalendarBackgroundSync();
      await syncAppleCalendar();
    })();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncAppleCalendar();
    });
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ChatProvider>
      <View style={s.shell}>
        <View style={[s.headerWrap, { paddingTop: insets.top }]}>
          {onHome ? <HomeBrandBar /> : null}
          {showBrandHeader ? <AppHeader /> : null}
        </View>
        <Tabs
          tabBar={(props) => <TayloTabBar {...props} />}
          screenOptions={{
            headerShown: false,
            sceneStyle: { backgroundColor: colors.ivory },
          }}>
          <Tabs.Screen name="home" options={{ title: 'Home' }} />
          <Tabs.Screen name="plan" options={{ title: 'Plan' }} />
          <Tabs.Screen name="chat" options={{ title: 'Ask' }} />
          <Tabs.Screen name="more" options={{ href: null, title: 'More' }} />
        </Tabs>
      </View>
    </ChatProvider>
    </GestureHandlerRootView>
  );
}
