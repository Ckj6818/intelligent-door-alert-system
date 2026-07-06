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

## 数据库

执行 `docs/schema.sql` 初始化数据库表结构；可选执行 `docs/seed_data.sql` 导入演示告警数据。

## 版本说明

当前稳定版本：**v1.0.0** — 包含 Sa-Token RBAC 鉴权、管理员/安保角色隔离、安保账户 CRUD、YOLOv8 实时告警与大屏可视化。详见 [GitHub Releases](https://github.com/Ckj6818/intelligent-door-alert-system/releases)。
