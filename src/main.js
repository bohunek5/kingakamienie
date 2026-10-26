import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createJewelry } from './jewelry.js';
import { createGemMaterial } from './gem-material.js';
import { createMineralMaterial } from './mineral-material.js';
import { createCosmicMaterial, tickCosmic } from './cosmic-material.js';
import { createStudio } from './studio.js';
import { setupUI } from './ui.js';
import { STONES, METALS, CUTS, SETTINGS, FINISHES, DEFAULT_STATE } from './config.js';
import './style.css';

const STORAGE_KEY = 'emera-atelier-project-v1';
const viewport = document.querySelector('#viewport');
let state = {...DEFAULT_STATE};
try {
  const stored=JSON.parse(localStorage.getItem(STORAGE_KEY));
  if(stored?.version===1){state=validateState(stored.state);state.rotation=false;}
} catch { /* A malformed or unavailable local store must never prevent startup. */ }
let model, studio, dimensions, ui, animationFrame, needsRender = true;
let disposed = false;
let sceneVisible=true;
const touchDevice=window.matchMedia('(pointer: coarse)').matches;
const materialLibrary = new Set();
let metrics = {};
let renderer;
try {
  renderer = new THREE.WebGLRenderer({antialias:true, alpha:false, powerPreference:'high-performance', preserveDrawingBuffer:true});
} catch (error) {
  viewport.innerHTML = '<p class="webgl-error">Do wyświetlenia biżuterii potrzebna jest obsługa WebGL 2. Włącz akcelerację grafiki w przeglądarce i odśwież stronę.</p>';
  throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0xffffff);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.setAttribute('aria-label', 'Interaktywny model 3D kolczyka. Przeciągnij, aby obrócić; przewiń, aby przybliżyć.');
renderer.domElement.setAttribute('role','img');
renderer.domElement.tabIndex = 0;
viewport.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#ffffff');
const camera = new THREE.PerspectiveCamera(31,1,0.1,500);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.085;
controls.minDistance = 15;
controls.maxDistance = 145;
controls.enablePan = true;
controls.autoRotateSpeed = 0.65;
if(touchDevice){
  controls.touches.ONE=undefined;
  controls.touches.TWO=THREE.TOUCH.DOLLY_ROTATE;
  renderer.domElement.style.touchAction='pan-y';
  viewport.style.touchAction='pan-y';
}
controls.target.set(0, 2.6, 0);
controls.addEventListener('change', () => needsRender = true);
controls.addEventListener('start', () => {if (state.rotation) setState({rotation:false});});

const hemisphere = new THREE.HemisphereLight('#ffffff', '#c8b89a', 0.4);
scene.add(hemisphere);
const keyLight = new THREE.DirectionalLight('#fff7e9', 3.0);
keyLight.position.set(-15, 32, 26);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048,2048);
keyLight.shadow.camera.left=-30; keyLight.shadow.camera.right=30;
keyLight.shadow.camera.top=35; keyLight.shadow.camera.bottom=-30;
keyLight.shadow.camera.near=0.1; keyLight.shadow.camera.far=100;
keyLight.shadow.bias=-0.0001; keyLight.shadow.normalBias=0.05;
keyLight.shadow.radius=5;
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight('#edf4ff',1.3);
fillLight.position.set(22, 5, 8); scene.add(fillLight);
const shadowCanvas=document.createElement('canvas');shadowCanvas.width=256;shadowCanvas.height=256;
const shadowContext=shadowCanvas.getContext('2d');
const shadowGradient=shadowContext.createRadialGradient(128,128,8,128,128,125);
shadowGradient.addColorStop(0,'rgba(38,34,22,0.12)');shadowGradient.addColorStop(0.4,'rgba(38,34,22,0.055)');shadowGradient.addColorStop(1,'rgba(38,34,22,0)');
shadowContext.fillStyle=shadowGradient;shadowContext.fillRect(0,0,256,256);
const shadowTexture=new THREE.CanvasTexture(shadowCanvas);shadowTexture.colorSpace=THREE.SRGBColorSpace;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(18,13),new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false,toneMapped:false}));
floor.rotation.x=-Math.PI/2;floor.position.y=-11.5;scene.add(floor);

function setStudio() {
  const previous=studio;
  studio=createStudio(renderer,state.lighting);
  scene.environment=studio.environment;
  scene.environmentIntensity=1.0;
  if(model) model.traverse(object=>{
    if(object.material?.uniforms?.uEnvironment) object.material.uniforms.uEnvironment.value=studio.cube;
  });
  previous?.dispose();
  needsRender=true;
}

