; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_ecee6e9d_a5c9_5b29_be39_edbe00e73c50 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    one = (1, 0)
    atanhZ = 0.5 * (log(one + z) - log(one - z))
    z = atanhZ + c
  bailout:
    |z| <= 256
}