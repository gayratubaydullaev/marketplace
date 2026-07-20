package service
import "strings"
func Status(body string) string { lower := strings.ToLower(body); for _, bad := range []string{"spam", "scam", "http://"} { if strings.Contains(lower, bad) { return "pending" } }; return "approved" }
