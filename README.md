# 智能门禁安防可视化管理平台

基于 YOLOv8m 的实时 Door Alert 系统 — React + Spring Boot 前后端分离毕业设计项目。

## 项目结构

```
intelligent-door-alert-system/
├── door-alert-ai/          # AI 检测服务（YOLOv8m）
├── door-alert-backend/     # Spring Boot 3 后端
├── door-alert-frontend/    # React + TypeScript 前端
└── docs/                   # 数据库脚本与 API 设计文档
```

## 技术栈

| 模块 | 技术 |
|------|------|
| AI 检测 | Python, YOLOv8m, OpenCV |
| 后端 | Spring Boot 3, MyBatis-Plus, MySQL |
| 前端 | React, TypeScript, Vite |

## 快速启动

### 方式一：一键启动（推荐 · Windows）

项目根目录已提供 **`start_all.bat`**，双击即可按顺序拉起 MySQL、后端、前端与 AI 四个独立窗口，适合答辩现场演示。

**使用步骤：**

1. **首次运行前**，确保本机已安装并配置好：
   - MySQL 8（默认路径 `D:\mysql8`，可在 `scripts/start_mysql.bat` 中修改 `MYSQL_HOME`）
   - JDK 17+、Maven、Node.js 18+、Python 3.9+
2. 导入数据库：执行 `docs/schema.sql`（及可选的 `docs/seed_data.sql` 演示数据）
3. 双击项目根目录下的 **`start_all.bat`**
4. 等待脚本依次启动（约 15 秒），浏览器访问前端登录页

**启动后访问地址：**

| 服务 | 地址 |
|------|------|
| 前端大屏 | http://localhost:5173/login |
| 后端 API | http://localhost:8081 |

**系统默认测试账号：**

| 角色 | 用户名 | 密码 | 权限说明 |
|------|--------|------|----------|
| 管理员（ADMIN） | `admin` | `123456` | 导出报表、设备管理、安保账户 CRUD、处理告警 |
| 安保值班员（OPERATOR） | `security` | `123456` | 查看大屏、处理告警（无导出与账户管理权限） |

> 管理员可在登录后点击右上角 **「安保人员管理」** 新增安保账号；新建账号默认角色为 `OPERATOR`，支持一键重置密码为 `123456`。

**常见问题：**

- 若 Windows 安全中心拦截 `.bat` 脚本，请先运行 `scripts/unblock_project.bat`，或右键脚本 → 属性 → 勾选「解除锁定」。
- MySQL 默认账号：`root / 123456`，数据库名：`intelligent_door_alert`（见 `door-alert-backend/src/main/resources/application.yml`）。
- 也可分别手动启动：`scripts/start_mysql.bat`、`scripts/start_backend.bat`、`scripts/start_frontend.bat`、`scripts/start_ai.bat`。

---

### 方式二：手动分步启动

#### 后端

```bash
cd door-alert-backend
# 配置 application.yml 中的数据库连接
mvn spring-boot:run
```

默认端口：**8081**

#### 前端

```bash
cd door-alert-frontend
npm install
npm run dev
```

默认地址：**http://localhost:5173/login**

#### AI 服务

```bash
cd door-alert-ai
pip install -r requirements.txt
python doorAlert.py
```

---

### 方式三：容器化一键部署（Docker · Linux / macOS / WSL2）

适用于无需在本机安装 JDK、Maven、Node.js、Python 与 MySQL 的跨平台场景。项目根目录已提供 `docker-compose.yml`、`docker-compose.camera.yml`，以及 `door-alert-backend/`、`door-alert-frontend/`、`door-alert-ai/` 各自的 `Dockerfile`。

**前置条件：**

- 已安装 [Docker Engine](https://docs.docker.com/engine/install/)（建议 20.10+）
- 已安装 Docker Compose V2（Docker Desktop 自带；Linux 可安装 `docker-compose-plugin`）
- 首次构建需联网下载镜像与依赖，请预留数 GB 磁盘空间

**一键启动核心基础服务（MySQL + 后端 + 前端）：**

在项目根目录执行：

```bash
docker-compose up -d --build
```

- 数据库表结构与演示数据会在 MySQL 容器**首次启动**时，通过挂载的 `docs/schema.sql`、`docs/seed_data.sql` 自动初始化，无需手动导入。
- 默认**不**启动 AI 检测容器（`ai-service` 使用 Compose `full` profile）；适合先验证登录与大屏功能。

**可选：启动边缘 AI 视觉检测容器**

**Demo 模式**（使用 `door-alert-ai/demo/` 下的图片或视频，Windows / macOS / Linux 均可）：

```bash
docker compose --profile full up -d --build
```

**Linux 物理摄像头模式**（挂载 `/dev/video0`）：

```bash
docker-compose -f docker-compose.camera.yml up -d --build
```

若仅使用上述命令无法拉起完整服务栈，请改用与根目录 `docker-compose.yml` 合并的写法（推荐）：

```bash
docker compose -f docker-compose.yml -f docker-compose.camera.yml --profile full up -d --build
```

**服务可用性验证：**

| 服务 | 地址 | 验证方式 |
|------|------|----------|
| 前端 UI | http://localhost:5173/login | 浏览器打开登录页，使用下方测试账号登录 |
| 后端 API | http://localhost:8081 | 访问 `http://localhost:8081/actuator/health`，应返回 `{"status":"UP"}` |
| AI 检测（可选） | 容器 `door-alert-ai` | 执行 `docker compose logs -f ai-service`，日志中出现心跳与告警上报即表示运行正常 |

**常用运维命令：**

```bash
# 查看运行状态
docker compose ps

# 查看后端 / 前端 / AI 日志
docker compose logs -f backend frontend ai-service

# 停止并移除容器（数据卷 mysql_data 会保留）
docker compose down
```

**说明：**

- Docker 模式下 MySQL 仅在容器内网暴露，不占用宿主机 3306，避免与本机已有 MySQL 冲突。
- Windows 宿主机无法将 USB 摄像头直通进容器，请使用 Demo 模式或方式一 / 方式二在本机运行 AI 脚本。
- 测试账号与方式一相同：`admin / 123456`（管理员）、`security / 123456`（安保值班员）。

---

## 数据库

执行 `docs/schema.sql` 初始化数据库表结构；可选执行 `docs/seed_data.sql` 导入演示告警数据。

## 版本说明

当前稳定版本：**v1.0.0** — 包含 Sa-Token RBAC 鉴权、管理员/安保角色隔离、安保账户 CRUD、YOLOv8 实时告警与大屏可视化。详见 [GitHub Releases](https://github.com/Ckj6818/intelligent-door-alert-system/releases)。
