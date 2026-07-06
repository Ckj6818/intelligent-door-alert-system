package com.dooralert.controller;

import cn.dev33.satoken.annotation.SaCheckRole;
import com.dooralert.common.Result;
import com.dooralert.dto.LoginDTO;
import com.dooralert.dto.SysUserDTO;
import com.dooralert.service.SysUserService;
import com.dooralert.vo.LoginVO;
import com.dooralert.vo.SysUserVO;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 系统用户接口：登录（公开）+ 安保人员账户管理（仅 ADMIN）
 */
@RestController
@RequestMapping("/api")
public class SysUserController {

    @Autowired
    private SysUserService sysUserService;

    /**
     * 用户登录，返回 Sa-Token JWT（公开接口）
     */
    @PostMapping("/users/login")
    public Result<LoginVO> login(@Valid @RequestBody LoginDTO dto) {
        try {
            return Result.success("登录成功", sysUserService.login(dto));
        } catch (RuntimeException e) {
            return Result.error(401, e.getMessage());
        }
    }

    /**
     * 查询所有安保人员账户（OPERATOR 角色，不含管理员）
     */
    @GetMapping("/sys-user/list")
    @SaCheckRole("ADMIN")
    public Result<List<SysUserVO>> listOperators() {
        return Result.success(sysUserService.listOperators());
    }

    /**
     * 新增安保账户（强制 OPERATOR 角色）
     */
    @PostMapping("/sys-user/add")
    @SaCheckRole("ADMIN")
    public Result<Boolean> addOperator(@Valid @RequestBody SysUserDTO dto) {
        try {
            return Result.success("安保账号创建成功", sysUserService.addUser(dto));
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    /**
     * 一键重置安保密码为 123456（现场演示用）
     */
    @PostMapping("/sys-user/reset-password/{id}")
    @SaCheckRole("ADMIN")
    public Result<Boolean> resetPassword(@PathVariable Long id) {
        try {
            return sysUserService.resetPassword(id)
                    ? Result.success("密码已重置为 123456", true)
                    : Result.error("用户不存在或重置失败");
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    /**
     * 注销安保账户（物理删除，禁止删除 ADMIN）
     */
    @DeleteMapping("/sys-user/delete/{id}")
    @SaCheckRole("ADMIN")
    public Result<Boolean> deleteOperator(@PathVariable Long id) {
        try {
            return Result.success("账号已注销", sysUserService.deleteUser(id));
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }
}
