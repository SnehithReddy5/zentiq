import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToastStore } from '../../store/toast.store';
import { AlertTriangle, CheckCircle, AlertCircle, Info, X } from 'lucide-react-native';

export const FloatingToast = () => {
  const insets = useSafeAreaInsets();
  const { currentToast, hideToast } = useToastStore();

  if (!currentToast) return null;

  const { type, title, message, actionLabel, onAction, id } = currentToast;

  const getTheme = () => {
    switch (type) {
      case 'error':
        return {
          bg: 'bg-rose-950/95 border-rose-500/60 shadow-rose-500/30',
          indicator: 'bg-rose-500',
          titleColor: 'text-rose-200',
          textColor: 'text-rose-100',
          icon: <AlertTriangle size={20} color="#F43F5E" />,
        };
      case 'success':
        return {
          bg: 'bg-emerald-950/95 border-emerald-500/60 shadow-emerald-500/30',
          indicator: 'bg-emerald-500',
          titleColor: 'text-emerald-200',
          textColor: 'text-emerald-100',
          icon: <CheckCircle size={20} color="#10B981" />,
        };
      case 'warning':
        return {
          bg: 'bg-amber-950/95 border-amber-500/60 shadow-amber-500/30',
          indicator: 'bg-amber-500',
          titleColor: 'text-amber-200',
          textColor: 'text-amber-100',
          icon: <AlertCircle size={20} color="#F59E0B" />,
        };
      case 'info':
      default:
        return {
          bg: 'bg-indigo-950/95 border-indigo-500/60 shadow-indigo-500/30',
          indicator: 'bg-indigo-500',
          titleColor: 'text-indigo-200',
          textColor: 'text-indigo-100',
          icon: <Info size={20} color="#6366F1" />,
        };
    }
  };

  const theme = getTheme();

  return (
    <View
      style={{
        position: 'absolute',
        bottom: Math.max(insets.bottom + 16, 24),
        left: 16,
        right: 16,
        maxWidth: 520,
        alignSelf: 'center',
        zIndex: 999999,
        elevation: 30,
        pointerEvents: 'box-none',
      }}
    >
      <View
        className={`${theme.bg} border p-4 rounded-2xl shadow-2xl flex-row items-start backdrop-blur-xl`}
        style={{
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.5,
          shadowRadius: 20,
        }}
      >
        <View className="mr-3 mt-0.5">{theme.icon}</View>

        <View className="flex-1 mr-2">
          {Boolean(title) && (
            <Text className={`${theme.titleColor} font-black text-sm mb-0.5`}>
              {title}
            </Text>
          )}
          <Text className={`${theme.textColor} text-xs font-semibold leading-relaxed`}>
            {message}
          </Text>

          {Boolean(actionLabel && onAction) && (
            <TouchableOpacity
              onPress={() => {
                onAction?.();
                hideToast(id);
              }}
              className="mt-2.5 self-start px-3 py-1 bg-white/10 border border-white/20 rounded-lg active:bg-white/20"
            >
              <Text className="text-white font-bold text-xs">{actionLabel}</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          onPress={() => hideToast(id)}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          className="p-1 rounded-full bg-white/5 active:bg-white/20"
        >
          <X size={16} color="#94A3B8" />
        </TouchableOpacity>
      </View>
    </View>
  );
};
