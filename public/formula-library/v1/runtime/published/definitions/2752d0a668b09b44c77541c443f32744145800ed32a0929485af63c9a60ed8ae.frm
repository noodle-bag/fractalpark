; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_a63c7852_626f_5659_a556_b0193030f25b {
  init:
    z = pixel
    if |z| < 0.00001
      z = (0.00001, 0)
    endif
  loop:
    z2 = z * z
    z3 = z2 * z
    f = z3 - (1, 0)
    fp = 3 * z2
    correction = f / fp
    twist = correction * (0, 0.12)
    z = z - correction + twist
  bailout:
    |z - zPrev| >= 0.000001
}