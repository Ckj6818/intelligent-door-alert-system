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

import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
public class AlertLogServiceImpl extends ServiceImpl<AlertLogMapper, AlertLog> implements AlertLogService {

    @Override
    public IPage<AlertLogVO> pageAlerts(long current, long size) {
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<AlertLog> wrapper = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
        wrapper.eq(AlertLog::getDeleted, 0); // 仅查询未被逻辑删除的记录
        wrapper.orderByDesc(AlertLog::getCreateTime);
        Page<AlertLog> page = this.page(new Page<>(current, size), wrapper);
        return page.convert(this::toVO);
    }

    @Override
    public AlertLogVO getAlertById(Long id) {
        AlertLog entity = this.getById(id);
        if (entity == null || Integer.valueOf(1).equals(entity.getDeleted())) {
            return null;
        }
        return toVO(entity);
    }

    @Override
    public boolean addAlert(AlertLogDTO dto) {
        AlertLog entity = new AlertLog();
        BeanUtils.copyProperties(dto, entity);
        entity.setDeleted(0); // 默认未删除
        return this.save(entity);
    }

    @Override
    public boolean updateAlert(Long id, AlertLogDTO dto) {
        AlertLog entity = this.getById(id);
        if (entity == null || Integer.valueOf(1).equals(entity.getDeleted())) {
            return false;
        }
        BeanUtils.copyProperties(dto, entity);
        entity.setId(id);
        return this.updateById(entity);
    }

    @Override
    public boolean handleAlert(Long id) {
        AlertLog entity = this.getById(id);
        if (entity == null || Integer.valueOf(1).equals(entity.getDeleted())) {
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

    @Override
    public List<AlertLogVO> listAllForExport() {
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<AlertLog> wrapper =
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
        wrapper.eq(AlertLog::getDeleted, 0); // 仅导出未被逻辑删除的记录
        wrapper.orderByDesc(AlertLog::getCreateTime);
        return this.list(wrapper).stream().map(this::toVO).collect(Collectors.toList());
    }

    private AlertLogVO toVO(AlertLog entity) {
        AlertLogVO vo = new AlertLogVO();
        BeanUtils.copyProperties(entity, vo);
        return vo;
    }

    @Override
    public boolean logicalDeleteAlert(Long id) {
        AlertLog entity = this.getById(id);
        if (entity == null || Integer.valueOf(1).equals(entity.getDeleted())) {
            return false;
        }
        entity.setDeleted(1);
        entity.setDeleteTime(java.time.LocalDateTime.now());
        return this.updateById(entity);
    }

    @Override
    public boolean logicalClearAll() {
        com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<AlertLog> wrapper = 
                new com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<>();
        wrapper.eq(AlertLog::getDeleted, 0)
               .set(AlertLog::getDeleted, 1)
               .set(AlertLog::getDeleteTime, java.time.LocalDateTime.now());
        return this.update(wrapper);
    }

    @Override
    public List<AlertLogVO> listRecycleBin() {
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<AlertLog> wrapper = 
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
        // 查询已删除，且删除时间在 15 天内的记录
        java.time.LocalDateTime limitTime = java.time.LocalDateTime.now().minusDays(15);
        wrapper.eq(AlertLog::getDeleted, 1)
               .ge(AlertLog::getDeleteTime, limitTime)
               .orderByDesc(AlertLog::getDeleteTime);
        return this.list(wrapper).stream().map(this::toVO).collect(Collectors.toList());
    }

    @Override
    public boolean restoreAlert(Long id) {
        AlertLog entity = this.getById(id);
        if (entity == null || !Integer.valueOf(1).equals(entity.getDeleted())) {
            return false;
        }
        entity.setDeleted(0);
        
        // MyBatis-Plus 默认可能不更新为 null 的字段，我们需要用 UpdateWrapper 或者手动设置一个占位符，
        // 这里使用 LambdaUpdateWrapper 来显式把 delete_time 更新为 null
        com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<AlertLog> wrapper = 
                new com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<>();
        wrapper.eq(AlertLog::getId, id)
               .set(AlertLog::getDeleted, 0)
               .set(AlertLog::getDeleteTime, null);
        return this.update(wrapper);
    }

    @Override
    public boolean permanentClearRecycleBin() {
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<AlertLog> wrapper = 
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
        wrapper.eq(AlertLog::getDeleted, 1);
        return this.remove(wrapper);
    }
}
