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
          bg: 'bg-slate-900 border-rose-500/40 shadow-rose-950/50',
          titleColor: 'text-rose-400',
          textColor: 'text-slate-300',
          icon: <AlertTriangle size={18} color="#F43F5E" />,
        };
      case 'success':
        return {
          bg: 'bg-slate-900 border-emerald-500/40 shadow-emerald-950/50',
          titleColor: 'text-emerald-400',
          textColor: 'text-slate-300',
          icon: <CheckCircle size={18} color="#10B981" />,
        };
      case 'warning':
        return {
          bg: 'bg-slate-900 border-amber-500/40 shadow-amber-950/50',
          titleColor: 'text-amber-400',
          textColor: 'text-slate-300',
          icon: <AlertCircle size={18} color="#F59E0B" />,
        };
      case 'info':
      default:
        return {
          bg: 'bg-slate-900 border-indigo-500/40 shadow-indigo-950/50',
          titleColor: 'text-indigo-400',
          textColor: 'text-slate-300',
          icon: <Info size={18} color="#818CF8" />,
        };
    }
  };

  const theme = getTheme();

  return (
    <View
      style={{
        position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as any,
        bottom: Math.max(insets.bottom + 16, 24),
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 999999,
        elevation: 30,
        pointerEvents: 'box-none',
      }}
    >
      <View
        className={`${theme.bg} border p-3.5 sm:p-4 rounded-2xl shadow-2xl flex-row items-center backdrop-blur-xl mx-4`}
        style={{
          maxWidth: 480,
          width: '100%',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.6,
          shadowRadius: 20,
        }}
      >
        <View className="mr-3">{theme.icon}</View>

        <View className="flex-1 mr-2">
          {Boolean(title) && (
            <Text className={`${theme.titleColor} font-black text-sm mb-0.5`}>
              {title}
            </Text>
          )}
          <Text className={`${theme.textColor} text-xs font-medium leading-relaxed`}>
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
