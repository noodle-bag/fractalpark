; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_926cfb41_c7f8_5c51_b036_18a8428121bb {
  parameters:
    constant: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = sqr(z) + (constant - 1) / 2
  bailout:
    |z| <= 4
}
