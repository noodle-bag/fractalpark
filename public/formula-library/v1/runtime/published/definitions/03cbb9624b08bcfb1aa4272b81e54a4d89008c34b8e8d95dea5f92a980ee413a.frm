; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_ae1a8559_552c_52be_973b_7b9d8d8e3cdc {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = sqr(sin(z)) + offset
  bailout:
    |z| <= 4
}

