package com.dooralert.vo;

import lombok.Data;

import java.util.List;

@Data
public class LoginVO {

    private String token;

    private Long userId;

    private String username;

    private String nickname;

    /** 数据库原始角色字段 */
    private String role;

    /** Sa-Token RBAC 角色列表，如 ADMIN / OPERATOR */
    private List<String> roles;

    /** Sa-Token RBAC 权限列表，如 alert:handle */
    private List<String> permissions;
}
