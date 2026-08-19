; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: floored-log, hyperbolic-clamp
Formula_3a1b7843_3ead_534e_9fac_d05890211020 {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
    limit = offset + 3
  loop:
    z = log(z) + sin(z)
  bailout:
    |z| < real(limit)
}
