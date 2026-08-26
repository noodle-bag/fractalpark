; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_cca1c833_de83_5b34_9aa8_cd1750b28354 {
  parameters:
    f1: function = identity classic fn1
  init:
    if ismand
      s = pixel
    else
      s = c
    endif
    u = s
    z = u
    if !ismand
      z = pixel
    endif
  loop:
    t = z
    z = f1(z * u) + s
    u = t
  bailout:
    |z| < 4
}