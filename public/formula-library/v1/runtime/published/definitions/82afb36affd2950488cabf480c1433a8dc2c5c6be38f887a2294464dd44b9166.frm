; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_e44558f3_a2cf_5a16_a6cb_6ac4452a6832 {
  parameters:
    firstTimes: complex = (0, 0) classic p1
    secondTimes: complex = (0, 0) classic p2
  init:
    state = pixel
    z = state
    reference = pixel
    bound = 16
    count = 0
  loop:
    if count == real(firstTimes)
      z = 1.5 * reference
      state = z
    else
      if count == imag(firstTimes)
        z = 2.25 * reference
        state = z
      else
        if count == real(secondTimes)
          z = 3.375 * reference
          state = z
        else
          if count == imag(secondTimes)
            z = 5.0625 * reference
            state = z
          endif
        endif
      endif
    endif
    z = z * z + state
    count = count + 1
  bailout:
    |z| <= bound
}
