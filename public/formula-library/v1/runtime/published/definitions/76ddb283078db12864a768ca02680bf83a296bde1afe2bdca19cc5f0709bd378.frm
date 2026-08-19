; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_fa8afc22_abfd_5101_be65_cd4d0b1919cc {
  parameters:
    parameter1: complex = (0, 0) classic p1
    function1: function = identity classic fn1
    function2: function = identity classic fn2
  init:
    v = pixel
    z = v
  loop:
    v = fn1(v) * fn2(z)
    z = fn1(z) / fn2(v)
  bailout:
    |z| <= 5 + p1
}