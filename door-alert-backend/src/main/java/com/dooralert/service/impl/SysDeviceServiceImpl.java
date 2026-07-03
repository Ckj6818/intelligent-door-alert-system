package com.dooralert.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.dooralert.entity.SysDevice;
import com.dooralert.mapper.SysDeviceMapper;
import com.dooralert.service.SysDeviceService;
import org.springframework.stereotype.Service;

@Service
public class SysDeviceServiceImpl extends ServiceImpl<SysDeviceMapper, SysDevice> implements SysDeviceService {
}
