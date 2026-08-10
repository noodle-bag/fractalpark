ScanMandel {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}

ScanJulia {
init:
  z = pixel
loop:
  z = z^2 + c
bailout:
  |z| < 4
}
