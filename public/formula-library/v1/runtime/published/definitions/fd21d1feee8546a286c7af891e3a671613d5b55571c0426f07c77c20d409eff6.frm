; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
OrbitMemory_04338d55_9f3d_574a_8fb6_58ec7d530cc5 {
  init:
    z = 0
    q = pixel
  loop:
    q = flip(q)
    z = flip(z ^ 2 + q)
  bailout:
    |z| <= 4
}
