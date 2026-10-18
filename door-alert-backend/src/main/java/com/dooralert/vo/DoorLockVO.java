package com.dooralert.vo;

import lombok.Builder;
import lombok.Data;

/**
 * 门锁/电机状态（内存态，供管理端与边缘联动）
 */
@Data
@Builder
public class DoorLockVO {

    private Long deviceId;

    /** LOCKED / UNLOCKED */
    private String status;

    /** AUTO_FACE / REMOTE / AUTO_LOCK / MANUAL_LOCK */
    private String source;

    /** 远程操作人，或授权通行姓名 */
    private String operator;

    /** 剩余自动上锁秒数（已锁则为 0） */
    private long remainSeconds;

    private Long unlockedAt;

    private Long autoLockAt;
}
