# KnightSlide — Gemini 이미지 생성 프롬프트 팩

게임에 넣을 **유닛 스프라이트 / 배경**을 직접 만들 때 쓰는 프롬프트 모음입니다.

이미지 모델은 **영어 프롬프트**가 훨씬 잘 먹습니다. 아래 영어 블록을 **그대로 복사**해서 Gemini 이미지 생성(또는 “Nano Banana”)에 붙여 넣으세요. 한국어로 번역하거나 문장을 빼지 마세요.

한 장당 **프롬프트 하나**. 스타일 락 문장은 모든 프롬프트에 이미 들어 있습니다.

생성 후 PNG로 저장해 아래 **파일 이름**으로 주시면 됩니다. 우리가 게임에 붙입니다.

---

## 공통 규칙 (읽을 것)

- **아군 T1–T10**: 카메라는 플레이어 시점. 유닛은 **등만** 보인다. 위로(화면 위쪽) 걸어가는 자세. 얼굴·정면 금지. 발은 프레임 하단. 전신. 실루엣이 또렷해야 함.
- **적**: 카메라를 **정면**으로 보며 걸어온다 (남하). 얼굴이 보인다.
- **배경**: 유닛·UI·문자 없음. 불투명.
- 아군/적은 **투명 배경**. 배경은 **불투명**.
- 티어가 올라갈수록 갑옷·망토·무기가 커지고 화려해진다. 같은 시리즈처럼 보이게.

---

## 아군 T1–T10 (등 뒤, 512×512, 투명 PNG)

### `ally_t1.png` — Militia / 민병대

```
2D game sprite, thick black comic outline, bold cel-shaded medieval cartoon, vibrant colors, clean shapes, no photorealism, no text, no UI, no watermark. Square 512x512, fully transparent background, single character only, centered, full body, readable silhouette. Viewed STRICTLY FROM BEHIND, walking away from camera UP the screen, back of head and back of torso visible, NO face, NO front view. Feet planted at the BOTTOM of the frame, small ground shadow under feet only. T1 Militia peasant soldier: small skinny man, tan beige padded tunic #D2B48C, simple brown leather belt, cheap iron cap helmet seen from behind, wooden round shield on his back, holding a short spear pointing upward. Rough peasant boots. Humble, low-tier, readable simple shapes.
```

### `ally_t2.png` — Recruit / 신병

```
2D game sprite, thick black comic outline, bold cel-shaded medieval cartoon, vibrant colors, clean shapes, no photorealism, no text, no UI, no watermark. Square 512x512, fully transparent background, single character only, centered, full body, readable silhouette. Viewed STRICTLY FROM BEHIND, walking away from camera UP the screen, back of head and back of torso visible, NO face, NO front view. Feet planted at the BOTTOM of the frame, small ground shadow under feet only. T2 Recruit: slightly larger than militia, dusty khaki tunic #C2A679, leather vest, better iron helmet from behind, kite shield on his back, longer spear pointing up. Still a beginner soldier, a bit more trained than a peasant.
```

### `ally_t3.png` — Light Infantry / 경보병

```
2D game sprite, thick black comic outline, bold cel-shaded medieval cartoon, vibrant colors, clean shapes, no photorealism, no text, no UI, no watermark. Square 512x512, fully transparent background, single character only, centered, full body, readable silhouette. Viewed STRICTLY FROM BEHIND, walking away from camera UP the screen, back of head and back of torso visible, NO face, NO front view. Feet planted at the BOTTOM of the frame, small ground shadow under feet only. T3 Light Infantry: bronze-colored brigandine #CD7F32, short mail coif under a bronze nasal helmet seen from behind, small heater shield on the back, one-handed arming sword on the right hip pointing up-right. Athletic mid-tier soldier, clean cartoon shapes.
```

### `ally_t4.png` — Heavy Infantry / 중보병

```
2D game sprite, thick black comic outline, bold cel-shaded medieval cartoon, vibrant colors, clean shapes, no photorealism, no text, no UI, no watermark. Square 512x512, fully transparent background, single character only, centered, full body, readable silhouette. Viewed STRICTLY FROM BEHIND, walking away from camera UP the screen, back of head and back of torso visible, NO face, NO front view. Feet planted at the BOTTOM of the frame, small ground shadow under feet only. T4 Heavy Infantry: bulky slate-gray plate and mail #708090, wide kettle helmet from behind, large tower shield on the back, heavy arming sword. Thick legs, stomping walk, tanky silhouette, still clearly a human soldier.
```

### `ally_t5.png` — Knight / 기사단원

