; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_0a9a153b_bb4e_53df_9cdf_54fd0ad0081e {
  parameters:
    multiplier: complex = (0, 0) classic p1
    thresholdOffset: complex = (0, 0) classic p2
    firstMap: function = identity classic fn1
    secondMap: function = identity classic fn2
  init:
    z = pixel
    scale = 1 + multiplier
    threshold = 10 + thresholdOffset
  loop:
    mapped = firstMap(z)
    product = z * mapped
    quotient = z / mapped
    if |product| <= |quotient|
      z = secondMap((z + quotient) * scale * mapped) + mapped
    else
      z = secondMap((z + product) * scale * mapped) + mapped
    endif
  bailout:
    |z| <= real(threshold)
}
