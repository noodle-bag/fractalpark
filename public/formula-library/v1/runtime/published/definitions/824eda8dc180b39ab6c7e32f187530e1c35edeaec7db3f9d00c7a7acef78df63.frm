; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_38c3b212_c33b_5dd3_aae5_a514fc7e37e3 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    safeY = (1, 0)
    if abs(imag(z)) >= 1e-10
      real(safeY) = imag(z) / abs(imag(z))
    endif
    folded = (0, 0)
    real(folded) = abs(real(z))
    imag(folded) = real(z) * imag(z) / real(safeY)
    z = folded * folded + c
  bailout:
    |z| <= 256
}