import * as THREE from 'three';
import { MeshBVH, MeshBVHUniformStruct, BVHShaderGLSL, SAH } from 'three-mesh-bvh';
import { STONES } from './config.js';

// Absorption coefficients are in inverse millimetres. Colour comes from the
// optical distance travelled inside the stone, rather than a painted surface.
const OPTICS = {
  emerald: { absorption: [0.64, 0.07, 0.19], dispersion: 0.008, inclusion: 0.035 },
  sapphire: { absorption: [0.59, 0.29, 0.025], dispersion: 0.014, inclusion: 0.009 },
  ruby: { absorption: [0.025, 0.67, 0.37], dispersion: 0.014, inclusion: 0.015 },
  diamond: { absorption: [0.0012, 0.0007, 0.0003], dispersion: 0.044, inclusion: 0 },
  amethyst: { absorption: [0.19, 0.49, 0.075], dispersion: 0.010, inclusion: 0.01 },
  aquamarine: { absorption: [0.17, 0.023, 0.012], dispersion: 0.007, inclusion: 0.006 },
  quartz: { absorption: [0.003, 0.002, 0.001], dispersion: 0.009, inclusion: 0.018 },
  rock_crystal: { absorption: [0.003, 0.002, 0.001], dispersion: 0.009, inclusion: 0.018 },
  rose_quartz: { absorption: [0.018, 0.10, 0.075], dispersion: 0.008, inclusion: 0.045 },
  smoky_quartz: { absorption: [0.13, 0.18, 0.24], dispersion: 0.008, inclusion: 0.012 },
  citrine: { absorption: [0.014, 0.11, 0.51], dispersion: 0.010, inclusion: 0.012 },
  peridot: { absorption: [0.15, 0.025, 0.47], dispersion: 0.020, inclusion: 0.015 },
  tanzanite: { absorption: [0.32, 0.43, 0.025], dispersion: 0.018, inclusion: 0.005 },
  spinel: { absorption: [0.035, 0.44, 0.27], dispersion: 0.020, inclusion: 0.007 },
  garnet: { absorption: [0.075, 0.67, 0.57], dispersion: 0.025, inclusion: 0.018 },
  topaz: { absorption: [0.23, 0.055, 0.012], dispersion: 0.014, inclusion: 0.004 },
  blue_topaz: { absorption: [0.23, 0.055, 0.012], dispersion: 0.014, inclusion: 0.004 },
  imperial_topaz: { absorption: [0.015, 0.18, 0.45], dispersion: 0.014, inclusion: 0.006 },
  tourmaline: { absorption: [0.25, 0.035, 0.14], dispersion: 0.017, inclusion: 0.021 },
  morganite: { absorption: [0.012, 0.087, 0.10], dispersion: 0.014, inclusion: 0.004 },
  zircon: { absorption: [0.15, 0.032, 0.009], dispersion: 0.038, inclusion: 0.003 },
  alexandrite: { absorption: [0.25, 0.09, 0.16], dispersion: 0.015, inclusion: 0.007 },
  rubellite: { absorption: [0.035, 0.49, 0.23], dispersion: 0.017, inclusion: 0.018 },
  kunzite: { absorption: [0.055, 0.16, 0.025], dispersion: 0.015, inclusion: 0.008 },
  apatite: { absorption: [0.36, 0.055, 0.018], dispersion: 0.015, inclusion: 0.023 },
  fluorite: { absorption: [0.13, 0.28, 0.035], dispersion: 0.009, inclusion: 0.028 },
  amber: { absorption: [0.015, 0.17, 0.63], dispersion: 0.010, inclusion: 0.055 },
  tsavorite: { absorption: [0.49, 0.040, 0.32], dispersion: 0.028, inclusion: 0.008 },
  demantoid: { absorption: [0.21, 0.023, 0.34], dispersion: 0.055, inclusion: 0.010 },
  iolite: { absorption: [0.29, 0.34, 0.045], dispersion: 0.012, inclusion: 0.010 },
  prasiolite: { absorption: [0.10, 0.018, 0.09], dispersion: 0.010, inclusion: 0.008 },
  ametrine: { absorption: [0.14, 0.20, 0.08], dispersion: 0.010, inclusion: 0.009 },
};

