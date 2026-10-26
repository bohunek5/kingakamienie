import * as THREE from 'three';
import { STONES } from './config.js';
import { createGemMaterial, updateGemMaterial } from './gem-material.js';

// Polished mineral specimens require a solid body and geological structure.
// They deliberately use PBR surface shading rather than crystal transmission.
const PATTERNS = {
  malachite: 1, lapis: 2, turquoise: 3, jasper: 4, rhodonite: 5,
  obsidian: 6, hematite: 7, tiger_eye: 8, opal: 9, moonstone: 10,
  labradorite: 11, pearl: 12, agate: 13, onyx: 14, jade: 15,
  aventurine: 16, sunstone: 17, amazonite: 18, sodalite: 19,
  rhodochrosite: 20, chrysocolla: 21, unakite: 22, coral: 23, chrysoprase: 24,
};
const ALIASES = {
  lapis_lazuli: 'lapis', lapislazuli: 'lapis', lapisLazuli: 'lapis',
  tigereye: 'tiger_eye', tigerEye: 'tiger_eye', tigers_eye: 'tiger_eye',
  red_jasper: 'jasper', black_onyx: 'onyx', nephrite: 'jade', jadeite: 'jade',
  white_opal: 'opal', black_opal: 'opal', black_pearl: 'pearl',
};
const stateByMaterial = new WeakMap();

function patternKey(stoneKey) {
  const entry = STONES[stoneKey];
  const declared = entry?.pattern || entry?.mineralKind || entry?.kind;
  const candidate = declared && PATTERNS[declared] ? declared : stoneKey;
  return ALIASES[candidate] || candidate;
}

/** A different family requires a new material; within a family update in place. */
export function mineralFamily(stoneKey) {
  const entry = STONES[stoneKey];
  return PATTERNS[patternKey(stoneKey)] || entry?.kind === 'mineral' || entry?.kind === 'opaque'
    || entry?.opaque === true ? 'mineral' : 'crystal';
}

