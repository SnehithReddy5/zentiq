import { useToastStore } from '../store/toast.store';

export const toast = {
  success: (message: string, title?: string, duration: number = 3500) => {
    useToastStore.getState().showToast({
      type: 'success',
      title: title || 'Success',
      message,
      duration,
    });
  },

  error: (message: string, title?: string, duration: number = 6000) => {
    useToastStore.getState().showToast({
      type: 'error',
      title: title || 'Error',
      message,
      duration,
    });
  },

  warning: (message: string, title?: string, duration: number = 5000) => {
    useToastStore.getState().showToast({
      type: 'warning',
      title: title || 'Notice',
      message,
      duration,
    });
  },

  info: (message: string, title?: string, duration: number = 4000) => {
    useToastStore.getState().showToast({
      type: 'info',
      title: title || 'Information',
      message,
      duration,
    });
  },
};
