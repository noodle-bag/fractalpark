; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: floored-log, hyperbolic-clamp
Formula_57e13d8d_2db6_59c5_baeb_549c22034c7f {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
    limit = offset + 3
  loop:
    z = log(z) * cosxx(z)
  bailout:
    |z| < real(limit)
}
