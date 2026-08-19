; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_c122edfc_bdf6_5f5d_a988_6564c73d6a14 {
  parameters:
    limitShift: complex = (0, 0) classic p1
  init:
    older = 0
    newer = (0, 0)
    threshold = limitShift + 3
    state = pixel
  loop:
    z = newer ^ 2 + older + state
    older = real(newer)
    newer = z
  bailout:
    |z| < threshold
}
