import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

// All dimensions are millimetres. Each stone's table or polished dome faces +Z.
const TAU = Math.PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function outline(cut, width, length, count = 64) {
  if (cut === 'emerald') {
    const x = width / 2, y = length / 2, c = width * .145;
    return [[x - c, y], [-x + c, y], [-x, y - c], [-x, -y + c],
      [-x + c, -y], [x - c, -y], [x, -y + c], [x, y - c]];
  }
  return Array.from({ length: count }, (_, i) => {
    const a = i / count * TAU;
    if (cut === 'cushion') {
      const p = .60;
      return [Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** p * width / 2,
        Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** p * length / 2];
    }
    return [Math.cos(a) * width / 2, Math.sin(a) * length / 2];
  });
}

export function gemDimensions(cut, length) {
  return { width: length * ({ emerald: .75, oval: .73, round: 1, cushion: .90, cabochon: .75, rough: .78 }[cut] ?? .75), length };
}

function buildRoughGeometry(length, width) {
  let seed = 0x7a11ce;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const count = 650, points = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  // Uneven Fibonacci samples avoid the concentric rings and symmetry of a cut
  // jewel. A fixed seed keeps the same fragment through material/size changes.
  for (let i = 0; i < count; i++) {
    const z = 1 - 2 * (i + .5) / count;
    const theta = i * goldenAngle;
    const r = Math.sqrt(1 - z * z);
    const irregularity = 1 + .035 * Math.sin(theta * 3 + .8) * r * r
      + .018 * Math.cos(theta * 5 - z * 2) + (random() - .5) * .05;
    points.push(V(r * Math.cos(theta) * irregularity,
      r * Math.sin(theta) * irregularity, z * irregularity));
  }
  const geometry = new ConvexGeometry(points);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox, span = bounds.getSize(V());
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const point = V().fromBufferAttribute(positions, i);
    positions.setXYZ(i, ((point.x - bounds.min.x) / span.x - .5) * width,
      ((point.y - bounds.min.y) / span.y - .5) * length,
      ((point.z - bounds.min.z) / span.z * .48 - .18) * length);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = { cut: 'rough', length, width, faceted: true, rough: true, polished: false, closed: true, seed: 0x7a11ce };
  return geometry;
}

function buildCabochonGeometry(length, width) {
  const sides = 64, domeSteps = 12;
  const rx = width / 2, ry = length / 2, height = length * .28;
  // A rounded girdle meets a genuinely planar bearing surface. The upper
  // ellipsoid is smoothly shaded; sharing normals across its duplicated vertices
  // preserves polish without exposing the triangulation used by the renderer.
  const profile = [[.96, -.08 * length], [.985, -.06 * length], [1, -.02 * length], [1, 0]];
  for (let i = 1; i < domeSteps; i++) {
    const angle = i / domeSteps * Math.PI / 2;
    profile.push([Math.cos(angle), height * Math.sin(angle)]);
  }
  const rings = profile.map(([radius, z], j) => Array.from({ length: sides }, (_, i) => {
    const theta = i / sides * TAU;
    let normal;
    if (j >= 3) {
      normal = V(radius * Math.cos(theta) / rx, radius * Math.sin(theta) / ry, z / (height * height)).normalize();
    } else {
      const previous = profile[Math.max(0, j - 1)], next = profile[j + 1];
      const dr = next[0] - previous[0], dz = next[1] - previous[1];
      normal = V(Math.cos(theta) * dz / rx, Math.sin(theta) * dz / ry, -dr).normalize();
    }
    return { p: [rx * radius * Math.cos(theta), ry * radius * Math.sin(theta), z], n: normal.toArray() };
  }));
  const positions = [], normals = [];
  const tri = (a, b, c, normal = null) => {
    for (const vertex of [a, b, c]) {
      positions.push(...vertex.p);
      normals.push(...(normal || vertex.n));
    }
  };
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    tri(rings[j][i], rings[j][next], rings[j + 1][i]);
    tri(rings[j][next], rings[j + 1][next], rings[j + 1][i]);
  }
  const apex = { p: [0, 0, height], n: [0, 0, 1] };
  const bottom = { p: [0, 0, -.08 * length], n: [0, 0, -1] };
  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    tri(rings.at(-1)[i], rings.at(-1)[next], apex);
    tri(bottom, rings[0][next], rings[0][i], [0, 0, -1]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = { cut: 'cabochon', length, width, faceted: false, polished: true, closed: true };
  return geometry;
}

