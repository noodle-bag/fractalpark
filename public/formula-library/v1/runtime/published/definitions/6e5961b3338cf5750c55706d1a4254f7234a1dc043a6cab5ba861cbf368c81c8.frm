; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_54319a01_cd74_5064_aaa0_9e3a57fd201c {
  init:
    z = pixel
    memory = pixel
    orbitConstant = pixel
  loop:
    prior = z
    z = z * memory + orbitConstant
    memory = prior
  bailout:
    |z| < 4
}
