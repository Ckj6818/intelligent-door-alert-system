package com.dooralert.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.dooralert.dto.SysAuthorizedUserDTO;
import com.dooralert.entity.SysAuthorizedUser;
import com.dooralert.mapper.SysAuthorizedUserMapper;
import com.dooralert.service.SysAuthorizedUserService;
import com.dooralert.vo.SysAuthorizedUserVO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
public class SysAuthorizedUserServiceImpl
        extends ServiceImpl<SysAuthorizedUserMapper, SysAuthorizedUser>
        implements SysAuthorizedUserService {

    @Override
    public List<SysAuthorizedUserVO> listAuthorizedUsers(boolean includeDisabled) {
        LambdaQueryWrapper<SysAuthorizedUser> wrapper = new LambdaQueryWrapper<>();
        if (!includeDisabled) {
            wrapper.eq(SysAuthorizedUser::getStatus, 1);
        }
        wrapper.orderByDesc(SysAuthorizedUser::getCreateTime);
        return this.list(wrapper).stream().map(this::toVO).collect(Collectors.toList());
    }

    @Override
    public SysAuthorizedUserVO addAuthorizedUser(SysAuthorizedUserDTO dto) {
        return persistUser(dto, dto.getAvatarUrl());
    }

    @Override
    public SysAuthorizedUserVO addAuthorizedUserWithAvatar(SysAuthorizedUserDTO dto, MultipartFile avatar) {
        if (avatar == null || avatar.isEmpty()) {
            throw new RuntimeException("请上传清晰正脸照片，用于边缘端人脸比对");
        }

        String name = dto.getName() == null ? "" : dto.getName().trim();
        if (!StringUtils.hasText(name)) {
            throw new RuntimeException("姓名不能为空");
        }

        String avatarUrl = saveAvatarFiles(name, avatar);
        return persistUser(dto, avatarUrl);
    }

    @Override
    public SysAuthorizedUserVO updateStatus(Long id, Integer status) {
        if (id == null) {
            throw new RuntimeException("人员 ID 不能为空");
        }
        if (status == null || (status != 0 && status != 1)) {
            throw new RuntimeException("状态仅支持 0(禁用) 或 1(启用)");
        }

        SysAuthorizedUser entity = this.getById(id);
        if (entity == null) {
            throw new RuntimeException("授权人员不存在: " + id);
        }

        entity.setStatus(status);
        this.updateById(entity);

        if (status == 1) {
            restoreFaceFile(entity);
        } else {
            removeFaceFiles(entity.getName());
            touchReloadFlag();
        }

        log.info("授权人员状态已更新: id={}, name={}, status={}", id, entity.getName(), status);
        return toVO(entity);
    }

    @Override
    public void deleteAuthorizedUser(Long id) {
        if (id == null) {
            throw new RuntimeException("人员 ID 不能为空");
        }
        SysAuthorizedUser entity = this.getById(id);
        if (entity == null) {
            throw new RuntimeException("授权人员不存在: " + id);
        }

        this.removeById(id);
        removeFaceFiles(entity.getName());
        touchReloadFlag();
        log.info("授权人员已删除: id={}, name={}", id, entity.getName());
    }

    private SysAuthorizedUserVO persistUser(SysAuthorizedUserDTO dto, String avatarUrl) {
        if (!StringUtils.hasText(dto.getUserCode()) || !StringUtils.hasText(dto.getName())) {
            throw new RuntimeException("工号与姓名不能为空");
        }

        String userCode = dto.getUserCode().trim();
        String name = dto.getName().trim();

        long exists = this.count(new LambdaQueryWrapper<SysAuthorizedUser>()
                .eq(SysAuthorizedUser::getUserCode, userCode));
        if (exists > 0) {
            throw new RuntimeException("工号已存在: " + userCode);
        }

        SysAuthorizedUser entity = new SysAuthorizedUser();
        entity.setUserCode(userCode);
        entity.setName(name);
        entity.setDepartment(dto.getDepartment());
        entity.setAvatarUrl(avatarUrl);
        entity.setStatus(dto.getStatus() == null ? 1 : dto.getStatus());
        this.save(entity);
        log.info("授权人员已创建: id={}, code={}, name={}, avatar={}",
                entity.getId(), userCode, name, avatarUrl);
        return toVO(entity);
    }

    /**
     * 同时写入：
     * - {user.dir}/uploads/xxx.jpg  → Web 访问 /uploads/xxx.jpg
     * - ../door-alert-ai/authorized_faces/{姓名}.ext → AI 人脸库
     */
    private String saveAvatarFiles(String name, MultipartFile avatar) {
        try {
            String original = avatar.getOriginalFilename();
            String suffix = ".jpg";
            if (original != null && original.contains(".")) {
                suffix = original.substring(original.lastIndexOf('.')).toLowerCase(Locale.ROOT);
            }
            if (!List.of(".jpg", ".jpeg", ".png", ".bmp", ".webp").contains(suffix)) {
                throw new RuntimeException("仅支持 jpg/png/bmp/webp 人脸照片");
            }

            Path uploadDir = Paths.get(System.getProperty("user.dir"), "uploads");
            Files.createDirectories(uploadDir);
            String storedName = UUID.randomUUID().toString().replace("-", "") + suffix;
            Path uploadPath = uploadDir.resolve(storedName);
            avatar.transferTo(uploadPath.toFile());

            // 同步到边缘 AI 人脸目录（文件名=姓名）
            Path facesDir = resolveAuthorizedFacesDir();
            Files.createDirectories(facesDir);
            String safeName = sanitizeName(name);
            Path facePath = facesDir.resolve(safeName + suffix);
            Files.copy(uploadPath, facePath, StandardCopyOption.REPLACE_EXISTING);
            touchReloadFlag();

            log.info("人脸照片已同步: uploads={}, faces={}", uploadPath, facePath);
            return "/uploads/" + storedName;
        } catch (RuntimeException e) {
            throw e;
        } catch (IOException e) {
            log.error("保存人脸照片失败", e);
            throw new RuntimeException("保存人脸照片失败: " + e.getMessage());
        }
    }

    private void restoreFaceFile(SysAuthorizedUser entity) {
        String avatarUrl = entity.getAvatarUrl();
        if (!StringUtils.hasText(avatarUrl) || !avatarUrl.startsWith("/uploads/")) {
            throw new RuntimeException("该人员没有可恢复的人脸照片，请重新上传");
        }

        String storedName = avatarUrl.substring("/uploads/".length());
        Path uploadPath = Paths.get(System.getProperty("user.dir"), "uploads", storedName);
        if (!Files.isRegularFile(uploadPath)) {
            // 兼容从仓库根目录启动时 uploads 在 backend 子目录
            Path alt = Paths.get(System.getProperty("user.dir"), "door-alert-backend", "uploads", storedName);
            if (Files.isRegularFile(alt)) {
                uploadPath = alt;
            } else {
                throw new RuntimeException("人脸原图不存在，无法重新启用: " + avatarUrl);
            }
        }

        try {
            String suffix = ".jpg";
            int dot = storedName.lastIndexOf('.');
            if (dot >= 0) {
                suffix = storedName.substring(dot).toLowerCase(Locale.ROOT);
            }
            Path facesDir = resolveAuthorizedFacesDir();
            Files.createDirectories(facesDir);
            String safeName = sanitizeName(entity.getName());
            Path facePath = facesDir.resolve(safeName + suffix);
            Files.copy(uploadPath, facePath, StandardCopyOption.REPLACE_EXISTING);
            touchReloadFlag();
            log.info("人脸照片已恢复至边缘库: {}", facePath);
        } catch (IOException e) {
            throw new RuntimeException("恢复边缘人脸失败: " + e.getMessage());
        }
    }

    private void removeFaceFiles(String name) {
        Path facesDir = resolveAuthorizedFacesDir();
        if (!Files.isDirectory(facesDir)) {
            return;
        }
        String safeName = sanitizeName(name);
        String[] exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"};
        for (String ext : exts) {
            Path p = facesDir.resolve(safeName + ext);
            try {
                if (Files.deleteIfExists(p)) {
                    log.info("已移除边缘人脸文件: {}", p);
                }
            } catch (IOException e) {
                log.warn("移除边缘人脸失败: {} ({})", p, e.getMessage());
            }
        }
    }

    private void touchReloadFlag() {
        try {
            Path facesDir = resolveAuthorizedFacesDir();
            Files.createDirectories(facesDir);
            Files.writeString(facesDir.resolve(".reload"), String.valueOf(System.currentTimeMillis()));
        } catch (IOException e) {
            log.warn("写入人脸热加载标记失败: {}", e.getMessage());
        }
    }

    private String sanitizeName(String name) {
        String safeName = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        if (!StringUtils.hasText(safeName)) {
            safeName = "user_" + System.currentTimeMillis();
        }
        return safeName;
    }

    private Path resolveAuthorizedFacesDir() {
        Path cwd = Paths.get(System.getProperty("user.dir")).toAbsolutePath().normalize();
        // 常见：从 door-alert-backend 启动
        Path sibling = cwd.resolveSibling("door-alert-ai").resolve("authorized_faces");
        if (Files.isDirectory(sibling.getParent()) || Files.exists(sibling.getParent())) {
            return sibling;
        }
        // 兼容从仓库根目录启动
        Path nested = cwd.resolve("door-alert-ai").resolve("authorized_faces");
        return nested;
    }

    private SysAuthorizedUserVO toVO(SysAuthorizedUser entity) {
        SysAuthorizedUserVO vo = new SysAuthorizedUserVO();
        BeanUtils.copyProperties(entity, vo);
        return vo;
    }
}
