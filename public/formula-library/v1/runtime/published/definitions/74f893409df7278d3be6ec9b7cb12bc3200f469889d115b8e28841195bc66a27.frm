; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_ef6d6019_b21e_59df_99ca_dea6b70c0f63 {
  init:
    r = 0
    s = 0
    pr = 0
    ps = 0
    z = 0
  loop:
    rq = r * r
    sq = s * s
    rn = (rq - sq) + real(pixel) + imag(pixel) * pr
    sn = (2 * r) * s + imag(pixel) * ps
    pr = r
    ps = s
    r = rn
    s = sn
    z = r + s
  bailout:
    |z| <= 4
}
