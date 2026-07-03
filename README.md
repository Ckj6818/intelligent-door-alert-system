# 智能门禁安防可视化管理平台

基于 YOLOv8m 的实时 Door Alert 系统 — 前后端分离毕业设计项目。

## 项目结构

```
intelligent-door-alert-system/
├── door-alert-ai/          # AI 检测服务（YOLOv8m）
├── door-alert-backend/     # Spring Boot 3 后端
├── door-alert-frontend/    # Vue 3 前端
└── docs/                   # 数据库脚本与 API 设计文档
```

## 技术栈

| 模块 | 技术 |
|------|------|
| AI 检测 | Python, YOLOv8m, OpenCV |
| 后端 | Spring Boot 3, MyBatis-Plus, MySQL |
| 前端 | Vue 3, Vite |

## 快速启动

### 后端

```bash
cd door-alert-backend
# 配置 application.yml 中的数据库连接
mvn spring-boot:run
```

### 前端

```bash
cd door-alert-frontend
npm install
npm run dev
```

### AI 服务

```bash
cd door-alert-ai
pip install -r requirements.txt
```

## 数据库

执行 `docs/schema.sql` 初始化数据库表结构。
