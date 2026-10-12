import React, { useCallback, useEffect, useState } from 'react';
import { Tab, Alert, TrashItem, DeviceStatus, LiveFeedItem, AlertPayload, PassageNotice } from './types';
import LoginScreen from './components/LoginScreen';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DashboardTab from './components/DashboardTab';
import AlertWorkflowTab from './components/AlertWorkflowTab';
import ReportsTab from './components/ReportsTab';
import SettingsTab from './components/SettingsTab';
import AlertPopup from './components/AlertPopup';
import PassageToast from './components/PassageToast';
import AuthorizedUsersModal from './components/AuthorizedUsersModal';
import { getDeviceList, getAlertList, getRecycleBin, handleAlert } from '@/api/index';
import {
  mapToAlert,
  mapToLiveFeed,
  playPassageChime,
  playThreatAlarm,
  resolveAlertId,
  resolveAuthStatus,
  resolveAreaRatio,
} from './utils/alertMapper';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem('token') !== null);
  const [username, setUsername] = useState(() => localStorage.getItem('username') || 'Admin');
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');

  const [devices, setDevices] = useState<DeviceStatus[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [liveFeed, setLiveFeed] = useState<LiveFeedItem[]>([]);

  const [showThreatPopup, setShowThreatPopup] = useState(false);
  const [activeThreat, setActiveThreat] = useState<Alert | null>(null);
  const [passageNotices, setPassageNotices] = useState<PassageNotice[]>([]);
  const [showWhitelistModal, setShowWhitelistModal] = useState(false);

  const dismissPassageNotice = useCallback((id: string) => {
    setPassageNotices((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const fetchTelemetryData = () => {
    if (!isLoggedIn) return;

    getDeviceList({ current: 1, size: 50 }).then((res: any) => {
      const records = res.records || [];
      const mappedDevices: DeviceStatus[] = records.map((d: any) => ({
        id: String(d.id),
        name: d.deviceName,
        ip: d.ip || '192.168.1.' + (100 + d.id),
        status: d.status === 1 ? 'online' : 'offline',
        latency: d.status === 1 ? Math.floor(Math.random() * 15) + 5 : 0,
        lastTimeout: d.status === 0 ? '04:22' : undefined,
      }));
      setDevices(mappedDevices);
    }).catch((err) => console.error('Failed to fetch devices', err));

    getAlertList({ current: 1, size: 50 }).then((res: any) => {
      const records = res.records || [];
      const mappedAlerts: Alert[] = records.map((raw: any) =>
        mapToAlert({
          ...raw,
          alertId: raw.id,
          alertLevel: raw.dangerLevel,
          areaRatio: raw.proximityRatio,
          authStatus: raw.authStatus,
          recognizedName: raw.recognizedName,
        })
      );
      setAlerts(mappedAlerts);

      const mappedFeed: LiveFeedItem[] = mappedAlerts.slice(0, 10).map(mapToLiveFeed);
      setLiveFeed(mappedFeed);
    }).catch((err) => console.error('Failed to fetch alerts', err));

    getRecycleBin().then((res: any) => {
      const list = res || [];
      const mappedTrash: TrashItem[] = list.map((item: any) => ({
        id: String(item.id),
        name: `${item.deviceName || '摄像机'}_告警日志_${item.id}`,
        deletedTime: '已删除于 ' + new Date(item.updateTime || item.createTime).toLocaleDateString(),
      }));
      setTrashItems(mappedTrash.slice(0, 24));
    }).catch((err) => {
      console.warn('Recycle bin fetch skipped or restricted:', err);
      setTrashItems([]);
    });
  };

  useEffect(() => {
    fetchTelemetryData();
  }, [isLoggedIn]);

  useEffect(() => {
    const handleAuthExpired = () => {
      setIsLoggedIn(false);
      localStorage.removeItem('token');
      localStorage.removeItem('user_role');
      localStorage.removeItem('username');
    };
    window.addEventListener('auth-expired', handleAuthExpired);
    return () => window.removeEventListener('auth-expired', handleAuthExpired);
  }, []);

  // WebSocket：按 authStatus 分流 AUTHORIZED / UNAUTHORIZED
  useEffect(() => {
    if (!isLoggedIn) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connectWs = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/ws/alerts`;
        socket = new WebSocket(wsUrl);

        socket.onopen = () => console.log('WebSocket Connection Opened');

        socket.onmessage = (event) => {
          try {
            const rawAlert: AlertPayload = JSON.parse(event.data);
            const eventId = resolveAlertId(rawAlert);
            if (eventId === null) return;

            const authStatus = resolveAuthStatus(rawAlert);
            const mappedAlert = mapToAlert(rawAlert);

            // ---- 授权通行：绿色徽章 + 轻提示音，不弹高危红框 ----
            if (authStatus === 'AUTHORIZED' || rawAlert.eventType === 'PASSAGE') {
              playPassageChime();
              const notice: PassageNotice = {
                id: `PASS-${eventId}-${Date.now()}`,
                recognizedName: mappedAlert.recognizedName || '授权人员',
                time: mappedAlert.time,
                areaRatio: resolveAreaRatio(rawAlert),
                imageUrl: mappedAlert.imageSrc,
              };
              setPassageNotices((prev) => [notice, ...prev].slice(0, 4));

              const feedItem = mapToLiveFeed(mappedAlert);
              setLiveFeed((prev) => {
                if (prev.some((f) => f.id === feedItem.id)) return prev;
                return [feedItem, ...prev];
              });
              return;
            }

            // ---- 未授权 / 高危：写入列表 + 中心强提醒 ----
            setAlerts((prev) => {
              if (prev.some((a) => a.id === mappedAlert.id)) return prev;
              return [mappedAlert, ...prev];
            });

            const mappedFeed = mapToLiveFeed(mappedAlert);
            setLiveFeed((prev) => {
              if (prev.some((f) => f.id === mappedFeed.id)) return prev;
              return [mappedFeed, ...prev];
            });

            const isUnauthorized =
              authStatus === 'UNAUTHORIZED' ||
              rawAlert.eventType === 'ALERT' ||
              (authStatus === undefined && resolveAreaRatio(rawAlert) >= 0 && (rawAlert.alertLevel ?? rawAlert.dangerLevel ?? 0) >= 3);

            if (isUnauthorized) {
              setActiveThreat(mappedAlert);
              setShowThreatPopup(true);
              playThreatAlarm();
            }
          } catch (e) {
            console.error('WebSocket parse error', e);
          }
        };

        socket.onclose = () => {
          console.warn('WebSocket Closed. Attempting reconnect in 3s...');
          socket = null;
          reconnectTimer = setTimeout(connectWs, 3000);
        };

        socket.onerror = () => socket?.close();
      } catch (e) {
        console.error('WebSocket setup error', e);
        reconnectTimer = setTimeout(connectWs, 3000);
      }
    };

    connectWs();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, [isLoggedIn]);

  const handleLoginSuccess = (user: string) => {
    setUsername(user);
    setIsLoggedIn(true);
    localStorage.setItem('username', user);
  };

  const handleLogout = () => {
    if (confirm('确认退出当前操作员系统会话？')) {
      setIsLoggedIn(false);
      localStorage.removeItem('token');
      localStorage.removeItem('user_role');
      localStorage.removeItem('username');
      setSearchQuery('');
    }
  };

  const triggerThreatEvent = () => {
    const demo: Alert = {
      id: 'AL-DEMO',
      rawId: 'DEMO',
      time: new Date().toLocaleTimeString(),
      date: new Date().toISOString().split('T')[0],
      device: '前门摄像头-A01',
      type: '陌生人员入侵 · 未授权人员/陌生人',
      typeBadge: 'error',
      imageSrc: '',
      status: '待复核',
      statusType: 'error',
      confidence: 0.42,
      location: '门禁核心防区',
      authStatus: 'UNAUTHORIZED',
      recognizedName: '未授权人员/陌生人',
      areaRatio: 0.42,
      alertLevel: 3,
    };
    setActiveThreat(demo);
    setShowThreatPopup(true);
    playThreatAlarm();
  };

  const closeThreatPopup = () => {
    setShowThreatPopup(false);
    setActiveThreat(null);
  };

  /** 派单处置：标记已处理并关闭弹窗 */
  const handleDispatchForces = () => {
    const target = activeThreat;
    closeThreatPopup();
    if (target && target.rawId !== 'DEMO') {
      handleAlert(target.rawId)
        .then(() => {
          setAlerts((prev) =>
            prev.map((a) =>
              a.id === target.id
                ? { ...a, status: '已处理', statusType: 'success' }
                : a
            )
          );
        })
        .catch((err) => console.warn('派单处置 API 失败', err));
    }
    setActiveTab('workflow');
    alert('派单处置已提交：安保小队已接收工单，请在告警工作流中跟踪进度。');
  };

  /** 确认误报：标记已处理 */
  const handleIgnoreForces = () => {
    const target = activeThreat;
    closeThreatPopup();
    if (target && target.rawId !== 'DEMO') {
      handleAlert(target.rawId)
        .then(() => {
          setAlerts((prev) =>
            prev.map((a) =>
              a.id === target.id
                ? { ...a, status: '已处理', statusType: 'success', type: '误报已确认' }
                : a
            )
          );
        })
        .catch((err) => console.warn('确认误报 API 失败', err));
    } else {
      setAlerts((prev) => prev.filter((a) => a.id !== target?.id));
    }
    alert('已确认误报：事件已归档为常规过滤。');
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardTab
            searchQuery={searchQuery}
            devices={devices}
            setDevices={setDevices}
            liveFeed={liveFeed}
            setLiveFeed={setLiveFeed}
            triggerThreatEvent={triggerThreatEvent}
            alerts={alerts}
          />
        );
      case 'workflow':
        return (
          <AlertWorkflowTab
            searchQuery={searchQuery}
            alerts={alerts}
            setAlerts={setAlerts}
            trashItems={trashItems}
            setTrashItems={setTrashItems}
            setLiveFeed={setLiveFeed}
          />
        );
      case 'reports':
        return <ReportsTab searchQuery={searchQuery} />;
      case 'settings':
        return (
          <SettingsTab
            onThresholdChange={(newThreshold) => {
              console.log('New neural thresh:', newThreshold);
            }}
          />
        );
      default:
        return (
          <DashboardTab
            searchQuery={searchQuery}
            devices={devices}
            setDevices={setDevices}
            liveFeed={liveFeed}
            setLiveFeed={setLiveFeed}
            triggerThreatEvent={triggerThreatEvent}
            alerts={alerts}
          />
        );
    }
  };

  if (!isLoggedIn) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-cyber-bg text-on-surface font-sans selection:bg-cyber-primary/30 relative">
      <div className="fixed inset-0 bg-pattern pointer-events-none z-0 opacity-40" />

      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        username={username}
        onLogout={handleLogout}
      />

      <Header
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        username={username}
        alerts={alerts}
        setActiveTab={setActiveTab}
        onOpenWhitelist={() => setShowWhitelistModal(true)}
      />

      <main className="ml-[280px] pt-24 px-8 min-h-screen z-10 relative">
        <div className="max-w-[1600px] mx-auto">{renderTabContent()}</div>
      </main>

      {/* 右上角授权通行通知栈 */}
      <div className="fixed top-20 right-6 z-[105] flex flex-col gap-3 pointer-events-none">
        {passageNotices.map((notice) => (
          <PassageToast key={notice.id} notice={notice} onDismiss={dismissPassageNotice} />
        ))}
      </div>

      {showThreatPopup && (
        <AlertPopup
          alert={activeThreat}
          onClose={closeThreatPopup}
          onDispatch={handleDispatchForces}
          onIgnore={handleIgnoreForces}
        />
      )}

      <AuthorizedUsersModal
        open={showWhitelistModal}
        onClose={() => setShowWhitelistModal(false)}
      />
    </div>
  );
}
