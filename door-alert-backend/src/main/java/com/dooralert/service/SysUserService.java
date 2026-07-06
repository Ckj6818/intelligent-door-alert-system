package com.dooralert.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.dooralert.dto.LoginDTO;
import com.dooralert.dto.SysUserDTO;
import com.dooralert.entity.SysUser;
import com.dooralert.vo.LoginVO;
import com.dooralert.vo.SysUserVO;

import java.util.List;

public interface SysUserService extends IService<SysUser> {

    /**
     * 查询所有安保人员（OPERATOR）
     */
    List<SysUserVO> listOperators();

    /**
     * 根据 ID 查询用户（返回 VO）
     */
    SysUserVO getUserById(Long id);

    /**
     * 新增安保用户
     */
    boolean addUser(SysUserDTO dto);

    /**
     * 修改用户
     */
    boolean updateUser(Long id, SysUserDTO dto);

    /**
     * 删除安保用户（禁止删除管理员）
     */
    boolean deleteUser(Long id);

    /**
     * 重置安保密码为默认 123456
     */
    boolean resetPassword(Long id);

    /**
     * 用户登录
     */
    LoginVO login(LoginDTO dto);
}
