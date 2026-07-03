package com.dooralert.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 设备信息实体
 */
@Data
@TableName("sys_device")
public class SysDevice {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField("device_name")
    private String deviceName;

    @TableField("location")
    private String location;

    /** 设备状态: 0-离线, 1-在线 */
    @TableField("status")
    private Integer status;

    @TableField(value = "create_time", fill = FieldFill.INSERT)
    private LocalDateTime createTime;
}
