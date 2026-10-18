package com.dooralert.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.dooralert.dto.SysDeviceDTO;
import com.dooralert.entity.SysDevice;
import com.dooralert.mapper.SysDeviceMapper;
import com.dooralert.service.SysDeviceService;
import com.dooralert.vo.EdgeConfigVO;
import com.dooralert.vo.SysDeviceVO;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class SysDeviceServiceImpl extends ServiceImpl<SysDeviceMapper, SysDevice> implements SysDeviceService {

    private final ObjectMapper objectMapper = new ObjectMapper();

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
        if (entity.getStatus() == null) {
            entity.setStatus(0);
        }
        return this.save(entity);
    }

    @Override
    public boolean updateDevice(Long id, SysDeviceDTO dto) {
        SysDevice entity = this.getById(id);
        if (entity == null) {
            return false;
        }
        entity.setDeviceName(dto.getDeviceName());
        entity.setLocation(dto.getLocation());
        entity.setId(id);
        return this.updateById(entity);
    }

    @Override
    public EdgeConfigVO getEdgeConfig(Long deviceId) {
        SysDevice entity = deviceId == null ? null : this.getById(deviceId);
        if (entity == null || !StringUtils.hasText(entity.getEdgeConfig())) {
            return new EdgeConfigVO();
        }
        try {
            EdgeConfigVO parsed = objectMapper.readValue(entity.getEdgeConfig(), EdgeConfigVO.class);
            return parsed == null ? new EdgeConfigVO() : parsed;
        } catch (Exception e) {
            return new EdgeConfigVO();
        }
    }

    @Override
    public boolean updateEdgeConfig(Long deviceId, EdgeConfigVO config) {
        if (deviceId == null || this.getById(deviceId) == null) {
            return false;
        }
        EdgeConfigVO safe = config == null ? new EdgeConfigVO() : config;
        if (safe.getDangerDistanceM() == null) {
            safe.setDangerDistanceM(1.5);
        }
        if (safe.getCooldownSec() == null) {
            safe.setCooldownSec(10);
        }
        if (safe.getFaceMatchThreshold() == null) {
            safe.setFaceMatchThreshold(0.363);
        }
        if (safe.getTailgateEnabled() == null) {
            safe.setTailgateEnabled(true);
        }
        try {
            String json = objectMapper.writeValueAsString(safe);
            LambdaUpdateWrapper<SysDevice> wrapper = new LambdaUpdateWrapper<>();
            wrapper.eq(SysDevice::getId, deviceId).set(SysDevice::getEdgeConfig, json);
            return this.update(wrapper);
        } catch (Exception e) {
            return false;
        }
    }

    private SysDeviceVO toVO(SysDevice entity) {
        SysDeviceVO vo = new SysDeviceVO();
        BeanUtils.copyProperties(entity, vo);
        return vo;
    }
}
