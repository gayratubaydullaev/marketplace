package service

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

var toxicPhrases = []string{
	"spam", "scam", "xxx", "казино", "casino", "viagra", "crypto giveaway",
	"бесплатные деньги", "заработок без вложений", "telegram.me/", "t.me/",
}

var (
	urlRe    = regexp.MustCompile(`(?i)https?://|www\.|[a-z0-9-]+\.(com|ru|uz|net|org|io)\b`)
	phoneRe  = regexp.MustCompile(`(?:\+?\d[\d\s\-()]{8,}\d)`)
	onlyJunk = regexp.MustCompile(`^[\s\p{P}\d]+$`)
)

func hasLongRepeat(s string) bool {
	var prev rune
	run := 0
	for _, r := range s {
		if r == prev {
			run++
			if run >= 7 {
				return true
			}
		} else {
			prev = r
			run = 1
		}
	}
	return false
}

// LocalStatus applies heuristic keyword/URL/phone filters without network I/O.
func LocalStatus(body string) string {
	trimmed := strings.TrimSpace(body)
	if trimmed == "" {
		return "pending"
	}
	if utf8.RuneCountInString(trimmed) < 3 {
		return "pending"
	}
	if onlyJunk.MatchString(trimmed) {
		return "pending"
	}
	lower := strings.ToLower(trimmed)
	for _, bad := range toxicPhrases {
		if strings.Contains(lower, bad) {
			return "pending"
		}
	}
	if urlRe.MatchString(lower) {
		return "pending"
	}
	if phoneRe.MatchString(trimmed) {
		return "pending"
	}
	if hasLongRepeat(lower) {
		return "pending"
	}
	upper := 0
	letters := 0
	for _, r := range trimmed {
		if r >= 'A' && r <= 'Z' {
			upper++
			letters++
		} else if (r >= 'a' && r <= 'z') || (r >= 'а' && r <= 'я') || (r >= 'А' && r <= 'Я') {
			letters++
		}
	}
	if letters >= 12 && float64(upper)/float64(letters) > 0.7 {
		return "pending"
	}
	return "approved"
}

// Status returns "pending" when body looks toxic/spammy, otherwise "approved".
// If TOXICITY_API_URL is set, local "approved" reviews are re-checked via HTTP POST
// {"text":"..."} expecting {"toxic":true|false} or {"status":"pending"|"approved"}.
// Network failures fall back to the local result.
func Status(body string) string {
	local := LocalStatus(body)
	if local == "pending" {
		return "pending"
	}
	if remoteToxic(body) {
		return "pending"
	}
	return "approved"
}

func remoteToxic(body string) bool {
	api := strings.TrimSpace(os.Getenv("TOXICITY_API_URL"))
	if api == "" {
		return false
	}
	payload, _ := json.Marshal(map[string]string{"text": body})
	client := &http.Client{Timeout: 800 * time.Millisecond}
	req, err := http.NewRequest(http.MethodPost, api, bytes.NewReader(payload))
	if err != nil {
		return false
	}
	req.Header.Set("Content-Type", "application/json")
	if key := os.Getenv("TOXICITY_API_KEY"); key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}
	res, err := client.Do(req)
	if err != nil {
		return false
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		return false
	}
	var out struct {
		Toxic  *bool  `json:"toxic"`
		Status string `json:"status"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return false
	}
	if out.Toxic != nil {
		return *out.Toxic
	}
	return strings.EqualFold(out.Status, "pending") || strings.EqualFold(out.Status, "toxic")
}
