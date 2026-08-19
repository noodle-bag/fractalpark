; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_24477311_d938_5e87_9900_bc3dfd384274 {
  parameters:
    base: complex = (0, 0) classic p1
    exponentValue: complex = (0, 0) classic p2
  init:
    z = pixel
  loop:
    z = z * z * z + z * (base - 1) - base ^ exponentValue
  bailout:
    |z| <= 4
}
