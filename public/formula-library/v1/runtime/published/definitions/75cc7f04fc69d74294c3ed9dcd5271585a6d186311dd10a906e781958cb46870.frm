; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_3edbea29_956a_5900_9aa7_02ccc2183016 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    clampedZ = z
    if imag(z) > 80
      imag(clampedZ) = 80
    elseif imag(z) < -80
      imag(clampedZ) = -80
    endif
    z = round(c * cos(clampedZ) * 16) / 16
  bailout:
    |z| <= 256
}