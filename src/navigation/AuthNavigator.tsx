import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { Routes } from '../constants/routes';

const Stack = createNativeStackNavigator();

export const AuthNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#090D1A' } }}>
      <Stack.Screen name={Routes.LOGIN} component={LoginScreen} />
    </Stack.Navigator>
  );
};
