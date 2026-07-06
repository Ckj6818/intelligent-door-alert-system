<script setup>
import { ref, computed, reactive, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as echarts from 'echarts'
import * as XLSX from 'xlsx'
import {
  getDeviceList,
  getAlertList,
  handleAlert,
  exportAlerts,
  deleteDevice,
  addDevice,
  updateDevice,
  getUserList,
  addOperatorUser,
  deleteOperatorUser,
  resetOperatorPassword
} from '@/api/index'
import { getUserInfo, logout } from '@/utils/permission'

const router = useRouter()

const ORIGINAL_TITLE = '智能门禁安防管理大屏'
const ALERT_TITLE = '【⚠️有新告警】'

// 大屏 RBAC：从 localStorage 读取后端返回的真实角色 ADMIN / OPERATOR
const currentRole = ref(localStorage.getItem('user_role') || 'OPERATOR')
const isAdmin = computed(() => currentRole.value === 'ADMIN')
const isOperator = computed(() => currentRole.value === 'OPERATOR')
const roleLabel = computed(() => (isAdmin.value ? '系统管理员' : '安保值班员'))
const roleTagType = computed(() => (isAdmin.value ? 'danger' : 'warning'))

// 数据状态
const deviceList = ref([])
const alertList = ref([])
let maxAlertId = 0
let titleBlinkTimer = null
let isTitleBlinking = false
let alertSocket = null
let wsReconnectTimer = null
const WS_RECONNECT_DELAY = 3000

// 图表 DOM 引用与实例
const dangerChartRef = ref(null)
const deviceChartRef = ref(null)
let dangerChart = null
let deviceChart = null

const imageBaseUrl = ''

// RBAC：安保可处理告警；管理员额外拥有导出权限
const canHandle = computed(() => isAdmin.value || isOperator.value)

const syncCurrentRole = () => {
  const cached = localStorage.getItem('user_role')
  if (cached === 'ADMIN' || cached === 'OPERATOR') {
    currentRole.value = cached
    return
  }
  const user = getUserInfo()
  const role = String(user?.role || '').trim().toUpperCase()
  if (role === 'ADMIN' || role === 'OPERATOR') {
    currentRole.value = role
    localStorage.setItem('user_role', role)
  }
}
const displayName = computed(() => {
  const user = getUserInfo()
  return user?.nickname || user?.username || '用户'
})

const resolveImageUrl = (imageUrl) => {
  if (!imageUrl || !imageUrl.startsWith('/uploads/')) return ''
  return imageBaseUrl + imageUrl
}

// ECharts 暗色主题通用配置
const darkTooltip = {
  backgroundColor: 'rgba(16, 24, 48, 0.95)',
  borderColor: '#1a2f56',
  textStyle: { color: '#e2e8f0' }
}

// 数据总览统计
const summaryStats = computed(() => ({
  totalDevices: deviceList.value.length,
  totalAlerts: alertList.value.length,
  unhandledAlerts: alertList.value.filter((item) => item.status !== 1).length
}))

// 告警等级分布统计
const dangerLevelStats = computed(() => {
  const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 }
  alertList.value.forEach((alert) => {
    const level = alert.dangerLevel
    if (level >= 3) counts.HIGH++
    else if (level === 2) counts.MEDIUM++
    else if (level === 1) counts.LOW++
  })
  return counts
})

// 设备状态分布统计
const deviceStatusStats = computed(() => {
  const online = deviceList.value.filter((d) => d.status === 1).length
  return {
    online,
    offline: deviceList.value.length - online
  }
})

const stopTitleBlink = () => {
  if (titleBlinkTimer) {
    clearInterval(titleBlinkTimer)
    titleBlinkTimer = null
  }
  isTitleBlinking = false
  document.title = ORIGINAL_TITLE
}

const startTitleBlink = () => {
  if (isTitleBlinking) return
  isTitleBlinking = true
  let showAlert = true
  titleBlinkTimer = setInterval(() => {
    document.title = showAlert ? ALERT_TITLE : ORIGINAL_TITLE
    showAlert = !showAlert
  }, 800)
}

const speakHighAlert = () => {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(
    '警告，前门摄像头检测到人员剧烈靠近，请及时处理！'
  )
  utterance.lang = 'zh-CN'
  utterance.rate = 1
  utterance.pitch = 1
  window.speechSynthesis.speak(utterance)
}

const checkNewHighAlerts = (records) => {
  if (!records.length) return

  const newMaxId = Math.max(...records.map((item) => item.id))
  maxAlertId = newMaxId
}

const getWebSocketUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/ws/alerts`
}

const handleWsAlert = (newAlert) => {
  if (!newAlert?.id) return
  if (alertList.value.some((item) => item.id === newAlert.id)) return

  alertList.value.unshift(newAlert)

  if (newAlert.id > maxAlertId) {
    maxAlertId = newAlert.id
  }

  if (newAlert.dangerLevel >= 3) {
    speakHighAlert()
    startTitleBlink()
  }

  updateCharts()
}

const initWebSocket = () => {
  const connect = () => {
    if (alertSocket?.readyState === WebSocket.OPEN || alertSocket?.readyState === WebSocket.CONNECTING) {
      return
    }

    try {
      alertSocket = new WebSocket(getWebSocketUrl())

      alertSocket.onopen = () => {
        console.log('WebSocket 已连接')
        if (wsReconnectTimer) {
          clearTimeout(wsReconnectTimer)
          wsReconnectTimer = null
        }
      }

      alertSocket.onmessage = (event) => {
        try {
          const newAlert = JSON.parse(event.data)
          handleWsAlert(newAlert)
        } catch (error) {
          console.error('解析 WebSocket 告警消息失败', error)
        }
      }

      alertSocket.onclose = () => {
        console.warn('WebSocket 已断开，准备重连...')
        alertSocket = null
        wsReconnectTimer = setTimeout(connect, WS_RECONNECT_DELAY)
      }

      alertSocket.onerror = (error) => {
        console.error('WebSocket 连接异常', error)
        alertSocket?.close()
      }
    } catch (error) {
      console.error('WebSocket 初始化失败', error)
      wsReconnectTimer = setTimeout(connect, WS_RECONNECT_DELAY)
    }
  }

  connect()
}

const closeWebSocket = () => {
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer)
    wsReconnectTimer = null
  }
  if (alertSocket) {
    alertSocket.onclose = null
    alertSocket.close()
    alertSocket = null
  }
}

const initCharts = () => {
  try {
    if (dangerChartRef.value && !dangerChart) {
      dangerChart = echarts.init(dangerChartRef.value)
    }
    if (deviceChartRef.value && !deviceChart) {
      deviceChart = echarts.init(deviceChartRef.value)
    }
    updateCharts()
  } catch (error) {
    console.error('图表初始化失败', error)
  }
}

const updateCharts = () => {
  try {
    const dangerStats = dangerLevelStats.value
    const deviceStats = deviceStatusStats.value

    if (dangerChart) {
      dangerChart.setOption({
        tooltip: { ...darkTooltip, trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: { bottom: 0, left: 'center', textStyle: { color: '#ffffff' } },
        color: ['#f56c6c', '#e6a23c', '#60a5fa'],
        series: [
          {
            name: '告警等级',
            type: 'pie',
            radius: ['40%', '68%'],
            center: ['50%', '45%'],
            avoidLabelOverlap: true,
            itemStyle: { borderRadius: 6, borderColor: '#0f1423', borderWidth: 2 },
            label: { show: true, formatter: '{b}\n{c}', color: '#ffffff' },
            data: [
              { value: dangerStats.HIGH, name: 'HIGH' },
              { value: dangerStats.MEDIUM, name: 'MEDIUM' },
              { value: dangerStats.LOW, name: 'LOW' }
            ]
          }
        ]
      })
    }

    if (deviceChart) {
      deviceChart.setOption({
        tooltip: { ...darkTooltip, trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '8%', right: '8%', bottom: '12%', top: '12%', containLabel: true },
        xAxis: {
          type: 'category',
          data: ['在线', '离线'],
          axisTick: { alignWithLabel: true },
          axisLabel: { color: '#ffffff' },
          axisLine: { lineStyle: { color: '#3b82f6' } }
        },
        yAxis: {
          type: 'value',
          minInterval: 1,
          axisLabel: { color: '#ffffff' },
          axisLine: { lineStyle: { color: '#3b82f6' } },
          splitLine: { lineStyle: { color: 'rgba(96, 165, 250, 0.25)' } }
        },
        series: [
          {
            name: '设备数量',
            type: 'bar',
            barWidth: '42%',
            itemStyle: { borderRadius: [6, 6, 0, 0] },
            data: [
              { value: deviceStats.online, itemStyle: { color: '#34d399' } },
              { value: deviceStats.offline, itemStyle: { color: '#64748b' } }
            ]
          }
        ]
      })
    }
  } catch (error) {
    console.error('图表更新失败', error)
  }
}

const handleResize = () => {
  dangerChart?.resize()
  deviceChart?.resize()
}

const fetchDeviceList = async () => {
  try {
    const res = await getDeviceList({ current: 1, size: 50 })
    deviceList.value = res.records || []
  } catch (error) {
    console.error('获取设备列表失败', error)
  }
}

const fetchAlertList = async () => {
  try {
    const res = await getAlertList({ current: 1, size: 50 })
    const records = (res.records || []).sort(
      (a, b) => new Date(b.createTime).getTime() - new Date(a.createTime).getTime()
    )
    checkNewHighAlerts(records)
    alertList.value = records
  } catch (error) {
    console.error('获取告警记录失败', error)
  }
}

const fetchDashboardData = async () => {
  await Promise.all([fetchDeviceList(), fetchAlertList()])
  updateCharts()
}

const formatTime = (timeStr) => {
  if (!timeStr) return '-'
  return new Date(timeStr).toLocaleString()
}

const getDangerLevelText = (level) => {
  if (level >= 3) return 'HIGH'
  if (level === 2) return 'MEDIUM'
  if (level === 1) return 'LOW'
  return 'SAFE'
}

const exportToExcel = async () => {
  try {
    const records = await exportAlerts()
    if (!records?.length) {
      ElMessage.warning('暂无告警数据可导出')
      return
    }

    const rows = records.map((item) => ({
      告警时间: formatTime(item.createTime),
      设备ID: item.deviceId,
      接近度: item.proximityRatio != null ? `${(item.proximityRatio * 100).toFixed(1)}%` : '-',
      危险等级: getDangerLevelText(item.dangerLevel),
      状态: item.status === 1 ? '已处理' : '未处理'
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '告警记录')
    XLSX.writeFile(workbook, '智能门禁告警报表.xlsx')
    ElMessage.success('报表导出成功')
  } catch (error) {
    console.error('导出失败', error)
  }
}

const onHandleAlert = async (id) => {
  stopTitleBlink()
  try {
    await handleAlert(id)
    ElMessage.success('告警已处理')
    const target = alertList.value.find((item) => item.id === id)
    if (target) {
      target.status = 1
    }
    updateCharts()
  } catch (error) {
    console.error('处理告警失败', error)
  }
}

const onDashboardClick = () => {
  stopTitleBlink()
}

const onLogout = () => {
  closeWebSocket()
  stopTitleBlink()
  logout()
  ElMessage.success('已退出登录')
  router.replace('/login')
}

const onAddDevice = () => {
  deviceFormMode.value = 'add'
  deviceForm.id = null
  deviceForm.deviceName = ''
  deviceForm.location = ''
  deviceForm.status = 1
  deviceFormVisible.value = true
}

const onEditDevice = (row) => {
  deviceFormMode.value = 'edit'
  deviceForm.id = row.id
  deviceForm.deviceName = row.deviceName
  deviceForm.location = row.location || ''
  deviceForm.status = row.status ?? 1
  deviceFormVisible.value = true
}

const onSubmitDeviceForm = async () => {
  const deviceName = deviceForm.deviceName.trim()
  const location = deviceForm.location.trim()
  if (!deviceName) {
    ElMessage.warning('请输入设备名称')
    return
  }

  deviceFormLoading.value = true
  try {
    const payload = {
      deviceName,
      location,
      status: deviceForm.status
    }
    if (deviceFormMode.value === 'add') {
      await addDevice(payload)
      ElMessage.success('设备添加成功')
    } else {
      await updateDevice(deviceForm.id, payload)
      ElMessage.success('设备修改成功')
    }
    deviceFormVisible.value = false
    await fetchDeviceList()
    updateCharts()
  } catch (error) {
    console.error('保存设备失败', error)
  } finally {
    deviceFormLoading.value = false
  }
}

const onDeleteDevice = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确认删除设备「${row.deviceName}」吗？`,
      '删除确认',
      {
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    await deleteDevice(row.id)
    ElMessage.success('设备已删除')
    await fetchDeviceList()
    updateCharts()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除设备失败', error)
    }
  }
}

