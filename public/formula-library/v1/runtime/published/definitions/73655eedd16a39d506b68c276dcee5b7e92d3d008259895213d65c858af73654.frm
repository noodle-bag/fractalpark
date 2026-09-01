; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: floored-log, hyperbolic-clamp
Formula_d48b109c_4368_53b6_b7bf_c7da60c9c2eb {
  parameters:
    limitOffset: complex = (0, 0) classic p1
  init:
    z = pixel
    limitValue = limitOffset + 3
  loop:
    z = log(z) + cosxx(z)
  bailout:
    |z| < real(limitValue)
}

