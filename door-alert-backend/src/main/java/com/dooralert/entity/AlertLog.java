package com.dooralert.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 告警日志实体
 */
@Data
@TableName("alert_log")
public class AlertLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField("device_id")
    private Long deviceId;

    @TableField("image_url")
    private String imageUrl;

    /** 目标接近度 (0~1) */
    @TableField("proximity_ratio")
    private Double proximityRatio;

    /** 危险等级: 0-安全, 1-注意, 2-警告, 3-危险 */
    @TableField("danger_level")
    private Integer dangerLevel;

    /** 处理状态: 0-未处理, 1-已处理 */
    @TableField("status")
    private Integer status;

    @TableField(value = "create_time", fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField("deleted")
    private Integer deleted;

    @TableField("delete_time")
    private LocalDateTime deleteTime;
}
