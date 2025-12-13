// public/main.js
import * as THREE from "three"
import * as CANNON from "cannon-es"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"

import { Planet } from "./planet.js"
import { getJsonFromAI } from "./AIClient.js"

// scenarios
import { initCollisionScene } from "./scenarios/SceneCollision.js"
import { initSolarSystem } from "./scenarios/SceneSolarSystem.js"
import { initBirthScene } from "./scenarios/SceneBirth.js"

// ✅ named import 대신 namespace import (export 꼬임 방지)
import * as AsteroidImpactMod from "./scenarios/SceneAsteroidImpact.js"

import { Explosion } from "./Explosion.js"

// ─────────────────────────────────────
// 1. 기본 씬 설정
// ─────────────────────────────────────
const canvas = document.querySelector("#three-canvas")
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x000000)

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000)
camera.position.set(0, 50, 100)
camera.lookAt(0, 0, 0)

// 👇 다른 파일(시나리오)에서 접근할 수 있도록 전역으로 노출
window.mainCamera = camera

// ★ 기본 시점 저장(클릭 해제용)
const defaultCameraPos = camera.position.clone()
const defaultTarget = new THREE.Vector3(0, 0, 0)

const ambientLight = new THREE.AmbientLight(0xffffff, 1.0)
scene.add(ambientLight)

const sunLight = new THREE.PointLight(0xffffff, 2, 1000)
sunLight.position.set(0, 0, 0)
scene.add(sunLight)

// ─────────────────────────────────────
// 2. 물리 월드
// ─────────────────────────────────────
const world = new CANNON.World()
world.gravity.set(0, 0, 0)
world.broadphase = new CANNON.NaiveBroadphase()

// ─────────────────────────────────────
// 3. 상태 관리
// ─────────────────────────────────────
let planets = []
let explosions = []
let currentScenarioType = ""

// 시나리오 전용 update/cleanup 훅
let scenarioUpdate = null
let scenarioCleanup = null

// ─────────────────────────────────────
// (추가) 클릭 포커스 / 소행성 트레일
// ─────────────────────────────────────
const raycaster = new THREE.Raycaster()
const mouse = new THREE.Vector2()
let focusPlanet = null

let asteroidTrail = null

// ─────────────────────────────────────
// 4. 유틸리티
// ─────────────────────────────────────
function resetScene() {
  // ✅ 이전 시나리오용 오브젝트 정리
  if (typeof scenarioCleanup === "function") {
    try {
      scenarioCleanup()
    } catch (e) {
      console.warn("scenarioCleanup 에서 오류:", e)
    }
  }
  scenarioCleanup = null
  scenarioUpdate = null

  // ✅ 포커스 해제
  focusPlanet = null

  // ✅ 소행성 트레일 정리
  if (asteroidTrail?.dispose) asteroidTrail.dispose()
  asteroidTrail = null

  for (const p of planets) p.dispose?.()
  planets = []

  for (const e of explosions) e.dispose?.()
  explosions = []
}

// 폭발 이펙트
window.createExplosion = (position, color) => {
  try {
    const explosion = new Explosion(scene, position, color)
    explosions.push(explosion)
  } catch (e) {
    console.warn("Explosion effect missing.")
  }
}

// ─────────────────────────────────────
// 충돌 섬광 + 충격파 링 (공용)
// ─────────────────────────────────────
function createImpactFlash(pos) {
  const geometry = new THREE.SphereGeometry(1, 32, 32)
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1.0,
  })
  const flash = new THREE.Mesh(geometry, material)
  flash.position.set(pos.x, pos.y, pos.z)
  flash.scale.set(12, 12, 12)
  scene.add(flash)

  const expandFlash = () => {
    flash.scale.multiplyScalar(1.08)
    flash.material.opacity -= 0.12
    if (flash.material.opacity > 0) requestAnimationFrame(expandFlash)
    else {
      scene.remove(flash)
      geometry.dispose()
      material.dispose()
    }
  }
  expandFlash()

  const ringGeo = new THREE.RingGeometry(8, 9, 64)
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xfff2aa,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  })
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.rotation.x = -Math.PI / 2
  ring.position.set(pos.x, pos.y, pos.z)
  scene.add(ring)

  const animateRing = () => {
    ring.scale.multiplyScalar(1.09)
    ring.material.opacity *= 0.9
    if (ring.material.opacity > 0.02) requestAnimationFrame(animateRing)
    else {
      scene.remove(ring)
      ringGeo.dispose()
      ringMat.dispose()
    }
  }
  animateRing()
}

