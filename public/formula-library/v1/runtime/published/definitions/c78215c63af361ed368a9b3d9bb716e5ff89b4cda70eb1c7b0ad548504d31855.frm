; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_7e6e1c30_7b53_587c_827e_cdacba48a024 {
  parameters:
    function1: function = identity classic fn1
  init:
    z = pixel
    f = 1 / sin(pixel)
  loop:
    z = fn1(z) + f
  bailout:
    |z| <= 50
}