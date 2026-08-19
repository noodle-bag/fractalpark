; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_743f6bbf_4cc1_5df7_8f3e_2e654ddc81ba {
  parameters:
    scale: complex = (0, 0) classic p1
    offset: complex = (0, 0) classic p2
    xtransform: function = identity classic fn1
    ytransform: function = identity classic fn2
  init:
    z = pixel
    if scale == 0
      p = (1, 0)
    else
      p = scale
    endif
  loop:
    xr = 1 - abs(imag(z) * p - real(z))
    yv = 1 - abs(1 - real(z) - imag(z))
    z = fn1(xr) + flip(fn2(yv)) - offset
  bailout:
    |z| <= 1
}