/** Closed, convex, non-indexed gemstones; cabochons have polished smooth normals. */
export function buildGemGeometry(cut = 'emerald', length = 10, width = gemDimensions(cut, length).width) {
  if (cut === 'rough') return buildRoughGeometry(length, width);
  if (cut === 'cabochon') return buildCabochonGeometry(length, width);
  const emerald = cut === 'emerald';
  const rings = emerald ? [
    [8, .018, -.365], [8, .31, -.292], [8, .60, -.205], [8, .83, -.115],
    [8, 1, -.012], [8, 1, .012], [8, .91, .055], [8, .78, .103], [8, .63, .148],
  ] : [
    [8, .018, -.385], [16, .46, -.226], [32, 1, -.012], [32, 1, .012],
    [16, .81, .085], [8, .55, .165],
  ];
  const vertices = rings.map(([n, s, z]) => outline(cut, width * s, length * s, n)
    .map(([x, y]) => [x, y, z * length]));
  const positions = [];
  const tri = (a, b, c) => positions.push(...a, ...b, ...c);
  for (let r = 0; r < vertices.length - 1; r++) {
    const low = vertices[r], high = vertices[r + 1];
    let a = 0, b = 0;
    // Joining rings of different vertex counts retains the traditional large
    // table, star, kite, and lower-girdle facets of brilliant cuts.
    while (a < low.length || b < high.length) {
      const an = (a + 1) / low.length, bn = (b + 1) / high.length;
      const la = low[a % low.length], hb = high[b % high.length];
      if (Math.abs(an - bn) < 1e-8) {
        const ln = low[(a + 1) % low.length], hn = high[(b + 1) % high.length];
        tri(la, ln, hb); tri(ln, hn, hb); a++; b++;
      } else if (an < bn) {
        tri(la, low[(a + 1) % low.length], hb); a++;
      } else {
        tri(la, high[(b + 1) % high.length], hb); b++;
      }
    }
  }
  const bottom = vertices[0], top = vertices.at(-1);
  for (let i = 0; i < bottom.length; i++) tri([0, 0, bottom[0][2]], bottom[(i + 1) % bottom.length], bottom[i]);
  for (let i = 0; i < top.length; i++) tri([0, 0, top[0][2]], top[i], top[(i + 1) % top.length]);
  // The offset topology of a brilliant cut needs its convex hull: choosing an
  // arbitrary diagonal on a twisted kite can otherwise introduce a tiny inward
  // fold, which is especially visible to internal refraction rays.
  const geometry = emerald ? new THREE.BufferGeometry()
    : new ConvexGeometry(vertices.flat().map(p => new THREE.Vector3(...p)));
  if (emerald) geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = { cut, length, width, faceted: true, closed: true };
  return geometry;
}

function mesh(geometry, material, parent, name = '') {
  const item = new THREE.Mesh(geometry, material);
  item.name = name;
  item.castShadow = true;
  item.receiveShadow = true;
  parent.add(item);
  return item;
}

function roundedPath(points, radius = .12) {
  const path = new THREE.Shape();
  for (let i = 0; i < points.length; i++) {
    const p = new THREE.Vector2(...points[i]);
    const prev = new THREE.Vector2(...points[(i + points.length - 1) % points.length]);
    const next = new THREE.Vector2(...points[(i + 1) % points.length]);
    const before = prev.clone().sub(p).setLength(Math.min(radius, prev.distanceTo(p) * .34)).add(p);
    const after = next.clone().sub(p).setLength(Math.min(radius, next.distanceTo(p) * .34)).add(p);
    if (!i) path.moveTo(before.x, before.y); else path.lineTo(before.x, before.y);
    path.quadraticCurveTo(p.x, p.y, after.x, after.y);
  }
  path.closePath();
  return path;
}

function contourCurve(cut, width, length, z, corner = .15) {
  const path = roundedPath(outline(cut, width, length), corner);
  return new THREE.CatmullRomCurve3(path.getSpacedPoints(192).slice(0, -1).map(p => V(p.x, p.y, z)), true, 'centripetal');
}

function wire(parent, curve, radius, material, segments = 128, radialSegments = 12, name = '') {
  return mesh(new THREE.TubeGeometry(curve, segments, radius, radialSegments, curve.closed ?? false), material, parent, name);
}

