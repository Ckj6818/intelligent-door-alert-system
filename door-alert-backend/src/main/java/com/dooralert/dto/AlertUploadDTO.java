package com.dooralert.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * AI 边缘端告警 / 通行上报入参（multipart form 字段）
 */
@Data
public class AlertUploadDTO {

    @NotNull(message = "设备ID不能为空")
    private Long deviceId;

    @NotNull(message = "接近度不能为空")
    private Double proximityRatio;

    @NotNull(message = "危险等级不能为空")
    private Integer dangerLevel;

    /** AUTHORIZED / UNAUTHORIZED（兼容 auth_status / authStatus） */
    private String authStatus;

    /** 识别姓名（兼容 recognized_name / recognizedName） */
    private String recognizedName;

    /** 可选：边缘端直接传来的 JPEG Base64（无 file 时落盘） */
    private String snapshotBase64;
}
