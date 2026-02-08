/**
 * 拼图几何体生成工具
 * 根据拼图参数为每块拼图生成独立的 Shape → ExtrudeGeometry，
 * 并为顶面设置正确的 UV 映射，使每块拼图只显示贴图的对应部分。
 *
 * 坐标约定（与 ThreeViewer 保持一致）：
 *   X = 宽度方向 (width)
 *   Y = 高度方向 (height)
 *   Z = 拉伸/厚度方向 (depth), 向上
 *   拼图整体中心在原点, 底面在 Z=0, 顶面在 Z=depth
 */
import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/*  辅助：沿分割边界生成偏移量                                          */
/* ------------------------------------------------------------------ */

/**
 * 计算分割线在参数 t∈[0,1] 处的横向偏移量
 * @param {number} t       - 归一化参数 0→1
 * @param {string} mode    - 'straight' | 'wave' | 'zigzag'
 * @param {number} amplitude - 偏移幅度（默认按拼图块尺寸自适应）
 * @returns {number} 偏移量
 */
const splitOffset = (t, mode, amplitude = 3) => {
  switch (mode) {
    case 'wave':
      return Math.sin(t * Math.PI * 4) * amplitude;
    case 'zigzag': {
      const zt = (t * 8) % 1;
      return (zt < 0.5 ? zt * 2 : (1 - zt) * 2) * amplitude - amplitude * 0.5;
    }
    default: // straight
      return 0;
  }
};

/* ------------------------------------------------------------------ */
/*  为单块拼图生成 2D 轮廓 Shape                                       */
/* ------------------------------------------------------------------ */

/**
 * 生成水平边界线上的点序列
 * 从 (xStart, Y) 到 (xEnd, Y)，splitMode 的偏移施加在 Y 方向
 * @returns {THREE.Vector2[]}
 */
const generateHorizontalEdge = (xStart, xEnd, Y, splitMode, amplitude, segments = 30) => {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = xStart + (xEnd - xStart) * t;
    const y = Y + splitOffset(t, splitMode, amplitude);
    pts.push(new THREE.Vector2(x, y));
  }
  return pts;
};

/**
 * 生成垂直边界线上的点序列
 * 从 (X, yStart) 到 (X, yEnd)，splitMode 的偏移施加在 X 方向
 * @returns {THREE.Vector2[]}
 */
const generateVerticalEdge = (X, yStart, yEnd, splitMode, amplitude, segments = 30) => {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const y = yStart + (yEnd - yStart) * t;
    const x = X + splitOffset(t, splitMode, amplitude);
    pts.push(new THREE.Vector2(x, y));
  }
  return pts;
};

/**
 * 为 (col, row) 处的拼图块生成 2D 轮廓形状
 * 返回 { shape, centerX, centerY } —— shape 的坐标已减去 center，
 * 使几何体中心位于 (0,0)，方便后续旋转操作。
 */
export const createPieceShape = (col, row, params) => {
  const { width, height, gridX, gridY, splitMode } = params;
  const halfW = width / 2;
  const halfH = height / 2;
  const pieceW = width / gridX;
  const pieceH = height / gridY;

  // 偏移幅度自适应拼图块大小，取短边的 8%
  const amplitude = Math.min(pieceW, pieceH) * 0.08;

  // 拼图块在全局坐标中的四个角
  const xLeft = -halfW + col * pieceW;
  const xRight = xLeft + pieceW;
  const yBottom = -halfH + row * pieceH;
  const yTop = yBottom + pieceH;

  // 拼图块中心（全局坐标）
  const centerX = (xLeft + xRight) / 2;
  const centerY = (yBottom + yTop) / 2;

  // ---- 收集轮廓点（顺时针方向，从左下角开始） ----
  const outline = [];

  // 底边：从左到右（如果 row===0 则为外边界→直线）
  if (row === 0) {
    outline.push(new THREE.Vector2(xLeft, yBottom));
    outline.push(new THREE.Vector2(xRight, yBottom));
  } else {
    const pts = generateHorizontalEdge(xLeft, xRight, yBottom, splitMode, amplitude);
    outline.push(...pts);
  }

  // 右边：从下到上
  if (col === gridX - 1) {
    // 外边界→直线（第一个点与前面最后一个重复，跳过）
    outline.push(new THREE.Vector2(xRight, yTop));
  } else {
    const pts = generateVerticalEdge(xRight, yBottom, yTop, splitMode, amplitude);
    // 跳过第一个点（与底边最后一个重复）
    outline.push(...pts.slice(1));
  }

  // 顶边：从右到左（反向）
  if (row === gridY - 1) {
    outline.push(new THREE.Vector2(xLeft, yTop));
  } else {
    const pts = generateHorizontalEdge(xRight, xLeft, yTop, splitMode, amplitude);
    outline.push(...pts.slice(1));
  }

  // 左边：从上到下（反向）
  if (col === 0) {
    // 最后闭合回起点，Shape 会自动闭合，不需要加
  } else {
    const pts = generateVerticalEdge(xLeft, yTop, yBottom, splitMode, amplitude);
    // 跳过第一个和最后一个（与顶边尾/底边头重复）
    outline.push(...pts.slice(1, -1));
  }

  // ---- 将全局坐标平移到以 piece 中心为原点 ----
  const localPts = outline.map(p => new THREE.Vector2(p.x - centerX, p.y - centerY));

  const shape = new THREE.Shape();
  shape.moveTo(localPts[0].x, localPts[0].y);
  for (let i = 1; i < localPts.length; i++) {
    shape.lineTo(localPts[i].x, localPts[i].y);
  }
  shape.closePath();

  return { shape, centerX, centerY };
};

