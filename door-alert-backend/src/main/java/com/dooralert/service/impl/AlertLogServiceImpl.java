package com.dooralert.service.impl;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.dooralert.dto.AlertLogDTO;
import com.dooralert.dto.AlertUploadDTO;
import com.dooralert.entity.AlertLog;
import com.dooralert.entity.PassageLog;
import com.dooralert.mapper.AlertLogMapper;
import com.dooralert.service.AlertLogService;
import com.dooralert.service.PassageLogService;
import com.dooralert.vo.AlertLogVO;
import com.dooralert.vo.AlertWsPayload;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

@Slf4j
@Service
public class AlertLogServiceImpl extends ServiceImpl<AlertLogMapper, AlertLog> implements AlertLogService {

    public static final String AUTH_AUTHORIZED = "AUTHORIZED";
    public static final String AUTH_UNAUTHORIZED = "UNAUTHORIZED";

    @Autowired
    private PassageLogService passageLogService;

    @Override
    public IPage<AlertLogVO> pageAlerts(long current, long size) {
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<AlertLog> wrapper =
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
        wrapper.eq(AlertLog::getDeleted, 0);
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
        entity.setDeleted(0);
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
    public AlertWsPayload uploadAlert(AlertUploadDTO dto, MultipartFile file) {
        String authStatus = normalizeAuthStatus(dto.getAuthStatus());
        String recognizedName = StringUtils.hasText(dto.getRecognizedName())
                ? dto.getRecognizedName().trim()
                : (AUTH_AUTHORIZED.equals(authStatus) ? "未知授权人员" : "未授权人员/陌生人");

        log.info("边缘端上报: deviceId={}, authStatus={}, recognizedName={}, areaRatio={}",
                dto.getDeviceId(), authStatus, recognizedName, dto.getProximityRatio());

        String imageUrl = persistSnapshot(file, dto.getSnapshotBase64());

        if (AUTH_AUTHORIZED.equals(authStatus)) {
            return savePassageLog(dto, recognizedName, imageUrl);
        }
        return saveUnauthorizedAlert(dto, recognizedName, imageUrl, authStatus);
    }

    /**
     * UNAUTHORIZED：写入 alert_log，标记为待处理工单 (status=0)
     */
    private AlertWsPayload saveUnauthorizedAlert(AlertUploadDTO dto, String recognizedName,
                                                 String imageUrl, String authStatus) {
        AlertLog entity = new AlertLog();
        entity.setDeviceId(dto.getDeviceId());
        entity.setProximityRatio(dto.getProximityRatio());
        entity.setDangerLevel(dto.getDangerLevel() != null ? dto.getDangerLevel() : 2);
        entity.setAuthStatus(authStatus);
        entity.setRecognizedName(recognizedName);
        entity.setImageUrl(imageUrl);
        entity.setStatus(0); // 待处理工单
        entity.setDeleted(0);
        this.save(entity);
        if (entity.getCreateTime() == null) {
            entity.setCreateTime(java.time.LocalDateTime.now());
        }

        log.info("未授权告警已入库(待处理工单): id={}, name={}", entity.getId(), recognizedName);

        return AlertWsPayload.builder()
                .alertId(entity.getId())
                .authStatus(entity.getAuthStatus())
                .recognizedName(entity.getRecognizedName())
                .areaRatio(entity.getProximityRatio())
                .alertLevel(entity.getDangerLevel())
                .imageUrl(entity.getImageUrl())
                .timestamp(entity.getCreateTime())
                .eventType("ALERT")
                .deviceId(entity.getDeviceId())
                .status(entity.getStatus())
                .build();
    }

    /**
     * AUTHORIZED：写入通行日志，不进入告警工单队列
     */
    private AlertWsPayload savePassageLog(AlertUploadDTO dto, String recognizedName, String imageUrl) {
        PassageLog passage = new PassageLog();
        passage.setDeviceId(dto.getDeviceId());
        passage.setRecognizedName(recognizedName);
        passage.setAuthStatus(AUTH_AUTHORIZED);
        passage.setProximityRatio(dto.getProximityRatio());
        passage.setImageUrl(imageUrl);
        passageLogService.save(passage);
        if (passage.getCreateTime() == null) {
            passage.setCreateTime(java.time.LocalDateTime.now());
        }

        log.info("授权通行日志已记录: id={}, name={}", passage.getId(), recognizedName);

        return AlertWsPayload.builder()
                .alertId(passage.getId())
                .authStatus(AUTH_AUTHORIZED)
                .recognizedName(recognizedName)
                .areaRatio(passage.getProximityRatio())
                .alertLevel(0)
                .imageUrl(passage.getImageUrl())
                .timestamp(passage.getCreateTime())
                .eventType("PASSAGE")
                .deviceId(passage.getDeviceId())
                .status(1)
                .build();
    }

    private String normalizeAuthStatus(String raw) {
        if (!StringUtils.hasText(raw)) {
            return AUTH_UNAUTHORIZED;
        }
        String upper = raw.trim().toUpperCase(Locale.ROOT);
        if (AUTH_AUTHORIZED.equals(upper)) {
            return AUTH_AUTHORIZED;
        }
        return AUTH_UNAUTHORIZED;
    }

    /**
     * 优先使用 multipart 文件；否则尝试解码 snapshot_base64
     */
    private String persistSnapshot(MultipartFile file, String snapshotBase64) {
        java.io.File uploadDir = new java.io.File(System.getProperty("user.dir"), "uploads");
        if (!uploadDir.exists()) {
            boolean created = uploadDir.mkdirs();
            log.info("创建上传目录 uploads: {}, 路径: {}", created, uploadDir.getAbsolutePath());
        }

        if (file != null && !file.isEmpty()) {
            try {
                String originalFilename = file.getOriginalFilename();
                String suffix = originalFilename != null && originalFilename.contains(".")
                        ? originalFilename.substring(originalFilename.lastIndexOf("."))
                        : ".jpg";
                String newFilename = java.util.UUID.randomUUID().toString().replace("-", "") + suffix;
                java.io.File dest = new java.io.File(uploadDir, newFilename);
                file.transferTo(dest);
                log.info("抓拍图片已保存: {}", dest.getAbsolutePath());
                return "/uploads/" + newFilename;
            } catch (Exception e) {
                log.error("multipart 图片保存失败", e);
            }
        }

        if (StringUtils.hasText(snapshotBase64)) {
            try {
                String pure = snapshotBase64;
                int comma = pure.indexOf(',');
                if (pure.startsWith("data:") && comma > 0) {
                    pure = pure.substring(comma + 1);
                }
                byte[] bytes = Base64.getDecoder().decode(pure);
                String newFilename = java.util.UUID.randomUUID().toString().replace("-", "") + ".jpg";
                java.io.File dest = new java.io.File(uploadDir, newFilename);
                java.nio.file.Files.write(dest.toPath(), bytes);
                log.info("Base64 抓拍已落盘: {}", dest.getAbsolutePath());
                return "/uploads/" + newFilename;
            } catch (Exception e) {
                log.error("snapshot_base64 解码/保存失败", e);
            }
        }

        log.warn("未接收到有效抓拍图片");
        return null;
    }

    @Override
    public List<AlertLogVO> listAllForExport() {
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<AlertLog> wrapper =
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
        wrapper.eq(AlertLog::getDeleted, 0);
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
        java.time.LocalDateTime limitTime = java.time.LocalDateTime.now().minusDays(15);
        wrapper.eq(AlertLog::getDeleted, 1)
                .and(w -> w.ge(AlertLog::getDeleteTime, limitTime).or().isNull(AlertLog::getDeleteTime))
                .orderByDesc(AlertLog::getDeleteTime);
        return this.list(wrapper).stream().map(this::toVO).collect(Collectors.toList());
    }

    @Override
    public boolean restoreAlert(Long id) {
        AlertLog entity = this.getById(id);
        if (entity == null || !Integer.valueOf(1).equals(entity.getDeleted())) {
            return false;
        }
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
        this.remove(wrapper);
        return true;
    }
}
