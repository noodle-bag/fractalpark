; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_0c89c8ab_1cd9_58fc_bc1a_e19dfe5fef7e {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
    limit = offset + 3
  loop:
    z = z * cosxx(z) - z
  bailout:
    |z| < real(limit)
}
