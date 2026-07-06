package com.dooralert.controller;

import cn.dev33.satoken.annotation.SaCheckRole;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.dooralert.common.Result;
import com.dooralert.dto.SysDeviceDTO;
import com.dooralert.service.SysDeviceService;
import com.dooralert.vo.SysDeviceVO;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 设备管理接口
 */
@RestController
@RequestMapping("/api/devices")
public class SysDeviceController {

    /** 设备 ID → 最后心跳时间戳（毫秒），线程安全内存池 */
    private static final Map<Long, Long> deviceHeartbeatMap = new java.util.concurrent.ConcurrentHashMap<>();

    @Autowired
    private SysDeviceService sysDeviceService;

    @Value("${device.heartbeat.timeout-seconds:30}")
    private long heartbeatTimeoutSeconds;

    /**
     * 记录设备心跳（供边缘端心跳接口与告警上报调用）
     */
    public static void touchHeartbeat(Long deviceId) {
        if (deviceId != null) {
            deviceHeartbeatMap.put(deviceId, System.currentTimeMillis());
        }
    }

    /**
     * 根据内存心跳池判定设备是否在线（超时则离线）
     */
    private int resolveLiveStatus(Long deviceId) {
        Long lastHeartbeat = deviceHeartbeatMap.get(deviceId);
        if (lastHeartbeat == null) {
            return 0;
        }
        long elapsedMs = System.currentTimeMillis() - lastHeartbeat;
        return elapsedMs <= heartbeatTimeoutSeconds * 1000 ? 1 : 0;
    }

    private void applyLiveStatus(SysDeviceVO vo) {
        if (vo != null) {
            vo.setStatus(resolveLiveStatus(vo.getId()));
        }
    }

    /**
     * 边缘端心跳上报（免登录，与告警 upload 同级）
     */
    @PostMapping("/{id}/heartbeat")
    public Result<Boolean> heartbeat(@PathVariable Long id) {
        SysDeviceVO device = sysDeviceService.getDeviceById(id);
        if (device == null) {
            return Result.error("设备不存在");
        }
        touchHeartbeat(id);
        return Result.success(true);
    }

    /**
     * 分页查询设备列表（status 由心跳池实时计算，不读库中静态值）
     */
    @GetMapping
    public Result<IPage<SysDeviceVO>> page(
            @RequestParam(defaultValue = "1") long current,
            @RequestParam(defaultValue = "10") long size) {
        IPage<SysDeviceVO> page = sysDeviceService.pageDevices(current, size);
        page.getRecords().forEach(this::applyLiveStatus);
        return Result.success(page);
    }

    /**
     * 根据 ID 查询设备详情
     */
    @GetMapping("/{id}")
    public Result<SysDeviceVO> getById(@PathVariable Long id) {
        SysDeviceVO vo = sysDeviceService.getDeviceById(id);
        if (vo == null) {
            return Result.error("设备不存在");
        }
        applyLiveStatus(vo);
        return Result.success(vo);
    }

    /**
     * 新增设备
     */
    @PostMapping
    @SaCheckRole("ADMIN")
    public Result<Boolean> add(@Valid @RequestBody SysDeviceDTO dto) {
        return Result.success(sysDeviceService.addDevice(dto));
    }

    /**
     * 修改设备
     */
    @PutMapping("/{id}")
    @SaCheckRole("ADMIN")
    public Result<Boolean> update(@PathVariable Long id, @Valid @RequestBody SysDeviceDTO dto) {
        return sysDeviceService.updateDevice(id, dto)
                ? Result.success(true)
                : Result.error("设备不存在或更新失败");
    }

    /**
     * 删除设备
     */
    @DeleteMapping("/{id}")
    @SaCheckRole("ADMIN")
    public Result<Boolean> delete(@PathVariable Long id) {
        boolean removed = sysDeviceService.removeById(id);
        if (removed) {
            deviceHeartbeatMap.remove(id);
        }
        return Result.success(removed);
    }
}
