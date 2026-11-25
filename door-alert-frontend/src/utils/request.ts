import axios from 'axios';
import { showCyberToast } from './cyberToast';

const service = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

service.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    console.error('Request sending error: ', error);
    return Promise.reject(error);
  }
);

service.interceptors.response.use(
  (response) => {
    const res = response.data;

    // Successful REST call format: { code: 200, data: ..., message: ... }
    if (res && res.code === 200) {
      return res.data;
    }

    const message = res?.message || res?.msg || '请求失败，请稍后重试';

    if (res?.code === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user_role');
      window.dispatchEvent(new Event('auth-expired'));
      return Promise.reject(new Error(message));
    }

    if (res?.code === 403) {
      showCyberToast(message || '权限不足，拒绝访问', 'warning');
      return Promise.reject(new Error(message));
    }

    showCyberToast(message, 'error');
    return Promise.reject(new Error(message));
  },
  (error) => {
    const status = error.response?.status;
    const rawMsg = error.response?.data?.message || error.message || '';
    const messageMap: Record<number, string> = {
      400: '请求参数有误',
      401: '登录会话已过期，请重新登录',
      403: '权限不足，拒绝访问',
      404: '请求的接口资源不存在',
      500: '服务器内部异常，请稍后重试',
      502: '网关连接异常',
      503: '后端服务暂不可用',
    };
    const msg = messageMap[status] || `网络连接异常：${rawMsg}`;

    if (rawMsg.includes('CORS') || rawMsg.includes('cors')) {
      showCyberToast('跨域请求受限，请通过 http://localhost:5173 访问系统', 'warning');
      return Promise.reject(error);
    }

    if (status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user_role');
      window.dispatchEvent(new Event('auth-expired'));
      return Promise.reject(new Error(rawMsg || msg));
    }

    if (status === 403) {
      showCyberToast(rawMsg || msg || '权限不足，拒绝访问', 'warning');
      return Promise.reject(new Error(rawMsg || msg));
    }

    showCyberToast(msg, 'error');
    return Promise.reject(error);
  }
);

export default service;