// ── 设备管理表单（ADMIN 专属） ──
const deviceFormVisible = ref(false)
const deviceFormLoading = ref(false)
const deviceFormMode = ref('add')
const deviceForm = reactive({
  id: null,
  deviceName: '',
  location: '',
  status: 1
})

// ── 安保人员账户管理（ADMIN 专属） ──
const userManageVisible = ref(false)
const addUserVisible = ref(false)
const userLoading = ref(false)
const addUserLoading = ref(false)
const operatorList = ref([])
const addUserForm = reactive({
  username: '',
  password: ''
})

const formatUserTime = (timeStr) => {
  if (!timeStr) return '-'
  return new Date(timeStr).toLocaleString()
}

const getRoleLabel = (role) => {
  return role === 'ADMIN' ? '系统管理员' : '安保值班员'
}

const fetchOperatorList = async () => {
  userLoading.value = true
  try {
    const res = await getUserList()
    operatorList.value = Array.isArray(res) ? res : (res?.records || [])
  } catch (error) {
    console.error('获取安保人员列表失败', error)
  } finally {
    userLoading.value = false
  }
}

const openUserManage = async () => {
  userManageVisible.value = true
  await fetchOperatorList()
}

const resetAddUserForm = () => {
  addUserForm.username = ''
  addUserForm.password = ''
}

