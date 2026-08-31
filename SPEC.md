최신 리뷰·검증은 **GEMINI_VERIFY_2026-08-31.md**. 아래 SPEC은 구버전 수치가 섞여 있다.

# KnightSlide (MD) — 현재 구현 스펙

외부 리뷰어(Gemini)용. 본 문서는 **채팅 이력이 아니라 소스 코드**(`src/config.js`, `src/game.js`, `src/meta.js`, `src/skills-ui.js`, `src/admin.js`, `src/main.js`, `src/effects.js`, `src/style.css`, `index.html`, `package.json`)의 현재 값을 그대로 옮긴다. 어드민 패널로 런타임에 바꿀 수 있는 값은 **기본값**이다.

---

## 1. 프로젝트 개요

| 항목 | 값 |
|------|-----|
| 표시 이름 | KnightSlide (`index.html` title: `MD — KnightSlide`) |
| 부제 | 중세 슬라이드 & 머지 디펜스 |
| 패키지 | `md-knightslide` `0.1.0`, `"type": "module"`, `"private": true` |
| 기술 스택 | Vite `^8.2.1` + Vanilla JS 모듈, HTML5 Canvas 2D, Matter.js `^0.20.0` |
| 실행 | `npm run dev` (Vite), 엔트리 `index.html` → `/src/main.js` |
| 언어 | UI/카피 한국어, 코드 주석 한국어 |
| 물리 | 아군만 Matter 바디. 적·라인·궁수·벽은 비물리 엔티티 |
| 저장 | 메타(레벨/XP/스킬)만 `localStorage`. 런 스코어·웨이브는 저장하지 않음 |

### 1.1 캔버스·레이아웃

| 상수 | 값 | 의미 |
|------|----|------|
| `CANVAS_W` | **450** | 논리 가로 px. `<canvas width="450" height="800">`, `#wrap`도 450×800, `aspect-ratio: 9 / 16` |
| `CANVAS_H` | **800** | 논리 세로 px |
| `LINE_START_Y` | **90** | 웨이브라인 시작(밀어낼 수 있는 상한) |
| `DEFEAT_Y` | **660** | 마지노선. 라인이 여기 도달하면 패배(벽이 있으면 충격 후, 벽 파괴 뒤 다음 접촉) |
| `LAUNCHER_Y` | **700** | 발사 대기 유닛 Y |

좌표계: 원점 좌상단, Y 증가 = 아래.

### 1.2 물리 벽 (Matter static rectangles)

`_reset()`에서 중력 `(0, 0)`. 벽 옵션 `{ isStatic: true, restitution: 0.4, friction: 0.05 }`.

| 벽 | 중심 | 크기 |
|----|------|------|
| 좌 | `(-20, CANVAS_H/2)` = (−20, 400) | 폭 40, 높이 `CANVAS_H*2` = 1600 → 내면 x=0 |
| 우 | `(CANVAS_W+20, CANVAS_H/2)` = (470, 400) | 폭 40, 높이 1600 → 내면 x=450 |
| 상 | `(CANVAS_W/2, -20)` = (225, −20) | 폭 `CANVAS_W*2` = 900, 높이 40 → 내면 y=0 |
| 하 | `(CANVAS_W/2, CANVAS_H+20)` = (225, 820) | 폭 900, 높이 40 → 내면 y=800 |

아군 원형 바디: `frictionAir = FRICTION_AIR_UNIT` **0.03**, `restitution` **0.3**, `friction` **0.05**, 질량은 티어 `mass`.

### 1.3 전역 밸런스 기본값 (`BALANCE`)

| 키 | 기본값 | 단위/설명 |
|----|--------|-----------|
| `baseLineSpeed` | **8** | 웨이브라인 기본 전진 px/초 |
| `bossMinAdvance` | **18** | 착지 보스 occupy 시 netSpeed 하한 px/초. joining에는 미적용 |
| `spawnInterval` | **2.3** | 적 스폰 기본 간격(초). 웨이브에 따라 감소 |
| `launchCooldown` | **1.15** | 발사 쿨다운(초). 스킬로 감소, 하한 `PROGRESSION.launchCdFloor` |
| `launchSpeed` | **720** | 발사 돌진 px/초. Matter `setVelocity`는 baseDelta(16.67ms)당 px라 `vel = launchSpeed / 60`. 발사체는 정착 아군과 물리 충돌하지 않음 |
| `unitAdvanceSpeed` | **18** | 착지 후 아군 전진 px/초. `vel.y = -(unitAdvanceSpeed * advanceMult * stepMs / 1000)` |
| `bossGatherStrength` | **0.6** | 보스 집결 강도 0~1. **0.7 초과**여야 교전 중 유닛도 집결. 기본 0.6이므로 교전 유닛은 집결하지 않음 |
| `gatherSpeed` | **40** | 집결 최대 가로 이동 px/초. `maxVxTick = gatherSpeed * strength * stepMs / 1000` |
| `attackCooldown` | **0.8** | 아군·적 기본 공격 틱 간격(초) |
| `enemyReach` | **50** | 적 근접 사거리 보정 px. 실제 사거리 = `적.r + 50` |
| `gentleRate` | **0.20** | 완만 구간: 웨이브당 +20% |
| `steepStartWave` | **11** | 가파른 구간 시작 웨이브 (마지노 클리프) |
| `steepFactor` | **3.0** | 첫 가파른 웨이브 배율 (W11 클리프) |
| `steepContinue` | **1.45** | 클리프 이후 웨이브당 배율. 없으면 `steepFactor`와 동일 |
| `emptyLinePushScale` | **1** | 빈 라인 푸시 시 저지력 배율 (1 = 교전과 동일) |
| `emptyLinePushSlack` | **32** | 라인 홀드 위치에서 이 거리(px) 안이면 전열로 취급 |

실시간 난이도 배율:

| 상수 | 값 |
|------|----|
| `LIVE_MULT_MIN` | **0.5** |
| `LIVE_MULT_MAX` | **5.0** |
| `LIVE_MULT_STEP` | **0.1** |
| 기본 `game.liveMult` | **1** (재시작해도 유지) |

`clampLiveMult(v)`: `Math.round(v * 10) / 10` 후 `[0.5, 5.0]` 클램프.

---

## 2. 코어 루프

게임 상태: `'start' | 'playing' | 'gameover'`.

메인 루프 `requestAnimationFrame`. 프레임 `dt = min((now-last)/1000, 0.05)`. 플레이 중 `_update(dt)` 후 `_draw()`.

`_update` 순서:

1. `meta.getEffects()` 캐시
2. 발사 쿨다운 감소
3. `Engine.update(engine, min(dt*1000, 33.33))`
4. 머지 처리
5. 스폰
6. 교전 여부 계산
7. 웨이브라인 이동 (패배 시 여기서 return)
8. 아군 전진
9. 보스 집결
10. 전투 (아군→적, 적→아군)
11. 아군 재생 스킬
12. 궁수
13. 적 틱 (기절/화상/트롤 재생)
14. 아군 특수/영웅 능력
15. 라인 경계 불변식
16. 이펙트·피격 플래시

### 2.1 발사 (직선, 쿨다운, 다음 유닛 프리뷰)

