; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_059080eb_da12_5e85_a1a3_049929bdcf49 {
  init:
    z = pixel
  loop:
    z = z / pixel - pixel * sqr(z)
  bailout:
    |z| < 8
}
