package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/gayrat/marketplace/packages/go-common/httpx"
)
// Synonyms preserves the static synonym endpoint used by search clients.
func Synonyms(c *gin.Context) {
	httpx.OK(c, gin.H{"synonyms": map[string][]string{"telefon": {"smartphone", "mobil", "телефон"}, "kiyim": {"одежда", "clothing"}}})
}
