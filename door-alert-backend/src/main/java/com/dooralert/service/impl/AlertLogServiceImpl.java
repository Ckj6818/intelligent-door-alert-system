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
        // 使用 LambdaQueryWrapper 按创建时间降序排列，最新告警排在最前面
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<AlertLog> wrapper = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
        wrapper.orderByDesc(AlertLog::getCreateTime);
        Page<AlertLog> page = this.page(new Page<>(current, size), wrapper);
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
    public boolean handleAlert(Long id) {
        AlertLog entity = this.getById(id);
        if (entity == null) {
            return false;
        }
        entity.setStatus(1);
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
                // 定义项目根目录下的 uploads 文件夹的绝对路径
                java.io.File uploadDir = new java.io.File(System.getProperty("user.dir"), "uploads");
                if (!uploadDir.exists()) {
                    boolean created = uploadDir.mkdirs();
                    log.info("创建上传目录 uploads: {}, 绝对路径: {}", created, uploadDir.getAbsolutePath());
                }
                
                // 生成唯一文件名
                String originalFilename = file.getOriginalFilename();
                String suffix = originalFilename != null && originalFilename.contains(".") 
                        ? originalFilename.substring(originalFilename.lastIndexOf(".")) 
                        : ".jpg";
                String newFilename = java.util.UUID.randomUUID().toString().replace("-", "") + suffix;
                
                // 保存文件到本地磁盘
                java.io.File dest = new java.io.File(uploadDir, newFilename);
                log.info("准备保存图片到路径: {}", dest.getAbsolutePath());
                file.transferTo(dest);
                log.info("图片保存成功");
                
                // 设置图片相对路径，前端可直接通过 /uploads/xxx.jpg 访问
                entity.setImageUrl("/uploads/" + newFilename);
            } catch (Exception e) {
                log.error("图片保存或上传失败", e);
                e.printStackTrace();
            }
        } else {
            log.warn("上传接口未接收到图片文件或文件为空");
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
