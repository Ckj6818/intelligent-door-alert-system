package com.dooralert.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("alert_log")
public class AlertLog {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long deviceId;
    private String snapshotUrl;
    private BigDecimal targetAreaRatio;
    private Integer dangerLevel;
    private LocalDateTime timestamp;
    private Integer status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
