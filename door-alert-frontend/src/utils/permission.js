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
 * 根据登录响应解析大屏角色（优先使用后端 role 字段：ADMIN / OPERATOR）
 */
export function resolveRoleFromLogin(data) {
  if (!data) return 'OPERATOR'

  const role = String(data.role || '').trim().toUpperCase()
  if (role === 'ADMIN' || role === 'OPERATOR') {
    return role
  }

  if (Array.isArray(data.roles) && data.roles.includes('ADMIN')) {
    return 'ADMIN'
  }

  if (String(data.username || '').toLowerCase() === 'admin') {
    return 'ADMIN'
  }

  return 'OPERATOR'
}

/** 解析当前用户角色（优先 localStorage，其次 userInfo） */
export function resolveUserRole(user) {
  const cached = getUserRole()
  if (cached === 'ADMIN' || cached === 'OPERATOR') {
    return cached
  }
  return resolveRoleFromLogin(user)
}

export function hasRole(role) {
  return getUserRole() === role
}

export function hasPermission(permission) {
  const user = getUserInfo()
  return Array.isArray(user?.permissions) && user.permissions.includes(permission)
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
  const role = resolveRoleFromLogin(data)
  localStorage.setItem(USER_ROLE_KEY, role)
  return role
}

/** 清除本地登录态（token + 用户信息 + 角色） */
export function logout() {
  localStorage.removeItem('token')
  clearUserInfo()
}
