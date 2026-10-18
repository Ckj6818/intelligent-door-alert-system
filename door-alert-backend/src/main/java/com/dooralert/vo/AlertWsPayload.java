package com.dooralert.vo;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * WebSocket 实时广播载荷（态势大屏）
 */
@Data
@Builder
public class AlertWsPayload {

    /** 告警/通行记录 ID */
    private Long alertId;

    /** AUTHORIZED / UNAUTHORIZED */
    private String authStatus;

    /** 识别姓名 */
    private String recognizedName;

    /** 面积占比 / 接近度 */
    private Double areaRatio;

    /** 危险等级（alertLevel） */
    private Integer alertLevel;

    /** 抓拍图片 URL */
    private String imageUrl;

    /** 事件时间 */
    private LocalDateTime timestamp;

    /** 事件类型：ALERT（待处理工单） / PASSAGE（通行日志） */
    private String eventType;

    /** 告警子类型：INTRUSION / TAILGATING / LOITERING */
    private String alertType;

    private Long deviceId;

    private Integer status;
}
