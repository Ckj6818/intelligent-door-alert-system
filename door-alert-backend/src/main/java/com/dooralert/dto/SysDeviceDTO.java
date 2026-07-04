package com.dooralert.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 设备新增/修改 入参对象
 */
@Data
public class SysDeviceDTO {

    @NotBlank(message = "设备名称不能为空")
    @Size(max = 100, message = "设备名称长度不能超过100")
    private String deviceName;

    @Size(max = 200, message = "位置描述长度不能超过200")
    private String location;

    /** 0-离线, 1-在线 */
    private Integer status;
}
