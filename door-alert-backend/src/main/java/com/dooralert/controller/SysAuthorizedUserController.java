package com.dooralert.controller;

import cn.dev33.satoken.annotation.SaCheckRole;
import com.dooralert.common.Result;
import com.dooralert.dto.SysAuthorizedUserDTO;
import com.dooralert.service.SysAuthorizedUserService;
import com.dooralert.vo.SysAuthorizedUserVO;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * 授权人员白名单 REST API
 */
@RestController
@RequestMapping("/api/authorized-users")
public class SysAuthorizedUserController {

    @Autowired
    private SysAuthorizedUserService sysAuthorizedUserService;

    /**
     * 获取白名单列表
     */
    @GetMapping
    public Result<List<SysAuthorizedUserVO>> list(
            @RequestParam(defaultValue = "false") boolean includeDisabled) {
        return Result.success(sysAuthorizedUserService.listAuthorizedUsers(includeDisabled));
    }

    /**
     * 新增授权员工（JSON，无照片）
     */
    @PostMapping
    @SaCheckRole("ADMIN")
    public Result<SysAuthorizedUserVO> add(@Valid @RequestBody SysAuthorizedUserDTO dto) {
        try {
            return Result.success("授权人员创建成功", sysAuthorizedUserService.addAuthorizedUser(dto));
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    /**
     * 新增授权员工并上传正脸照片（multipart，仅 ADMIN）
     * 表单字段：userCode, name, department, status, file
     */
    @PostMapping(value = "/with-avatar", consumes = "multipart/form-data")
    @SaCheckRole("ADMIN")
    public Result<SysAuthorizedUserVO> addWithAvatar(
            @RequestParam("userCode") String userCode,
            @RequestParam("name") String name,
            @RequestParam(value = "department", required = false) String department,
            @RequestParam(value = "status", required = false, defaultValue = "1") Integer status,
            @RequestParam("file") MultipartFile file) {
        try {
            SysAuthorizedUserDTO dto = new SysAuthorizedUserDTO();
            dto.setUserCode(userCode);
            dto.setName(name);
            dto.setDepartment(department);
            dto.setStatus(status);
            return Result.success(
                    "授权人员创建成功，人脸已同步至边缘识别库",
                    sysAuthorizedUserService.addAuthorizedUserWithAvatar(dto, file)
            );
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    /**
     * 启用/禁用授权人员（禁用会移除边缘人脸，启用会从 uploads 恢复并热加载）
     */
    @PutMapping("/{id}/status")
    @SaCheckRole("ADMIN")
    public Result<SysAuthorizedUserVO> updateStatus(
            @PathVariable Long id,
            @RequestParam Integer status) {
        try {
            String tip = status != null && status == 1
                    ? "已启用，人脸已恢复至边缘识别库"
                    : "已禁用，人脸已从边缘识别库移除";
            return Result.success(tip, sysAuthorizedUserService.updateStatus(id, status));
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    /**
     * 删除授权人员（同步移除边缘人脸）
     */
    @DeleteMapping("/{id}")
    @SaCheckRole("ADMIN")
    public Result<Void> delete(@PathVariable Long id) {
        try {
            sysAuthorizedUserService.deleteAuthorizedUser(id);
            return Result.success("授权人员已删除，边缘人脸库已同步", null);
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }
}
