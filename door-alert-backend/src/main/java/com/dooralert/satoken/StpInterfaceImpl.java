package com.dooralert.satoken;

import cn.dev33.satoken.stp.StpInterface;
import com.dooralert.entity.SysUser;
import com.dooralert.mapper.SysUserMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.List;

/**
 * Sa-Token 权限数据源：按登录用户 ID 从数据库加载角色与权限。
 */
@Component
public class StpInterfaceImpl implements StpInterface {

    @Autowired
    private SysUserMapper sysUserMapper;

    @Override
    public List<String> getPermissionList(Object loginId, String loginType) {
        SysUser user = loadUser(loginId);
        return RbacHelper.getPermissions(user);
    }

    @Override
    public List<String> getRoleList(Object loginId, String loginType) {
        SysUser user = loadUser(loginId);
        return RbacHelper.getRoles(user);
    }

    private SysUser loadUser(Object loginId) {
        if (loginId == null) {
            return null;
        }
        try {
            Long userId = Long.parseLong(loginId.toString());
            return sysUserMapper.selectById(userId);
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}
