package com.dooralert.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.dooralert.dto.SysUserDTO;
import com.dooralert.entity.SysUser;
import com.dooralert.vo.SysUserVO;

public interface SysUserService extends IService<SysUser> {

    /**
     * 分页查询用户
     */
    IPage<SysUserVO> pageUsers(long current, long size);

    /**
     * 根据 ID 查询用户（返回 VO）
     */
    SysUserVO getUserById(Long id);

    /**
     * 新增用户
     */
    boolean addUser(SysUserDTO dto);

    /**
     * 修改用户
     */
    boolean updateUser(Long id, SysUserDTO dto);
}
