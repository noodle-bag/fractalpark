; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: floored-log, hyperbolic-clamp
Formula_07c3a5ae_0504_57d9_b033_95debcce6d5c {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
    limit = offset + 3
  loop:
    z = log(z) - sin(z)
  bailout:
    |z| < real(limit)
}
