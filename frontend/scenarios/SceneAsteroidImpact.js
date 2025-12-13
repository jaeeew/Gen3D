// frontend/scenarios/SceneAsteroidImpact.js
import * as THREE from 'three'
import { Planet } from '../planet.js'

// ─────────────────────────────────────────────
// ✅ “암석 같은” 울퉁불퉁 변형 (1회 적용용)
// ─────────────────────────────────────────────
function makeAsteroidLumpy(planet, opts = {}) {
  if (!planet || !planet.mesh) return
  if (planet.mesh.userData.__lumpyDone) return // ✅ 1회만

  const {
    amp = 0.35,       // 요철 강도 (소행성 반지름 대비)
    freq = 2.2,       // 요철 빈도 (낮을수록 큰 덩어리)
    jitter = 0.25,    // 랜덤성 추가
  } = opts

  const hash = (x, y, z) => {
    const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123
    return s - Math.floor(s) // 0~1
  }

  planet.mesh.traverse((child) => {
    if (!child.isMesh) return
    const geom = child.geometry
    if (!geom || !geom.attributes || !geom.attributes.position) return

    const posAttr = geom.attributes.position

    if (!geom.userData.__basePos) {
      geom.userData.__basePos = posAttr.array.slice()
    }
    const base = geom.userData.__basePos

    const v = new THREE.Vector3()
    const n = new THREE.Vector3()

    if (!geom.attributes.normal) geom.computeVertexNormals()
    const norAttr = geom.attributes.normal

    const R = planet.radius || 1

    for (let i = 0; i < posAttr.count; i++) {
      const ix = i * 3

      const x = base[ix]
      const y = base[ix + 1]
      const z = base[ix + 2]
      v.set(x, y, z)

      if (norAttr) {
        n.set(norAttr.array[ix], norAttr.array[ix + 1], norAttr.array[ix + 2]).normalize()
      } else {
        n.copy(v).normalize()
      }

      const nx = v.x / R
      const ny = v.y / R
      const nz = v.z / R

      const h1 =
        0.55 * Math.sin((nx + 0.37) * freq * 1.0) +
        0.45 * Math.cos((ny - 0.13) * freq * 0.9) +
        0.35 * Math.sin((nz + 0.71) * freq * 1.1)

      const h2 =
        0.25 * Math.sin((nx * 3.8 + 1.1) * freq) +
        0.20 * Math.cos((ny * 4.2 - 0.7) * freq) +
        0.18 * Math.sin((nz * 4.6 + 0.2) * freq)

      const r = (hash(nx * 10, ny * 10, nz * 10) - 0.5) * 2.0 // -1~1

      let disp = (h1 + h2) * 0.18 + r * jitter * 0.12
      disp = THREE.MathUtils.clamp(disp, -0.35, 0.45)

      const displacement = disp * (amp * R)
      v.addScaledVector(n, displacement)

      posAttr.array[ix] = v.x
      posAttr.array[ix + 1] = v.y
      posAttr.array[ix + 2] = v.z
    }

    posAttr.needsUpdate = true
    geom.computeVertexNormals()

    const mat = child.material
    if (mat && 'roughness' in mat) {
      mat.roughness = Math.min(1.0, (mat.roughness ?? 0.8) + 0.15)
    }
  })

  planet.mesh.userData.__lumpyDone = true
}

