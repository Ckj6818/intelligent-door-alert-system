package com.dooralert.vo;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 告警日志 返回对象
 */
@Data
public class AlertLogVO {

    private Long id;

    private Long deviceId;

    private String imageUrl;

    private Double proximityRatio;

    private Integer dangerLevel;

    /** 0-未处理, 1-已处理 */
    private Integer status;

    private LocalDateTime createTime;

    private LocalDateTime deleteTime;
}
