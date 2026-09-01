; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_280cd3e2_865b_5c78_90b7_39b2a36d7be0 {
  parameters:
    mandelboxScale: real = 2 domain [-3, 3]
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    if real(z) < -1
      boxX = -1
    elseif real(z) > 1
      boxX = 1
    else
      boxX = real(z)
    endif
    if imag(z) < -1
      boxY = -1
    elseif imag(z) > 1
      boxY = 1
    else
      boxY = imag(z)
    endif
    box = (0, 0)
    real(box) = boxX
    imag(box) = boxY
    z = box * 2 - z
    r2 = real(z) * real(z) + imag(z) * imag(z)
    if r2 < 0.25
      z = z * 4
    elseif r2 < 1
      z = z / r2
    endif
    z = round((mandelboxScale * z + c) * 16) / 16
  bailout:
    |z| <= 256
}