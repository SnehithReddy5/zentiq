import { Alert, Platform } from 'react-native';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

/**
 * Universal cross-platform confirmation dialog.
 * Works consistently across Windows Electron, Web, Android, and iOS.
 * - On Windows / Web: Uses window.confirm (native browser modal that works in React Native Web)
 * - On Mobile (Android / iOS): Uses native Alert.alert with styled action buttons
 */
export const confirmDialog = ({
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogOptions) => {
  if (Platform.OS === 'web') {
    const fullMessage = title ? `${title}\n\n${message}` : message;
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      const confirmed = window.confirm(fullMessage);
      if (confirmed) {
        onConfirm();
      } else if (onCancel) {
        onCancel();
      }
    } else {
      onConfirm();
    }
    return;
  }

  // Native Android & iOS
  Alert.alert(title, message, [
    {
      text: cancelText,
      style: 'cancel',
      onPress: onCancel,
    },
    {
      text: confirmText,
      style: destructive ? 'destructive' : 'default',
      onPress: onConfirm,
    },
  ]);
};

