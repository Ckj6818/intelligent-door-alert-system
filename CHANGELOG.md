# Changelog

本项目的所有重要版本更新记录如下。

## [v1.4.0] - 2026-11-21

### Added
- **多渠道 Webhook 异步告警推送**：后端启用 `@EnableAsync`，新增 `WebhookNotifyService` 与 `WebhookController`（`GET/PUT /api/webhook/config`、`POST /api/webhook/test`），按 Webhook URL 自动适配钉钉、企业微信与飞书群机器人；系统设置页内置配置表单与一键发送测试入口，本地运行配置 `webhook-config.json` 已加入 `.gitignore` 防止密钥泄露。
- **同人多角度人脸底库融合与行内「📷 补录/更新照片」**：`doorAlert.py` 自动将 `姓名.jpg`、`姓名_左.jpg`、`姓名_右.jpg` 等同人多张底库融合归并至同一身份特征池；后端新增 `POST /api/authorized-users/{id}/avatar`（支持 `replace` 替换 / `append` 追加多角度模板），列表同步返回 `faceTemplateCount` 模板计数，且删除/禁用人员时自动清理全部关联底库照片。
- **边缘摄像头实时抓拍建库 (`/snapshot`)**：`doorAlert.py` 新增无框纯净抓拍接口 `GET /snapshot` 并返回 `X-Face-Detected` 与 `X-Face-Quality` 人脸质量响应头，前端授权人员弹窗支持免翻本地文件、直接摄像头现场抓拍入库。

### Changed
- **严格侧脸防误报姿态门控**：收紧 YuNet 5 关键点正脸几何约束（`FACE_MAX_YAW_ASYM = 0.20`、`FACE_MIN_EYE_SPAN_RATIO = 0.32`、鼻尖落于双目区间内校验），下调明确陌生人判定上限至 `SFACE_REJECT_THRESHOLD = 0.22` 并将连续确认帧提高至 `UNAUTH_CONFIRM_FRAMES = 5`（滑动投票窗口 `6` 帧），大幅降低大角度侧脸与转头场景误报。
- **100% 纯离线前端资源**：移除 `Header.tsx` 与 `ReportsTab.tsx` 中的外部 `lh3.googleusercontent.com` 图片链接，全面替换为本地内联 SVG 与纯样式组件，断网或内网部署零外部资源加载失败。

### Fixed
- **告警工单筛选与动态 KPI 修复**：修复 `AlertWorkflowTab.tsx` 中中文处理状态筛选（`待复核` / `已处理`）不生效的问题，新增按事件类型（`INTRUSION` / `TAILGATING` / `LOITERING`）联动筛选，顶部 KPI 指标卡片改为基于真实告警记录动态实时计算。

---

## [v1.3.0] - 2026-10-31

### Added
- **可视化鼠标绘制多边形 ROI 防区 & RTSP 热切换**：大屏监控卡片支持直接用鼠标左键在视频画面上点击绘制任意多边形警戒区，以及免重启热切换 USB 摄像头 / 海康大华 RTSP 网络流（直推 `/apply-config` 秒级生效并落库同步）。
- **边缘端实时推理遥测 (`/health`)**：新增平滑实时 `fps`、`yolo_ms`、`face_ms`、`persons`、设备加速信息与白名单规模指标，前端大屏 SVG 曲线与底部状态栏实时联动展示。
- **多目标并发人脸核验**：引入 `ThreadPoolExecutor` 与 `threading.local()` YuNet/SFace 线程本地算子实例，支持门前多人同框或尾随场景并发识别。
- **检测框 EMA 平滑滤波**：按 `track_id` 对边界框做指数移动平均，消除近距离抖动并稳定透视距离估计 $D_{\text{est}}$。
- **回收站定时自动物理清理 & 边缘通信密钥鉴权**：Spring Boot 启用 `@Scheduled` 定时清理超过保留期（默认 7 天）的逻辑删除记录及磁盘抓拍图片；支持可选 `EDGE_API_TOKEN`（`X-Edge-Token`）防护边缘上报接口，并为 `PUT /api/devices/{id}/edge-config` 补齐 `ADMIN` 角色校验；Docker Compose 补齐 `authorized_faces` 共享卷与 `8090` 端口映射。

### Changed
- **全端真数据闭环**：消除设备心跳延迟/离线超时随机值与报表页静态模拟节点数据，全面接入后端真实心跳计时与按设备聚合统计；系统设置页 YOLO 置信度与徘徊触发时长直通边缘端热更新。
- **底库特征矩阵加速与证件照检测增强**：底库照片预归一化为连续 `float32` 矩阵，实时比对升级为单次矩阵点乘；底库编码改为先全图检测再回退上半身裁剪，修复大头证件照漏检问题。
- **轨迹级防抖与确认帧隔离**：将连续确认帧（`auth_streak` / `unauth_streak`）与未确认缓存按 `track_id` 独立隔离，修复投票窗口未满前误重置连续帧计数导致的陌生人确认延迟。
- **画面中文 HUD 与局部贴片加速**：`put_cn_text` 改为仅裁剪文字局部 ROI 转换绘制，增加描边与半透明深色胶囊底衬，并将框底多行辅助信息合并为自适应防越界单行状态栏。
- **回收站物理清理磁盘抓拍图片**：后端永久清空回收站（`DELETE /api/alerts/recycle-bin/clear`）时同步安全删除 `/uploads/*.jpg` 对应抓拍文件，防止长期运行占满磁盘。

---

## [v1.2.0] - 2026-10-30

### Added
- **ByteTrack 跟踪与透视距离评估**：融合框面积比、底部接地点位置与透视距离因子计算综合接近度，支持多边形/矩形 ROI 防区与 `SAFE / WARN / DANGER` 三档距离划分。
- **扩展异常行为告警 (`TAILGATING` / `LOITERING`)**：新增授权通行后尾随闯入检测与门前长时间遮挡徘徊超时告警。
- **CLAHE 暗光增强与断网离线缓存**：支持低照度画面自适应增强；后端断联时自动写入本地 FIFO 离线队列并在恢复后补传。
- **云边参数热同步**：心跳响应携带危险距离、冷却时间、人脸阈值及尾随检测开关，支持边缘端免重启热更新。

---

## [v1.0.0] - 2026-08-08

### Added
- 初始版本发布：集成 YOLOv8 行人检测、人脸白名单比对、Spring Boot 3 + MyBatis-Plus + Sa-Token 后端、WebSocket 实时告警推送与 React 19 管理大屏。
