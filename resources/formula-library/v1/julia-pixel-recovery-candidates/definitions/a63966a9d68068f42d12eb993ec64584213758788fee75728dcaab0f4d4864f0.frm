; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_f2305da6_5fc0_59e4_8204_9b0adb61bc74 {
  parameters:
    threshold: complex = (0, 0) classic p1
  init:
    if ismand
      carrier = pixel
    else
      carrier = c
    endif
    z = carrier
    if !ismand
      z = pixel
    endif
  loop:
    z = z ^ carrier + sin(carrier)
  bailout:
    |z| < real(threshold)
}