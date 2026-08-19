; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_83d9e65a_3f99_58a5_8fca_1f0312ee7b35 {
  init:
    z = 0.5
  loop:
    z = z * pixel - pixel / sqr(z)
  bailout:
    |z| < 8
}
