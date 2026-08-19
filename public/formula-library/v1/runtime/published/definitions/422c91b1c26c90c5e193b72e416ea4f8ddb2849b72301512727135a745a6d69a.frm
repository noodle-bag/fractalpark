; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_b0bf5217_893a_5a0f_9a46_5e5ce89223c3 {
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
    z3 = z2 * z
    denom = z2 + c
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      denom = denom + (0.00001, 0)
    endif
    z = z3 / denom
  bailout:
    |z| <= 256
}