# 🌍 LLM 기반 Text-to-Scene 지구과학 3D 시각화 플랫폼

사용자가 입력한 자연어 문장을 **LLM이 의도·객체·시나리오를 해석**하여  
**Three.js 기반 3D 지구과학 시뮬레이션 씬(Scene)**으로 자동 생성하는 교육용 AI 시각화 플랫폼입니다.

---


## 📌 프로젝트 개요

Gen3D는 사용자가 입력한 자연어 문장을  
LLM(Gemini → 추후 GPT 지원 예정)이 해석하여  
**Three.js 기반 3D 장면으로 렌더링하는 AI 기반 시각화 플랫폼입니다.**

- **타겟**
  - 지구과학 교과 교사
  - 중·고등학생 및 학습자
- **도메인**
  - 지구과학 교육
- **목표**
  - 추상적인 지구과학 개념의 시각화
  - 학습 몰입도 향상
  - 확장 가능한 교육 플랫폼 구축


---

## 👥 팀원 소개

<table>
  <tr>
    <td align="center">
      <img src="docs/team/song_gayoung.png" width="120"/><br/>
      <strong>20211351 송가영</strong><br/>
      태양계 공전·자전 씬 제작<br/>
      프론트엔드
    </td>
    <td align="center">
      <img src="docs/team/park_soyeon.png" width="120"/><br/>
      <strong>20211333 박소연</strong><br/>
      개기일식·개기월식 씬 제작<br/>
      STT 기능 연결
    </td>
    <td align="center">
      <img src="docs/team/eom_seorin.png" width="120"/><br/>
      <strong>20211365 엄서린</strong><br/>
      백엔드
    </td>
    <td align="center">
      <img src="docs/team/hwang_jaeyoon.png" width="120"/><br/>
      <strong>20211423 황재윤</strong><br/>
      지구–소행성 충돌 씬 제작
    </td>
  </tr>
</table>

---
## 🧱 프레임워크 & 기술 스택

본 프로젝트는 **React 기반 프론트엔드**,  
**FastAPI 기반 백엔드**, **MongoDB 데이터베이스**,  
**LLM(Gemini)**을 활용한 Full-Stack AI 시각화 플랫폼입니다.


### 🎨 Frontend

| 기술 | 설명 |
|---|---|
| **React** | 컴포넌트 기반 UI 구성 |
| **Three.js** | WebGL 기반 3D 지구과학 시뮬레이션 렌더링 |
| **Vite** | 빠른 개발 서버 및 번들링 환경 |

**주요 역할**
- 사용자 자연어 입력 UI 제공
- 백엔드에서 전달된 시나리오 데이터 기반 3D 장면 렌더링
- 카메라 제어 및 애니메이션 실행
- 사용자 인터랙션 처리

### ⚙️ Backend

| 기술 | 설명 |
|---|---|
| **FastAPI** | Python 기반 고성능 비동기 REST API 서버 |
| **Python** | 자연어 처리 및 시나리오 라우팅 로직 구현 |
| **Uvicorn** | ASGI 서버 |

**주요 역할**
- 프론트엔드 요청 처리 (`/prompt/scene`)
- 자연어 입력을 JSON 템플릿 형태로 구조화
- LLM을 통한 시나리오 타입 및 천체 정보 파싱
- 시나리오 타입에 따라 실행 스크립트 자동 라우팅

### 🧠 자연어 처리 & 시나리오 생성 방식

본 시스템은 사용자의 자연어 입력을 다음과 같은 흐름으로 처리합니다.

- **사용자 입력**  
  → 자연어 텍스트 또는 음성 입력

- **자연어 구조화**  
  → 입력 문장을 **JSON 템플릿 형태로 변환**

- **LLM 기반 파싱**  
  → 문장을 분석하여  
  - 시나리오 타입 (예: 공전, 일식, 충돌 등)  
  - 관련 천체 정보 (태양, 지구, 달 등) 추출

- **시나리오 자동 라우팅**  
  → 구조화된 JSON의 `scenarioType` 값을 기준으로  
  해당 시나리오 스크립트를 자동 선택 및 실행

- **음성 입력 보정**  
  → 음성 인식 결과에 대해  
  발음 오류·오타를 사전 정의된 정규화 맵으로 보정하여  
  의도 해석의 안정성 향상

### 🗄️ Database

| 기술 | 설명 |
|---|---|
| **MongoDB** | NoSQL 기반 지구과학 오브젝트 메타데이터 저장 |

**저장 정보**
- 천체 및 오브젝트 기본 정보
- 3D 모델(OBJ / MTL / Texture) 경로
- 시나리오별 사용 오브젝트 매핑 정보

---





## 🧠 핵심 기능

