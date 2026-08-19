; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_599a7fda_4c0e_5489_b12e_6e4179ee11f2 {
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
    correction = f / fp
    z = z - correction + (real(correction) * real(correction) + imag(correction) * imag(correction)) * 0.08
  bailout:
    |z - zPrev| >= 0.000001
}