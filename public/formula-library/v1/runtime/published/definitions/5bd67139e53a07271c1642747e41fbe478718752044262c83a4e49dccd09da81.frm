; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_15396678_55fc_50e8_a51d_77bb277a5a50 {
  parameters:
    cubicScale: complex = (0, 0) classic p1
    shift: complex = (0, 0) classic p2
  init:
    z = pixel
  loop:
    z = cubicScale * z * z * z + (shift - 1) * z * z - shift
  bailout:
    |z| <= 100
}
