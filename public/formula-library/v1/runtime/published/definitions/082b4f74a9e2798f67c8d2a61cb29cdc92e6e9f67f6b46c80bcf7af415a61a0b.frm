; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_beeb4aec_91cd_5d01_83bb_0b98ca851e79 {
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
    z = round((sin(clampedZ) + c) * 16) / 16
  bailout:
    |z| <= 256
}