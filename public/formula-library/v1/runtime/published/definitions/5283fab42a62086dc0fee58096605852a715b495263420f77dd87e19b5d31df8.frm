; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_ed92fb8b_18a9_5e2b_acd7_ee933bf7df93 {
  parameters:
    transform: function = identity classic fn1
  init:
    z = pixel
  loop:
    squared = z * z
    z = squared * transform(squared) + squared + pixel
  bailout:
    |z| <= 50
}
