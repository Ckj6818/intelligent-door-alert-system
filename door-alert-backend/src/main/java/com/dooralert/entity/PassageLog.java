package com.dooralert.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 授权通行日志（authStatus = AUTHORIZED）
 */
@Data
@TableName("passage_log")
public class PassageLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField("device_id")
    private Long deviceId;

    @TableField("recognized_name")
    private String recognizedName;

    @TableField("auth_status")
    private String authStatus;

    @TableField("proximity_ratio")
    private Double proximityRatio;

    @TableField("image_url")
    private String imageUrl;

    @TableField(value = "create_time", fill = FieldFill.INSERT)
    private LocalDateTime createTime;
}
