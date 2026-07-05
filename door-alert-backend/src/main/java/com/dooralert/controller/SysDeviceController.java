package com.dooralert.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.dooralert.common.Result;
import com.dooralert.dto.SysDeviceDTO;
import com.dooralert.service.SysDeviceService;
import com.dooralert.vo.SysDeviceVO;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

/**
 * 设备管理接口
 */
@RestController
@RequestMapping("/api/devices")
public class SysDeviceController {

    @Autowired
    private SysDeviceService sysDeviceService;

    /**
     * 分页查询设备列表
     */
    @GetMapping
    public Result<IPage<SysDeviceVO>> page(
            @RequestParam(defaultValue = "1") long current,
            @RequestParam(defaultValue = "10") long size) {
        return Result.success(sysDeviceService.pageDevices(current, size));
    }

    /**
     * 根据 ID 查询设备详情
     */
    @GetMapping("/{id}")
    public Result<SysDeviceVO> getById(@PathVariable Long id) {
        SysDeviceVO vo = sysDeviceService.getDeviceById(id);
        return vo != null ? Result.success(vo) : Result.error("设备不存在");
    }

    /**
     * 新增设备
     */
    @PostMapping
    @SaCheckPermission("device:manage")
    public Result<Boolean> add(@Valid @RequestBody SysDeviceDTO dto) {
        return Result.success(sysDeviceService.addDevice(dto));
    }

    /**
     * 修改设备
     */
    @PutMapping("/{id}")
    @SaCheckPermission("device:manage")
    public Result<Boolean> update(@PathVariable Long id, @Valid @RequestBody SysDeviceDTO dto) {
        return sysDeviceService.updateDevice(id, dto)
                ? Result.success(true)
                : Result.error("设备不存在或更新失败");
    }

    /**
     * 删除设备
     */
    @DeleteMapping("/{id}")
    @SaCheckPermission("device:manage")
    public Result<Boolean> delete(@PathVariable Long id) {
        return Result.success(sysDeviceService.removeById(id));
    }
}
