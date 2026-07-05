package com.dooralert.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * AI 边缘端告警上报 入参对象（供 Python 机器视觉脚本调用）
 */
@Data
public class AlertUploadDTO {

    @NotNull(message = "设备ID不能为空")
    private Long deviceId;


    @NotNull(message = "接近度不能为空")
    private Double proximityRatio;

    @NotNull(message = "危险等级不能为空")
    private Integer dangerLevel;
}
