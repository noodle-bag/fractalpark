; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_6d27b5fd_462b_5561_bac2_7c5f915e3cb5 {
  init:
    z = pixel
  loop:
    denom = cosh(z)
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      z = z
    else
      z = z - sinh(z) / denom
    endif
  bailout:
    |z - zPrev| >= 0.000001
}