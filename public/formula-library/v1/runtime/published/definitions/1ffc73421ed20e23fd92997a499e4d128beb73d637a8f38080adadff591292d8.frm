; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_526aa565_87eb_5edd_b059_8f4e44876f0f {
  init:
    z = pixel
  loop:
    leadingFold = 1 - abs(imag(z) - real(z))
    trailingFold = 1 - abs(1 - leadingFold - imag(z))
    z = leadingFold + trailingFold
  bailout:
    LastSqr <= 1
}
