; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_cc40b50c_d3ff_54f0_b4ea_98bdf0fd0096 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
    if |z| < 0.00001
      z = (0.00001, 0)
    endif
  loop:
    z3 = z ^ 3
    denom = z3
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      denom = denom + (0.00001, 0)
    endif
    z = z * z + c / denom
  bailout:
    |z| <= 256
}