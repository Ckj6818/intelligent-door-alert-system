package com.dooralert.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.dooralert.common.Result;
import com.dooralert.dto.AlertLogDTO;
import com.dooralert.dto.AlertUploadDTO;
import com.dooralert.service.AlertLogService;
import com.dooralert.vo.AlertLogVO;
import com.dooralert.ws.AlertWebSocketServer;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
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
     * 导出告警列表（仅拥有 alert:export 权限的管理员可访问）
     */
    @GetMapping("/export")
    @SaCheckPermission("alert:export")
    public Result<List<AlertLogVO>> export() {
        return Result.success(alertLogService.listAllForExport());
    }

    /**
     * 根据 ID 查询告警详情
     */
    @GetMapping("/{id}")
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
    @PutMapping("/{id}")
    public Result<Boolean> update(@PathVariable Long id, @RequestBody AlertLogDTO dto) {
        return alertLogService.updateAlert(id, dto)
                ? Result.success(true)
                : Result.error("告警记录不存在或更新失败");
    }

    /**
     * 删除告警
     */
    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable Long id) {
        return Result.success(alertLogService.removeById(id));
    }

    /**
     * 处理告警：将 status 从 0（未处理）更新为 1（已处理）
     */
    @PutMapping("/{id}/handle")
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
     * 边缘端告警上报
     * <p>
     * Python 端通过 POST 请求将检测到的告警信息推送至此接口。
     * 系统自动将处理状态设为 0（未处理）并持久化。
     * </p>
     */
    @PostMapping("/upload")
    public Result<AlertLogVO> upload(
            @RequestParam("deviceId") Long deviceId,
            @RequestParam("proximityRatio") Double proximityRatio,
            @RequestParam("dangerLevel") Integer dangerLevel,
            @RequestParam(value = "file", required = false) org.springframework.web.multipart.MultipartFile file) {
        try {
            AlertUploadDTO dto = new AlertUploadDTO();
            dto.setDeviceId(deviceId);
            dto.setProximityRatio(proximityRatio);
            dto.setDangerLevel(dangerLevel);

            AlertLogVO vo = alertLogService.uploadAlert(dto, file);
            AlertWebSocketServer.sendAlertNotification(vo);
            return Result.success("告警上报成功", vo);
        } catch (Exception e) {
            e.printStackTrace();
            return Result.error("Error: " + e.getMessage() + " | Cause: " + (e.getCause() != null ? e.getCause().getMessage() : ""));
        }
    }
}