// ─────────────────────────────────────────────
// ✅ 소행성 “앞면만” 글로우 + 불티 스파크
// - 지구에 가까워질수록 강해짐
// - 진행방향 반대로 스파크가 튐
// ─────────────────────────────────────────────
function setupAsteroidHeatingAndSparks(scene, asteroid, earth) {
  if (!asteroid?.mesh) return

  // 1) (선택) emissive 초기화는 유지 (하지만 "전체 발광"은 아래에서 안 씀)
  asteroid.mesh.traverse((child) => {
    if (!child.isMesh) return
    const mat = child.material
    if (!mat) return

    if ('emissive' in mat) {
      mat.emissive = new THREE.Color(0x000000)
      mat.emissiveIntensity = 0.0
    }
    if ('metalness' in mat) mat.metalness = Math.max(mat.metalness ?? 0, 0.05)
    if ('roughness' in mat) mat.roughness = Math.min(mat.roughness ?? 1, 0.95)
  })

  // ─────────────────────────────────────
  // ✅ (핵심) “앞면만” 보이는 글로우(halo) 메쉬
  // - 소행성 재질을 건드리지 않고
  // - 진행 방향(leading edge)에만 얇은 발광 덩어리 추가
  // ─────────────────────────────────────
  const baseR = asteroid.radius || 1
  const glowGeo = new THREE.CircleGeometry(baseR * 0.55, 32)
const glowMat = new THREE.MeshBasicMaterial({
  color: 0xff9a2a,
  transparent: true,
  opacity: 0.0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
})

const glow = new THREE.Mesh(glowGeo, glowMat)
glow.renderOrder = 999
scene.add(glow)

  // 2) 스파크 파티클(Points) 세팅
  const MAX = 1200
  const positions = new Float32Array(MAX * 3)
  const colors = new Float32Array(MAX * 3)
  const life = new Float32Array(MAX).fill(0)
  const vel = new Array(MAX).fill(0).map(() => new THREE.Vector3())

  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const mat = new THREE.PointsMaterial({
    size: 0.22,
    vertexColors: true,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })

  const sparks = new THREE.Points(geom, mat)
  sparks.frustumCulled = false
  scene.add(sparks)

  let head = 0

  function spawnOne(spawnPos, dir, heat, speed) {
    const i = head
    head = (head + 1) % MAX

    positions[i * 3 + 0] = spawnPos.x
    positions[i * 3 + 1] = spawnPos.y
    positions[i * 3 + 2] = spawnPos.z

    // 노랑~주황~흰색
    const c = Math.random()
    if (c > 0.86) {
      colors[i * 3 + 0] = 1.0
      colors[i * 3 + 1] = 1.0
      colors[i * 3 + 2] = 1.0
    } else if (c > 0.55) {
      colors[i * 3 + 0] = 1.0
      colors[i * 3 + 1] = 0.75
      colors[i * 3 + 2] = 0.25
    } else {
      colors[i * 3 + 0] = 1.0
      colors[i * 3 + 1] = 0.45
      colors[i * 3 + 2] = 0.12
    }

    const jitter = new THREE.Vector3(
      (Math.random() - 0.5) * 0.9,
      (Math.random() - 0.5) * 0.9,
      (Math.random() - 0.5) * 0.9
    )

    // 진행방향 반대로 + 난류
    const base = dir.clone().multiplyScalar(-1).add(jitter).normalize()

    const vmag =
      (10 + 22 * heat) +
      Math.min(speed, 40) * (0.2 + 0.35 * heat) +
      Math.random() * 10

    vel[i].copy(base).multiplyScalar(vmag)

    // 수명(초)
    life[i] = 0.45 + Math.random() * 0.55
  }

  // 3) asteroid.customUpdate로 매 프레임 처리
  asteroid.customUpdate = (dt) => {
    if (!asteroid?.mesh || !earth?.mesh) return

    const posA = asteroid.mesh.position
    const posE = earth.mesh.position
    const dist = posA.distanceTo(posE)

    // 가까울수록 heat 증가 (0~1)
    const heat = THREE.MathUtils.clamp(1 - dist / 120, 0, 1)

    // 속도/방향
    const v = asteroid.body?.velocity
      ? new THREE.Vector3(
          asteroid.body.velocity.x,
          asteroid.body.velocity.y,
          asteroid.body.velocity.z
        )
      : new THREE.Vector3(1, 0, 0)

    const speed = v.length()
    const dir = speed > 1e-4 ? v.clone().normalize() : new THREE.Vector3(1, 0, 0)

    // ─────────────────────────────────────
// ✅ 앞면 발광 (소행성보다 절대 커지지 않음)
// ─────────────────────────────────────
const R = asteroid.radius || 1

// 표면에 거의 붙이기
const leadOffset = dir.clone().multiplyScalar(R * 0.55)
glow.position.copy(posA).add(leadOffset)

// 진행 방향을 바라보게 회전
glow.quaternion.setFromUnitVectors(
  new THREE.Vector3(0, 0, 1),
  dir
)

// 🔥 크기는 거의 고정 (살짝만 맥동)
const pulse = 1.0 + 0.04 * Math.sin(performance.now() * 0.015)
glow.scale.setScalar(pulse)

// 🔥 밝기만 heat로 제어
let alpha =
  (0.15 + 0.75 * heat) *
  THREE.MathUtils.clamp(speed / 30, 0.4, 1.2)

glow.material.opacity = THREE.MathUtils.clamp(alpha, 0.0, 0.85)

    // ✅ 스파크 방출량: heat + speed
    const emit = Math.floor(
      (1 + 14 * heat) * THREE.MathUtils.clamp(speed / 28, 0.35, 1.6)
    )

    // 스폰 위치: 소행성 주변
    const up = new THREE.Vector3(0, 1, 0)
    let t1 = new THREE.Vector3().crossVectors(dir, up)
    if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0)
    t1.normalize()
    const t2 = new THREE.Vector3().crossVectors(dir, t1).normalize()

    for (let k = 0; k < emit; k++) {
      const r = R * (0.85 + Math.random() * 0.45)
      const a = Math.random() * Math.PI * 2
      const h = (Math.random() - 0.5) * r * 0.55

      const offset = t1
        .clone()
        .multiplyScalar(Math.cos(a) * r)
        .add(t2.clone().multiplyScalar(Math.sin(a) * r))
        .add(up.clone().multiplyScalar(h))

      const spawnPos = posA.clone().add(offset)
      spawnOne(spawnPos, dir, heat, speed)
    }

    // 파티클 이동/감쇠
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) continue
      life[i] -= dt

      const ix = i * 3
      vel[i].multiplyScalar(0.965)
      vel[i].y -= 2.5 * heat * dt

      positions[ix + 0] += vel[i].x * dt
      positions[ix + 1] += vel[i].y * dt
      positions[ix + 2] += vel[i].z * dt
    }

    geom.attributes.position.needsUpdate = true
    geom.attributes.color.needsUpdate = true

    // 소행성 죽으면 정리
    if (asteroid.isDead) {
      scene.remove(sparks)
      geom.dispose()
      mat.dispose()

      scene.remove(glow)
      glowGeo.dispose()
      glowMat.dispose()
    }
  }
}

