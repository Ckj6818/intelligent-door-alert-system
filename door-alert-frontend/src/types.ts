export type Tab = 'dashboard' | 'workflow' | 'reports' | 'settings';

export interface Alert {
  id: string;
  time: string;
  date: string;
  device: string;
  type: 'Unidentified Person' | 'Known Personnel' | 'Unusual Activity' | string;
  typeBadge: 'error' | 'primary' | 'tertiary';
  imageSrc: string;
  status: 'Pending Review' | 'Auto-Cleared' | 'Investigating' | string;
  statusType: 'error' | 'success' | 'warning' | string;
  confidence: number;
  location: string;
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
  type: 'person' | 'vehicle' | 'motion';
}
