; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_17b83663_a502_5e34_bd4c_a116e49eab5f {
  parameters:
    parameter1: complex = (0, 0) classic p1
  init:
    p = pixel
    test = p1 + 3
    t3 = 3 * p
    t2 = p * p
    a = (t2 + 1) / t3
    b = 2 * a * a * a + (t2 - 2) / t3
    aa3 = a * a * 3
    z = 0 - a
  loop:
    z = z * z * z - aa3 * z + b
  bailout:
    |z| < test
}