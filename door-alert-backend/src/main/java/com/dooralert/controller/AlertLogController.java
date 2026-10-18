package com.dooralert.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaCheckRole;
import cn.dev33.satoken.annotation.SaMode;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.dooralert.common.Result;
import com.dooralert.dto.AlertLogDTO;
import com.dooralert.dto.AlertUploadDTO;
import com.dooralert.service.AlertLogService;
import com.dooralert.util.PublicBaseUrlResolver;
import com.dooralert.vo.AlertLogVO;
import com.dooralert.vo.AlertWsPayload;
import com.dooralert.ws.AlertWebSocketServer;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 告警日志管理接口
 */
@RestController
@RequestMapping("/api/alerts")
public class AlertLogController {

    @Autowired
    private AlertLogService alertLogService;

    @Autowired
    private PublicBaseUrlResolver publicBaseUrlResolver;

    /**
     * 分页查询告警列表
     */
    @GetMapping
    public Result<IPage<AlertLogVO>> page(
            @RequestParam(defaultValue = "1") long current,
            @RequestParam(defaultValue = "10") long size) {
        return Result.success(alertLogService.pageAlerts(current, size));
    }

    /**
     * 导出告警列表（仅 ADMIN 管理员角色可访问，安保人员直连将返回 403）。
     * imageUrl 拼为外部可访问绝对地址（app.public-base-url 或 X-Forwarded-* / 当前请求）。
     */
    @GetMapping("/export")
    @SaCheckRole("ADMIN")
    public Result<List<AlertLogVO>> export(HttpServletRequest request) {
        String baseUrl = publicBaseUrlResolver.resolveBaseUrl(request);
        return Result.success(alertLogService.listAllForExport(baseUrl));
    }

    /**
     * 根据 ID 查询告警详情
     */
    @GetMapping("/{id:\\d+}")
    public Result<AlertLogVO> getById(@PathVariable Long id) {
        AlertLogVO vo = alertLogService.getAlertById(id);
        return vo != null ? Result.success(vo) : Result.error("告警记录不存在");
    }

    /**
     * 新增告警
     */
    @PostMapping
    public Result<Boolean> add(@RequestBody AlertLogDTO dto) {
        return Result.success(alertLogService.addAlert(dto));
    }

    /**
     * 修改告警（如变更处理状态）
     */
    @PutMapping("/{id:\\d+}")
    public Result<Boolean> update(@PathVariable Long id, @RequestBody AlertLogDTO dto) {
        return alertLogService.updateAlert(id, dto)
                ? Result.success(true)
                : Result.error("告警记录不存在或更新失败");
    }

    /**
     * 删除告警（仅 ADMIN 可执行）
     */
    @DeleteMapping("/{id:\\d+}")
    @SaCheckRole("ADMIN")
    public Result<Boolean> delete(@PathVariable Long id) {
        return Result.success(alertLogService.logicalDeleteAlert(id));
    }

    /**
     * 一键清空所有活跃告警记录
     */
    @DeleteMapping("/clear")
    @SaCheckRole("ADMIN")
    public Result<Boolean> clearAll() {
        return Result.success(alertLogService.logicalClearAll());
    }

    /**
     * 获取回收站列表
     */
    @GetMapping("/recycle-bin")
    @SaCheckRole("ADMIN")
    public Result<List<AlertLogVO>> recycleBin() {
        return Result.success(alertLogService.listRecycleBin());
    }

    /**
     * 永久清空回收站中所有的逻辑删除记录
     */
    @DeleteMapping("/recycle-bin/clear")
    @SaCheckRole("ADMIN")
    public Result<Boolean> clearRecycleBin() {
        return Result.success("回收站已永久清空", alertLogService.permanentClearRecycleBin());
    }

    /**
     * 恢复已逻辑删除的记录
     */
    @PutMapping("/{id:\\d+}/restore")
    @SaCheckRole("ADMIN")
    public Result<Boolean> restore(@PathVariable Long id) {
        return alertLogService.restoreAlert(id)
                ? Result.success("恢复成功", true)
                : Result.error("恢复失败或记录不存在");
    }

    /**
     * 处理告警：ADMIN / OPERATOR 均可执行（安保核心职责）
     */
    @PutMapping("/{id:\\d+}/handle")
    @SaCheckRole(value = {"ADMIN", "OPERATOR"}, mode = SaMode.OR)
    @SaCheckPermission("alert:handle")
    public Result<Boolean> handle(@PathVariable Long id) {
        return alertLogService.handleAlert(id)
                ? Result.success("告警已处理", true)
                : Result.error("告警记录不存在或处理失败");
    }

    // ==========================================================
    //  AI 边缘端专属上报接口（供 Python 机器视觉脚本调用，免登录）
    // ==========================================================

    /**
     * 边缘端人脸比对结果上报（免登录）
     * <p>
     * 解析 auth_status / recognized_name（兼容 camelCase）。
     * UNAUTHORIZED → 保存待处理告警工单并 WebSocket 广播；
     * AUTHORIZED → 记录通行日志并广播 PASSAGE 事件。
     * </p>
     */
    @PostMapping("/upload")
    public Result<AlertWsPayload> upload(
            @RequestParam("deviceId") Long deviceId,
            @RequestParam(value = "proximityRatio", required = false) Double proximityRatio,
            @RequestParam(value = "area_ratio", required = false) Double areaRatio,
            @RequestParam(value = "dangerLevel", required = false) Integer dangerLevel,
            @RequestParam(value = "auth_status", required = false) String authStatusSnake,
            @RequestParam(value = "authStatus", required = false) String authStatusCamel,
            @RequestParam(value = "recognized_name", required = false) String recognizedNameSnake,
            @RequestParam(value = "recognizedName", required = false) String recognizedNameCamel,
            @RequestParam(value = "alert_type", required = false) String alertTypeSnake,
            @RequestParam(value = "alertType", required = false) String alertTypeCamel,
            @RequestParam(value = "snapshot_base64", required = false) String snapshotBase64,
            @RequestParam(value = "file", required = false) org.springframework.web.multipart.MultipartFile file) {
        try {
            AlertUploadDTO dto = new AlertUploadDTO();
            dto.setDeviceId(deviceId);
            dto.setProximityRatio(proximityRatio != null ? proximityRatio : areaRatio);
            if (dto.getProximityRatio() == null) {
                return Result.error("接近度 proximityRatio / area_ratio 不能为空");
            }
            dto.setDangerLevel(dangerLevel != null ? dangerLevel : 2);
            dto.setAuthStatus(firstNonBlank(authStatusSnake, authStatusCamel));
            dto.setRecognizedName(firstNonBlank(recognizedNameSnake, recognizedNameCamel));
            dto.setAlertType(firstNonBlank(alertTypeSnake, alertTypeCamel));
            dto.setSnapshotBase64(snapshotBase64);

            AlertWsPayload payload = alertLogService.uploadAlert(dto, file);
            SysDeviceController.touchHeartbeat(deviceId);
            AlertWebSocketServer.sendAlertNotification(payload);

            String msg = "PASSAGE".equals(payload.getEventType())
                    ? "授权通行已记录"
                    : "未授权告警上报成功（待处理工单）";
            return Result.success(msg, payload);
        } catch (Exception e) {
            e.printStackTrace();
            return Result.error("Error: " + e.getMessage() + " | Cause: "
                    + (e.getCause() != null ? e.getCause().getMessage() : ""));
        }
    }

    private static String firstNonBlank(String a, String b) {
        if (StringUtils.hasText(a)) {
            return a.trim();
        }
        if (StringUtils.hasText(b)) {
            return b.trim();
        }
        return null;
    }
}