- **조준**: 포인터 `y > 560`에서 다운해야 드래그 시작. X만 사용. `aimX = clamp(x, 24, CANVAS_W-24)` = **[24, 426]**.
- **발사**: 포인터 업 시 `state==='playing'`, 스킬 패널 닫힘, `launchCd<=0`이면 `_launchUnit()`.
- 스폰 위치 `(aimX, LAUNCHER_Y=700)`, 속도 `{x:0, y: -velFromPxPerSec(launchSpeed, stepMs)}` → **수직 위 직선**. 각도/슬링샷 당김 없음.
- 쿨다운: `launchCd = effects.launchCooldown` (기본 `max(0.25, 1.15 - rank(launchCd)*0.16)`).
- **현재/다음 티어**: 시작 시 둘 다 `_rollTier()`. 발사 후 `currentTier = nextTier`, `nextTier = _rollTier()`.
- HUD 프리뷰: 우측 하단 `(CANVAS_W-55, CANVAS_H-35)` = (395, 765), 반지름 14, 라벨 「다음」.
- 대기 유닛은 쿨 중 알파 0.38, 쿨 바 44×5.

`_rollTier()` (스킬 반영):

```
r = Math.random()                         // [0, 1)
if t3Chance > 0 && r < t3Chance → 티어 3
if r < t3Chance + 0.25 + t2Bonus → 티어 2
else → 티어 1
```

기본(스킬 0): **T1 75%, T2 25%, T3 0%**. T2 기본 0.25는 하드코딩(설정 테이블 없음).

### 2.2 머지

조건 (`collisionStart`, 아군끼리):

- 둘 다 살아 있고 `isMerging` 아님
- **같은 티어**
- `tier < 10` (영웅끼리 머지 없음)

**만피 조건 없음.** HP가 깎인 유닛도 충돌하면 합쳐진다.

처리:

- 위치: 중점. `my = max(lineY+40, min(my, DEFEAT_Y-30))` = `[lineY+40, 630]`
- `newTier = tier+1`
- `newTier === 10` → 랜덤 영웅 소환(정착 상태) + 머지 충격
- 그 외 → 새 유닛 스폰, **`settled = true`** (발사 관성 없이 즉시 전진) + 머지 충격
- 점수/XP: `newTier * 5` (`_grantScore`)

영웅 3종 균등 랜덤: `arthur` / `jeanne` / `valkyrie`. 수명 타이머 없음. `HERO_MISSION_DAMAGE = 80000` 피해 쿼터를 채우면 명예로운 승천.

### 2.3 웨이브라인 줄다리기

적이 하나라도 있으면:

```
advance = baseLineSpeed + Σ (stunT<=0 인 적) MONSTERS[key].speed * liveMult
stopping = Σ (engaged 아군) unit.stop * stopMult
netSpeed = advance - stopping          // +아래 / −위
// 착지한 살아있는 보스가 라인을 occupy할 때만 (joining 캠프 행군 제외)
if living boss occupies line:
  netSpeed = max(netSpeed, BALANCE.bossMinAdvance)  // 기본 18 px/s
lineY += netSpeed * dt
lineY = max(lineY, LINE_START_Y)
if lineY >= DEFEAT_Y → 벽 충격 시도, 실패 시 패배
적 y = lineY - row * SLOT_ROW_H
```

`bossMinAdvance`: 저지력이 이겨도 보스전 중 라인을 완전히 멈추거나 밀어올릴 수 없음. 돌격 `chargeStutterT`는 기존처럼 짧게 netSpeed=0 후 플로어가 재개. 보스 사망 즉시 해제. 빈 라인 상향 푸시는 occupy 중에는 타지 않음.

중요: **적 라인 가속 `speed`에는 `waveMultiplier`가 곱해지지 않는다.** `liveMult`만 곱한다. HP/ATK와 다르다.

`engaged`: `enemies.length > 0` 이고, 유닛 중심~적 중심 거리 `<= unit.range + enemy.r`.

### 2.4 패배 조건

- 라인이 `DEFEAT_Y`(660)에 도달
- 벽이 없거나 `broken`이거나 `hp<=0`이면 `_gameOver()`
- 게임오버 문구: `점수: {score} · 웨이브 {wave} · 레벨 {meta.level}`
- 유닛이 전멸해도 패배 아님. 라인만 본다.

### 2.5 빈 라인 푸시

`enemies.length === 0` (보스 경고 대기 포함):

```
stopping = Σ (전열 정착 아군) unitStop * emptyLinePushScale
netSpeed = -stopping
lineY += netSpeed * dt
if lineY <= LINE_START_Y → lineY = LINE_START_Y, netSpeed = 0
```

전열 판정 `_unitCanPushEmptyLine`: `settled`이고  
`body.y <= (lineY + 20 + r) + emptyLinePushSlack`  
기본 슬랙 **32px**.

### 2.6 보스 집결

§7 참고. 킬 수 충족 → 경고 1.6초 → 보스 스폰 → 집결 AI.

---

## 3. 아군 유닛 T1–T10

`UNITS[tier-1]`. 색은 채움색. 테두리 렌더는 `rgba(0,0,0,0.45)`.

| T | 이름 | color | r | HP | ATK | mass | range | stop(저지력) | 특수 |
|---|------|-------|---|----|-----|------|-------|--------------|------|
| 1 | 민병대 | `#D2B48C` | 16 | 50 | 5 | 1.0 | 40 | 4 | 없음 |
| 2 | 신병 | `#C2A679` | 18 | 110 | 12 | 1.3 | 50 | 6 | 없음 |
| 3 | 경보병 | `#CD7F32` | 20 | 240 | 25 | 1.7 | 62 | 9 | 없음 |
| 4 | 중보병 | `#708090` | 22 | 500 | 55 | 2.2 | 75 | 13 | 없음 |
| 5 | 기사단원 | `#4682B4` | 24 | 1050 | 120 | 2.8 | 90 | 18 | 기본 공격 시 대상 중심 **60px** 안 다른 적에게 `dmg * 0.5` (잔느 버프 후 dmg 기준) |
| 6 | 근위대장 | `#4169E1` | 26 | 2200 | 250 | 3.5 | 108 | 24 | 기본 공격 시 **10%** 확률로 대상 `stunT = max(stunT, 0.5)`초 |
| 7 | 성기사 | `#FFD700` | 28 | 4600 | 520 | 4.3 | 128 | 32 | **2초마다** 자신 제외 거리 **&lt; 110** 아군에게 `maxHp * 0.04` 회복. 라벨 글자색 `#5c4500` |
| 8 | 드래곤가디언 | `#8B0000` | 30 | 9500 | 1100 | 5.3 | 150 | 42 | 기본 공격 시 대상 `burn = { dps: atk*0.2, t: 3 }`. 기존 화상 **덮어씀**(스택 아님) |
| 9 | 대원수 | `#4B0082` | 33 | 19000 | 2300 | 6.5 | 180 | 55 | **4초마다** 거리 `&lt; range(180)` 적에게 `atk * 0.3` (적 반지름 미차감) |
| 10 | 영웅 | `#FF4500` | 38 | 50000 | 6500 | 10.0 | 225 | 90 | 사명 피해 쿼터 + 히어로 스킬. 두 T9 머지로만 생성 |

저지력 실효값: `stop * effects.stopMult`.  
아군 HP/ATK/range는 웨이브 배율을 받지 않음.

