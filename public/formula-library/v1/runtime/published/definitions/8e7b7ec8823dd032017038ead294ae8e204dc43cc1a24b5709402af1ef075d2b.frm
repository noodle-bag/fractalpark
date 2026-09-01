; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_ca206908_8323_5ef9_979b_c80575765e63 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
    previousZ = (0, 0)
  loop:
    nextZ = z * z + previousZ + c
    previousZ = z
    z = nextZ
  bailout:
    |z| <= 256
}