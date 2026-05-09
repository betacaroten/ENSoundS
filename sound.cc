etcpm(120)
	$: n("<0 0 3 -2 [1 1 4] [4 6 5] 1 [0 2]>").scale("f#:minor").s("sine").adsr(".6:.1:1:.6")
	$: n("<0 0 3 -2 [1 1 4] [4 6 5] 1 [0 2]>").scale("f#:minor").s("supersaw").adsr(".1:.2:3:.2").gain(.05)
	$: n("<-12>").scale("f#:minor").s("sine").gain(.6)