초기 `attackCd = random() * 0.3`. 정착 전에도 사거리 안이면 공격 가능(전진 주석).

### 3.1 영웅 변형 (`HEROES`) + 타이밍

세 유형 모두 T10 스탯. `heroType`이 있으면 잔느 버프 **대상이 되지 않음**. 기본 공격(0.8초)은 그대로 한다.

| id | 이름 | 설정 desc | 실제 로직 |
|----|------|-----------|-----------|
| `arthur` | 아서 | 3초마다 전체 검기 | `abilityT >= 3`마다 리셋. **모든 생존 적**에게 `atk * 0.4` = **2600**. 라인 플래시 |
| `jeanne` | 잔느 | 주변 아군 공격력 +50% | 오라 반경 **`HEROES.jeanne.auraRadius`(140px)**. 비영웅 아군의 **기본 공격 dmg × `damageBuff`(1.5)**. 패시브라 `abilityT` 미사용 |
| `valkyrie` | 발키리 | 사거리 내 회전 베기 | `valkTick >= tick(0.3)`마다 리셋. 거리 `&lt; range(225)` 적에게 `atk * atkFrac(0.12)` = **780**. 기본 공격과 별 틱 |

수명 타이머 없음. `missionDamage`가 `HERO_MISSION_DAMAGE`(80000)에 도달하면 명예로운 승천(슬로모 0.3초, 전체 `atk*1.5`, 라인 90 리셋, T5 스폰, 점수 400). HP 사망 시 승천 없음. 게이지는 영웅 위 「사명」 바.

---

## 4. 몬스터 테이블

적은 Matter 바디 없음. 라인에 부착. `speed` = 라인 전진 가속 기여(px/초). **0이면 라인을 밀지 않음.**

| key | 이름 | icon | color | outline | r | HP | ATK | speed | score | 기타 |
|-----|------|------|-------|---------|---|----|-----|-------|-------|------|
| goblin | 고블린 | 고 | `#3CB371` | `#1e5c38` | 15 | 48 | 5 | 4 | 10 | gold 6 |
| skeleton | 스켈레톤 | 스 | `#DCDCDC` | `#6e6e6e` | 16 | 150 | 12 | 1 | 20 | gold 12, grade 2, `sprite: skeleton2` (`enemy_skeleton2.png`), 아이콘 글자색 `#333` |
| orc | 오크 | 오 | `#6B8E23` | `#39510f` | 22 | 185 | 14 | 2 | 30 | gold 18, grade 3 |
| troll | 동굴 트롤 | 트 | `#556B2F` | `#2c3a14` | 28 | 430 | 15 | 3 | 100 | gold 50, `regenDelay: 1.2`, `regenPct: 0.08` (피격 후 1.2초 동안 재생 없음, 이후 **maxHp의 8%/초**, HUD·어드민 실시간 조절) |
| skelknight | 해골기사 | 기 | `#C0C0C0` | `#4a4a4a` | 24 | 280 | 21 | 3 | 80 | gold 40, grade 5, `sprite: skeleton` (`enemy_skeleton.png`), `bossOnly: true` |
| boss | 오크 워로드 | 보 | `#B22222` | `#5c0e0e` | 45 | 1350 | 17 | **12** | 500 | gold 150, `isBoss: true` |

### 4.1 스폰 가중치 (`_monsterPool`)

가중치 배열에 넣은 뒤 `total`로 롤. `bossOnly` 유닛은 풀에 없음.

| 웨이브 | 풀 | 합 | 확률 |
|--------|----|----|------|
| 1 | goblin 78, skeleton 12 | 90 | 고 86.67%, 스 13.33% |
| 2 | + orc 20 | 100 | 고 55%, 스 25%, 오 20% |
| ≥3 | + troll 4 | 104 | 고 52.88%, 스 24.04%, 오 19.23%, 트 3.85% |

보스는 풀에 없음. 킬 조건으로만 등장.

초기 `attackCd = random() * 0.4`.

---

## 5. 웨이브 시스템

시작: `wave=1`, `kills=0`, `spawnTimer=1.5`, `bossActive=false`, `bossPending=false`.

### 5.1 킬 목표

```
killsNeeded(wave) = 12 + wave * 2
```

| W | 필요 킬 | W | 필요 킬 |
|---|---------|---|---------|
| 1 | 14 | 11 | 34 |
| 2 | 16 | 12 | 36 |
| 3 | 18 | 13 | 38 |
| 4 | 20 | 14 | 40 |
| 5 | 22 | 15 | 42 |
| 6 | 24 | 16 | 44 |
| 7 | 26 | 17 | 46 |
| 8 | 28 | 18 | 48 |
| 9 | 30 | 19 | 50 |
| 10 | 32 | 20 | 52 |

일반 적만 `kills++`. 보스는 킬 카운트에 넣지 않고 웨이브를 올린다.

### 5.2 스폰 간격

보스 경고(`bossWarnT>0`) 중에는 스폰 로직이 조기 return → **일반 스폰 정지**.

기본 간격:

```
interval = max(spawnIntervalFloor, spawnInterval / (1 + (wave-1)*spawnIntervalAccel))
```

기본 `spawnInterval=2.3`, `accel=0.30`, `floor=0.55`. 한 번에 한 마리. 리셋 시 `interval * (0.82 + random*0.36)` 지터.

매 프레임 `spawnTimer -= dt * spawnTimerSpeed`. 속도는 **전열 아군–캠프** 근접이 주 드라이버 (웨이브라인은 시작부터 캠프에 있어 라인 기준이면 초반부터 러시):

```
allyY = min(settled living unit body.y)  // 발사 중 제외. 없으면 proximity 0
proximity = 1 if allyY <= LINE_START_Y + 28
          = clamp(1 - (allyY - LINE_START_Y) / spawnCampApproachRange, 0, 1)
timerDtMult = 1 + proximity^spawnCampApproachEase * (spawnCampTouchMult - 1)
capped = min(timerDtMult * campRaidMult, interval / spawnCampRushFloor)
spawnTimerSpeed = capped * spawnRateMult   // 라이브 리스폰 배율. 1=기본, 2=두 배 빠름
```

| 키 | 기본 | 의미 |
|----|------|------|
| `spawnCampApproachRange` | **200** | 캠프 하단에서 아군까지 이 px 안일 때만 가속. 아군 없음/마지노는 배율 1 |
| `spawnCampTouchMult` | **6** | 아군이 캠프 하단에 닿을 때 타이머 소진 배율. W1 2.3s → 실효 ~0.38s |
| `spawnCampApproachEase` | **1.5** | ease-in. 멀리선 약하고 캠프 앞에서 급가속 |
| `spawnCampRushFloor` | **0.28** | 실효 최단 간격(초). 쿼터를 한 프레임에 안 쏟음 |
| `spawnCampRaidMin/Max` | **2 / 3** | 아군이 캠프 스프라이트 안일 때 추가 배율 |

W1 아군 없음·마지노: 간격 2.3s (지터 1.89–3.13). W1 아군이 캠프 접촉: ~0.38s. 후반 웨이브는 곡선으로 더 빨라지되 0.28s 클램프. `spawnRateMult`는 그 위에 곱해지므로 ×2면 러시 플로어보다도 빨라질 수 있다.

