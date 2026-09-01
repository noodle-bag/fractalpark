# FRM-like v1 작성자 매뉴얼

- Locale: ko
- Source manual SHA-256: e5168f1a0211596659314d748fa53825892a2a6f089350e636a8c0baf3903758
- AI가 생성한 번역 후보이며, 기술·로캘·관리자 검토 상태는 이 문서 밖에서 관리돼요.
- Language: FractalPark FRM-like Language v1 (`frm-like/1`)
- Date: 2026-08-20
- Normative reference: [영어 규범 참조 문서: FractalPark FRM-like Language v1](../specs/frm-like-language-v1.md)
- Formula Records: `/ko/formulas/<formulaId>` on FractalPark

이 매뉴얼에서는 작은 Definition을 읽고 수정하면서 언어를 배워요.
공개된 Standard 수식은 현재 이 언어를 사용해요. 정식 v1 작성기/가져오기
활성화는 아직 게이트로 제한돼 있어요.

## 1. 지금 할 수 있는 일

FractalPark은 현재 677개의 Standard 식별자를 제공해요. 공개된 Definition은 534개,
보류된 Record는 143개예요.

공개된 Record에서는 다음을 할 수 있어요.

- 식별 정보, 출처, 권리 결정, 소스 리비전, Profile을 확인할 수 있어요.
- 고정된 `.frm` Definition 소스를 보거나 내려받을 수 있어요.
- 고정된 Definition과 Profile을 Explore에서 열 수 있어요.
- Standard 소스를 바꾸지 않고 익명 Remix를 시작할 수 있어요.

보류된 Record는 사용할 수 없는 이유를 설명해요. 소스, 실행, 편집, Remix 동작은
없어요. 카탈로그에 있다고 해서 런타임에서 사용할 수 있다는 뜻은 아니에요.

독립형 FRM Editor는 계속해서 Classic-compatible 저작 표면이에요.
정식 FRM-like v1 작성기와 가져오기 활성화는 아직 게이트로 제한돼 있어요. 이 매뉴얼의 예제는
프로덕션 v1 파서, CPU/GLSL 아티팩트 생성, 유한한 CPU 단계 두 번으로 검증된 실행 가능한 v1
Definition이지만, 현재 독립형 Editor는 정식 v1 붙여넣기 대상이 아니에요. 활성 Standard
소스는 Formula Records에서 확인하고, Classic-compatible Editor 워크플로에는 기존 FRM Guide를
사용하세요.

## 2. 공개된 Definition 읽기

공개된 Definition은 세 가지 의미론 지시문으로 시작해요.

```text
; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
```

이 지시문은 언어, 함수 어휘, 수치 동작을 고정해요. Classic 독자가 허용할 수 있도록
주석처럼 보이지만, FractalPark은 이를 의미론 입력으로 처리해요. 하나를 제거, 중복,
수식 헤더 뒤에 배치하거나 변경하면 Definition이 무효가 돼요. 서두 안에서 세 지시문의
순서를 바꾸는 것은 유효하지만, 정식 출력은 위에 보인 순서를 복원해요.

