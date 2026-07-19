import axios from 'axios';

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

    const message = res?.message || res?.msg || 'Request failed, please try again later';

    if (res?.code === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user_role');
      window.dispatchEvent(new Event('auth-expired'));
      return Promise.reject(new Error(message));
    }

    if (res?.code === 403) {
      alert(message || '权限不足，拒绝访问');
      return Promise.reject(new Error(message));
    }

    alert(message);
    return Promise.reject(new Error(message));
  },
  (error) => {
    const status = error.response?.status;
    const rawMsg = error.response?.data?.message || error.message || '';
    const messageMap: Record<number, string> = {
      400: 'Request parameters error',
      401: 'Session expired, please login again',
      403: 'Access denied, please login again',
      404: 'Request resource not found',
      500: 'Internal server error',
      502: 'Gateway error',
      503: 'Service unavailable',
    };
    const msg = messageMap[status] || `Connection anomaly: ${rawMsg}`;

    if (rawMsg.includes('CORS') || rawMsg.includes('cors')) {
      alert('CORS request blocked, access the system via http://localhost:5173');
      return Promise.reject(error);
    }

    if (status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user_role');
      window.dispatchEvent(new Event('auth-expired'));
      return Promise.reject(new Error(rawMsg || msg));
    }

    if (status === 403) {
      alert(rawMsg || msg || '权限不足，拒绝访问');
      return Promise.reject(new Error(rawMsg || msg));
    }

    alert(msg);
    return Promise.reject(error);
  }
);

export default service;
