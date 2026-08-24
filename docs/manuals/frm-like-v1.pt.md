# Manual do autor de FRM-like v1

- Locale: pt
- Source manual SHA-256: e5168f1a0211596659314d748fa53825892a2a6f089350e636a8c0baf3903758
- Tradução candidata gerada por IA; o status de revisão técnica, de locale e de mantenedor é acompanhado fora deste documento.
- Idioma: FractalPark FRM-like Language v1 (`frm-like/1`)
- Data: 2026-08-20
- Referência normativa em inglês: [FractalPark FRM-like Language v1](../specs/frm-like-language-v1.md)
- Formula Records: `/pt/formulas/<formulaId>` no FractalPark

Este manual ensina a linguagem pela leitura e modificação de pequenas Definitions.
Fórmulas Standard publicadas usam a linguagem hoje. A ativação do escritor/importador v1 canônico continua bloqueada.

## 1. O que você pode fazer hoje

O FractalPark expõe atualmente 677 identidades Standard: 534 Definitions publicadas
e 143 Records retidos.

Para um Record publicado, você pode:

- inspecionar sua identidade, procedência, decisão de direitos, revisão do código-fonte e Profile;
- ver ou baixar o código-fonte da Definition `.frm` fixada;
- abrir a Definition e o Profile fixados em Explore; e
- iniciar um Remix anônimo sem alterar o código-fonte Standard.

Um Record retido explica por que está indisponível. Ele não tem ação de código-fonte, execução, edição ou
Remix. A presença no catálogo não significa disponibilidade em tempo de execução.

O Editor FRM independente continua sendo uma superfície de autoria compatível com Classic.
A ativação do escritor e da importação FRM-like v1 canônicos continua bloqueada. Os exemplos deste
manual são Definitions v1 executáveis verificadas com o parser v1 de produção,
geração de artefatos CPU/GLSL e dois passos finitos de CPU, mas o Editor
independente atual não é um destino de colagem v1 canônico. Use Formula Records para
inspecionar o código-fonte Standard ativo; use o Guia FRM existente para o
fluxo de trabalho do Editor compatível com Classic.

## 2. Leia uma Definition publicada

Uma Definition publicada começa com três diretivas semânticas:

```text
; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
```

Elas fixam a linguagem, o vocabulário de funções e o comportamento numérico. Parecem
comentários para que leitores Classic possam tolerá-las, mas o FractalPark as trata como
entrada semântica. Remover, duplicar, colocar uma delas após o cabeçalho da fórmula ou
alterar uma delas invalida a Definition. Reordenar as três diretivas dentro do
preâmbulo é válido; a saída canônica restaura a ordem exibida acima.

