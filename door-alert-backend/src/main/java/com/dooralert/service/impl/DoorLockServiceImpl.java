package com.dooralert.service.impl;

import com.dooralert.service.DoorLockService;
import com.dooralert.service.SysDeviceService;
import com.dooralert.vo.DoorHeartbeatVO;
import com.dooralert.vo.DoorLockVO;
import com.dooralert.vo.EdgeConfigVO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 门锁/电机联动服务（内存态，适合毕设演示与边缘指令下发）。
 */
@Slf4j
@Service
public class DoorLockServiceImpl implements DoorLockService {

    public static final String STATUS_LOCKED = "LOCKED";
    public static final String STATUS_UNLOCKED = "UNLOCKED";

    public static final String CMD_UNLOCK = "UNLOCK";
    public static final String CMD_LOCK = "LOCK";

    public static final String SRC_AUTO_FACE = "AUTO_FACE";
    public static final String SRC_REMOTE = "REMOTE";
    public static final String SRC_AUTO_LOCK = "AUTO_LOCK";
    public static final String SRC_EDGE = "EDGE";

    @Value("${door.lock.hold-seconds:5}")
    private int defaultHoldSeconds;

    @Autowired
    private SysDeviceService sysDeviceService;

    private final Map<Long, DoorState> states = new ConcurrentHashMap<>();

    @Override
    public DoorLockVO getStatus(Long deviceId) {
        return toVo(deviceId, ensure(deviceId));
    }

    @Override
    public DoorLockVO unlock(Long deviceId, String source, String operator, Integer holdSeconds) {
        DoorState state = ensure(deviceId);
        int hold = holdSeconds != null && holdSeconds > 0 ? holdSeconds : defaultHoldSeconds;
        long now = System.currentTimeMillis();
        synchronized (state) {
            applyAutoLockIfDue(state, now);
            state.status = STATUS_UNLOCKED;
            state.source = StringUtils.hasText(source) ? source : SRC_REMOTE;
            state.operator = operator;
            state.unlockedAt = now;
            state.autoLockAt = now + hold * 1000L;
            state.holdSeconds = hold;
            // 远程开锁需边缘执行电机；人脸授权时边缘已本地开锁，不再重复下发
            if (SRC_REMOTE.equals(state.source)) {
                state.pendingCommand = CMD_UNLOCK;
            }
        }
        log.info("门锁开锁 deviceId={}, source={}, operator={}, hold={}s",
                deviceId, state.source, operator, hold);
        return toVo(deviceId, state);
    }

    @Override
    public DoorLockVO lock(Long deviceId, String source, String operator) {
        DoorState state = ensure(deviceId);
        synchronized (state) {
            state.status = STATUS_LOCKED;
            state.source = StringUtils.hasText(source) ? source : SRC_AUTO_LOCK;
            state.operator = operator;
            state.unlockedAt = null;
            state.autoLockAt = null;
            state.pendingCommand = CMD_LOCK;
        }
        log.info("门锁上锁 deviceId={}, source={}, operator={}", deviceId, state.source, operator);
        return toVo(deviceId, state);
    }

    @Override
    public DoorHeartbeatVO onHeartbeat(Long deviceId) {
        DoorState state = ensure(deviceId);
        String command;
        synchronized (state) {
            applyAutoLockIfDue(state, System.currentTimeMillis());
            command = state.pendingCommand;
            state.pendingCommand = null;
        }
        DoorLockVO vo = toVo(deviceId, state);
        EdgeConfigVO edgeConfig = new EdgeConfigVO();
        try {
            EdgeConfigVO loaded = sysDeviceService.getEdgeConfig(deviceId);
            if (loaded != null) {
                edgeConfig = loaded;
            }
        } catch (Exception e) {
            log.warn("读取边缘配置失败 deviceId={}: {}", deviceId, e.getMessage());
        }
        return DoorHeartbeatVO.builder()
                .online(true)
                .doorStatus(vo.getStatus())
                .doorCommand(command)
                .holdSeconds(state.holdSeconds > 0 ? state.holdSeconds : defaultHoldSeconds)
                .edgeConfig(edgeConfig)
                .build();
    }

    @Override
    public DoorLockVO reportFromEdge(Long deviceId, String status, String source, String operator) {
        DoorState state = ensure(deviceId);
        String normalized = STATUS_UNLOCKED.equalsIgnoreCase(status) ? STATUS_UNLOCKED : STATUS_LOCKED;
        long now = System.currentTimeMillis();
        synchronized (state) {
            state.status = normalized;
            state.source = StringUtils.hasText(source) ? source : SRC_EDGE;
            state.operator = operator;
            if (STATUS_UNLOCKED.equals(normalized)) {
                state.unlockedAt = now;
                if (state.autoLockAt == null || state.autoLockAt < now) {
                    state.autoLockAt = now + defaultHoldSeconds * 1000L;
                }
            } else {
                state.unlockedAt = null;
                state.autoLockAt = null;
            }
            // 边缘已执行，不再重复下发
            state.pendingCommand = null;
        }
        log.info("边缘门锁回写 deviceId={}, status={}, source={}, operator={}",
                deviceId, normalized, state.source, operator);
        return toVo(deviceId, state);
    }

    private DoorState ensure(Long deviceId) {
        return states.computeIfAbsent(deviceId, id -> {
            DoorState s = new DoorState();
            s.status = STATUS_LOCKED;
            s.source = SRC_AUTO_LOCK;
            s.holdSeconds = defaultHoldSeconds;
            return s;
        });
    }

    private void applyAutoLockIfDue(DoorState state, long now) {
        if (STATUS_UNLOCKED.equals(state.status)
                && state.autoLockAt != null
                && now >= state.autoLockAt) {
            state.status = STATUS_LOCKED;
            state.source = SRC_AUTO_LOCK;
            state.operator = "auto-lock";
            state.unlockedAt = null;
            state.autoLockAt = null;
            state.pendingCommand = CMD_LOCK;
            log.info("门锁到达保持时长，自动上锁");
        }
    }

    private DoorLockVO toVo(Long deviceId, DoorState state) {
        long now = System.currentTimeMillis();
        synchronized (state) {
            applyAutoLockIfDue(state, now);
            long remain = 0;
            if (STATUS_UNLOCKED.equals(state.status) && state.autoLockAt != null) {
                remain = Math.max(0, (state.autoLockAt - now + 999) / 1000);
            }
            return DoorLockVO.builder()
                    .deviceId(deviceId)
                    .status(state.status)
                    .source(state.source)
                    .operator(state.operator)
                    .remainSeconds(remain)
                    .unlockedAt(state.unlockedAt)
                    .autoLockAt(state.autoLockAt)
                    .build();
        }
    }

    private static final class DoorState {
        String status;
        String source;
        String operator;
        Long unlockedAt;
        Long autoLockAt;
        String pendingCommand;
        int holdSeconds;
    }
}
