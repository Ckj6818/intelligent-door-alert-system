package com.dooralert.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.dooralert.common.Result;
import com.dooralert.entity.AlertLog;
import com.dooralert.entity.PassageLog;
import com.dooralert.service.AlertLogService;
import com.dooralert.service.PassageLogService;
import com.dooralert.vo.PassageCompareVO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * 授权通行日志查询与今日对比统计。
 */
@RestController
@RequestMapping("/api/passages")
public class PassageLogController {

    @Autowired
    private PassageLogService passageLogService;

    @Autowired
    private AlertLogService alertLogService;

    @GetMapping
    public Result<IPage<PassageLog>> page(
            @RequestParam(defaultValue = "1") long current,
            @RequestParam(defaultValue = "10") long size) {
        LambdaQueryWrapper<PassageLog> wrapper = new LambdaQueryWrapper<>();
        wrapper.orderByDesc(PassageLog::getCreateTime);
        return Result.success(passageLogService.page(new Page<>(current, size), wrapper));
    }

    /**
     * 今日授权放行 vs 未授权拦截，并给出近 7 日趋势。
     */
    @GetMapping("/stats/today")
    public Result<PassageCompareVO> today() {
        LocalDate today = LocalDate.now();
        LocalDateTime startToday = today.atStartOfDay();
        LocalDateTime endToday = today.atTime(LocalTime.MAX);

        PassageCompareVO vo = new PassageCompareVO();
        vo.setPassageCount(countPassages(startToday, endToday));
        vo.setUnauthorizedAlertCount(countUnauthorized(startToday, endToday));

        for (int i = 6; i >= 0; i--) {
            LocalDate day = today.minusDays(i);
            LocalDateTime from = day.atStartOfDay();
            LocalDateTime to = day.atTime(LocalTime.MAX);
            PassageCompareVO.DayPoint point = new PassageCompareVO.DayPoint();
            point.setDate(day.toString());
            point.setPassages(countPassages(from, to));
            point.setAlerts(countUnauthorized(from, to));
            vo.getDays().add(point);
        }
        return Result.success(vo);
    }

    private long countPassages(LocalDateTime from, LocalDateTime to) {
        LambdaQueryWrapper<PassageLog> wrapper = new LambdaQueryWrapper<>();
        wrapper.ge(PassageLog::getCreateTime, from).le(PassageLog::getCreateTime, to);
        return passageLogService.count(wrapper);
    }

    private long countUnauthorized(LocalDateTime from, LocalDateTime to) {
        LambdaQueryWrapper<AlertLog> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(AlertLog::getDeleted, 0)
                .and(w -> w.eq(AlertLog::getAuthStatus, "UNAUTHORIZED").or().isNull(AlertLog::getAuthStatus))
                .ge(AlertLog::getCreateTime, from)
                .le(AlertLog::getCreateTime, to);
        return alertLogService.count(wrapper);
    }
}
