# Manual del Autor de FRM-like v1

- Idioma: FractalPark FRM-like Language v1 (`frm-like/1`)
- Fecha: 2026-08-20
- Referencia normativa: [FractalPark FRM-like Language v1](../specs/frm-like-language-v1.md)
- Formula Records: `/es/formulas/<formulaId>` en FractalPark
- Locale: es
- Source manual SHA-256: e5168f1a0211596659314d748fa53825892a2a6f089350e636a8c0baf3903758
- Divulgación: Candidato de traducción generado por IA; el estado de revisión técnica, de locale y de mantenedores se rastrea fuera de este documento.

Este manual enseña el lenguaje mediante la lectura y modificación de pequeñas Definitions.
Las fórmulas publicadas Standard usan el lenguaje hoy. La activación canónica de
escritura/importación v1 sigue estando restringida.

## 1. Lo que puedes hacer hoy

FractalPark expone actualmente 677 identidades Standard: 534 Definitions publicadas
y 143 Records retenidas.

Para una Record publicada puedes:

- inspeccionar su identidad, procedencia, decisión de derechos, revisión de fuente y Profile;
- ver o descargar la fuente `.frm` de la Definition fijada;
- abrir la Definition y el Profile fijados en Explore; y
- iniciar un Remix anónimo sin cambiar la fuente Standard.

Una Record retenida explica por qué no está disponible. No tiene acción de fuente, ejecución, edición o
Remix. La presencia en el catálogo no significa disponibilidad en tiempo de ejecución.

El FRM Editor independiente sigue siendo una superficie de autoría compatible con Classic.
La activación canónica de escritura e importación de FRM-like v1 sigue restringida. Los ejemplos de
este manual son Definitions v1 ejecutables verificadas con el parser v1 de producción,
la generación de artefactos CPU/GLSL y dos pasos finitos de CPU, pero el Editor
independiente actual no es un destino canónico de pegado v1. Usa Formula Records para
inspeccionar la fuente Standard activa; usa la Guía FRM existente para el
flujo de trabajo del Editor compatible con Classic.

## 2. Lee una Definition publicada

Una Definition publicada comienza con tres directivas semánticas:

```text
; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
```

Fijan el lenguaje, el vocabulario de funciones y el comportamiento numérico. Parecen
comentarios para que los lectores Classic puedan tolerarlos, pero FractalPark los trata como
entrada semántica. Eliminar, duplicar, colocar una después del encabezado de la fórmula o
cambiar una invalida la Definition. Reordenar las tres directivas dentro
del preámbulo es válido; la salida canónica restaura el orden mostrado arriba.

