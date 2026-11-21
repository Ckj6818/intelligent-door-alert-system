package com.dooralert.vo;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 授权人员返回对象
 */
@Data
public class SysAuthorizedUserVO {

    private Long id;
    private String userCode;
    private String name;
    private String department;
    private String avatarUrl;
    private Integer status;
    /** 边缘 authorized_faces/ 目录中该人员的底库照片张数 */
    private Integer faceTemplateCount;
    private LocalDateTime createTime;
}
