; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_82d5f7e0_77f9_5115_a6a4_3222eb0df696 {
  parameters:
    exponent: complex = (0, 0) classic p1
  init:
    q = pixel
    z = q
  loop:
    z = z ^ exponent + conj(pixel)
  bailout:
    |z| <= 4
}
