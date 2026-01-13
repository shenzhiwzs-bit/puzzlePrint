/**
 * 3MF导出工具
 * 将Three.js模型导出为3MF格式文件
 *
 * 3MF格式说明:
 * - 3MF是一种基于ZIP的3D打印文件格式
 * - 包含XML描述文件和资源文件（如贴图）
 * - 支持颜色、材质、纹理等属性
 */
import JSZip from 'jszip';
import * as THREE from 'three';

/**
 * 将颜色值转换为3MF格式的颜色字符串
 * @param {THREE.Color|string} color
 * @returns {string} 格式如 "#RRGGBB"
 */
const colorToHex = (color) => {
  if (color instanceof THREE.Color) {
    return '#' + color.getHexString().toUpperCase();
  }
  if (typeof color === 'string') {
    return color.toUpperCase();
  }
  return '#808080';
};

/**
 * 将纹理转换为PNG base64
 * @param {THREE.Texture} texture
 * @returns {Promise<string>} base64编码的PNG数据
 */
const textureToBase64 = async (texture) => {
  if (!texture || !texture.image) {
    return null;
  }

  const canvas = document.createElement('canvas');
  const img = texture.image;
  canvas.width = img.width || 512;
  canvas.height = img.height || 512;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // 返回不带前缀的base64数据
  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.split(',')[1];
};

/**
 * 从BoxGeometry提取顶点和面数据
 * @param {THREE.BoxGeometry} geometry
 * @param {THREE.Vector3} position 模型位置偏移
 * @returns {Object} { vertices, triangles }
 */
const extractMeshData = (geometry, position = new THREE.Vector3()) => {
  // 确保几何体有索引
  const nonIndexed = geometry.toNonIndexed();
  const positionAttr = nonIndexed.getAttribute('position');
  const uvAttr = nonIndexed.getAttribute('uv');

  const vertices = [];
  const triangles = [];
  const uvs = [];

  // 提取顶点（3MF使用毫米为单位，我们的模型已经是毫米单位）
  for (let i = 0; i < positionAttr.count; i++) {
    vertices.push({
      x: positionAttr.getX(i) + position.x,
      y: positionAttr.getY(i) + position.y,
      z: positionAttr.getZ(i) + position.z
    });

    if (uvAttr) {
      uvs.push({
        u: uvAttr.getX(i),
        v: uvAttr.getY(i)
      });
    }
  }

  // 提取三角形面
  for (let i = 0; i < positionAttr.count; i += 3) {
    triangles.push({
      v1: i,
      v2: i + 1,
      v3: i + 2
    });
  }

  return { vertices, triangles, uvs };
};

/**
 * 生成3MF的[Content_Types].xml
 * @returns {string}
 */
const generateContentTypes = () => {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
  <Default Extension="png" ContentType="image/png"/>
</Types>`;
};

/**
 * 生成3MF的关系文件 _rels/.rels
 * @returns {string}
 */
const generateRels = () => {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;
};

/**
 * 生成3MF的主模型文件 3D/3dmodel.model
 * @param {Object} meshData 网格数据
 * @param {Object} colors 颜色配置
 * @param {boolean} hasTexture 是否有纹理
 * @returns {string}
 */
const generateModelXml = (meshData, colors, hasTexture) => {
  const { vertices, triangles } = meshData;

  // 构建顶点字符串
  const verticesXml = vertices.map((v, i) =>
    `        <vertex x="${v.x.toFixed(6)}" y="${v.y.toFixed(6)}" z="${v.z.toFixed(6)}"/>`
  ).join('\n');

  // 构建三角形字符串
  // BoxGeometry面顺序: [+X, -X, +Y, -Y, +Z, -Z]
  // 每个面有2个三角形，共12个三角形
  const trianglesXml = triangles.map((t, i) => {
    // 根据三角形索引确定是哪个面
    const faceIndex = Math.floor(i / 2);
    let pid;

    // 面索引对应: 0=+X, 1=-X, 2=+Y, 3=-Y, 4=+Z(顶面), 5=-Z(底面)
    if (faceIndex === 4) {
      // 顶面 - 使用纹理材质或白色
      pid = hasTexture ? '3' : '1';
    } else if (faceIndex === 5) {
      // 底面
      pid = '2';
    } else {
      // 侧面
      pid = '1';
    }

    return `        <triangle v1="${t.v1}" v2="${t.v2}" v3="${t.v3}" pid="${pid}"/>`;
  }).join('\n');

  // 材质定义
  const materialsXml = `
    <basematerials id="1">
      <base name="SideColor" displaycolor="${colors.side}"/>
      <base name="BottomColor" displaycolor="${colors.bottom}"/>
      <base name="TopColor" displaycolor="#FFFFFF"/>
    </basematerials>`;

  // 如果有纹理，添加纹理资源
  const textureXml = hasTexture ? `
    <m:texture2d id="2" path="/3D/Textures/texture.png" contenttype="image/png"/>
    <m:texture2dgroup id="3" texid="2">
      <m:tex2coord u="0" v="0"/>
      <m:tex2coord u="1" v="0"/>
      <m:tex2coord u="1" v="1"/>
      <m:tex2coord u="0" v="1"/>
    </m:texture2dgroup>` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US"
  xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
  xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">
  <resources>${materialsXml}${textureXml}
    <object id="4" type="model">
      <mesh>
        <vertices>
${verticesXml}
        </vertices>
        <triangles>
${trianglesXml}
        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="4"/>
  </build>
</model>`;
};

/**
 * 导出3MF文件
 * @param {THREE.Mesh} cube 立方体网格
 * @param {Object} params 拼图参数
 * @param {THREE.Texture} texture 顶面纹理（可选）
 * @returns {Promise<Blob>} 3MF文件Blob
 */
export const export3MF = async (cube, params, texture) => {
  if (!cube) {
    throw new Error('没有可导出的模型');
  }

  const zip = new JSZip();

  // 提取网格数据
  const meshData = extractMeshData(cube.geometry, cube.position);

  // 颜色配置
  const colors = {
    side: params.sideColor.toUpperCase(),
    bottom: params.bottomColor.toUpperCase()
  };

  // 检查是否有纹理
  const hasTexture = !!texture;

  // 添加Content_Types.xml
  zip.file('[Content_Types].xml', generateContentTypes());

  // 添加关系文件
  zip.file('_rels/.rels', generateRels());

  // 添加模型文件
  zip.file('3D/3dmodel.model', generateModelXml(meshData, colors, hasTexture));

  // 如果有纹理，添加纹理文件
  if (hasTexture) {
    const textureBase64 = await textureToBase64(texture);
    if (textureBase64) {
      zip.file('3D/Textures/texture.png', textureBase64, { base64: true });
    }
  }

  // 生成ZIP文件
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml'
  });

  return blob;
};

/**
 * 触发文件下载
 * @param {Blob} blob 文件数据
 * @param {string} filename 文件名
 */
export const downloadFile = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * 导出并下载3MF文件
 * @param {THREE.Mesh} cube 立方体网格
 * @param {Object} params 拼图参数
 * @param {THREE.Texture} texture 顶面纹理（可选）
 * @param {string} filename 文件名（默认puzzle.3mf）
 */
export const exportAndDownload3MF = async (cube, params, texture, filename = 'puzzle.3mf') => {
  const blob = await export3MF(cube, params, texture);
  downloadFile(blob, filename);
};

export default export3MF;