const parametersGLSL = /* glsl */ `
  varying vec3 vMineralPosition;
  varying vec3 vMineralLocalView;
  uniform int uMineralPattern;
  uniform float uMineralScale;
  uniform vec3 uMineralOrigin;
  uniform vec3 uMineralBase;

  float mineralHash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  vec2 mineralHash2(vec2 p) {
    return vec2(mineralHash(vec3(p, 17.3)), mineralHash(vec3(p.yx, 41.7)));
  }
  float mineralNoise(vec3 p) {
    vec3 cell = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(mineralHash(cell), mineralHash(cell + vec3(1,0,0)), f.x),
      mix(mineralHash(cell + vec3(0,1,0)), mineralHash(cell + vec3(1,1,0)), f.x), f.y),
      mix(mix(mineralHash(cell + vec3(0,0,1)), mineralHash(cell + vec3(1,0,1)), f.x),
      mix(mineralHash(cell + vec3(0,1,1)), mineralHash(cell + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float mineralFbm(vec3 p) {
    float f = 0.0;
    float amplitude = 0.53;
    const mat3 turn = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
    for (int i = 0; i < 4; i++) {
      f += amplitude * mineralNoise(p);
      p = turn * p * 2.03 + vec3(3.7, 1.9, 7.1);
      amplitude *= 0.48;
    }
    return f;
  }
  // Nearest crystal grain, distance to the next grain and a stable grain ID.
  vec3 mineralCells(vec2 p) {
    vec2 base = floor(p), f = fract(p);
    float first = 10.0, second = 10.0, identity = 0.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 offset = vec2(float(x), float(y));
        vec2 seed = mineralHash2(base + offset);
        float distance = length(offset + 0.12 + seed * 0.76 - f);
        if (distance < first) {
          second = first; first = distance; identity = seed.x;
        } else if (distance < second) second = distance;
      }
    }
    return vec3(first, second - first, identity);
  }
  vec3 mineralLinear(vec3 srgb) {
    return pow(max(srgb, vec3(0.0)), vec3(2.2));
  }
  vec3 mineralSpectrum(float t) {
    return clamp(0.50 + 0.50 * cos(6.2831853 * (t + vec3(0.0, 0.33, 0.67))), 0.0, 1.0);
  }
  float mineralPyrite(vec3 p, float threshold) {
    vec3 q = p * 17.0;
    vec3 f = fract(q) - 0.5;
    float selected = step(threshold, mineralHash(floor(q)));
    float shard = 1.0 - smoothstep(0.15, 0.36, abs(f.x) + abs(f.y) * 0.8 + abs(f.z) * 0.3);
    return selected * shard;
  }
  struct MineralSurface {
    vec3 color;
    float roughness;
    float metallic;
    vec3 subsurface;
  };
  MineralSurface mineralSurface(vec3 p, vec3 viewDirection) {
    MineralSurface result;
    result.color = uMineralBase;
    result.roughness = 1.0;
    result.metallic = 0.0;
    result.subsurface = vec3(0.0);
    int kind = uMineralPattern;
    float cloud = mineralFbm(p * 0.72);
    float grain = mineralNoise(p * 37.0);

    if (kind == 1) {
      // Intergrown botryoidal nodules, with alternating copper-carbonate layers.
      vec2 warp = vec2(mineralFbm(p * 0.43), mineralFbm(p.yzx * 0.43 + 9.7));
      vec3 cells = mineralCells(p.xy * 0.23 + p.z * vec2(0.06, -0.04) + warp * 0.24);
      float rings = cells.x * 53.0 + mineralFbm(p * 1.5) * 2.6;
      float band = 0.5 + 0.5 * sin(rings);
      float fineBand = 0.5 + 0.5 * sin(rings * 3.1 + cloud * 0.8);
      vec3 dark = vec3(0.035, 0.20, 0.115);
      vec3 green = vec3(0.12, 0.58, 0.32);
      vec3 color = mix(dark, green, smoothstep(0.1, 0.9, band));
      color *= 0.85 + 0.15 * fineBand;
      color = mix(color, vec3(0.35, 0.65, 0.40), pow(fineBand, 18.0) * 0.28);
      result.color = mineralLinear(color);
      result.roughness = 0.8 + 0.3 * grain;
    } else if (kind == 2 || kind == 19) {
      vec3 color = mix(vec3(0.025, 0.075, 0.27), vec3(0.12, 0.25, 0.57), cloud);
      float calcite = smoothstep(0.65, 0.81, mineralFbm(p * 1.3 + 23.0));
      color = mix(color, vec3(0.76, 0.79, 0.81), calcite * (kind == 19 ? 0.8 : 0.52));
      float fleck = kind == 2 ? mineralPyrite(p, 0.965) : 0.0;
      result.color = mineralLinear(mix(color, vec3(0.83, 0.64, 0.25), fleck));
      result.metallic = fleck * 0.82;
      result.roughness = mix(1.12, 0.50, fleck);
    } else if (kind == 3 || kind == 21) {
      vec2 warp = vec2(mineralFbm(p * 0.68), mineralFbm(p.yzx * 0.68 + 8.0));
      vec3 cells = mineralCells(p.xy * 0.60 + p.z * 0.13 + warp * 0.9);
      float vein = 1.0 - smoothstep(0.013, 0.055 + cloud * 0.025, cells.y);
      float hairline = 1.0 - smoothstep(0.005, 0.014, cells.y);
      vec3 color = mix(vec3(0.13, 0.61, 0.61), vec3(0.34, 0.82, 0.79), cloud);
      if (kind == 21) color = mix(color, vec3(0.025, 0.28, 0.23), smoothstep(0.42, 0.67, cloud));
      color = mix(color, vec3(0.28, 0.19, 0.11), vein * 0.72);
      color = mix(color, vec3(0.075, 0.10, 0.08), hairline * 0.9);
      result.color = mineralLinear(color * (0.96 + grain * 0.04));
      result.roughness = 0.9 + vein * 0.35;
    } else if (kind == 4 || kind == 22) {
      float marble = mineralFbm(p * 1.0 + cloud * 3.2);
      vec3 color = mix(vec3(0.30, 0.075, 0.045), vec3(0.67, 0.22, 0.10), marble);
      float seam = 1.0 - smoothstep(0.015, 0.085, abs(marble - 0.49));
      color = mix(color, vec3(0.82, 0.56, 0.36), seam * 0.55);
      if (kind == 22) color = mix(vec3(0.26, 0.39, 0.18), vec3(0.80, 0.47, 0.36), smoothstep(0.35, 0.59, marble));
      result.color = mineralLinear(color);
      result.roughness = 0.9 + grain * 0.25;
    } else if (kind == 5) {
      vec3 cells = mineralCells(p.xy * 0.43 + p.z * 0.09 + vec2(cloud, mineralFbm(p.yzx)) * 1.6);
      float vein = 1.0 - smoothstep(0.016, 0.085, cells.y);
      float oxide = smoothstep(0.62, 0.76, mineralFbm(p * 1.4));
      vec3 color = mix(vec3(0.58, 0.22, 0.31), vec3(0.90, 0.51, 0.58), cloud);
      color = mix(color, vec3(0.055, 0.045, 0.055), max(vein * 0.92, oxide));
      result.color = mineralLinear(color);
      result.roughness = 0.85 + vein * 0.3;
    } else if (kind == 6 || kind == 7 || kind == 14) {
      vec3 color = kind == 7 ? vec3(0.34, 0.36, 0.38) : vec3(0.025, 0.030, 0.035);
      if (kind == 14) {
        float band = pow(0.5 + 0.5 * sin(p.y * 3.2 + cloud * 3.0), 22.0);
        color += vec3(0.055) * band;
      }
      result.color = mineralLinear(color * (0.85 + 0.20 * cloud));
      result.metallic = kind == 7 ? 0.94 : 0.0;
      result.roughness = 0.9 + grain * 0.12;
    } else if (kind == 8) {
      // Parallel crocidolite fibres and a view-dependent silky light band.
      float fibre = mineralFbm(vec3(p.x * 14.0, p.y * 0.34, p.z * 5.0));
      float broad = 0.5 + 0.5 * sin(p.x * 2.1 + cloud * 3.2);
      float silk = pow(0.5 + 0.5 * sin(p.x * 83.0 + cloud * 9.0), 2.0);
      vec3 color = mix(vec3(0.15, 0.075, 0.025), vec3(0.69, 0.43, 0.105), broad * 0.68 + fibre * 0.32);
      float chatoyance = exp(-pow((p.x - viewDirection.x * 3.8 - 0.7) * 0.85, 2.0));
      color += vec3(0.34, 0.24, 0.08) * chatoyance * (0.55 + silk * 0.45);
      result.color = mineralLinear(color);
      result.roughness = 0.7 + fibre * 0.35;
      result.subsurface = vec3(0.014, 0.008, 0.002) * chatoyance;
    } else if (kind == 9) {
      vec3 cells = mineralCells(p.xy * 2.3 + p.z * 0.35 + cloud * 0.35);
      float angle = viewDirection.x * 0.19 + viewDirection.y * 0.13;
      float fire = pow(0.5 + 0.5 * sin(cells.z * 32.0 + angle * 32.0), 4.0);
      fire *= smoothstep(0.025, 0.10, cells.y) * 0.43;
      vec3 body = mix(vec3(0.77, 0.83, 0.80), vec3(0.94, 0.91, 0.82), cloud);
      vec3 play = mineralSpectrum(cells.z + angle);
      result.color = mineralLinear(mix(body, 0.30 + play * 0.70, fire));
      result.subsurface = mineralLinear(play) * fire * 0.025;
      result.roughness = 0.8 + cloud * 0.25;
    } else if (kind == 10) {
      float sheen = exp(-pow((p.x - viewDirection.x * 4.0) * 0.40, 2.0));
      vec3 body = mix(vec3(0.57, 0.63, 0.70), vec3(0.83, 0.84, 0.80), cloud);
      result.color = mineralLinear(mix(body, vec3(0.49, 0.68, 0.91), sheen * 0.36));
      result.subsurface = vec3(0.006, 0.014, 0.029) * sheen;
      result.roughness = 0.9 + cloud * 0.2;
    } else if (kind == 11) {
      float lamella = mineralFbm(p * 0.54 + vec3(p.y * 0.37, 0.0, 0.0));
      float angle = viewDirection.x * 1.5 + viewDirection.y * 0.9;
      float flash = pow(0.5 + 0.5 * sin(lamella * 17.0 + angle * 6.0), 3.0);
      vec3 play = mix(vec3(0.07, 0.40, 0.76), vec3(0.10, 0.73, 0.56), smoothstep(0.32, 0.65, lamella));
      play = mix(play, vec3(0.71, 0.57, 0.17), smoothstep(0.62, 0.78, lamella));
      vec3 body = mix(vec3(0.14, 0.18, 0.19), vec3(0.27, 0.31, 0.29), cloud);
      result.color = mineralLinear(mix(body, play, flash * 0.85));
      result.subsurface = mineralLinear(play) * flash * 0.027;
      result.roughness = 0.8 + cloud * 0.3;
    } else if (kind == 12) {
      float orient = viewDirection.x * 0.5 + viewDirection.y * 0.3;
      vec3 nacre = mix(vec3(0.80, 0.85, 0.88), vec3(0.96, 0.88, 0.77), 0.5 + orient);
      result.color = mineralLinear(nacre * (0.97 + cloud * 0.04));
      result.roughness = 0.93 + grain * 0.10;
    } else if (kind == 13 || kind == 20) {
      vec3 cells = mineralCells(p.xy * 0.15 + p.z * 0.04 + vec2(cloud * 0.15));
      float rings = cells.x * 60.0 + mineralFbm(p * 1.6) * 1.4;
      float bands = 0.5 + 0.5 * sin(rings);
      vec3 dark = kind == 20 ? vec3(0.69, 0.20, 0.32) : vec3(0.31, 0.17, 0.08);
      vec3 light = kind == 20 ? vec3(0.96, 0.69, 0.70) : vec3(0.82, 0.64, 0.37);
      vec3 color = mix(dark, light, bands);
      color = mix(color, vec3(0.91, 0.88, 0.80), pow(0.5 + 0.5 * sin(rings * 1.8), 24.0) * 0.75);
      result.color = mineralLinear(color);
    } else if (kind == 15 || kind == 16 || kind == 18 || kind == 24) {
      vec3 dark = kind == 18 ? vec3(0.17, 0.50, 0.47) : kind == 24 ? vec3(0.20, 0.53, 0.28) : vec3(0.09, 0.30, 0.17);
      vec3 light = kind == 18 ? vec3(0.50, 0.77, 0.68) : kind == 24 ? vec3(0.53, 0.81, 0.47) : vec3(0.43, 0.68, 0.39);
      vec3 color = mix(dark, light, cloud);
      float streak = pow(0.5 + 0.5 * sin(p.y * 5.0 + cloud * 12.0), 16.0);
      if (kind == 18) color = mix(color, vec3(0.85, 0.87, 0.76), streak * 0.45);
      float fleck = kind == 16 ? mineralPyrite(p * 0.8, 0.975) : 0.0;
      color = mix(color, vec3(0.77, 0.78, 0.47), fleck * 0.65);
      result.color = mineralLinear(color);
      result.metallic = fleck * 0.4;
      result.roughness = 0.9 + cloud * 0.2;
    } else if (kind == 17) {
      float fleck = mineralPyrite(p * 0.8, 0.92);
      vec3 body = mix(vec3(0.61, 0.28, 0.14), vec3(0.94, 0.61, 0.33), cloud);
      result.color = mineralLinear(mix(body, vec3(0.96, 0.73, 0.43), fleck));
      result.metallic = fleck * 0.75;
      result.roughness = mix(1.0, 0.45, fleck);
    } else if (kind == 23) {
      // Dense red coral has an organic, subtly striated body rather than fire.
      float fibre = mineralFbm(vec3(p.x * 4.2, p.y * 0.55, p.z * 4.2));
      vec3 body = mix(vec3(0.65, 0.18, 0.12), vec3(0.88, 0.37, 0.26), cloud * 0.8 + fibre * 0.2);
      result.color = mineralLinear(body);
      result.roughness = 0.95 + grain * 0.12;
    }
    return result;
  }
`;