function opticalProperties(stoneKey, stone) {
  if (Array.isArray(stone.absorption)) return {
    absorption: stone.absorption,
    dispersion: stone.dispersion ?? 0.012,
    inclusion: stone.inclusion ?? 0.012,
  };
  const opticalKey = {rosequartz:'rose_quartz', smokyquartz:'smoky_quartz'}[stoneKey] || stoneKey;
  if (OPTICS[opticalKey]) return OPTICS[opticalKey];
  // Unknown transparent catalog entries retain their intended hue and never
  // silently turn emerald. Convert the swatch to a moderate 5 mm transmittance.
  const tint = new THREE.Color(stone.color || '#edf3f8');
  const maximum = Math.max(tint.r, tint.g, tint.b, 0.001);
  return {
    absorption: [tint.r, tint.g, tint.b].map(channel => -Math.log(0.12 + 0.76 * channel / maximum) / 5),
    dispersion: stone.dispersion ?? 0.012,
    inclusion: stone.inclusion ?? 0.012,
  };
}

const vertexShader = /* glsl */ `
  varying vec3 vLocalPosition;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  uniform mat3 uWorldNormalMatrix;

  void main() {
    vLocalPosition = position;
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vWorldNormal = normalize(uWorldNormalMatrix * normal);
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPosition, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp usampler2D;

  ${BVHShaderGLSL.common_functions}
  ${BVHShaderGLSL.bvh_struct_definitions}
  ${BVHShaderGLSL.bvh_ray_functions}

  uniform BVH bvh;
  uniform samplerCube uEnvironment;
  uniform bool uHasEnvironment;
  uniform float uEnvironmentFlip;
  uniform float uEnvironmentIntensity;
  uniform mat4 uLocalToWorld;
  uniform mat4 uWorldToLocal;
  uniform mat3 uWorldNormalMatrix;
  uniform vec3 uAbsorption;
  uniform float uIor;
  uniform float uDispersion;
  uniform float uInclusion;
  uniform float uRayEpsilon;

  varying vec3 vLocalPosition;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  // Full unpolarised dielectric Fresnel; the critical angle is essential for
  // the pavilion facets to behave as mirrors through total internal reflection.
  float dielectricFresnel(float cosine, float eta) {
    float c = clamp(abs(cosine), 0.0, 1.0);
    float sinTransmission2 = eta * eta * (1.0 - c * c);
    if (sinTransmission2 >= 1.0) return 1.0;
    float ct = sqrt(max(0.0, 1.0 - sinTransmission2));
    float rs = (eta * c - ct) / max(eta * c + ct, 0.00001);
    float rp = (eta * ct - c) / max(eta * ct + c, 0.00001);
    return 0.5 * (rs * rs + rp * rp);
  }

  vec3 environment(vec3 direction) {
    vec3 d = normalize(direction);
    if (uHasEnvironment) {
      // Derivatives are undefined after divergent BVH traversal. An explicit
      // near-zero mip prevents sparkly artefacts along reflected facet edges.
      return max(textureLod(uEnvironment, vec3(uEnvironmentFlip * d.x, d.yz), 0.35).rgb, vec3(0.0))
        * uEnvironmentIntensity;
    }
    // A graceful fallback while the real photographic studio is preparing.
    vec3 light = vec3(0.24 + 0.27 * max(d.y, 0.0));
    float softbox = pow(max(dot(d, normalize(vec3(-0.7, 0.8, 0.4))), 0.0), 24.0);
    float strip = pow(max(dot(d, normalize(vec3(0.9, 0.3, -0.3))), 0.0), 56.0);
    return (light + vec3(3.5) * softbox + vec3(2.0) * strip) * uEnvironmentIntensity;
  }

  vec3 localDirection(vec3 worldDirection) {
    return normalize((uWorldToLocal * vec4(worldDirection, 0.0)).xyz);
  }

  // Trace the transmitted branch at every encounter and keep the reflected
  // branch alive. This sums six real internal reflections without random noise.
  vec3 traceCrystal(vec3 incident, vec3 surfaceNormal, float ior) {
    float entryFresnel = dielectricFresnel(-dot(incident, surfaceNormal), 1.0 / ior);
    vec3 colour = environment(reflect(incident, surfaceNormal)) * entryFresnel;
    vec3 throughput = vec3(1.0 - entryFresnel);
    vec3 worldRay = normalize(refract(incident, surfaceNormal, 1.0 / ior));
    vec3 localRay = localDirection(worldRay);
    vec3 origin = vLocalPosition + localRay * uRayEpsilon;

    for (int bounce = 0; bounce < INTERNAL_BOUNCES; bounce++) {
      uvec4 faceIndices = uvec4(0u);
      vec3 localNormal = vec3(0.0);
      vec3 barycoord = vec3(0.0);
      float side = 1.0;
      float distance = 0.0;
      bool hit = bvhIntersectFirstHit(bvh, origin, localRay, faceIndices, localNormal, barycoord, side, distance);

      if (!hit) {
        colour += throughput * environment(worldRay);
        throughput = vec3(0.0);
        break;
      }

      vec3 hitPoint = origin + localRay * distance;
      float worldDistance = length((uLocalToWorld * vec4(localRay * distance, 0.0)).xyz);
      throughput *= exp(-uAbsorption * worldDistance);

      // Very restrained jardin variation. It is fixed in the crystal, so it
      // neither flickers nor sticks to the camera during close inspection.
      float jardin = sin(dot(hitPoint, vec3(2.6, 0.8, 1.7)))
        * sin(dot(hitPoint, vec3(-0.7, 3.1, 0.9)));
      throughput *= 1.0 - uInclusion * pow(max(jardin, 0.0), 12.0);

      vec3 worldNormal = normalize(uWorldNormalMatrix * localNormal);
      if (dot(worldNormal, worldRay) > 0.0) worldNormal *= -1.0;
      float fresnel = dielectricFresnel(-dot(worldRay, worldNormal), ior);
      vec3 escapedRay = refract(worldRay, worldNormal, ior);

      if (dot(escapedRay, escapedRay) > 0.001) {
        colour += throughput * (1.0 - fresnel) * environment(escapedRay);
      }

      throughput *= fresnel;
      if (max(throughput.r, max(throughput.g, throughput.b)) < 0.002) {
        throughput = vec3(0.0);
        break;
      }
      worldRay = normalize(reflect(worldRay, worldNormal));
      localRay = localDirection(worldRay);
      origin = hitPoint + localRay * uRayEpsilon;
    }

    // A bounded residual avoids artificially black facets at the bounce limit;
    // absorption and Fresnel have already attenuated this remaining energy.
    colour += throughput * environment(worldRay) * 0.3;
    return colour;
  }

  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 incident = normalize(vWorldPosition - cameraPosition);
    if (dot(normal, incident) > 0.0) normal = -normal;

    // Cauchy-like RGB dispersion: independent geometric paths give diamonds
    // restrained, spatially correct fire rather than a rainbow overlay.
    vec3 green = traceCrystal(incident, normal, uIor);
    vec3 colour;
    if (uDispersion > 0.02) {
      vec3 red = traceCrystal(incident, normal, uIor - uDispersion * 0.45);
      vec3 blue = traceCrystal(incident, normal, uIor + uDispersion * 0.55);
      colour = vec3(red.r, green.g, blue.b);
    } else {
      colour = green;
    }

    gl_FragColor = vec4(colour, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** A closed, outward-wound faceted BufferGeometry in millimetres is required. */
export function createGemMaterial(geometry, stoneKey = 'emerald', envMap = null) {
  // Keep the render geometry and its triangle order untouched. BVH packing owns
  // a small private clone, also avoiding multiple roots from material groups.
  const traceGeometry = geometry.clone();
  traceGeometry.clearGroups();
  traceGeometry.computeBoundingBox();
  const diagonal = traceGeometry.boundingBox.getSize(new THREE.Vector3()).length();
  const tree = new MeshBVH(traceGeometry, { strategy: SAH, targetLeafSize: 3, maxDepth: 24 });
  const bvh = new MeshBVHUniformStruct();
  bvh.updateFrom(tree);

  const material = new THREE.ShaderMaterial({
    name: 'Atelier — traced optical crystal',
    defines: { BVH_STACK_DEPTH: 48, INTERNAL_BOUNCES: 6 },
    uniforms: {
      bvh: { value: bvh },
      uEnvironment: { value: envMap },
      uHasEnvironment: { value: !!envMap },
      uEnvironmentFlip: { value: envMap?.isRenderTargetTexture ? 1 : -1 },
      uEnvironmentIntensity: { value: 1 },
      uLocalToWorld: { value: new THREE.Matrix4() },
      uWorldToLocal: { value: new THREE.Matrix4() },
      uWorldNormalMatrix: { value: new THREE.Matrix3() },
      uAbsorption: { value: new THREE.Vector3() },
      uIor: { value: 1.577 },
      uDispersion: { value: 0.008 },
      uInclusion: { value: 0.035 },
      uRayEpsilon: { value: Math.max(diagonal * 0.00002, 0.00001) },
    },
    vertexShader,
    fragmentShader,
    side: THREE.FrontSide,
    depthWrite: true,
    depthTest: true,
    transparent: false,
    toneMapped: true,
  });

  material.userData.isGemMaterial = true;
  material.userData.stoneKey = stoneKey;
  material.onBeforeRender = (_renderer, _scene, _camera, _geometry, object) => {
    updateGemTransforms(object, material);
  };
  material.addEventListener('dispose', () => {
    bvh.dispose();
    traceGeometry.dispose();
  });
  updateGemMaterial(material, stoneKey);
  return material;
}

export function updateGemMaterial(material, stoneKey, envMap) {
  if (!material?.userData.isGemMaterial) return;
  const key = stoneKey;
  const stone = STONES[key] || {color:'#edf3f8', ior:1.54};
  const optics = opticalProperties(key, stone);
  material.uniforms.uIor.value = stone.ior || 1.54;
  material.uniforms.uAbsorption.value.fromArray(optics.absorption);
  material.uniforms.uDispersion.value = optics.dispersion;
  material.uniforms.uInclusion.value = optics.inclusion;
  material.userData.stoneKey = key;
  if (envMap !== undefined) {
    material.uniforms.uEnvironment.value = envMap;
    material.uniforms.uHasEnvironment.value = !!envMap;
    material.uniforms.uEnvironmentFlip.value = envMap?.isRenderTargetTexture ? 1 : -1;
  }
  material.uniformsNeedUpdate = true;
}

/** Called automatically per draw, including when two earrings share material. */
export function updateGemTransforms(mesh, material = mesh.material) {
  if (Array.isArray(material)) {
    material.forEach((entry) => updateGemTransforms(mesh, entry));
    return;
  }
  if (!material?.userData.isGemMaterial) return;
  material.uniforms.uLocalToWorld.value.copy(mesh.matrixWorld);
  material.uniforms.uWorldToLocal.value.copy(mesh.matrixWorld).invert();
  material.uniforms.uWorldNormalMatrix.value.getNormalMatrix(mesh.matrixWorld);
  material.uniformsNeedUpdate = true;
}
