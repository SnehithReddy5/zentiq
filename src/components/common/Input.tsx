import React from 'react';
import { View, TextInput, Text, TextInputProps } from 'react-native';
import { useThemeStore } from '../../store/theme.store';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerClassName?: string;
  textClassName?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  leftIcon,
  rightIcon,
  className = '',
  containerClassName = '',
  textClassName = '',
  style,
  ...props
}) => {
  const { themeMode } = useThemeStore();
  const isDark = themeMode === 'dark';

  return (
    <View className={`w-full mb-3 ${className}`}>
      {label && (
        <Text className={`font-semibold text-xs mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
          {label}
        </Text>
      )}
      <View
        className={`flex-row items-center rounded-xl px-3.5 py-2.5 border ${
          isDark ? 'bg-slate-800/80 border-slate-700/80' : 'bg-slate-50 border-slate-300'
        } ${error ? 'border-red-500' : ''} ${containerClassName}`}
      >
        {leftIcon && <View className="mr-2.5">{leftIcon}</View>}
        <TextInput
          className={`flex-1 text-base py-0 ${isDark ? 'text-white' : 'text-slate-900'} ${textClassName}`}
          placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
          style={[{ outlineStyle: 'none' } as any, style]}
          {...props}
        />
        {rightIcon && <View className="ml-2.5">{rightIcon}</View>}
      </View>
      {error && <Text className="text-red-500 text-xs mt-1">{error}</Text>}
    </View>
  );
};
