/**
 * Three.js 立方体视图组件
 * 展示带顶面贴图的3D立方体模型，支持分割线显示
 */
import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { selectSelectedImage, selectPuzzleParams, setModelSelected } from '../../store/slices/puzzleSlice';
import './ThreeViewer.css';

const ThreeViewer = forwardRef((props, ref) => {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const cubeRef = useRef(null);
  const splitLinesRef = useRef(null);
  const animationIdRef = useRef(null);

  const dispatch = useDispatch();
  const selectedImage = useSelector(selectSelectedImage);
  const params = useSelector(selectPuzzleParams);
  const modelSelected = useSelector(state => state.puzzle.modelSelected);

  // 暴露场景和立方体给父组件（用于导出）
  useImperativeHandle(ref, () => ({
    getScene: () => sceneRef.current,
    getCube: () => cubeRef.current,
    getParams: () => params,
    getTexture: () => {
      if (cubeRef.current) {
        const materials = cubeRef.current.material;
        // 顶面材质是第三个（索引2）: [right, left, top, bottom, front, back]
        const topMaterial = materials[2];
        return topMaterial.map;
      }
      return null;
    }
  }));

  // 初始化Three.js场景
  const initScene = useCallback(() => {
    if (!containerRef.current) return;

    // 创建场景
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f5);
    sceneRef.current = scene;

    // 获取容器尺寸
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // 创建相机
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000);
    camera.position.set(150, 150, 150);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // 创建渲染器
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 创建轨道控制器
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 50;
    controls.maxDistance = 1000;
    controlsRef.current = controls;

    // 添加坐标轴辅助线 (红绿蓝分别表示X、Y、Z轴)
    const axesHelper = new THREE.AxesHelper(500);
    scene.add(axesHelper);

    // 添加XOY平面网格 (1000x1000)
    const gridHelper = new THREE.GridHelper(1000, 100, 0xcccccc, 0xe0e0e0);
    gridHelper.rotation.x = Math.PI / 2; // 旋转到XOY平面
    gridHelper.position.z = 0;
    scene.add(gridHelper);

    // 添加环境光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // 添加方向光
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 100, 100);
    scene.add(directionalLight);

    // 添加点选支持
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleClick = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      // 检查是否点击了立方体
      const cubeIntersect = intersects.find(intersect =>
        intersect.object === cubeRef.current
      );

      dispatch(setModelSelected(!!cubeIntersect));
    };

    renderer.domElement.addEventListener('click', handleClick);

    // 动画循环
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // 窗口大小调整
    const handleResize = () => {
      if (!containerRef.current) return;
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize);

    // 返回清理函数
    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('click', handleClick);
      cancelAnimationFrame(animationIdRef.current);
      renderer.dispose();
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [dispatch]);

  // 创建或更新立方体
  const updateCube = useCallback(() => {
    if (!sceneRef.current) return;

    // 移除旧的立方体
    if (cubeRef.current) {
      sceneRef.current.remove(cubeRef.current);
      cubeRef.current.geometry.dispose();
      cubeRef.current.material.forEach(m => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    }

    // 移除旧的分割线
    if (splitLinesRef.current) {
      sceneRef.current.remove(splitLinesRef.current);
      splitLinesRef.current.geometry.dispose();
      splitLinesRef.current.material.dispose();
    }

    // 创建立方体几何体 (width, height, depth 对应 X, Y, Z)
    const geometry = new THREE.BoxGeometry(params.width, params.height, params.depth);

    // 创建材质数组
    // BoxGeometry的面顺序: +X(右), -X(左), +Y(上), -Y(下), +Z(前), -Z(后)
    // 但我们的立方体是平放的，所以需要调整
    // 这里我们让Z轴向上，所以顶面是+Z面

    const sideMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(params.sideColor),
      roughness: 0.5,
      metalness: 0.1
    });

    const bottomMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(params.bottomColor),
      roughness: 0.7,
      metalness: 0.0
    });

    // 顶面材质（带贴图）
    let topMaterial;
    if (selectedImage) {
      const textureLoader = new THREE.TextureLoader();
      const texture = textureLoader.load(selectedImage.url);
      texture.colorSpace = THREE.SRGBColorSpace;
      topMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.5,
        metalness: 0.0
      });
    } else {
      topMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.5,
        metalness: 0.0
      });
    }

    // BoxGeometry面顺序: [+X, -X, +Y, -Y, +Z, -Z]
    // 立方体放置方式: X=宽度, Y=高度, Z=厚度（向上）
    // 顶面是+Z（索引4），底面是-Z（索引5）
    const materials = [
      sideMaterial.clone(), // +X 右侧面
      sideMaterial.clone(), // -X 左侧面
      sideMaterial.clone(), // +Y 前侧面
      sideMaterial.clone(), // -Y 后侧面
      topMaterial,          // +Z 顶面（贴图）
      bottomMaterial        // -Z 底面
    ];

    const cube = new THREE.Mesh(geometry, materials);
    // 将立方体移动到网格上方（Z轴正半轴）
    cube.position.set(0, 0, params.depth / 2);
    sceneRef.current.add(cube);
    cubeRef.current = cube;

    // 添加选中效果
    if (modelSelected) {
      const edges = new THREE.EdgesGeometry(geometry);
      const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: 0x4a90d9, linewidth: 2 })
      );
      line.position.copy(cube.position);
      line.name = 'selectionOutline';
      sceneRef.current.add(line);
    }

    // 创建分割线
    createSplitLines();
  }, [params, selectedImage, modelSelected]);

  // 创建分割线
  const createSplitLines = useCallback(() => {
    if (!sceneRef.current || !cubeRef.current) return;

    // 移除旧的分割线
    const oldLines = sceneRef.current.getObjectByName('splitLines');
    if (oldLines) {
      sceneRef.current.remove(oldLines);
      oldLines.geometry.dispose();
      oldLines.material.dispose();
    }

    const { width, height, depth, gridX, gridY, splitMode } = params;
    const points = [];

    // 计算分割线位置
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const topZ = depth + 0.1; // 略高于顶面，避免Z-fighting

    // 生成分割线路径
    const generateLinePath = (start, end, segments = 20) => {
      const path = [];
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const x = start.x + (end.x - start.x) * t;
        const y = start.y + (end.y - start.y) * t;

        let offset = 0;
        if (splitMode === 'wave') {
          // 波浪形切割
          offset = Math.sin(t * Math.PI * 4) * 3;
        } else if (splitMode === 'zigzag') {
          // 锯齿形切割
          const zigzagT = (t * 8) % 1;
          offset = zigzagT < 0.5 ? zigzagT * 6 : (1 - zigzagT) * 6;
          offset -= 1.5;
        }

        if (start.x === end.x) {
          // 垂直线，offset应用到X方向
          path.push(new THREE.Vector3(x + offset, y, topZ));
        } else {
          // 水平线，offset应用到Y方向
          path.push(new THREE.Vector3(x, y + offset, topZ));
        }
      }
      return path;
    };

    // 垂直分割线 (X方向)
    for (let i = 1; i < gridX; i++) {
      const x = -halfWidth + (width / gridX) * i;
      const linePath = generateLinePath(
        { x, y: -halfHeight },
        { x, y: halfHeight }
      );
      for (let j = 0; j < linePath.length - 1; j++) {
        points.push(linePath[j], linePath[j + 1]);
      }
    }

    // 水平分割线 (Y方向)
    for (let i = 1; i < gridY; i++) {
      const y = -halfHeight + (height / gridY) * i;
      const linePath = generateLinePath(
        { x: -halfWidth, y },
        { x: halfWidth, y }
      );
      for (let j = 0; j < linePath.length - 1; j++) {
        points.push(linePath[j], linePath[j + 1]);
      }
    }

    if (points.length > 0) {
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: 0x333333,
        linewidth: 2
      });
      const lines = new THREE.LineSegments(geometry, material);
      lines.name = 'splitLines';
      sceneRef.current.add(lines);
      splitLinesRef.current = lines;
    }
  }, [params]);

  // 初始化场景
  useEffect(() => {
    const cleanup = initScene();
    return cleanup;
  }, [initScene]);

  // 参数变化时更新立方体
  useEffect(() => {
    updateCube();
  }, [updateCube]);

  // 清理选中效果
  useEffect(() => {
    if (!sceneRef.current) return;

    const outline = sceneRef.current.getObjectByName('selectionOutline');
    if (outline && !modelSelected) {
      sceneRef.current.remove(outline);
      outline.geometry.dispose();
      outline.material.dispose();
    } else if (!outline && modelSelected && cubeRef.current) {
      // 添加选中效果
      const edges = new THREE.EdgesGeometry(cubeRef.current.geometry);
      const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: 0x4a90d9, linewidth: 2 })
      );
      line.position.copy(cubeRef.current.position);
      line.name = 'selectionOutline';
      sceneRef.current.add(line);
    }
  }, [modelSelected]);

  return (
    <div className="three-viewer" ref={containerRef}>
      <div className="viewer-info">
        <span className="info-item">
          尺寸: {params.width} × {params.height} × {params.depth} mm
        </span>
        <span className="info-item">
          分割: {params.gridX} × {params.gridY}
        </span>
        {modelSelected && (
          <span className="info-item selected">已选中模型</span>
        )}
      </div>
      <div className="viewer-controls-hint">
        鼠标左键拖动旋转 | 滚轮缩放 | 右键拖动平移 | 点击选中模型
      </div>
    </div>
  );
});

ThreeViewer.displayName = 'ThreeViewer';

export default ThreeViewer;