const openAddUserDialog = () => {
  resetAddUserForm()
  addUserVisible.value = true
}

const onSubmitAddUser = async () => {
  const username = addUserForm.username.trim()
  const password = addUserForm.password.trim()
  if (!username || !password) {
    ElMessage.warning('请输入用户名和密码')
    return
  }
  if (password.length < 6) {
    ElMessage.warning('密码长度不能少于 6 位')
    return
  }

  addUserLoading.value = true
  try {
    await addOperatorUser({ username, password })
    ElMessage.success('安保账号创建成功')
    addUserVisible.value = false
    resetAddUserForm()
    await fetchOperatorList()
  } catch (error) {
    console.error('创建安保账号失败', error)
  } finally {
    addUserLoading.value = false
  }
}

const onDeleteOperator = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确认要注销该安保账户「${row.username}」吗？`,
      '注销确认',
      {
        confirmButtonText: '确认注销',
        cancelButtonText: '取消',
        type: 'warning',
        customClass: 'dark-message-box'
      }
    )
    await deleteOperatorUser(row.id)
    ElMessage.success('安保账户已注销')
    await fetchOperatorList()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除安保账号失败', error)
    }
  }
}

const onResetOperatorPassword = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确认将「${row.username}」的密码重置为 123456 吗？`,
      '重置密码',
      {
        confirmButtonText: '确认重置',
        cancelButtonText: '取消',
        type: 'info',
        customClass: 'dark-message-box'
      }
    )
    await resetOperatorPassword(row.id)
    ElMessage.success('密码已重置为 123456')
  } catch (error) {
    if (error !== 'cancel') {
      console.error('重置密码失败', error)
    }
  }
}

watch([alertList, deviceList], () => {
  updateCharts()
}, { deep: true })

onMounted(async () => {
  syncCurrentRole()
  document.title = ORIGINAL_TITLE
  await fetchDashboardData()
  await nextTick()
  requestAnimationFrame(() => {
    initCharts()
  })
  window.addEventListener('resize', handleResize)
  initWebSocket()
})

onUnmounted(() => {
  closeWebSocket()
  stopTitleBlink()
  window.speechSynthesis?.cancel()
  window.removeEventListener('resize', handleResize)
  dangerChart?.dispose()
  deviceChart?.dispose()
  dangerChart = null
  deviceChart = null
})
</script>