export function initAsteroidImpact(scene, world, loader, aiData) {
  const planets = []

  // 🌍 지구 (고정: 안 밀려나게 매우 무겁게)
  const earth = new Planet(
    scene,
    world,
    loader,
    {
      name: 'Earth',
      textureKey: 'Earth',
      size: 6,
      mass: 999999,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    },
    'asteroid_impact'
  )
  planets.push(earth)

  // ☄️ 소행성 (작게 + 멀리서 출발)
  const asteroid = new Planet(
    scene,
    world,
    loader,
    {
      name: 'Asteroid',
      textureKey: 'Mars',
      size: 1.0,
      mass: 5,
      position: { x: -160, y: 22, z: 0 },
      velocity: { x: 26, y: -3.5, z: 0 },
    },
    'asteroid_impact'
  )
  planets.push(asteroid)

  // 강제 세팅
  if (earth.body) {
    earth.body.position.set(0, 0, 0)
    earth.body.velocity.set(0, 0, 0)
  }
  if (asteroid.body) {
    asteroid.body.position.set(-160, 22, 0)
    asteroid.body.velocity.set(26, -3.5, 0)
    asteroid.body.angularVelocity.set(0.6, 1.0, 0.3) // 살짝 회전
  }

  // ✅ 소행성 울퉁불퉁 1회 적용
  makeAsteroidLumpy(asteroid, {
    amp: 0.42,
    freq: 2.0,
    jitter: 0.35,
  })

  // ✅ 앞면 글로우 + 불티 스파크
  setupAsteroidHeatingAndSparks(scene, asteroid, earth)

  const cameraPosition = { x: 0, y: 40, z: 140 }
  const cameraLookAt = { x: 0, y: 0, z: 0 }

  return { planets, cameraPosition, cameraLookAt, earth, asteroid }
}
