// public/js/AIClient.js
import { API_KEY } from "./config.js"; // 이건 있어도 되고, 지금은 안 써도 됨

const GEMINI_API_BASE = "http://127.0.0.1:8001";

function localRule(userInput) {
  const t = userInput.trim();

  // ✅ 지구 + 소행성만 들어가면 로컬로 asteroid_impact 반환
  if (t.includes("소행성") && t.includes("지구")) {
    console.log("[AIClient] 로컬 룰 → asteroid_impact");

    return {
      scenarioType: "asteroid_impact",
      objects: [] // 비워도 됨 (main.js가 initAsteroidImpact로 생성)
    };
  }

  return null;
}



export async function getJsonFromAI(userInput) {
    const promptTemplate = `
  당신은 3D 천체 물리학 시뮬레이션 전문가입니다.
  사용자의 요청을 분석하여 **5가지 시나리오 중 하나**를 선택하고, 그에 맞는 **JSON 데이터**를 반환하세요.
  
  ### 1. 시나리오 유형 (scenarioType) - 다음 중 하나 선택:
  1. "collision": 행성 간 충돌. (반대편에서 중앙으로 돌진)
  2. "orbit": 자전 및 공전. (태양을 중심으로 행성이 돔)
  3. "solar_eclipse": 개기일식. [태양 - 달 - 지구] 순서로 X축 일직선 배치. (달이 태양을 가림)
  4. "lunar_eclipse": 개기월식. [태양 - 지구 - 달] 순서로 X축 일직선 배치. (지구가 달을 가림)
  5. "planet_birth": 행성의 탄생. (초기에 아주 작은 크기로 시작, 먼지 구름 느낌)
  6. "asteroid_impact": 태양계 바깥에서 날아온 소행성이 지구 궤도에 진입하여 지구와 충돌하는 장면.
     - 태양, 지구, 소행성 세 개만 등장해도 좋음
     - 소행성은 태양에서 먼 곳에서 시작해서, 중력에 끌려 안쪽으로 휘면서 궤적이 지구와 교차하도록 설정
  
  ### 2. 좌표 및 설정 규칙:
  - **일식/월식(eclipse)**: y=0, z=0 필수. x축 위에서 겹치도록 배치. 카메라가 측면에서 봄.
  - **자전/공전(orbit)**: 태양은 정지(0,0,0), 행성은 적절한 거리와 **초기 속도(velocity)**를 주어 공전 궤도를 형성.
  - **탄생(planet_birth)**: 위치는 (0,0,0) 근처, 움직임은 적게.
  - **충돌(collision)**: 서로 마주보고 빠른 속도.
  - **소행성 충돌(asteroid_impact)**:
    - 태양은 (0,0,0), 지구는 태양 주위를 공전하는 위치에 둔다.
    - 소행성은 태양에서 먼 곳 (예: x=250 이상)에서 시작해서, 태양 방향으로 향하는 속도를 준다.
    - velocity는 지구 궤도와 교차하도록 약간 비스듬한 방향으로 설정.
  
  ### 3. 출력 형식 (JSON Only):
  - 마크다운(\`\`\`) 없이 순수 JSON 문자열만 반환.
  - textureKey 목록: "Sun", "Mercury", "Venus", "Earth", "Moon", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"
  
  ---
  [예시 데이터]
  Q: "지구 탄생 과정 보여줘"
  A: { "scenarioType": "planet_birth", "objects": [{ "name": "Proto-Earth", "textureKey": "Earth", "size": 5, "mass": 10, "position": {"x":0,"y":0,"z":0}, "velocity": {"x":0,"y":0,"z":0} }] }
  
  Q: "개기일식"
  A: { "scenarioType": "solar_eclipse", "objects": [{ "name": "Sun", "textureKey": "Sun", "size": 15, ... }, { "name": "Moon", ... }, { "name": "Earth", ... }] }

  Q: "지구와 충돌하는 소행성이 태양계 바깥에서 날아오는 장면 보여줘"
A: {
  "scenarioType": "asteroid_impact",
  "objects": [
    {
      "name": "Sun",
      "textureKey": "Sun",
      "size": 3.33,
      "mass": 5000,
      "position": { "x": 0, "y": 0, "z": 0 },
      "velocity": { "x": 0, "y": 0, "z": 0 }
    },
    {
      "name": "Earth",
      "textureKey": "Earth",
      "size": 1.07,
      "mass": 50,
      "position": { "x": 45, "y": 0, "z": 0 },
      "velocity": { "x": 0, "y": 0, "z": 10 }
    },
    {
      "name": "Asteroid-01",
      "textureKey": "Mars",
      "size": 0.4,
      "mass": 3,
      "position": { "x": 210, "y": 5, "z": -60 },
      "velocity": { "x": -14, "y": -0.6, "z": 6.0 }
    }
  ]
}


  ---
  
  [실제 요청]
  사용자 입력: "${userInput}"
  JSON 응답:`.trim();
  
    console.log('[AIClient] 요청:', userInput);
  
    // 1️⃣ 먼저 로컬 룰 체크
  const ruleResult = localRule(userInput);
  if (ruleResult) {
    return ruleResult;
  }

  // 2️⃣ 그 외에는 백엔드로 전송
  try {
    const res = await fetch(`${GEMINI_API_BASE}/api/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userInput: promptTemplate })
    });

    if (!res.ok) throw new Error(`Proxy failed: ${res.status}`);

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleanText = text
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    return JSON.parse(cleanText);
  } catch (error) {
    console.error('[AIClient] 오류:', error);
    throw error;
  }
}