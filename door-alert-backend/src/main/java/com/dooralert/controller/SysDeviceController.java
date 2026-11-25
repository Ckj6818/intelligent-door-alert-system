package com.dooralert.controller;

import cn.dev33.satoken.annotation.SaCheckRole;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.dooralert.common.Result;
import com.dooralert.dto.SysDeviceDTO;
import com.dooralert.service.SysDeviceService;
import com.dooralert.service.WebhookNotifyService;
import com.dooralert.vo.DoorHeartbeatVO;
import com.dooralert.vo.EdgeConfigVO;
import com.dooralert.vo.SysDeviceVO;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 设备管理接口
 */
@Slf4j
@RestController
@RequestMapping("/api/devices")
public class SysDeviceController {

    /** 设备 ID → 最后心跳时间戳（毫秒），线程安全内存池 */
    private static final Map<Long, Long> deviceHeartbeatMap = new ConcurrentHashMap<>();

    /** 已发送离线告警的设备 ID 集合（防止重复刷屏；恢复心跳后自动移除） */
    private static final Set<Long> offlineNotifiedSet = ConcurrentHashMap.newKeySet();

    @Autowired
    private SysDeviceService sysDeviceService;

    @Autowired
    private WebhookNotifyService webhookNotifyService;

    @Value("${device.heartbeat.timeout-seconds:30}")
    private long heartbeatTimeoutSeconds;

    @Value("${edge.api-token:}")
    private String edgeApiToken;

    /**
     * 记录设备心跳（供边缘端心跳接口与告警上报调用）
     */
    public static void touchHeartbeat(Long deviceId) {
        if (deviceId != null) {
            deviceHeartbeatMap.put(deviceId, System.currentTimeMillis());
            offlineNotifiedSet.remove(deviceId);
        }
    }

    /**
     * 周期性巡检曾经在线的边缘设备：若心跳超时判定离线，则触发一次钉钉/企微离线告警
     */
    @Scheduled(fixedDelay = 15_000, initialDelay = 30_000)
    public void monitorDeviceOfflineTimeouts() {
        long now = System.currentTimeMillis();
        long timeoutMs = Math.max(10L, heartbeatTimeoutSeconds) * 1000L;
        for (Map.Entry<Long, Long> entry : deviceHeartbeatMap.entrySet()) {
            Long deviceId = entry.getKey();
            long elapsedMs = now - entry.getValue();
            if (elapsedMs > timeoutMs && offlineNotifiedSet.add(deviceId)) {
                try {
                    SysDeviceVO vo = sysDeviceService.getDeviceById(deviceId);
                    String devName = vo != null ? vo.getDeviceName() : ("设备 #" + deviceId);
                    String loc = vo != null ? vo.getLocation() : "";
                    webhookNotifyService.sendDeviceOfflineAsync(deviceId, devName, loc, elapsedMs / 1000L);
                } catch (Exception e) {
                    log.warn("巡检设备离线告警异常 deviceId={}: {}", deviceId, e.getMessage());
                }
            }
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
            Long lastHeartbeat = deviceHeartbeatMap.get(vo.getId());
            vo.setStatus(resolveLiveStatus(vo.getId()));
            if (lastHeartbeat != null) {
                vo.setLastHeartbeatElapsedSec(Math.max(0L, (System.currentTimeMillis() - lastHeartbeat) / 1000L));
            }
        }
    }

    /**
     * 边缘端心跳上报（免登录，与告警 upload 同级；配置 edge.api-token 时校验 X-Edge-Token）。
     * 返回在线确认及边缘算法配置，供边缘端热更新。
     */
    @PostMapping("/{id}/heartbeat")
    public Result<DoorHeartbeatVO> heartbeat(@PathVariable Long id, HttpServletRequest request) {
        if (StringUtils.hasText(edgeApiToken) && !edgeApiToken.trim().equals(request.getHeader("X-Edge-Token"))) {
            return Result.error(401, "边缘节点密钥校验失败");
        }
        SysDeviceVO device = sysDeviceService.getDeviceById(id);
        if (device == null) {
            return Result.error("设备不存在");
        }
        touchHeartbeat(id);
        EdgeConfigVO edgeConfig = new EdgeConfigVO();
        try {
            EdgeConfigVO loaded = sysDeviceService.getEdgeConfig(id);
            if (loaded != null) {
                edgeConfig = loaded;
            }
        } catch (Exception e) {
            log.warn("读取边缘配置失败 deviceId={}: {}", id, e.getMessage());
        }
        return Result.success(DoorHeartbeatVO.builder()
                .online(true)
                .edgeConfig(edgeConfig)
                .build());
    }

    /**
     * 读取边缘算法配置（管理端设置页）
     */
    @GetMapping("/{id}/edge-config")
    public Result<EdgeConfigVO> getEdgeConfig(@PathVariable Long id) {
        if (sysDeviceService.getDeviceById(id) == null) {
            return Result.error("设备不存在");
        }
        return Result.success(sysDeviceService.getEdgeConfig(id));
    }

    /**
     * 保存边缘算法配置（仅 ADMIN 可修改）。边缘端下次心跳即可热更新。
     */
    @PutMapping("/{id}/edge-config")
    @SaCheckRole("ADMIN")
    public Result<Boolean> updateEdgeConfig(@PathVariable Long id, @RequestBody EdgeConfigVO config) {
        return sysDeviceService.updateEdgeConfig(id, config)
                ? Result.success(true)
                : Result.error("设备不存在或配置保存失败");
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
