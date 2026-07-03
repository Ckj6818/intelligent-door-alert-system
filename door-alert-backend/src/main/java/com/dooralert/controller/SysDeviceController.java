package com.dooralert.controller;

import com.dooralert.common.Result;
import com.dooralert.entity.SysDevice;
import com.dooralert.service.SysDeviceService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/devices")
public class SysDeviceController {

    @Autowired
    private SysDeviceService sysDeviceService;

    @GetMapping
    public Result<List<SysDevice>> list() {
        return Result.success(sysDeviceService.list());
    }

    @PostMapping
    public Result<Boolean> save(@RequestBody SysDevice sysDevice) {
        return Result.success(sysDeviceService.save(sysDevice));
    }
}
