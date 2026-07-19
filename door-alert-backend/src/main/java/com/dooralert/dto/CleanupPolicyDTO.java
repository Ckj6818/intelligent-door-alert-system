package com.dooralert.dto;

import lombok.Data;

/**
 * 逻辑删除记录自动清理策略
 */
@Data
public class CleanupPolicyDTO {

    /** 策略标识：24h / 7d / never */
    private String policy;

    /** 清理间隔天数；-1 表示从不自动清理 */
    private Integer intervalDays;
}
