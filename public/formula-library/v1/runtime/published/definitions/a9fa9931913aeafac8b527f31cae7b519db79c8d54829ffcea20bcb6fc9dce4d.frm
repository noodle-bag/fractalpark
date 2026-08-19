; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_0f49d971_917e_50a5_ae83_20e11fd4854c {
  parameters:
    phoenixMultiP: real = 0.5 domain [-2, 2]
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
    previousZ = (0, 0)
  loop:
    z2 = z * z
    nextZ = z2 + c + phoenixMultiP * previousZ
    previousZ = z
    z = nextZ
  bailout:
    |z| <= 256
}