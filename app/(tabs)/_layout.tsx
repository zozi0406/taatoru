import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { TAB_ITEMS } from '@/ui/navigation/tabs';
import { useTheme } from '@/ui/theme/ThemeProvider';

export default function TabLayout() {
  const theme = useTheme();
  return (
    <NativeTabs tintColor={theme.colors.accent}>
      {TAB_ITEMS.map((tab) => (
        <NativeTabs.Trigger key={tab.route} name={tab.route}>
          <NativeTabs.Trigger.Icon sf={tab.sf} md={tab.md} />
          <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
