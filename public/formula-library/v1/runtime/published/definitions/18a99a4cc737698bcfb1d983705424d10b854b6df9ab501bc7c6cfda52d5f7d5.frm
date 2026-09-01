; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_c0d25070_a434_5c38_aafc_caf0ee114f67 {
  parameters:
    offset: complex = (0, 0) classic p1
    limitOffset: complex = (0, 0) classic p2
    transform: function = identity classic fn1
  init:
    z = pixel
  loop:
    z = transform(z) + offset
  bailout:
    |z| <= 4 + real(limitOffset)
}
