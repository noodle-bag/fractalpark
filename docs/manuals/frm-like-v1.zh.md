# FRM-like v1 编写者手册

- Locale: zh
- Source manual SHA-256: e5168f1a0211596659314d748fa53825892a2a6f089350e636a8c0baf3903758
- 本文是由 AI 生成的翻译候选稿；技术、语言区域和维护者审核状态在本文档之外跟踪。
- 语言：FractalPark FRM-like Language v1 (`frm-like/1`)
- 日期：2026-08-20
- 规范参考：[FractalPark FRM-like Language v1](../specs/frm-like-language-v1.md)（英文规范具有权威性）
- Formula Records：FractalPark 上的 `/zh/formulas/<formulaId>`

本手册通过阅读和修改小型 Definition 来讲解这门语言。
已发布的 Standard 公式现已使用该语言。规范 v1 写入器和导入功能的启用
仍受门控。

## 1. 你现在可以做什么

FractalPark 当前展示 677 个 Standard identity：534 个已发布的 Definition
和 143 个保留的 Record。

对于已发布的 Record，你可以：

- 查看其 identity、来源、权利决定、源版本和 Profile；
- 查看或下载固定的 `.frm` Definition 源码；
- 在 Explore 中打开固定的 Definition 和 Profile；以及
- 在不修改 Standard 源码的情况下启动匿名 Remix。

保留的 Record 会说明其不可用的原因。它没有 source、run、edit 或
Remix 操作。目录中存在不代表运行时可用。

独立的 FRM Editor 仍是 Classic-compatible 编写界面。
规范 FRM-like v1 写入器和导入功能的启用仍受门控。本手册中的示例是可执行的 v1 Definition，已通过生产 v1
parser、CPU/GLSL 产物生成和两次有限 CPU 步骤验证，但当前独立 Editor 不是规范 v1 的粘贴目标。请使用 Formula Records
检查活跃的 Standard 源码；Classic-compatible Editor 工作流请使用现有的 FRM Guide。

## 2. 阅读已发布的 Definition

已发布的 Definition 以三条语义 directive 开始：

```text
; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
```

它们固定语言、函数词汇和数值行为。它们看似注释，因此 Classic 读取器可以容忍，
但 FractalPark 将其视为语义输入。删除、重复、将其中一条放在公式 header 之后，或
更改其中任一条都会使 Definition 无效。在 preamble 中重排这三条 directive 是有效的；规范输出会恢复为上面所示的顺序。

