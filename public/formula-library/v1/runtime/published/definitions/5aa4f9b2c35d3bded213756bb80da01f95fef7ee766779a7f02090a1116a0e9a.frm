; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_c6b5dcf4_cef5_5630_b3f6_a68b92ae75ee {
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
    oneMinusZ = (1, 0) - z
    lambdaTerm = c * (z * oneMinusZ)
    denom = z * z + c
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      denom = denom + (0.00001, 0)
    endif
    reciprocalTerm = (0.18, 0) / denom
    z = lambdaTerm + reciprocalTerm
  bailout:
    |z| <= 256
}