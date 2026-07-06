package com.dooralert.satoken;

import com.dooralert.entity.SysUser;

import java.util.Collections;
import java.util.List;
import java.util.Locale;

/**
 * RBAC 角色与权限映射工具。
 * 以数据库 sys_user.role 字段（ADMIN / OPERATOR）为唯一数据源。
 */
public final class RbacHelper {

    public static final String ROLE_ADMIN = "ADMIN";
    public static final String ROLE_OPERATOR = "OPERATOR";

    private RbacHelper() {
    }

    /**
     * 返回 Sa-Token 角色列表，直接映射数据库 role 字段。
     */
    public static List<String> getRoles(SysUser user) {
        if (user == null || user.getRole() == null || user.getRole().isBlank()) {
            return Collections.emptyList();
        }
        String role = normalizeRole(user.getRole());
        if (ROLE_ADMIN.equals(role) || ROLE_OPERATOR.equals(role)) {
            return List.of(role);
        }
        return Collections.emptyList();
    }

    /**
     * 根据数据库角色返回权限列表。
     */
    public static List<String> getPermissions(SysUser user) {
        if (user == null || user.getRole() == null || user.getRole().isBlank()) {
            return Collections.emptyList();
        }
        if (ROLE_ADMIN.equals(normalizeRole(user.getRole()))) {
            return List.of("alert:handle", "alert:export", "device:manage");
        }
        if (ROLE_OPERATOR.equals(normalizeRole(user.getRole()))) {
            return List.of("alert:handle");
        }
        return Collections.emptyList();
    }

    public static boolean isAdmin(SysUser user) {
        return user != null && ROLE_ADMIN.equals(normalizeRole(user.getRole()));
    }

    private static String normalizeRole(String role) {
        return role.trim().toUpperCase(Locale.ROOT);
    }
}
