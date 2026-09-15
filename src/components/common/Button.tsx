import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, TouchableOpacityProps } from 'react-native';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  onPress: () => void;
  isLoading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'success';
  className?: string;
  textClassName?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  isLoading = false,
  variant = 'primary',
  className = '',
  textClassName = '',
  disabled,
  size = 'md',
  ...props
}) => {
  let baseClasses = 'flex-row justify-center items-center rounded-xl shadow-sm ';

  if (size === 'sm') {
    baseClasses += 'py-2 px-3 ';
  } else if (size === 'lg') {
    baseClasses += 'py-4 px-6 ';
  } else {
    baseClasses += 'py-3.5 px-4 ';
  }

  let variantClasses = '';
  let defaultTextColor = 'text-white font-bold ';

  switch (variant) {
    case 'primary':
      variantClasses = 'bg-[#5D3FD3] active:bg-[#4A32A8]';
      break;
    case 'secondary':
      variantClasses = 'bg-slate-800 active:bg-slate-700 border border-slate-700';
      defaultTextColor = 'text-slate-200 font-semibold ';
      break;
    case 'danger':
      variantClasses = 'bg-rose-600 active:bg-rose-700';
      break;
    case 'success':
      variantClasses = 'bg-emerald-600 active:bg-emerald-700';
      break;
    case 'outline':
      variantClasses = 'bg-transparent border border-[#5D3FD3] active:bg-purple-50';
      defaultTextColor = 'text-[#5D3FD3] font-bold ';
      break;
  }

  if (disabled || isLoading) {
    variantClasses = 'bg-gray-300 dark:bg-slate-800 opacity-60 border-0';
    defaultTextColor = 'text-gray-500 font-semibold ';
  }

  const textSize = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-lg' : 'text-base';

  return (
    <TouchableOpacity
      className={`${baseClasses} ${variantClasses} ${className}`}
      onPress={onPress}
      disabled={disabled || isLoading}
      activeOpacity={0.8}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator color={variant === 'outline' ? '#5D3FD3' : 'white'} />
      ) : (
        <Text className={`${defaultTextColor} ${textSize} text-center ${textClassName}`}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
};
