; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_ee3be07b_bfde_53bf_bea2_db01f18ab0f2 {
  parameters:
    offset: complex = (0, 0) classic p1
    exponent: complex = (0, 0) classic p2
  init:
    z = pixel
  loop:
    z = conj(z) ^ exponent + offset
  bailout:
    |z| <= 4
}
