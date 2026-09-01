; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_f2ef0d24_8eff_5bf2_b896_aa111350aa5b {
  parameters:
    scaleInput: complex = (0, 0) classic p1
    thresholdInput: complex = (0, 0) classic p2
    transform: function = identity classic fn1
  init:
    if real(scaleInput) != 0 || imag(scaleInput) != 0
      k = scaleInput
    else
      k = (1, 0)
    endif
    if real(thresholdInput) <= 0
      t = 4
    else
      t = real(thresholdInput)
    endif
    s = pixel
    u = s
    z = u
    m = |z|
    w = m
  loop:
    if m > w
      s = s * k
    endif
    u = z
    w = m
    z = transform(sqr(z)) + s
    m = |z|
  bailout:
    m <= t
}
