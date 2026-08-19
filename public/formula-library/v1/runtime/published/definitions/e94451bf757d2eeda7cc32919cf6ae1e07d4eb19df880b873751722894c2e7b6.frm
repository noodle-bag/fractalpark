; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_269daa88_48be_5078_96f9_1b700bacddec {
  parameters:
    scale: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = scale * z * (z * z * (z * z * (z * z - 6) + 10) - 4)
  bailout:
    |z| < 100
}
