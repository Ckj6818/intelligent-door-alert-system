package com.dooralert.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.dooralert.entity.AlertLog;
import com.dooralert.mapper.AlertLogMapper;
import com.dooralert.service.AlertLogService;
import org.springframework.stereotype.Service;

@Service
public class AlertLogServiceImpl extends ServiceImpl<AlertLogMapper, AlertLog> implements AlertLogService {
}
