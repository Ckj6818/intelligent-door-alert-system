package com.dooralert.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.dooralert.dto.SysAuthorizedUserDTO;
import com.dooralert.entity.SysAuthorizedUser;
import com.dooralert.vo.SysAuthorizedUserVO;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

public interface SysAuthorizedUserService extends IService<SysAuthorizedUser> {

    /** 获取白名单列表（默认仅启用；includeDisabled=true 时返回全部） */
    List<SysAuthorizedUserVO> listAuthorizedUsers(boolean includeDisabled);

    /** 新增授权员工（JSON） */
    SysAuthorizedUserVO addAuthorizedUser(SysAuthorizedUserDTO dto);

    /**
     * 新增授权员工并上传正脸照片：
     * 1) 保存到 uploads
     * 2) 同步到 door-alert-ai/authorized_faces/{姓名}.jpg 供边缘识别
     */
    SysAuthorizedUserVO addAuthorizedUserWithAvatar(SysAuthorizedUserDTO dto, MultipartFile avatar);

    /**
     * 启用/禁用：禁用时移除边缘人脸文件，启用时从 uploads 恢复，并触发 AI 热加载。
     */
    SysAuthorizedUserVO updateStatus(Long id, Integer status);

    /**
     * 删除授权人员，同时移除边缘人脸文件并触发 AI 热加载。
     */
    void deleteAuthorizedUser(Long id);
}