보스전 부하 스폰(`_updateBossMinionSpawning`)도 같은 아군 근접 배율 × `spawnRateMult`. 상한은 `bossMinionCap`.

`spawnRateMult`는 HUD 왼쪽 「리스폰」 −/+ 와 어드민 「실시간 리스폰」에서 0.1 단위 (min 0.2, max 5.0). `liveMult`처럼 `start()`/`_reset()`에서 초기화하지 않음. 변경 시 플로팅 `리스폰 ×N.N`.

### 5.3 2단 난이도 곡선

```
waveMultiplier(wave):
  start = steepStartWave                          // 11
  gentleWaves = min(wave, start - 1)              // min(wave, 10)
  mult = 1 + (gentleWaves - 1) * gentleRate       // 1 + (gentleWaves-1)*0.20
  if wave >= start:
    n = wave - start + 1
    cont = steepContinue if set else steepFactor  // 1.45
    mult *= steepFactor * cont^(n - 1)            // W11: ×3.0, 이후 ×1.45/웨이브
  return mult
```

스킬 0 기준 마지노(W11)에서 게임오버가 목표. W10까지는 완만, W11에서 클리프.

| W | waveMultiplier | W | waveMultiplier |
|---|----------------|---|----------------|
| 1 | 1.00 | 11 | 8.40 |
| 2 | 1.20 | 12 | 12.18 |
| 3 | 1.40 | 13 | 17.661 |
| 4 | 1.60 | 14 | 25.60845 |
| 5 | 1.80 | 15 | 37.1322525 |
| 6 | 2.00 | 16 | 53.841766125 |
| 7 | 2.20 | 17 | 78.07056088125 |
| 8 | 2.40 | 18 | 113.2023132778 |
| 9 | 2.60 | 19 | 164.1433542528 |
| 10 | 2.80 | 20 | 238.0078636666 |

### 5.4 `effectiveMult` 적용 (스냅샷 vs 라이브)

```
effectiveMult(wave, liveMult=1) = waveMultiplier(wave) * liveMult
```

스폰 시 (`_spawnEnemy`):

```
waveMult = waveMultiplier(this.wave)                 // liveMult 제외, 개체에 저장
hp = round(stat.hp * effectiveMult(wave, liveMult))  // HP는 스폰 스냅샷
```

이후:

| 스탯 | 적용 | 식 |
|------|------|----|
| **HP / maxHp** | 스폰 스냅샷 | `round(baseHp * waveMult * liveMult_at_spawn)`. `setLiveMult` 시 **기존 적만** 재계산 |
| **ATK** | 라이브 | `baseAtk * m.waveMult * this.liveMult` (`_enemyAtk`) |
| **라인 speed** | 라이브, **waveMult 없음** | `baseSpeed * this.liveMult` |
| **트롤 regen** | 비전투 | 피격 후 `regenDelay`(1.2초)가 지나야 `maxHp * regenPct`(기본 8%/초, 어드민 적 스탯). 웨이브 배율은 maxHp에 이미 들어감 |

`setLiveMult(next)` → `_rescaleEnemiesForLiveMult`:

```
ratio = hp / maxHp
maxHp = max(1, round(MONSTERS[key].hp * m.waveMult * next))
hp = max(1, round(maxHp * ratio))
```

현재 HP 비율 유지. 최소 HP 1. 죽은 적 스킵.  
**ATK·라인 가속은 리스케일 함수를 타지 않고** 매 틱 `this.liveMult`을 읽는다.

신규 스폰은 그때의 `liveMult`로 HP를 찍는다. 어드민이 `MONSTERS[].hp` 테이블을 바꾸면 주석대로 **신규 개체부터** (이미 나온 적은 `m.waveMult`와 현재 테이블로 리스케일 시에만 반영).

`liveMult`·`spawnRateMult`·`rangeMode`는 `start()`/`_reset()`에서 초기화하지 않음.

---

## 6. 전투

### 6.1 공격 틱

아군·적 모두 `attackCd`가 0 이하일 때 사거리 안 최근접 1타깃. 성공 시 `attackCd = BALANCE.attackCooldown` (**0.8초**). 대상 없으면 매 프레임 재탐색(쿨 소모 없음).

아군 거리: `hypot(mx-x, my-y) - enemy.r <= unit.range`  
적 거리: `hypot(ux-mx, uy-my) - unit.r <= enemy.r + enemyReach(50)`

### 6.2 교전

프레임당 1회 `_computeEngagement()`. 라인 저지력과 전진 로직이 이 플래그를 공유. 전진 자체는 교전과 무관하게 라인 앞까지 간다.

### 6.3 저지력 vs 라인 속도

§2.3. 기절 적(`stunT>0`)은 speed를 더하지 않고 공격도 하지 않음. 화상 중에도 라인은 민다(기절이 아니면).

### 6.4 상태이상·힐·광역

| 효과 | 출처 | 수치 |
|------|------|------|
| 기절 | T6 10% | 0.5초. 라인 가속·공격 정지. 중첩 시 `max` |
| 화상 | T8 기본 공격 | `dps = T8.atk * 0.2` = **220**/초(버프 무관, `stat.atk`), 3초. `_damageEnemy(dps * dt)` |
| T7 힐 | 2초 | 반경 110, `maxHp*4%`, 자기 제외 |
| T5 클레브 | 기본 공격 | 대상 중심 60px, `dmg*0.5` |
| T9 충격파 | 4초 | `d < 180`, `atk*0.3` = 690 |
| 아서 | 3초 | 전체 `atk*0.4` |
| 발키리 | 0.3초 | `d < 225`, `atk*0.12` |
| 잔느 | 상시 | 140px, 비영웅 기본공격 ×1.5 |
| 머지 충격 | 스킬 | §10 |
| 트롤 재생 | 패시브 | +12 HP/s, maxHp 캡 |

### 6.5 경계 불변식 `_enforceLineBoundary`

```
minY = lineY + 14 + u.r
if body.y < minY → 위치를 y=minY로 고정, vel.y<0이면 0
```

주석: 어떤 이유로든 아군이 라인을 넘지 못함.

### 6.6 근접 전진 (최소 클리어런스)

모든 아군은 사거리와 무관하게 라인 바로 앞까지 전진. 사거리는 공격 도달만.

정착: `age > 2.5` **또는** (`age > 0.4` **and** `body.speed < 2`).

```
minHoldY = lineY + 20 + u.r
advTick = unitAdvanceSpeed * advanceMult * stepMs / 1000

if y <= minHoldY:
  vel.y < 0 이면 vel.y = 0   // 위로 못 뚫음
else if settled:
  vel = { x: vel.x * 0.9, y: -advTick }
```

기본 전진 30px/초 스케일(× `advanceMult`). 홀드 클리어런스 **20+r**, 불변식 클리어런스 **14+r** → 유닛은 대략 그 사이에 붙는다.

---

## 7. 보스

### 7.1 스탯 (기본 테이블)

HP 2300, ATK 85, speed 38, r 45, score 500.  
실효 HP = `round(2300 * waveMult * liveMult)` 스폰 시.  
실효 ATK = `85 * waveMult * liveMult` 라이브.  
라인 가속 = `38 * liveMult` (**waveMult 없음**). 기본 liveMult=1이면 고블린 3보다 **약 12.7배** 라인을 민다.