O código-fonte migrado também pode conter uma diretiva opcional
`; @classic-guards: zero-division, floored-log, hyperbolic-clamp`.
A saída canônica a coloca imediatamente após `@numeric-profile`. Ela registra evidência
de compatibilidade revisada, portanto autores NÃO DEVEM adicioná-la, removê-la ou editá-la
manualmente; consulte a [normativa §5](../specs/frm-like-language-v1.md#5-standard-library-v1).

O corpo tem um nome de fórmula e três seções executáveis obrigatórias:

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

Aqui, `|z| <= 4` significa raio 4. Um limiar Classic de magnitude ao quadrado de `4`
corresponde a `|z| <= 2`, portanto a migração deve traduzir o significado em vez de
copiar o numeral.

O menos unário também difere da leitura comum e Classic com `^` primeiro: v1 lê
`-z ^ 2` como `(-z) ^ 2`. Ao migrar, acrescente os parênteses que expressem o
sinal pretendido em vez de copiar uma grafia ambígua.

Leia-a na ordem de iteração:

1. `init` define o estado da órbita uma vez para cada pixel.
2. Antes de cada `loop`, o FractalPark captura `z` como `zPrev`.
3. `loop` atualiza a órbita na ordem do código-fonte.
4. `bailout` responde “a iteração deve continuar?” Um resultado falso interrompe.

`|z|` é a magnitude complexa verdadeira, não a magnitude ao quadrado. Portanto, o exemplo
continua enquanto o raio da órbita for no máximo 4.

Um Formula Record fixa o código-fonte exato por `sourceRevision` e fixa separadamente um
Profile. O Profile contém câmera, iterações, modo, constante Julia, paleta
e coloração. Essas escolhas de apresentação não pertencem à Definition.

## 3. Escreva uma Definition

Comece com a menor estrutura acima. Nomes de fórmulas e variáveis usam letras ASCII,
dígitos e sublinhados; o primeiro caractere não pode ser um dígito. Mantenha
uma instrução por linha física.

Valores úteis do sistema e do host são:

- `pixel`: a coordenada atual do plano;
- `c`: a constante da fórmula selecionada em tempo de execução;
- `z`: o estado gravável da órbita;
- `zPrev`: o valor da órbita da iteração anterior mantido pelo tempo de execução;
- `LastSqr`: a magnitude ao quadrado de `z` mantida pelo tempo de execução ao final do
  `loop` concluído mais recentemente. Para `z` finito cuja magnitude ao quadrado excede
  binary32, esse canal de decisão satura em infinito positivo sem encerrar
  o passo; ler esse valor no código-fonte ainda produz `nonFinite`;
- `ismand`: modo do plano de parâmetros (`true`) versus Julia (`false`);
- `pi`, `e` e `maxit`;
- entradas de interoperabilidade Classic `p1`-`p5`, que podem ser lidas diretamente. Um
  slot não vinculado é zero complexo na CPU e DEVE permanecer zero complexo em um host GLSL
  em conformidade. Uma vinculação `classic pN` faz o slot simples e o parâmetro nomeado
  resolverem para o mesmo valor; e
- slots de função Classic `fn1`-`fn4`, que exigem parâmetros de função nomeados correspondentes com
  vinculações `classic fnN` antes de poderem ser chamados.

`zPrev` e `LastSqr` não são entradas externas do host e NÃO DEVEM ser substituídos.
Veja a [referência rápida da biblioteca padrão](#standard-library-quick-reference) para
as funções disponíveis às expressões de estado.

Esta Definition funciona nos modos plano de parâmetros e Julia:

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

Não atribua a nenhum valor do sistema ou slot Classic listado no §3, a qualquer parâmetro,
constante ou nome da stdlib. `z` é o único valor gravável do sistema. Um novo nome de
atribuição válido cria uma variável local, mas atribuições posteriores devem manter o mesmo tipo.

Expressões aceitam operadores aritméticos, de comparação e lógicos, menos unário e
not, chamadas de função, parênteses, literais complexos e barras de magnitude. `^` é
associativo à direita. O FractalPark avalia na ordem do código-fonte e da esquerda para a direita,
em vez de reorganizar silenciosamente o trabalho de ponto flutuante. A forma do formatador v1 canônico
NÃO DEVE aninhar barras de magnitude; use `cabs(...)` para o módulo interno. O menos unário se liga mais
fortemente que a exponenciação, portanto `-z ^ 2` significa `(-z) ^ 2`.

## 4. Adicione parâmetros

Coloque uma seção opcional `parameters` antes de `init`. Um parâmetro tem um de três
tipos:

- `real`: escalar finito, opcionalmente com `domain [min, max]` inclusivo;
- `complex`: padrão literal `(real, imaginary)`; ou
- `function`: nome de função stdlib unária.

Um parâmetro nomeado pode registrar uma vinculação Classic exclusiva. Vincule parâmetros `real` ou
`complex` somente a `p1`-`p5`, e parâmetros de função somente a `fn1`-`fn4`.
Vinculações dão suporte à migração e interoperabilidade; seu código-fonte deve usar o parâmetro
nomeado.

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

Domínios rígidos são limites semânticos validados. Se valores fora de um intervalo sugerido
continuarem válidos, coloque esse intervalo flexível no Profile ou Record.

Parâmetros de função aceitam nomes unários da stdlib como `sqr`, `sin`, `log` ou
`identity`. `atan2` tem dois argumentos e não pode ser selecionado como parâmetro de
função. Se `real`, `imag` ou `cabs` for selecionado, seu resultado escalar é promovido
para um valor complexo com componente imaginário zero. O exemplo também usa a magnitude
ao quadrado mantida em tempo de execução `LastSqr` como limiar de continuação e o teto de
iterações do host `maxit` para escalar a contribuição de `c`.
Veja a [referência rápida da biblioteca padrão](#standard-library-quick-reference) para
o conjunto selecionável completo.

## 5. Use estado e fluxo de controle

`if`, `elseif`, `else` e `endif` operam sobre condições booleanas. Uma variável local só pode ser
lida após uma ramificação se todos os caminhos a tiverem inicializado. Isso rejeita fórmulas que
dependeriam de valores obsoletos ou específicos do backend.

A atribuição de um componente atualiza uma parte de um valor complexo já inicializado:

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

Aqui, `previous` é capturado após a atualização inicial de realimentação e antes da
ramificação, enquanto `zPrev` é a captura de tempo de execução feita imediatamente antes de `loop`.
Eles não são intercambiáveis: `zPrev` é o valor de órbita de entrada, enquanto
`previous` é o valor intermediário consumido após a ramificação.

<a id="standard-library-quick-reference"></a>
### Referência rápida da biblioteca padrão

A stdlib inclui:

- aritmética e projeções: `abs`, `sqr`, `sqrt`, `exp`, `log`, `recip`,
  `conj`, `flip`, `real`, `imag`, `cabs`, `round`, `atan2`, `identity`;
- funções circulares: `sin`, `cos`, `tan`, `asin`, `acos`, `atan`; e
- funções hiperbólicas: `sinh`, `cosh`, `tanh`, `asinh`, `acosh`, `atanh`,
  `cotanh`, além da função de compatibilidade `cosxx`.

Lembre-se de que `abs(z)` atua por componente, enquanto `cabs(z)` e `|z|` retornam o
módulo complexo. Divisão por zero, `log(0)` e outros valores não finitos obrigatórios
encerram com o evento `nonFinite`, a menos que uma Definition migrada contenha uma guarda
Classic específica e apoiada por evidências.

## 6. Diagnostique uma Definition rejeitada

Comece pelo primeiro motivo estável. Erros posteriores costumam ser consequências da
mesma seção ausente, token inválido ou valor não declarado.

Uma ordem prática de verificação é:

1. **Preâmbulo:** as três diretivas obrigatórias estão presentes uma vez e antes do
   cabeçalho; preserve sem alterações qualquer diretiva opcional revisada `@classic-guards`.
2. **Forma:** uma fórmula; `parameters`, `init`, `loop`, `bailout` ordenados;
   exatamente uma expressão de bailout; nenhum texto executável final.
3. **Nomes:** identificadores ASCII, sem colisão com nome reservado, sem parâmetro duplicado
   ou vinculação Classic duplicada.
4. **Tipos:** condições booleanas de ramificação/bailout, funções chamáveis, tipo local consistente,
   alvo de componente inicializado.
5. **Atribuição definida:** toda leitura local é inicializada em todos os caminhos.
6. **Segurança:** código-fonte, parâmetros, locais, AST, profundidade de expressão, instruções,
   fluxo de controle e shader gerado permanecem dentro do envelope v1.
7. **Tempo de execução pós-aceitação:** uma fórmula sintaticamente válida ainda pode
   encerrar com `nonFinite`; isso é evidência de execução, não permissão para substituir
   a fórmula.

Correções comuns:

| Rejeição | Resposta correta |
|---|---|
| `invalid-semantic-directives` | Restaure valores exatos de linguagem, stdlib e NumericProfile |
| `invalid-section-order` | Mova `parameters` antes de `init`, depois `loop`, depois `bailout` |
| `undeclared-read` | Atribua primeiro a uma variável local ou declare um parâmetro; não adivinhe um valor do host |
| `possibly-uninitialized-read` | Inicialize a variável local em cada ramificação antes de lê-la |
| `unmapped-function-slot` | Declare um parâmetro de função com a vinculação `classic fnN` correspondente |
| `bailout-not-boolean` | Use uma comparação explícita, como `|z| < 4` |
| `source-too-large` | Reduza a entrada do código-fonte e a saída do formatador para no máximo 65.536 bytes UTF-8 |
| `generated-shader-too-large` | Simplifique a Definition; não solicite um limite público maior |

Desvio conhecido de v0.4.19: magnitude aninhada entre parênteses pode ser analisada atualmente, mas
não é canônica, falha no round-trip do formatador e DEVE ser retida pela validação de
publicação. Isso é acompanhado na
[referência normativa §8](../specs/frm-like-language-v1.md#8-canonicalization-revisions-and-conformance),
com a ativação do escritor bloqueada até que o front end a rejeite.

Uma ferramenta em conformidade rejeita pontuação sem suporte, macros, funções definidas pelo usuário,
múltiplas fórmulas, diretivas arbitrárias e conteúdo executável final. Construções sem suporte são
rejeitadas, em vez de executadas com significado alterado.

## 7. Revisões, Remix e portabilidade

Dois hashes respondem a perguntas diferentes:

- `sourceRevision` identifica os bytes UTF-8 exatos do ativo de código-fonte da Definition fixada.
- `semanticHash` identifica o significado tipado canônico. Comentários, formatação insignificante
  e o nome da fórmula não o alteram; edições executáveis o alteram.

O leitor publicado calcula hashes dos bytes do código-fonte exatamente como fornecidos. A normalização
CRLF/CR-para-LF se aplica apenas à análise e nunca a `sourceRevision`; finais de linha,
comentários, formatação ou um LF terminal podem, portanto, alterar `sourceRevision`
sem alterar `semanticHash`. O escritor sob gate é mais rigoroso:
ele deve emitir a forma determinística do formatador e passar pelo Safety Envelope
antes da persistência ou publicação.

Um Profile tem sua própria revisão. Alterar a câmera ou a paleta não reescreve o
significado da fórmula. Do mesmo modo, uma compilação de backend tem sua própria revisão e não pode
se tornar uma segunda fonte de verdade.

Uma Definition Standard é imutável em sua revisão fixada. **Open** executa essa
Definition e Profile. **Remix** cria um contexto anônimo editável com linhagem
congelada; não modifica nem se faz passar pelo Record Standard. Parâmetros de handoff
são consumidos uma vez e removidos da URL. Salvar e restaurar da nuvem continuam sendo operações
separadas de identidade e autorização.

O trabalho portável segue o contrato de ativo leitor-primeiro. Um trabalho autocontido fixa ou incorpora
a Definition, os valores de parâmetros resolvidos, Profile, linguagem,
stdlib e NumericProfile necessários para reprodução. O contrato exige que perfis futuros sem suporte
abram como somente leitura, em vez de fazer downgrade silenciosamente. v1 expõe atualmente apenas
`standard32`, e o gate de regressão C10 continua pendente, portanto esse comportamento de perfil futuro
não é alegado como comportamento de produto exercitado hoje.
A ativação do escritor e a migração de Produção são gates de lançamento separados, não
implícitos por este manual.

## 8. Classic `.frm` e o Editor independente

Classic `.frm` é um dialeto de importação com uma gramática de código-fonte diferente e um
eixo de compatibilidade `frmSemanticsVersion` separado. Ele pode conter múltiplas
entradas, cabeçalhos Classic, blocos separados por dois-pontos, slots implícitos e
semântica histórica que o v1 canônico intencionalmente não copia como sintaxe de autoria.

O Editor FRM independente atualmente examina e compila essa superfície compatível com Classic.
Seus exemplos compartilhados não incluem as três diretivas v1 canônicas nem a seção v1
`parameters`. Não trate uma compilação bem-sucedida no Editor Classic como prova de que o
código-fonte está na forma do formatador v1 canônico.

De modo inverso, não cole a forma do formatador v1 canônico no Editor independente atual
e conclua que a linguagem não é suportada quando a superfície de autoria legada a rejeita.
Use a ação Source do Formula Record para inspecionar ou baixar código-fonte v1 publicado,
e suas ações Open/Remix para executar o runtime publicado fixado. O suporte ao escritor/importador v1 canônico
deve passar por seu próprio gate de ativação antes que as regras de disponibilidade nesta seção
ou na referência normativa §9 mudem.

Para seleção Classic, compatibilidade visual congelada, diagnósticos strict-v2 e
comportamento Upgrade & Compare, use os
[FRM Compatibility and Migration Contracts v1](../specs/frm-compatibility-v1.md).
Para semântica e limites exatos da linguagem, a referência em inglês
[FractalPark FRM-like Language v1](../specs/frm-like-language-v1.md) é
autoritativa.
