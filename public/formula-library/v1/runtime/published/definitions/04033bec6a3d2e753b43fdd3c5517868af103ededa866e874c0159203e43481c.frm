; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: floored-log
Formula_4f44ec51_258e_5ac2_a579_9273cfe99080 {
  parameters:
    threshold: complex = (0, 0) classic p1
  init:
    seed = pixel
    z = pixel
  loop:
    z = exp(seed * log(z))
  bailout:
    |z| <= real(threshold)
}
