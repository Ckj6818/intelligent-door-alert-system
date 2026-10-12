export type Tab = 'dashboard' | 'workflow' | 'reports' | 'settings';

/** 人脸授权状态 */
export type AuthStatus = 'AUTHORIZED' | 'UNAUTHORIZED';

/**
 * WebSocket / 边缘上报实时载荷（与后端 AlertWsPayload 对齐）
 */
export interface AlertPayload {
  alertId?: number | string;
  /** 兼容旧字段 */
  id?: number | string;
  authStatus?: AuthStatus | string;
  recognizedName?: string;
  areaRatio?: number;
  /** 兼容旧接近度字段 */
  proximityRatio?: number;
  alertLevel?: number;
  /** 兼容旧危险等级字段 */
  dangerLevel?: number;
  imageUrl?: string;
  timestamp?: string;
  createTime?: string;
  eventType?: 'ALERT' | 'PASSAGE' | string;
  deviceId?: number | string;
  deviceName?: string;
  status?: number;
  location?: string;
}

export interface Alert {
  id: string;
  rawId: string | number;
  time: string;
  date: string;
  device: string;
  type: 'Unidentified Person' | 'Known Personnel' | 'Unusual Activity' | string;
  typeBadge: 'error' | 'primary' | 'tertiary' | 'success';
  imageSrc: string;
  status: 'Pending Review' | 'Auto-Cleared' | 'Investigating' | string;
  statusType: 'error' | 'success' | 'warning' | string;
  confidence: number;
  location: string;
  authStatus?: AuthStatus | string;
  recognizedName?: string;
  areaRatio?: number;
  alertLevel?: number;
}

/** 授权通行右上角通知 */
export interface PassageNotice {
  id: string;
  recognizedName: string;
  time: string;
  areaRatio?: number;
  imageUrl?: string;
}

/** 授权人员白名单 */
export interface AuthorizedUser {
  id: number | string;
  userCode: string;
  name: string;
  department?: string;
  avatarUrl?: string;
  status: number;
  createTime?: string;
}

export interface TrashItem {
  id: string;
  name: string;
  deletedTime: string;
}

export interface NodeReport {
  nodeId: string;
  dataType: string;
  totalEvents: number;
  criticality: 'LOW' | 'MED' | 'HIGH';
  avgResponse: string;
  lastAggregation: string;
}

export interface SystemUser {
  id: string;
  username: string;
  role: 'Admin' | 'Operator' | string;
  status: 'Active' | 'Offline';
  initials: string;
}

export interface DeviceStatus {
  id: string;
  name: string;
  ip: string;
  status: 'online' | 'offline';
  latency: number;
  lastTimeout?: string;
}

export interface LiveFeedItem {
  id: string;
  title: string;
  time: string;
  zone: string;
  imageSrc: string;
  confidence: string;
  type: 'person' | 'vehicle' | 'motion' | 'authorized';
}
