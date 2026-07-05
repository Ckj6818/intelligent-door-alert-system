<script setup>
import { ref, onMounted } from 'vue'
import { getDeviceList, getAlertList } from '@/api/index'

// 数据状态
const deviceList = ref([])
const alertList = ref([])

// 获取设备列表
const fetchDeviceList = async () => {
  try {
    const res = await getDeviceList({ current: 1, size: 50 }) // 暂时拉取较多数据
    deviceList.value = res.records || []
  } catch (error) {
    console.error('获取设备列表失败', error)
  }
}

// 获取告警记录
const fetchAlertList = async () => {
  try {
    const res = await getAlertList({ current: 1, size: 50 })
    alertList.value = res.records || []
  } catch (error) {
    console.error('获取告警记录失败', error)
  }
}

// 格式化时间
const formatTime = (timeStr) => {
  if (!timeStr) return '-'
  return new Date(timeStr).toLocaleString()
}

onMounted(() => {
  fetchDeviceList()
  fetchAlertList()
})
</script>

<template>
  <div class="dashboard-wrapper">
    <el-container class="dashboard-container">
      <!-- 顶部 Header -->
      <el-header class="dashboard-header">
        <h1 class="header-title">智能门禁安防管理大屏</h1>
      </el-header>

      <!-- 主体 Main -->
      <el-main class="dashboard-main">
        <el-row :gutter="20">
          <!-- 左侧：设备运行状态 -->
          <el-col :span="8">
            <el-card class="dashboard-card" shadow="hover">
              <template #header>
                <div class="card-header">
                  <span>设备运行状态</span>
                </div>
              </template>
              <el-table :data="deviceList" height="calc(100vh - 160px)" style="width: 100%">
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

          <!-- 右侧：实时告警记录 -->
          <el-col :span="16">
            <el-card class="dashboard-card" shadow="hover">
              <template #header>
                <div class="card-header">
                  <span>实时告警记录</span>
                </div>
              </template>
              <el-table :data="alertList" height="calc(100vh - 160px)" style="width: 100%">
                <el-table-column label="告警时间" width="170">
                  <template #default="scope">
                    {{ formatTime(scope.row.createTime) }}
                  </template>
                </el-table-column>
                <el-table-column prop="deviceId" label="设备 ID" width="80" align="center" />
                <el-table-column label="抓拍图片" width="100" align="center">
                  <template #default="scope">
                    <el-image
                      v-if="scope.row.imageUrl"
                      style="width: 50px; height: 50px; border-radius: 4px;"
                      :src="`http://localhost:8081${scope.row.imageUrl}`"
                      :preview-src-list="[`http://localhost:8081${scope.row.imageUrl}`]"
                      fit="cover"
                      hide-on-click-modal
                    />
                    <span v-else class="empty-img">-</span>
                  </template>
                </el-table-column>
                <el-table-column label="接近度" width="80" align="center">
                  <template #default="scope">
                    {{ (scope.row.proximityRatio * 100).toFixed(1) }}%
                  </template>
                </el-table-column>
                <el-table-column label="危险等级" width="100" align="center">
                  <template #default="scope">
                    <!-- 危险等级: 0-安全, 1-注意, 2-警告, 3-危险 -->
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
              </el-table>
            </el-card>
          </el-col>
        </el-row>
      </el-main>
    </el-container>
  </div>
</template>

<style>
/* 全局 body 样式复位，确保没有多余的边距 */
body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
</style>

<style scoped>
/* 全局复位与背景设置 */
.dashboard-wrapper {
  width: 100vw;
  height: 100vh;
  background-color: #f0f2f5;
  overflow: hidden;
}

.dashboard-container {
  height: 100%;
}

/* Header 样式 */
.dashboard-header {
  background-color: #1e293b; /* 深色科技感背景 */
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

/* Main 样式 */
.dashboard-main {
  padding: 20px;
  box-sizing: border-box;
}

/* Card 样式，现代化圆角和阴影 */
.dashboard-card {
  border-radius: 12px;
  border: none;
  background-color: #ffffff;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;
}
.dashboard-card:hover {
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
}

.card-header {
  font-size: 18px;
  font-weight: bold;
  color: #334155;
  position: relative;
  padding-left: 12px;
}

/* 标题前的蓝色小竖杠修饰 */
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

.empty-img {
  color: #999;
  font-size: 12px;
}
</style>
