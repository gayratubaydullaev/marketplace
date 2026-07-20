package tenant

import (
	"regexp"
	"strings"
)

var uzPhone = regexp.MustCompile(`^\+998[0-9]{9}$`)

func NormalizeUZPhone(phone string) (string, bool) {
	p := strings.ReplaceAll(phone, " ", "")
	p = strings.ReplaceAll(p, "-", "")
	if strings.HasPrefix(p, "998") && len(p) == 12 {
		p = "+" + p
	}
	if strings.HasPrefix(p, "8") && len(p) == 10 {
		p = "+998" + p[1:]
	}
	if !uzPhone.MatchString(p) {
		return "", false
	}
	return p, true
}

// Uzbekistan regions (viloyat)
var Regions = []string{
	"Toshkent shahri",
	"Toshkent viloyati",
	"Andijon",
	"Buxoro",
	"Farg'ona",
	"Jizzax",
	"Xorazm",
	"Namangan",
	"Navoiy",
	"Qashqadaryo",
	"Samarqand",
	"Sirdaryo",
	"Surxondaryo",
	"Qoraqalpog'iston",
}
