; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_9577c6c0_3a56_5a17_bea5_0ad2d6ea7e08 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
    if |z| < 0.00001
      z = (0.00001, 0)
    endif
  loop:
    z2 = z * z
    denom = z2
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      denom = denom + (0.00001, 0)
    endif
    z = z2 * z + c / denom
  bailout:
    |z| <= 256
}