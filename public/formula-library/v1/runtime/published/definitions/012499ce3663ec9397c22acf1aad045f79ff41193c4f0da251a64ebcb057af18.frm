; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_26d168e6_cb44_5e94_a3f2_e5fd65528034 {
  parameters:
    start: complex = (0, 0) classic p1
    limit: complex = (0, 0) classic p2
    numerator: function = sin classic fn1
    denominator: function = cosxx classic fn2
    final: function = sqr classic fn3
  init:
    z = start
    x = real(z) * real(z) + imag(z) * imag(z)
  loop:
    if 1 < x
      z = fn1(z) / fn2(z) + pixel
    endif
    z = fn3(z) + pixel
    x = real(z) * real(z) + imag(z) * imag(z)
  bailout:
    x <= real(limit)
}
