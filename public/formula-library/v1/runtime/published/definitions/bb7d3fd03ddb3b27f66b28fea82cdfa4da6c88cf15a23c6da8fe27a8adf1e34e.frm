; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_0df5ac6e_d97e_55db_b624_96c310af07dd {
  init:
    z = pixel
  loop:
    denom = cos(z)
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      z = z
    else
      z = z - sin(z) / denom + 0.18 * c
    endif
  bailout:
    |z - zPrev| >= 0.000001
}