웨이브 1, liveMult 1: HP 2300, ATK 85.  
웨이브 5: HP `round(2300*1.4)=3220`, ATK 119.  
웨이브 11: HP `round(2300*2.47)=5681`, ATK 209.95.

### 7.2 스폰 플로우

1. `!bossActive && !bossPending && kills >= killsNeeded(wave)`
2. `bossPending=true`, `bossWarnT=1.6`, 경고 텍스트 「⚠ 보스 출현! ⚠」
3. 경고 동안 일반 스폰 중지. 적이 없으면 빈 라인 푸시 가능
4. `bossWarnT<=0` → `_spawnEnemy('boss')`, `bossActive=true`, 「보스 출현! 병력 집결!」
5. 직후 호위: `bossKnightEscorts`(2)마리 해골기사 + (`bossEscortCount` − 기사 수)마리 일반 풀. 총합은 상한 `bossMinionCap`
6. 보스는 슬롯을 점유하지 않음. 초기 `x=CANVAS_W/2`(225), `y=lineY`, `row=0`,`col=-1`
7. 착지 시 겹치는 기존 적을 `_findSpawnSpot`으로 재배치
8. 보스 생존 중 부하는 `bossMinionCap`까지 일반 풀에서 **같은 캠프 근접 배율**로 스폰 (해골기사는 재충전하지 않음, 한 프레임 몰아넣기 없음)
9. 보스 처치: 점수 500 + XP 보너스 `round(bossXpPerWave * wave)` = **`200 * 현재 웨이브`** (증가 전). 그 다음 `wave++`, `kills=0`, 궁수 탄약 재충전, 「웨이브 N 시작!」

### 7.3 집결

```
strength = clamp(bossGatherStrength, 0, 1)     // 기본 0.6
if strength <= 0 또는 보스 없음 → return
engagedAlsoGather = (strength > 0.7)           // 기본 false
maxVxTick = gatherSpeed * strength * stepMs / 1000  // 40*0.6 @16.67ms ≈ 0.4

정착 유닛에 대해:
  교전 중이고 engagedAlsoGather 아니면 skip
  |boss.x - unit.x| < 24 이면 skip (열 근처 정지)
  vel.x = sign(dx) * maxVxTick, vel.y 유지
```

기본값에서는 **비교전 정착 유닛만** 보스 X로 모인다.

---

## 8. 적 겹침 / 슬롯 배치

```
SLOT_COLS = 7
SLOT_MARGIN = 40
SLOT_ROW_H = 46
slotX(col) = 40 + col * (CANVAS_W - 80) / 6
           = 40 + col * (370/6)
           ≈ 40, 101.67, 163.33, 225, 286.67, 348.33, 410
```

`occupiedSlots`: `"row:col"` 문자열 Set. 보스는 넣지 않음.

`_findSpawnSpot(radius, exclude)`:

- row 0..29, col 0..6
- 점유 슬롯 스킵
- 후보 좌표: `x = slotX(col) + random()*14 - 7` (±7), `y = lineY - row*46`
- 다른 적과 `hypot < radius + other.r + 2` 이면 겹침
- 해당 row에 빈 후보가 있으면 **그 row에서 랜덤 1개** 선택 (앞열 우선)
- 30열 모두 실패 시 `null`

일반 적 스폰: spot 실패 시 겹침을 무시하고 첫 빈 슬롯. 그래도 없으면 `col`이 -1인 채 `slotX(0)` + 지터.

보스 밀어내기: 겹치면 상대 슬롯 해제 → 재탐색(`exclude=other`) → 새 슬롯 점유.

---

## 9. 진행 (XP / 레벨 / 스킬 포인트)

### 9.1 XP 공식

코드 주석:

> XP = 기존 점수 + 보스 처치 보너스(`bossXpPerWave * 클리어한 웨이브`).  
> 쓰레기 처치보다 웨이브 클리어/보스 킬이 유리하도록 보너스를 크게 둠.

구현:

- `_grantScore(n)` → `score += n` 그리고 `meta.addXp(n)` (**점수 1 = XP 1**)
- 점수 출처: 적 `stat.score`, 머지 `newTier*5`
- 보스 추가 XP만 점수에 안 넣고 `_addRunXp(round(200 * wave))`

레벨업 목표 주석: Lv2 ≈ 1웨이브 보스 직후, Lv5 ≈ 웨이브 5–7 무난한 런, Lv10은 장기 목표.

`meta.addXp`: `xp`에 더하고 `xp >= xpToNextLevel(level)`이면 차감, `level++`, **`skillPoints += 1`**. 한 호출당 최대 99회.

### 9.2 레벨 곡선

```
XP_TO_NEXT = [0, 800, 1300, 2000, 2800, 3800, 5200, 7000, 9200, 12000]
XP_AFTER_TABLE = 3000
xpToNextLevel(level):
  lv = max(1, floor(level))
  if lv < XP_TO_NEXT.length:        // lv < 10
    return XP_TO_NEXT[lv]
  return XP_TO_NEXT[9] + 3000 * (lv - 9)
       // 주석: Lv10+ : 12000 + 3000*(level-9)
```

| 현재 Lv | 다음까지 XP | 누적 XP (해당 Lv 도달) |
|---------|-------------|------------------------|
| 1 | 800 | 0 |
| 2 | 1300 | 800 |
| 3 | 2000 | 2100 |
| 4 | 2800 | 4100 |
| 5 | 3800 | 6900 |
| 6 | 5200 | 10700 |
| 7 | 7000 | 15900 |
| 8 | 9200 | 22900 |
| 9 | 12000 | 32100 |
| 10 | 15000 | 44100 |
| 11 | 18000 | 59100 |
| 12 | 21000 | 77100 |
| 13 | 24000 | 98100 |
| 14 | 27000 | 122100 |
| 15 | 30000 | 149100 |
| 16 | 33000 | 179100 |

`xpNeeded` getter = `xpToNextLevel(level)`. HUD 바 `xp / xpNeeded`.

### 9.3 localStorage

- 키: **`md.knightslide.meta.v1`**
- JSON: `{ level, xp, skillPoints, ranks: { <skillId>: number, ... } }`
- 기본: `level:1, xp:0, skillPoints:0`, 모든 랭크 0
- 로드 시 랭크는 `[0, maxRank]`로 클램프. 파싱 실패/쿼터 → 기본값
- 게임오버·새로고침에도 유지. 런 중 구매도 즉시 저장

### 9.4 스킬 포인트

레벨이 오를 때마다 +1. 스킬 `cost`는 전부 **1**.  
`spentPoints()` = Σ `rank * cost`.

### 9.5 스킬 초기화

UI 「스킬 초기화」 + confirm. `meta.resetSkills()`:

- `ranks` 전부 0
- `skillPoints = level - 1`
- 레벨·XP 유지
- 런이 있으면 `game.onSkillsChanged` → 벽/궁수 재동기화

---

## 10. 스킬 전체

트리: 전투 `combat`, 전열 `frontline`, 머지 `merge`, 방어벽 `wall`, 궁수 `archer`.

공통:

```
rankUnlockLevel(skill, rank) = unlockLevel + (rank - 1) * rankLevelStep
rankLevelStep 기본 1 (필드 없으면 1)
구매 조건: 다음 랭크 레벨 충족, requires 스킬 랭크 ≥ 1, 포인트 ≥ cost, 랭크 < effectiveMaxRank
구매는 현재 런에 즉시 반영
```

