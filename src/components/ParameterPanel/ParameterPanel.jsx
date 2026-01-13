/**
 * 拼图参数调整面板组件
 * 包含尺寸、分割、颜色等参数设置
 */
import React, { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setParam, selectPuzzleParams, selectExportStatus } from '../../store/slices/puzzleSlice';
import './ParameterPanel.css';

// 分割块数选项
const GRID_OPTIONS = [
  { value: '2x2', label: '2 × 2', gridX: 2, gridY: 2 },
  { value: '3x3', label: '3 × 3', gridX: 3, gridY: 3 },
  { value: '4x4', label: '4 × 4', gridX: 4, gridY: 4 },
  { value: '5x5', label: '5 × 5', gridX: 5, gridY: 5 },
  { value: '2x3', label: '2 × 3', gridX: 2, gridY: 3 },
  { value: '3x4', label: '3 × 4', gridX: 3, gridY: 4 },
];

// 分割方式选项
const SPLIT_MODE_OPTIONS = [
  { value: 'straight', label: '直线切割' },
  { value: 'wave', label: '波浪切割' },
  { value: 'zigzag', label: '锯齿切割' },
];

const ParameterPanel = ({ onExport }) => {
  const dispatch = useDispatch();
  const params = useSelector(selectPuzzleParams);
  const exportStatus = useSelector(selectExportStatus);

  // 更新数值参数
  const handleNumberChange = useCallback((key, value) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue > 0) {
      dispatch(setParam({ key, value: numValue }));
    }
  }, [dispatch]);

  // 更新网格参数
  const handleGridChange = useCallback((value) => {
    const option = GRID_OPTIONS.find(opt => opt.value === value);
    if (option) {
      dispatch(setParam({ key: 'gridX', value: option.gridX }));
      dispatch(setParam({ key: 'gridY', value: option.gridY }));
    }
  }, [dispatch]);

  // 更新分割方式
  const handleSplitModeChange = useCallback((value) => {
    dispatch(setParam({ key: 'splitMode', value }));
  }, [dispatch]);

  // 更新颜色
  const handleColorChange = useCallback((key, value) => {
    dispatch(setParam({ key, value }));
  }, [dispatch]);

  // 获取当前网格值
  const getCurrentGridValue = () => {
    const option = GRID_OPTIONS.find(
      opt => opt.gridX === params.gridX && opt.gridY === params.gridY
    );
    return option ? option.value : '2x2';
  };

  // 导出按钮状态文本
  const getExportButtonText = () => {
    switch (exportStatus) {
      case 'exporting':
        return '导出中...';
      case 'success':
        return '导出成功！';
      case 'error':
        return '导出失败';
      default:
        return '导出 3MF 文件';
    }
  };

  return (
    <div className="parameter-panel">
      <div className="panel-header">
        <h3>拼图参数</h3>
      </div>

      <div className="panel-content">
        {/* 尺寸设置 */}
        <div className="param-section">
          <h4 className="section-title">尺寸设置 (mm)</h4>

          <div className="param-row">
            <label className="param-label">宽度</label>
            <input
              type="number"
              className="param-input"
              value={params.width}
              onChange={(e) => handleNumberChange('width', e.target.value)}
              min="10"
              max="500"
              step="1"
            />
          </div>

          <div className="param-row">
            <label className="param-label">高度</label>
            <input
              type="number"
              className="param-input"
              value={params.height}
              onChange={(e) => handleNumberChange('height', e.target.value)}
              min="10"
              max="500"
              step="1"
            />
          </div>

          <div className="param-row">
            <label className="param-label">厚度</label>
            <input
              type="number"
              className="param-input"
              value={params.depth}
              onChange={(e) => handleNumberChange('depth', e.target.value)}
              min="1"
              max="100"
              step="0.5"
            />
          </div>
        </div>

        {/* 分割设置 */}
        <div className="param-section">
          <h4 className="section-title">分割设置</h4>

          <div className="param-row">
            <label className="param-label">分割块数</label>
            <select
              className="param-select"
              value={getCurrentGridValue()}
              onChange={(e) => handleGridChange(e.target.value)}
            >
              {GRID_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="param-row">
            <label className="param-label">分割方式</label>
            <select
              className="param-select"
              value={params.splitMode}
              onChange={(e) => handleSplitModeChange(e.target.value)}
            >
              {SPLIT_MODE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 颜色设置 */}
        <div className="param-section">
          <h4 className="section-title">颜色设置</h4>

          <div className="param-row">
            <label className="param-label">侧面颜色</label>
            <div className="color-input-wrapper">
              <input
                type="color"
                className="param-color"
                value={params.sideColor}
                onChange={(e) => handleColorChange('sideColor', e.target.value)}
              />
              <span className="color-value">{params.sideColor}</span>
            </div>
          </div>

          <div className="param-row">
            <label className="param-label">底面颜色</label>
            <div className="color-input-wrapper">
              <input
                type="color"
                className="param-color"
                value={params.bottomColor}
                onChange={(e) => handleColorChange('bottomColor', e.target.value)}
              />
              <span className="color-value">{params.bottomColor}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 导出按钮 */}
      <div className="panel-footer">
        <button
          className={`export-button ${exportStatus}`}
          onClick={onExport}
          disabled={exportStatus === 'exporting'}
        >
          {getExportButtonText()}
        </button>
      </div>
    </div>
  );
};

export default ParameterPanel;