```
2D game sprite, thick black comic outline, bold cel-shaded medieval cartoon, vibrant colors, clean shapes, no photorealism, no text, no UI, no watermark. Square 512x512, fully transparent background, single character only, centered, full body, readable silhouette. Viewed STRICTLY FROM BEHIND, walking away from camera UP the screen, back of head and back of torso visible, NO face, NO front view. Feet planted at the BOTTOM of the frame, small ground shadow under feet only. T5 Knight of the Order: polished steel-blue plate armor #4682B4, closed great helm with a short crest seen from behind, white-and-blue tabard, longsword held high. First true knight look, gleaming pauldrons, no cape yet.
```

### `ally_t6.png` — Guard Captain / 근위대장

```
2D game sprite, thick black comic outline, bold cel-shaded medieval cartoon, vibrant colors, clean shapes, no photorealism, no text, no UI, no watermark. Square 512x512, fully transparent background, single character only, centered, full body, readable silhouette. Viewed STRICTLY FROM BEHIND, walking away from camera UP the screen, back of head and back of torso visible, NO face, NO front view. Feet planted at the BOTTOM of the frame, small ground shadow under feet only. T6 Guard Captain: royal blue ornate plate #4169E1, gold trim, short dark-blue officer cloak hanging from the shoulders, plumed helmet seen from behind, ornate longsword. Commander's presence, still a single soldier sprite.
```

### `ally_t7.png` — Paladin / 성기사

```
2D game sprite, thick black comic outline, bold cel-shaded medieval cartoon, vibrant colors, clean shapes, no photorealism, no text, no UI, no watermark. Square 512x512, fully transparent background, single character only, centered, full body, readable silhouette. Viewed STRICTLY FROM BEHIND, walking away from camera UP the screen, back of head and back of torso visible, NO face, NO front view. Feet planted at the BOTTOM of the frame, small ground shadow under feet only. T7 Paladin: shining golden plate armor #FFD700, white-and-gold surcoat, holy warhammer raised, thin golden halo ring behind the helmet (back view only). Radiant but not photoreal, no facial features, sacred knight marching away.
```

### `ally_t8.png` — Dragon Guardian / 드래곤가디언

```
2D game sprite, thick black comic outline, bold cel-shaded medieval cartoon, vibrant colors, clean shapes, no photorealism, no text, no UI, no watermark. Square 512x512, fully transparent background, single character only, centered, full body, readable silhouette. Viewed STRICTLY FROM BEHIND, walking away from camera UP the screen, back of head and back of torso visible, NO face, NO front view. Feet planted at the BOTTOM of the frame, small ground shadow under feet only. T8 Dragon Guardian: dark crimson plate #8B0000, dragon-scale pauldrons, long blood-red cape flowing down the back, two small red banner fins on the helm, huge two-handed greatsword on the right side. Menacing elite, still a human in armor, no actual dragon body.
```

### `ally_t9.png` — Marshal / 대원수

```
2D game sprite, thick black comic outline, bold cel-shaded medieval cartoon, vibrant colors, clean shapes, no photorealism, no text, no UI, no watermark. Square 512x512, fully transparent background, single character only, centered, full body, readable silhouette. Viewed STRICTLY FROM BEHIND, walking away from camera UP the screen, back of head and back of torso visible, NO face, NO front view. Feet planted at the BOTTOM of the frame, small ground shadow under feet only. T9 Grand Marshal: imperial indigo-purple armor #4B0082, heavy gold filigree, long royal purple cape, war standard pole with a purple banner on the right, horned or winged marshal helm from behind. Supreme commander silhouette, larger than T8, still one character.
```

### `ally_t10.png` — Legendary Hero / 영웅

```
2D game sprite, thick black comic outline, bold cel-shaded medieval cartoon, vibrant colors, clean shapes, no photorealism, no text, no UI, no watermark. Square 512x512, fully transparent background, single character only, centered, full body, readable silhouette. Viewed STRICTLY FROM BEHIND, walking away from camera UP the screen, back of head and back of torso visible, NO face, NO front view. Feet planted at the BOTTOM of the frame, small ground shadow under feet only. T10 Legendary Hero: the largest ally. Golden-orange legendary plate #FF4500 mixed with bright gold, a LONG GOLDEN CLOAK filling much of the back silhouette, glowing gold sword, small gold sparks around the shoulders only. Heroic, mythic, still a single human knight from behind — not a god, not a crowd, no face.
```

---

## 적 (정면, 512×512, 투명 PNG)

### `enemy_goblin.png` — Goblin / 고블린

```
2D game sprite, thick black comic outline, bold cel-shaded medieval cartoon, vibrant colors, clean shapes, no photorealism, no text, no UI, no watermark. Square 512x512, fully transparent background, single character only, centered, full body, readable silhouette. Viewed STRICTLY FROM THE FRONT, facing the camera, marching TOWARD the viewer, angry cartoon face visible. Feet at the BOTTOM of the frame, small ground shadow under feet only. Goblin: small wiry green goblin #3CB371, pointed ears, red eyes, ragged brown loincloth, crude rusty spear or hatchet raised. Lowest-tier monster, hunched, mischievous, clearly weaker than an orc.
```

