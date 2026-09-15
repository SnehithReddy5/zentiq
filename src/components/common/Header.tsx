import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ArrowLeft, Menu } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

interface HeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  showMenu?: boolean;
  onMenuPress?: () => void;
  rightElement?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  showBack = true,
  showMenu = false,
  onMenuPress,
  rightElement,
}) => {
  const navigation = useNavigation<any>();

  return (
    <View className="flex-row items-center justify-between px-4 py-3 bg-[#111827] border-b border-slate-800">
      <View className="flex-row items-center flex-1">
        {showBack && (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            className="mr-3 p-1 rounded-lg bg-slate-800"
          >
            <ArrowLeft size={20} color="#CBD5E1" />
          </TouchableOpacity>
        )}
        {showMenu && (
          <TouchableOpacity
            onPress={onMenuPress}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            className="mr-3 p-1 rounded-lg bg-slate-800"
          >
            <Menu size={20} color="#CBD5E1" />
          </TouchableOpacity>
        )}
        <View className="flex-1 mr-1.5">
          <Text className="text-lg font-bold text-white" numberOfLines={1}>
            {title}
          </Text>
          {subtitle && (
            <Text className="text-xs text-slate-400" numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      {rightElement && <View className="ml-2 shrink-0 flex-shrink-0">{rightElement}</View>}
    </View>
  );
};