function disposeModel(root) {
  if(!root) return;
  const geometries=new Set();
  root.traverse(object=>{if(object.geometry) geometries.add(object.geometry);});
  geometries.forEach(geometry=>geometry.dispose());
  materialLibrary.forEach(material=>material.dispose());materialLibrary.clear();
  scene.remove(root);
}

function gemVolume(geometry) {
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),cross=new THREE.Vector3();
  let volume=0;const pos=geometry.attributes.position,index=geometry.index;
  const count=index?index.count:pos.count;
  for(let i=0;i<count;i+=3){
    a.fromBufferAttribute(pos,index?index.getX(i):i);
    b.fromBufferAttribute(pos,index?index.getX(i+1):i+1);
    c.fromBufferAttribute(pos,index?index.getX(i+2):i+2);
    volume+=a.dot(cross.crossVectors(b,c))/6;
  }
  return Math.abs(volume);
}

function createCenterMaterial(geometry, stoneKey) {
  const stone=STONES[stoneKey];let material;
  if(stone.group==='cosmic')material=createCosmicMaterial(geometry,stoneKey,state.finish);
  else {
    material=createMineralMaterial(geometry,stoneKey,studio.cube);
    if(state.finish==='metalized'){
      if(material.isShaderMaterial){material.dispose();material=new THREE.MeshPhysicalMaterial({color:stone.color,metalness:1,roughness:.16,clearcoat:1,clearcoatRoughness:.05});}
      else {material.metalness=1;material.roughness=.18;material.clearcoat=1;}
    } else if(state.finish==='glass'){
      if(material.isShaderMaterial){material.uniforms.uEnvironmentIntensity.value=1.12;}
      else{material.metalness=0;material.roughness=.025;material.transmission=.72;material.thickness=state.size*.22;material.ior=1.54;material.clearcoat=1;}
    } else if(state.finish==='highend'){
      if(material.isShaderMaterial){material.defines.INTERNAL_BOUNCES=10;material.uniforms.uEnvironmentIntensity.value=1.06;}
      else {material.roughness=.085;material.clearcoat=1;material.clearcoatRoughness=.025;material.envMapIntensity=1.25;}
    }
  }
  material.name=stone.name;material.userData.stoneKey=stoneKey;material.userData.isCenterStone=true;
  materialLibrary.add(material);return material;
}

function buildModel() {
  disposeModel(model);
  const metalMaterial=new THREE.MeshPhysicalMaterial({color:METALS[state.metal].color, metalness:1, roughness:0.145, envMapIntensity:1.0, clearcoat:0.24, clearcoatRoughness:0.1});
  metalMaterial.name=METALS[state.metal].name;materialLibrary.add(metalMaterial);
  const accentMaterial=new THREE.MeshPhysicalMaterial({color:'#f2f7ff',metalness:0,roughness:0.025,transmission:0.55,thickness:0.65,ior:2.333,dispersion:0.18,envMapIntensity:1.6});
  accentMaterial.name='Diamenty oprawy';materialLibrary.add(accentMaterial);
  const gemMaterialFactory=(geometry,stoneKey)=>{
    return createCenterMaterial(geometry,stoneKey||state.stone);
  };
  const first=createJewelry(state,{metalMaterial,gemMaterialFactory,accentMaterial});
  const accentShaders=new Map();
  first.traverse(object=>{
    if(object.isMesh && object.material===accentMaterial){
      const diameter=object.geometry.userData.length||object.geometry.boundingSphere?.radius||1;
      const cacheKey=diameter.toFixed(5);
      if(!accentShaders.has(cacheKey)){
        const material=createGemMaterial(object.geometry,'diamond',studio.cube);
        material.defines.INTERNAL_BOUNCES=4;
        material.uniforms.uDispersion.value=0;
        material.name='Diamenty pavé';
        accentShaders.set(cacheKey,material);materialLibrary.add(material);
      }
      object.material=accentShaders.get(cacheKey);
    }
  });
  model=new THREE.Group();model.name='ÉMERA — kolczyk';model.add(first);
  if(state.pair){
    first.position.x=-6.4;first.rotation.y=-0.13;
    const second=first.clone(true);second.position.set(6.4,0.7,-1.2);second.rotation.y=0.22;model.add(second);
  }
  let mainGem;
  model.traverse(object=>{
    if(object.isMesh){object.castShadow=true;object.receiveShadow=true;}
    if(object.userData.role==='main-gem'&&!mainGem)mainGem=object;
    if(object.userData.explode){object.userData.assembledPosition=object.position.toArray();}
  });
  const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3());
  floor.position.y=box.min.y-0.8;
  floor.scale.x=state.pair?1.7:1;
  metrics={...(first.userData.dimensions||{}),width:size.x,height:size.y,depth:size.z,
    carat:mainGem?gemVolume(mainGem.geometry)*STONES[state.stone].density/200:0,
    stone:STONES[state.stone].name,gemLength:state.size};
  scene.add(model);
  updateExploded();
  buildDimensions();
  ui?.setMetrics(metrics);
  needsRender=true;
}

