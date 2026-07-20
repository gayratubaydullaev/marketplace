package commerce

import "strings"

// EstimateShipping returns delivery cost in UZS.
// Pickup / empty cart → 0; free shipping from 500_000 UZS; Tashkent city cheaper.
func EstimateShipping(region string, subtotal float64) float64 {
	if subtotal <= 0 {
		return 0
	}
	normalized := strings.TrimSpace(strings.ToLower(region))
	if normalized == "" || normalized == "pickup" || normalized == "store" {
		return 0
	}
	if subtotal >= 500_000 {
		return 0
	}
	if region == "Toshkent shahri" || normalized == "toshkent shahri" || normalized == "tashkent" {
		return 15_000
	}
	return 25_000
}