마이그레이션된 소스에는 선택적으로
`; @classic-guards: zero-division, floored-log, hyperbolic-clamp` 지시문 하나가 있을 수도 있어요.
정식 출력은 이를 `@numeric-profile` 바로 뒤에 둬요. 검토된 호환성 근거를 기록하므로 작성자는
직접 추가, 제거, 편집해서는 안 돼요. [규범 §5](../specs/frm-like-language-v1.md#5-standard-library-v1)를 보세요.

본문에는 수식 이름 하나와 필수 실행 섹션 세 개가 있어요.

```frm
; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
FirstOrbit {
  init:
    z = 0
  loop:
    z = z ^ 2 + c
  bailout:
    |z| <= 4
}
```

여기서 `|z| <= 4`는 반지름 4를 뜻해요. Classic의 제곱 크기 임계값 `4`는
`|z| <= 2`에 해당하므로, 마이그레이션할 때는 숫자만 복사하지 말고 의미를 번역해야 해요.

단항 마이너스도 흔한 `^` 우선 해석 및 Classic 해석과 달라요. v1은
`-z ^ 2`를 `(-z) ^ 2`로 읽어요. 마이그레이션할 때는 모호한 표기를 복사하지 말고
의도한 부호를 표현하는 괄호를 추가하세요.

반복 순서대로 읽어 보세요.

1. `init`는 각 픽셀마다 오빗 상태를 한 번 설정해요.
2. 매 `loop` 전에 FractalPark은 `z`를 `zPrev`로 스냅샷해요.
3. `loop`는 소스 순서대로 오빗을 갱신해요.
4. `bailout`은 “반복을 계속할까요?”라고 답해요. 결과가 거짓이면 멈춰요.

`|z|`는 제곱 크기가 아니라 실제 복소수 크기예요. 따라서 이 예제는 오빗 반지름이
4 이하인 동안 계속돼요.

Formula Record는 정확한 소스를 `sourceRevision`으로 고정하고 Profile도 별도로 고정해요.
Profile은 카메라, 반복 횟수, 모드, Julia 상수, 팔레트, 색칠을 담당해요. 이런 표시 선택은
Definition에 속하지 않아요.

## 3. Definition 작성하기

위의 가장 작은 구조로 시작하세요. 수식 이름과 변수에는 ASCII 문자, 숫자, 밑줄을 사용하며
첫 글자는 숫자일 수 없어요. 물리적 줄마다 문을 하나만 두세요.

유용한 시스템 및 호스트 값은 다음과 같아요.

- `pixel`: 현재 평면 좌표예요.
- `c`: 런타임에서 선택한 수식 상수예요.
- `z`: 쓸 수 있는 오빗 상태예요.
- `zPrev`: 런타임이 유지하는 이전 반복의 오빗 값이에요.
- `LastSqr`: 가장 최근에 완료된 `loop` 끝에서의 `z` 제곱 크기를 런타임이 유지한 값이에요.
  제곱 크기가 binary32를 넘는 유한 `z`에서는 이 결정 채널이 단계를 끝내지 않고 양의 무한대로
  포화돼요. 그래도 소스에서 그 값을 읽으면 `nonFinite`가 발생해요.
- `ismand`: 매개변수 평면(`true`)과 Julia(`false`) 모드예요.
- `pi`, `e`, `maxit`예요.
- Classic 상호운용 입력 `p1`-`p5`는 직접 읽을 수 있어요. 바인딩되지 않은 슬롯은 CPU에서 복소수
  영이고, 적합한 GLSL 호스트에서도 반드시 복소수 영이어야 해요. `classic pN` 바인딩은 맨 슬롯과
  이름 있는 매개변수가 같은 값으로 해석되게 해요. 그리고
- Classic 함수 슬롯 `fn1`-`fn4`는 호출하려면 먼저 `classic fnN` 바인딩이 일치하는 이름 있는 함수
  매개변수가 필요해요.

`zPrev`와 `LastSqr`는 외부 호스트 입력이 아니며 재정의해서는 안 돼요.
상태 표현식에 사용할 수 있는 함수는 [표준 라이브러리 빠른 참조](#standard-library-quick-reference)를 보세요.

이 Definition은 매개변수 평면과 Julia 모드 모두에서 작동해요.

```frm
; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
ModeAwarePower {
  parameters:
    power: real = 2 domain [1, 16]
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z = z ^ power + c
  bailout:
    |z| <= 64
}
```

§3에 나열한 시스템 값 또는 Classic 슬롯, 매개변수, 상수, stdlib 이름에는 할당하지 마세요.
`z`만 쓸 수 있는 시스템 값이에요. 새롭고 합법적인 할당 이름은 지역 변수를 만들지만, 이후 할당도
같은 타입을 유지해야 해요.

표현식은 산술, 비교, 논리 연산자, 단항 마이너스와 not, 함수 호출, 괄호, 복소수 리터럴, 크기 막대를
지원해요. `^`는 오른쪽 결합이에요. FractalPark은 부동 소수점 연산을 조용히 재배열하지 않고 소스 순서와
왼쪽에서 오른쪽 순서로 평가해요. 정식 v1 포매터 형식은 크기 막대를 중첩해서는 안 되며, 안쪽 모듈러스에는
`cabs(...)`를 사용하세요. 단항 마이너스는 거듭제곱보다 더 강하게 결합하므로 `-z ^ 2`는 `(-z) ^ 2`를 뜻해요.

## 4. 매개변수 추가하기

선택적인 `parameters` 섹션을 `init` 앞에 두세요. 매개변수에는 세 가지 유형이 있어요.

- `real`: 유한한 스칼라로, 선택적으로 양 끝값을 포함하는 `domain [min, max]`를 지정할 수 있어요.
- `complex`: 리터럴 기본값 `(real, imaginary)`예요.
- `function`: 단항 stdlib 함수 이름이에요.

이름 있는 매개변수에는 고유한 Classic 바인딩을 기록할 수 있어요. `real` 또는 `complex`
매개변수는 `p1`-`p5`에만, 함수 매개변수는 `fn1`-`fn4`에만 바인딩하세요.
바인딩은 마이그레이션과 상호운용성을 지원하며, 소스에서는 이름 있는 매개변수를 사용해야 해요.

```frm
; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
FunctionGarden {
  parameters:
    scale: real = 0.5 domain [0, 2] classic p1
    offset: complex = (-0.2, 0.1) classic p2
    transform: function = sin classic fn1
  init:
    z = pixel
  loop:
    z = transform(z) * scale + offset + c / maxit
  bailout:
    LastSqr < 576
}
```

하드 도메인은 검증되는 의미론 한계예요. 제안 범위를 벗어난 값도 유효하다면 그 소프트 범위는
대신 Profile 또는 Record에 두세요.

함수 매개변수는 `sqr`, `sin`, `log`, `identity` 같은 단항 stdlib 이름을 받아들여요.
`atan2`는 인수가 두 개라 함수 매개변수로 선택할 수 없어요. `real`, `imag`, `cabs`를 선택하면
스칼라 결과는 허수 성분이 영인 복소수 값으로 승격돼요. 이 예제는 계속 여부의 임계값으로 런타임이 유지하는
제곱 크기 `LastSqr`를, `c` 기여도를 조절하는 데 호스트 반복 상한 `maxit`도 사용해요.
선택 가능한 전체 집합은 [표준 라이브러리 빠른 참조](#standard-library-quick-reference)를 보세요.

## 5. 상태와 제어 흐름 사용하기

`if`, `elseif`, `else`, `endif`는 불리언 조건에서 동작해요. 모든 경로에서 초기화된 경우에만
분기 뒤에 지역 변수를 읽을 수 있어요. 이 규칙은 오래된 값이나 백엔드별 값에 의존할 수식을 거부해요.

성분 할당은 이미 초기화된 복소수 값의 한 부분을 갱신해요.

```frm
; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
OrbitMemory {
  parameters:
    feedback: complex = (0.3, -0.12)
    bias: real = 0.05 domain [-1, 1]
  init:
    z = pixel
  loop:
    z = z + zPrev * feedback
    previous = z
    if real(z) >= 0
      z = sqr(z) + c
      real(z) = real(z) + bias
    else
      z = cos(z) + c
      imag(z) = imag(z) - bias
    endif
    z = z + bias * previous
  bailout:
    |z| < 48
}
```

여기서 `previous`는 초기 피드백 갱신 뒤와 분기 전에 캡처되고, `zPrev`는 `loop` 바로 전에
런타임이 찍은 스냅샷이에요. 둘은 바꿔 쓸 수 없어요. `zPrev`는 들어오는 오빗 값이고,
`previous`는 분기 뒤에 소비되는 중간값이에요.

<a id="standard-library-quick-reference"></a>
### 표준 라이브러리 빠른 참조

stdlib에는 다음이 포함돼요.

- 산술 및 투영: `abs`, `sqr`, `sqrt`, `exp`, `log`, `recip`,
  `conj`, `flip`, `real`, `imag`, `cabs`, `round`, `atan2`, `identity`
- 원형 함수: `sin`, `cos`, `tan`, `asin`, `acos`, `atan`
- 쌍곡 함수: `sinh`, `cosh`, `tanh`, `asinh`, `acosh`, `atanh`,
  `cotanh`, 호환성 함수 `cosxx`

`abs(z)`는 성분별 연산이고 `cabs(z)`와 `|z|`는 복소수 모듈러스를 반환한다는 점을 기억하세요.
영으로 나누기, `log(0)`, 그 밖의 필요한 비유한 값은 마이그레이션된 Definition에 구체적이고
근거가 뒷받침된 Classic 가드가 없으면 `nonFinite` 이벤트로 종료돼요.

## 6. 거부된 Definition 진단하기

첫 번째 안정적인 이유부터 시작하세요. 이후 오류는 같은 누락 섹션, 잘못된 토큰, 선언되지 않은 값의
결과인 경우가 많아요.

실용적인 확인 순서는 다음과 같아요.

1. **서두:** 필수 지시문 세 개가 각각 한 번씩 헤더 전에 있는지 확인하고, 검토된 선택적
   `@classic-guards` 지시문은 바꾸지 말고 보존하세요.
2. **형태:** 수식 하나, 순서대로 `parameters`, `init`, `loop`, `bailout`,
   정확히 하나의 bailout 표현식, 뒤따르는 실행 텍스트가 없어야 해요.
3. **이름:** ASCII 식별자, 예약 이름 충돌 없음, 중복 매개변수 또는 Classic 바인딩 없음이에요.
4. **타입:** 불리언 분기/bailout 조건, 호출 가능한 함수, 일관된 지역 타입, 초기화된 성분 대상이에요.
5. **확정 할당:** 읽는 모든 지역 변수는 모든 경로에서 초기화돼요.
6. **안전성:** 소스, 매개변수, 지역 변수, AST, 표현식 깊이, 문, 제어 흐름, 생성된 셰이더가
   v1 Envelope 안에 있어야 해요.
7. **수락 후 런타임:** 문법적으로 유효한 수식도 `nonFinite`로 종료될 수 있어요. 이는 런타임 증거이지
   수식을 교체해도 된다는 허가는 아니에요.

일반적인 수정 방법은 다음과 같아요.

| 거부 사유 | 올바른 대응 |
|---|---|
| `invalid-semantic-directives` | 정확한 언어, stdlib, NumericProfile 값을 복원하세요 |
| `invalid-section-order` | `parameters`를 `init` 앞으로 옮긴 다음 `loop`, `bailout` 순서로 두세요 |
| `undeclared-read` | 먼저 지역 변수에 할당하거나 매개변수를 선언하세요. 호스트 값을 추측하지 마세요 |
| `possibly-uninitialized-read` | 읽기 전에 모든 분기에서 지역 변수를 초기화하세요 |
| `unmapped-function-slot` | 일치하는 `classic fnN` 바인딩이 있는 함수 매개변수를 선언하세요 |
| `bailout-not-boolean` | `|z| < 4`처럼 명시적 비교를 사용하세요 |
| `source-too-large` | 소스 입력과 포매터 출력을 최대 65,536 UTF-8 바이트로 줄이세요 |
| `generated-shader-too-large` | Definition을 단순화하세요. 더 큰 공개 한도를 요청하지 마세요 |

알려진 v0.4.19 일탈: 괄호로 감싼 중첩 크기는 현재 파싱될 수 있지만 비정식이며, 포매터 왕복에 실패하고
게시 검증에서 반드시 보류돼요. 이는 [영어 규범 참조 §8](../specs/frm-like-language-v1.md#8-canonicalization-revisions-and-conformance)에
추적되어 있고, 프런트엔드가 이를 거부할 때까지 작성기 활성화는 차단돼요.

적합한 도구는 지원하지 않는 문장 부호, 매크로, 사용자 정의 함수, 여러 수식, 임의 지시문, 뒤따르는 실행
콘텐츠를 거부해요. 지원하지 않는 구성은 의미를 바꿔 실행하는 대신 거부돼요.

## 7. 리비전, Remix, 이식성

두 해시는 서로 다른 질문에 답해요.

- `sourceRevision`은 고정된 Definition 소스 자산의 정확한 UTF-8 바이트를 식별해요.
- `semanticHash`는 정식 타입 의미를 식별해요. 주석, 중요하지 않은 서식, 수식 이름은 이를 바꾸지 않지만
  실행 가능한 편집은 바꿔요.

공개된 리더는 제공된 그대로 소스 바이트를 해시해요. CRLF/CR에서 LF로의 정규화는 파싱에만 적용되고
`sourceRevision`에는 절대 적용되지 않아요. 따라서 줄 끝, 주석, 서식, 마지막 LF는 `semanticHash`를
바꾸지 않고도 `sourceRevision`을 바꿀 수 있어요. 게이트된 작성기는 더 엄격해요. 저장 또는 게시 전에
결정론적 포매터 형식을 출력하고 Safety Envelope를 통과해야 해요.

Profile에는 자체 리비전이 있어요. 카메라나 팔레트를 바꿔도 수식 의미를 다시 쓰지 않아요. 마찬가지로
백엔드 빌드에도 자체 리비전이 있으며, 두 번째 진실의 원천이 될 수 없어요.

Standard Definition은 고정된 리비전에서 불변이에요. **Open**은 해당 Definition과 Profile을 실행해요.
**Remix**는 계보가 고정된 편집 가능한 익명 컨텍스트를 만들며 Standard Record를 수정하거나 가장하지 않아요.
인계 매개변수는 한 번 소비된 뒤 URL에서 제거돼요. 저장과 클라우드 복원은 별도의 식별 및 권한 부여 작업이에요.

이식 가능한 작업은 리더 우선 자산 계약을 따라요. 자체 완결적인 작업은 재생에 필요한 Definition, 확인된
매개변수 값, Profile, 언어, stdlib, NumericProfile을 고정하거나 포함해요. 이 계약은 지원되지 않는
미래 Profile을 조용히 다운그레이드하지 말고 읽기 전용으로 열도록 요구해요. v1은 현재 `standard32`만
제공하고 회귀 게이트 C10은 보류 중이므로, 이 미래 Profile 동작이 오늘날 검증된 제품 동작이라고 주장하지 않아요.
작성기 활성화와 Production 마이그레이션은 별도 릴리스 게이트이며 이 매뉴얼이 암시하지 않아요.

## 8. Classic `.frm` 및 독립형 Editor

Classic `.frm`은 서로 다른 소스 문법과 별도의 `frmSemanticsVersion` 호환성 축을 가진 가져오기 방언이에요.
여기에는 여러 항목, Classic 헤더, 콜론으로 구분된 블록, 암시적 슬롯, 정식 v1이 저작 문법으로 의도적으로
복사하지 않는 역사적 의미론이 포함될 수 있어요.

독립형 FRM Editor는 현재 그 Classic-compatible 표면을 스캔하고 컴파일해요. 공유 예제에는 정식 v1
지시문 세 개나 v1 `parameters` 섹션이 포함되지 않아요. Classic Editor 컴파일 성공을 소스가 정식 v1
포매터 형식이라는 증거로 취급하지 마세요.

반대로, 정식 v1 포매터 형식을 현재 독립형 Editor에 붙여넣고 레거시 저작 표면이 거부할 때 언어가 지원되지
않는다고 추론하지 마세요. 공개된 v1 소스는 Formula Record의 Source 동작으로 확인하거나 내려받고, 고정된
공개 런타임을 실행하려면 해당 Record의 Open/Remix 동작을 사용하세요. 이 섹션이나 영어 규범 참조 §9의
가용성 규칙이 바뀌기 전에 정식 v1 작성기/가져오기 지원은 자체 활성화 게이트를 통과해야 해요.

Classic 선택, 고정된 시각적 호환성, strict-v2 진단, Upgrade & Compare 동작에는
[FRM Compatibility and Migration Contracts v1](../specs/frm-compatibility-v1.md)을 사용하세요.
정확한 언어 의미론과 한계에 대해서는
[영어 규범 참조: FractalPark FRM-like Language v1](../specs/frm-like-language-v1.md)이
권위가 있어요.
