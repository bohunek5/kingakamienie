import * as THREE from 'three';

// A photographic light tent with negative-fill cards, captured in linear HDR.
// It is independent of the white background seen by the camera.
export function createStudio(renderer, variant = 'studio') {
  const studio = new THREE.Scene();
  studio.background = new THREE.Color(0.24, 0.26, 0.28);
  const panels = [];
  function panel(position, size, intensity, color = '#ffffff') {
    const material = new THREE.MeshBasicMaterial({color:new THREE.Color(color).multiplyScalar(intensity), side:THREE.DoubleSide, toneMapped:false});
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...size), material);
    mesh.position.set(...position); mesh.lookAt(0, 0, 0); studio.add(mesh); panels.push(mesh);
  }
  const daylight = variant === 'daylight';
  panel([-22, 15, 23], [21, 36], daylight ? 4.5 : 3.8, '#fff8ef');
  panel([21, 4, 18], [5, 35], 5.5, '#f4f8ff');
  panel([0, 28, 3], [30, 18], 3.2);
  panel([-19, 2, -17], [8, 31], 2.4);
  panel([15, -10, -22], [10, 24], daylight ? 2.2 : 1.5);
  panel([0, -26, 0], [45, 45], 0.62, '#f6f3ed');
  panel([0, 1, 28], [8, 26], 0.025);
  panel([-26, -4, 2], [6, 35], 0.012);
  panel([25, 2, -2], [4, 40], 0.015);
  panel([-7, -3, -28], [7, 24], 0.04);
  // Narrow neutral highlight reflected along polished metal edges.
  panel([-7, 12, 25], [1.2, 17], 7.5);
  const studioResolution=window.matchMedia('(pointer: coarse)').matches?512:1024;
  const target = new THREE.WebGLCubeRenderTarget(studioResolution, {
    type:THREE.HalfFloatType, generateMipmaps:true, minFilter:THREE.LinearMipmapLinearFilter
  });
  const cubeCamera = new THREE.CubeCamera(0.1, 150, target);
  cubeCamera.update(renderer, studio);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromCubemap(target.texture);
  pmrem.dispose();
  panels.forEach(mesh => {mesh.geometry.dispose(); mesh.material.dispose();});
  return {cube:target.texture, environment:environment.texture, dispose(){target.dispose();environment.dispose();}};
}