function updateExploded() {
  if(!model)return;
  model.traverse(object=>{
    const original=object.userData.assembledPosition;
    if(original){object.position.fromArray(original);if(state.exploded)object.position.add(new THREE.Vector3(...object.userData.explode));}
  });
  needsRender=true;
}

function buildDimensions() {
  if(dimensions){scene.remove(dimensions);dimensions.traverse(object=>{object.geometry?.dispose();object.material?.map?.dispose();object.material?.dispose();});}
  dimensions=new THREE.Group();dimensions.name='Wymiary';
  if(!model)return;
  const x=state.pair?13:6.5, y=-4, h=state.size, z=2.3;
  const vertices=[x,y-h/2,z,x,y+h/2,z,x-0.7,y-h/2,z,x+0.7,y-h/2,z,x-0.7,y+h/2,z,x+0.7,y+h/2,z];
  const line=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)),new THREE.LineBasicMaterial({color:'#899a91',transparent:true,opacity:0.75}));
  dimensions.add(line);
  const canvas=document.createElement('canvas');canvas.width=384;canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,384,128);ctx.fillStyle='#52695e';ctx.font='46px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(`${state.size.toFixed(1)} mm`,192,64);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,toneMapped:false}));
  label.position.set(x+2.1,y,z);label.scale.set(4.5,1.5,1);dimensions.add(label);
  dimensions.visible=state.dimensions;scene.add(dimensions);
}

function frameCamera(view='default') {
  const aspect=viewport.clientWidth/Math.max(1,viewport.clientHeight);
  const box=model?new THREE.Box3().setFromObject(model):null;
  const target=box?box.getCenter(new THREE.Vector3()):new THREE.Vector3(0,2.6,0);
  const modelSize=box?box.getSize(new THREE.Vector3()):new THREE.Vector3(10,24,6);
  const fovTan=Math.tan(THREE.MathUtils.degToRad(15.5));
  const fitted=Math.max(modelSize.y,modelSize.x/Math.max(aspect,.35))/(2*fovTan)*1.2;
  const distance=touchDevice?Math.max(fitted,40):Math.max(state.pair?63:55,fitted);
  target.z=0;
  const positions={default:[distance*0.32,target.y+distance*0.13,distance],front:[0,target.y,distance],side:[distance,target.y,0.1],back:[0,target.y,-distance]};
  camera.position.fromArray(positions[view]||positions.default);
  controls.target.copy(target);controls.update();needsRender=true;
}

function validateState(input) {
  const next={...DEFAULT_STATE};
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Nieprawidłowy plik projektu.');
  for(const [key,options] of Object.entries({stone:STONES,metal:METALS,cut:CUTS,setting:SETTINGS,finish:FINISHES})){
    if(key in input && !Object.hasOwn(options,input[key]))throw new Error('Plik zawiera nieznany wariant biżuterii.');
    if(key in input)next[key]=input[key];
  }
  if('size'in input){const value=Number(input.size);if(!Number.isFinite(value)||value<7||value>14)throw new Error('Wielkość kamienia musi wynosić od 7 do 14 mm.');next.size=Math.round(value*2)/2;}
  for(const key of ['rotation','exploded','pair','dimensions','alive'])if(typeof input[key]==='boolean')next[key]=input[key];
  if(['studio','daylight'].includes(input.lighting))next.lighting=input.lighting;
  return next;
}

