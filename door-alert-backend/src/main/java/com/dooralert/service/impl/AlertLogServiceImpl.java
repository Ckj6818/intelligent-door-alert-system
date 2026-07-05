package com.dooralert.service.impl;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.dooralert.dto.AlertLogDTO;
import com.dooralert.dto.AlertUploadDTO;
import com.dooralert.entity.AlertLog;
import com.dooralert.mapper.AlertLogMapper;
import com.dooralert.service.AlertLogService;
import com.dooralert.vo.AlertLogVO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;

@Slf4j
@Service
public class AlertLogServiceImpl extends ServiceImpl<AlertLogMapper, AlertLog> implements AlertLogService {

    @Override
    public IPage<AlertLogVO> pageAlerts(long current, long size) {
        Page<AlertLog> page = this.page(new Page<>(current, size));
        return page.convert(this::toVO);
    }

    @Override
    public AlertLogVO getAlertById(Long id) {
        AlertLog entity = this.getById(id);
        return entity == null ? null : toVO(entity);
    }

    @Override
    public boolean addAlert(AlertLogDTO dto) {
        AlertLog entity = new AlertLog();
        BeanUtils.copyProperties(dto, entity);
        return this.save(entity);
    }

    @Override
    public boolean updateAlert(Long id, AlertLogDTO dto) {
        AlertLog entity = this.getById(id);
        if (entity == null) {
            return false;
        }
        BeanUtils.copyProperties(dto, entity);
        entity.setId(id);
        return this.updateById(entity);
    }

    @Override
    public AlertLogVO uploadAlert(AlertUploadDTO dto, org.springframework.web.multipart.MultipartFile file) {
        log.info("接收到边缘端告警数据，设备ID: {}", dto.getDeviceId());

        AlertLog entity = new AlertLog();
        entity.setDeviceId(dto.getDeviceId());
        entity.setProximityRatio(dto.getProximityRatio());
        entity.setDangerLevel(dto.getDangerLevel());
        // 默认未处理
        entity.setStatus(0);

        // 处理文件上传
        if (file != null && !file.isEmpty()) {
            try {
                // 定义项目根目录下的 uploads 文件夹
                java.io.File uploadDir = new java.io.File("uploads");
                if (!uploadDir.exists()) {
                    uploadDir.mkdirs();
                }
                
                // 生成唯一文件名
                String originalFilename = file.getOriginalFilename();
                String suffix = originalFilename != null && originalFilename.contains(".") 
                        ? originalFilename.substring(originalFilename.lastIndexOf(".")) 
                        : ".jpg";
                String newFilename = java.util.UUID.randomUUID().toString().replace("-", "") + suffix;
                
                // 保存文件到本地磁盘
                java.io.File dest = new java.io.File(uploadDir, newFilename);
                file.transferTo(dest);
                
                // 设置图片相对路径，前端可直接通过 /uploads/xxx.jpg 访问
                entity.setImageUrl("/uploads/" + newFilename);
            } catch (java.io.IOException e) {
                log.error("图片上传失败", e);
            }
        }

        this.save(entity);

        log.info("告警数据入库成功，记录ID: {}, 设备ID: {}, 危险等级: {}",
                entity.getId(), entity.getDeviceId(), entity.getDangerLevel());

        return toVO(entity);
    }

    private AlertLogVO toVO(AlertLog entity) {
        AlertLogVO vo = new AlertLogVO();
        BeanUtils.copyProperties(entity, vo);
        return vo;
    }
}
