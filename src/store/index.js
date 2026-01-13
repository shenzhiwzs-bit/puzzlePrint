/**
 * Redux Store 配置
 * 集中管理应用状态
 */
import { configureStore } from '@reduxjs/toolkit';
import puzzleReducer from './slices/puzzleSlice';

// 创建store
const store = configureStore({
  reducer: {
    puzzle: puzzleReducer
  },
  // 中间件配置 - 允许存储非序列化数据（如图片URL对象）
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // 忽略图片相关action的序列化检查
        ignoredActions: ['puzzle/addImages'],
        ignoredPaths: ['puzzle.images']
      }
    }),
  // 开发工具配置
  devTools: process.env.NODE_ENV !== 'production'
});

export default store;
