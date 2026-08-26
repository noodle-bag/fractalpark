; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_7c45552a_cb92_5510_a7bb_25dbd60a8ff3 {
  parameters:
    function1: function = identity classic fn1
  init:
    cclassic = c
    z = pixel
    cclassic = z + z ^ (z - 1)
    if ismand
      juliaOrbitConstant = pixel
    else
      juliaOrbitConstant = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    tmp = fn1(z)
    real(tmp) = real(tmp) * real(cclassic) - imag(tmp) * imag(cclassic)
    imag(tmp) = real(tmp) * imag(cclassic) - imag(tmp) * real(cclassic)
    z = tmp + juliaOrbitConstant + 12
  bailout:
    |z| <= 4
}