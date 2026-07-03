package com.dooralert.service.impl;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.dooralert.dto.SysDeviceDTO;
import com.dooralert.entity.SysDevice;
import com.dooralert.mapper.SysDeviceMapper;
import com.dooralert.service.SysDeviceService;
import com.dooralert.vo.SysDeviceVO;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;

@Service
public class SysDeviceServiceImpl extends ServiceImpl<SysDeviceMapper, SysDevice> implements SysDeviceService {

    @Override
    public IPage<SysDeviceVO> pageDevices(long current, long size) {
        Page<SysDevice> page = this.page(new Page<>(current, size));
        return page.convert(this::toVO);
    }

    @Override
    public SysDeviceVO getDeviceById(Long id) {
        SysDevice entity = this.getById(id);
        return entity == null ? null : toVO(entity);
    }

    @Override
    public boolean addDevice(SysDeviceDTO dto) {
        SysDevice entity = new SysDevice();
        BeanUtils.copyProperties(dto, entity);
        return this.save(entity);
    }

    @Override
    public boolean updateDevice(Long id, SysDeviceDTO dto) {
        SysDevice entity = this.getById(id);
        if (entity == null) {
            return false;
        }
        BeanUtils.copyProperties(dto, entity);
        entity.setId(id);
        return this.updateById(entity);
    }

    private SysDeviceVO toVO(SysDevice entity) {
        SysDeviceVO vo = new SysDeviceVO();
        BeanUtils.copyProperties(entity, vo);
        return vo;
    }
}