### `enemy_orc.png` — Orc / 오크

```
2D game sprite, thick black comic outline, bold cel-shaded medieval cartoon, vibrant colors, clean shapes, no photorealism, no text, no UI, no watermark. Square 512x512, fully transparent background, single character only, centered, full body, readable silhouette. Viewed STRICTLY FROM THE FRONT, facing the camera, marching TOWARD the viewer, angry cartoon face visible. Feet at the BOTTOM of the frame, small ground shadow under feet only. Orc: stocky olive-green orc #6B8E23, tusks, heavy brow, crude iron axe, leather harness, bulky arms. Mid-tier brute, bigger than a goblin, smaller than a troll.
```

### `enemy_skeleton.png` — Skeleton / 스켈레톤

```
2D game sprite, thick black comic outline, bold cel-shaded medieval cartoon, vibrant colors, clean shapes, no photorealism, no text, no UI, no watermark. Square 512x512, fully transparent background, single character only, centered, full body, readable silhouette. Viewed STRICTLY FROM THE FRONT, facing the camera, marching TOWARD the viewer. Feet at the BOTTOM of the frame, small ground shadow under feet only. Skeleton warrior: bone-white skull face #DCDCDC with empty black eye sockets, visible ribcage, rusty sword, tattered dark cloth. Undead soldier, not a pile of bones, full body standing, cartoon not horror-gore.
```

### `enemy_troll.png` — Cave Troll / 동굴 트롤

```
2D game sprite, thick black comic outline, bold cel-shaded medieval cartoon, vibrant colors, clean shapes, no photorealism, no text, no UI, no watermark. Square 512x512, fully transparent background, single character only, centered, full body, readable silhouette. Viewed STRICTLY FROM THE FRONT, facing the camera, marching TOWARD the viewer, angry cartoon face visible. Feet at the BOTTOM of the frame, small ground shadow under feet only. Cave Troll: huge hulking moss-green troll #556B2F, stone-like knobby skin, tiny angry eyes, massive club or boulder fist, hunched ape-like posture. Fills most of the square, still fully inside the frame, larger than orc, smaller than the boss.
```

### `enemy_boss.png` — Orc Warlord / 오크 워로드

```
2D game sprite, thick black comic outline, bold cel-shaded medieval cartoon, vibrant colors, clean shapes, no photorealism, no text, no UI, no watermark. Square 512x512, fully transparent background, single character only, centered, full body, readable silhouette. Viewed STRICTLY FROM THE FRONT, facing the camera, marching TOWARD the viewer, roaring cartoon face visible. Feet at the BOTTOM of the frame, small ground shadow under feet only. Orc Warlord BOSS: much larger presence than a normal orc, still one character inside the 512 square. Crimson-red warlord armor #B22222, horned iron helm, white tusks, huge two-handed war axe, spiked shoulder plates, intimidating bulk. Boss of the wave, not a landscape, no minions, no throne.
```

---

## 배경 (불투명, 세로 초상)

유닛·병사·궁수·UI·글자·워터마크 없음. 스타일은 유닛과 동일하게 잠근다.

### `bg_field.png` — 초원 전장 + 중앙 흙길 (450×800)

전체 전투 캔버스. 위는 하늘/먼 언덕이 살짝만, 대부분은 풀밭. **가운데 세로 흙길만**. 유닛·텐트·성벽·UI 넣지 말 것.

```
2D game sprite, thick black comic outline, bold cel-shaded medieval cartoon, vibrant colors, clean shapes, no photorealism, no text, no UI, no watermark. Vertical portrait background 450x800 pixels, OPAQUE, no transparency. Top-down-ish 2D battlefield viewed from a high 2D camera, same as a mobile tower-defense map. Lush vibrant green grass field filling the canvas, subtle checker or patchwork grass texture, cartoon clover and grass clumps. A single dirt path of packed tan earth running VERTICALLY through the CENTER from near the top to near the bottom, about 40 percent of the width, soft grassy edges. Soft blue-green sky only in a thin band at the very top. NO units, NO soldiers, NO monsters, NO tents, NO castle, NO UI, NO banners, NO people, NO animals.
```

### `bg_camp.png` — 상단 몬스터 야영 목책 (450×90)

게임에서 캔버스 **맨 위 90px**에 깔리는 스트립. 450×90으로 뽑거나, 450×800을 뽑은 뒤 위 90px만 써도 됩니다. 아래는 잘려도 되는 여분.

