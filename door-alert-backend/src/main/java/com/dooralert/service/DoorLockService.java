package com.dooralert.service;

import com.dooralert.vo.DoorHeartbeatVO;
import com.dooralert.vo.DoorLockVO;

public interface DoorLockService {

    DoorLockVO getStatus(Long deviceId);

    /**
     * 开锁（人脸授权自动 / 管理端远程），默认保持若干秒后自动上锁。
     */
    DoorLockVO unlock(Long deviceId, String source, String operator, Integer holdSeconds);

    /** 立即上锁 */
    DoorLockVO lock(Long deviceId, String source, String operator);

    /**
     * 边缘心跳：刷新在线态，下发并消费一条待执行门锁指令。
     */
    DoorHeartbeatVO onHeartbeat(Long deviceId);

    /**
     * 边缘上报本地电机执行结果，回写云端状态（不重复下发指令）。
     */
    DoorLockVO reportFromEdge(Long deviceId, String status, String source, String operator);
}
