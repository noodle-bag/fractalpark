; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_78e550c6_d58d_57b7_92ff_82e9ed0728f0 {
  init:
    z = pixel
    if |z| < 0.00001
      z = (0.00001, 0)
    endif
  loop:
    r = |z|
    theta = atan2(imag(z), real(z))
    rn = r ^ 5
    ntheta = 5 * theta
    z5 = z
    real(z5) = rn * cos(ntheta)
    imag(z5) = rn * sin(ntheta)
    z6 = z5 * z
    fp = 6 * z5
    if real(fp) * real(fp) + imag(fp) * imag(fp) < 1e-10
      z = round(z * 16) / 16
    else
      z = round((z - (z6 - (1, 0)) / fp) * 16) / 16
    endif
  bailout:
    |z - zPrev| >= 0.000001
}