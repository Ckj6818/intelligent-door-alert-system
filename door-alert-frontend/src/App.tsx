import React, { useState, useEffect } from 'react';
import { Tab, Alert, TrashItem, DeviceStatus, LiveFeedItem } from './types';
import LoginScreen from './components/LoginScreen';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DashboardTab from './components/DashboardTab';
import AlertWorkflowTab from './components/AlertWorkflowTab';
import ReportsTab from './components/ReportsTab';
import SettingsTab from './components/SettingsTab';
import AlertPopup from './components/AlertPopup';
import { getDeviceList, getAlertList, getRecycleBin } from '@/api/index';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem('token') !== null);
  const [username, setUsername] = useState(() => localStorage.getItem('username') || 'Admin');
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Devices Heartbeat list state
  const [devices, setDevices] = useState<DeviceStatus[]>([]);

  // 2. Alert Workflow historical rows state
  const [alerts, setAlerts] = useState<Alert[]>([]);

  // 3. Recycle Bin logical elements
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);

  // 4. Live camera stream feed detections list
  const [liveFeed, setLiveFeed] = useState<LiveFeedItem[]>([]);

  // 5. Threat Alert pop-up state
  const [showThreatPopup, setShowThreatPopup] = useState(false);

  // Fetch initial REST data from Spring Boot
  const fetchTelemetryData = () => {
    if (!isLoggedIn) return;

    // Devices
    getDeviceList({ current: 1, size: 50 }).then((res: any) => {
      const records = res.records || [];
      const mappedDevices: DeviceStatus[] = records.map((d: any) => ({
        id: String(d.id),
        name: d.deviceName,
        ip: d.ip || '192.168.1.' + (100 + d.id),
        status: d.status === 1 ? 'online' : 'offline',
        latency: d.status === 1 ? Math.floor(Math.random() * 15) + 5 : 0,
        lastTimeout: d.status === 0 ? '04:22' : undefined
      }));
      setDevices(mappedDevices);
    }).catch(err => console.error('Failed to fetch devices', err));

    // Alerts
    getAlertList({ current: 1, size: 50 }).then((res: any) => {
      const records = res.records || [];
      const mappedAlerts: Alert[] = records.map((rawAlert: any) => ({
        id: 'AL-' + rawAlert.id,
        time: new Date(rawAlert.createTime).toLocaleTimeString(),
        date: new Date(rawAlert.createTime).toISOString().split('T')[0],
        device: rawAlert.deviceName || `监控摄像头_${rawAlert.deviceId}`,
        type: rawAlert.dangerLevel >= 3 ? '陌生人员入侵' : '异常活动检测',
        typeBadge: rawAlert.dangerLevel >= 3 ? 'error' : 'tertiary',
        imageSrc: rawAlert.imageUrl || '',
        status: rawAlert.status === 1 ? '已处理' : '待复核',
        statusType: rawAlert.status === 1 ? 'success' : 'error',
        confidence: rawAlert.proximityRatio || 0.9,
        location: rawAlert.location || '监控核心区域'
      }));
      setAlerts(mappedAlerts);

      // Map live feed from active alerts
      const mappedFeed: LiveFeedItem[] = mappedAlerts.slice(0, 10).map((a: any) => ({
        id: 'F-' + a.id.replace('AL-', ''),
        title: a.type,
        time: a.time.slice(0, 5),
        zone: a.location,
        imageSrc: a.imageSrc,
        confidence: `${Math.round(a.confidence * 100)}%`,
        type: a.type === '陌生人员入侵' ? 'person' : 'motion'
      }));
      setLiveFeed(mappedFeed);
    }).catch(err => console.error('Failed to fetch alerts', err));

    // Recycle Bin (Trash)
    getRecycleBin().then((res: any) => {
      const list = res || [];
      const mappedTrash: TrashItem[] = list.map((item: any) => ({
        id: String(item.id),
        name: `${item.deviceName || '摄像机'}_告警日志_${item.id}`,
        deletedTime: '已删除于 ' + new Date(item.updateTime || item.createTime).toLocaleDateString()
      }));
      setTrashItems(mappedTrash.slice(0, 24));
    }).catch(err => console.error('Failed to fetch recycle bin', err));
  };

  useEffect(() => {
    fetchTelemetryData();
  }, [isLoggedIn]);

  // Auth expiration listener
  useEffect(() => {
    const handleAuthExpired = () => {
      setIsLoggedIn(false);
      localStorage.removeItem('token');
      localStorage.removeItem('user_role');
      localStorage.removeItem('username');
    };
    window.addEventListener('auth-expired', handleAuthExpired);
    return () => {
      window.removeEventListener('auth-expired', handleAuthExpired);
    };
  }, []);

  // WebSocket Live Real-Time Feeds
  useEffect(() => {
    if (!isLoggedIn) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: any = null;

    const connectWs = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/ws/alerts`;
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
          console.log('WebSocket Connection Opened');
        };

        socket.onmessage = (event) => {
          try {
            const rawAlert = JSON.parse(event.data);
            if (!rawAlert?.id) return;

            const mappedAlert: Alert = {
              id: 'AL-' + rawAlert.id,
              time: new Date(rawAlert.createTime).toLocaleTimeString(),
              date: new Date(rawAlert.createTime).toISOString().split('T')[0],
              device: rawAlert.deviceName || `监控摄像头_${rawAlert.deviceId}`,
              type: rawAlert.dangerLevel >= 3 ? '陌生人员入侵' : '异常活动检测',
              typeBadge: rawAlert.dangerLevel >= 3 ? 'error' : 'tertiary',
              imageSrc: rawAlert.imageUrl || '',
              status: rawAlert.status === 1 ? '已处理' : '待复核',
              statusType: rawAlert.status === 1 ? 'success' : 'error',
              confidence: rawAlert.proximityRatio || 0.9,
              location: rawAlert.location || '监控核心区域'
            };

            // Prepend alert log
            setAlerts(prev => {
              if (prev.some(a => a.id === mappedAlert.id)) return prev;
              return [mappedAlert, ...prev];
            });

            // Map and prepend live feed stream item
            const mappedFeed: LiveFeedItem = {
              id: 'F-' + rawAlert.id,
              title: mappedAlert.type,
              time: mappedAlert.time.slice(0, 5),
              zone: mappedAlert.location,
              imageSrc: mappedAlert.imageSrc,
              confidence: `${Math.round(mappedAlert.confidence * 100)}%`,
              type: rawAlert.dangerLevel >= 3 ? 'person' : 'motion'
            };

            setLiveFeed(prev => {
              if (prev.some(f => f.id === mappedFeed.id)) return prev;
              return [mappedFeed, ...prev];
            });

            if (rawAlert.dangerLevel >= 3) {
              setShowThreatPopup(true);
              try {
                const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(880, audioCtx.currentTime);
                gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
                osc.start();
                setTimeout(() => osc.stop(), 400);
              } catch (e) {
                // Ignore audio autoplay restrictions
              }
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

        socket.onerror = (err) => {
          console.error('WebSocket encountered error', err);
          socket?.close();
        };
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

  // Triggered by "Trigger Breach Attempt" helper button on Dashboard
  const triggerThreatEvent = () => {
    setShowThreatPopup(true);
    // Sound mock feedback
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // High alarm frequency
      gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
      osc.start();
      setTimeout(() => osc.stop(), 400);
    } catch (e) {
      // Audio context may be blocked by browser user gesture, ignore safely
    }
  };

  // Handles Dispatch action from popup
  const handleDispatchForces = () => {
    setShowThreatPopup(false);
    
    // Add threat to active list table dynamically
    const newIncident: Alert = {
      id: 'AL-' + Math.floor(Math.random() * 800 + 100),
      time: new Date().toLocaleTimeString(),
      date: new Date().toISOString().split('T')[0],
      device: '红外线传感器_12',
      type: '可疑人员入侵',
      typeBadge: 'error',
      imageSrc: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBWoWqbKOIeTYFF7V3ILetfIWcFmTqN1CE-Ki1rsjmW3zXZlwZiamXU3BzsqpTYjJvG1Ax8_YEgjOTbAhMqc0b0qNZJ__h8ObQ6jHEbdtaXEhV3zPXNxZXdyhv3qjzLMksaxoujFjmGRrs9CLbiZtbSfHtFjHVryMPyvfUXtCxNo4NZRjiUNcpAIMu35jaAm_d9tnLocqKUUJYLKgUNbl44AbVDdhgCRfVLoSiFbpHTU0HJtDeTeewp',
      status: '待复核',
      statusType: 'error',
      confidence: 0.99,
      location: '北侧栅栏 12 号防区'
    };

    setAlerts(prev => [newIncident, ...prev]);

    // Add to live feed as well
    const newFeed: LiveFeedItem = {
      id: 'F-' + Date.now().toString().slice(-4),
      title: '已派遣安保核实',
      time: new Date().toLocaleTimeString().slice(0, 5),
      zone: '北防区 12段',
      imageSrc: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBWoWqbKOIeTYFF7V3ILetfIWcFmTqN1CE-Ki1rsjmW3zXZlwZiamXU3BzsqpTYjJvG1Ax8_YEgjOTbAhMqc0b0qNZJ__h8ObQ6jHEbdtaXEhV3zPXNxZXdyhv3qjzLMksaxoujFjmGRrs9CLbiZtbSfHtFjHVryMPyvfUXtCxNo4NZRjiUNcpAIMu35jaAm_d9tnLocqKUUJYLKgUNbl44AbVDdhgCRfVLoSiFbpHTU0HJtDeTeewp',
      confidence: '99.4%',
      type: 'person'
    };
    setLiveFeed(prev => [newFeed, ...prev]);

    alert('安保调度成功：响应小队已立即前往北侧栅栏 12 号段核实。');
  };

  const handleIgnoreForces = () => {
    setShowThreatPopup(false);
    alert('警报已忽略：事件已被标记为常规运动过滤归档。');
  };

  // Render correct tab based on activeTab state
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
              // Simulates updating neural confidence
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
      {/* Subtle digital background grids */}
      <div className="fixed inset-0 bg-pattern pointer-events-none z-0 opacity-40" />

      {/* Main sidebar component */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        username={username}
        onLogout={handleLogout}
      />

      {/* Primary header bar */}
      <Header 
        searchQuery={searchQuery} 
        setSearchQuery={setSearchQuery} 
        username={username} 
      />

      {/* Main Content viewport scrollable area */}
      <main className="ml-[280px] pt-24 px-8 min-h-screen z-10 relative">
        <div className="max-w-[1600px] mx-auto">
          {renderTabContent()}
        </div>
      </main>

      {/* High risk threat popup */}
      {showThreatPopup && (
        <AlertPopup 
          onClose={() => setShowThreatPopup(false)}
          onDispatch={handleDispatchForces}
          onIgnore={handleIgnoreForces}
        />
      )}
    </div>
  );
}
