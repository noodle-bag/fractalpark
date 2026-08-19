; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_fd6040b2_2f96_5fa8_81db_6b7c996c764f {
  parameters:
    parameter1: complex = (0, 0) classic p1
    function1: function = identity classic fn1
    function2: function = identity classic fn2
  init:
    z = pixel
    t = p1 + 4
  loop:
    sq = fn1(z)
    z = sq * fn2(sq) + sq + pixel
  bailout:
    |z| <= t
}