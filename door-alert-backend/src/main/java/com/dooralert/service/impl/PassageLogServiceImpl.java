package com.dooralert.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.dooralert.entity.PassageLog;
import com.dooralert.mapper.PassageLogMapper;
import com.dooralert.service.PassageLogService;
import org.springframework.stereotype.Service;

@Service
public class PassageLogServiceImpl
        extends ServiceImpl<PassageLogMapper, PassageLog>
        implements PassageLogService {
}
