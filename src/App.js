/**
 * 主应用组件
 * 拼图打印应用 - 整合所有子组件
 */
import React, { useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import ImageManager from './components/ImageManager/ImageManager';
import ImagePreview from './components/ImagePreview/ImagePreview';
import ParameterPanel from './components/ParameterPanel/ParameterPanel';
import ThreeViewer from './components/ThreeViewer/ThreeViewer';
import { setExportStatus, setExportError, selectPuzzleParams } from './store/slices/puzzleSlice';
import { exportAndDownload3MF } from './utils/export3mf';
import './App.css';

const App = () => {
  const dispatch = useDispatch();
  const threeViewerRef = useRef(null);
  const params = useSelector(selectPuzzleParams);

  // 处理导出3MF
  const handleExport = useCallback(async () => {
    try {
      dispatch(setExportStatus('exporting'));

      // 获取Three.js场景中的立方体和纹理
      const cube = threeViewerRef.current?.getCube();
      const texture = threeViewerRef.current?.getTexture();

      if (!cube) {
        throw new Error('没有可导出的模型，请先创建模型');
      }

      // 生成文件名
      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `puzzle_${params.width}x${params.height}_${timestamp}.3mf`;

      // 导出并下载
      await exportAndDownload3MF(cube, params, texture, filename);

      dispatch(setExportStatus('success'));

      // 3秒后重置状态
      setTimeout(() => {
        dispatch(setExportStatus('idle'));
      }, 3000);
    } catch (error) {
      console.error('导出失败:', error);
      dispatch(setExportError(error.message));

      // 显示错误提示
      alert('导出失败: ' + error.message);

      // 3秒后重置状态
      setTimeout(() => {
        dispatch(setExportStatus('idle'));
      }, 3000);
    }
  }, [dispatch, params]);

  return (
    <div className="app">
      {/* 左侧面板 */}
      <aside className="sidebar">
        {/* 图片管理区域 */}
        <section className="sidebar-section image-section">
          <ImageManager />
        </section>

        {/* 参数设置区域 */}
        <section className="sidebar-section param-section">
          <ParameterPanel onExport={handleExport} />
        </section>
      </aside>

      {/* 右侧3D视图区域 */}
      <main className="main-content">
        <ThreeViewer ref={threeViewerRef} />
      </main>

      {/* 图片预览模态框 */}
      <ImagePreview />
    </div>
  );
};

export default App;
