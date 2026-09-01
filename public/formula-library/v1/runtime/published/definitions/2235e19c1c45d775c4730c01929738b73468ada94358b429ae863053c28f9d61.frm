; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_bcfe3aa5_28c4_5b45_b5db_44b29ef8055d {
  parameters:
    blend: complex = (0, 0) classic p1
    limitShift: complex = (0, 0) classic p2
  init:
    raw = pixel
    z = (1 - blend) * sqr(raw) + blend * sqr(raw) * raw
    limit = sqr(limitShift + 4)
  loop:
    shifted = z + pixel
    z = (1 - blend) * sqr(shifted) + blend * sqr(shifted) * shifted
  bailout:
    |z| <= real(limit)
}
