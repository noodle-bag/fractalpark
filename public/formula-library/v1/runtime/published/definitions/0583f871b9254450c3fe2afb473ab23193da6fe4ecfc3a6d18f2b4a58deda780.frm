; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_c582ae06_6d94_5aef_b8d2_2735b7c34f11 {
  parameters:
    switchAt: complex = (0, 0) classic p1
    limitShift: complex = (0, 0) classic p2
  init:
    carrier = pixel
    z = carrier
    roundIndex = 1
    switchValue = switchAt
    limit = 4 + limitShift
  loop:
    if roundIndex <= real(switchValue)
      z = sqr(z) + carrier
    else
      z = sqr(z) * z + carrier
    endif
    roundIndex = roundIndex + 1
  bailout:
    |z| < real(limit)
}
