; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_e44d5dec_2cee_53a9_a21d_541c929792f6 {
  init:
    z = pixel
    if |z| < 0.00001
      z = (0.00001, 0)
    endif
  loop:
    z4 = z ^ 4
    z5 = z4 * z
    fp = 5 * z4
    if real(fp) * real(fp) + imag(fp) * imag(fp) < 1e-10
      z = z
    else
      z = z - (z5 - (1, 0)) / fp
    endif
  bailout:
    |z - zPrev| >= 0.000001
}