`archerCount`만 `effectiveMaxRank = min(maxRank, archerMax - 1)` = 기본 `min(4, 2) = 2`.

### 10.1 `launchCd` — 발사 쿨감

- 트리 전투, maxRank **5**, cost 1, unlockLevel **1**, rankLevelStep **2**, requires null
- 해금: R1 Lv1, R2 Lv3, R3 Lv5, R4 Lv7, R5 Lv9
- `perRank = 0.16` 초 감소
- `launchCooldown = max(0.25, 1.15 - rank*0.16)`

| Rank | 레벨 | 쿨(초) |
|------|------|--------|
| 0 | — | 1.15 |
| 1 | 1 | 0.99 |
| 2 | 3 | 0.83 |
| 3 | 5 | 0.67 |
| 4 | 7 | 0.51 |
| 5 | 9 | 0.35 |

하한 0.25에 기본 테이블만으로는 도달하지 않음(어드민이 `launchCooldown`/`launchCdFloor`/`perRank`를 바꿔야 함).

### 10.2 `advance` — 진격 속도

- maxRank 5, unlock Lv1, step 1 → R1–5 = Lv1–5
- `perRank = 0.22` → `advanceMult = 1 + rank*0.22`
- R1 +22% ≈ 22 px/초 … R5 +110% ≈ 37.8 px/초 (전진 1.22× ~ 2.10×)

### 10.3 `regen` — 재생

- maxRank 5, unlock Lv1, step 1
- `perRank = 0.004` → `regenPct = rank*0.004` (최대 HP 비율/초)
- 조건: 교전 중이거나 `_unitNearFront`  
  `y <= (lineY+20+r) + regenNearSlack(48)`
- R1 0.4%/s … R5 2.0%/s

### 10.4 `stopping` — 저지력 증가

- maxRank 5, unlock Lv1, step 1
- `perRank = 0.08` → `stopMult = 1 + rank*0.08`
- R1 +8% … R5 +40%

### 10.5 `higherTier` — 상위 병사 확률

- 트리 머지, maxRank 5, unlockLevel **3**, step 1 → R1–5 = Lv3–7
- `t2PerRank = 0.03`
- `t3StartRank = 3`, `t3PerRank = 0.02`  
  `t3Chance = rank>=3 ? (rank - 2)*0.02 : 0`
- `t2Bonus = rank*0.03`

| Rank | T2 보너스 | T3 확률 | `_rollTier` 대략 (T3 먼저 슬라이스) |
|------|-----------|---------|-------------------------------------|
| 0 | 0 | 0 | T3 0, T2 25%, T1 75% |
| 1 | 3% | 0 | T2 28%, T1 72% |
| 2 | 6% | 0 | T2 31%, T1 69% |
| 3 | 9% | 2% | T3 2%, T2 34%, T1 64% |
| 4 | 12% | 4% | T3 4%, T2 37%, T1 59% |
| 5 | 15% | 6% | T3 6%, T2 40%, T1 54% |

T2 창: `[t3Chance, t3Chance+0.25+t2Bonus)`.

### 10.6 `mergeShock` — 머지 충격

- maxRank 5, unlock Lv3, step 1 → Lv3–7
- `dmgPerRank=18`, `radiusBase=30`, `radiusPerRank=6`, `knockbackPerRank=6`, `healPctPerRank=0.04`
- rank 0이면 효과 `null`

```
dmg = rank * 18
radius = 30 + rank * 6
knockback = rank * 6
healPct = rank * 0.04
```

적용: 머지 위치에서 `hypot <= radius + enemy.r`인 적에게 `dmg`.  
`knockback>0`이면 `lineY = max(LINE_START_Y, lineY - knockback)` 후 전 적 y 재동기.  
합성된 유닛(영웅 포함)에게 `hp += maxHp * healPct`.

| Rank | 피해 | 반경 | 라인 밀치기 | 합성 유닛 회복 |
|------|------|------|-------------|----------------|
| 1 | 18 | 36 | 6px | 4% |
| 2 | 36 | 42 | 12px | 8% |
| 3 | 54 | 48 | 18px | 12% |
| 4 | 72 | 54 | 24px | 16% |
| 5 | 90 | 60 | 30px | 20% |

스킬 UI 설명 문자열은 피해/반경/라인만 보여 주고 **healPct는 UI에 없음**.

### 10.7 `wall` — 방어벽 설치

- maxRank **1** (온/오프), unlockLevel **3**, requires null
- 해금 시 `hasWall`, 기본 HP 3, 기본 밀치기 70px

### 10.8 `wallHp` — 방어벽 강화

- maxRank 5, unlockLevel **5**, requires **`wall`**, step 1 → Lv5–9
- `hpPerRank = 2`
- `wallMaxHp = 3 + rank*2` → 5, 7, 9, 11, 13

### 10.9 `wallKb` — 밀치기 거리

- maxRank 5, unlockLevel **5**, rankLevelStep **2**, requires **`wall`**
- 해금: R1 Lv5, R2 Lv7, R3 Lv9, R4 Lv11, R5 Lv13
- `kbPerRank = 22`
- `wallKnockback = 70 + rank*22` → 92, 114, 136, 158, 180

### 10.10 `archer` — 궁수 해금

- maxRank 1, unlockLevel **8**, requires **`wall`**
- 궁수 수 공식의 베이스 1명. 벽이 깨지면 궁수 배열 비움

### 10.11 `archerCount` — 궁수 수

- maxRank **4** (데이터), 실효 최대 `min(4, archerMax-1)` = **2** (기본 `archerMax=3`)
- unlock Lv8, requires **`archer`**, step 1
- `extraPerRank = 1`
- `archerCount = min(archerMax, 1 + extra)` (해금 시에만)
- R0(해금만): 1명, R1: 2명, R2: 3명. 기본값으로는 R3–4 구매 불가

### 10.12 `archerRange` — 궁수 사거리

- maxRank 5, unlock Lv8, requires `archer`, step 1 → Lv8–12
- `perRank = 36`
- `160 + rank*36` → 196, 232, 268, 304, 340

### 10.13 `archerAtk` — 궁수 공격력

- maxRank 5, unlock Lv8, rankLevelStep **2**, requires `archer`
- 해금: R1 Lv8, R2 Lv10, R3 Lv12, R4 Lv14, R5 Lv16
- `perRank = 4`
- `7 + rank*4` → 11, 15, 19, 23, 27

### 10.14 `archerAmmo` — 궁수 탄약

- maxRank 5, unlock Lv8, requires `archer`, step 1 → Lv8–12
- `perRank = 4` (웨이브당 발수)
- `10 + rank*4` → 14, 18, 22, 26, 30

선행 요약: `wallHp`/`wallKb`/`archer` → `wall`. `archerCount`/`archerRange`/`archerAtk`/`archerAmmo` → `archer`(따라서 간접적으로 벽).

---

## 11. 방어벽

기본 (`PROGRESSION`):

| 키 | 값 |
|----|----|
| `wallBaseHp` | **3** |
| `wallDmgPerHit` | **1** |
| `wallBaseKnockback` | **70** px |

실효: `wallMaxHp = 3 + wallHpRank*2`, `wallKnockback = 70 + wallKbRank*22` (벽 해금 시에만, 아니면 0).

