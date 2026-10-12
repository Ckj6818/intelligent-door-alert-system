# 授权人员人脸库

## 使用说明

将授权人员的**清晰正脸照片**放置在此目录中，文件名即为该人员姓名。

### 文件命名规范

```
authorized_faces/
├── 陈柯杰.jpg      ← 授权人员姓名作为文件名
├── 张三.jpg
├── admin.jpg
└── security.jpg
```

### 照片要求

- 格式：`.jpg` / `.jpeg` / `.png`
- 分辨率：建议 200×200 像素以上
- 内容：清晰的正脸照片，光线均匀，无遮挡
- 每人**1张**照片即可（系统会自动提取 128 维人脸特征向量）

### 工作原理

1. **启动预加载**：扫描本目录，缓存姓名与 `face_encodings`
2. **触发式比对**：仅当 YOLOv8 行人框面积占比 `R = Area(bbox)/Area(frame) >= 0.2` 时，才对 ROI 做人脸推理
3. **判定规则**：
   - 欧氏距离 `< 0.45` → `auth_status=AUTHORIZED`，记录正常通行日志（不上报告警）
   - 未检测到人脸或距离 `>= 0.45` → `auth_status=UNAUTHORIZED`，名称标记为「未授权人员/陌生人」，走 10 秒冷却防抖告警上报

### 上报字段（未授权时）

```json
{
  "auth_status": "UNAUTHORIZED",
  "recognized_name": "未授权人员/陌生人",
  "area_ratio": 0.35,
  "snapshot_base64": "..."
}
```

### 注意事项

- 照片修改后需**重启 AI 服务**生效
- 阈值可通过环境变量调整：`FACE_DISTANCE_THRESHOLD`（默认 0.45）、`PROXIMITY_ALERT_THRESHOLD`（默认 0.2）
- Windows 安装 `face_recognition` 需先解决 `dlib` 依赖
