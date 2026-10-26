import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildGemGeometry, createJewelry } from '../src/jewelry.js';
import { DEFAULT_STATE } from '../src/config.js';

const vector = (positions, index) => new THREE.Vector3().fromBufferAttribute(positions, index);
const key = p => p.toArray().map(n => n.toFixed(5)).join(',');
const cuts = ['emerald', 'round', 'oval', 'cushion', 'cabochon', 'rough'];
const sizes = [7, 10, 14];
const materials = {
  metalMaterial: new THREE.MeshStandardMaterial(),
  accentMaterial: new THREE.MeshPhysicalMaterial(),
  gemMaterialFactory: () => new THREE.MeshPhysicalMaterial(),
};

let gems = 0;
for (const cut of cuts) for (const length of sizes) {
  const geometry = buildGemGeometry(cut, length);
  const positions = geometry.attributes.position;
  const uniqueVertices = [...new Map(Array.from({ length: positions.count }, (_, i) => {
    const point = vector(positions, i); return [key(point), point];
  })).values()];
  const edges = new Map();
  let volume = 0;
  for (let i = 0; i < positions.count; i += 3) {
    const a = vector(positions, i), b = vector(positions, i + 1), c = vector(positions, i + 2);
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    assert(normal.length() > 1e-8, `${cut}/${length}: non-degenerate facet`);
    volume += a.dot(b.clone().cross(c)) / 6;
    for (const [from, to] of [[a, b], [b, c], [c, a]]) {
      const edge = [key(from), key(to)].sort().join('|');
      edges.set(edge, (edges.get(edge) || 0) + 1);
    }
    for (const point of uniqueVertices) {
      assert(normal.dot(point.clone().sub(a)) < 1e-3, `${cut}/${length}: convex, outward facet`);
    }
  }
  assert(volume > 0, `${cut}/${length}: outward winding`);
  assert([...edges.values()].every(count => count === 2), `${cut}/${length}: closed two-manifold mesh`);
  if (cut === 'rough') {
    assert.equal(geometry.userData.rough, true);
    assert(positions.count / 3 >= 400 && positions.count / 3 <= 800);
    assert(Math.abs(geometry.boundingBox.min.z + .18 * length) < 1e-5);
    assert(Math.abs(geometry.boundingBox.max.z - .30 * length) < 1e-5);
    const repeated = buildGemGeometry(cut, length);
    assert.deepEqual(positions.array, repeated.attributes.position.array, 'Rough shape is deterministic');
    repeated.dispose();
    const normals = geometry.attributes.normal;
    for (let i = 0; i < normals.count; i += 3) {
      const a = vector(normals, i), b = vector(normals, i + 1), c = vector(normals, i + 2);
      assert(a.distanceTo(b) < 1e-6 && a.distanceTo(c) < 1e-6, 'Rough fragment retains angular surface normals');
    }
  }
  if (cut === 'cabochon') {
    assert.equal(geometry.userData.faceted, false);
    assert.equal(positions.count / 3, 1920);
    assert(Math.abs(geometry.boundingBox.min.z + .08 * length) < 1e-5);
    assert(Math.abs(geometry.boundingBox.max.z - .28 * length) < 1e-5);
    const normalByPoint = new Map();
    const normals = geometry.attributes.normal;
    for (let i = 0; i < positions.count; i++) {
      const point = vector(positions, i), normal = vector(normals, i);
      assert(Math.abs(normal.length() - 1) < 1e-5, 'Cabochon unit surface normal');
      if (point.z <= -.079 * length) continue; // The base intentionally has a hard edge.
      const previous = normalByPoint.get(key(point));
      if (previous) assert(previous.distanceTo(normal) < 1e-6, 'Cabochon smoothly shared dome normals');
      normalByPoint.set(key(point), normal);
    }
  }
  gems++;
  geometry.dispose();
}

let assemblies = 0, contactingClaws = 0;
for (const cut of cuts) for (const size of sizes) for (const setting of ['prong', 'bezel', 'halo']) {
  const jewelry = createJewelry({ ...DEFAULT_STATE, cut, size, setting }, materials);
  const gemstone = jewelry.children.find(child => child.userData.role === 'main-gem');
  const positions = gemstone.geometry.attributes.position;
  const planes = [];
  for (let i = 0; i < positions.count; i += 3) {
    planes.push(new THREE.Plane().setFromCoplanarPoints(vector(positions, i), vector(positions, i + 1), vector(positions, i + 2)));
  }
  jewelry.traverse(object => {
    if (!object.isMesh) return;
    assert([...object.geometry.attributes.position.array].every(Number.isFinite), `${cut}/${size}/${setting}: finite mesh`);
    if (object.name === 'Individually fitted fragment bezel') {
      const index = object.geometry.index.array, edges = new Map();
      for (let i = 0; i < index.length; i += 3) for (const [a, b] of [[index[i], index[i + 1]], [index[i + 1], index[i + 2]], [index[i + 2], index[i]]]) {
        const edge = [a, b].sort((a, b) => a - b).join(',');
        edges.set(edge, (edges.get(edge) || 0) + 1);
      }
      assert([...edges.values()].every(count => count === 2), 'Fitted fragment bezel is closed');
    }
    if (object.name === 'Fragment contour burnished lip') {
      const vertices = object.geometry.attributes.position;
      let contact = false;
      for (let i = 0; i < vertices.count && !contact; i++) {
        const point = vector(vertices, i);
        contact = planes.every(plane => plane.distanceToPoint(point) < 1e-5);
      }
      assert(contact, 'Fitted fragment bezel lip contacts the actual irregular stone');
    }
    if (object.name === 'Rounded claw tip') {
      object.updateMatrix();
      const tipVertices = object.geometry.attributes.position;
      let inside = 0, outside = 0;
      for (let i = 0; i < tipVertices.count; i++) {
        const point = vector(tipVertices, i).applyMatrix4(object.matrix);
        if (planes.every(plane => plane.distanceToPoint(point) < 1e-5)) inside++; else outside++;
      }
      assert(inside > 0 && outside > 0, `${cut}/${size}/${setting}: claw physically contacts crown`);
      contactingClaws++;
    }
  });
  assert(jewelry.userData.dimensions.width > size * .7);
  assert(jewelry.userData.dimensions.height > size + 10);
  assemblies++;
  jewelry.traverse(object => { object.geometry?.dispose(); });
}

console.log(`PASS: ${gems} closed convex gemstones, ${assemblies} finite assemblies, ${contactingClaws} physically contacting claw tips.`);