function bead(parent, point, radius, material, scale = null, name = '') {
  const result = mesh(new THREE.SphereGeometry(radius, 16, 12), material, parent, name);
  result.position.copy(point);
  if (scale) result.scale.set(...scale);
  return result;
}

function rod(parent, from, to, radius, material, name = '') {
  const delta = to.clone().sub(from);
  const result = mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 16, 1), material, parent, name);
  result.position.copy(from).add(to).multiplyScalar(.5);
  result.quaternion.setFromUnitVectors(V(0, 1, 0), delta.normalize());
  return result;
}

function ovalRing(parent, width, height, radius, material, position, rotation = null, name = '') {
  const curve = new THREE.CatmullRomCurve3(Array.from({ length: 96 }, (_, i) => {
    const t = i / 96 * TAU;
    return V(Math.cos(t) * width / 2, Math.sin(t) * height / 2, 0);
  }), true, 'centripetal');
  const item = wire(parent, curve, radius, material, 128, 16, name);
  item.position.copy(position);
  if (rotation) item.rotation.set(...rotation);
  return item;
}

function crownHeightAt(geometry, x, y) {
  const ray = new THREE.Ray(V(x, y, 100), V(0, 0, -1));
  const positions = geometry.attributes.position;
  const a = V(), b = V(), c = V(), hit = V();
  let z = -Infinity;
  for (let i = 0; i < positions.count; i += 3) {
    a.fromBufferAttribute(positions, i); b.fromBufferAttribute(positions, i + 1); c.fromBufferAttribute(positions, i + 2);
    if (ray.intersectTriangle(a, b, c, false, hit)) z = Math.max(z, hit.z);
  }
  return z;
}

function fragmentSection(geometry, z, samples = 96) {
  const positions = geometry.attributes.position;
  const crossings = new Map();
  for (let i = 0; i < positions.count; i += 3) {
    const triangle = [0, 1, 2].map(offset => V().fromBufferAttribute(positions, i + offset));
    for (let edge = 0; edge < 3; edge++) {
      const a = triangle[edge], b = triangle[(edge + 1) % 3];
      if ((a.z - z) * (b.z - z) > 0 || Math.abs(a.z - b.z) < 1e-10) continue;
      const point = a.clone().lerp(b, (z - a.z) / (b.z - a.z));
      crossings.set(`${point.x.toFixed(6)},${point.y.toFixed(6)}`, point);
    }
  }
  const polygon = [...crossings.values()].sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x));
  return Array.from({ length: samples }, (_, i) => {
    const theta = i / samples * TAU, dx = Math.cos(theta), dy = Math.sin(theta);
    let radius = Infinity;
    for (let j = 0; j < polygon.length; j++) {
      const a = polygon[j], b = polygon[(j + 1) % polygon.length];
      const ex = b.x - a.x, ey = b.y - a.y;
      const denominator = dx * ey - dy * ex;
      if (Math.abs(denominator) < 1e-10) continue;
      const t = (a.x * ey - a.y * ex) / denominator;
      const u = (a.x * dy - a.y * dx) / denominator;
      if (t > 0 && u >= -1e-6 && u <= 1 + 1e-6) radius = Math.min(radius, t);
    }
    return V(dx * radius, dy * radius, z);
  });
}

