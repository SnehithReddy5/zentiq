import { create } from 'zustand';

export interface ConfirmDialogConfig {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

interface ConfirmState {
  config: ConfirmDialogConfig | null;
  isOpen: boolean;
  openConfirm: (config: ConfirmDialogConfig) => void;
  closeConfirm: () => void;
}

export const useConfirmStore = create<ConfirmState>((set) => ({
  config: null,
  isOpen: false,
  openConfirm: (config) => set({ config, isOpen: true }),
  closeConfirm: () => set({ isOpen: false, config: null }),
}));

