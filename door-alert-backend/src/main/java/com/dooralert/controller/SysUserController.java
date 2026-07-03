package com.dooralert.controller;

import com.dooralert.common.Result;
import com.dooralert.entity.SysUser;
import com.dooralert.service.SysUserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/users")
public class SysUserController {

    @Autowired
    private SysUserService sysUserService;

    @GetMapping
    public Result<List<SysUser>> list() {
        return Result.success(sysUserService.list());
    }

    @PostMapping
    public Result<Boolean> save(@RequestBody SysUser sysUser) {
        return Result.success(sysUserService.save(sysUser));
    }
}