function roughBezel(parent, geometry, length, material) {
  const count = 96;
  const levels = [-.04, .01, .06, .12].map(z => fragmentSection(geometry, z * length, count));
  const positions = [], indices = [];
  for (const section of levels) for (const offset of [.035, .30]) for (const point of section) {
    const outward = V(point.x, point.y, 0).normalize().multiplyScalar(offset);
    positions.push(point.x + outward.x, point.y + outward.y, point.z);
  }
  const idx = (level, outer, point) => (level * 2 + outer) * count + point % count;
  const quad = (a, b, c, d) => indices.push(a, b, d, b, c, d);
  for (let level = 0; level < levels.length - 1; level++) for (let i = 0; i < count; i++) {
    quad(idx(level, 1, i), idx(level, 1, i + 1), idx(level + 1, 1, i + 1), idx(level + 1, 1, i));
    quad(idx(level, 0, i + 1), idx(level, 0, i), idx(level + 1, 0, i), idx(level + 1, 0, i + 1));
  }
  for (let i = 0; i < count; i++) {
    quad(idx(0, 0, i), idx(0, 0, i + 1), idx(0, 1, i + 1), idx(0, 1, i));
    quad(idx(levels.length - 1, 1, i), idx(levels.length - 1, 1, i + 1), idx(levels.length - 1, 0, i + 1), idx(levels.length - 1, 0, i));
  }
  const band = new THREE.BufferGeometry();
  band.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  band.setIndex(indices);
  band.computeVertexNormals();
  mesh(band, material, parent, 'Individually fitted fragment bezel');
  const lip = levels.at(-1).map(point => point.clone().add(V(point.x, point.y, 0).normalize().multiplyScalar(.09)));
  wire(parent, new THREE.CatmullRomCurve3(lip, true, 'centripetal'), .10, material, 192, 12, 'Fragment contour burnished lip');
  for (let i = count / 8; i < count; i += count / 4) {
    const theta = i / count * TAU;
    const lower = V(Math.cos(theta) * geometry.userData.width * .38, Math.sin(theta) * length * .38, -length * .158);
    const upper = levels[0][i].clone();
    upper.add(V(upper.x, upper.y, 0).normalize().multiplyScalar(.17));
    rod(parent, lower, upper, .13, material, 'Fragment bezel gallery support');
  }
}

function claw(parent, girdlePoint, material, gemGeometry, length, radius = .20) {
  const direction = V(girdlePoint.x, girdlePoint.y, 0).normalize();
  const contact = girdlePoint.clone().multiplyScalar(.90);
  contact.z = crownHeightAt(gemGeometry, contact.x, contact.y);
  const start = V(girdlePoint.x * .76, girdlePoint.y * .76, -length * .158);
  const shoulder = V(girdlePoint.x + direction.x * .17, girdlePoint.y + direction.y * .17, -length * .020);
  const bend = V(girdlePoint.x * .98 + direction.x * .05, girdlePoint.y * .98 + direction.y * .05, contact.z * .65);
  // The rounded cap contacts the actual crown surface at every size and cut.
  const tip = contact.clone();
  tip.z += radius * .50;
  const curve = new THREE.CatmullRomCurve3([start, shoulder, bend, tip], false, 'centripetal');
  const geometry = new THREE.TubeGeometry(curve, 32, radius, 12, false);
  // A taper at the polished tip gives a proper setter's claw, rather than a ball.
  const positions = geometry.attributes.position;
  for (let i = 0; i <= 32; i++) {
    const center = curve.getPointAt(i / 32);
    const taper = 1 - .29 * (i / 32) ** 3;
    for (let j = 0; j <= 12; j++) {
      const idx = i * 13 + j;
      const p = V().fromBufferAttribute(positions, idx).sub(center).multiplyScalar(taper).add(center);
      positions.setXYZ(idx, p.x, p.y, p.z);
    }
  }
  geometry.computeVertexNormals();
  wireCaps(parent, curve, radius, material);
  const result = mesh(geometry, material, parent, 'Tapered polished claw');
  result.userData.contact = contact.toArray();
  result.userData.tip = tip.toArray();
  result.userData.tipRadius = radius * .71 * .8;
}

function wireCaps(parent, curve, radius, material) {
  bead(parent, curve.getPoint(0), radius, material);
  bead(parent, curve.getPoint(1), radius * .71, material, [1, 1, .8], 'Rounded claw tip');
}

function accentDiamond(parent, diameter, position, material, metalMaterial, rotation = null, beads = true) {
  const diamond = mesh(buildGemGeometry('round', diameter), material, parent, 'Pavé brilliant');
  diamond.position.copy(position);
  if (rotation) diamond.rotation.set(...rotation);
  if (beads) {
    const d = diameter * .39;
    for (const sign of [-1, 1]) {
      bead(parent, V(position.x + sign * d, position.y + diameter * .20, position.z + .025), diameter * .10, metalMaterial);
    }
  }
  return diamond;
}

