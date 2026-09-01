; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_88dd57cd_a348_55e8_983a_74c0acba57ae {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    one = (1, 0)
    atanhZ = 0.5 * (log(one + z) - log(one - z))
    z = c * atanhZ
  bailout:
    |z| <= 256
}