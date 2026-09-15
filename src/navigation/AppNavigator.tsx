import React, { useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from '../screens/home/HomeScreen';
import { TablesScreen } from '../screens/tables/TablesScreen';
import { MenuScreen } from '../screens/menu/MenuScreen';
import { MenuManagementScreen } from '../screens/menu/MenuManagementScreen';
import { CartScreen } from '../screens/cart/CartScreen';
import { RunningOrdersScreen } from '../screens/orders/RunningOrdersScreen';
import { PrinterSettingsScreen } from '../screens/settings/PrinterSettingsScreen';
import { UserManagementScreen } from '../screens/settings/UserManagementScreen';
import { LocationManagementScreen } from '../screens/locations/LocationManagementScreen';
import { BusinessProfileScreen } from '../screens/branding/BusinessProfileScreen';
import { SetupWizardScreen } from '../screens/setup/SetupWizardScreen';
import { Routes } from '../constants/routes';
import { useTableStore } from '../store/table.store';
import { useTenantStore } from '../store/tenant.store';

const Stack = createNativeStackNavigator();

export const AppNavigator = () => {
  const { subscribeToTables } = useTableStore();
  const { tenant, activeLocationId } = useTenantStore();

  // Listen to active branch tables in real-time across the entire app
  useEffect(() => {
    const unsubscribe = subscribeToTables();
    return () => unsubscribe();
  }, [tenant?.id, activeLocationId]);

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#090D1A' },
        animation: 'slide_from_right',
      }}
      initialRouteName={Routes.HOME}
    >
      <Stack.Screen name={Routes.HOME} component={HomeScreen} />
      <Stack.Screen name={Routes.TABLES} component={TablesScreen} />
      <Stack.Screen name={Routes.MENU} component={MenuScreen} />
      <Stack.Screen name={Routes.MENU_MANAGEMENT} component={MenuManagementScreen} />
      <Stack.Screen name={Routes.CART} component={CartScreen} />
      <Stack.Screen name={Routes.ORDERS} component={RunningOrdersScreen} />
      <Stack.Screen name={Routes.LOCATION_MANAGEMENT} component={LocationManagementScreen} />
      <Stack.Screen name={Routes.BUSINESS_PROFILE} component={BusinessProfileScreen} />
      <Stack.Screen name={Routes.SETTINGS} component={PrinterSettingsScreen} />
      <Stack.Screen name={Routes.USER_MANAGEMENT} component={UserManagementScreen} />
      <Stack.Screen name={Routes.SETUP_WIZARD} component={SetupWizardScreen} />
    </Stack.Navigator>
  );
};
