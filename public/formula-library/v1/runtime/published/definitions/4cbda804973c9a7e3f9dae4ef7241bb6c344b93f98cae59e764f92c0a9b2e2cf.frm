; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_0c8029ff_30be_5596_8cc6_e9ae0fa9c635 {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = z * z * z + (offset + 1) / 2
  bailout:
    |z| <= 4
}
