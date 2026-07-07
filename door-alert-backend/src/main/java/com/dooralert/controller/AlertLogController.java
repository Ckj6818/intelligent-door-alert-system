package com.dooralert.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaCheckRole;
import cn.dev33.satoken.annotation.SaMode;
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
     * 导出告警列表（仅 ADMIN 管理员角色可访问，安保人员直连将返回 403）
     */
    @GetMapping("/export")
    @SaCheckRole("ADMIN")
    public Result<List<AlertLogVO>> export() {
        return Result.success(alertLogService.listAllForExport());
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
        return Result.success(alertLogService.permanentClearRecycleBin());
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
            SysDeviceController.touchHeartbeat(deviceId);
            AlertWebSocketServer.sendAlertNotification(vo);
            return Result.success("告警上报成功", vo);
        } catch (Exception e) {
            e.printStackTrace();
            return Result.error("Error: " + e.getMessage() + " | Cause: " + (e.getCause() != null ? e.getCause().getMessage() : ""));
        }
    }
}
