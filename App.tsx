import { Platform } from 'react-native';
import { enableScreens } from 'react-native-screens';

// Strictly enable native screens only on mobile (Android/iOS).
// Disabling on Web/Electron prevents React Suspense freeze bugs from disabling or blocking text inputs.
if (Platform.OS !== 'web') {
  enableScreens(true);
}

// Eliminate harsh rectangular Chromium outline focus rings on Windows / Web input fields
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  try {
    const styleId = 'pos-web-global-focus-reset';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        input, textarea, select, [contenteditable="true"] {
          outline: none !important;
          outline-style: none !important;
          box-shadow: none !important;
        }
        input:focus, textarea:focus, select:focus, [contenteditable="true"]:focus,
        input:focus-visible, textarea:focus-visible, select:focus-visible {
          outline: none !important;
          outline-style: none !important;
          box-shadow: none !important;
        }
        *:focus-visible {
          outline: none !important;
        }
      `;
      document.head.appendChild(style);
    }
  } catch (_) {}
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
