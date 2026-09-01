; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_8683972b_c782_5583_80a7_b1df1631e7ac {
  parameters:
    switch_at: complex = (0, 0) classic p1
    threshold_shift: complex = (0, 0) classic p2
  init:
    q = pixel
    z = q
    round_index = 1
    limit = 4 + threshold_shift
  loop:
    square_part = sqr(z) * (round_index <= switch_at)
    cube_part = sqr(z) * z * (switch_at < round_index)
    round_index = round_index + 1
    z = square_part + cube_part + q
  bailout:
    |z| < real(limit)
}
