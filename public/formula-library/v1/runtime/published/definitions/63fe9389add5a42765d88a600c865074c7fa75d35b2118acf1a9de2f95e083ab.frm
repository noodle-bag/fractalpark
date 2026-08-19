; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_c3ce9a18_7a6d_5043_b8bb_7bde0f95096b {
  init:
    z = pixel
  loop:
    firstFold = 1 - abs(imag(z) - real(z))
    secondFold = 1 - abs(1 - real(z) - imag(z))
    z = firstFold + secondFold
  bailout:
    LastSqr <= 1
}
