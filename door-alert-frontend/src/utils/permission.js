/**
 * 前端 RBAC 权限工具：读取登录时缓存的用户角色与权限。
 */

export const USER_ROLE_KEY = 'user_role'

export function getUserInfo() {
  const raw = localStorage.getItem('userInfo')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function getUserRole() {
  return localStorage.getItem(USER_ROLE_KEY) || ''
}

/**
 * 根据登录响应解析大屏角色：admin → ADMIN，security 等 → OPERATOR
 */
export function resolveRoleFromLogin(data) {
  if (!data) return 'OPERATOR'
  if (Array.isArray(data.roles) && data.roles.includes('ADMIN')) {
    return 'ADMIN'
  }
  if (data.username === 'admin' || data.role === 'admin') {
    return 'ADMIN'
  }
  return 'OPERATOR'
}

export function hasRole(role) {
  const user = getUserInfo()
  return Array.isArray(user?.roles) && user.roles.includes(role)
}

export function hasPermission(permission) {
  const user = getUserInfo()
  return Array.isArray(user?.permissions) && user.permissions.includes(permission)
}

/**
 * @deprecated 优先使用 localStorage 中的 user_role
 */
export function resolveUserRole(user = getUserInfo()) {
  const cached = getUserRole()
  if (cached) return cached
  if (!user) return 'OPERATOR'
  if (user.username === 'admin' || user.roles?.includes('ADMIN')) {
    return 'ADMIN'
  }
  return 'OPERATOR'
}

export function isAdminUser() {
  return getUserRole() === 'ADMIN'
}

export function clearUserInfo() {
  localStorage.removeItem('userInfo')
  localStorage.removeItem(USER_ROLE_KEY)
}

export function saveUserInfo(data) {
  if (!data) return
  localStorage.setItem('userInfo', JSON.stringify({
    userId: data.userId,
    username: data.username,
    nickname: data.nickname,
    role: data.role,
    roles: data.roles || [],
    permissions: data.permissions || []
  }))
}

export function saveUserRole(data) {
  localStorage.setItem(USER_ROLE_KEY, resolveRoleFromLogin(data))
}

/** 清除本地登录态（token + 用户信息 + 角色） */
export function logout() {
  localStorage.removeItem('token')
  clearUserInfo()
}
