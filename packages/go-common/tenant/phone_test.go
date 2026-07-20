package tenant_test

import (
	"testing"

	"github.com/gayrat/marketplace/packages/go-common/tenant"
)

func TestNormalizeUZPhone(t *testing.T) {
	cases := []struct {
		in   string
		ok   bool
		want string
	}{
		{"+998901234567", true, "+998901234567"},
		{"998901234567", true, "+998901234567"},
		{"+998 90 123 45 67", true, "+998901234567"},
		{"+123", false, ""},
	}
	for _, tc := range cases {
		got, ok := tenant.NormalizeUZPhone(tc.in)
		if ok != tc.ok || got != tc.want {
			t.Fatalf("%s: got (%q,%v) want (%q,%v)", tc.in, got, ok, tc.want, tc.ok)
		}
	}
}
