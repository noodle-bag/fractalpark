; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_ecabbf7e_6f47_5335_9dea_4584fef5607c {
  parameters:
    f1: function = identity classic fn1
    f2: function = identity classic fn2
  init:
    a = pixel
    u = a
    z = u
    b = f1(pixel)
    g = f2(pixel)
  loop:
    du = (|u - g|) ^ 2
    dz = (|z - g|) ^ 2
    m = (dz <= du) * a
    n = (du < dz) * b
    u = z
    z = z * z + m + n
  bailout:
    |z| <= 4
}
