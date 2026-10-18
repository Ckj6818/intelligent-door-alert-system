package com.dooralert.vo;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 今日授权通行与未授权告警对比，以及近 7 日趋势。
 */
@Data
public class PassageCompareVO {

    private long passageCount;

    private long unauthorizedAlertCount;

    private List<DayPoint> days = new ArrayList<>();

    @Data
    public static class DayPoint {
        private String date;
        private long passages;
        private long alerts;
    }
}
