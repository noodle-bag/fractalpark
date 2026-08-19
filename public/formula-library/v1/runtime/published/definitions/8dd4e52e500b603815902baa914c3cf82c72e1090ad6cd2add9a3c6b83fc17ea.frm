; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_1c33f476_635f_5845_8f0a_56ab2315e051 {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = z * (z * z * (z * z * (429 * z * z - 693) + 315) - 35) / 16 + offset
  bailout:
    |z| < 100
}