La fuente migrada también puede llevar una directiva opcional
`; @classic-guards: zero-division, floored-log, hyperbolic-clamp`.
La salida canónica la coloca inmediatamente después de `@numeric-profile`. Registra
evidencia de compatibilidad revisada, por lo que los autores NO DEBEN añadir, eliminar o editar
esta directiva a mano; consulta [normativa §5](../specs/frm-like-language-v1.md#5-standard-library-v1).

El cuerpo tiene un nombre de fórmula y tres secciones ejecutables requeridas:

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

Aquí `|z| <= 4` significa radio 4. Un umbral Classic de magnitud al cuadrado de `4`
corresponde a `|z| <= 2`, por lo que la migración debe traducir el significado en lugar de
copiar el numeral.

El menos unario también difiere de la lectura común y de la lectura Classic con `^` primero: v1 lee
`-z ^ 2` como `(-z) ^ 2`. Al migrar, añade los paréntesis que expresen el
signo previsto en lugar de copiar una ortografía ambigua.

Léelo en orden de iteración:

1. `init` establece el estado de la órbita una vez por cada píxel.
2. Antes de cada `loop`, FractalPark captura `z` como `zPrev`.
3. `loop` actualiza la órbita en orden de fuente.
4. `bailout` responde "¿debe continuar la iteración?". Un resultado falso detiene.

`|z|` es la verdadera magnitud compleja, no la magnitud al cuadrado. El ejemplo por lo tanto
continúa mientras el radio de la órbita sea como máximo 4.

Una Formula Record fija la fuente exacta mediante `sourceRevision` y fija por separado un
Profile. El Profile posee la cámara, las iteraciones, el modo, la constante de Julia, la paleta
y el coloreado. Esas elecciones de presentación no pertenecen a la Definition.

## 3. Escribe una Definition

Comienza con la estructura más pequeña de arriba. Los nombres de fórmulas y variables usan
letras ASCII, dígitos y guiones bajos; el primer carácter no puede ser un dígito. Mantén
una sentencia por línea física.

Los valores útiles del sistema y del host son:

- `pixel`: la coordenada actual del plano;
- `c`: la constante de fórmula seleccionada en tiempo de ejecución;
- `z`: el estado de órbita escribible;
- `zPrev`: el valor de órbita de la iteración anterior mantenido en tiempo de ejecución;
- `LastSqr`: la magnitud al cuadrado de `z` mantenida en tiempo de ejecución al final del
  `loop` completado más recientemente. Para `z` finito cuya magnitud al cuadrado excede
  binary32, este canal de decisión se satura a infinito positivo sin terminar
  el paso; leer ese valor en la fuente aún produce `nonFinite`;
- `ismand`: modo plano de parámetros (`true`) versus Julia (`false`);
- `pi`, `e` y `maxit`;
- Entradas de interoperabilidad Classic `p1`-`p5`, que se pueden leer directamente. Un
  slot no vinculado es cero complejo en CPU y DEBE permanecer como cero complejo en un
  host GLSL conforme. Un enlace `classic pN` hace que el slot simple y el parámetro
  nombrado resuelvan al mismo valor; y
- Slots de función Classic `fn1`-`fn4`, que requieren parámetros de función nombrados
  coincidentes con enlaces `classic fnN` antes de poder ser llamados.

`zPrev` y `LastSqr` no son entradas externas del host y NO DEBEN ser reasignados.
Consulta la [referencia rápida de la biblioteca estándar](#standard-library-quick-reference) para
las funciones disponibles para expresiones de estado.

Esta Definition funciona tanto en modo plano de parámetros como en modo Julia:

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

No asignes a ningún valor del sistema o slot Classic listado en §3, a ningún parámetro,
constante o nombre de stdlib. `z` es el único valor del sistema escribible. Un nuevo
nombre de asignación legal crea una variable local, pero las asignaciones posteriores deben mantener el mismo tipo.

Las expresiones admiten operadores aritméticos, de comparación, lógicos, menos unario y
not, llamadas a funciones, paréntesis, literales complejos y barras de magnitud. `^` es
asociativo a la derecha. FractalPark evalúa en orden de fuente y de izquierda a derecha en lugar
de reordenar silenciosamente el trabajo de coma flotante. El formateador canónico v1
NO DEBE anidar barras de magnitud; usa `cabs(...)` para el módulo interno. El menos unario se une
más estrechamente que la exponenciación, por lo que `-z ^ 2` significa `(-z) ^ 2`.

## 4. Añade parámetros

Coloca una sección opcional `parameters` antes de `init`. Un parámetro tiene uno de tres
tipos:

- `real`: escalar finito, opcionalmente con `domain [min, max]` inclusivo;
- `complex`: valor predeterminado literal `(real, imaginary)`; o
- `function`: un nombre de función unaria de stdlib.

Un parámetro nombrado puede registrar un enlace Classic único. Vincula parámetros `real` o `complex`
solo a `p1`-`p5`, y parámetros de función solo a `fn1`-`fn4`.
Los enlaces admiten migración e interoperabilidad; tu fuente debe usar el parámetro
nombrado.

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

Los dominios estrictos son límites semánticos validados. Si los valores fuera de un rango
sugerido siguen siendo válidos, coloca ese rango flexible en el Profile o la Record en su lugar.

Los parámetros de función aceptan nombres unarios de stdlib como `sqr`, `sin`, `log` o
`identity`. `atan2` tiene dos argumentos y no se puede seleccionar como parámetro
de función. Si se selecciona `real`, `imag` o `cabs`, su resultado escalar se promueve
a un valor complejo con componente imaginaria cero. El ejemplo también usa la magnitud
al cuadrado mantenida en tiempo de ejecución `LastSqr` como umbral de continuación y el
límite de iteraciones del host `maxit` para escalar la contribución de `c`.
Consulta la [referencia rápida de la biblioteca estándar](#standard-library-quick-reference) para
el conjunto seleccionable completo.

## 5. Usa estado y flujo de control

`if`, `elseif`, `else` y `endif` operan sobre condiciones booleanas. Una local puede
leerse después de una rama solo si cada camino la inicializó. Esto rechaza fórmulas que
dependerían de valores obsoletos o específicos del backend.

La asignación de componentes actualiza una parte de un valor complejo ya inicializado:

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

Aquí `previous` se captura después de la actualización inicial de retroalimentación y antes de la
rama, mientras que `zPrev` es la captura en tiempo de ejecución tomada inmediatamente antes de `loop`.
No son intercambiables: `zPrev` es el valor de órbita entrante, mientras que
`previous` es el valor intermedio consumido después de la rama.

<a id="standard-library-quick-reference"></a>
### Referencia rápida de la biblioteca estándar

La stdlib incluye:

- aritmética y proyecciones: `abs`, `sqr`, `sqrt`, `exp`, `log`, `recip`,
  `conj`, `flip`, `real`, `imag`, `cabs`, `round`, `atan2`, `identity`;
- funciones circulares: `sin`, `cos`, `tan`, `asin`, `acos`, `atan`; y
- funciones hiperbólicas: `sinh`, `cosh`, `tanh`, `asinh`, `acosh`, `atanh`,
  `cotanh`, más la función de compatibilidad `cosxx`.

Recuerda que `abs(z)` es por componentes, mientras que `cabs(z)` y `|z|` devuelven el
módulo complejo. La división por cero, `log(0)` y otros valores no finitos requeridos
terminan con el evento `nonFinite` a menos que una Definition migrada lleve una
guarda Classic específica respaldada por evidencia.

## 6. Diagnostica una Definition rechazada

Comienza con la primera razón estable. Los errores posteriores suelen ser consecuencias de
la misma sección faltante, token incorrecto o valor no declarado.

Un orden práctico de verificación es:

1. **Preámbulo:** las tres directivas requeridas están presentes una vez y antes del
   encabezado; conserva cualquier directiva opcional `@classic-guards` revisada sin cambios.
2. **Forma:** una fórmula; `parameters`, `init`, `loop`, `bailout` en orden;
   exactamente una expresión de bailout; sin texto ejecutable final.
3. **Nombres:** identificadores ASCII, sin colisión con nombres reservados, sin parámetro
   o enlace Classic duplicado.
4. **Tipos:** condiciones booleanas de rama/bailout, funciones invocables, tipo
   local consistente, destino de componente inicializado.
5. **Asignación definida:** cada lectura local está inicializada en cada camino.
6. **Seguridad:** fuente, parámetros, locales, AST, profundidad de expresión, sentencias,
   flujo de control y shader generado permanecen dentro del envolvente v1.
7. **Tiempo de ejecución posterior a la aceptación:** una fórmula sintácticamente válida aún puede
   terminar con `nonFinite`; eso es evidencia de tiempo de ejecución, no permiso para reemplazar
   la fórmula.

Correcciones comunes:

| Rechazo | Respuesta correcta |
|---|---|
| `invalid-semantic-directives` | Restaura los valores exactos de language, stdlib y NumericProfile |
| `invalid-section-order` | Mueve `parameters` antes de `init`, luego `loop`, luego `bailout` |
| `undeclared-read` | Asigna una local primero o declara un parámetro; no adivines un valor del host |
| `possibly-uninitialized-read` | Inicializa la local en cada rama antes de leerla |
| `unmapped-function-slot` | Declara un parámetro de función con el enlace `classic fnN` coincidente |
| `bailout-not-boolean` | Usa una comparación explícita como `|z| < 4` |
| `source-too-large` | Reduce la entrada de fuente y la salida del formateador a como máximo 65.536 bytes UTF-8 |
| `generated-shader-too-large` | Simplifica la Definition; no solicites un límite público mayor |

Desviación conocida de v0.4.19: la magnitud anidada entre paréntesis puede analizarse actualmente pero
no es canónica, falla el round-trip del formateador y DEBE ser retenida por la validación
de publicación. Está rastreada en la
[referencia normativa §8](../specs/frm-like-language-v1.md#8-canonicalization-revisions-and-conformance),
con la activación de escritura bloqueada hasta que el front end la rechace.

Una herramienta conforme rechaza puntuación no admitida, macros, funciones
definidas por el usuario, múltiples fórmulas, directivas arbitrarias y contenido
ejecutable final. Las construcciones no admitidas se rechazan en lugar de ejecutarse con
significado alterado.

## 7. Revisiones, Remix y portabilidad

Dos hashes responden preguntas diferentes:

- `sourceRevision` identifica los bytes UTF-8 exactos del activo de fuente de la Definition
  fijada.
- `semanticHash` identifica el significado tipado canónico. Los comentarios, el formato
  insignificante y el nombre de la fórmula no lo cambian; las ediciones ejecutables sí.

El lector publicado aplica hash a los bytes de fuente exactamente como se suministran. La normalización
CRLF/CR-a-LF se aplica solo al análisis y nunca a `sourceRevision`; los finales de línea,
los comentarios, el formato o un LF final pueden por lo tanto cambiar `sourceRevision`
sin cambiar `semanticHash`. El escritor restringido es más estricto:
debe emitir la forma determinista del formateador y pasar el Envolvente de Seguridad
antes de la persistencia o publicación.

Un Profile tiene su propia revisión. Cambiar la cámara o la paleta no reescribe
el significado de la fórmula. Del mismo modo, una compilación de backend tiene su propia revisión y no puede convertirse
en una segunda fuente de verdad.

Una Standard Definition es inmutable en su revisión fijada. **Open** ejecuta esa
Definition y Profile. **Remix** crea un contexto anónimo editable con
linaje congelado; no modifica ni suplanta la Standard Record. Los parámetros de
transferencia se consumen una vez y se eliminan de la URL. Guardar y restaurar en la nube
siguen siendo operaciones separadas de identidad y autorización.

El trabajo portable sigue el contrato de activos que prioriza al lector. Un trabajo
autocontenido fija o incrusta la Definition, los valores de parámetros resueltos, el Profile, el lenguaje,
la stdlib y el NumericProfile necesarios para la reproducción. El contrato requiere que los perfiles
futuros no admitidos se abran en modo solo lectura en lugar de degradarse silenciosamente. v1 actualmente
expone solo `standard32`, y la compuerta de regresión C10 sigue pendiente, por lo que este
comportamiento de perfil futuro no se reivindica como comportamiento demostrado del producto en la actualidad.
La activación del escritor y la migración de Production son compuertas de lanzamiento separadas, no
implicadas por este manual.

## 8. `.frm` Classic y el Editor independiente

`.frm` Classic es un dialecto de importación con una gramática de fuente diferente y un
eje de compatibilidad `frmSemanticsVersion` separado. Puede contener múltiples
entradas, encabezados Classic, bloques separados por dos puntos, slots implícitos y semánticas
históricas que el v1 canónico intencionalmente no copia como sintaxis de autoría.

El FRM Editor independiente actualmente escanea y compila esa superficie
compatible con Classic. Sus ejemplos compartidos no incluyen las tres directivas canónicas v1 ni
la sección `parameters` de v1. No trates una compilación exitosa del Editor Classic como
prueba de que la fuente está en la forma del formateador canónico v1.

Por el contrario, no pegues la forma del formateador canónico v1 en el Editor
independiente actual e infieras que el lenguaje no está admitido cuando la superficie
de autoría heredada lo rechaza. Usa la acción Source de la Formula Record para inspeccionar
o descargar la fuente v1 publicada, y sus acciones Open/Remix para ejecutar el tiempo de ejecución
publicado fijado. El soporte canónico de escritura/importación v1 debe pasar su propia compuerta de activación
antes de que cambien las reglas de disponibilidad en esta sección o en la referencia normativa §9.

Para la selección Classic, compatibilidad visual congelada, diagnósticos estrictos v2 y
comportamiento de Upgrade & Compare, usa los
[Contratos de Compatibilidad y Migración FRM v1](../specs/frm-compatibility-v1.md).
Para la semántica y los límites exactos del lenguaje, la referencia
[FractalPark FRM-like Language v1](../specs/frm-like-language-v1.md) es
autoritativa.
