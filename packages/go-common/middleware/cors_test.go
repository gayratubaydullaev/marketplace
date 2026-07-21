package middleware

import (
	"reflect"
	"testing"
)

func TestCORSAllowlist(t *testing.T) {
	t.Setenv("CORS_ORIGINS", " https://store.example,*,https://admin.example, ")

	got := CORSAllowlist()
	want := []string{"https://store.example", "https://admin.example"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("CORSAllowlist() = %v, want %v", got, want)
	}
}

func TestCORSAllowlistDefaults(t *testing.T) {
	t.Setenv("CORS_ORIGINS", "")

	if got := CORSAllowlist(); len(got) != 3 {
		t.Fatalf("default allowlist length = %d, want 3", len(got))
	}
}
