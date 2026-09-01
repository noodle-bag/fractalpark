; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_9eca49f4_3219_5791_99fb_395ce7646f7c {
  init:
    cclassic = c
    z = pixel
    cclassic = pixel - sqr(z)
    if ismand
      juliaOrbitConstant = pixel
    else
      juliaOrbitConstant = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    cclassic = juliaOrbitConstant + cclassic / z
    z = cclassic - z * juliaOrbitConstant
  bailout:
    |z| < 4
}