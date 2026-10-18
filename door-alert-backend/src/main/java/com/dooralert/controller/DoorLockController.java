package com.dooralert.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.stp.StpUtil;
import com.dooralert.common.Result;
import com.dooralert.service.DoorLockService;
import com.dooralert.service.SysDeviceService;
import com.dooralert.service.impl.DoorLockServiceImpl;
import com.dooralert.vo.DoorLockVO;
import com.dooralert.vo.SysDeviceVO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 门锁/电机远程控制与状态查询
 */
@RestController
@RequestMapping("/api/devices/{deviceId}/door")
public class DoorLockController {

    @Autowired
    private DoorLockService doorLockService;

    @Autowired
    private SysDeviceService sysDeviceService;

    @GetMapping
    @SaCheckLogin
    public Result<DoorLockVO> status(@PathVariable Long deviceId) {
        if (!deviceExists(deviceId)) {
            return Result.error("设备不存在");
        }
        return Result.success(doorLockService.getStatus(deviceId));
    }

    /**
     * 管理端远程开锁（破例放行 / 远程操控电机）
     */
    @PostMapping("/unlock")
    @SaCheckLogin
    public Result<DoorLockVO> unlock(
            @PathVariable Long deviceId,
            @RequestParam(required = false) Integer holdSeconds) {
        if (!deviceExists(deviceId)) {
            return Result.error("设备不存在");
        }
        String operator = resolveOperator();
        DoorLockVO vo = doorLockService.unlock(
                deviceId, DoorLockServiceImpl.SRC_REMOTE, operator, holdSeconds);
        return Result.success("远程开锁指令已下发，边缘电机将执行", vo);
    }

    /**
     * 管理端远程上锁
     */
    @PostMapping("/lock")
    @SaCheckLogin
    public Result<DoorLockVO> lock(@PathVariable Long deviceId) {
        if (!deviceExists(deviceId)) {
            return Result.error("设备不存在");
        }
        String operator = resolveOperator();
        DoorLockVO vo = doorLockService.lock(
                deviceId, DoorLockServiceImpl.SRC_REMOTE, operator);
        return Result.success("远程上锁指令已下发", vo);
    }

    /**
     * 边缘回写本地电机执行结果（免登录）
     */
    @PostMapping("/report")
    public Result<DoorLockVO> report(
            @PathVariable Long deviceId,
            @RequestBody Map<String, String> body) {
        if (!deviceExists(deviceId)) {
            return Result.error("设备不存在");
        }
        String status = body == null ? null : body.get("status");
        String source = body == null ? null : body.get("source");
        String operator = body == null ? null : body.get("operator");
        SysDeviceController.touchHeartbeat(deviceId);
        return Result.success(doorLockService.reportFromEdge(deviceId, status, source, operator));
    }

    private boolean deviceExists(Long deviceId) {
        SysDeviceVO device = sysDeviceService.getDeviceById(deviceId);
        return device != null;
    }

    private String resolveOperator() {
        try {
            Object loginId = StpUtil.getLoginIdDefaultNull();
            return loginId == null ? "admin" : String.valueOf(loginId);
        } catch (Exception e) {
            return "admin";
        }
    }
}
