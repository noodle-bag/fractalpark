; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_37425fb2_8542_502f_94ac_94c0ccb6e508 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
    if |z| < 0.00001
      z = (0.00001, 0)
    endif
  loop:
    numer = z * z
    denom = z + c
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      denom = denom + (0.00001, 0)
    endif
    z = numer / denom
  bailout:
    |z| <= 256
}