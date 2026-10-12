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
    private LocalDateTime createTime;
}
