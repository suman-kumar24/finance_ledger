import { Tabs } from 'expo-router/js-tabs';

import { useT } from '@/i18n';
import { Icon } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

export default function TabsLayout() {
  const c = useTheme();
  const t = useT();
  const icon = (name: string) =>
    function TabIcon({ color, size }: { color: unknown; size: number }) {
      return <Icon name={name} color={typeof color === 'string' ? color : undefined} size={size} />;
    };
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textMuted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border, minHeight: 64 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarAllowFontScaling: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('tab.overview'), tabBarIcon: icon('view-dashboard-outline') }}
      />
      <Tabs.Screen
        name="transactions"
        options={{ title: t('tab.transactions'), tabBarIcon: icon('format-list-bulleted') }}
      />
      <Tabs.Screen
        name="accounts"
        options={{ title: t('tab.accounts'), tabBarIcon: icon('wallet-outline') }}
      />
      <Tabs.Screen name="plans" options={{ title: t('tab.plans'), tabBarIcon: icon('target') }} />
      <Tabs.Screen
        name="reports"
        options={{ title: t('tab.reports'), tabBarIcon: icon('chart-bar') }}
      />
    </Tabs>
  );
}
