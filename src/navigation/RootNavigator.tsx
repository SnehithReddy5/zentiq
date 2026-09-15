import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/auth.store';
import { useTenantStore } from '../store/tenant.store';
import { AuthNavigator } from './AuthNavigator';
import { AppNavigator } from './AppNavigator';
import { Routes } from '../constants/routes';
import { ShieldAlert, LogOut } from 'lucide-react-native';

const Stack = createNativeStackNavigator();

// Custom Dark Theme permanently sets the background canvas to #090D1A,
// eliminating any white screen flicker during native back transitions.
const CustomDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#090D1A',
    card: '#111827',
    text: '#FFFFFF',
    border: '#1E293B',
    notification: '#5D3FD3',
  },
};

export const RootNavigator = () => {
  const { user, logout } = useAuthStore();
  const { tenant } = useTenantStore();

  const isDeactivated = tenant?.status === 'DEACTIVATED' || tenant?.status === 'SUSPENDED';

  // If tenant has been deactivated by Platform Admin, block all POS operations immediately
  if (user && isDeactivated) {
    return (
      <View className="flex-1 bg-[#030712] items-center justify-center p-8">
        <View className="w-20 h-20 bg-rose-500/10 border border-rose-500/30 rounded-3xl items-center justify-center mb-6">
          <ShieldAlert size={44} color="#F43F5E" />
        </View>

        <Text className="text-2xl font-black text-white text-center tracking-tight">
          ACCOUNT SUSPENDED
        </Text>
        <Text className="text-rose-400 font-bold text-xs uppercase tracking-widest mt-1 text-center">
          POS Operations Stopped by Platform Admin
        </Text>

        <View className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl my-6 w-full max-w-md">
          <Text className="text-slate-300 text-xs text-center leading-relaxed">
            Your restaurant tenant instance ({tenant?.businessName || tenant?.id}) has been deactivated by the platform administrator.
          </Text>
          <Text className="text-slate-400 text-[11px] text-center mt-3 font-semibold">
            All order taking, billing, table access, and KOT dispatches are currently locked.
          </Text>
        </View>

        <TouchableOpacity
          onPress={logout}
          className="w-full max-w-md py-3.5 px-4 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-xl flex-row items-center justify-center"
        >
          <LogOut size={16} color="#CBD5E1" />
          <Text className="text-white font-bold text-xs ml-2">Sign Out of Terminal</Text>
        </TouchableOpacity>

        <Text className="text-slate-600 text-[10px] mt-6 text-center">
          Contact our company platform support to reactivate your restaurant license.
        </Text>
      </View>
    );
  }

  return (
    <NavigationContainer theme={CustomDarkTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#090D1A' },
          animation: 'slide_from_right',
        }}
      >
        {!user ? (
          <Stack.Screen name={Routes.AUTH} component={AuthNavigator} />
        ) : (
          <Stack.Screen name={Routes.APP} component={AppNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
