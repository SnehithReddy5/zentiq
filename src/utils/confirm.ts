import { useConfirmStore, ConfirmDialogConfig } from '../store/confirm.store';

export type ConfirmDialogOptions = ConfirmDialogConfig;

/**
 * Universal confirmation dialog.
 * Opens an in-app React modal across Windows Electron, Web, Android, and iOS.
 * - Zero reliance on window.confirm (which blocks/freezes Chromium keyboard focus on Windows).
 * - Matches the dark POS design system.
 * - Dispatches onConfirm / onCancel safely without disrupting input focus.
 */
export const confirmDialog = (options: ConfirmDialogOptions) => {
  useConfirmStore.getState().openConfirm(options);
};
