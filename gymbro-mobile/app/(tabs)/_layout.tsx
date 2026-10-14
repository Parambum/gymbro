import { View } from 'react-native';
import {
  BottomTabBar,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import { Dumbbell, LibraryBig, TrendingUp } from 'lucide-react-native';

import { RestTimerBanner } from '../../components/RestTimerBanner';
import { colors } from '../../lib/theme';

/**
 * The rest timer sits directly above the tab bar rather than inside a screen,
 * so it keeps counting while you browse Progress or the Library mid-set.
 */
function TabBarWithRestTimer(props: BottomTabBarProps) {
  return (
    <View className="bg-ink-900">
      <RestTimerBanner />
      <BottomTabBar {...props} />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBarWithRestTimer {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.flame500,
        tabBarInactiveTintColor: colors.ink500,
        tabBarStyle: {
          backgroundColor: colors.ink900,
          borderTopColor: colors.ink800,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.ink950 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Workout',
          tabBarIcon: ({ color, size }) => (
            <Dumbbell size={size} color={color} strokeWidth={2.5} />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarIcon: ({ color, size }) => (
            <TrendingUp size={size} color={color} strokeWidth={2.5} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Library',
          tabBarIcon: ({ color, size }) => (
            <LibraryBig size={size} color={color} strokeWidth={2.5} />
          ),
        }}
      />
    </Tabs>
  );
}
