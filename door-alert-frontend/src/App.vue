<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts'
import * as XLSX from 'xlsx'
import { getDeviceList, getAlertList, handleAlert } from '@/api/index'

// 数据状态
const deviceList = ref([])
const alertList = ref([])
let alertTimer = null

// 图表 DOM 引用与实例
const dangerChartRef = ref(null)
const deviceChartRef = ref(null)
let dangerChart = null
let deviceChart = null

// 显式拼接后端地址，绕过可能未生效的 Vite 代理
const imageBaseUrl = 'http://localhost:8081'

const resolveImageUrl = (imageUrl) => {
  if (!imageUrl || !imageUrl.startsWith('/uploads/')) return ''
  return imageBaseUrl + imageUrl
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

// 初始化 ECharts 实例
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

// 根据最新数据更新图表
const updateCharts = () => {
  try {
    const dangerStats = dangerLevelStats.value
    const deviceStats = deviceStatusStats.value

    if (dangerChart) {
      dangerChart.setOption({
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, left: 'center' },
      color: ['#f56c6c', '#e6a23c', '#909399'],
      series: [
        {
          name: '告警等级',
          type: 'pie',
          radius: ['40%', '68%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
          label: { show: true, formatter: '{b}\n{c}' },
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
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '8%', right: '8%', bottom: '12%', top: '12%', containLabel: true },
      xAxis: {
        type: 'category',
        data: ['在线', '离线'],
        axisTick: { alignWithLabel: true }
      },
      yAxis: {
        type: 'value',
        minInterval: 1
      },
      color: ['#67c23a', '#909399'],
      series: [
        {
          name: '设备数量',
          type: 'bar',
          barWidth: '42%',
          itemStyle: { borderRadius: [6, 6, 0, 0] },
          data: [
            { value: deviceStats.online, itemStyle: { color: '#67c23a' } },
            { value: deviceStats.offline, itemStyle: { color: '#909399' } }
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

// 获取设备列表
const fetchDeviceList = async () => {
  try {
    const res = await getDeviceList({ current: 1, size: 50 })
    deviceList.value = res.records || []
  } catch (error) {
    console.error('获取设备列表失败', error)
  }
}

// 获取告警记录
const fetchAlertList = async () => {
  try {
    const res = await getAlertList({ current: 1, size: 50 })
    const records = res.records || []
    alertList.value = records.sort(
      (a, b) => new Date(b.createTime).getTime() - new Date(a.createTime).getTime()
    )
  } catch (error) {
    console.error('获取告警记录失败', error)
  }
}

const fetchDashboardData = async () => {
  await Promise.all([fetchDeviceList(), fetchAlertList()])
  updateCharts()
}

// 格式化时间
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

// 导出告警报表为 Excel
const exportToExcel = () => {
  if (!alertList.value.length) {
    ElMessage.warning('暂无告警数据可导出')
    return
  }

  const rows = alertList.value.map((item) => ({
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
}

// 处理告警
const onHandleAlert = async (id) => {
  try {
    await handleAlert(id)
    ElMessage.success('告警已处理')
    await fetchAlertList()
    updateCharts()
  } catch (error) {
    console.error('处理告警失败', error)
  }
}

watch([alertList, deviceList], () => {
  updateCharts()
}, { deep: true })

onMounted(async () => {
  await fetchDashboardData()
  await nextTick()
  requestAnimationFrame(() => {
    initCharts()
  })
  window.addEventListener('resize', handleResize)

  alertTimer = setInterval(() => {
    fetchDashboardData()
  }, 3000)
})

onUnmounted(() => {
  if (alertTimer) clearInterval(alertTimer)
  window.removeEventListener('resize', handleResize)
  dangerChart?.dispose()
  deviceChart?.dispose()
  dangerChart = null
  deviceChart = null
})
</script>

<template>
  <div class="dashboard-wrapper">
    <el-container class="dashboard-container">
      <el-header class="dashboard-header">
        <h1 class="header-title">智能门禁安防管理大屏</h1>
      </el-header>

      <el-main class="dashboard-main">
        <!-- 数据汇总与图表区 -->
        <el-row :gutter="20" class="stats-row">
          <el-col :span="8">
            <el-card class="dashboard-card stats-card" shadow="hover">
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
            <el-card class="dashboard-card chart-card" shadow="hover">
              <template #header>
                <div class="card-header">
                  <span>告警等级分布</span>
                </div>
              </template>
              <div ref="dangerChartRef" class="chart-container"></div>
            </el-card>
          </el-col>

          <el-col :span="8">
            <el-card class="dashboard-card chart-card" shadow="hover">
              <template #header>
                <div class="card-header">
                  <span>设备状态分布</span>
                </div>
              </template>
              <div ref="deviceChartRef" class="chart-container"></div>
            </el-card>
          </el-col>
        </el-row>

        <!-- 看板 A / 看板 B：数据表格区 -->
        <el-row :gutter="20" class="table-row">
          <el-col :span="8">
            <el-card class="dashboard-card" shadow="hover">
              <template #header>
                <div class="card-header">
                  <span>设备运行状态</span>
                </div>
              </template>
              <el-table :data="deviceList" height="100%" style="width: 100%">
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
              </el-table>
            </el-card>
          </el-col>

          <el-col :span="16">
            <el-card class="dashboard-card" shadow="hover">
              <template #header>
                <div class="card-header-row">
                  <div class="card-header">
                    <span>实时告警记录</span>
                  </div>
                  <el-button type="success" size="small" @click="exportToExcel">
                    导出为 Excel
                  </el-button>
                </div>
              </template>
              <el-table :data="alertList" height="100%" style="width: 100%">
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
                      style="width: 50px; height: 50px; border-radius: 4px;"
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
                      effect="light"
                    >
                      {{ scope.row.status === 1 ? '已处理' : '未处理' }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="100" align="center" fixed="right">
                  <template #default="scope">
                    <el-button
                      v-if="scope.row.status !== 1"
                      type="primary"
                      size="small"
                      @click="onHandleAlert(scope.row.id)"
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
  </div>
</template>

<style>
body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
</style>

<style scoped>
.dashboard-wrapper {
  width: 100vw;
  height: 100vh;
  background-color: #f0f2f5;
  overflow: hidden;
}

.dashboard-container {
  height: 100%;
}

.dashboard-header {
  background-color: #1e293b;
  display: flex;
  justify-content: center;
  align-items: center;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  z-index: 10;
  height: 64px !important;
}

.header-title {
  color: #ffffff;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: 3px;
  margin: 0;
}

.dashboard-main {
  padding: 20px;
  box-sizing: border-box;
  height: calc(100vh - 64px);
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
}

.dashboard-card {
  border-radius: 12px;
  border: none;
  background-color: #ffffff;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;
  overflow: hidden;
}

.dashboard-card:hover {
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
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
}

.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header {
  font-size: 18px;
  font-weight: bold;
  color: #334155;
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
  height: 18px;
  background-color: #409eff;
  border-radius: 2px;
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
  color: #409eff;
  line-height: 1.2;
}

.summary-value.warning {
  color: #e6a23c;
}

.summary-value.danger {
  color: #f56c6c;
}

.summary-label {
  margin-top: 8px;
  font-size: 14px;
  color: #64748b;
}

.chart-container {
  width: 100%;
  height: 200px;
  overflow: hidden;
}

.empty-img {
  color: #999;
  font-size: 12px;
}
</style>