<template>
  <div class="dashboard-wrapper" @click="onDashboardClick">
    <el-container class="dashboard-container">
      <el-header class="dashboard-header">
        <div class="header-glow"></div>
        <div class="header-actions">
          <el-tag :type="roleTagType" effect="dark" class="role-tag">{{ roleLabel }}</el-tag>
          <span class="header-user">{{ displayName }}</span>
          <el-button
            v-if="currentRole === 'ADMIN'"
            class="user-manage-btn"
            type="primary"
            size="small"
            @click.stop="openUserManage"
          >
            安保人员管理
          </el-button>
          <el-button class="logout-btn" size="small" @click.stop="onLogout">
            退出登录
          </el-button>
        </div>
        <h1 class="header-title">智能门禁安防管理大屏</h1>
        <div class="header-subtitle">
          {{ isAdmin ? 'ADMIN COMMAND CENTER · 全权限管理视图' : 'OPERATOR DUTY VIEW · 告警处置视图' }}
        </div>
      </el-header>

      <el-main class="dashboard-main">
        <el-alert
          v-if="isOperator"
          class="role-alert"
          title="安保值班视图：您可查看告警并执行【处理】操作，导出与设备管理功能已隐藏。"
          type="warning"
          show-icon
          :closable="false"
        />
        <el-alert
          v-if="isAdmin"
          class="role-alert"
          title="管理员视图：您拥有导出报表、处理告警、设备管理及安保人员账户维护的完整权限。"
          type="success"
          show-icon
          :closable="false"
        />

        <el-row :gutter="20" class="stats-row">
          <el-col :span="8">
            <el-card class="dashboard-card stats-card" shadow="never">
              <template #header>
                <div class="card-header">
                  <span>数据总览</span>
                </div>
              </template>
              <div class="summary-grid">
                <div class="summary-item">
                  <div class="summary-value">{{ summaryStats.totalDevices }}</div>
                  <div class="summary-label">总设备数</div>
                </div>
                <div class="summary-item">
                  <div class="summary-value warning">{{ summaryStats.totalAlerts }}</div>
                  <div class="summary-label">总告警数</div>
                </div>
                <div class="summary-item">
                  <div class="summary-value danger">{{ summaryStats.unhandledAlerts }}</div>
                  <div class="summary-label">未处理告警</div>
                </div>
              </div>
            </el-card>
          </el-col>

          <el-col :span="8">
            <el-card class="dashboard-card chart-card" shadow="never">
              <template #header>
                <div class="card-header">
                  <span>告警等级分布</span>
                </div>
              </template>
              <div ref="dangerChartRef" class="chart-container"></div>
            </el-card>
          </el-col>

          <el-col :span="8">
            <el-card class="dashboard-card chart-card" shadow="never">
              <template #header>
                <div class="card-header">
                  <span>设备状态分布</span>
                </div>
              </template>
              <div ref="deviceChartRef" class="chart-container"></div>
            </el-card>
          </el-col>
        </el-row>

        <el-row :gutter="20" class="table-row">
          <el-col :span="8">
            <el-card class="dashboard-card" shadow="never">
              <template #header>
                <div class="card-header-row">
                  <div class="card-header">
                    <span>设备运行状态</span>
                  </div>
                  <el-button
                    v-if="currentRole === 'ADMIN'"
                    type="primary"
                    size="small"
                    @click.stop="onAddDevice"
                  >
                    添加设备
                  </el-button>
                </div>
              </template>
              <el-table class="dark-table" :data="deviceList" height="100%" style="width: 100%">
                <el-table-column prop="id" label="设备 ID" width="80" />
                <el-table-column prop="deviceName" label="设备名称" show-overflow-tooltip />
                <el-table-column prop="location" label="位置" show-overflow-tooltip />
                <el-table-column label="状态" width="90" align="center">
                  <template #default="scope">
                    <el-tag
                      :type="scope.row.status === 1 ? 'success' : 'info'"
                      effect="dark"
                    >
                      {{ scope.row.status === 1 ? '在线' : '离线' }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column v-if="currentRole === 'ADMIN'" label="管理" width="120" align="center">
                  <template #default="scope">
                    <el-button type="primary" link size="small" @click.stop="onEditDevice(scope.row)">
                      修改
                    </el-button>
                    <el-button type="danger" link size="small" @click.stop="onDeleteDevice(scope.row)">
                      删除
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-col>

          <el-col :span="16">
            <el-card class="dashboard-card" shadow="never">
              <template #header>
                <div class="card-header-row">
                  <div class="card-header">
                    <span>实时告警记录</span>
                  </div>
                  <el-button v-if="currentRole === 'ADMIN'" type="success" size="small" @click.stop="exportToExcel">
                    导出为 Excel
                  </el-button>
                  <span v-else class="export-disabled-hint">无导出权限</span>
                </div>
              </template>
              <el-table class="dark-table" :data="alertList" height="100%" style="width: 100%">
                <el-table-column label="告警时间" width="170">
                  <template #default="scope">
                    {{ formatTime(scope.row.createTime) }}
                  </template>
                </el-table-column>
                <el-table-column prop="deviceId" label="设备 ID" width="80" align="center" />
                <el-table-column label="抓拍图片" width="100" align="center">
                  <template #default="scope">
                    <el-image
                      v-if="resolveImageUrl(scope.row.imageUrl)"
                      class="alert-thumb"
                      :src="resolveImageUrl(scope.row.imageUrl)"
                      :preview-src-list="[resolveImageUrl(scope.row.imageUrl)]"
                      fit="cover"
                      hide-on-click-modal
                    >
                      <template #error>
                        <span class="empty-img">无图</span>
                      </template>
                    </el-image>
                    <span v-else class="empty-img">-</span>
                  </template>
                </el-table-column>
                <el-table-column label="接近度" width="80" align="center">
                  <template #default="scope">
                    {{ scope.row.proximityRatio != null ? (scope.row.proximityRatio * 100).toFixed(1) + '%' : '-' }}
                  </template>
                </el-table-column>
                <el-table-column label="危险等级" width="100" align="center">
                  <template #default="scope">
                    <el-tag v-if="scope.row.dangerLevel >= 3" type="danger" effect="dark">HIGH</el-tag>
                    <el-tag v-else-if="scope.row.dangerLevel === 2" type="warning" effect="dark">MEDIUM</el-tag>
                    <el-tag v-else-if="scope.row.dangerLevel === 1" type="info" effect="dark">LOW</el-tag>
                    <el-tag v-else type="success" effect="dark">SAFE</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="状态" width="100" align="center">
                  <template #default="scope">
                    <el-tag
                      :type="scope.row.status === 1 ? 'success' : 'danger'"
                      effect="dark"
                    >
                      {{ scope.row.status === 1 ? '已处理' : '未处理' }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="100" align="center" fixed="right">
                  <template #default="scope">
                    <el-button
                      v-if="canHandle && scope.row.status !== 1"
                      type="primary"
                      size="small"
                      @click.stop="onHandleAlert(scope.row.id)"
                    >
                      处理
                    </el-button>
                    <span v-else class="empty-img">-</span>
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-col>
        </el-row>
      </el-main>
    </el-container>

    <!-- 安保人员账户维护（ADMIN 专属） -->
    <el-dialog
      v-model="userManageVisible"
      class="user-manage-dialog"
      width="820px"
      destroy-on-close
      append-to-body
      :close-on-click-modal="false"
    >
      <template #header>
        <div class="user-dialog-header">
          <div>
            <div class="user-dialog-title">系统安保人员账户维护</div>
            <div class="user-dialog-subtitle">SECURITY OPERATOR ACCOUNT MANAGEMENT</div>
          </div>
          <el-button type="primary" size="small" @click.stop="openAddUserDialog">
            添加新安保
          </el-button>
        </div>
      </template>

      <el-table
        v-loading="userLoading"
        class="dark-table user-manage-table"
        :data="operatorList"
        height="360"
        style="width: 100%"
      >
        <el-table-column prop="id" label="用户 ID" width="90" align="center" />
        <el-table-column prop="username" label="用户名" min-width="120" show-overflow-tooltip />
        <el-table-column label="角色" width="130" align="center">
          <template #default="scope">
            <el-tag type="warning" effect="dark">{{ getRoleLabel(scope.row.role) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="170">
          <template #default="scope">
            {{ formatUserTime(scope.row.createTime) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" align="center" fixed="right">
          <template #default="scope">
            <el-button type="primary" link size="small" @click.stop="onResetOperatorPassword(scope.row)">
              重置密码
            </el-button>
            <el-button type="danger" link size="small" @click.stop="onDeleteOperator(scope.row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <!-- 添加新安保 -->
    <el-dialog
      v-model="addUserVisible"
      class="user-manage-dialog add-user-dialog"
      title="添加新安保"
      width="420px"
      destroy-on-close
      append-to-body
      :close-on-click-modal="false"
    >
      <el-form label-width="80px" class="add-user-form">
        <el-form-item label="用户名">
          <el-input v-model="addUserForm.username" placeholder="请输入安保账号用户名" clearable />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="addUserForm.password"
            type="password"
            placeholder="请输入初始密码（至少6位）"
            show-password
            clearable
            @keyup.enter="onSubmitAddUser"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addUserVisible = false">取消</el-button>
        <el-button type="primary" :loading="addUserLoading" @click="onSubmitAddUser">
          确认添加
        </el-button>
      </template>
    </el-dialog>

    <!-- 添加/编辑设备 -->
    <el-dialog
      v-model="deviceFormVisible"
      class="user-manage-dialog add-user-dialog"
      :title="deviceFormMode === 'add' ? '添加设备' : '编辑设备'"
      width="460px"
      destroy-on-close
      append-to-body
      :close-on-click-modal="false"
    >
      <el-form label-width="90px" class="add-user-form">
        <el-form-item label="设备名称" required>
          <el-input v-model="deviceForm.deviceName" placeholder="如：前门摄像头-A01" clearable />
        </el-form-item>
        <el-form-item label="安装位置">
          <el-input v-model="deviceForm.location" placeholder="如：1号楼正门入口" clearable />
        </el-form-item>
        <el-form-item label="运行状态">
          <el-radio-group v-model="deviceForm.status">
            <el-radio :value="1">在线</el-radio>
            <el-radio :value="0">离线</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="deviceFormVisible = false">取消</el-button>
        <el-button type="primary" :loading="deviceFormLoading" @click="onSubmitDeviceForm">
          {{ deviceFormMode === 'add' ? '确认添加' : '保存修改' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style>
body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  background-color: #0f1423;
}
</style>

<style scoped>
.dashboard-wrapper {
  width: 100vw;
  height: 100vh;
  background: radial-gradient(ellipse at top, #141e38 0%, #0f1423 45%, #0a0a0c 100%);
  overflow: hidden;
  color: #e2e8f0;
}

.dashboard-container {
  height: 100%;
}

.dashboard-header {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: rgba(16, 24, 48, 0.85);
  border-bottom: 1px solid #1a2f56;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
  z-index: 10;
  height: 72px !important;
  overflow: hidden;
}

.header-glow {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 60%;
  height: 2px;
  background: linear-gradient(90deg, transparent, #3b82f6, #60a5fa, #3b82f6, transparent);
  box-shadow: 0 0 12px rgba(59, 130, 246, 0.8);
}

.header-actions {
  position: absolute;
  right: 24px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 2;
}

.header-user {
  font-size: 13px;
  color: #94a3b8;
  letter-spacing: 1px;
}

.role-tag {
  font-weight: 600;
  letter-spacing: 1px;
}

.role-alert {
  margin-bottom: 16px;
  border-radius: 8px;
}

.export-disabled-hint {
  font-size: 12px;
  color: #64748b;
  letter-spacing: 1px;
}

.logout-btn {
  border: 1px solid #334155 !important;
  background: rgba(20, 28, 52, 0.75) !important;
  color: #e2e8f0 !important;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.logout-btn:hover {
  border-color: #3b82f6 !important;
  box-shadow: 0 0 10px rgba(59, 130, 246, 0.35);
  color: #f8fafc !important;
}

.user-manage-btn {
  border: none !important;
  background: linear-gradient(135deg, #2563eb, #3b82f6) !important;
  box-shadow: 0 0 12px rgba(59, 130, 246, 0.35);
}

.user-manage-btn:hover {
  box-shadow: 0 0 18px rgba(59, 130, 246, 0.55);
}

:deep(.user-manage-dialog) {
  background: rgba(16, 24, 48, 0.96) !important;
  border: 1px solid #1a2f56;
  border-radius: 12px;
  box-shadow: 0 0 40px rgba(0, 150, 255, 0.15);
}

:deep(.user-manage-dialog .el-dialog__header) {
  margin-right: 0;
  padding: 20px 24px 12px;
  border-bottom: 1px solid #1a2f56;
}

:deep(.user-manage-dialog .el-dialog__body) {
  padding: 16px 24px 24px;
}

:deep(.user-manage-dialog .el-dialog__footer) {
  border-top: 1px solid #1a2f56;
  padding: 12px 24px 20px;
}

:deep(.user-manage-dialog .el-dialog__title),
:deep(.user-manage-dialog .el-form-item__label) {
  color: #e2e8f0;
}

.user-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.user-dialog-title {
  font-size: 18px;
  font-weight: 700;
  color: #f1f5f9;
  letter-spacing: 2px;
}

.user-dialog-subtitle {
  margin-top: 4px;
  font-size: 10px;
  letter-spacing: 2px;
  color: #64748b;
}

.user-manage-table {
  border-radius: 8px;
  overflow: hidden;
}

.add-user-form :deep(.el-input__wrapper) {
  background: rgba(20, 28, 52, 0.6) !important;
  border: 1px solid #1a2f56;
  box-shadow: none !important;
}

.add-user-form :deep(.el-input__inner) {
  color: #e2e8f0;
}

.header-title {
  color: #f1f5f9;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 4px;
  margin: 0;
  text-shadow: 0 0 20px rgba(59, 130, 246, 0.5);
}

.header-subtitle {
  margin-top: 4px;
  font-size: 11px;
  letter-spacing: 3px;
  color: #64748b;
}

.dashboard-main {
  padding: 20px;
  box-sizing: border-box;
  height: calc(100vh - 72px);
  overflow: hidden;
}

.stats-row {
  margin-bottom: 20px;
}

.table-row {
  margin-bottom: 0;
  height: calc(100% - 300px);
}

.table-row > .el-col {
  height: 100%;
}

.table-row .dashboard-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.table-row .dashboard-card :deep(.el-card__body) {
  flex: 1;
  overflow: hidden;
  padding: 0;
  background: transparent !important;
}

.dashboard-card {
  border-radius: 8px;
  border: 1px solid #1a2f56;
  background: rgba(16, 24, 48, 0.8) !important;
  box-shadow: 0 0 15px rgba(0, 150, 255, 0.1) !important;
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
  overflow: hidden;
}

.dashboard-card:hover {
  border-color: #2563eb;
  box-shadow: 0 0 24px rgba(0, 150, 255, 0.2) !important;
}

.dashboard-card :deep(.el-card__body) {
  background: transparent !important;
}

.dashboard-card :deep(.el-card__header) {
  background: rgba(26, 47, 86, 0.45);
  border-bottom: 1px solid #1a2f56;
  padding: 14px 18px;
}

.stats-card,
.chart-card {
  height: 280px;
  overflow: hidden;
}

.stats-card :deep(.el-card__body),
.chart-card :deep(.el-card__body) {
  overflow: hidden;
  padding: 12px 16px;
  height: calc(280px - 57px);
  box-sizing: border-box;
  background: transparent !important;
}

.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header {
  font-size: 16px;
  font-weight: 600;
  color: #e2e8f0;
  position: relative;
  padding-left: 12px;
}

.card-header::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 16px;
  background: linear-gradient(180deg, #60a5fa, #3b82f6);
  border-radius: 2px;
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.6);
}

.summary-grid {
  display: flex;
  justify-content: space-around;
  align-items: center;
  height: 200px;
  overflow: hidden;
}

.summary-item {
  text-align: center;
}

.summary-value {
  font-size: 42px;
  font-weight: 700;
  color: #60a5fa;
  line-height: 1.2;
  text-shadow: 0 0 16px rgba(96, 165, 250, 0.4);
}

.summary-value.warning {
  color: #fbbf24;
  text-shadow: 0 0 16px rgba(251, 191, 36, 0.4);
}

.summary-value.danger {
  color: #f87171;
  text-shadow: 0 0 16px rgba(248, 113, 113, 0.4);
}

.summary-label {
  margin-top: 8px;
  font-size: 13px;
  color: #94a3b8;
}

.chart-container {
  width: 100%;
  height: 200px;
  overflow: hidden;
}

.alert-thumb {
  width: 50px;
  height: 50px;
  border-radius: 4px;
  border: 1px solid #1a2f56;
}

.empty-img {
  color: #64748b;
  font-size: 12px;
}

/* ========== 表格暗色强力覆写（消灭 Element Plus 默认白底） ========== */

/* 彻底让表格外层容器变透明，并统一文字颜色 */
:deep(.el-table) {
  background-color: transparent !important;
  color: #cbd5e1 !important;
  --el-table-bg-color: transparent !important;
  --el-table-tr-bg-color: rgba(20, 28, 52, 0.5) !important;
  --el-table-header-bg-color: rgba(16, 24, 48, 0.85) !important;
  --el-table-row-hover-bg-color: rgba(30, 64, 175, 0.7) !important;
  --el-table-text-color: #e2e8f0 !important;
  --el-table-header-text-color: #38bdf8 !important;
  --el-table-border-color: #1a2f56 !important;
  --el-table-current-row-bg-color: rgba(30, 64, 175, 0.7) !important;
}

/* 消除表头死白，改为半透明科幻蓝 */
:deep(.el-table th.el-table__cell) {
  background-color: rgba(16, 24, 48, 0.85) !important;
  color: #38bdf8 !important;
  border-bottom: 1px solid #1a2f56 !important;
}

/* 消除所有数据行死白，改为深色半透明 */
:deep(.el-table tr),
:deep(.el-table td.el-table__cell) {
  background-color: rgba(20, 28, 52, 0.5) !important;
  color: #e2e8f0 !important;
  border-bottom: 1px solid #1a2f56 !important;
}

/* 消除表格右侧和底部的空白填充区死白 */
:deep(.el-table__inner-wrapper::before),
:deep(.el-table__inner-wrapper),
:deep(.el-table__body-wrapper),
:deep(.el-table__header-wrapper) {
  background-color: transparent !important;
}

:deep(.el-table__empty-block) {
  background-color: rgba(20, 28, 52, 0.5) !important;
}

:deep(.el-table__empty-text) {
  color: #94a3b8 !important;
}

/* 鼠标悬浮行（Hover）的高亮效果微调 */
:deep(.el-table--enable-row-hover .el-table__body tr:hover > td.el-table__cell) {
  background-color: rgba(30, 64, 175, 0.7) !important;
}

/* 固定列与滚动条补丁 */
:deep(.el-table__fixed-right-patch),
:deep(.el-table__fixed-left-patch) {
  background-color: rgba(16, 24, 48, 0.85) !important;
}

:deep(.el-table-fixed-column--right),
:deep(.el-table-fixed-column--left) {
  background-color: rgba(20, 28, 52, 0.5) !important;
}

:deep(.el-table__body tr.hover-row > td.el-table__cell) {
  background-color: rgba(30, 64, 175, 0.7) !important;
}

:deep(.el-scrollbar__thumb) {
  background-color: rgba(59, 130, 246, 0.4) !important;
}
</style>
