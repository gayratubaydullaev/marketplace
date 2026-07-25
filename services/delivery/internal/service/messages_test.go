package service

import "testing"

func TestMessageThreadsSeparated(t *testing.T) {
	cases := []struct {
		name    string
		sender  string
		to      string
		viewer  string
		thread  string
		want    bool
	}{
		{"customer sees courier→customer", "courier", "customer", "customer", "", true},
		{"customer hides courier→vendor", "courier", "vendor", "customer", "", false},
		{"customer hides vendor→courier", "vendor", "courier", "customer", "", false},
		{"customer sees own→courier", "customer", "courier", "customer", "", true},
		{"customer sees legacy courier→all", "courier", "all", "customer", "", true},
		{"vendor hides legacy courier→all", "courier", "all", "vendor", "", false},
		{"vendor sees courier→vendor", "courier", "vendor", "vendor", "", true},
		{"vendor hides courier→customer", "courier", "customer", "vendor", "", false},
		{"courier customer thread hides vendor msg", "vendor", "courier", "courier", "customer", false},
		{"courier vendor thread shows vendor msg", "vendor", "courier", "courier", "vendor", true},
		{"courier customer thread shows customer msg", "customer", "courier", "courier", "customer", true},
		{"admin sees all", "vendor", "courier", "tenant_admin", "", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := messageVisibleTo(tc.sender, tc.to, tc.viewer, tc.thread)
			if got != tc.want {
				t.Fatalf("messageVisibleTo(%q,%q,%q,%q)=%v want %v", tc.sender, tc.to, tc.viewer, tc.thread, got, tc.want)
			}
		})
	}
}

func TestResolveToRole(t *testing.T) {
	if got := resolveToRole("customer", "all"); got != "courier" {
		t.Fatalf("customer all → %s", got)
	}
	if got := resolveToRole("vendor", ""); got != "courier" {
		t.Fatalf("vendor empty → %s", got)
	}
	if got := resolveToRole("courier", "all"); got != "customer" {
		t.Fatalf("courier all → %s", got)
	}
	if got := resolveToRole("courier", "vendor"); got != "vendor" {
		t.Fatalf("courier vendor → %s", got)
	}
}
