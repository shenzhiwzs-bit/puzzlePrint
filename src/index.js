/**
 * 应用入口文件
 * 初始化React应用和Redux Store
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import store from './store';
import App from './App';

// 获取根DOM节点
const container = document.getElementById('root');

// 创建React根节点
const root = ReactDOM.createRoot(container);

// 渲染应用
root.render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
);
