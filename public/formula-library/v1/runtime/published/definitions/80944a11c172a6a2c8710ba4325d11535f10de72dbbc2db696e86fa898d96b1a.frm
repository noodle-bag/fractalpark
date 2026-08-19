; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_a8becf49_83d1_5692_b087_e520652013d2 {
  parameters:
    offset: complex = (0, 0) classic p1
    radius: complex = (0, 0) classic p2
    inward: function = identity classic fn1
    outward: function = identity classic fn2
  init:
    if radius <= 0
      threshold = 4
    else
      threshold = real(radius)
    endif
    z = pixel
    prevz = pixel
    prevmag = real(z) * real(z) + imag(z) * imag(z)
    curmag = prevmag
  loop:
    if curmag <= prevmag
      prevz = z
      prevmag = curmag
      z = fn1(z) + offset
      curmag = real(z) * real(z) + imag(z) * imag(z)
    else
      prevz = z
      prevmag = curmag
      z = fn2(z) + offset
      curmag = real(z) * real(z) + imag(z) * imag(z)
    endif
  bailout:
    curmag <= threshold
}