function makeHoop(parent, metal, accent) {
  const hoop = new THREE.Group();
  hoop.name = 'Articulated pavé huggie and ear fastening';
  hoop.userData.role = 'hoop';
  hoop.userData.explode = [0, 5, 0];
  parent.add(hoop);
  const centerY = 9.9, rx = 2.12, ry = 4.42;
  // The flattened inner and outer rails create a thin, polished shank with a
  // well-defined diamond channel. Individual bead settings remain visible close up.
  ovalRing(hoop, rx * 2, ry * 2, .405, metal, V(0, centerY, -.10), null, 'Polished oval huggie');
  for (const side of [-1, 1]) {
    ovalRing(hoop, rx * 2 + side * .49, ry * 2 + side * .49, .105, metal,
      V(0, centerY, .19), null, 'Pavé channel edge');
  }
  const hoopCurve = contourCurve('oval', rx * 2, ry * 2, .36);
  for (let i = 0; i < 25; i++) {
    const point = hoopCurve.getPointAt((i + .5) / 25);
    point.y += centerY;
    accentDiamond(hoop, .61, point, accent, metal, null, false);
    const tangent = hoopCurve.getTangentAt((i + .5) / 25);
    const across = V(tangent.y, -tangent.x, 0);
    for (const side of [-1, 1]) bead(hoop, point.clone().addScaledVector(across, side * .295), .073, metal);
  }
  // A real post, rounded end, retention groove and hinged rear lever are modeled
  // separately. They become legible when the user turns the earring around.
  rod(hoop, V(0, 14.26, -.04), V(0, 14.26, -4.1), .27, metal, 'Ear post, 0.54 mm');
  bead(hoop, V(0, 14.26, -4.1), .27, metal, [1, 1, .8], 'Rounded ear post end');
  const groove = mesh(new THREE.TorusGeometry(.282, .045, 8, 32), metal, hoop, 'Post retention rim');
  groove.position.set(0, 14.26, -3.58);
  const backCurve = new THREE.CatmullRomCurve3([
    V(0, 5.55, -.13), V(0, 6.05, -2.35), V(0, 8.4, -3.75),
    V(0, 11.7, -4.06), V(0, 13.92, -3.72),
  ], false, 'centripetal');
  wire(hoop, backCurve, .29, metal, 64, 16, 'Hinged rear lever');
  ovalRing(hoop, .85, .64, .15, metal, V(0, 14.08, -3.74), [0, Math.PI / 2, 0], 'Post latch');
  rod(hoop, V(-.58, 5.56, -.14), V(.58, 5.56, -.14), .28, metal, 'Clasp hinge barrel');
  for (const side of [-1, 1]) bead(hoop, V(side * .61, 5.56, -.14), .19, metal, [.45, 1, 1], 'Hinge pin');
  return hoop;
}

function makeBasket(parent, cut, width, length, metal, setting, gemGeometry) {
  const basket = new THREE.Group();
  basket.name = 'Open gallery and stone setting';
  basket.userData.role = 'setting';
  basket.userData.explode = [0, 0, -3.7];
  basket.position.y = -4;
  parent.add(basket);
  const seatDepth = -length * .02;
  const galleryDepth = -length * .158;
  const upperCurve = contourCurve(cut, width + .22, length + .22, seatDepth);
  const lowerCurve = contourCurve(cut, width * .76, length * .76, galleryDepth);
  wire(basket, upperCurve, .17, metal, 192, 12, 'Girdle seat');
  wire(basket, lowerCurve, .19, metal, 192, 12, 'Lower open gallery');
  if (cut === 'cabochon') {
    wire(basket, contourCurve(cut, width * .90, length * .90, -length * .08 - .13), .145, metal, 192, 12, 'Cabochon flat-base bearing seat');
  }
  const count = 6;
  for (let i = 0; i < count; i++) {
    const t = (i + .5) / count;
    const upper = upperCurve.getPointAt(t);
    const lower = lowerCurve.getPointAt(t);
    const mid = lower.clone().lerp(upper, .52);
    mid.z -= .15;
    wire(basket, new THREE.CatmullRomCurve3([lower, mid, upper]), .145, metal, 20, 10, 'Open gallery strut');
  }
  if (setting === 'bezel') {
    if (cut === 'rough') {
      roughBezel(basket, gemGeometry, length, metal);
      return basket;
    }
    const shape = roundedPath(outline(cut, width + .48, length + .48), .20);
    const hole = roundedPath(outline(cut, width - .055, length - .055).reverse(), .12);
    shape.holes.push(hole);
    const bezel = new THREE.ExtrudeGeometry(shape, {
      depth: length * .07, bevelEnabled: true, bevelThickness: .055, bevelSize: .055,
      bevelSegments: 3, steps: 1, curveSegments: 12,
    });
    bezel.translate(0, 0, -length * .04);
    mesh(bezel, metal, basket, 'Continuous softly beveled bezel');
    const lipScale = cut === 'cabochon' ? Math.sqrt(1 - (.03 / .28) ** 2) : .962;
    wire(basket, contourCurve(cut, width * lipScale + .18, length * lipScale + .18, length * .03), .10, metal, 192, 12, 'Burnished bezel lip');
  } else {
    const corner = cut === 'emerald'
      ? [width / 2 - width * .145 / 2, length / 2 - width * .145 / 2]
      : outline(cut, width, length, 64)[8];
    for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
      claw(basket, V(corner[0] * sx, corner[1] * sy, 0), metal, gemGeometry, length, setting === 'halo' ? .17 : .20);
    }
  }
  return basket;
}

