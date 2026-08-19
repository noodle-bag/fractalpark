; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_b79313f5_2181_5013_bd21_e59a7222dce5 {
  init:
    z = pixel
    if |z| < 0.00001
      z = (0.00001, 0)
    endif
  loop:
    z2 = z * z
    z3 = z2 * z
    f = z3 - (1, 0)
    fp = 3 * z2
    fpp = 6 * z
    denom = 2 * (fp * fp) - f * fpp
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      z = z
    else
      numer = 2 * (f * fp)
      z = z - numer / denom
    endif
  bailout:
    |z - zPrev| >= 0.000001
}