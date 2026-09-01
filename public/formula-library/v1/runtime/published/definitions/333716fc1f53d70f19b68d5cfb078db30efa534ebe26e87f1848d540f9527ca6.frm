; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_cddc90de_e9bd_51ce_909b_b9b956bf419b {
  parameters:
    growth: complex = (0, 0) classic p1
  init:
    z = 0
    carriedConstant = pixel
  loop:
    z = z ^ 2 + carriedConstant
    carriedConstant = carriedConstant + growth * carriedConstant
  bailout:
    |z| <= 4
}
