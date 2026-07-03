package com.dooralert.dto;

import lombok.Data;

/**
 * 告警日志修改 入参对象（如处理状态变更）
 */
@Data
public class AlertLogDTO {

    private Long deviceId;

    private String imageUrl;

    private Double proximityRatio;

    private Integer dangerLevel;

    /** 0-未处理, 1-已处理 */
    private Integer status;
}