function makeHalo(basket, cut, width, length, metal, accent) {
  const curve = contourCurve(cut, width + 1.30, length + 1.30, .19, .28);
  wire(basket, curve, .24, metal, 192, 16, 'Diamond halo gallery');
  wire(basket, contourCurve(cut, width + 2.02, length + 2.02, .30, .3), .095, metal, 192, 10, 'Fine halo outer rim');
  const innerCurve = contourCurve(cut, width + .22, length + .22, -length * .02);
  for (let i = 0; i < 8; i++) {
    const t = (i + .5) / 8;
    rod(basket, innerCurve.getPointAt(t), curve.getPointAt(t), .13, metal, 'Halo gallery bridge');
  }
  const count = Math.round(curve.getLength() / .79);
  for (let i = 0; i < count; i++) {
    const point = curve.getPointAt((i + .5) / count);
    point.z = .42;
    accentDiamond(basket, .67, point, accent, metal, null, false);
    const tangent = curve.getTangentAt((i + .5) / count);
    for (const side of [-1, 1]) {
      bead(basket, point.clone().addScaledVector(V(tangent.y, -tangent.x, 0), side * .335), .075, metal);
    }
  }
}

export function createJewelry(state, { metalMaterial, gemMaterialFactory, accentMaterial }) {
  const jewelry = new THREE.Group();
  jewelry.name = 'Émeraude — articulated gemstone earring';
  const length = Number(state.size) || 10;
  const cut = state.cut || 'emerald';
  const { width } = gemDimensions(cut, length);
  const metal = metalMaterial;
  const accent = accentMaterial;
  const hoop = makeHoop(jewelry, metal, accent);
  // The link length follows the gemstone size, so larger stones never collide
  // with the huggie and the bail remains connected to the upper gallery rail.
  const gemTop = -4 + length / 2 + .17;
  const joinTop = Math.max(5.05, gemTop + 1.3);
  const hoopShift = joinTop - 5.05;
  hoop.position.y = hoopShift;
  const linkHeight = Math.max(1.3, joinTop - gemTop);
  const link = new THREE.Group();
  link.name = 'Articulated oval bail';
  link.userData.role = 'link';
  link.userData.explode = [0, 1.5, 0];
  jewelry.add(link);
  ovalRing(link, 1.12, linkHeight, .23, metal,
    V(0, gemTop + linkHeight / 2, -.21), [0, .40, 0], 'Articulated bail');
  // A transverse eye gives the pendant a second, independent articulation axis.
  ovalRing(link, .92, .94, .19, metal, V(0, gemTop + .38, -.50), [0, Math.PI / 2, 0], 'Pendant attachment eye');
  const geometry = buildGemGeometry(cut, length, width);
  const basket = makeBasket(jewelry, cut, width, length, metal, state.setting, geometry);
  if (state.setting === 'halo') makeHalo(basket, cut, width, length, metal, accent);
  const gemstone = mesh(geometry, gemMaterialFactory(geometry, state.stone || 'emerald'), jewelry, 'Center faceted gemstone');
  gemstone.position.set(0, -4, 0);
  gemstone.userData.role = 'main-gem';
  gemstone.userData.explode = [0, 0, 8];
  gemstone.userData.stone = state.stone || 'emerald';
  gemstone.userData.dimensions = { width, length, depth: geometry.boundingBox.max.z - geometry.boundingBox.min.z };
  jewelry.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(jewelry);
  const dimensions = bounds.getSize(new THREE.Vector3());
  jewelry.userData.dimensions = {
    width: dimensions.x, height: dimensions.y, depth: dimensions.z,
    gemLength: length, gemWidth: width,
  };
  return jewelry;
}
