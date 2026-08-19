; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_e2456b54_ef50_5ac9_9faa_dcb576c5e774 {
  parameters:
    phoenixP: real = -0.5 domain [-2, 2]
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
    previousZ = (0, 0)
  loop:
    nextZ = z * z + c + phoenixP * previousZ
    previousZ = z
    z = nextZ
  bailout:
    |z| <= 256
}