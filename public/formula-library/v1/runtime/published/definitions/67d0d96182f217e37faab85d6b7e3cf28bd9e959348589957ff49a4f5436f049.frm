; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_42b369a5_2873_50e9_8684_cad5e60630ff {
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
    z = folded ^ 3 + c
  bailout:
    |z| <= 256
}