; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_81701548_4c1a_5038_a7e2_27ee265b0abc {
  parameters:
    f1: function = identity classic fn1
    f2: function = identity classic fn2
  init:
    if ismand
      a = pixel
    else
      a = c
    endif
    z = a
    b = f1(pixel)
    od = 100
    g = f2(pixel)
    gr = real(g)
    gi = imag(g)
    if !ismand
      z = pixel
    endif
  loop:
    x = real(z) - gr
    y = imag(z) - gi
    d = x ^ 2 + y ^ 2
    m = (d <= od) * a
    n = (od < d) * b
    od = d
    z = z * z + m + n
  bailout:
    |z| <= 4
}