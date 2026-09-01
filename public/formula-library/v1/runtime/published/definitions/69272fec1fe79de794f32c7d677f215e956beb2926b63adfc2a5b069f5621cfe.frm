; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_35a7e33c_fcba_5a81_ba80_8eab6d59925c {
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
    denom = z ^ 3 + c
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      denom = denom + (0.00001, 0)
    endif
    z = (1, 0) / denom
  bailout:
    |z| <= 256
}