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

    /** AUTHORIZED / UNAUTHORIZED */
    private String authStatus;

    /** 识别到的姓名 */
    private String recognizedName;

    /** INTRUSION / TAILGATING / LOITERING */
    private String alertType;

    /** 0-未处理(待处理工单), 1-已处理 */
    private Integer status;

    private LocalDateTime createTime;

    private LocalDateTime deleteTime;
}
