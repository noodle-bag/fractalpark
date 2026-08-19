; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_c6a188ae_ec58_5a57_bfe2_caf85a83d2f8 {
  parameters:
    transform: function = identity classic fn1
  init:
    z = pixel
  loop:
    z = ((z / 2.7182818) ^ z) / transform(6.2831853 * z) + pixel
  bailout:
    |z| <= 4
}
