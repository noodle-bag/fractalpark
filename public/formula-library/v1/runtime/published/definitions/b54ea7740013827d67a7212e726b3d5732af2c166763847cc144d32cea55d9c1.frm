; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_6f69b9f4_cea0_5ee1_bea1_468f7a268b9c {
  parameters:
    function1: function = identity classic fn1
  init:
    z = pixel
    f = tan(pixel)
  loop:
    z = fn1(z) + f
  bailout:
    |z| <= 50
}