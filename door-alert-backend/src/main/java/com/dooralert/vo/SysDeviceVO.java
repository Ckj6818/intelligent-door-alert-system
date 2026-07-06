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

    /** 0-离线, 1-在线（查询时由心跳池实时计算，非库内静态值） */
    private Integer status;

    private LocalDateTime createTime;
}
