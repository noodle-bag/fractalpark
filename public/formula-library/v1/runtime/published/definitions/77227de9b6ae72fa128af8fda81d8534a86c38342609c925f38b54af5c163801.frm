; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_cca1c833_de83_5b34_9aa8_cd1750b28354 {
  parameters:
    f1: function = identity classic fn1
  init:
    s = pixel
    u = s
    z = u
  loop:
    t = z
    z = f1(z * u) + s
    u = t
  bailout:
    |z| < 4
}
