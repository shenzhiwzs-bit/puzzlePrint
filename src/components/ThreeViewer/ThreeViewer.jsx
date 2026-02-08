/**
 * Three.js 立方体视图组件
 * 支持普通立方体展示和拼图游戏模式
 */
import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import {
  selectSelectedImage,
  selectPuzzleParams,
  setModelSelected,
  selectPuzzleGameMode,
  selectPuzzleScattered,
  selectSnapDistance,
  selectSelectedPieceIndex,
  selectPieceTransforms,
  setSelectedPieceIndex,
  setPieceTransforms,
  updatePieceTransform,
  setPuzzleScattered
} from '../../store/slices/puzzleSlice';
import {
  generateAllPieces,
  findSnapTargets,
  calculateEdgeHighlightIntensity
} from '../../utils/puzzleGeometry';
import GameControls from '../GameControls/GameControls';
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

  // 游戏模式相关引用
  const pieceMeshesRef = useRef([]);
  const piecesInfoRef = useRef([]);
  const highlightLinesRef = useRef([]);
  const rotationHelperRef = useRef(null);
  const isDraggingRef = useRef(false);
  const dragPlaneRef = useRef(null);
  const dragOffsetRef = useRef(new THREE.Vector3());

  const dispatch = useDispatch();
  const selectedImage = useSelector(selectSelectedImage);
  const params = useSelector(selectPuzzleParams);
  const modelSelected = useSelector(state => state.puzzle.modelSelected);
  const gameMode = useSelector(selectPuzzleGameMode);
  const scattered = useSelector(selectPuzzleScattered);
  const snapDistance = useSelector(selectSnapDistance);
  const selectedPieceIndex = useSelector(selectSelectedPieceIndex);
  const pieceTransforms = useSelector(selectPieceTransforms);

  // 暴露场景和立方体给父组件（用于导出）
  useImperativeHandle(ref, () => ({
    getScene: () => sceneRef.current,
    getCube: () => cubeRef.current,
    getParams: () => params,
    getTexture: () => {
      if (cubeRef.current) {
        const materials = cubeRef.current.material;
        const topMaterial = materials[4];
        return topMaterial.map;
      }
      return null;
    }
  }));

  // 初始化Three.js场景
  const initScene = useCallback(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f5);
    sceneRef.current = scene;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000);
    camera.position.set(150, -150, 450);
    camera.up.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 50;
    controls.maxDistance = 1000;
    controlsRef.current = controls;

    // 坐标轴辅助线
    const axesHelper = new THREE.AxesHelper(500);
    scene.add(axesHelper);

    // XOY平面网格
    const gridHelper = new THREE.GridHelper(1000, 100, 0xcccccc, 0xe0e0e0);
    gridHelper.rotation.x = Math.PI / 2;
    gridHelper.position.z = 0;
    scene.add(gridHelper);

    // 光照
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 100, 100);
    scene.add(directionalLight);

    // 拖拽平面
    dragPlaneRef.current = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

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

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationIdRef.current);
      renderer.dispose();
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // 创建普通立方体
  const createCube = useCallback(() => {
    if (!sceneRef.current) return;

    // 清理旧立方体
    if (cubeRef.current) {
      sceneRef.current.remove(cubeRef.current);
      cubeRef.current.geometry.dispose();
      cubeRef.current.material.forEach(m => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
      cubeRef.current = null;
    }

    // 清理分割线
    if (splitLinesRef.current) {
      sceneRef.current.remove(splitLinesRef.current);
      splitLinesRef.current.geometry.dispose();
      splitLinesRef.current.material.dispose();
      splitLinesRef.current = null;
    }

    const geometry = new THREE.BoxGeometry(params.width, params.height, params.depth);

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

    const materials = [
      sideMaterial.clone(),
      sideMaterial.clone(),
      sideMaterial.clone(),
      sideMaterial.clone(),
      topMaterial,
      bottomMaterial
    ];

    const cube = new THREE.Mesh(geometry, materials);
    cube.position.set(0, 0, params.depth / 2);
    sceneRef.current.add(cube);
    cubeRef.current = cube;

    // 创建分割线
    createSplitLines();
  }, [params, selectedImage]);

  // 创建分割线
  const createSplitLines = useCallback(() => {
    if (!sceneRef.current) return;

    const oldLines = sceneRef.current.getObjectByName('splitLines');
    if (oldLines) {
      sceneRef.current.remove(oldLines);
      oldLines.geometry.dispose();
      oldLines.material.dispose();
    }

    const { width, height, depth, gridX, gridY, splitMode } = params;
    const points = [];
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const topZ = depth + 0.1;

    const generateLinePath = (start, end, segments = 20) => {
      const path = [];
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const x = start.x + (end.x - start.x) * t;
        const y = start.y + (end.y - start.y) * t;

        let offset = 0;
        if (splitMode === 'wave') {
          offset = Math.sin(t * Math.PI * 4) * 3;
        } else if (splitMode === 'zigzag') {
          const zigzagT = (t * 8) % 1;
          offset = zigzagT < 0.5 ? zigzagT * 6 : (1 - zigzagT) * 6;
          offset -= 1.5;
        }

        if (start.x === end.x) {
          path.push(new THREE.Vector3(x + offset, y, topZ));
        } else {
          path.push(new THREE.Vector3(x, y + offset, topZ));
        }
      }
      return path;
    };

    for (let i = 1; i < gridX; i++) {
      const x = -halfWidth + (width / gridX) * i;
      const linePath = generateLinePath({ x, y: -halfHeight }, { x, y: halfHeight });
      for (let j = 0; j < linePath.length - 1; j++) {
        points.push(linePath[j], linePath[j + 1]);
      }
    }

    for (let i = 1; i < gridY; i++) {
      const y = -halfHeight + (height / gridY) * i;
      const linePath = generateLinePath({ x: -halfWidth, y }, { x: halfWidth, y });
      for (let j = 0; j < linePath.length - 1; j++) {
        points.push(linePath[j], linePath[j + 1]);
      }
    }

    if (points.length > 0) {
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({ color: 0x333333, linewidth: 2 });
      const lines = new THREE.LineSegments(geometry, material);
      lines.name = 'splitLines';
      sceneRef.current.add(lines);
      splitLinesRef.current = lines;
    }
  }, [params]);

  // 清理拼图块
  const clearPuzzlePieces = useCallback(() => {
    if (!sceneRef.current) return;

    pieceMeshesRef.current.forEach(mesh => {
      sceneRef.current.remove(mesh);
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      } else {
        if (mesh.material.map) mesh.material.map.dispose();
        mesh.material.dispose();
      }
    });
    pieceMeshesRef.current = [];

    highlightLinesRef.current.forEach(line => {
      sceneRef.current.remove(line);
      line.geometry.dispose();
      line.material.dispose();
    });
    highlightLinesRef.current = [];

    if (rotationHelperRef.current) {
      sceneRef.current.remove(rotationHelperRef.current);
      rotationHelperRef.current = null;
    }
  }, []);

  // 创建拼图块
  const createPuzzlePieces = useCallback(() => {
    if (!sceneRef.current) return;

    clearPuzzlePieces();

    // 生成所有拼图块几何体
    const pieces = generateAllPieces(params);
    piecesInfoRef.current = pieces;

    // 加载纹理
    let texture = null;
    if (selectedImage) {
      const textureLoader = new THREE.TextureLoader();
      texture = textureLoader.load(selectedImage.url);
      texture.colorSpace = THREE.SRGBColorSpace;
    }

    // 创建拼图块材质和网格
    pieces.forEach((piece, index) => {
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

      let topMaterial;
      if (texture) {
        topMaterial = new THREE.MeshStandardMaterial({
          map: texture.clone(),
          roughness: 0.5,
          metalness: 0.0
        });
        topMaterial.map.needsUpdate = true;
      } else {
        topMaterial = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.5,
          metalness: 0.0
        });
      }

      // 为 ExtrudeGeometry 创建材质数组
      // 索引0: 侧面, 索引1: 顶面/底面
      const materials = [sideMaterial, topMaterial];

      const mesh = new THREE.Mesh(piece.geometry, materials);
      mesh.userData.pieceIndex = index;
      mesh.userData.originalPosition = new THREE.Vector3(piece.centerX, piece.centerY, params.depth / 2);

      // 应用变换
      const transform = pieceTransforms[index];
      if (transform) {
        mesh.position.set(transform.x, transform.y, transform.z);
        mesh.rotation.z = transform.rotation;
      } else {
        mesh.position.copy(mesh.userData.originalPosition);
      }

      sceneRef.current.add(mesh);
      pieceMeshesRef.current.push(mesh);
    });

    // 初始化变换状态
    if (pieceTransforms.length === 0) {
      const transforms = pieces.map(piece => ({
        x: piece.centerX,
        y: piece.centerY,
        z: params.depth / 2,
        rotation: 0
      }));
      dispatch(setPieceTransforms(transforms));
    }
  }, [params, selectedImage, pieceTransforms, dispatch, clearPuzzlePieces]);

  // 更新拼图块位置
  const updatePiecePositions = useCallback(() => {
    pieceMeshesRef.current.forEach((mesh, index) => {
      const transform = pieceTransforms[index];
      if (transform) {
        mesh.position.set(transform.x, transform.y, transform.z);
        mesh.rotation.z = transform.rotation;
      }
    });

    // 同步更新选中轮廓和旋转辅助器
    if (selectedPieceIndex >= 0 && pieceMeshesRef.current[selectedPieceIndex]) {
      const selectedMesh = pieceMeshesRef.current[selectedPieceIndex];

      const outline = sceneRef.current?.getObjectByName('pieceOutline');
      if (outline) {
        outline.position.copy(selectedMesh.position);
        outline.rotation.copy(selectedMesh.rotation);
      }

      if (rotationHelperRef.current) {
        rotationHelperRef.current.position.x = selectedMesh.position.x;
        rotationHelperRef.current.position.y = selectedMesh.position.y;
      }
    }
  }, [pieceTransforms, selectedPieceIndex]);

  // 更新选中高亮
  const updateSelectionHighlight = useCallback(() => {
    if (!sceneRef.current) return;

    // 移除旧的选中轮廓
    const oldOutline = sceneRef.current.getObjectByName('pieceOutline');
    if (oldOutline) {
      sceneRef.current.remove(oldOutline);
      oldOutline.geometry.dispose();
      oldOutline.material.dispose();
    }

    // 移除旧的旋转辅助器
    if (rotationHelperRef.current) {
      sceneRef.current.remove(rotationHelperRef.current);
      rotationHelperRef.current = null;
    }

    if (selectedPieceIndex >= 0 && pieceMeshesRef.current[selectedPieceIndex]) {
      const selectedMesh = pieceMeshesRef.current[selectedPieceIndex];

      // 添加选中轮廓
      const edges = new THREE.EdgesGeometry(selectedMesh.geometry);
      const outline = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: 0x4a90d9, linewidth: 3 })
      );
      outline.position.copy(selectedMesh.position);
      outline.rotation.copy(selectedMesh.rotation);
      outline.name = 'pieceOutline';
      sceneRef.current.add(outline);

      // 添加旋转辅助器（圆环）
      const rotationRing = new THREE.RingGeometry(
        Math.max(params.width / params.gridX, params.height / params.gridY) * 0.6,
        Math.max(params.width / params.gridX, params.height / params.gridY) * 0.7,
        32
      );
      const rotationMaterial = new THREE.MeshBasicMaterial({
        color: 0xff6600,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6
      });
      const rotationHelper = new THREE.Mesh(rotationRing, rotationMaterial);
      rotationHelper.position.copy(selectedMesh.position);
      rotationHelper.position.z = params.depth + 1;
      rotationHelper.name = 'rotationHelper';
      rotationHelperRef.current = rotationHelper;
      sceneRef.current.add(rotationHelper);
    }
  }, [selectedPieceIndex, params]);

  // 更新吸附高亮
  const updateSnapHighlights = useCallback(() => {
    if (!sceneRef.current) return;

    // 清除旧的高亮线
    highlightLinesRef.current.forEach(line => {
      sceneRef.current.remove(line);
      line.geometry.dispose();
      line.material.dispose();
    });
    highlightLinesRef.current = [];

    if (selectedPieceIndex < 0 || !isDraggingRef.current) return;

    // 查找可吸附目标
    const snapTargets = findSnapTargets(
      selectedPieceIndex,
      pieceTransforms,
      piecesInfoRef.current,
      snapDistance * 2 // 高亮显示范围是吸附距离的2倍
    );

    snapTargets.forEach(target => {
      if (target.distance >= snapDistance * 2) return;

      const intensity = calculateEdgeHighlightIntensity(target.distance, snapDistance * 2);
      if (intensity <= 0) return;

      // 创建高亮线
      const pieceInfo = piecesInfoRef.current[selectedPieceIndex];
      const neighborInfo = piecesInfoRef.current[target.neighborIndex];
      const transform = pieceTransforms[selectedPieceIndex];

      const { width, height, gridX, gridY, depth } = params;
      const pieceW = width / gridX;
      const pieceH = height / gridY;

      let edgePoints = [];
      const dx = pieceInfo.col - neighborInfo.col;
      const dy = pieceInfo.row - neighborInfo.row;

      if (dx === 1) {
        edgePoints = [
          new THREE.Vector3(-pieceW / 2, -pieceH / 2, depth + 0.5),
          new THREE.Vector3(-pieceW / 2, pieceH / 2, depth + 0.5)
        ];
      } else if (dx === -1) {
        edgePoints = [
          new THREE.Vector3(pieceW / 2, -pieceH / 2, depth + 0.5),
          new THREE.Vector3(pieceW / 2, pieceH / 2, depth + 0.5)
        ];
      } else if (dy === 1) {
        edgePoints = [
          new THREE.Vector3(-pieceW / 2, -pieceH / 2, depth + 0.5),
          new THREE.Vector3(pieceW / 2, -pieceH / 2, depth + 0.5)
        ];
      } else if (dy === -1) {
        edgePoints = [
          new THREE.Vector3(-pieceW / 2, pieceH / 2, depth + 0.5),
          new THREE.Vector3(pieceW / 2, pieceH / 2, depth + 0.5)
        ];
      }

      // 应用变换
      const angle = transform.rotation || 0;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      const worldPoints = edgePoints.map(p => {
        const x = transform.x + p.x * cos - p.y * sin;
        const y = transform.y + p.x * sin + p.y * cos;
        return new THREE.Vector3(x, y, p.z);
      });

      const geometry = new THREE.BufferGeometry().setFromPoints(worldPoints);
      const material = new THREE.LineBasicMaterial({
        color: new THREE.Color(1, 1 - intensity, 0), // 黄色到橙色
        linewidth: 4,
        transparent: true,
        opacity: 0.5 + intensity * 0.5
      });
      const line = new THREE.Line(geometry, material);
      line.name = 'snapHighlight';
      sceneRef.current.add(line);
      highlightLinesRef.current.push(line);
    });
  }, [selectedPieceIndex, pieceTransforms, snapDistance, params]);

  // 打散拼图
  const handleScatter = useCallback(() => {
    if (!piecesInfoRef.current.length) return;

    const { width, height } = params;
    const scatterRadius = Math.max(width, height) * 1.5;

    const newTransforms = piecesInfoRef.current.map((piece, index) => {
      const angle = (index / piecesInfoRef.current.length) * Math.PI * 2 + Math.random() * 0.5;
      const radius = scatterRadius * (0.5 + Math.random() * 0.5);
      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        z: params.depth / 2,
        rotation: Math.random() * Math.PI * 2
      };
    });

    dispatch(setPieceTransforms(newTransforms));
    dispatch(setPuzzleScattered(true));
    dispatch(setSelectedPieceIndex(-1));
  }, [params, dispatch]);

  // 拼合拼图
  const handleAssemble = useCallback(() => {
    if (!piecesInfoRef.current.length) return;

    const newTransforms = piecesInfoRef.current.map(piece => ({
      x: piece.centerX,
      y: piece.centerY,
      z: params.depth / 2,
      rotation: 0
    }));

    dispatch(setPieceTransforms(newTransforms));
    dispatch(setPuzzleScattered(false));
    dispatch(setSelectedPieceIndex(-1));
  }, [params, dispatch]);

  // 鼠标事件处理
  const handleMouseDown = useCallback((event) => {
    if (!gameMode || !rendererRef.current || !cameraRef.current) return;

    const rect = rendererRef.current.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    // 检查是否点击了旋转辅助器
    if (rotationHelperRef.current) {
      const rotationIntersects = raycaster.intersectObject(rotationHelperRef.current);
      if (rotationIntersects.length > 0 && selectedPieceIndex >= 0) {
        // 开始旋转
        event.preventDefault();
        isDraggingRef.current = 'rotate';
        controlsRef.current.enabled = false;

        const mesh = pieceMeshesRef.current[selectedPieceIndex];
        dragOffsetRef.current.set(
          event.clientX,
          event.clientY,
          pieceTransforms[selectedPieceIndex]?.rotation || 0
        );
        return;
      }
    }

    // 检查是否点击了拼图块
    const intersects = raycaster.intersectObjects(pieceMeshesRef.current);
    if (intersects.length > 0) {
      const clickedMesh = intersects[0].object;
      const pieceIndex = clickedMesh.userData.pieceIndex;

      if (pieceIndex !== undefined) {
        event.preventDefault();
        dispatch(setSelectedPieceIndex(pieceIndex));

        // 开始拖拽
        isDraggingRef.current = 'drag';
        controlsRef.current.enabled = false;

        // 计算拖拽偏移
        const transform = pieceTransforms[pieceIndex];
        if (transform) {
          const point = new THREE.Vector3();
          dragPlaneRef.current.setFromNormalAndCoplanarPoint(
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(0, 0, transform.z)
          );
          raycaster.ray.intersectPlane(dragPlaneRef.current, point);
          dragOffsetRef.current.set(
            transform.x - point.x,
            transform.y - point.y,
            0
          );
        }
      }
    } else {
      dispatch(setSelectedPieceIndex(-1));
    }
  }, [gameMode, selectedPieceIndex, pieceTransforms, dispatch]);

  const handleMouseMove = useCallback((event) => {
    if (!isDraggingRef.current || !rendererRef.current || !cameraRef.current) return;

    const rect = rendererRef.current.domElement.getBoundingClientRect();

    if (isDraggingRef.current === 'rotate' && selectedPieceIndex >= 0) {
      // 旋转操作
      const deltaX = event.clientX - dragOffsetRef.current.x;
      const newRotation = dragOffsetRef.current.z + deltaX * 0.01;

      dispatch(updatePieceTransform({
        index: selectedPieceIndex,
        transform: { rotation: newRotation }
      }));
    } else if (isDraggingRef.current === 'drag' && selectedPieceIndex >= 0) {
      // 拖拽操作
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cameraRef.current);

      const point = new THREE.Vector3();
      const transform = pieceTransforms[selectedPieceIndex];
      if (transform) {
        dragPlaneRef.current.setFromNormalAndCoplanarPoint(
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(0, 0, transform.z)
        );
        raycaster.ray.intersectPlane(dragPlaneRef.current, point);

        dispatch(updatePieceTransform({
          index: selectedPieceIndex,
          transform: {
            x: point.x + dragOffsetRef.current.x,
            y: point.y + dragOffsetRef.current.y
          }
        }));
      }
    }
  }, [selectedPieceIndex, pieceTransforms, dispatch]);

  const handleMouseUp = useCallback(() => {
    if (!isDraggingRef.current) return;

    // 检查吸附
    if (isDraggingRef.current === 'drag' && selectedPieceIndex >= 0) {
      const snapTargets = findSnapTargets(
        selectedPieceIndex,
        pieceTransforms,
        piecesInfoRef.current,
        snapDistance
      );

      if (snapTargets.length > 0 && snapTargets[0].canSnap) {
        const target = snapTargets[0];
        dispatch(updatePieceTransform({
          index: selectedPieceIndex,
          transform: {
            x: target.targetX,
            y: target.targetY,
            rotation: target.targetRotation
          }
        }));
      }
    }

    isDraggingRef.current = false;
    controlsRef.current.enabled = true;
  }, [selectedPieceIndex, pieceTransforms, snapDistance, dispatch]);

  // 普通模式点击处理
  const handleClick = useCallback((event) => {
    if (gameMode) return;

    const rect = rendererRef.current.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);
    const intersects = raycaster.intersectObjects(sceneRef.current.children, true);

    const cubeIntersect = intersects.find(intersect =>
      intersect.object === cubeRef.current
    );

    dispatch(setModelSelected(!!cubeIntersect));
  }, [gameMode, dispatch]);

  // 初始化场景
  useEffect(() => {
    const cleanup = initScene();
    return cleanup;
  }, [initScene]);

  // 添加事件监听
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    renderer.domElement.addEventListener('click', handleClick);
    renderer.domElement.addEventListener('mousedown', handleMouseDown);
    renderer.domElement.addEventListener('mousemove', handleMouseMove);
    renderer.domElement.addEventListener('mouseup', handleMouseUp);
    renderer.domElement.addEventListener('mouseleave', handleMouseUp);

    return () => {
      renderer.domElement.removeEventListener('click', handleClick);
      renderer.domElement.removeEventListener('mousedown', handleMouseDown);
      renderer.domElement.removeEventListener('mousemove', handleMouseMove);
      renderer.domElement.removeEventListener('mouseup', handleMouseUp);
      renderer.domElement.removeEventListener('mouseleave', handleMouseUp);
    };
  }, [handleClick, handleMouseDown, handleMouseMove, handleMouseUp]);

  // 游戏模式切换
  useEffect(() => {
    if (gameMode) {
      // 清理立方体，创建拼图块
      if (cubeRef.current) {
        sceneRef.current.remove(cubeRef.current);
        cubeRef.current.geometry.dispose();
        cubeRef.current.material.forEach(m => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
        cubeRef.current = null;
      }
      if (splitLinesRef.current) {
        sceneRef.current.remove(splitLinesRef.current);
        splitLinesRef.current.geometry.dispose();
        splitLinesRef.current.material.dispose();
        splitLinesRef.current = null;
      }
      createPuzzlePieces();
    } else {
      // 清理拼图块，创建立方体
      clearPuzzlePieces();
      createCube();
    }
  }, [gameMode, createCube, createPuzzlePieces, clearPuzzlePieces]);

  // 参数变化时更新
  useEffect(() => {
    if (!sceneRef.current) return;

    if (gameMode) {
      // 游戏模式下重新生成拼图块
      dispatch(setPieceTransforms([]));
      createPuzzlePieces();
    } else {
      createCube();
    }
  }, [params, selectedImage, gameMode, createCube, createPuzzlePieces, dispatch]);

  // 更新拼图块位置
  useEffect(() => {
    if (gameMode) {
      updatePiecePositions();
      updateSnapHighlights();
    }
  }, [pieceTransforms, gameMode, updatePiecePositions, updateSnapHighlights]);

  // 更新选中高亮
  useEffect(() => {
    if (gameMode) {
      updateSelectionHighlight();
    }
  }, [selectedPieceIndex, gameMode, updateSelectionHighlight]);

  // 清理选中效果（非游戏模式）
  useEffect(() => {
    if (!sceneRef.current || gameMode) return;

    const outline = sceneRef.current.getObjectByName('selectionOutline');
    if (outline && !modelSelected) {
      sceneRef.current.remove(outline);
      outline.geometry.dispose();
      outline.material.dispose();
    } else if (!outline && modelSelected && cubeRef.current) {
      const edges = new THREE.EdgesGeometry(cubeRef.current.geometry);
      const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: 0x4a90d9, linewidth: 2 })
      );
      line.position.copy(cubeRef.current.position);
      line.name = 'selectionOutline';
      sceneRef.current.add(line);
    }
  }, [modelSelected, gameMode]);

  return (
    <div className="three-viewer" ref={containerRef}>
      <div className="viewer-info">
        <span className="info-item">
          尺寸: {params.width} × {params.height} × {params.depth} mm
        </span>
        <span className="info-item">
          分割: {params.gridX} × {params.gridY}
        </span>
        {gameMode && (
          <span className="info-item game-mode">游戏模式</span>
        )}
        {gameMode && selectedPieceIndex >= 0 && (
          <span className="info-item selected">
            选中拼图块 #{selectedPieceIndex + 1}
          </span>
        )}
        {!gameMode && modelSelected && (
          <span className="info-item selected">已选中模型</span>
        )}
      </div>

      <div className="viewer-controls-hint">
        {gameMode ? (
          '点击选中拼图块 | 拖动移动 | 点击橙色环拖动旋转 | 右键平移视角'
        ) : (
          '鼠标左键拖动旋转 | 滚轮缩放 | 右键拖动平移 | 点击选中模型'
        )}
      </div>

      {/* 游戏控制组件 */}
      <GameControls onScatter={handleScatter} onAssemble={handleAssemble} />
    </div>
  );
});

ThreeViewer.displayName = 'ThreeViewer';

export default ThreeViewer;