function setState(patch) {
  const previous=state;
  state=validateState({...state,...patch});
  const geometryChanged=['cut','setting','size','pair'].some(key=>state[key]!==previous[key]);
  if(state.lighting!==previous.lighting)setStudio();
  if(geometryChanged)buildModel();
  else if(state.stone!==previous.stone || state.metal!==previous.metal || state.finish!==previous.finish){
    let replacement;const retired=new Set();
    model.traverse(object=>{
      if(object.userData.role==='main-gem' && (state.stone!==previous.stone||state.finish!==previous.finish)){
        replacement ||= createCenterMaterial(object.geometry,state.stone);
        retired.add(object.material);object.material=replacement;object.userData.stone=state.stone;
        metrics.carat=gemVolume(object.geometry)*STONES[state.stone].density/200;
        metrics.stone=STONES[state.stone].name;
      }
      if(object.material?.metalness===1 && !object.material.userData.isCenterStone){object.material.color.set(METALS[state.metal].color);object.material.name=METALS[state.metal].name;}
    });
    retired.forEach(material=>{material.dispose();materialLibrary.delete(material);});
  }
  if(state.exploded!==previous.exploded)updateExploded();
  if(state.pair!==previous.pair)frameCamera();
  dimensions.visible=state.dimensions;
  controls.autoRotate=state.rotation;
  ui?.update(state);ui?.setMetrics(metrics);needsRender=true;
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,state}));}catch{}
}

function download(blob,filename) {
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}

async function screenshot() {
  const size=new THREE.Vector2();renderer.getSize(size);
  const oldRatio=renderer.getPixelRatio(),oldAspect=camera.aspect,wasVisible=dimensions.visible;
  const width=2400,height=Math.round(width/oldAspect);
  dimensions.visible=false;
  try{
    renderer.setPixelRatio(1);renderer.setSize(width,height,false);renderer.render(scene,camera);
    const blob=await new Promise(resolve=>renderer.domElement.toBlob(resolve,'image/png'));
    if(!blob)throw new Error('Nie udało się utworzyć obrazu.');
    download(blob,`emera-${state.stone}-${state.setting}.png`);
    ui.toast('Zapisano fotografię projektu w wysokiej rozdzielczości.');
  }finally{dimensions.visible=wasVisible;renderer.setPixelRatio(oldRatio);renderer.setSize(size.x,size.y,false);needsRender=true;}
}

async function exportModel() {
  const cloned=model.clone(true),temporary=[];
  cloned.traverse(object=>{
    if(object.userData.assembledPosition)object.position.fromArray(object.userData.assembledPosition);
    if(object.material?.isShaderMaterial){
      const stone=STONES[object.material.userData.stoneKey||state.stone];
      object.geometry.computeBoundingBox();
      const thickness=object.geometry.boundingBox.max.z-object.geometry.boundingBox.min.z;
      const absorption=object.material.uniforms.uAbsorption.value;
      const attenuationColor=new THREE.Color().setRGB(Math.exp(-absorption.x*5),Math.exp(-absorption.y*5),Math.exp(-absorption.z*5));
      const material=new THREE.MeshPhysicalMaterial({color:'#ffffff',roughness:0.035,metalness:0,transmission:1,thickness,ior:Math.min(stone.ior,2.333),attenuationColor,attenuationDistance:0.005,dispersion:0.02});
      material.name=stone.name;object.material=material;temporary.push(material);
    }else if(object.material?.userData.isCosmicMaterial){
      const source=object.material,material=source.clone();
      material.emissive.set(STONES[source.userData.stoneKey].color);
      material.emissiveIntensity=['mars','moon','meteorite'].includes(source.userData.stoneKey)?0:.16;
      material.userData={...source.userData,proceduralPreviewOnly:true};
      object.material=material;temporary.push(material);
    }
    object.userData={...object.userData};delete object.userData.assembledPosition;
  });
  // glTF uses metres; the procedural source is measured in millimetres.
  cloned.scale.multiplyScalar(0.001);cloned.updateMatrixWorld(true);
  cloned.userData={project:'ÉMERA Atelier',configuration:{...state,exploded:false},units:'metres',note:'Procedural visualization; gem optical shader approximated by glTF physical materials.'};
  try{
    const result=await new GLTFExporter().parseAsync(cloned,{binary:true,onlyVisible:true});
    download(new Blob([result],{type:'model/gltf-binary'}),`emera-${state.stone}-${state.setting}.glb`);
    ui.toast('Zapisano model GLB z geometrią i materiałami PBR.');
  }finally{temporary.forEach(material=>material.dispose());}
}

