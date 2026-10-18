package com.dooralert.vo;

import lombok.Builder;
import lombok.Data;

/**
 * 边缘心跳响应：在线确认 + 待执行门锁指令
 */
@Data
@Builder
public class DoorHeartbeatVO {

    private Boolean online;

    /** 当前门锁状态 LOCKED / UNLOCKED */
    private String doorStatus;

    /**
     * 边缘待执行指令：UNLOCK / LOCK / null
     * 边缘拉取后由服务端清空，保证至多执行一次。
     */
    private String doorCommand;

    /** 开锁保持秒数（边缘本地计时参考） */
    private Integer holdSeconds;

    /** 边缘算法参数，与门锁指令一起返回，供下一帧热更新 */
    private EdgeConfigVO edgeConfig;
}
