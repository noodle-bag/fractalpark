; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_411ac01c_ba08_5200_add7_b60b3f98795c {
  parameters:
    function1: function = identity classic fn1
  init:
    z = pixel
    f = pixel ^ pixel
  loop:
    z = fn1(z) + f
  bailout:
    |z| <= 50
}