async function handleAction(action) {
  try{
    if(action==='screenshot')await screenshot();
    else if(action==='export')await exportModel();
    else if(['front','side','back'].includes(action)){setState({rotation:false});frameCamera(action);}
    else if(action==='macro'){
      setState({rotation:false});controls.target.set(0,-4,0);
      const distance=state.size*2.8;
      camera.position.set(distance*0.24,-4+distance*0.08,distance);controls.update();needsRender=true;
    }
    else if(action==='reset-camera')frameCamera();
    else if(action==='reset'){setState({...DEFAULT_STATE});frameCamera();ui.toast('Przywrócono projekt szmaragdowy.');}
    else if(action==='save'){
      download(new Blob([JSON.stringify({version:1,name:'ÉMERA Atelier',state},null,2)],{type:'application/json'}),'emera-projekt.json');
      ui.toast('Zapisano konfigurację projektu.');
    }else if(action==='load'){
      const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
      input.onchange=async()=>{try{const file=input.files[0];if(!file)return;if(file.size>100000)throw new Error('Plik projektu jest zbyt duży.');const data=JSON.parse(await file.text());const restored=validateState(data.state||data);setState(restored);frameCamera();ui.toast('Wczytano projekt.');}catch(error){ui.toast(error.message||'Nie udało się wczytać projektu.');}};input.click();
    }
  }catch(error){console.error(error);ui.toast('Nie udało się zapisać pliku. Spróbuj ponownie.');}
}

ui=setupUI(state,{onChange:setState,onAction:handleAction});
setStudio();buildModel();
let previousViewportWidth=0;
function resize() {
  const width=viewport.clientWidth,height=viewport.clientHeight;
  if(!width||!height)return;
  renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();needsRender=true;
  if(touchDevice && Math.abs(previousViewportWidth-width)>30)frameCamera();
  previousViewportWidth=width;
}
new ResizeObserver(resize).observe(viewport);resize();frameCamera();
const visibilityObserver=new IntersectionObserver(entries=>{sceneVisible=entries[0].isIntersecting;if(sceneVisible)needsRender=true;},{threshold:0});
visibilityObserver.observe(viewport);
renderer.domElement.addEventListener('keydown',event=>{
  if(event.key==='Home'){frameCamera();event.preventDefault();}
  if(event.key==='+'||event.key==='='){camera.position.sub(controls.target).multiplyScalar(0.9).add(controls.target);needsRender=true;event.preventDefault();}
  if(event.key==='-'){camera.position.sub(controls.target).multiplyScalar(1.1).add(controls.target);needsRender=true;event.preventDefault();}
  if(event.key.startsWith('Arrow')){
    const offset=camera.position.clone().sub(controls.target),spherical=new THREE.Spherical().setFromVector3(offset);
    if(event.key==='ArrowLeft')spherical.theta-=0.1;
    if(event.key==='ArrowRight')spherical.theta+=0.1;
    if(event.key==='ArrowUp')spherical.phi-=0.1;
    if(event.key==='ArrowDown')spherical.phi+=0.1;
    spherical.makeSafe();camera.position.setFromSpherical(spherical).add(controls.target);controls.update();needsRender=true;event.preventDefault();
  }
});
let lastTime=performance.now(),cosmicTime=0,lastRenderTime=0;
function animate(now) {
  if(disposed)return;
  animationFrame=requestAnimationFrame(animate);
  if(document.hidden||!sceneVisible)return;
  const delta=Math.min((now-lastTime)/1000,0.05);
  controls.update(delta);lastTime=now;
  const isAlive=state.alive && STONES[state.stone].group==='cosmic';
  if(isAlive){cosmicTime+=delta;materialLibrary.forEach(material=>tickCosmic(material,cosmicTime));}
  if(needsRender||controls.autoRotate||(isAlive&&now-lastRenderTime>32)){renderer.render(scene,camera);needsRender=false;lastRenderTime=now;}
}
animationFrame=requestAnimationFrame(animate);
renderer.compileAsync(scene,camera).then(()=>{needsRender=true;renderer.render(scene,camera);ui.setReady();window.__ATELIER_READY__=true;}).catch(error=>{console.error(error);ui.toast('Nie udało się przygotować renderera 3D.');});
window.__atelier={get state(){return {...state};},get metrics(){return {...metrics};},setState,frameCamera,scene,camera,renderer,get model(){return model;},handleAction};
window.addEventListener('beforeunload',()=>{disposed=true;cancelAnimationFrame(animationFrame);visibilityObserver.disconnect();controls.dispose();disposeModel(model);studio.dispose();renderer.dispose();});