// ─────────────────────────────────────
// ✅ 소행성 “불꽃 트레일”
// ─────────────────────────────────────
function createAsteroidFlameTrail(asteroid, earth) {
  const max = 1400
  const geom = new THREE.BufferGeometry()
  const positions = new Float32Array(max * 3)
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3))

  const mat = new THREE.PointsMaterial({
    size: 0.7,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    color: 0xffaa33,
  })

  const pts = new THREE.Points(geom, mat)
  scene.add(pts)

  let head = 0
  let alive = 0
  const vel = Array.from({ length: max }, () => new THREE.Vector3())

  const obj = {
    isFinished: false,
    update() {
      if (!asteroid?.mesh || asteroid.isDead) {
        mat.opacity *= 0.92
        if (mat.opacity < 0.02) {
          this.isFinished = true
          this.dispose()
        }
        return
      }

      const aPos = asteroid.mesh.position
      const ePos = earth?.mesh?.position || new THREE.Vector3(0, 0, 0)
      const dist = aPos.distanceTo(ePos)
      const strength = THREE.MathUtils.clamp(1.0 - dist / 200.0, 0, 1)

      mat.opacity = 0.10 + 0.90 * strength

      const dir = new THREE.Vector3(
        asteroid.body?.velocity?.x || 1,
        asteroid.body?.velocity?.y || 0,
        asteroid.body?.velocity?.z || 0
      )
      if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0)
      dir.normalize().multiplyScalar(-1)

      const emit = Math.floor(2 + 14 * strength)

      for (let k = 0; k < emit; k++) {
        const i = head % max
        head++
        alive = Math.min(alive + 1, max)

        const jitter = 0.8 + Math.random() * 1.2
        const spawn = new THREE.Vector3(
          aPos.x + (Math.random() - 0.5) * jitter,
          aPos.y + (Math.random() - 0.5) * jitter,
          aPos.z + (Math.random() - 0.5) * jitter
        )

        positions[i * 3 + 0] = spawn.x
        positions[i * 3 + 1] = spawn.y
        positions[i * 3 + 2] = spawn.z

        vel[i].copy(dir).multiplyScalar(6 + Math.random() * 10)
        vel[i].add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 2.0,
            (Math.random() - 0.5) * 2.0,
            (Math.random() - 0.5) * 2.0
          )
        )
      }

      const dt = 1 / 60
      for (let i = 0; i < alive; i++) {
        const ix = i * 3
        positions[ix + 0] += vel[i].x * dt
        positions[ix + 1] += vel[i].y * dt
        positions[ix + 2] += vel[i].z * dt
        vel[i].multiplyScalar(0.93 - 0.08 * strength)
      }

      geom.attributes.position.needsUpdate = true
    },
    dispose() {
      scene.remove(pts)
      geom.dispose()
      mat.dispose()
    },
  }

  return obj
}

// ─────────────────────────────────────
// 🌍☄️ 소행성 충돌 폭발 (병합 대신 폭발)
// ─────────────────────────────────────
function startAsteroidImpactExplosion(earth, asteroid) {
  if (!earth?.mesh || !asteroid?.mesh) return

  const posE = earth.mesh.position.clone()
  const posA = asteroid.mesh.position.clone()
  const impactDir = new THREE.Vector3().subVectors(posA, posE).normalize()
  const impactPos = posE.clone().add(impactDir.clone().multiplyScalar(earth.radius * 0.98))

  if (asteroid.body) {
    world.removeBody(asteroid.body)
    asteroid.body.isMarkedForRemoval = true
  }
  asteroid.isDead = true
  if (asteroid.mesh) asteroid.mesh.visible = false

  createImpactFlash(impactPos)
  createAsteroidDebris(impactPos, impactDir, earth.radius)

  if (asteroidTrail?.dispose) asteroidTrail.dispose()
  asteroidTrail = null
}

