package com.dooralert.vo;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 用户信息 返回对象（脱敏，不含密码）
 */
@Data
public class SysUserVO {

    private Long id;

    private String username;

    private String nickname;

    private String role;

    private LocalDateTime createTime;
}