function configureFinish(material, key) {
  const pattern = patternKey(key);
  const stone = STONES[key] || {};
  material.color.set(stone.color || '#53776b');
  material.roughness = 0.17;
  material.metalness = 0;
  material.clearcoat = 0.85;
  material.clearcoatRoughness = 0.10;
  material.ior = Math.min(stone.ior || 1.57, 2.333);
  material.iridescence = 0;
  material.sheen = 0;
  material.specularIntensity = 1;
  material.iridescenceIOR = 1.32;
  material.iridescenceThicknessRange = [180, 380];
  if (pattern === 'obsidian' || pattern === 'onyx') {
    material.roughness = 0.075;
    material.clearcoatRoughness = 0.055;
  } else if (pattern === 'hematite') {
    material.metalness = 0.94;
    material.roughness = 0.16;
    material.clearcoat = 0.35;
  } else if (pattern === 'turquoise') {
    material.roughness = 0.22;
    material.clearcoat = 0.48;
  } else if (pattern === 'tiger_eye') {
    material.roughness = 0.16;
    material.clearcoatRoughness = 0.08;
  } else if (['opal', 'labradorite', 'moonstone', 'pearl'].includes(pattern)) {
    material.iridescence = {opal:0.26, labradorite:0.32, moonstone:0.13, pearl:0.32}[pattern];
    material.roughness = pattern === 'pearl' ? 0.25 : 0.15;
    material.clearcoatRoughness = pattern === 'pearl' ? 0.19 : 0.10;
    if (pattern === 'pearl') {
      material.sheen = 0.38;
      material.sheenRoughness = 0.42;
      material.sheenColor.set('#dae5f4');
    }
  }
  // Toggles such as iridescence/sheen are shader defines in MeshPhysicalMaterial.
  material.needsUpdate = true;
}

