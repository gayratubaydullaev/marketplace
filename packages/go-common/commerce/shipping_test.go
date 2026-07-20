package commerce

import "testing"

func TestEstimateShipping(t *testing.T) {
	cases := []struct {
		region   string
		subtotal float64
		want     float64
	}{
		{"Toshkent shahri", 0, 0},
		{"pickup", 100_000, 0},
		{"Toshkent shahri", 100_000, 15_000},
		{"Samarqand", 100_000, 25_000},
		{"Samarqand", 500_000, 0},
		{"Toshkent shahri", 600_000, 0},
	}
	for _, tc := range cases {
		got := EstimateShipping(tc.region, tc.subtotal)
		if got != tc.want {
			t.Fatalf("EstimateShipping(%q, %v)=%v want %v", tc.region, tc.subtotal, got, tc.want)
		}
	}
}
