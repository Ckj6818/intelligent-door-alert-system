package com.dooralert.controller;

import cn.dev33.satoken.annotation.SaCheckRole;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.dooralert.common.Result;
import com.dooralert.dto.LoginDTO;
import com.dooralert.dto.SysUserDTO;
import com.dooralert.service.SysUserService;
import com.dooralert.vo.LoginVO;
import com.dooralert.vo.SysUserVO;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

/**
 * 系统用户管理接口
 */
@RestController
@RequestMapping("/api/users")
public class SysUserController {

    @Autowired
    private SysUserService sysUserService;

    /**
     * 用户登录，返回 JWT Token（公开接口）
     */
    @PostMapping("/login")
    public Result<LoginVO> login(@Valid @RequestBody LoginDTO dto) {
        try {
            return Result.success("登录成功", sysUserService.login(dto));
        } catch (RuntimeException e) {
            return Result.error(401, e.getMessage());
        }
    }

    /**
     * 分页查询用户列表（仅 ADMIN）
     */
    @GetMapping
    @SaCheckRole("ADMIN")
    public Result<IPage<SysUserVO>> page(
            @RequestParam(defaultValue = "1") long current,
            @RequestParam(defaultValue = "50") long size,
            @RequestParam(required = false) String role) {
        return Result.success(sysUserService.pageUsers(current, size, role));
    }

    /**
     * 根据 ID 查询用户详情（仅 ADMIN）
     */
    @GetMapping("/{id}")
    @SaCheckRole("ADMIN")
    public Result<SysUserVO> getById(@PathVariable Long id) {
        SysUserVO vo = sysUserService.getUserById(id);
        return vo != null ? Result.success(vo) : Result.error("用户不存在");
    }

    /**
     * 新增安保账号（仅 ADMIN，强制 OPERATOR 角色）
     */
    @PostMapping
    @SaCheckRole("ADMIN")
    public Result<Boolean> add(@Valid @RequestBody SysUserDTO dto) {
        try {
            return Result.success("安保账号创建成功", sysUserService.addUser(dto));
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    /**
     * 修改用户（仅 ADMIN）
     */
    @PutMapping("/{id}")
    @SaCheckRole("ADMIN")
    public Result<Boolean> update(@PathVariable Long id, @Valid @RequestBody SysUserDTO dto) {
        try {
            return sysUserService.updateUser(id, dto)
                    ? Result.success(true)
                    : Result.error("用户不存在或更新失败");
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    /**
     * 删除安保账号（仅 ADMIN，禁止删除管理员）
     */
    @DeleteMapping("/{id}")
    @SaCheckRole("ADMIN")
    public Result<Boolean> delete(@PathVariable Long id) {
        try {
            return Result.success("账号已注销", sysUserService.deleteUser(id));
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    /**
     * 重置安保密码为默认 123456（仅 ADMIN）
     */
    @PutMapping("/{id}/reset-password")
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
}
