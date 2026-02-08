/**
 * 拼图游戏控制组件
 * 包含难度选择、吸附距离滑块、打散/拼合按钮
 */
import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  selectPuzzleGameMode,
  selectPuzzleScattered,
  selectDifficultyMode,
  selectSnapDistance,
  selectHardSnapDistance,
  setPuzzleGameMode,
  setDifficultyMode,
  setSnapDistance
} from '../../store/slices/puzzleSlice';
import './GameControls.css';

const GameControls = ({ onScatter, onAssemble }) => {
  const dispatch = useDispatch();
  const gameMode = useSelector(selectPuzzleGameMode);
  const scattered = useSelector(selectPuzzleScattered);
  const difficultyMode = useSelector(selectDifficultyMode);
  const snapDistance = useSelector(selectSnapDistance);
  const hardSnapDistance = useSelector(selectHardSnapDistance);

  // 切换游戏模式
  const handleToggleGameMode = () => {
    dispatch(setPuzzleGameMode(!gameMode));
  };

  // 切换难度模式
  const handleDifficultyChange = (mode) => {
    dispatch(setDifficultyMode(mode));
  };

  // 调整吸附距离
  const handleSnapDistanceChange = (e) => {
    dispatch(setSnapDistance(Number(e.target.value)));
  };

  return (
    <div className="game-controls">
      {/* 游戏模式切换按钮 */}
      <div className="game-mode-toggle">
        <button
          className={`mode-button ${gameMode ? 'active' : ''}`}
          onClick={handleToggleGameMode}
        >
          {gameMode ? '退出游戏模式' : '进入游戏模式'}
        </button>
      </div>

      {/* 游戏模式下的控制选项 */}
      {gameMode && (
        <>
          {/* 难度选择 */}
          <div className="difficulty-section">
            <span className="section-label">难度:</span>
            <div className="difficulty-buttons">
              <button
                className={`difficulty-btn ${difficultyMode === 'easy' ? 'active' : ''}`}
                onClick={() => handleDifficultyChange('easy')}
              >
                简单
              </button>
              <button
                className={`difficulty-btn ${difficultyMode === 'hard' ? 'active' : ''}`}
                onClick={() => handleDifficultyChange('hard')}
              >
                困难
              </button>
            </div>

            {/* 困难模式下的吸附距离滑块 */}
            {difficultyMode === 'hard' && (
              <div className="snap-slider">
                <label>
                  吸附距离: {hardSnapDistance}mm
                </label>
                <input
                  type="range"
                  min="1"
                  max="30"
                  value={hardSnapDistance}
                  onChange={handleSnapDistanceChange}
                />
              </div>
            )}

            {/* 简单模式显示固定容差 */}
            {difficultyMode === 'easy' && (
              <div className="snap-info">
                吸附距离: 20mm (固定)
              </div>
            )}
          </div>

          {/* 打散/拼合按钮 */}
          <div className="action-buttons">
            <button
              className="action-btn scatter-btn"
              onClick={onScatter}
              disabled={scattered}
            >
              一键打散
            </button>
            <button
              className="action-btn assemble-btn"
              onClick={onAssemble}
              disabled={!scattered}
            >
              一键拼合
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default GameControls;
