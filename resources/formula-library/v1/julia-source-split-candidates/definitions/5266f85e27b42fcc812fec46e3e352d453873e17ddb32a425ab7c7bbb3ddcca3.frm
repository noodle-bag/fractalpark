; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_5a5062e4_635e_5569_8be7_bed7c3a05365 {
  parameters:
    f1: function = identity classic fn1
    f2: function = identity classic fn2
  init:
    if ismand
      a = pixel
    else
      a = c
    endif
    u = a
    z = u
    b = f1(pixel)
    g = f2(pixel)
    if !ismand
      z = pixel
    endif
  loop:
    du = |u - g| ^ 2
    dz = |z - g| ^ 2
    m = a * (dz <= du)
    n = b * (du < dz)
    u = z
    z = z * z + m + n
  bailout:
    |z| <= 4
}