function createAsteroidDebris(impactPos, impactNormal, earthRadius) {
  const count = 900
  const positions = []
  const velocities = []
  const colors = []

  const geometry = new THREE.BufferGeometry()

  const up = new THREE.Vector3(0, 1, 0)
  let tangent1 = new THREE.Vector3().crossVectors(impactNormal, up)
  if (tangent1.lengthSq() < 0.0001) tangent1.set(1, 0, 0)
  tangent1.normalize()
  const tangent2 = new THREE.Vector3().crossVectors(impactNormal, tangent1).normalize()

  for (let i = 0; i < count; i++) {
    const r = Math.random() * earthRadius * 0.3
    const a = Math.random() * Math.PI * 2
    const offset = tangent1
      .clone()
      .multiplyScalar(Math.cos(a) * r)
      .add(tangent2.clone().multiplyScalar(Math.sin(a) * r))
      .add(impactNormal.clone().multiplyScalar(earthRadius * 0.02))

    const start = impactPos.clone().add(offset)
    positions.push(start.x, start.y, start.z)

    const normalSpeed = 28 + Math.random() * 12
    const swirlSpeed = 10 + Math.random() * 8
    const v = impactNormal
      .clone()
      .multiplyScalar(normalSpeed)
      .add(tangent1.clone().multiplyScalar((Math.random() - 0.5) * swirlSpeed))
      .add(tangent2.clone().multiplyScalar((Math.random() - 0.5) * swirlSpeed))

    velocities.push(v)

    const c = Math.random()
    if (c > 0.88) colors.push(1.0, 1.0, 1.0)
    else if (c > 0.55) colors.push(0.78, 0.78, 0.80)
    else if (c > 0.25) colors.push(0.48, 0.50, 0.52)
    else colors.push(0.22, 0.23, 0.25)
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3))

  const material = new THREE.PointsMaterial({
    size: 1.3,
    vertexColors: true,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })

  const debris = new THREE.Points(geometry, material)
  debris.userData.velocities = velocities
  scene.add(debris)

  debris.update = function () {
    const dt = 1 / 60
    const posAttr = this.geometry.attributes.position
    const arr = posAttr.array
    const vs = this.userData.velocities

    for (let i = 0; i < vs.length; i++) {
      const ix = i * 3
      const v = vs[i]
      v.multiplyScalar(0.985)
      v.addScaledVector(impactNormal, 0.3 * dt)

      arr[ix] += v.x * dt
      arr[ix + 1] += v.y * dt
      arr[ix + 2] += v.z * dt
    }

    posAttr.needsUpdate = true
    this.material.opacity *= 0.96
    this.scale.multiplyScalar(1.005)

    if (this.material.opacity <= 0.02) {
      this.isFinished = true
      this.dispose()
    }
  }

  debris.dispose = function () {
    scene.remove(this)
    this.geometry.dispose()
    this.material.dispose()
  }

  explosions.push(debris)
}

// ─────────────────────────────────────
// 클릭 → 포커스 카메라
// ─────────────────────────────────────
function findPlanetByObject(obj) {
  while (obj && obj !== scene) {
    const found = planets.find((p) => p.mesh === obj)
    if (found) return found
    obj = obj.parent
  }
  return null
}

function resetCameraToDefault() {
  focusPlanet = null
  camera.position.copy(defaultCameraPos)
  controls.target.copy(defaultTarget)
}

function onPointerDown(event) {
  const rect = renderer.domElement.getBoundingClientRect()
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(mouse, camera)
  const meshes = planets.map((p) => p.mesh).filter(Boolean)
  const intersects = raycaster.intersectObjects(meshes, true)

  if (intersects.length === 0) {
    resetCameraToDefault()
    return
  }

  const hitObj = intersects[0].object
  const planet = findPlanetByObject(hitObj)
  if (!planet) return

  focusPlanet = planet
}

renderer.domElement.addEventListener("pointerdown", onPointerDown)