/* ------------------------------------------------------------------ */
/*  为单块拼图创建 ExtrudeGeometry 并修正顶面 UV                        */
/* ------------------------------------------------------------------ */

/**
 * 创建单块拼图的 3D 几何体
 * @returns {THREE.ExtrudeGeometry} 已修正顶面 UV 的几何体
 */
export const createPieceGeometry = (col, row, params) => {
  const { shape, centerX, centerY } = createPieceShape(col, row, params);
  const { width, height, depth } = params;

  const extrudeSettings = {
    depth: depth,
    bevelEnabled: false,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

  // ---- 修正 UV：让顶面 & 底面映射到整张贴图的对应区域 ----
  const posAttr = geometry.getAttribute('position');
  const uvAttr = geometry.getAttribute('uv');
  const normalAttr = geometry.getAttribute('normal');

  for (let i = 0; i < posAttr.count; i++) {
    const nz = normalAttr.getZ(i);

    // 只处理朝 +Z 或 -Z 的面（顶面 / 底面）
    if (Math.abs(nz) > 0.9) {
      // 局部坐标 → 全局坐标
      const gx = posAttr.getX(i) + centerX;
      const gy = posAttr.getY(i) + centerY;

      // 映射到 [0,1]
      const u = (gx + width / 2) / width;
      const v = (gy + height / 2) / height;
      uvAttr.setXY(i, u, v);
    }
  }

  uvAttr.needsUpdate = true;
  geometry.computeVertexNormals();

  return { geometry, centerX, centerY };
};

/* ------------------------------------------------------------------ */
/*  批量生成所有拼图块                                                  */
/* ------------------------------------------------------------------ */

/**
 * 为整个拼图生成所有块的几何体、初始位置等信息
 * @param {Object} params - puzzleParams
 * @returns {Array<{geometry, centerX, centerY, col, row, index, neighbors}>}
 */
export const generateAllPieces = (params) => {
  const { gridX, gridY } = params;
  const pieces = [];
  let index = 0;

  for (let row = 0; row < gridY; row++) {
    for (let col = 0; col < gridX; col++) {
      const { geometry, centerX, centerY } = createPieceGeometry(col, row, params);

      // 计算邻接关系
      const neighbors = {
        left: col > 0 ? row * gridX + (col - 1) : -1,
        right: col < gridX - 1 ? row * gridX + (col + 1) : -1,
        bottom: row > 0 ? (row - 1) * gridX + col : -1,
        top: row < gridY - 1 ? (row + 1) * gridX + col : -1
      };

      pieces.push({ geometry, centerX, centerY, col, row, index, neighbors });
      index++;
    }
  }

  return pieces;
};

/* ------------------------------------------------------------------ */
/*  吸附检测工具函数                                                    */
/* ------------------------------------------------------------------ */

/**
 * 检测两个拼图块是否可以吸附
 * @param {Object} piece1 - 拼图块1的变换信息 {x, y, rotation, index}
 * @param {Object} piece2 - 拼图块2的变换信息 {x, y, rotation, index}
 * @param {Array} piecesInfo - 所有拼图块的基础信息
 * @param {number} threshold - 吸附距离阈值
 * @returns {Object|null} - 返回吸附信息 {canSnap, targetX, targetY, edge} 或 null
 */
export const checkSnapPossibility = (piece1, piece2, piecesInfo, threshold) => {
  const info1 = piecesInfo[piece1.index];
  const info2 = piecesInfo[piece2.index];

  if (!info1 || !info2) return null;

  // 检查是否是邻接块
  const neighbors = info1.neighbors;
  let edge = null;

  if (neighbors.left === piece2.index) edge = 'left';
  else if (neighbors.right === piece2.index) edge = 'right';
  else if (neighbors.bottom === piece2.index) edge = 'bottom';
  else if (neighbors.top === piece2.index) edge = 'top';

  if (!edge) return null;

  // 计算两个拼图块之间的原始相对位置
  const originalDx = info1.centerX - info2.centerX;
  const originalDy = info1.centerY - info2.centerY;

  // 检查旋转是否一致（仅当旋转角度相同或接近时才能吸附）
  const rotationDiff = Math.abs(piece1.rotation - piece2.rotation) % (2 * Math.PI);
  const rotationMatch = rotationDiff < 0.1 || Math.abs(rotationDiff - 2 * Math.PI) < 0.1;

  if (!rotationMatch) {
    return { canSnap: false, distance: Infinity, edge };
  }

  // 计算当前实际相对位置
  const currentDx = piece1.x - piece2.x;
  const currentDy = piece1.y - piece2.y;

  // 如果有旋转，需要旋转原始相对位置
  const angle = piece2.rotation || 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rotatedDx = originalDx * cos - originalDy * sin;
  const rotatedDy = originalDx * sin + originalDy * cos;

  // 计算差距
  const diffX = currentDx - rotatedDx;
  const diffY = currentDy - rotatedDy;
  const distance = Math.sqrt(diffX * diffX + diffY * diffY);

  if (distance <= threshold) {
    return {
      canSnap: true,
      distance,
      edge,
      // 吸附后piece1应该移动到的位置
      targetX: piece2.x + rotatedDx,
      targetY: piece2.y + rotatedDy,
      targetRotation: piece2.rotation
    };
  }

  return { canSnap: false, distance, edge };
};

/**
 * 为指定拼图块找到所有可能的吸附目标
 * @param {number} pieceIndex - 当前拖动的拼图块索引
 * @param {Array} transforms - 所有拼图块的当前变换状态
 * @param {Array} piecesInfo - 所有拼图块的基础信息
 * @param {number} threshold - 吸附距离阈值
 * @returns {Array} - 返回可吸附的邻接块列表，按距离排序
 */
export const findSnapTargets = (pieceIndex, transforms, piecesInfo, threshold) => {
  const piece = transforms[pieceIndex];
  const pieceInfo = piecesInfo[pieceIndex];

  if (!piece || !pieceInfo) return [];

  const snapTargets = [];
  const neighbors = pieceInfo.neighbors;

  // 检查所有邻接块
  Object.entries(neighbors).forEach(([edge, neighborIndex]) => {
    if (neighborIndex === -1) return;

    const neighborTransform = transforms[neighborIndex];
    if (!neighborTransform) return;

    const result = checkSnapPossibility(piece, neighborTransform, piecesInfo, threshold);
    if (result && result.distance < Infinity) {
      snapTargets.push({
        neighborIndex,
        edge,
        ...result
      });
    }
  });

  // 按距离排序
  snapTargets.sort((a, b) => a.distance - b.distance);

  return snapTargets;
};

/**
 * 计算拼图块边缘的高亮强度（用于显示吸附提示）
 * @param {number} distance - 当前距离
 * @param {number} threshold - 吸附阈值
 * @returns {number} - 0-1 之间的强度值，越近越亮
 */
export const calculateEdgeHighlightIntensity = (distance, threshold) => {
  if (distance >= threshold) return 0;
  // 使用二次函数使高亮更平滑
  const ratio = 1 - (distance / threshold);
  return ratio * ratio;
};

/**
 * 获取两个邻接拼图块之间边缘的世界坐标
 * @param {Object} piece1Info - 拼图块1的基础信息
 * @param {Object} piece2Info - 拼图块2的基础信息
 * @param {Object} transform1 - 拼图块1的变换
 * @param {Object} params - 拼图参数
 * @returns {Array} - 边缘线的顶点坐标数组
 */
export const getEdgeWorldCoordinates = (piece1Info, piece2Info, transform1, params) => {
  const { width, height, gridX, gridY, depth } = params;
  const pieceW = width / gridX;
  const pieceH = height / gridY;

  const dx = piece1Info.col - piece2Info.col;
  const dy = piece1Info.row - piece2Info.row;

  let edgePoints = [];

  if (dx === 1) {
    // piece2 在 piece1 的左边，共享左边缘
    edgePoints = [
      { x: -pieceW / 2, y: -pieceH / 2 },
      { x: -pieceW / 2, y: pieceH / 2 }
    ];
  } else if (dx === -1) {
    // piece2 在 piece1 的右边，共享右边缘
    edgePoints = [
      { x: pieceW / 2, y: -pieceH / 2 },
      { x: pieceW / 2, y: pieceH / 2 }
    ];
  } else if (dy === 1) {
    // piece2 在 piece1 的下边，共享底边缘
    edgePoints = [
      { x: -pieceW / 2, y: -pieceH / 2 },
      { x: pieceW / 2, y: -pieceH / 2 }
    ];
  } else if (dy === -1) {
    // piece2 在 piece1 的上边，共享顶边缘
    edgePoints = [
      { x: -pieceW / 2, y: pieceH / 2 },
      { x: pieceW / 2, y: pieceH / 2 }
    ];
  }

  // 应用变换
  const angle = transform1.rotation || 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return edgePoints.map(p => ({
    x: transform1.x + p.x * cos - p.y * sin,
    y: transform1.y + p.x * sin + p.y * cos,
    z: depth + 0.5 // 略高于顶面
  }));
};
