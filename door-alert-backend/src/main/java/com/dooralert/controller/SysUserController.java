package com.dooralert.controller;

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
     * 用户登录，返回 JWT Token
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
     * 分页查询用户列表
     */
    @GetMapping
    public Result<?> page(
            @RequestParam(defaultValue = "1") long current,
            @RequestParam(defaultValue = "10") long size) {
        try {
            return Result.success(sysUserService.pageUsers(current, size));
        } catch (Exception e) {
            e.printStackTrace();
            return Result.error("Error: " + e.getMessage() + " | Cause: " + (e.getCause() != null ? e.getCause().getMessage() : ""));
        }
    }

    /**
     * 根据 ID 查询用户详情
     */
    @GetMapping("/{id}")
    public Result<SysUserVO> getById(@PathVariable Long id) {
        SysUserVO vo = sysUserService.getUserById(id);
        return vo != null ? Result.success(vo) : Result.error("用户不存在");
    }

    /**
     * 新增用户
     */
    @PostMapping
    public Result<Boolean> add(@Valid @RequestBody SysUserDTO dto) {
        return Result.success(sysUserService.addUser(dto));
    }

    /**
     * 修改用户
     */
    @PutMapping("/{id}")
    public Result<Boolean> update(@PathVariable Long id, @Valid @RequestBody SysUserDTO dto) {
        return sysUserService.updateUser(id, dto)
                ? Result.success(true)
                : Result.error("用户不存在或更新失败");
    }

    /**
     * 删除用户
     */
    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable Long id) {
        return Result.success(sysUserService.removeById(id));
    }
}
