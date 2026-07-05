import axios from 'axios'

const loginService = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
})

export function loginRequest(data) {
  const payload = {
    username: String(data.username || '').trim(),
    password: String(data.password || '').trim()
  }

  return loginService
    .post('/users/login', payload, {
      transformRequest: [(body, headers) => {
        delete headers.Authorization
        delete headers.authorization
        return JSON.stringify(body)
      }]
    })
    .then((response) => {
      const res = response.data
      if (res.code === 200 && res.data?.token) {
        return res.data
      }
      if (res.code === 401) {
        return Promise.reject(new Error(res.message || '用户名或密码错误'))
      }
      return Promise.reject(new Error(res.message || '登录失败'))
    })
    .catch((error) => {
      // 业务层 reject（如用户名密码错误）直接透传，避免误报“网络异常”
      if (error?.message && !error.response) {
        return Promise.reject(error)
      }

      const status = error.response?.status
      const resData = error.response?.data
      const serverMsg = typeof resData === 'string'
        ? resData
        : resData?.message || resData?.msg

      if (status === 401 || status === 403) {
        return Promise.reject(new Error(serverMsg || '登录失败，请检查账号密码'))
      }
      if (serverMsg) {
        return Promise.reject(new Error(serverMsg))
      }
      if (String(error.message || '').toLowerCase().includes('cors')) {
        return Promise.reject(new Error('跨域请求被拒绝，请通过 http://localhost:5173 访问系统'))
      }
      if (error.code === 'ECONNABORTED') {
        return Promise.reject(new Error('请求超时，请确认后端服务已启动'))
      }
      if (error.code === 'ERR_NETWORK' || !error.response) {
        return Promise.reject(new Error('无法连接后端服务，请确认 Spring Boot 已在 8081 端口运行'))
      }
      return Promise.reject(new Error('网络异常，请稍后重试'))
    })
}
