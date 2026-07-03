package com.dooralert.vo;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 设备信息 返回对象
 */
@Data
public class SysDeviceVO {

    private Long id;

    private String deviceName;

    private String location;

    /** 0-离线, 1-在线 */
    private Integer status;

    private LocalDateTime createTime;
}