export function createMineralMaterial(geometry, stoneKey = 'emerald', envMap = null) {
  const family = mineralFamily(stoneKey);
  if (family === 'crystal') {
    const material = createGemMaterial(geometry, stoneKey, envMap);
    material.userData.isMineralMaterial = true;
    material.userData.mineralKind = 'crystal';
    return material;
  }
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const uniforms = {
    uMineralPattern: {value: PATTERNS[patternKey(stoneKey)] || 0},
    uMineralScale: {value: Math.max(size.x, size.y, size.z, 0.001)},
    uMineralOrigin: {value: geometry.boundingBox.getCenter(new THREE.Vector3())},
    uMineralBase: {value: new THREE.Color()},
  };
  const material = new THREE.MeshPhysicalMaterial({
    name: STONES[stoneKey]?.name || stoneKey,
    envMapIntensity: 1.0,
    side: THREE.FrontSide,
    flatShading: false,
  });
  material.userData = {isMineralMaterial:true, stoneKey, mineralKind:'mineral', pattern:patternKey(stoneKey)};
  stateByMaterial.set(material, {uniforms});
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vMineralPosition;\nvarying vec3 vMineralLocalView;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vMineralPosition = position;
        vMineralLocalView = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz - position;
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${parametersGLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        MineralSurface mineral = mineralSurface((vMineralPosition - uMineralOrigin) / uMineralScale * 10.0, normalize(vMineralLocalView));
        diffuseColor.rgb = mineral.color;
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * mineral.roughness, 0.04, 1.0);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\nmetalnessFactor = max(metalnessFactor, mineral.metallic);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += mineral.subsurface;`);
  };
  material.customProgramCacheKey = () => 'emera-geological-minerals-v1';
  updateMineralMaterial(material, stoneKey);
  return material;
}

/** Returns false when a family change requires createMineralMaterial(). */
export function updateMineralMaterial(material, stoneKey, envMap) {
  const family = mineralFamily(stoneKey);
  if (material?.userData.isGemMaterial) {
    if (family !== 'crystal') return false;
    updateGemMaterial(material, stoneKey, envMap);
    material.userData.isMineralMaterial = true;
    material.userData.mineralKind = 'crystal';
    material.name = STONES[stoneKey]?.name || stoneKey;
    return true;
  }
  const internal = stateByMaterial.get(material);
  if (!internal || family !== 'mineral') return false;
  configureFinish(material, stoneKey);
  internal.uniforms.uMineralPattern.value = PATTERNS[patternKey(stoneKey)] || 0;
  internal.uniforms.uMineralBase.value.copy(material.color);
  material.userData.stoneKey = stoneKey;
  material.userData.mineralKind = 'mineral';
  material.userData.pattern = patternKey(stoneKey);
  material.name = STONES[stoneKey]?.name || stoneKey;
  return true;
}
