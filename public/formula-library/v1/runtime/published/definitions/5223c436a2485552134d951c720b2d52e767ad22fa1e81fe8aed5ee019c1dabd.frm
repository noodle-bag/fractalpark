; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_ae504daa_09cc_5a59_8052_c91b9535ff24 {
  init:
    carrier = pixel
    z = (0, 0)
  loop:
    z = sqr(z) + carrier
  bailout:
    |z| < 4
}
