; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_24c09b96_95f6_5bff_bc76_8113f4eb51a0 {
  parameters:
    factor: complex = (0, 0) classic p1
    limitInput: complex = (0, 0) classic p2
    stateTransform: function = identity classic fn1
    orbitTransform: function = identity classic fn2
  init:
    threshold = 4
    if limitInput > 0
      threshold = real(limitInput)
    endif
    state = pixel
    previous = state
    z = previous
    magnitude = |z|
    priorMagnitude = magnitude
  loop:
    if magnitude <= priorMagnitude
      state = stateTransform(state)
    else
      state = stateTransform(z * factor)
    endif
    previous = z
    priorMagnitude = magnitude
    z = orbitTransform(z * z) + state
    magnitude = |z|
  bailout:
    magnitude <= threshold
}
