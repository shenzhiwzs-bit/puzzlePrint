/**
 * 图片预览组件
 * 大图预览模态框
 */
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { closePreview, selectPreviewImage } from '../../store/slices/puzzleSlice';
import './ImagePreview.css';

const ImagePreview = () => {
  const dispatch = useDispatch();
  const previewImage = useSelector(selectPreviewImage);

  // 如果没有预览图片，不渲染
  if (!previewImage) return null;

  // 关闭预览
  const handleClose = () => {
    dispatch(closePreview());
  };

  // 点击背景关闭
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  // 键盘ESC关闭
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="image-preview-modal" onClick={handleBackdropClick}>
      <div className="preview-container">
        <button className="close-button" onClick={handleClose}>
          ×
        </button>
        <img
          src={previewImage.url}
          alt={previewImage.name}
          className="preview-image"
        />
        <div className="preview-info">
          <span className="preview-name">{previewImage.name}</span>
        </div>
      </div>
    </div>
  );
};

export default ImagePreview;
