import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context'; 
import { NativeWindStyleSheet } from 'nativewind';
import { RootNavigator } from './src/navigation/RootNavigator';
import { FloatingToast } from './src/components/common/FloatingToast';

NativeWindStyleSheet.setOutput({
  default: 'native',
});

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <RootNavigator />
      <FloatingToast />
    </SafeAreaProvider>
  );
}
