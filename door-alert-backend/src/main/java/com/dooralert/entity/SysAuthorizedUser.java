package com.dooralert.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 授权人员白名单实体（人脸比对库）
 */
@Data
@TableName("sys_authorized_user")
public class SysAuthorizedUser {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 工号 */
    @TableField("user_code")
    private String userCode;

    /** 姓名 */
    @TableField("name")
    private String name;

    /** 部门 */
    @TableField("department")
    private String department;

    /** 人脸照片路径 */
    @TableField("avatar_url")
    private String avatarUrl;

    /** 1-启用 / 0-禁用 */
    @TableField("status")
    private Integer status;

    @TableField(value = "create_time", fill = FieldFill.INSERT)
    private LocalDateTime createTime;
}