### 1️⃣ 자연어 명령어 해석 (LLM)
- 문맥 인식 기반 자연어 처리
- 사용자 의도 분석 및 시나리오 타입 추론
- 모호한 표현에 대한 재질문 및 명확화 요청
- 음성 입력 시 발음 오타 보정 지원

### 2️⃣ 실시간 3D 렌더링 (Three.js)
- 물리 기반 렌더링으로 사실적인 천체 표현
- 광원, 그림자, 쉐이더 처리
- 대규모 씬에서도 안정적인 렌더링 최적화

### 3️⃣ 사용자 경험(UX) 최적화
- 직관적인 카메라 조작 및 시점 전환
- 시뮬레이션 속도 조절 및 타임라인 제어
- 관심 객체 자동 추적(Focus Tracking)

---

## 🧩 시나리오

### ☀️ 태양계 공전 · 자전 시나리오
- 천체 정보 테이블 자동 생성 (지름, 평균 온도 등)
- Gemini 기반 필터링 → 특정 행성 강조
- Scene Graph 기반 부모–자식 구조
  - `Sun → Earth → Moon`

### 🌑 개기일식 · 개기월식 시나리오
- 정렬 구조
  - 개기일식: Sun → Moon → Earth
  - 개기월식: Sun → Earth → Moon
- castShadow / receiveShadow 기반 그림자 구현
- AmbientLight 감소를 통한 광량 변화 시각화

### ☄️ 지구–소행성 충돌 시나리오
- 속도 벡터 기반 이동 방향 계산
- 충돌 지점 중심 지형 요철(Noise) 생성
- 파편 · 스파크 효과
  - 진행 방향 반대 방향으로 분출
  - 지구에 가까울수록 파편 밀도 증가

---

## 폴더 구조

```text
text3d_project/
│
├── backend/                     # FastAPI 서버
│   ├── main.py                  # 서버 엔트리포인트
│   ├── routers/                 # prompt, scene, object API 라우터
│   ├── ai/                      # LLM(Gemini/GPT) 호출 모듈
│   ├── database/                # Mongo 연결 및 데이터 삽입 스크립트
│   ├── static/                  # OBJ / MTL / Texture 제공 경로
│   └── models/                  # SceneGraph 데이터 모델
│
├── frontend/                    # React + Three.js 기반 클라이언트
│   ├── public/                  # 정적 파일
│   │   ├── scenarios/           # 애니메이션 JS 파일들
│   │   └── static/assets/       # OBJ, MTL, 텍스처 이미지
│   ├── src/
│   │   ├── components/          # UI (ThreeCanvas, ChatPanel 등)
│   │   ├── threeEngine.ts       # Three.js 엔진
│   │   ├── AIClient.js          # 서버와 통신
│   │   └── main.tsx, App.tsx    # React 엔트리
│
├── functional_integration/      # 실험용 테스트 코드
│
├── .gitignore                   # 보안 및 Git 관리 설정
└── README.md                    # 이 문서
```

---

## 🛠 설치 및 실행 방법

아래 안내는 **로컬 개발 환경 기준**입니다.

---

### 1️⃣ 사전 준비

아래 환경이 사전에 설치되어 있어야 합니다.

- **Node.js** (권장: 18 이상)
- **Python** (권장: 3.10 이상)
- **MongoDB**
  - 로컬 MongoDB 또는 MongoDB Atlas 사용 가능

### 2️⃣ 프로젝트 클론

```bash
git clone <YOUR_REPOSITORY_URL>
cd text3d_project
```

## ⚙️ Backend 실행 (FastAPI)

### 1) Python 가상환경 생성 및 활성화

#### Windows

```bash
python -m venv venv
venv\Scripts\activate
```

#### macOS / Linux

```bash
python3 -m venv venv
source venv/bin/activate
```

### 2) 패키지 설치
```bash
pip install -r requirements.txt
```

### 3) 환경변수 설정

text3d_project/backend/.env 파일을 생성하고
아래 내용을 작성합니다.
```env
# LLM API Key
GOOGLE_API_KEY=YOUR_GEMINI_API_KEY

# MongoDB 설정
MONGODB_URI=mongodb://localhost:27017

# (선택) LLM 모델 설정
GEMINI_MODEL=gemini-2.0-flash
```

### 4) FastAPI 서버 실행
```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

## 🎨 Frontend 실행 (React)

### 1) 패키지 설치

```bash
cd ../frontend
npm install
```

### 2) 환경변수 설정
text3d_project/frontend/.env 파일을 생성하고
아래 내용을 작성합니다.

```bash
VITE_API_BASE=http://127.0.0.1:8001
```

### 3) 프론트엔드 실행

```bash
npm run dev
```





