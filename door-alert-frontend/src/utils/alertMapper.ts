import type { Alert, AlertPayload, AuthStatus, LiveFeedItem } from '../types';

/** 音频实现统一在 audioFeedback.ts，此处仅再导出供旧 import 路径兼容 */
export { playThreatAlarm, playPassageChime } from './audioFeedback';

export function resolveAuthStatus(raw: AlertPayload): AuthStatus | undefined {
  const status = (raw.authStatus || '').toString().toUpperCase();
  if (status === 'AUTHORIZED' || status === 'UNAUTHORIZED') {
    return status;
  }
  if (raw.eventType === 'PASSAGE') return 'AUTHORIZED';
  if (raw.eventType === 'ALERT') return 'UNAUTHORIZED';
  return undefined;
}

export function resolveAlertId(raw: AlertPayload): string | number | null {
  const id = raw.alertId ?? raw.id;
  return id === undefined || id === null ? null : id;
}

export function resolveAreaRatio(raw: AlertPayload): number {
  const value = raw.areaRatio ?? raw.proximityRatio;
  return typeof value === 'number' && !Number.isNaN(value) ? value : 0;
}

export function resolveAlertLevel(raw: AlertPayload): number {
  const level = raw.alertLevel ?? raw.dangerLevel;
  return typeof level === 'number' ? level : 0;
}

export function resolveTimestamp(raw: AlertPayload): Date {
  const ts = raw.timestamp || raw.createTime;
  const date = ts ? new Date(ts) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

/** REST / WS 原始记录 → 工作流 Alert 行 */
export function mapToAlert(raw: AlertPayload): Alert {
  const id = resolveAlertId(raw);
  const authStatus = resolveAuthStatus(raw);
  const areaRatio = resolveAreaRatio(raw);
  const alertLevel = resolveAlertLevel(raw);
  const when = resolveTimestamp(raw);
  const recognizedName = raw.recognizedName?.trim() || '';

  let type = '异常活动检测';
  let typeBadge: Alert['typeBadge'] = 'tertiary';

  if (authStatus === 'AUTHORIZED') {
    type = `授权通行 · ${recognizedName || '已知人员'}`;
    typeBadge = 'success';
  } else if ((raw.alertType || '').toUpperCase() === 'TAILGATING') {
    type = '尾随闯入';
    typeBadge = 'warning';
  } else if ((raw.alertType || '').toUpperCase() === 'LOITERING') {
    type = '遮挡徘徊';
    typeBadge = 'tertiary';
  } else if (authStatus === 'UNAUTHORIZED' || alertLevel >= 3) {
    type = recognizedName
      ? `陌生人员入侵 · ${recognizedName}`
      : '陌生人员入侵';
    typeBadge = 'error';
  } else if (alertLevel >= 2) {
    type = '异常活动检测';
    typeBadge = 'tertiary';
  }

  return {
    id: 'AL-' + id,
    rawId: id ?? '',
    time: when.toLocaleTimeString(),
    date: when.toISOString().split('T')[0],
    device: raw.deviceName || `监控摄像头_${raw.deviceId ?? '?'}`,
    type,
    typeBadge,
    imageSrc: raw.imageUrl || '',
    status: raw.status === 1 ? '已处理' : '待复核',
    statusType: raw.status === 1 ? 'success' : 'error',
    confidence: areaRatio || 0.9,
    location: raw.location || '门禁核心防区',
    authStatus,
    recognizedName,
    areaRatio,
    alertLevel,
    alertType: (raw.alertType || 'INTRUSION').toString().toUpperCase(),
  };
}

export function mapToLiveFeed(alert: Alert): LiveFeedItem {
  return {
    id: 'F-' + String(alert.rawId),
    title: alert.type,
    time: alert.time.slice(0, 5),
    zone: alert.location,
    imageSrc: alert.imageSrc,
    confidence: `${Math.round((alert.areaRatio ?? alert.confidence) * 100)}%`,
    type:
      alert.authStatus === 'AUTHORIZED'
        ? 'authorized'
        : alert.authStatus === 'UNAUTHORIZED' || alert.typeBadge === 'error'
          ? 'person'
          : 'motion',
  };
}
