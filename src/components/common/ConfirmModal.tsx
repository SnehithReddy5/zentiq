import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { useConfirmStore } from '../../store/confirm.store';
import { AlertCircle } from 'lucide-react-native';

export const ConfirmModal = () => {
  const { config, isOpen, closeConfirm } = useConfirmStore();
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen || !config) return null;

  const {
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    destructive = false,
    onConfirm,
    onCancel,
  } = config;

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      await onConfirm();
    } finally {
      setIsProcessing(false);
      closeConfirm();
    }
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    closeConfirm();
  };

  return (
    <Modal visible={true} transparent animationType="fade" onRequestClose={handleCancel}>
      <View className="flex-1 justify-center items-center bg-black/75 p-4 z-[999999]">
        <View className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
          <View className="flex-row items-center mb-3">
            <View
              className={`w-10 h-10 rounded-2xl items-center justify-center mr-3 ${
                destructive
                  ? 'bg-rose-500/15 border border-rose-500/30'
                  : 'bg-indigo-500/15 border border-indigo-500/30'
              }`}
            >
              <AlertCircle size={22} color={destructive ? '#F43F5E' : '#818CF8'} />
            </View>
            <Text className="text-white font-black text-lg flex-1" numberOfLines={1}>
              {title}
            </Text>
          </View>

          <Text className="text-slate-300 text-xs leading-relaxed mb-6">
            {message}
          </Text>

          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={handleCancel}
              disabled={isProcessing}
              className="flex-1 py-3 bg-slate-800 active:bg-slate-750 border border-slate-700 rounded-xl items-center justify-center"
            >
              <Text className="text-slate-300 font-bold text-xs">{cancelText}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleConfirm}
              disabled={isProcessing}
              className={`flex-1 py-3 rounded-xl items-center justify-center flex-row ${
                destructive
                  ? 'bg-rose-600 active:bg-rose-700'
                  : 'bg-[#5D3FD3] active:bg-[#4D32B8]'
              }`}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className="text-white font-black text-xs">{confirmText}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

