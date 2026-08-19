; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_c57b91ae_e899_5fef_99b4_dc2ae3e0d9cd {
  parameters:
    start: complex = (0, 0) classic p1
    limit: complex = (0, 0) classic p2
    above: function = sin classic fn1
    below: function = cosxx classic fn2
  init:
    z = start
    x = real(z) * real(z) + imag(z) * imag(z)
  loop:
    if 1 < x
      z = fn1(z) + pixel
    else
      z = fn2(z) + pixel
    endif
    x = real(z) * real(z) + imag(z) * imag(z)
  bailout:
    x <= real(limit)
}