```
2D game sprite, thick black comic outline, bold cel-shaded medieval cartoon, vibrant colors, clean shapes, no photorealism, no text, no UI, no watermark. Horizontal strip 450x90 pixels, OPAQUE, no transparency. This is the TOP 90 pixels of an 800-pixel-tall vertical battlefield. Monster siege camp palisade: row of sharpened wooden logs across the bottom of this strip, crude orc tents, a burning wooden gatehouse in the center, orange fire glow, gray smoke, distant overcast sky. Looking slightly downward at the camp edge. NO soldiers, NO goblins, NO orcs standing, NO people, NO UI, NO text. Empty camp scenery only.
```

### `bg_wall.png` — 하단 석조 성벽 (450×140)

게임에서 마지노선(Y 660) 아래를 덮는 벽. **총안(배틀먼트)만**. 궁수·병사·깃발 인물 금지.

```
2D game sprite, thick black comic outline, bold cel-shaded medieval cartoon, vibrant colors, clean shapes, no photorealism, no text, no UI, no watermark. Horizontal slice 450x140 pixels, OPAQUE, no transparency. Bottom of a vertical battlefield: massive gray stone castle wall filling the frame, merlons and crenellations along the TOP edge, weathered cartoon masonry blocks, thick black outlines. Clean empty battlement walkway. NO archers, NO soldiers, NO people, NO faces, NO banners with text, NO UI. Stone plus crenellations only.
```

### `bg_forest.png` — (선택) 측면 벌목용 소나무 숲 패널

전장 좌우 인셋(3칸/5칸일 때)에 까는 세로 숲. 좁은 세로 패널로 그려도 되고, 450×800에서 한쪽 가장자리 숲만 강조해도 됩니다.

```
2D game sprite, thick black comic outline, bold cel-shaded medieval cartoon, vibrant colors, clean shapes, no photorealism, no text, no UI, no watermark. Vertical side panel, about 100x800 or 450x800 with dense forest packed to one side, OPAQUE, no transparency. Dense cartoon pine forest wall: stacked evergreen trees, dark green foliage, brown trunks, deep shadow, as a side margin of a vertical battlefield. No dirt path required. NO units, NO people, NO cabins, NO UI, NO text.
```

---

## AI에게 넘기는 방법

1. 위 영어 프롬프트를 **한 장씩** Gemini 이미지 생성 / Nano Banana에 붙여 넣습니다.
2. 아군·적이 흰 배경으로 나오면, 가능하면 **투명 PNG**로 다시 뽑거나, 나중에 우리가 키잉합니다. 이상적인 건 처음부터 투명.
3. 파일 이름은 아래와 **완전히 같게** 저장합니다 (소문자, 언더스코어).

| 파일 | 내용 | 크기 | 배경 |
|------|------|------|------|
| `ally_t1.png` | Militia 민병대, 등 | 512×512 | 투명 |
| `ally_t2.png` | Recruit 신병, 등 | 512×512 | 투명 |
| `ally_t3.png` | Light Infantry 경보병, 등 | 512×512 | 투명 |
| `ally_t4.png` | Heavy Infantry 중보병, 등 | 512×512 | 투명 |
| `ally_t5.png` | Knight 기사단원, 등 | 512×512 | 투명 |
| `ally_t6.png` | Guard Captain 근위대장, 등 | 512×512 | 투명 |
| `ally_t7.png` | Paladin 성기사, 등 | 512×512 | 투명 |
| `ally_t8.png` | Dragon Guardian 드래곤가디언, 등 | 512×512 | 투명 |
| `ally_t9.png` | Marshal 대원수, 등 | 512×512 | 투명 |
| `ally_t10.png` | Legendary Hero 영웅, 금색 망토 등 | 512×512 | 투명 |
| `enemy_goblin.png` | Goblin, 정면 | 512×512 | 투명 |
| `enemy_orc.png` | Orc, 정면 | 512×512 | 투명 |
| `enemy_skeleton.png` | Skeleton, 정면 | 512×512 | 투명 |
| `enemy_troll.png` | Cave Troll, 정면 | 512×512 | 투명 |
| `enemy_boss.png` | Orc Warlord, 정면 (보스) | 512×512 | 투명 |
| `bg_field.png` | 초원 + 중앙 흙길 | 450×800 | 불투명 |
| `bg_camp.png` | 상단 목책 야영지 | 450×90 (또는 450×800의 상단) | 불투명 |
| `bg_wall.png` | 하단 성벽, 궁수 없음 | 450×140 | 불투명 |
| `bg_forest.png` | (선택) 측면 소나무 숲 | 세로 패널 | 불투명 |

4. PNG만. JPG/WebP는 가능하면 피하세요 (투명·가장자리).
5. 아군이 정면으로 나왔거나, 벽에 궁수가 들어갔으면 같은 프롬프트로 다시 뽑으세요. “from behind / NO face”, “NO archers, NO soldiers”가 핵심입니다.
6. 폴더에 모아 주시면 게임에 드롭합니다. 지금 코드는 캔버스 베이크 플레이스홀더를 씁니다.
