; comment with a lone { brace
BraceProof {; header comment with } brace inside
	z=0, c=pixel: ; body comment with { { { unbalanced opens
	z=z^2+c,
	|z| <= 4
	}

{ ================= separator block ================= }

BraceProof2 {
	z=pixel
	c=pixel:
	z=z^2+c
	|z| <= 16
	}
