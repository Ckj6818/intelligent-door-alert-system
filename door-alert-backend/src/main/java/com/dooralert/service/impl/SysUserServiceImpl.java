package com.dooralert.service.impl;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.dooralert.dto.SysUserDTO;
import com.dooralert.entity.SysUser;
import com.dooralert.mapper.SysUserMapper;
import com.dooralert.service.SysUserService;
import com.dooralert.vo.SysUserVO;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;

@Service
public class SysUserServiceImpl extends ServiceImpl<SysUserMapper, SysUser> implements SysUserService {

    @Override
    public IPage<SysUserVO> pageUsers(long current, long size) {
        Page<SysUser> page = this.page(new Page<>(current, size));
        return page.convert(this::toVO);
    }

    @Override
    public SysUserVO getUserById(Long id) {
        SysUser entity = this.getById(id);
        return entity == null ? null : toVO(entity);
    }

    @Override
    public boolean addUser(SysUserDTO dto) {
        SysUser entity = new SysUser();
        BeanUtils.copyProperties(dto, entity);
        return this.save(entity);
    }

    @Override
    public boolean updateUser(Long id, SysUserDTO dto) {
        SysUser entity = this.getById(id);
        if (entity == null) {
            return false;
        }
        BeanUtils.copyProperties(dto, entity);
        entity.setId(id);
        return this.updateById(entity);
    }

    /**
     * Entity -> VO（脱敏，不暴露密码）
     */
    private SysUserVO toVO(SysUser entity) {
        SysUserVO vo = new SysUserVO();
        vo.setId(entity.getId());
        vo.setUsername(entity.getUsername());
        vo.setNickname(entity.getNickname());
        vo.setRole(entity.getRole());
        vo.setCreateTime(entity.getCreateTime());
        return vo;
    }
}
