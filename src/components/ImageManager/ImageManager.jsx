/**
 * 图片管理组件
 * 支持图片导入、缩略图展示、选择和删除
 */
import React, { useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  addImages,
  removeImage,
  selectImage,
  setPreviewImage,
  selectAllImages
} from '../../store/slices/puzzleSlice';
import './ImageManager.css';

// 生成唯一ID
const generateId = () => `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// 创建缩略图（限制尺寸以优化性能）
const createThumbnail = (file, maxSize = 200) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // 计算缩略图尺寸
        let width = img.width;
        let height = img.height;
        if (width > height && width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        } else if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }

        // 创建canvas绘制缩略图
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        resolve({
          thumbnail: canvas.toDataURL('image/jpeg', 0.7),
          fullUrl: e.target.result
        });
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
};

const ImageManager = () => {
  const dispatch = useDispatch();
  const images = useSelector(selectAllImages);
  const selectedImageId = useSelector(state => state.puzzle.selectedImageId);
  const fileInputRef = useRef(null);

  // 处理文件选择
  const handleFileSelect = useCallback(async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    try {
      // 并行处理所有图片
      const imagePromises = files
        .filter(file => file.type.startsWith('image/'))
        .map(async (file) => {
          const { thumbnail, fullUrl } = await createThumbnail(file);
          return {
            id: generateId(),
            name: file.name,
            url: fullUrl,
            thumbnail: thumbnail
          };
        });

      const newImages = await Promise.all(imagePromises);

      if (newImages.length > 0) {
        dispatch(addImages(newImages));
      } else {
        alert('请选择有效的图片文件');
      }
    } catch (error) {
      console.error('图片处理错误:', error);
      alert('图片处理失败: ' + error.message);
    }

    // 重置input以允许重复选择相同文件
    event.target.value = '';
  }, [dispatch]);

  // 触发文件选择对话框
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // 选择图片用于3D模型
  const handleSelectImage = useCallback((imageId) => {
    dispatch(selectImage(imageId));
  }, [dispatch]);

  // 预览大图
  const handlePreviewImage = useCallback((imageId, event) => {
    event.stopPropagation();
    dispatch(setPreviewImage(imageId));
  }, [dispatch]);

  // 删除图片
  const handleDeleteImage = useCallback((imageId, event) => {
    event.stopPropagation();
    if (window.confirm('确定要删除这张图片吗？')) {
      dispatch(removeImage(imageId));
    }
  }, [dispatch]);

  // 拖放支持
  const handleDragOver = (event) => {
    event.preventDefault();
    event.currentTarget.classList.add('drag-over');
  };

  const handleDragLeave = (event) => {
    event.currentTarget.classList.remove('drag-over');
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');

    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      // 模拟文件input事件
      const mockEvent = { target: { files, value: '' } };
      await handleFileSelect(mockEvent);
    }
  };

  return (
    <div className="image-manager">
      <div className="image-manager-header">
        <h3>图片管理</h3>
        <span className="image-count">{images.length} 张</span>
      </div>

      {/* 上传区域 */}
      <div
        className="upload-area"
        onClick={handleUploadClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <div className="upload-icon">+</div>
        <div className="upload-text">点击或拖放图片到此处</div>
        <div className="upload-hint">支持 JPG、PNG、GIF 等格式</div>
      </div>

      {/* 图片列表 */}
      <div className="image-list">
        {images.length === 0 ? (
          <div className="empty-state">暂无图片，请上传</div>
        ) : (
          images.map((image) => (
            <div
              key={image.id}
              className={`image-item ${selectedImageId === image.id ? 'selected' : ''}`}
              onClick={() => handleSelectImage(image.id)}
              title={image.name}
            >
              <img
                src={image.url}
                alt={image.name}
                className="image-thumbnail"
              />
              <div className="image-overlay">
                <button
                  className="btn-preview"
                  onClick={(e) => handlePreviewImage(image.id, e)}
                  title="预览大图"
                >
                  🔍
                </button>
                <button
                  className="btn-delete"
                  onClick={(e) => handleDeleteImage(image.id, e)}
                  title="删除图片"
                >
                  ×
                </button>
              </div>
              {selectedImageId === image.id && (
                <div className="selected-badge">✓</div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ImageManager;