// ─────────────────────────────────────
// 전역 병합 핸들러
// - ✅ Earth + Asteroid 는 병합 대신 폭발
// ─────────────────────────────────────
window.handleMerger = (p1, p2) => {
  if (p1.isDead || p2.isDead) return

  const n1 = (p1.data?.name || "").toLowerCase()
  const n2 = (p2.data?.name || "").toLowerCase()
  const combined = n1 + n2

  const hasEarth = combined.includes("earth")
  const hasAsteroid = combined.includes("asteroid")

  // ✅ Earth + Asteroid → 폭발 연출
  if (hasEarth && hasAsteroid) {
    const earth = n1.includes("earth") ? p1 : p2
    const asteroid = n1.includes("asteroid") ? p1 : p2
    startAsteroidImpactExplosion(earth, asteroid)
    return
  }

  // 일반 병합
  const newMass = p1.mass + p2.mass
  const newRadius = Math.cbrt(Math.pow(p1.radius, 3) + Math.pow(p2.radius, 3))
  const ratio = p1.mass / newMass

  const newPos = {
    x: p1.body.position.x * ratio + p2.body.position.x * (1 - ratio),
    y: p1.body.position.y * ratio + p2.body.position.y * (1 - ratio),
    z: p1.body.position.z * ratio + p2.body.position.z * (1 - ratio),
  }
  const newVel = {
    x: (p1.mass * p1.body.velocity.x + p2.mass * p2.body.velocity.x) / newMass,
    y: (p1.mass * p1.body.velocity.y + p2.mass * p2.body.velocity.y) / newMass,
    z: (p1.mass * p1.body.velocity.z + p2.mass * p2.body.velocity.z) / newMass,
  }

  p1.isDead = true
  p2.isDead = true
  p1.body.isMarkedForRemoval = true
  p2.body.isMarkedForRemoval = true

  const loader = new THREE.TextureLoader()
  const textureKey = p1.mass > p2.mass ? p1.data.textureKey : p2.data.textureKey

  setTimeout(() => {
    const mergedPlanet = new Planet(
      scene,
      world,
      loader,
      {
        name: `Merged-${p1.data?.name || "Planet"}`,
        textureKey,
        size: newRadius / 3.0,
        mass: newMass,
        position: newPos,
        velocity: newVel,
      },
      "merge_event"
    )
    planets.push(mergedPlanet)
    window.createExplosion?.(newPos, 0xffffff)
  }, 50)
}

// ─────────────────────────────────────
// 5. AI 데이터 → 시나리오
// ─────────────────────────────────────
async function createSceneFromData(aiData) {
  resetScene()

  console.log("📦 createSceneFromData:", aiData)

  if (!aiData || !aiData.scenarioType) {
    console.error("🚨 scenarioType 없음")
    return
  }

  let safeScenarioType = aiData.scenarioType.toLowerCase().trim()

  // ✅ Earth + Asteroid 감지 -> asteroid_impact 로 강제 전환
  const names = aiData.objects?.map((o) => (o.name || "").toLowerCase()) || []
  const hasEarth = names.some((n) => n.includes("earth"))
  const hasAsteroid = names.some((n) => n.includes("asteroid"))

  if (hasEarth && hasAsteroid) {
    console.log("☄️ 'Earth' + 'Asteroid' 감지 -> asteroid_impact 로 전환")
    safeScenarioType = "asteroid_impact"
  }

  console.log(`🧐 변환된 시나리오 타입: '${safeScenarioType}'`)
  currentScenarioType = safeScenarioType

  let setupData = null
  const loader = new THREE.TextureLoader()

  switch (safeScenarioType) {
    case "collision":
      setupData = initCollisionScene(scene, world, loader, aiData)
      break

    case "solar_system":
    case "orbit":
    case "solar_eclipse":
    case "lunar_eclipse":
      setupData = initSolarSystem(scene, world, loader, aiData)
      break

    case "planet_birth":
      setupData = initBirthScene(scene, world, loader, aiData)
      break

    case "asteroid_impact": {
  console.log("[AsteroidImpact exports]", Object.keys(AsteroidImpactMod))

  if (typeof AsteroidImpactMod.initAsteroidImpact !== "function") {
    console.error("🚨 SceneAsteroidImpact.js 에서 initAsteroidImpact export를 찾지 못함")
    console.error("📌 exports:", Object.keys(AsteroidImpactMod))
    setupData = { planets: [], cameraPosition: aiData.cameraPosition }
    break
  }

  setupData = AsteroidImpactMod.initAsteroidImpact(scene, world, loader, aiData)

  if (setupData?.asteroid && setupData?.earth) {
    if (asteroidTrail?.dispose) asteroidTrail.dispose()
    asteroidTrail = createAsteroidFlameTrail(setupData.asteroid, setupData.earth)
    explosions.push(asteroidTrail)
  }
  break
}


    default:
      setupData = { planets: [], cameraPosition: aiData.cameraPosition }
      if (aiData.objects) {
        for (const objData of aiData.objects) {
          const p = new Planet(scene, world, loader, objData, currentScenarioType)
          planets.push(p)
        }
      }
      break
  }

  if (setupData) {
    if (setupData.planets) planets = setupData.planets

    const camPos = setupData.cameraPosition || aiData.cameraPosition
    const lookAtPos = setupData.cameraLookAt || { x: 0, y: 0, z: 0 }

    if (camPos) {
      camera.position.set(camPos.x, camPos.y, camPos.z)
      camera.lookAt(lookAtPos.x, lookAtPos.y, lookAtPos.z)

      // ✅ 클릭 리셋용 기본 시점 갱신
      defaultCameraPos.copy(camera.position)
      defaultTarget.set(lookAtPos.x, lookAtPos.y, lookAtPos.z)
      controls.target.copy(defaultTarget)
    }

    // 시나리오 전용 훅 저장
    scenarioUpdate = typeof setupData.update === "function" ? setupData.update : null
    scenarioCleanup = typeof setupData.cleanup === "function" ? setupData.cleanup : null
  }
}

