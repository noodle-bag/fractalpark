; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_6409d7e7_7652_5222_865c_5367ff372d7d {
  parameters:
    offset: complex = (0, 0) classic p1
    limitInput: complex = (0, 0) classic p2
    pixelTransform: function = identity classic fn1
    orbitTransform: function = identity classic fn2
  init:
    constant = pixelTransform(pixel)
    limit = 4
    if real(limitInput) > 0
      limit = real(limitInput)
    endif
    z = pixel
  loop:
    z = orbitTransform(z * z) + constant + offset
  bailout:
    |z| < limit
}