접촉 (`lineY >= DEFEAT_Y` → `_tryWallBlock`):

1. 벽 없거나 broken이거나 hp≤0 → `false` → 패배
2. `hp -= 1`
3. `lineY = max(LINE_START_Y, DEFEAT_Y - kb)` = `max(90, 660 - kb)`
4. 이 충격으로 hp≤0이면 `broken=true`, hp=0, **궁수 전부 제거**, 밀치기는 **적용됨**
5. **다음** 마지노선 접촉은 게임오버

런 중 스킬로 maxHp가 오르면 증가분만큼 현재 hp 회복(캡 max). 내려가면 현재 hp를 max로 클램프. 이미 파괴된 벽은 복구하지 않음.

렌더: 마지노선에 두께 14 회색 바, HP 바, `방어벽 hp / maxHp`.

---

## 12. 궁수

주석: 벽 위에 서서 사거리 안 웨이브라인 적을 사격. **웨이브 솔로 불가**(의도 주석, 코드로 막지는 않음).  
탄약은 웨이브당, 보스 처치(웨이브 증가) 및 런 시작 시 재충전. 소진 시 다음 웨이브까지 정지.

| 키 | 기본값 |
|----|--------|
| `archerMax` | **3** |
| `archerBaseRange` | **160** |
| `archerBaseAtk` | **7** |
| `archerBaseAmmo` | **10** |
| `archerInterval` | **1.05** 초/발 |

수: 해금 시 `min(3, 1 + archerCountRank)`.  
위치: 1명이면 x=225. 다수면 `x = 56 + i * ((450-112)/(n-1))`, `y = DEFEAT_Y - 16` = **644**.  
생성 시 `attackCd = 0.15 + random()*0.5`.  
사격: 가장 가까운 적, `hypot(적, 궁수) <= archerRange` (반지름 미차감).  
발사마다 ammo−1, 쿨 1.05초, 피해 `archerAtk`. 탄 0이면 스킵.  
샷 이펙트 life 0.12초.

재충전:

- 런 시작 `_syncDefenseFromMeta(true)`: ammo = max
- 보스 처치 `_refillArcherAmmo()`: 전원 ammo = 현재 `archerAmmo`
- 런 중 탄약 스킬 랭크 업: max가 오르면 차액만큼 현재 ammo 증가

벽 파괴 또는 `archerCount<=0`이면 궁수 없음.

---

## 13. UI

### 13.1 시작/오버

- 시작 오버레이: 제목, 부제, `레벨 N · XP a / b · 포인트 p`, 「탭하여 시작」. 스킬 패널이 열려 있으면 시작 안 함.
- 패배 오버레이: 「패배」, 최종 점수 줄, 「다시 시작」.
- `#wrap` 450×800, 캔버스 보더 `#5a4630`.

### 13.2 HUD (상단 70px)

- 좌상: `웨이브 N`
- 그 아래: `웨이브 ×{waveMultiplier.toFixed(2)}` + `×{liveMult.toFixed(1)}` + **− / +** 버튼 (0.1 스텝)
- 중앙 상: 보스 중 `보스 전투 중!` 아니면 `처치 {kills} / {killsNeeded}`
- 우상: `점수 {score}`
- 중앙: 라인 순속도 `라인 ─ 정지` (`|v|<0.05`) / `라인 ▼ v` / `라인 ▲ |v|` (소수 1자리). X=248
- 우: 사거리 토글 칩
- 하단: `레벨 N`, XP 바 250×8, `{xp} / {needXp}`, `포인트 n`

발사 가이드: 드래그 중 수직 점선 `aimX`, `LAUNCHER_Y-20` → `lineY+20`.

### 13.3 사거리 토글

`rangeMode` 0→1→2→0 순환. 라벨 `['끄기', '아군만', '전체']`. 기본 **1 (아군만)**. 재시작 유지.

| 모드 | 표시 |
|------|------|
| 0 끄기 | 없음 |
| 1 아군만 | 각 아군 `range` 원 + (벽 생존 시) 궁수 `archerRange` 원 |
| 2 전체 | 위 + 각 적 `r + enemyReach(50)` 원 |

클릭 영역이 발사보다 우선. 조준 드래그 존(y>560)과 HUD(y≈27)는 겹치지 않음.

### 13.4 스킬 패널

- 버튼 「스킬」 (포인트 있으면 `스킬 · N`, 강조). 위치 wrap 안 `left:8px; top:76px`
- 단축키 **K / k / ㅏ**
- 트리별 목록, 해금 레벨·선행, 구매 버튼
- 초기화 버튼
- 열려 있으면 발사·시작 탭 차단

### 13.5 어드민 패널 (A / ⚙)

- 버튼 뷰포트 우상단 「⚙」, 단축키 **A / a / ㅁ** (input 포커스 시 제외)
- 패널 폭 300px, 값 **즉시** 객체 뮤테이션

섹션·필드:

1. **실시간 난이도**: 수동 배율 0.1 단위 stepper, min 0.5 max 5.0. 살아있는 적 HP/ATK/라인 가속 즉시 반영. 기본 HP 테이블은 신규부터(노트 문구).
2. **실시간 리스폰**: 적 스폰 타이머 속도 배율 0.1 단위 stepper, min 0.2 max 5.0. 화면 왼쪽 「리스폰」 −/+ 와 동기화. 재시작해도 유지.
3. **전역 설정**: `baseLineSpeed`, `spawnInterval`, `spawnIntervalAccel`, `spawnIntervalFloor`, `spawnCampRaidMin/Max`, `spawnCampApproachRange`, `spawnCampTouchMult`, `spawnCampApproachEase`, `spawnCampRushFloor`, `launchCooldown`, `launchSpeed`, `unitAdvanceSpeed`, `bossMinAdvance`, `bossEscortCount`, `bossKnightEscorts`, `bossMinionCap`, `bossGatherStrength`, `gatherSpeed`, `attackCooldown`, `enemyReach`, `gentleRate`, `steepStartWave`, `steepFactor`, `steepContinue`, `emptyLinePushScale`, `emptyLinePushSlack`
4. **메타 진행 / 방어**: `bossXpPerWave`, `launchCdFloor`, `regenNearSlack`, `wallBaseHp`, `wallDmgPerHit`, `wallBaseKnockback`, `archerMax`, `archerBaseRange`, `archerBaseAtk`, `archerBaseAmmo`, `archerInterval`
5. **레벨 XP 곡선**: `XP_TO_NEXT[1]`…`[9]` (Lv1→2 … Lv9→10). `XP_AFTER_TABLE`은 어드민에 없음
6. **스킬 수치 (랭크당)**: 각 스킬 해금 Lv / rankLevelStep / maxRank 표시. maxRank>1이면 `rankLevelStep` 편집. 편집 키: `perRank`, `t2PerRank`, `t3PerRank`, `t3StartRank`, `dmgPerRank`, `radiusBase`, `radiusPerRank`, `knockbackPerRank`, `healPctPerRank`, `hpPerRank`, `kbPerRank`, `extraPerRank`
7. **적 스탯**: 각 몬스터 HP, ATK, 라인 가속(speed). 트롤은 `regenDelay`·`regenPct`
8. **아군 스탯**: 각 티어 HP, ATK, 저지력, 사거리 (mass·r·name·color는 없음)

