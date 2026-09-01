; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_a89c54bd_2f5c_5aac_95d2_450a07212850 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    function1: function = identity classic fn1
  init:
    z = pixel
    b = p1 + 2
  loop:
    z = fn1(z) * pixel
  bailout:
    |z| <= b
}