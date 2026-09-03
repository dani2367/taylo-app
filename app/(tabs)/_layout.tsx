import { AppHeader } from '@/components/app/AppHeader';
import { ChatProvider } from '@/components/app/ChatProvider';
import { appStyles as s } from '@/components/app/styles';
import { TayloTabBar } from '@/components/app/TayloTabBar';
import { colors } from '@/constants/theme';
import { Tabs, usePathname } from 'expo-router';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const unstable_settings = {
  initialRouteName: 'home',
};

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const isChat = pathname.includes('/chat');

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ChatProvider>
      <View style={s.shell}>
        <View style={[s.headerWrap, { paddingTop: insets.top }]}>{isChat ? null : <AppHeader />}</View>
        <Tabs
          tabBar={(props) => <TayloTabBar {...props} />}
          screenOptions={{
            headerShown: false,
            sceneStyle: { backgroundColor: colors.grayLight },
          }}>
          <Tabs.Screen name="home" options={{ title: 'Home' }} />
          <Tabs.Screen name="plan" options={{ title: 'Plan' }} />
          <Tabs.Screen name="chat" options={{ title: 'Ask' }} />
          <Tabs.Screen name="more" options={{ title: 'More' }} />
          <Tabs.Screen name="ahead" options={{ href: null, title: 'Ahead' }} />
        </Tabs>
      </View>
    </ChatProvider>
    </GestureHandlerRootView>
  );
}
