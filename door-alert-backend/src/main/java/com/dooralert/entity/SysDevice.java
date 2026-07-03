package com.dooralert.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_device")
public class SysDevice {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String deviceCode;
    private String deviceName;
    private Integer status;
    private String location;
    private String ipAddress;
    private LocalDateTime accessTime;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
