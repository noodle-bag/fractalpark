; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_d0079630_8ed3_5379_9e37_52cb7f0f7379 {
  init:
    z = pixel
  loop:
    denom = sin(z) + (1, 0)
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      z = z
    else
      z = z + (cos(z) - z) / denom
    endif
  bailout:
    |z - zPrev| >= 0.000001
}