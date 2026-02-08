/**
 * Redux Slice - 拼图状态管理
 * 管理图片列表、选中图片、拼图参数等状态
 */
import { createSlice } from '@reduxjs/toolkit';

// 初始状态
const initialState = {
  // 图片列表 - 存储所有导入的图片 { id, name, url, thumbnail }
  images: [],
  // 当前选中的图片ID
  selectedImageId: null,
  // 预览大图的图片ID
  previewImageId: null,
  // 拼图参数配置
  puzzleParams: {
    width: 100,        // 宽度 (mm)
    height: 100,       // 高度 (mm)
    depth: 10,         // 拉伸高度/厚度 (mm)
    gridX: 2,          // X方向分割块数
    gridY: 2,          // Y方向分割块数
    splitMode: 'straight', // 分割方式: straight(直线), wave(波浪), zigzag(锯齿)
    sideColor: '#808080',  // 侧面颜色
    bottomColor: '#404040' // 底面颜色
  },
  // 模型是否被选中
  modelSelected: false,
  // 导出状态
  exportStatus: 'idle', // idle | exporting | success | error
  exportError: null,

  // === 拼图游戏状态 ===
  // 游戏模式: false=普通立方体展示, true=拼图游戏模式
  puzzleGameMode: false,
  // 拼图是否已打散
  puzzleScattered: false,
  // 难度模式: 'easy' | 'hard'
  difficultyMode: 'easy',
  // 吸附距离容差 (简单模式固定值=20, 困难模式可调)
  snapDistance: 20,
  // 困难模式的自定义吸附距离
  hardSnapDistance: 5,
  // 当前选中的拼图块索引 (-1 表示未选中)
  selectedPieceIndex: -1,
  // 拼图块的位置和旋转状态 [{ x, y, z, rotation }]
  pieceTransforms: []
};

// 创建slice
const puzzleSlice = createSlice({
  name: 'puzzle',
  initialState,
  reducers: {
    // 添加图片到列表
    addImages: (state, action) => {
      const newImages = action.payload;
      state.images = [...state.images, ...newImages];
      // 如果之前没有选中图片，自动选中第一张
      if (!state.selectedImageId && newImages.length > 0) {
        state.selectedImageId = newImages[0].id;
      }
    },

    // 删除图片
    removeImage: (state, action) => {
      const imageId = action.payload;
      state.images = state.images.filter(img => img.id !== imageId);
      // 如果删除的是当前选中的图片，清除选中状态
      if (state.selectedImageId === imageId) {
        state.selectedImageId = state.images.length > 0 ? state.images[0].id : null;
      }
      if (state.previewImageId === imageId) {
        state.previewImageId = null;
      }
    },

    // 选择图片（用于3D模型贴图）
    selectImage: (state, action) => {
      state.selectedImageId = action.payload;
    },

    // 设置预览图片（大图预览）
    setPreviewImage: (state, action) => {
      state.previewImageId = action.payload;
    },

    // 关闭预览
    closePreview: (state) => {
      state.previewImageId = null;
    },

    // 更新拼图参数
    updatePuzzleParams: (state, action) => {
      state.puzzleParams = {
        ...state.puzzleParams,
        ...action.payload
      };
    },

    // 设置单个参数
    setParam: (state, action) => {
      const { key, value } = action.payload;
      state.puzzleParams[key] = value;
    },

    // 设置模型选中状态
    setModelSelected: (state, action) => {
      state.modelSelected = action.payload;
    },

    // 设置导出状态
    setExportStatus: (state, action) => {
      state.exportStatus = action.payload;
      if (action.payload !== 'error') {
        state.exportError = null;
      }
    },

    // 设置导出错误
    setExportError: (state, action) => {
      state.exportStatus = 'error';
      state.exportError = action.payload;
    },

    // === 拼图游戏 actions ===

    // 切换拼图游戏模式
    setPuzzleGameMode: (state, action) => {
      state.puzzleGameMode = action.payload;
      if (!action.payload) {
        // 退出游戏模式时重置
        state.puzzleScattered = false;
        state.selectedPieceIndex = -1;
        state.pieceTransforms = [];
      }
    },

    // 设置拼图打散状态
    setPuzzleScattered: (state, action) => {
      state.puzzleScattered = action.payload;
    },

    // 设置难度模式
    setDifficultyMode: (state, action) => {
      state.difficultyMode = action.payload;
      if (action.payload === 'easy') {
        state.snapDistance = 20;
      } else {
        state.snapDistance = state.hardSnapDistance;
      }
    },

    // 设置吸附距离（困难模式滑块）
    setSnapDistance: (state, action) => {
      state.hardSnapDistance = action.payload;
      if (state.difficultyMode === 'hard') {
        state.snapDistance = action.payload;
      }
    },

    // 设置选中的拼图块
    setSelectedPieceIndex: (state, action) => {
      state.selectedPieceIndex = action.payload;
    },

    // 设置所有拼图块的变换状态
    setPieceTransforms: (state, action) => {
      state.pieceTransforms = action.payload;
    },

    // 更新单个拼图块的变换
    updatePieceTransform: (state, action) => {
      const { index, transform } = action.payload;
      if (state.pieceTransforms[index]) {
        state.pieceTransforms[index] = {
          ...state.pieceTransforms[index],
          ...transform
        };
      }
    },

    // 重置所有状态
    resetState: () => initialState
  }
});

// 导出actions
export const {
  addImages,
  removeImage,
  selectImage,
  setPreviewImage,
  closePreview,
  updatePuzzleParams,
  setParam,
  setModelSelected,
  setExportStatus,
  setExportError,
  setPuzzleGameMode,
  setPuzzleScattered,
  setDifficultyMode,
  setSnapDistance,
  setSelectedPieceIndex,
  setPieceTransforms,
  updatePieceTransform,
  resetState
} = puzzleSlice.actions;

// 选择器 - 获取当前选中的图片对象
export const selectSelectedImage = (state) => {
  const { images, selectedImageId } = state.puzzle;
  return images.find(img => img.id === selectedImageId) || null;
};

// 选择器 - 获取预览图片对象
export const selectPreviewImage = (state) => {
  const { images, previewImageId } = state.puzzle;
  return images.find(img => img.id === previewImageId) || null;
};

// 选择器 - 获取所有图片
export const selectAllImages = (state) => state.puzzle.images;

// 选择器 - 获取拼图参数
export const selectPuzzleParams = (state) => state.puzzle.puzzleParams;

// 选择器 - 获取模型选中状态
export const selectModelSelected = (state) => state.puzzle.modelSelected;

// 选择器 - 获取导出状态
export const selectExportStatus = (state) => state.puzzle.exportStatus;

// 选择器 - 拼图游戏相关
export const selectPuzzleGameMode = (state) => state.puzzle.puzzleGameMode;
export const selectPuzzleScattered = (state) => state.puzzle.puzzleScattered;
export const selectDifficultyMode = (state) => state.puzzle.difficultyMode;
export const selectSnapDistance = (state) => state.puzzle.snapDistance;
export const selectHardSnapDistance = (state) => state.puzzle.hardSnapDistance;
export const selectSelectedPieceIndex = (state) => state.puzzle.selectedPieceIndex;
export const selectPieceTransforms = (state) => state.puzzle.pieceTransforms;

export default puzzleSlice.reducer;
