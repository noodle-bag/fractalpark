; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_17eea2ca_49cc_5b0b_9608_28694fcde4eb {
  parameters:
    mix: complex = (0, 0) classic p1
  init:
    complement = 1 - mix
    squareValue = pixel * pixel
    z = squareValue * pixel * real(mix) + squareValue * real(complement)
    if ismand
      juliaOrbitConstant = pixel
    else
      juliaOrbitConstant = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = z + juliaOrbitConstant
    squareValue = sqr(z)
    z = squareValue * z * real(mix) + squareValue * real(complement)
  bailout:
    LastSqr < 4
}