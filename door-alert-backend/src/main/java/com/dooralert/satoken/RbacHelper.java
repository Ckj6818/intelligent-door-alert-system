package com.dooralert.satoken;

import com.dooralert.entity.SysUser;

import java.util.Collections;
import java.util.List;

/**
 * RBAC 角色与权限映射工具。
 * 根据用户名/角色字段为 Sa-Token 提供权限列表。
 */
public final class RbacHelper {

    private RbacHelper() {
    }

    public static List<String> getRoles(SysUser user) {
        if (user == null) {
            return Collections.emptyList();
        }
        if (isAdmin(user)) {
            return List.of("ADMIN");
        }
        return List.of("OPERATOR");
    }

    public static List<String> getPermissions(SysUser user) {
        if (user == null) {
            return Collections.emptyList();
        }
        if (isAdmin(user)) {
            return List.of("alert:handle", "alert:export", "device:manage");
        }
        return List.of("alert:handle");
    }

    private static boolean isAdmin(SysUser user) {
        return "admin".equalsIgnoreCase(user.getUsername())
                || "admin".equalsIgnoreCase(user.getRole());
    }
}
