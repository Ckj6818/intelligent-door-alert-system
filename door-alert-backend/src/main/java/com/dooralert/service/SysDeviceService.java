package com.dooralert.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.dooralert.dto.SysDeviceDTO;
import com.dooralert.entity.SysDevice;
import com.dooralert.vo.SysDeviceVO;

public interface SysDeviceService extends IService<SysDevice> {

    IPage<SysDeviceVO> pageDevices(long current, long size);

    SysDeviceVO getDeviceById(Long id);

    boolean addDevice(SysDeviceDTO dto);

    boolean updateDevice(Long id, SysDeviceDTO dto);
}