迁移的源码还可能带有一条可选的
`; @classic-guards: zero-division, floored-log, hyperbolic-clamp` directive。
规范输出会将它紧接在 `@numeric-profile` 之后。它记录已审核的兼容性证据，所以作者绝不能手动添加、删除或编辑它；参见[规范 §5](../specs/frm-like-language-v1.md#5-standard-library-v1)。

正文包含一个公式名和三个必需的可执行 section：

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

此处 `|z| <= 4` 表示半径为 4。Classic 的平方模阈值 `4`
对应 `|z| <= 2`，因此迁移时必须转换含义，而不是照抄数字。

一元负号也不同于常见的及 Classic 的 `^` 优先读取方式：v1 将
`-z ^ 2` 读作 `(-z) ^ 2`。迁移时，请添加表达预期正负号的括号，
不要复制含糊的拼写。

按迭代顺序阅读：

1. `init` 为每个像素设置一次轨道状态。
2. 每次 `loop` 之前，FractalPark 都将 `z` 快照为 `zPrev`。
3. `loop` 按源码顺序更新轨道。
4. `bailout` 回答“迭代是否应继续？”结果为 false 时停止。

`|z|` 是真实的复数模，不是平方模。因此该示例会在轨道半径至多为 4 时
继续。

Formula Record 通过 `sourceRevision` 固定确切源码，并单独固定一个
Profile。Profile 负责相机、迭代次数、模式、Julia 常量、调色板和着色。
这些呈现选择不属于 Definition。

## 3. 编写 Definition

从上面最小的结构开始。公式名和变量使用 ASCII
字母、数字和下划线；首字符不能是数字。每个物理行只保留一条语句。

有用的系统和 host 值包括：

- `pixel`：当前平面坐标；
- `c`：运行时选择的公式常量；
- `z`：可写入的轨道状态；
- `zPrev`：由运行时维护的前一次迭代轨道值；
- `LastSqr`：最近一次完成的 `loop` 结束时，运行时维护的 `z` 的平方模。
  对于平方模超过 binary32 的有限 `z`，该判定通道会饱和为正无穷而不结束
  该步骤；在源码中读取该值仍会产生 `nonFinite`；
- `ismand`：参数平面（`true`）与 Julia（`false`）模式；
- `pi`、`e` 和 `maxit`；
- Classic 互操作输入 `p1`-`p5`，可直接读取。未绑定的 slot 在 CPU 上是复数零，并且在
  符合要求的 GLSL host 中必须仍为复数零。`classic pN` 绑定会让裸 slot 和命名
  parameter 解析为相同值；以及
- Classic 函数 slot `fn1`-`fn4`，调用前必须具备带有匹配 `classic fnN`
  绑定的命名函数 parameter。

`zPrev` 和 `LastSqr` 不是外部 host 输入，绝不能被覆盖。
可用于状态表达式的函数请参见[标准库快速参考](#standard-library-quick-reference)。

这个 Definition 同时适用于参数平面和 Julia 模式：

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

不得为 §3 中列出的任一系统值或 Classic slot、任一 parameter、常量或 stdlib 名称赋值。
`z` 是唯一可写的系统值。新的合法赋值名会创建局部变量，但后续赋值必须保持同一类型。

表达式支持算术、比较、逻辑运算符、一元负号和 not、函数调用、括号、复数字面量和模值竖线。`^` 是右结合的。FractalPark 按源码顺序并从左到右求值，而不会悄然重排浮点运算。规范 v1 formatter 形式绝不能嵌套模值竖线；内部模请使用 `cabs(...)`。一元负号比幂运算绑定更紧，因此 `-z ^ 2` 表示 `(-z) ^ 2`。

## 4. 添加 parameters

将可选的 `parameters` section 放在 `init` 之前。parameter 有三种类型之一：

- `real`：有限标量，可选地带有含端点的 `domain [min, max]`；
- `complex`：字面默认值 `(real, imaginary)`；或
- `function`：一元 stdlib 函数名。

命名 parameter 可以记录唯一的 Classic 绑定。仅将 `real` 或 `complex`
parameters 绑定到 `p1`-`p5`，且仅将函数 parameters 绑定到 `fn1`-`fn4`。
绑定支持迁移和互操作；你的源码应使用命名 parameter。

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

硬 domain 是经验证的语义限制。如果建议范围以外的值仍然有效，
应改为将该软范围放在 Profile 或 Record 中。

函数 parameters 接受一元 stdlib 名称，例如 `sqr`、`sin`、`log` 或
`identity`。`atan2` 有两个参数，不能选作函数 parameter。如果选择
`real`、`imag` 或 `cabs`，其标量结果会被提升为虚部为零的复数值。该示例还将运行时维护的平方模 `LastSqr` 用作继续阈值，并使用 host 迭代上限 `maxit` 缩放 `c` 的贡献。
完整可选集合请参见[标准库快速参考](#standard-library-quick-reference)。

## 5. 使用状态和控制流

`if`、`elseif`、`else` 和 `endif` 对布尔条件执行操作。仅当每条路径均已初始化局部变量时，
才能在分支之后读取它。这会拒绝依赖陈旧值或后端特定值的公式。

分量赋值会更新已初始化复数值的一部分：

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

此处 `previous` 在初始反馈更新之后、分支之前捕获，而 `zPrev` 是运行时紧接在 `loop` 之前取得的快照。
二者不可互换：`zPrev` 是输入轨道值，而 `previous` 是分支后使用的中间值。

<a id="standard-library-quick-reference"></a>
### 标准库快速参考

stdlib 包括：

- 算术和投影：`abs`、`sqr`、`sqrt`、`exp`、`log`、`recip`、
  `conj`、`flip`、`real`、`imag`、`cabs`、`round`、`atan2`、`identity`；
- 圆函数：`sin`、`cos`、`tan`、`asin`、`acos`、`atan`；以及
- 双曲函数：`sinh`、`cosh`、`tanh`、`asinh`、`acosh`、`atanh`、
  `cotanh`，另加兼容函数 `cosxx`。

请记住，`abs(z)` 是逐分量的，而 `cabs(z)` 和 `|z|` 返回
复数模。除以零、`log(0)` 和其他必需的非有限值会以 `nonFinite` 事件终止，除非迁移的 Definition 带有具体且有证据支持的 Classic guard。

## 6. 诊断被拒绝的 Definition

从第一个稳定原因开始。之后的错误往往是同一缺失 section、错误 token 或未声明值的后果。

实用的检查顺序是：

1. **Preamble：**三条必需 directive 均恰好出现一次且位于
   header 之前；任何已审核的可选 `@classic-guards` directive 必须原样保留。
2. **Shape：**一个公式；依次为 `parameters`、`init`、`loop`、`bailout`；
   恰好一个 bailout 表达式；没有尾随的可执行文本。
3. **Names：**ASCII identifier，无保留名称冲突，无重复
   parameter 或 Classic binding。
4. **Types：**布尔 branch/bailout 条件、可调用函数、一致的
   局部类型、已初始化的分量目标。
5. **Definite assignment：**每次局部读取都已在每条路径上初始化。
6. **Safety：**源码、parameters、locals、AST、表达式深度、语句、
   控制流和生成的 shader 均位于 v1 envelope 内。
7. **Post-acceptance runtime：**语法有效的公式仍可能以
   `nonFinite` 终止；这是运行时证据，并非允许替换公式。

常见更正：

| 拒绝原因 | 正确应对 |
|---|---|
| `invalid-semantic-directives` | 恢复确切的 language、stdlib 和 NumericProfile 值 |
| `invalid-section-order` | 将 `parameters` 移至 `init` 之前，然后是 `loop`，再后是 `bailout` |
| `undeclared-read` | 先为局部变量赋值或声明 parameter；不要猜测 host 值 |
| `possibly-uninitialized-read` | 读取前在每个 branch 中初始化局部变量 |
| `unmapped-function-slot` | 声明带有匹配 `classic fnN` binding 的函数 parameter |
| `bailout-not-boolean` | 使用明确比较，例如 `|z| < 4` |
| `source-too-large` | 将源码输入和 formatter 输出缩减至最多 65,536 UTF-8 bytes |
| `generated-shader-too-large` | 简化 Definition；不要请求更高的公共限制 |

已知的 v0.4.19 偏差：带括号的嵌套模当前可能可以 parse，但并非规范形式，会导致 formatter 往返失败，且必须被发布验证拦截。它在[规范参考 §8](../specs/frm-like-language-v1.md#8-canonicalization-revisions-and-conformance)中跟踪，writer 启用会一直受阻，直到 front end 拒绝它。

符合要求的工具会拒绝不支持的标点、macros、用户定义函数、多个公式、任意 directives 和尾随的可执行内容。不支持的构造会被拒绝，而非以改变的含义执行。

## 7. Revisions、Remix 和可移植性

两个 hash 回答不同的问题：

- `sourceRevision` 标识固定 Definition 源资产的确切 UTF-8 bytes。
- `semanticHash` 标识规范的类型化含义。注释、不重要的
  格式和公式名不会改变它；可执行编辑会改变它。

已发布的读取器会严格按提供的字节计算 source hash。CRLF/CR 到 LF 的
规范化仅适用于 parsing，绝不适用于 `sourceRevision`；因此行尾、
注释、格式或终止 LF 可以改变 `sourceRevision`，而不改变 `semanticHash`。受门控的 writer 更严格：
在持久化或发布前，它必须输出确定性的 formatter 形式并通过 Safety Envelope。

Profile 有自己的 revision。更改相机或调色板不会重写公式含义。同样，backend build 有自己的 revision，不能成为第二个真相来源。

一个 Standard Definition 在其固定 revision 上不可变。**Open** 运行该
Definition 和 Profile。**Remix** 创建带有冻结 lineage 的可编辑匿名上下文；它不修改或冒充 Standard Record。Handoff parameters 只会被使用一次，随后从 URL 中移除。保存和 cloud restore 仍是独立的 identity 和 authorization 操作。

可移植作品遵循 reader-first asset contract。一个自包含作品会固定或嵌入重放所需的 Definition、已解析的 parameter 值、Profile、language、stdlib 和 NumericProfile。该 contract 要求不支持的未来 Profile 以只读方式打开，而不是悄然降级。v1 目前只展示 `standard32`，且回归门 C10 仍待处理，因此不能声称这种未来 Profile 行为已作为今天经过验证的产品行为。Writer 启用和 Production migration 是独立的发布门，并不由本手册暗示。

## 8. Classic `.frm` 和独立 Editor

Classic `.frm` 是具有不同 source grammar 的导入 dialect，并有独立的 `frmSemanticsVersion` 兼容性轴。它可包含多个 entry、classic header、以冒号分隔的 block、隐式 slot 和历史 semantics，而规范 v1 有意不将这些内容复制为编写 syntax。

独立 FRM Editor 当前会扫描并编译该 Classic-compatible 界面。其共享示例不含三条规范 v1 directive 或 v1 `parameters` section。不要将成功的 Classic Editor compile 视为该源码处于规范 v1 formatter 形式的证据。

反之，不要将规范 v1 formatter 形式粘贴到当前独立 Editor 中，并在旧式编写界面拒绝它时推断该语言不受支持。请使用 Formula Record 的 Source 操作检查或下载已发布的 v1 源码，并用其 Open/Remix 操作运行固定的已发布 runtime。规范 v1 writer/import 支持必须通过自身的 activation gate，之后本节或规范参考 §9 中的可用性规则才会变更。

有关 Classic selection、冻结的视觉兼容性、strict-v2 diagnostics 和 Upgrade & Compare 行为，请使用[FRM Compatibility and Migration Contracts v1](../specs/frm-compatibility-v1.md)。
关于准确的语言语义和限制，[FractalPark FRM-like Language v1](../specs/frm-like-language-v1.md)参考具有权威性。
