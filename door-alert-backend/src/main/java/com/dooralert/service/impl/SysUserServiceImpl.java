package com.dooralert.service.impl;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.dooralert.dto.LoginDTO;
import com.dooralert.dto.SysUserDTO;
import com.dooralert.entity.SysUser;
import com.dooralert.mapper.SysUserMapper;
import com.dooralert.service.SysUserService;
import com.dooralert.satoken.RbacHelper;
import com.dooralert.vo.LoginVO;
import com.dooralert.vo.SysUserVO;
import cn.dev33.satoken.stp.StpUtil;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;

@Service
public class SysUserServiceImpl extends ServiceImpl<SysUserMapper, SysUser> implements SysUserService {

    @Override
    public IPage<SysUserVO> pageUsers(long current, long size) {
        Page<SysUser> page = this.page(new Page<>(current, size));
        return page.convert(this::toVO);
    }

    @Override
    public SysUserVO getUserById(Long id) {
        SysUser entity = this.getById(id);
        return entity == null ? null : toVO(entity);
    }

    @Override
    public boolean addUser(SysUserDTO dto) {
        SysUser entity = new SysUser();
        BeanUtils.copyProperties(dto, entity);
        return this.save(entity);
    }

    @Override
    public boolean updateUser(Long id, SysUserDTO dto) {
        SysUser entity = this.getById(id);
        if (entity == null) {
            return false;
        }
        BeanUtils.copyProperties(dto, entity);
        entity.setId(id);
        return this.updateById(entity);
    }

    @Override
    public LoginVO login(LoginDTO dto) {
        String username = dto.getUsername() == null ? "" : dto.getUsername().trim();
        String password = dto.getPassword() == null ? "" : dto.getPassword().trim();

        SysUser user = this.lambdaQuery()
                .eq(SysUser::getUsername, username)
                .one();

        if (user == null || !user.getPassword().equals(password)) {
            throw new RuntimeException("用户名或密码错误");
        }

        // Sa-Token JWT 登录：loginId 使用用户主键，会话与 RBAC 均按数据库角色加载
        StpUtil.login(user.getId());
        String token = StpUtil.getTokenValue();

        LoginVO vo = new LoginVO();
        vo.setToken(token);
        vo.setUserId(user.getId());
        vo.setUsername(user.getUsername());
        vo.setNickname(user.getNickname());
        // 返回数据库真实角色：ADMIN / OPERATOR
        vo.setRole(user.getRole());
        vo.setRoles(RbacHelper.getRoles(user));
        vo.setPermissions(RbacHelper.getPermissions(user));
        return vo;
    }

    /**
     * Entity -> VO（脱敏，不暴露密码）
     */
    private SysUserVO toVO(SysUser entity) {
        SysUserVO vo = new SysUserVO();
        vo.setId(entity.getId());
        vo.setUsername(entity.getUsername());
        vo.setNickname(entity.getNickname());
        vo.setRole(entity.getRole());
        vo.setCreateTime(entity.getCreateTime());
        return vo;
    }
}