// ─────────────────────────────────────
// 중력 (태양계용)
// ─────────────────────────────────────
function applyGravity() {
  // 충돌/탄생/소행성 충돌에서는 중력 끔
  if (
    currentScenarioType === "collision" ||
    currentScenarioType === "planet_birth" ||
    currentScenarioType === "asteroid_impact"
  ) {
    return
  }

  if (planets.length < 2) return

  const sortedPlanets = [...planets].sort((a, b) => b.mass - a.mass)
  const star = sortedPlanets[0]
  const G = 10

  for (let i = 1; i < sortedPlanets.length; i++) {
    const planet = sortedPlanets[i]
    const distVec = new CANNON.Vec3()
    star.body.position.vsub(planet.body.position, distVec)
    const r_sq = distVec.lengthSquared()
    if (r_sq < 1) continue

    const force = (G * star.mass * planet.mass) / r_sq
    distVec.normalize()
    distVec.scale(force, distVec)
    planet.body.applyForce(distVec, planet.body.position)
  }
}

// ─────────────────────────────────────
// 6. 입력 처리
// ─────────────────────────────────────
const inputField = document.getElementById("user-input")
const sendBtn = document.getElementById("send-btn")
const statusDiv = document.getElementById("ai-status")

async function handleUserRequest() {
  const text = inputField.value
  if (!text) return

  sendBtn.disabled = true
  inputField.disabled = true

  try {
    statusDiv.innerText = "AI가 생각 중... 🤔"
    const scenarioData = await getJsonFromAI(text)
    await createSceneFromData(scenarioData)
    statusDiv.innerText = `✅ 적용 완료: ${scenarioData.scenarioType}`
  } catch (error) {
    console.error("🚨 오류:", error)
    statusDiv.innerText = "🚨 오류 발생!"
  } finally {
    sendBtn.disabled = false
    inputField.disabled = false
    inputField.value = ""
    inputField.focus()
  }
}

if (sendBtn) {
  sendBtn.addEventListener("click", handleUserRequest)
  inputField.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleUserRequest()
  })
}

// ─────────────────────────────────────
// 7. 루프
// ─────────────────────────────────────
const clock = new THREE.Clock()
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.target.copy(defaultTarget)

function animate() {
  requestAnimationFrame(animate)
  const deltaTime = clock.getDelta()

  // 시나리오별 update 훅
  if (typeof scenarioUpdate === "function") {
    scenarioUpdate(deltaTime)
  }

  applyGravity()

  // physics
  world.step(1 / 60, deltaTime, 3)

  // planets update
  for (let i = planets.length - 1; i >= 0; i--) {
    const p = planets[i]
    p.update(deltaTime)

    // ✅ SceneAsteroidImpact의 customUpdate(글로우/스파크) 실행
    if (p.customUpdate) p.customUpdate(deltaTime)

    if (p.isDead) {
      p.dispose?.()
      planets.splice(i, 1)
    }
  }

  // explosions update
  for (let i = explosions.length - 1; i >= 0; i--) {
    explosions[i].update?.()
    if (explosions[i].isFinished) explosions.splice(i, 1)
  }

  // focus camera
  if (focusPlanet?.mesh) {
    const targetPos = focusPlanet.mesh.position
    controls.target.lerp(targetPos, 0.1)

    const dist = (focusPlanet.radius || 10) * 4
    const height = (focusPlanet.radius || 10) * 1.5
    const desiredCamPos = new THREE.Vector3(targetPos.x, targetPos.y + height, targetPos.z + dist)
    camera.position.lerp(desiredCamPos, 0.08)
  }

  controls.update()
  renderer.render(scene, camera)
}

// 초기: 태양계 시나리오
createSceneFromData({ scenarioType: "solar_system", objects: [] })
animate()

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})
