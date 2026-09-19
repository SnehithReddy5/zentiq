import { create } from 'zustand';

export interface ToastConfig {
  id?: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  duration?: number; // In ms. Default 4000ms. 0 for persistent.
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastState {
  currentToast: ToastConfig | null;
  showToast: (toast: ToastConfig) => void;
  hideToast: (id?: string) => void;
}

let toastTimer: any = null;

export const useToastStore = create<ToastState>((set, get) => ({
  currentToast: null,

  showToast: (toast) => {
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }

    const toastId = toast.id || `toast_${Date.now()}`;
    const configuredToast: ToastConfig = {
      ...toast,
      id: toastId,
      duration: toast.duration !== undefined ? toast.duration : (toast.type === 'error' ? 6000 : 4000),
    };

    set({ currentToast: configuredToast });

    if (configuredToast.duration && configuredToast.duration > 0) {
      toastTimer = setTimeout(() => {
        const active = get().currentToast;
        if (active && active.id === toastId) {
          set({ currentToast: null });
        }
      }, configuredToast.duration);
    }
  },

  hideToast: (id) => {
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    const active = get().currentToast;
    if (!id || (active && active.id === id)) {
      set({ currentToast: null });
    }
  },
}));
