import { Platform } from 'react-native';
import { enableScreens } from 'react-native-screens';

// Strictly enable native screens only on mobile (Android/iOS).
// Disabling on Web/Electron prevents React Suspense freeze bugs from disabling or blocking text inputs.
if (Platform.OS !== 'web') {
  enableScreens(true);
}

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NativeWindStyleSheet } from 'nativewind';
import { RootNavigator } from './src/navigation/RootNavigator';
import { FloatingToast } from './src/components/common/FloatingToast';
import { ConfirmModal } from './src/components/common/ConfirmModal';
import { useThemeStore } from './src/store/theme.store';

NativeWindStyleSheet.setOutput({
  default: 'native',
});

export default function App() {
  const { themeMode } = useThemeStore();
  const isDark = themeMode === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? "light" : "dark"} />
      <RootNavigator />
      <FloatingToast />
      <ConfirmModal />
    </SafeAreaProvider>
  );
}
