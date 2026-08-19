; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_9e4246cb_bc41_57ba_9903_5c3dcc366cac {
  parameters:
    shift: complex = (0, 0) classic p1
    seed: function = identity classic fn1
    transform: function = identity classic fn2
  init:
    z = pixel
    storedConstant = fn1(pixel)
  loop:
    z = fn2(z ^ 2) + storedConstant + shift
  bailout:
    |z| < 4
}
