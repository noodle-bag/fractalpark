; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_2daea798_a058_5b4c_ada8_1712c475fadf {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
    if |z| < 1e-10
      z = (0.5, 0)
    endif
  loop:
    oneMinusZ = (1, 0) - z
    z = c * (z * oneMinusZ)
  bailout:
    |z| <= 256
}