### 13.6 라이브 난이도 조작

- HUD −/+
- 키보드 `+` `=` `]` NumpadAdd / `-` `_` `[` NumpadSubtract
- 어드민 stepper·직접 입력
- 변경 시 플로팅 `난이도 ×N.N`

### 13.7 라이브 리스폰 조작

- 화면 왼쪽 크롬 「리스폰」 −/+ (`#liveSpawnBar`)
- 어드민 「실시간 리스폰」 stepper·직접 입력
- 변경 시 플로팅 `리스폰 ×N.N`

---

## 14. 원 기획/문서 대비 확인된 편차

저장소에 별도 PRD 파일은 없다. README·주석·구현 불일치만 적는다.

1. **README는 슬링샷 당김**을 말하지만, 구현은 하단 X 조준 + **수직 등속 발사**. 각도 조준 없음. 드래그 시작은 `y>560`.
2. **머지 만피 요구 없음.** 감혈 유닛도 동티어 충돌 시 합성. (리뷰 체크리스트에 “만피 머지”가 있다면 현재 코드와 다름.)
3. README 패배 조건은 「마지노선 접촉 즉시 게임오버」. **벽 스킬 해금 시** 접촉은 충격·밀치기이고, 파괴 후 다음 접촉이 게임오버.
4. README는 적 수에 따른 라인 가속만 설명. 구현은 `speed` 합 + `liveMult`이며, **스켈레톤 speed=1**, **보스는 12**.
5. **라인 가속에 `waveMultiplier` 미적용.** HP/ATK만 웨이브 곡선. 후반 라인 압박은 보스 speed·개체 수·liveMult 중심.
6. **트롤 재생은 maxHp 비율**이라 웨이브가 올라도 비전투 회복 체감이 유지됨. 맞는 중에는 재생하지 않음.
7. 궁수 「웨이브 솔로 불가」는 주석 의도일 뿐, 사격 자체는 라인/아군과 독립.
8. T5–T9 특수·영웅 스킬 수치는 `UNITS[].special` / `HEROES` 테이블. T2 기본 확률은 `LAUNCH_T2_BASE`.
9. T2 기본 25%는 `_rollTier`에서 `LAUNCH_T2_BASE`를 읽음.
10. 머지 충격 회복(`healPct`)은 적용되지만 스킬 UI 설명에서 빠짐.
11. `archerCount.maxRank=4`이나 기본 `archerMax=3`이면 실효 최대 랭크 2.
12. 영웅은 사명 피해 쿼터(80000) 또는 HP 사망으로만 퇴장. 승천 시 T5가 전열을 이음.
13. 발사/전진/집결은 `vel = pxPerSec * stepMs / 1000` (`stepMs = min(dt*1000, 33.33)`). `launchSpeed` 기본 1080 px/초.
14. 시작 `spawnTimer=1.5`는 첫 간격 공식과 별개(첫 적은 약 1.5초 후).

---

## 15. 검증 포인트 (Gemini 스트레스 테스트)

밸런스

- W1 보스(HP 2300, speed 38) vs 조기 T1/T2만으로 마지노선(570px 여유) 전에 처치 가능한지. speed 38이 `baseLineSpeed` 6을 압도함.
- W11부터 HP/ATK ×1.3 누적 vs 아군은 머지·메타만으로 성장. 라인 speed는 웨이브 배율을 안 받으므로 “스탯은 폭증, 라인은 보스·머릿수” 구조가 의도인지.
- 스켈레톤(speed 0) 비중 증가 시 라인은 느린데 DPS 체크만 길어지는지.
- 트롤 비전투 재생(피격 1.2초 후 maxHp 18%/초)이 전열을 막는지, 계속 때리면 재생이 꺼지는지.
- 영웅 사명 80000 vs T10 기본 6500/0.8s·아서 광역. 승천 시 라인 리셋 + T5. HP 사망 시 보상 없음.
- 빈 라인 푸시: 전열 T1 stop 4px/s로 라인을 90까지 올리는 시간이 보스 경고 1.6초와 맞물리는지.
- 궁수 기본 7 dmg / 1.05s / 10발 vs W1 고블린 40HP — 주석대로 웨이브 솔로가 정말 안 되는지, 탄약·사거리 올리면 우회되는지.
- `higherTier` R5(T3 6% + T2 40%)가 머지 속도를 붕괴시키는지.
- 레벨 곡선: W1 보스 XP ≈ 점수(잡몹+500) + 200이 Lv2(800)에 근접하는지(주석 목표).

익스플로잇·충돌

- 만피 없이 부상 유닛 머지 → 사실상 힐 + (충격 스킬 시) 추가 힐·광역.
- 머지 충격 넉백으로 마지노선 직전 라인을 리셋. 벽과 이중 세이브.
- 보스 경고 1.6초 동안 적 0이면 전열이 라인을 90까지 올림 → 보스 스폰 위치 유리.
- `liveMult`를 0.5로 내려 기존 적 HP를 깎고, ATK/라인도 즉시 약화. 재시작 후에도 유지.
- 스킬 런 중 구매: 벽 HP 증가·궁수 추가가 위기 상황에서 즉시 개입.
- 스킬 초기화가 `level-1`로 포인트를 맞추므로, 어드민으로 랭크 cap만 바꾼 세이브와 불일치 가능.
- T8 화상 덮어쓰기, T6 기절로 보스 speed 38 차단(0.5초). 기절 중 라인 기여 0.
- 아군이 라인을 못 넘는 불변식(14+r) vs 홀드(20+r) vs 빈라인 전열 슬랙 32 vs 재생 슬랙 48 — 전열/재생/푸시 조건이 서로 다른 거리.
- 슬롯 210칸(30×7) 가득 차면 겹침 무시 스폰. 보스는 슬롯 미점유라 밀집 가능.
- Matter 충돌 머지가 한 프레임 다체 충돌에서 큐 순서에 따라 연쇄/손실되는지.
- 발사 존 y>560과 스킬 버튼(top 76)은 분리. 어드민 A키와 한글 ㅁ, 스킬 K/ㅏ.
- 고dt 캡 0.05 vs 물리 캡 33.33ms vs `/60` 속도 — 탭 백그라운드 후 점프.

시스템 충돌

- 잔느 ×1.5는 기본공격·T5 클레브만, T7/T9/영웅 스킬·궁수는 미적용.
- 전진은 교전해도 홀드선까지 감. 집결은 기본값에서 교전 유닛 제외 → 전열이 보스 열이 아니면 가로 정렬이 안 됨 (`strength` 0.6 < 0.7).
- 벽 파괴 시 궁수 삭제. 벽 강화만으로는 파괴된 벽 미복구.
- 보스 처치가 탄약 리필의 유일한 웨이브 리필(런 시작 제외). 보스를 오래 못 잡으면 궁수 침묵.
- XP=점수라 저티어 양산 킬 파밍 vs `bossXpPerWave*wave` 200 보너스 비중.
- `gentleRate`/`steepFactor`/`steepContinue`를 어드민에서 바꾸면 이미 나온 적의 `waveMult` 스냅샷은 그대로, 신규만 새 곡선.

---

*문서 생성 기준: 워크스페이스 소스 현재 구현. 어드민으로 바꾼 런타임 값은 이 기본값과 다를 수 있다.*
