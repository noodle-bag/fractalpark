; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_d747aff8_e49f_5875_a85f_89d4a1d25846 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    p = (0, 0)
    real(p) = abs(real(z))
    imag(p) = imag(z)
    z = p ^ 4 + c
  bailout:
    |z| <= 256
}