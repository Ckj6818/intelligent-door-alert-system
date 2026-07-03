package com.dooralert.controller;

import com.dooralert.common.Result;
import com.dooralert.entity.AlertLog;
import com.dooralert.service.AlertLogService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/alerts")
public class AlertLogController {

    @Autowired
    private AlertLogService alertLogService;

    @GetMapping
    public Result<List<AlertLog>> list() {
        return Result.success(alertLogService.list());
    }

    @PostMapping
    public Result<Boolean> save(@RequestBody AlertLog alertLog) {
        return Result.success(alertLogService.save(alertLog));
    }
}
