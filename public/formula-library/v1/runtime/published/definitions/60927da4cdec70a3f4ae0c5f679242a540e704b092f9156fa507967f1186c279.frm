; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_a52047b7_4e94_55ef_9b8a_9033bcf17a09 {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = 1 / flip(sqr(z) + offset)
  bailout:
    |z| <= 4
}
