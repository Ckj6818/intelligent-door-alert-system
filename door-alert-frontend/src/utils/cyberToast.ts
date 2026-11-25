export type CyberToastTone = 'info' | 'success' | 'warning' | 'error';

export interface CyberToastItem {
  id: string;
  message: string;
  tone: CyberToastTone;
  durationMs: number;
}

const TOAST_EVENT = 'door-alert:cyber-toast';

export function showCyberToast(
  message: string,
  tone: CyberToastTone = 'info',
  durationMs = 3600,
): void {
  if (typeof window === 'undefined') return;
  const detail: CyberToastItem = {
    id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    message,
    tone,
    durationMs,
  };
  window.dispatchEvent(new CustomEvent<CyberToastItem>(TOAST_EVENT, { detail }));
}

export function subscribeCyberToast(handler: (item: CyberToastItem) => void): () => void {
  const listener = (e: Event) => {
    const ce = e as CustomEvent<CyberToastItem>;
    if (ce.detail) handler(ce.detail);
  };
  window.addEventListener(TOAST_EVENT, listener);
  return () => window.removeEventListener(TOAST_EVENT, listener);
}
