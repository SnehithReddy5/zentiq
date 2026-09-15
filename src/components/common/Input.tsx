import React from 'react';
import { View, TextInput, Text, TextInputProps } from 'react-native';

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
  ...props
}) => {
  return (
    <View className={`w-full mb-3 ${className}`}>
      {label && <Text className="text-slate-300 font-semibold text-xs mb-1.5">{label}</Text>}
      <View className={`flex-row items-center bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 ${error ? 'border-red-500' : ''} ${containerClassName}`}>
        {leftIcon && <View className="mr-2.5">{leftIcon}</View>}
        <TextInput
          className={`flex-1 text-white text-base py-0 ${textClassName}`}
          placeholderTextColor="#64748B"
          {...props}
        />
        {rightIcon && <View className="ml-2.5">{rightIcon}</View>}
      </View>
      {error && <Text className="text-red-500 text-xs mt-1">{error}</Text>}
    </View>
  );
};
