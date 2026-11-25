export type CyberConfirmTone = 'danger' | 'warning' | 'primary';

export interface CyberConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: CyberConfirmTone;
}

export interface CyberConfirmRequest extends Required<CyberConfirmOptions> {
  resolve: (confirmed: boolean) => void;
}

export const CYBER_CONFIRM_EVENT = 'door-alert-cyber-confirm';

/**
 * 全局赛博风格确认弹窗（替代浏览器原生 window.confirm，不阻塞主线程）
 */
export function showCyberConfirm(options: CyberConfirmOptions | string): Promise<boolean> {
  const normalized: CyberConfirmOptions =
    typeof options === 'string' ? { message: options } : options;

  return new Promise<boolean>((resolve) => {
    const detail: CyberConfirmRequest = {
      title: normalized.title || '安全操作二次确认',
      message: normalized.message,
      confirmText: normalized.confirmText || '确认执行',
      cancelText: normalized.cancelText || '取消',
      tone: normalized.tone || 'danger',
      resolve,
    };
    window.dispatchEvent(new CustomEvent<CyberConfirmRequest>(CYBER_CONFIRM_EVENT, { detail }));
  });
}
