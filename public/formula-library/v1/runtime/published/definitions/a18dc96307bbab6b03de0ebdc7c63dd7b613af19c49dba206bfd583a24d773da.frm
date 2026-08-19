; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_c45604cb_3319_59e7_b1a4_aca549ee25c2 {
  parameters:
    firstTransform: function = identity classic fn1
    secondTransform: function = identity classic fn2
  init:
    anchor = pixel
    previous = anchor
    z = previous
    alternate = firstTransform(pixel)
    target = secondTransform(pixel)
  loop:
    previousDistance = |previous - target| ^ 2
    orbitDistance = |z - target| ^ 2
    secondaryTerm = (0, 0)
    primaryTerm = secondaryTerm
    primaryTerm = (orbitDistance <= previousDistance) * anchor
    secondaryTerm = (previousDistance < orbitDistance) * alternate
    previous = z
    z = z * z + primaryTerm + secondaryTerm
  bailout:
    |z| <= 4
}
