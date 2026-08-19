; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_4514ac15_fecc_5b92_9e79_0b95b5158d3f {
  init:
    z = pixel
  loop:
    denom = sin(z) + (1, 0)
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      z = z
    else
      z = z + (cos(z) - z) / denom + 0.15 * c
    endif
  bailout:
    |z - zPrev| >= 0.000001
}