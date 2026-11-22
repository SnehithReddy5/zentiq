import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ArrowLeft, Menu, Sun, Moon } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useThemeStore } from '../../store/theme.store';

interface HeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  showMenu?: boolean;
  onMenuPress?: () => void;
  rightElement?: React.ReactNode;
  showThemeToggle?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  showBack = true,
  showMenu = false,
  onMenuPress,
  rightElement,
  showThemeToggle = true,
}) => {
  const navigation = useNavigation<any>();
  const { themeMode, toggleTheme } = useThemeStore();
  const isDark = themeMode === 'dark';

  return (
    <View
      className={`flex-row items-center justify-between px-3.5 sm:px-4 py-2.5 sm:py-3 border-b ${
        isDark ? 'bg-[#111827] border-slate-800' : 'bg-white border-slate-200'
      }`}
    >
      <View className="flex-row items-center flex-1 min-w-0 mr-2">
        {showBack && (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            className={`mr-2.5 p-1.5 rounded-lg border ${
              isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
            }`}
          >
            <ArrowLeft size={18} color={isDark ? '#CBD5E1' : '#475569'} />
          </TouchableOpacity>
        )}
        {showMenu && (
          <TouchableOpacity
            onPress={onMenuPress}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            className={`mr-2.5 p-1.5 rounded-lg border ${
              isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
            }`}
          >
            <Menu size={18} color={isDark ? '#CBD5E1' : '#475569'} />
          </TouchableOpacity>
        )}
        <View className="flex-1 min-w-0 mr-1.5">
          <Text
            className={`text-base sm:text-lg font-bold shrink ${
              isDark ? 'text-white' : 'text-slate-900'
            }`}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {title}
          </Text>
          {subtitle && (
            <Text
              className={`text-[11px] sm:text-xs shrink ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {subtitle}
            </Text>
          )}
        </View>
      </View>

      <View className="flex-row items-center gap-1.5 sm:gap-2 shrink-0">
        {showThemeToggle && (
          <TouchableOpacity
            onPress={toggleTheme}
            className={`p-1.5 sm:p-2 rounded-xl border active:opacity-80 ${
              isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-300'
            }`}
            accessibilityLabel="Toggle Theme Mode"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {isDark ? (
              <Sun size={16} color="#FBBF24" />
            ) : (
              <Moon size={16} color="#6366F1" />
            )}
          </TouchableOpacity>
        )}
        {rightElement && <View className="shrink-0">{rightElement}</View>}
      </View>
    </View>
  );
};
